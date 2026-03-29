from __future__ import annotations

import ipaddress
import shlex
from dataclasses import dataclass
from urllib.parse import urlsplit

from .models import NetworkTargetClass

_LOCAL_DATABASE_PROFILES = {"sqlite"}
_PROFILE_SCHEMES = {
    "postgresql": {"postgresql", "postgres", "pgsql"},
    "mysql": {"mysql", "mysql+pymysql"},
    "mongodb": {"mongodb", "mongodb+srv"},
    "redis": {"redis", "rediss"},
}


@dataclass(frozen=True, slots=True)
class ClassifiedDatabaseTarget:
    profile: str
    scheme: str
    host: str
    port: int | None
    target_type: str
    target_value: str
    target_class: NetworkTargetClass


def classify_database_connection_target(
    *,
    profile: str,
    connection_string: str,
) -> ClassifiedDatabaseTarget | None:
    normalized_profile = str(profile or "").strip().lower()
    raw_connection_string = str(connection_string or "").strip()
    if not normalized_profile or not raw_connection_string:
        return None
    if normalized_profile in _LOCAL_DATABASE_PROFILES:
        return None

    parsed_target = _parse_connection_target(
        profile=normalized_profile,
        connection_string=raw_connection_string,
    )
    if parsed_target is None:
        return None

    host, port, scheme = parsed_target
    target_class = _classify_host(host)
    target_type = "host_port" if port is not None else "host"
    target_value = f"{host}:{port}" if port is not None else host
    return ClassifiedDatabaseTarget(
        profile=normalized_profile,
        scheme=scheme,
        host=host,
        port=port,
        target_type=target_type,
        target_value=target_value,
        target_class=target_class,
    )


def _parse_connection_target(
    *,
    profile: str,
    connection_string: str,
) -> tuple[str, int | None, str] | None:
    if "://" in connection_string:
        parsed = urlsplit(connection_string)
        scheme = (parsed.scheme or "").strip().lower()
        supported_schemes = _PROFILE_SCHEMES.get(profile, {profile})
        if scheme not in supported_schemes:
            return None
        host = (parsed.hostname or "").strip().lower()
        if not host:
            return None
        try:
            port = parsed.port
        except ValueError:
            port = None
        return host, port, scheme

    tokens: dict[str, str] = {}
    try:
        parts = shlex.split(connection_string)
    except ValueError:
        return None
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        normalized_key = key.strip().lower()
        normalized_value = value.strip()
        if normalized_key and normalized_value:
            tokens[normalized_key] = normalized_value

    host = (tokens.get("host") or tokens.get("hostaddr") or "").strip().lower()
    if not host or host.startswith("/"):
        return None

    raw_port = tokens.get("port")
    try:
        port = int(raw_port) if raw_port else None
    except ValueError:
        port = None
    return host, port, profile


def _classify_host(host: str) -> NetworkTargetClass:
    if host == "localhost":
        return NetworkTargetClass.LOOPBACK
    try:
        target_ip = ipaddress.ip_address(host)
    except ValueError:
        return NetworkTargetClass.PUBLIC

    if target_ip.is_loopback:
        return NetworkTargetClass.LOOPBACK
    if target_ip.is_link_local or target_ip.is_private:
        return NetworkTargetClass.PRIVATE
    return NetworkTargetClass.PUBLIC
