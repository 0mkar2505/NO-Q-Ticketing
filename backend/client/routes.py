from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from bson import ObjectId
from models.db import company_collection

client_bp = Blueprint("client", __name__)

def _to_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value

@client_bp.route("/dashboard", methods=["GET"])
@require_auth("client")
def client_dashboard():
    return jsonify({
        "message": "Client dashboard access granted"
    }), 200


@client_bp.route("/tenant", methods=["GET"])
@require_auth("client")
def client_tenant():
    company_id = request.user.get("company_id")
    if not company_id:
        return jsonify({"error": "Company not found"}), 404

    company = company_collection.find_one({"_id": _to_object_id(company_id)})
    if not company:
        return jsonify({"error": "Company not found"}), 404

    slug = (company.get("slug") or "").strip().lower()
    return jsonify(
        {
            "company_name": company.get("name") or "",
            "company_slug": slug,
            "support_path": f"/support/{slug}" if slug else "/support",
        }
    ), 200
