"""
PKCE (Proof Key for Code Exchange) utility helpers.
Compliant with RFC 7636.
"""

import base64
import hashlib
import secrets
import string

from .oauth_types import CodeChallengeMethod

class PKCEUtils:
    @staticmethod
    def generate_verifier(length: int = 128) -> str:
        """
        Generate a code_verifier.
        Length must be between 43 and 128 characters.
        Allowed chars: A-Z, a-z, 0-9, "-", ".", "_", "~"
        """
        if not (43 <= length <= 128):
            raise ValueError("code_verifier length must be between 43 and 128")
        
        allowed_chars = string.ascii_letters + string.digits + "-._~"
        return ''.join(secrets.choice(allowed_chars) for _ in range(length))

    @staticmethod
    def generate_challenge(verifier: str, method: CodeChallengeMethod = CodeChallengeMethod.S256) -> str:
        """
        Generate code_challenge from verifier.
        """
        if method == CodeChallengeMethod.S256:
            # SHA256 hash
            digest = hashlib.sha256(verifier.encode('ascii')).digest()
            # Base64URL encode without padding
            return base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')
        elif method == CodeChallengeMethod.PLAIN:
            return verifier
        else:
            raise ValueError(f"Unsupported code_challenge_method: {method}")
