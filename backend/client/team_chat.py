from flask import Blueprint, jsonify, request
from datetime import datetime
from bson import ObjectId

from auth.middleware import require_auth
from models.db import db


team_chat_bp = Blueprint("team_chat", __name__)
team_chat_collection = db["team_chat_messages"]


def _to_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value


def _serialize(row):
    return {
        "id": str(row.get("_id")),
        "company_id": str(row.get("company_id")) if row.get("company_id") else None,
        "sender_user_id": str(row.get("sender_user_id")) if row.get("sender_user_id") else None,
        "sender_name": row.get("sender_name") or "",
        "sender_role": row.get("sender_role") or "",
        "text": row.get("text") or "",
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None,
    }


@team_chat_bp.route("/api/client/team-chat", methods=["GET"])
@require_auth(required_role="client")
def list_messages():
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    limit = 60
    try:
        limit = int(request.args.get("limit") or limit)
    except (TypeError, ValueError):
        limit = 60
    if limit < 10:
        limit = 10
    if limit > 200:
        limit = 200

    rows = list(
        team_chat_collection.find({"company_id": _to_object_id(company_id)})
        .sort("created_at", -1)
        .limit(limit)
    )
    rows.reverse()
    return jsonify({"messages": [_serialize(r) for r in rows]}), 200


@team_chat_bp.route("/api/client/team-chat", methods=["POST"])
@require_auth(required_role="client")
def post_message():
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    if len(text) > 1200:
        return jsonify({"error": "text is too long (max 1200 characters)"}), 400

    doc = {
        "company_id": _to_object_id(company_id),
        "sender_user_id": _to_object_id(request.user.get("user_id") or None),
        "sender_name": (request.user.get("name") or request.user.get("email") or "User").strip(),
        "sender_role": (request.user.get("company_role") or "").strip().lower(),
        "text": text,
        "created_at": datetime.utcnow(),
    }
    team_chat_collection.insert_one(doc)
    return jsonify({"message": "sent"}), 201

