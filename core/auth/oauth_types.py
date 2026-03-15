"""
OAuth 2.0 standard parameter and constant definitions.
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

# Standard OAuth parameter names.
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

# Default configuration.
DEFAULT_TIMEOUT_SECONDS = 300  # 5 minutes for PKCE state
