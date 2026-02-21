from flask import Blueprint, request, jsonify
from models.user import User
from models.user import create_user, get_user_by_email  
from models.company import create_company
from auth.utils import check_password, generate_token
from auth.utils import hash_password, generate_onboarding_token
from models.db import user_collection
from models.db import company_collection
from bson import ObjectId
from datetime import datetime, timedelta

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

def _to_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json

    if not data or "email" not in data or "password" not in data:
        return jsonify({"error": "Invalid request"}), 400

    print("LOGIN START")
    user = User.find_by_email(data["email"])
    print("LOGIN QUERY DONE")

    if not user or not check_password(data["password"], user.password):
        return jsonify({"error": "Invalid credentials"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is not active yet."}), 403

    # Backfill hierarchy fields for existing users (safe/no-op for new users).
    platform_role = user.platform_role or ("platform_admin" if user.role == "admin" else "client_user")
    company_role = user.company_role
    if platform_role == "client_user" and not company_role:
        company_role = "supervisor"

    # Block company logins until admin approval.
    if platform_role == "client_user":
        if not user.company_id:
            return jsonify({"error": "Company not found"}), 404
        company = company_collection.find_one({"_id": _to_object_id(user.company_id)})
        if not company:
            return jsonify({"error": "Company not found"}), 404
        if not company.get("is_active", False):
            status = (company.get("approval_status") or "pending_admin_approval").strip()
            if status == "pending_payment":
                return jsonify({"error": "Complete payment to continue.", "code": "pending_payment"}), 403
            return jsonify({"error": "Awaiting admin approval.", "code": "awaiting_admin_approval"}), 403

    if user.platform_role != platform_role or user.company_role != company_role:
        user_collection.update_one(
            {"_id": user._id},
            {"$set": {"platform_role": platform_role, "company_role": company_role}}
        )
        user.platform_role = platform_role
        user.company_role = company_role

    token = generate_token(user)

    return jsonify({
        "token": token,
        "user": {
            "id": str(user._id),
            "role": "admin" if platform_role == "platform_admin" else "client",
            "platform_role": platform_role,
            "company_role": company_role,
            "company_id": str(user.company_id) if user.company_id else None
        }
    })

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json

    # Security: Force client role for public registration
    # Block any attempt to create admin accounts via API
    if data.get("role") and data["role"] != "client":
        return jsonify({"error": "Admin accounts cannot be created publicly"}), 403
    
    # Force client role
    data["role"] = "client"

    # Onboarding fields
    name = (data.get("name") or "").strip()
    company_name = (data.get("company_name") or "").strip()
    password = (data.get("password") or "").strip()
    handle = (data.get("handle") or "").strip().lower()

    industry = (data.get("industry") or "").strip()
    website = (data.get("website") or "").strip()
    company_size = (data.get("company_size") or "").strip()
    notes = (data.get("notes") or "").strip()

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not company_name:
        return jsonify({"error": "Company name is required"}), 400
    if not handle:
        return jsonify({"error": "NO-Q email handle is required"}), 400
    if not password:
        return jsonify({"error": "Password is required"}), 400

    if len(handle) < 3 or len(handle) > 32:
        return jsonify({"error": "Handle must be 3-32 characters."}), 400
    allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
    if any(ch not in allowed for ch in handle):
        return jsonify({"error": "Handle can only include letters, numbers, dot, underscore, and hyphen."}), 400

    email = f"{handle}@noq.com"
    if get_user_by_email(email):
        return jsonify({"error": "That NO-Q email is already taken."}), 409

    # Create pending company + inactive supervisor (payment then admin approval).
    company = create_company(
        company_name,
        email,
        details={
            "industry": industry,
            "website": website,
            "company_size": company_size,
            "notes": notes,
        },
    )
    company_id = company["_id"]

    hashed_pw = hash_password(password)

    create_user(
        name=name,
        email=email,
        password=hashed_pw,
        role="client",
        company_id=company_id,
        platform_role="client_user",
        company_role="supervisor",
        is_active=True,
    )

    onboarding_token = generate_onboarding_token(str(company_id), email)

    return jsonify(
        {
            "message": "Onboarding started",
            "company_id": str(company_id),
            "company_slug": company.get("slug"),
            "onboarding_token": onboarding_token,
        }
    ), 201


@auth_bp.route("/complete-checkout", methods=["POST"])
def complete_checkout():
    data = request.get_json(silent=True) or {}
    token = (data.get("onboarding_token") or "").strip()
    plan = (data.get("plan") or "").strip().lower()
    if not token:
        return jsonify({"error": "onboarding_token is required"}), 400
    if plan not in {"starter", "growth", "enterprise"}:
        return jsonify({"error": "Invalid plan"}), 400

    import jwt
    import os

    try:
        payload = jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
    except Exception:
        return jsonify({"error": "Invalid onboarding token"}), 401

    if payload.get("purpose") != "onboarding":
        return jsonify({"error": "Invalid onboarding token"}), 401

    company_id = payload.get("company_id")
    email = (payload.get("email") or "").strip().lower()
    if not company_id:
        return jsonify({"error": "Invalid onboarding token"}), 401

    company = company_collection.find_one({"_id": _to_object_id(company_id)})
    if not company:
        return jsonify({"error": "Company not found"}), 404

    # Fake "payment processed" marker.
    now = datetime.utcnow()
    company_collection.update_one(
        {"_id": company["_id"]},
        {
            "$set": {
                "plan": plan,
                "billing_status": "paid",
                "approval_status": "pending_admin_approval",
                "billing_started_at": now,
                # Default demo cycle: 30 days.
                "billing_renew_at": now + timedelta(days=30),
                "billing_cycle_days": 30,
                "updated_at": now,
            }
        },
    )

    return jsonify({"message": "Payment recorded", "next": "awaiting_admin_approval", "email": email}), 200
