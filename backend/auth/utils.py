import bcrypt
import jwt
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt. Returns utf-8 decoded string."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode(), salt)
    return hashed.decode("utf-8")


def check_password(password: str, password_hash: str) -> bool:
    """Check a password against a bcrypt hash."""
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode(),
            password_hash.encode()
        )
    except Exception:
        return False


def generate_token(user) -> str:
    platform_role = getattr(user, "platform_role", None) or ("platform_admin" if user.role == "admin" else "client_user")
    company_role = getattr(user, "company_role", None)
    if platform_role == "client_user" and not company_role:
        # Backwards compatible default: existing client users are supervisors until you create agents.
        company_role = "supervisor"

    # Legacy compatibility: frontend and some backend code expect role=admin|client
    legacy_role = "admin" if platform_role == "platform_admin" else "client"

    payload = {
        "user_id": str(user._id),
        "role": legacy_role,
        "platform_role": platform_role,
        "company_role": company_role,
        "company_id": str(user.company_id) if user.company_id else None,
        "email": getattr(user, "email", None),
        "name": getattr(user, "name", None),
        "exp": datetime.utcnow() + timedelta(hours=6)
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm="HS256")


def generate_onboarding_token(company_id: str, email: str) -> str:
    """Short-lived token used during onboarding (pricing/checkout) before the account is approved."""
    payload = {
        "company_id": str(company_id),
        "email": (email or "").strip().lower(),
        "purpose": "onboarding",
        "exp": datetime.utcnow() + timedelta(minutes=30),
    }
    return jwt.encode(payload, os.getenv("JWT_SECRET"), algorithm="HS256")
