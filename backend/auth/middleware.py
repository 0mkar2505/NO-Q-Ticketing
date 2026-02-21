import jwt
import os
from functools import wraps
from flask import request, jsonify
from dotenv import load_dotenv

load_dotenv()

def _normalize_roles(payload: dict):
    """Backwards compatible role normalization.

    - legacy payload role: admin|client
    - new fields: platform_role, company_role
    """
    legacy_role = (payload.get("role") or "").strip().lower()
    platform_role = (payload.get("platform_role") or "").strip().lower() or (
        "platform_admin" if legacy_role == "admin" else "client_user"
    )
    company_role = (payload.get("company_role") or "").strip().lower() or None
    if platform_role == "client_user" and not company_role:
        company_role = "supervisor"

    # Compute a stable legacy role (used across the frontend).
    computed_legacy = "admin" if platform_role == "platform_admin" else "client"
    return computed_legacy, platform_role, company_role


def require_auth(required_role=None, required_platform_role=None, required_company_role=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization")

            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify({"error": "Missing or invalid token"}), 401

            token = auth_header.split(" ")[1]

            try:
                payload = jwt.decode(
                    token,
                    os.getenv("JWT_SECRET"),
                    algorithms=["HS256"]
                )
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Token expired"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"error": "Invalid token"}), 401

            legacy_role, platform_role, company_role = _normalize_roles(payload)

            # role checks (if required)
            if required_role and legacy_role != str(required_role).strip().lower():
                return jsonify({"error": "Forbidden"}), 403

            if required_platform_role and platform_role != str(required_platform_role).strip().lower():
                return jsonify({"error": "Forbidden"}), 403

            if required_company_role:
                if platform_role != "client_user":
                    return jsonify({"error": "Forbidden"}), 403
                if company_role != str(required_company_role).strip().lower():
                    return jsonify({"error": "Forbidden"}), 403

            # Attach normalized fields for downstream code.
            payload["role"] = legacy_role
            payload["platform_role"] = platform_role
            payload["company_role"] = company_role

            # attach user to request
            request.user = payload
            return f(*args, **kwargs)

        return wrapper
    return decorator
