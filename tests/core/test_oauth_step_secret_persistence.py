from __future__ import annotations

import pytest

from core.config_loader import StepType
from core.source_state import SourceStatus
from tests.factories import build_source_config, build_step


@pytest.mark.asyncio
async def test_oauth_step_reads_token_from_oauth_secrets_dict(executor):
    source = build_source_config(
        source_id="oauth-secret-persistence",
        name="OAuth Secret Persistence Source",
        flow=[
            build_step(
                step_id="oauth",
                use=StepType.OAUTH,
                secrets={
                    "oauth_secrets": "oauth_secrets",
                },
            )
        ],
    )

    executor._secrets.set_secret(
        source.id,
        "oauth_secrets",
        {
            "access_token": "token-1",
            "refresh_token": "refresh-1",
            "expires_at": 9999999999,
        },
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ACTIVE
    stored_oauth = executor._secrets.get_secret(source.id, "oauth_secrets")
    assert isinstance(stored_oauth, dict)
    assert stored_oauth["access_token"] == "token-1"
    assert stored_oauth["refresh_token"] == "refresh-1"


@pytest.mark.asyncio
async def test_oauth_step_prefers_explicit_oauth_secrets_and_fallbacks_to_default(executor):
    source = build_source_config(
        source_id="oauth-secret-priority",
        name="OAuth Secret Priority Source",
        flow=[
            build_step(
                step_id="oauth",
                use=StepType.OAUTH,
                secrets={
                    "custom_oauth_bundle": "oauth_secrets",
                    "saved_access_token": "oauth_secrets.access_token",
                    "saved_refresh_token": "oauth_secrets.refresh_token",
                    "saved_expires_at": "oauth_secrets.expires_at",
                },
            )
        ],
    )

    executor._secrets.set_secret(
        source.id,
        "oauth_secrets",
        {
            "access_token": "default-access",
            "refresh_token": "default-refresh",
            "expires_at": 1111111111,
        },
    )
    executor._secrets.set_secret(
        source.id,
        "custom_oauth_bundle",
        {
            "access_token": "explicit-access",
        },
    )

    await executor.fetch_source(source)

    state = executor.get_source_state(source.id)
    assert state.status == SourceStatus.ACTIVE
    assert executor._secrets.get_secret(source.id, "saved_access_token") == "explicit-access"
    assert executor._secrets.get_secret(source.id, "saved_refresh_token") == "default-refresh"
    assert executor._secrets.get_secret(source.id, "saved_expires_at") == 1111111111


def test_resolve_args_supports_oauth_secrets_dot_path(executor):
    source_id = "oauth-dot-path"
    executor._secrets.set_secret(
        source_id,
        "oauth_secrets",
        {
            "access_token": "token-dot",
            "refresh_token": "refresh-dot",
        },
    )

    resolved_header = executor._resolve_args(
        "Bearer {oauth_secrets.access_token}",
        outputs={},
        context={},
        source_id=source_id,
    )
    assert resolved_header == "Bearer token-dot"

    resolved_object = executor._resolve_args(
        "{oauth_secrets}",
        outputs={},
        context={},
        source_id=source_id,
    )
    assert isinstance(resolved_object, dict)
    assert resolved_object["refresh_token"] == "refresh-dot"


def test_resolve_args_honors_escaped_template_braces(executor):
    source_id = "oauth-escape-literal"
    executor._secrets.set_secret(
        source_id,
        "oauth_secrets",
        {
            "access_token": "token-literal",
        },
    )

    resolved_literal = executor._resolve_args(
        r"\{oauth_secrets.access_token\}",
        outputs={},
        context={},
        source_id=source_id,
    )
    assert resolved_literal == "{oauth_secrets.access_token}"

    resolved_mixed = executor._resolve_args(
        r"literal=\{oauth_secrets.access_token\}, resolved={oauth_secrets.access_token}",
        outputs={},
        context={},
        source_id=source_id,
    )
    assert (
        resolved_mixed
        == "literal={oauth_secrets.access_token}, resolved=token-literal"
    )

    resolved_with_escaped_backslash = executor._resolve_args(
        r"path=C:\\{oauth_secrets.access_token}",
        outputs={},
        context={},
        source_id=source_id,
    )
    assert resolved_with_escaped_backslash == r"path=C:\token-literal"
