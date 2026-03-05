"""
执行器：负责调度和运行数据源抓取任务。
捕捉异常并更新 SourceState。
"""

import logging
import time
import asyncio
import httpx
import shlex
from typing import Any, Dict

from core.source_state import (
    SourceState,
    SourceStatus,
    InteractionRequest,
    InteractionType,
    InteractionField
)
from core.config_loader import SourceConfig, StepConfig, StepType, AuthType
from jsonpath_ng import parse

logger = logging.getLogger(__name__)

class Executor:
    """
    负责执行 SourceConfig 定义的抓取流程。
    维护内存中的 SourceState。
    """

    def __init__(self, data_controller, secrets_controller, settings_manager=None):
        self._data_controller = data_controller
        self._secrets = secrets_controller
        self._settings_manager = settings_manager
        # source_id -> SourceState
        self._states: Dict[str, SourceState] = {}

    def _get_proxy_url(self) -> str | None:
        """从系统设置中读取代理地址，无代理则返回 None。"""
        if self._settings_manager is None:
            return None
        try:
            proxy = self._settings_manager.load_settings().proxy
            return proxy if proxy else None
        except Exception:
            return None

    def get_source_state(self, source_id: str) -> SourceState:
        """获取指定数据源的运行时状态。"""
        if source_id not in self._states:
            # 初始化默认状态
            self._states[source_id] = SourceState(source_id=source_id)
        return self._states[source_id]

    def update_source_state(self, source_id: str, state: SourceState):
        """更新指定数据源的运行时状态。"""
        if source_id not in self._states:
            self._states[source_id] = SourceState(source_id=source_id)
        self._states[source_id].status = state.status
        self._states[source_id].message = state.message
        self._states[source_id].interaction = state.interaction
        self._states[source_id].last_updated = time.time()

        # Persist to DB
        try:
            interaction_dict = state.interaction.model_dump() if state.interaction else None
            self._data_controller.set_state(
                source_id=source_id,
                status=state.status.value,
                message=state.message,
                interaction=interaction_dict,
            )
        except Exception as e:
            logger.error(f"[{source_id}] Failed to persist state: {e}")

    def _update_state(self, source_id: str, status: SourceStatus, message: str | None = None, interaction: InteractionRequest | None = None):
        """更新状态并记录日志，同时持久化到 data.json。"""
        state = self.get_source_state(source_id)
        state.status = status
        state.message = message
        state.interaction = interaction
        state.last_updated = time.time()
        logger.info(f"[{source_id}] State -> {status.value}: {message}")

        # 持久化状态到数据库，供前端渲染授权按钮等
        try:
            interaction_dict = interaction.model_dump() if interaction else None
            self._data_controller.set_state(
                source_id=source_id,
                status=status.value,
                message=message,
                interaction=interaction_dict,
            )
        except Exception as e:
            logger.error(f"[{source_id}] Failed to persist state: {e}")

    async def fetch_source(self, source: SourceConfig):
        """
        执行数据源抓取。
        如果发生异常，根据异常类型设置 InteractionRequest。
        """
        try:
            self._update_state(source.id, SourceStatus.ACTIVE, "Starting fetch...")
            
            # If flow is defined, execute flow steps
            if source.flow:
                data = await self._run_flow(source)
                self._data_controller.upsert(source.id, data)
                self._update_state(source.id, SourceStatus.ACTIVE, "Flow execution completed")
                return

            # Fallback to legacy/simple flow
            await self._check_auth_requirements(source)
            
            # 模拟：执行抓取 (TODO: 真正的 HTTP/Browser 逻辑)
            # data = await self._run_steps(source)
            # self._data_controller.upsert(source.id, data)
            
            # 暂时只做 Auth Check 演示
            self._update_state(source.id, SourceStatus.ACTIVE, "Fetch completed (Mock)")

        except Exception as e:
            logger.error(f"[{source.id}] Fetch failed: {e}", exc_info=True)
            # 将异常转换为交互请求
            interaction = self._exception_to_interaction(source, e)
            self._update_state(
                source.id, 
                SourceStatus.SUSPENDED if interaction else SourceStatus.ERROR,
                str(e),
                interaction
            )

    async def _run_flow(self, source: SourceConfig) -> Dict[str, Any]:
        """Execute a predefined flow of steps with explicit variable scoping.

        Variable Resolution Priority:
        1. outputs - from previous step (single step variables, only for next step)
        2. context - global flow environment (persists across entire flow)
        3. secrets - from SecretsController
        """
        context = {}
        # Initial context with source vars
        context.update(source.vars)

        final_data = {}

        for step in source.flow:
            logger.info(f"[{source.id}] Running step {step.id} ({step.use})")

            # Outputs from previous step - only valid for this step
            outputs = {}

            try:
                # Resolve args with priority: outputs > context > secrets
                args = self._resolve_args(step.args, outputs, context, source.id)

                output = None

                if step.use == StepType.API_KEY:
                     # Get API Key from secrets
                     secret_key = step.secrets.get("api_key", "api_key") if step.secrets else "api_key"

                     api_key = self._secrets.get_secret(source.id, secret_key)

                     if not api_key:
                         # Build interaction to ask for key
                         raise RequiredSecretMissing(
                            source_id=source.id,
                            interaction_type=InteractionType.INPUT_TEXT,
                            fields=[
                                InteractionField(
                                    key=secret_key,
                                    label=args.get("label", "API Key"),
                                    type="password",
                                    description=args.get("description", "Please enter the API Key")
                                )
                            ],
                            message=args.get("message", f"Missing API Key for {source.name}")
                         )

                     # Output into outputs (single step variable)
                     output = {"api_key": api_key}

                elif step.use == StepType.CURL:
                     secret_key = step.secrets.get("curl_command", "curl_command") if step.secrets else "curl_command"
                     curl_command = self._secrets.get_secret(source.id, secret_key)
                     
                     if not curl_command:
                         raise RequiredSecretMissing(
                             source_id=source.id,
                             interaction_type=InteractionType.INPUT_TEXT,
                             fields=[
                                 InteractionField(
                                     key=secret_key,
                                     label=args.get("label", "cURL Request"),
                                     type="text",
                                     description=args.get("description", "Paste your cURL command here")
                                 )
                             ],
                             message=args.get("message", f"Provide cURL request for {source.name}"),
                             warning_message=args.get("warning_message")
                         )
                         
                     extracted_headers = {}
                     try:
                         # Split the cURL command safely handling quotes
                         tokens = shlex.split(curl_command)
                         for i, token in enumerate(tokens):
                             if token in ("-H", "--header") and i + 1 < len(tokens):
                                 header_str = tokens[i + 1]
                                 if ":" in header_str:
                                     k, v = header_str.split(":", 1)
                                     extracted_headers[k.strip()] = v.strip()
                     except Exception as e:
                         logger.error(f"Failed to parse cURL command for step {step.id}: {e}")
                         
                     output = {"curl_command": curl_command, "headers": extracted_headers}
                     if step.outputs:
                         for key, var_name in step.outputs.items():
                             if key != "headers" and key != "curl_command":
                                 # search case-insensitively just in case
                                 val = next((v for k, v in extracted_headers.items() if k.lower() == key.lower()), None)
                                 if val is not None:
                                     output[key] = val

                elif step.use == StepType.OAUTH:
                     # OAuth token always stored under source.id
                     token_data = self._secrets.get_secrets(source.id)
                     # access_token may be a dict with token in "access_token" field, or direct token string
                     token = token_data.get("access_token")
                     if isinstance(token, dict):
                         token = token.get("access_token") or token.get("key")

                     # 获取 OAuth 配置参数
                     oauth_args = args or {}

                     # 检查是否需要 client_id/client_secret
                     # 如果配置中没有，且 secrets 中也没有，则需要用户输入
                     client_id = oauth_args.get("client_id")
                     client_secret = oauth_args.get("client_secret")

                     if not client_id:
                         client_id = token_data.get("client_id")
                     if not client_secret:
                         client_secret = token_data.get("client_secret")

                     # 构建交互请求字段
                     interaction_fields = []
                     if not client_id:
                         interaction_fields.append(InteractionField(
                             key="client_id",
                             label="Client ID",
                             type="text",
                             description="OAuth Client ID"
                         ))
                     if not client_secret:
                         interaction_fields.append(InteractionField(
                             key="client_secret",
                             label="Client Secret",
                             type="password",
                             description="OAuth Client Secret"
                         ))

                     if not token:
                         # 构建交互数据
                         interaction_data = {
                             "oauth_args": oauth_args,
                             "doc_url": oauth_args.get("doc_url")
                         }

                         # Trigger OAuth flow interaction
                         raise RequiredSecretMissing(
                             source_id=source.id,
                             interaction_type=InteractionType.OAUTH_START,
                             fields=interaction_fields,
                             message=f"Authorization required for step {step.id}. " + ("Please provide client credentials." if interaction_fields else "Click to authorize."),
                             data=interaction_data
                         )
                     # Output into outputs (single step variable)
                     output = {"access_token": token}

                elif step.use == StepType.HTTP:
                     # HTTP request - NO auto-injection of Authorization header
                     # Headers must be explicitly defined in the step config
                     url = args.get("url")
                     method = args.get("method", "GET")
                     headers = args.get("headers", {}).copy()

                     proxy_url = self._get_proxy_url()
                     client_kwargs = {}
                     if proxy_url:
                         client_kwargs["proxy"] = proxy_url

                     async with httpx.AsyncClient(**client_kwargs) as client:
                         response = await client.request(method, url, headers=headers)
                         response.raise_for_status()

                         output = {
                            "http_response": response.json(),
                            "raw_data": response.text,
                            "headers": dict(response.headers)
                         }

                elif step.use == StepType.EXTRACT:
                     source_data = args.get("source")
                     expr = args.get("expr")
                     extract_type = args.get("type", "jsonpath")

                     if extract_type == "jsonpath":
                         jsonpath_expr = parse(expr)
                         matches = jsonpath_expr.find(source_data)
                         if matches:
                             # Return the value of the first match
                             # If we need multiple matches, output logic needs adjustment
                             # For now assume single value extraction for simplicity
                             output = {list(step.outputs.values())[0]: matches[0].value}
                         else:
                             output = {}
                     elif extract_type == "key":
                         # Simple key lookup for dicts
                         if isinstance(source_data, dict):
                             # Case-insensitive header lookup if it seems to be headers
                             if "ratelimit" in str(expr).lower():
                                 val = next((v for k, v in source_data.items() if k.lower() == expr.lower()), None)
                                 output = {list(step.outputs.values())[0]: val}
                             else:
                                 output = {list(step.outputs.values())[0]: source_data.get(expr)}
                         else:
                             output = {}

                elif step.use == StepType.SCRIPT:
                    # Execute provided Python code
                    script_code = args.get("code")
                    if not script_code:
                        raise ValueError(f"Step {step.id} has use=script but no 'code' argument provided.")
                    
                    # Provide context as locals
                    local_env = {**context, **outputs}
                    
                    # Redirect stdout to capture if needed, though usually we expect output via variables
                    # We'll expect the script to either modify local_env or set variables we extract
                    try:
                        # Use compile and exec to run the script
                        compiled = compile(script_code, f"<step_{step.id}>", "exec")
                        exec(compiled, {}, local_env)
                        
                        # Any defined outputs in step config will be extracted from local_env
                        output = {}
                        if step.outputs:
                            for key, var_name in step.outputs.items():
                                if key in local_env:
                                    output[key] = local_env[key]
                        if getattr(step, 'context', None):
                            for key, var_name in step.context.items():
                                if key in local_env:
                                    output[key] = local_env[key]
                    except Exception as script_e:
                        logger.error(f"Error executing script in step {step.id}:\n{script_code}")
                        raise script_e

                elif step.use == StepType.WEBVIEW:
                    secret_key = step.secrets.get("webview_data", "webview_data") if step.secrets else "webview_data"
                    webview_data = self._secrets.get_secret(source.id, secret_key)
                    
                    if not webview_data:
                        url = args.get("url")
                        script = args.get("script")
                        intercept_api = args.get("intercept_api")
                        
                        if not url:
                            raise ValueError(f"Step {step.id} has use=webview but no 'url' argument provided.")
                        
                        raise RequiredSecretMissing(
                            source_id=source.id,
                            interaction_type=InteractionType.WEBVIEW_SCRAPE,
                            fields=[],
                            message=f"System background scraping required for {source.id}",
                            data={
                                "url": url,
                                "script": script,
                                "intercept_api": intercept_api,
                                "secret_key": secret_key
                            }
                        )
                    
                    output = {"webview_data": webview_data}
                    if isinstance(webview_data, dict):
                        for k, v in webview_data.items():
                            output[k] = v

                    # Clear webview data from secrets immediately so that
                    # the next fetch (e.g. manual refresh) will prompt a new webview scrape
                    self._secrets.delete_secret(source.id, secret_key)

                # Process outputs
                if output and step.outputs:
                    for key, var_name in step.outputs.items():
                        if key in output:
                            # Store in outputs (single step variable)
                            outputs[var_name] = output[key]
                            # Store in final_data to be saved to data.json
                            final_data[var_name] = output[key]

                # Process context
                if output and getattr(step, 'context', None):
                    for key, var_name in step.context.items():
                        if key in output:
                            outputs[var_name] = output[key]

                # Explicitly store secrets if specified in step config
                if step.secrets and output:
                    for key, secret_name in step.secrets.items():
                        if key in output:
                            self._secrets.set_secret(source.id, secret_name, output[key])
                            logger.info(f"[{source.id}] Stored secret '{secret_name}' from step {step.id}")

                # Update context with outputs (promote to global context)
                if outputs:
                    context.update(outputs)

            except Exception as step_error:
                logger.error(f"Step {step.id} failed: {step_error}")
                raise step_error

        # Return final data mapping
        return final_data

    def _resolve_args(self, args: Dict[str, Any], outputs: Dict[str, Any], context: Dict[str, Any], source_id: str) -> Dict[str, Any]:
        """Recursive string substitution with priority: outputs > context > secrets.

        Priority 1: outputs (from previous step)
        Priority 2: context (global flow environment)
        Priority 3: secrets (from SecretsController)
        """
        if isinstance(args, str):
            try:
                # Optimized: if args is exactly "{key}", return the object directly
                # This preserves types (dict, list, etc) instead of stringifying
                if args.startswith("{") and args.endswith("}") and args.count("{") == 1:
                     key = args[1:-1]
                     # Priority 1: outputs
                     if key in outputs:
                         return outputs[key]
                     # Priority 2: context
                     if key in context:
                         return context[key]
                     # Priority 3: secrets
                     secret_val = self._secrets.get_secret(source_id, key)
                     if secret_val is not None:
                         return secret_val
                     return args

                # Fallback to format with combined scope
                # Build combined dict with priority: outputs > context > secrets
                combined = {}
                # Add secrets to combined (lowest priority)
                secrets_data = self._secrets.get_secrets(source_id)
                if secrets_data:
                    combined.update(secrets_data)
                # Add context (medium priority - will override secrets)
                combined.update(context)
                # Add outputs (highest priority - will override context)
                combined.update(outputs)

                return args.format(**combined)
            except:
                return args
        elif isinstance(args, dict):
            return {k: self._resolve_args(v, outputs, context, source_id) for k, v in args.items()}
        elif isinstance(args, list):
            return [self._resolve_args(v, outputs, context, source_id) for v in args]
        return args

    async def _check_auth_requirements(self, source: SourceConfig):
        """检查鉴权所需凭证是否存在。"""
        if not source.auth:
            return

        # API Key Check
        if source.auth.type == AuthType.API_KEY:
            key = self._secrets.get_secret(source.id, "api_key")

            if not key:
                raise RequiredSecretMissing(
                    source_id=source.id,
                    interaction_type=InteractionType.INPUT_TEXT,
                    fields=[
                        InteractionField(key="api_key", label="API Key", type="password")
                    ],
                    message=f"Missing API Key for {source.name}"
                )

        # OAuth Check
        elif source.auth.type == AuthType.OAUTH:
            # OAuth token always stored under source.id
            token_data = self._secrets.get_secrets(source.id)
            # access_token may be a dict with token in "access_token" field, or direct token string
            token = token_data.get("access_token")
            if isinstance(token, dict):
                token = token.get("access_token") or token.get("key")

            if not token:
                raise RequiredSecretMissing(
                    source_id=source.id,
                    interaction_type=InteractionType.OAUTH_START,
                    fields=[], # OAuth start usually has no fields, just a button
                    message=f"Authorization required for {source.name}",
                    data={"auth_url": f"/api/oauth/authorize/{source.id}"}
                )


    def _exception_to_interaction(self, source: SourceConfig, error: Exception) -> InteractionRequest | None:
        """根据异常生成特定的交互请求。"""
        
        if isinstance(error, RequiredSecretMissing):
            return InteractionRequest(
                type=error.interaction_type,
                step_id="auth_check", # TODO: dynamic step id
                source_id=error.source_id,
                title="Authentication Required",
                message=error.message,
                warning_message=error.warning_message,
                fields=error.fields,
                data=error.data
            )
            
        # 通用网络错误 -> 重试
        # if isinstance(error, (httpx.ConnectError, TimeoutError)):
        #     return InteractionRequest(
        #         type=InteractionType.RETRY,
        #         message="Network error, please retry."
        #     )

        return None

class RequiredSecretMissing(Exception):
    """自定义异常：缺少必要凭证。"""
    def __init__(self, source_id: str, interaction_type: InteractionType, fields: list[InteractionField], message: str, data: dict = None, warning_message: str = None):
        self.source_id = source_id
        self.interaction_type = interaction_type
        self.fields = fields
        self.message = message
        self.data = data
        self.warning_message = warning_message
        super().__init__(message)
