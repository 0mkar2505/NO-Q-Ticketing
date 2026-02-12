from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.db import company_collection, user_collection, db

tickets_collection = db["tickets"]

admin_bp = Blueprint("admin", __name__)

@admin_bp.route("/dashboard", methods=["GET"])
@require_auth("admin")
def admin_dashboard():
    return jsonify({
        "message": "Admin dashboard access granted"
    }), 200


@admin_bp.route("/clients", methods=["GET"])
@require_auth("admin")
def admin_clients():
    query = (request.args.get("q") or "").strip().lower()
    companies = list(company_collection.find({}))

    users_by_company = {
        row["_id"]: row.get("count", 0)
        for row in user_collection.aggregate([
            {"$match": {"company_id": {"$ne": None}}},
            {"$group": {"_id": "$company_id", "count": {"$sum": 1}}}
        ])
    }

    tickets_by_company = {
        row["_id"]: row.get("count", 0)
        for row in tickets_collection.aggregate([
            {"$match": {"company_id": {"$ne": None}}},
            {"$group": {"_id": "$company_id", "count": {"$sum": 1}}}
        ])
    }

    client_rows = []
    for company in companies:
        company_name = (company.get("name") or "Unnamed Company").strip()
        company_email = (company.get("email") or "").strip()

        if query:
            haystack = f"{company_name} {company_email}".lower()
            if query not in haystack:
                continue

        company_id = company.get("_id")
        client_rows.append({
            "company_id": str(company_id),
            "company_name": company_name,
            "company_email": company_email,
            "plan": company.get("plan", "N/A"),
            "members": int(users_by_company.get(company_id, 0)),
            "tickets": int(tickets_by_company.get(company_id, 0)),
            "status": "active" if company.get("is_active", True) else "inactive",
            "created_at": company.get("created_at").isoformat() if company.get("created_at") else None,
        })

    client_rows.sort(key=lambda row: row["company_name"].lower())
    return jsonify({"clients": client_rows, "count": len(client_rows)}), 200
