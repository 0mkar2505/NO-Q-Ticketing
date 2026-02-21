from flask import Blueprint, jsonify, request
from bson import ObjectId
from datetime import datetime

from auth.middleware import require_auth
from auth.utils import hash_password
from models.db import user_collection


client_members_bp = Blueprint("client_members", __name__)

# Supervisors can only create agents. Creating supervisors is reserved for platform admin.
ALLOWED_COMPANY_ROLES = {"agent"}


def _to_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value


def _serialize_user(u):
    return {
        "id": str(u.get("_id")),
        "name": u.get("name") or "",
        "email": u.get("email") or "",
        "platform_role": u.get("platform_role") or "",
        "company_role": u.get("company_role") or "",
        "company_id": str(u.get("company_id")) if u.get("company_id") else None,
        "is_active": bool(u.get("is_active", True)),
        "created_at": u.get("created_at").isoformat() if u.get("created_at") else None,
    }


@client_members_bp.route("/api/client/members", methods=["GET"])
@require_auth(required_role="client", required_company_role="supervisor")
def list_members():
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    rows = list(
        user_collection.find({"company_id": _to_object_id(company_id)}).sort("created_at", -1)
    )
    return jsonify({"members": [_serialize_user(r) for r in rows], "count": len(rows)}), 200


@client_members_bp.route("/api/client/members", methods=["POST"])
@require_auth(required_role="client", required_company_role="supervisor")
def create_member():
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "").strip()
    company_role = "agent"

    if not name:
        return jsonify({"error": "name is required"}), 400
    if not email or "@" not in email:
        return jsonify({"error": "valid email is required"}), 400
    if not password or len(password) < 8:
        return jsonify({"error": "password must be at least 8 characters"}), 400
    requested_role = (data.get("company_role") or "").strip().lower()
    if requested_role and requested_role != "agent":
        return jsonify({"error": "Only agents can be created by supervisors."}), 403
    if company_role not in ALLOWED_COMPANY_ROLES:
        return jsonify({"error": "Only agents can be created."}), 400

    if user_collection.find_one({"email": email}):
        return jsonify({"error": "User already exists"}), 409

    doc = {
        "name": name,
        "email": email,
        "password": hash_password(password),
        # Legacy compatibility: all company users remain "client"
        "role": "client",
        "platform_role": "client_user",
        "company_role": company_role,
        "company_id": _to_object_id(company_id),
        "is_active": True,
        "created_at": datetime.utcnow(),
    }
    result = user_collection.insert_one(doc)
    created = user_collection.find_one({"_id": result.inserted_id}) or doc
    return jsonify({"member": _serialize_user(created), "message": "Member created"}), 201


@client_members_bp.route("/api/client/members/<user_id>", methods=["DELETE"])
@require_auth(required_role="client", required_company_role="supervisor")
def remove_member(user_id):
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    # Prevent removing yourself.
    if str(request.user.get("user_id")) == str(user_id):
        return jsonify({"error": "You cannot remove your own account."}), 400

    target = user_collection.find_one({"_id": _to_object_id(user_id), "company_id": _to_object_id(company_id)})
    if not target:
        return jsonify({"error": "Member not found"}), 404

    if (target.get("company_role") or "").strip().lower() != "agent":
        return jsonify({"error": "Only agents can be removed by supervisors."}), 403

    user_collection.update_one(
        {"_id": target["_id"]},
        {"$set": {"is_active": False, "removed_at": datetime.utcnow()}},
    )
    return jsonify({"message": "Agent removed"}), 200
