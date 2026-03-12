"""
OAuth 2.0 标准参数与常量定义。
"""

from enum import Enum
from typing import Dict, Optional
from pydantic import BaseModel

class GrantType(str, Enum):
    AUTHORIZATION_CODE = "authorization_code"
    REFRESH_TOKEN = "refresh_token"
    CLIENT_CREDENTIALS = "client_credentials"

class ResponseType(str, Enum):
    CODE = "code"
    TOKEN = "token"

class CodeChallengeMethod(str, Enum):
    S256 = "S256"
    PLAIN = "plain"

# 标准 OAuth 参数名常量
class OAuthParams:
    OAUTH_SECRETS = "oauth_secrets"
    CLIENT_ID = "client_id"
    CLIENT_SECRET = "client_secret"
    REDIRECT_URI = "redirect_uri"
    RESPONSE_TYPE = "response_type"
    SCOPE = "scope"
    STATE = "state"
    CODE = "code"
    GRANT_TYPE = "grant_type"
    CODE_VERIFIER = "code_verifier"
    CODE_CHALLENGE = "code_challenge"
    CODE_CHALLENGE_METHOD = "code_challenge_method"
    REFRESH_TOKEN = "refresh_token"
    ACCESS_TOKEN = "access_token"
    EXPIRES_IN = "expires_in"

# 默认配置
DEFAULT_TIMEOUT_SECONDS = 300  # 5 minutes for PKCE state
