from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.db import company_collection, user_collection, db
from datetime import datetime

tickets_collection = db["tickets"]
admin_settings_collection = db["admin_settings"]
admin_audit_collection = db["admin_audit_logs"]

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


def _get_billing_rules():
    doc = admin_settings_collection.find_one({"key": "billing_rules"}) or {}
    rules = doc.get("value") or {}
    grace_days = int(rules.get("grace_days", 7))
    currency = (rules.get("currency") or "USD").upper()
    if currency not in {"USD", "EUR", "INR"}:
        currency = "USD"
    if grace_days < 0:
        grace_days = 0
    if grace_days > 90:
        grace_days = 90
    return {"grace_days": grace_days, "currency": currency}


@admin_bp.route("/billing", methods=["GET"])
@require_auth("admin")
def admin_billing():
    companies = list(company_collection.find({}))
    plans = {"free": 0, "starter": 0, "growth": 0, "enterprise": 0, "unknown": 0}

    for company in companies:
        plan = (company.get("plan") or "unknown").strip().lower()
        if plan not in plans:
            plan = "unknown"
        plans[plan] += 1

    recent_companies = sorted(
        companies,
        key=lambda c: c.get("created_at") or 0,
        reverse=True
    )[:5]

    recent_invoices = []
    for idx, company in enumerate(recent_companies, start=1):
        status = "paid" if idx % 3 != 0 else "pending"
        recent_invoices.append({
            "invoice_id": f"INV-{idx:04d}",
            "company_name": company.get("name") or "Unnamed Company",
            "status": status
        })

    return jsonify({
        "summary": {
            "total_clients": len(companies),
            "plan_distribution": plans
        },
        "recent_invoices": recent_invoices,
        "rules": _get_billing_rules()
    }), 200


@admin_bp.route("/billing/rules", methods=["PATCH"])
@require_auth("admin")
def update_billing_rules():
    data = request.get_json(silent=True) or {}

    try:
        grace_days = int(data.get("grace_days"))
    except (TypeError, ValueError):
        return jsonify({"error": "grace_days must be a number"}), 400

    if grace_days < 0 or grace_days > 90:
        return jsonify({"error": "grace_days must be between 0 and 90"}), 400

    currency = (data.get("currency") or "").upper().strip()
    if currency not in {"USD", "EUR", "INR"}:
        return jsonify({"error": "currency must be one of: USD, EUR, INR"}), 400

    rules = {"grace_days": grace_days, "currency": currency}
    admin_settings_collection.update_one(
        {"key": "billing_rules"},
        {"$set": {"value": rules}},
        upsert=True
    )
    return jsonify({"message": "Billing rules saved", "rules": rules}), 200


def _append_audit_log(actor, action, scope):
    admin_audit_collection.insert_one({
        "timestamp": datetime.utcnow(),
        "actor": actor or "unknown",
        "action": action,
        "scope": scope
    })


def _get_system_settings():
    doc = admin_settings_collection.find_one({"key": "system_settings"}) or {}
    value = doc.get("value") or {}

    auth_policy = value.get("auth_policy") or {}
    maintenance = value.get("maintenance") or {}

    strong_passwords = bool(auth_policy.get("strong_passwords", True))
    enforce_mfa_admins = bool(auth_policy.get("enforce_mfa_admins", False))
    auto_expire_sessions = bool(auth_policy.get("auto_expire_sessions", True))

    log_retention_days = int(maintenance.get("log_retention_days", 30))
    backup_window_utc = maintenance.get("backup_window_utc", "02:00")

    if log_retention_days not in {30, 60, 90}:
        log_retention_days = 30
    if backup_window_utc not in {"02:00", "04:00", "06:00"}:
        backup_window_utc = "02:00"

    return {
        "auth_policy": {
            "strong_passwords": strong_passwords,
            "enforce_mfa_admins": enforce_mfa_admins,
            "auto_expire_sessions": auto_expire_sessions
        },
        "maintenance": {
            "log_retention_days": log_retention_days,
            "backup_window_utc": backup_window_utc
        }
    }


def _serialize_audit_rows(rows):
    output = []
    for row in rows:
        ts = row.get("timestamp")
        output.append({
            "timestamp": ts.isoformat() if ts else None,
            "actor": row.get("actor", "unknown"),
            "action": row.get("action", "-"),
            "scope": row.get("scope", "-")
        })
    return output


@admin_bp.route("/system", methods=["GET"])
@require_auth("admin")
def admin_system():
    settings = _get_system_settings()
    recent_logs = list(admin_audit_collection.find({}).sort("timestamp", -1).limit(20))
    return jsonify({
        "settings": settings,
        "audit_logs": _serialize_audit_rows(recent_logs)
    }), 200


@admin_bp.route("/system", methods=["PATCH"])
@require_auth("admin")
def update_admin_system():
    data = request.get_json(silent=True) or {}
    auth_policy = data.get("auth_policy") or {}
    maintenance = data.get("maintenance") or {}

    if not isinstance(auth_policy, dict) or not isinstance(maintenance, dict):
        return jsonify({"error": "Invalid payload"}), 400

    log_retention_days = maintenance.get("log_retention_days")
    backup_window_utc = maintenance.get("backup_window_utc")

    try:
        log_retention_days = int(log_retention_days)
    except (TypeError, ValueError):
        return jsonify({"error": "log_retention_days must be a number"}), 400

    if log_retention_days not in {30, 60, 90}:
        return jsonify({"error": "log_retention_days must be one of: 30, 60, 90"}), 400
    if backup_window_utc not in {"02:00", "04:00", "06:00"}:
        return jsonify({"error": "backup_window_utc must be one of: 02:00, 04:00, 06:00"}), 400

    normalized = {
        "auth_policy": {
            "strong_passwords": bool(auth_policy.get("strong_passwords")),
            "enforce_mfa_admins": bool(auth_policy.get("enforce_mfa_admins")),
            "auto_expire_sessions": bool(auth_policy.get("auto_expire_sessions")),
        },
        "maintenance": {
            "log_retention_days": log_retention_days,
            "backup_window_utc": backup_window_utc,
        },
    }

    admin_settings_collection.update_one(
        {"key": "system_settings"},
        {"$set": {"value": normalized}},
        upsert=True
    )
    _append_audit_log(
        actor=(request.user.get("email") or request.user.get("name") or "admin"),
        action="updated_system_settings",
        scope="admin/system"
    )

    return jsonify({
        "message": "System settings saved",
        "settings": normalized
    }), 200
