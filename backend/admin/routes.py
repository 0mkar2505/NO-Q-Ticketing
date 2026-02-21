from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.db import company_collection, user_collection, db
from datetime import datetime, timedelta
from bson import ObjectId
import os

tickets_collection = db["tickets"]
chat_sessions_collection = db["chat_sessions"]
admin_settings_collection = db["admin_settings"]
admin_audit_collection = db["admin_audit_logs"]
team_chat_collection = db["team_chat_messages"]

admin_bp = Blueprint("admin", __name__)

def _to_object_id(value):
    try:
        return ObjectId(value)
    except Exception:
        return value

@admin_bp.route("/dashboard", methods=["GET"])
@require_auth("admin")
def admin_dashboard():
    now = datetime.utcnow()

    total_clients = company_collection.count_documents({})
    total_tickets = tickets_collection.count_documents({})
    active_users = user_collection.count_documents({"is_active": True})

    pending_payment = company_collection.count_documents({"approval_status": "pending_payment"})
    pending_approval = company_collection.count_documents({"approval_status": "pending_admin_approval"})

    mongo_ok = True
    mongo_error = None
    try:
        db.command("ping")
    except Exception as e:
        mongo_ok = False
        mongo_error = str(e)

    llm_provider = (os.getenv("LLM_PROVIDER") or "").strip().lower() or "openai"
    llm_model = (os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL") or "").strip()
    llm_configured = bool((os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip())

    # System status heuristic: DB must be up; LLM is optional (degraded if missing).
    if not mongo_ok:
        system_status = "down"
    elif not llm_configured:
        system_status = "degraded"
    else:
        system_status = "ok"

    recent_activity = _build_platform_activity(limit=12)

    health = _build_operational_health()
    # Keep health compact for dashboard; full health page calls /api/admin/health.
    health_compact = {
        "mongo_ok": health.get("mongo_ok"),
        "llm_configured": health.get("llm_configured"),
        "pending_payment": health.get("pending_payment"),
        "pending_approval": health.get("pending_approval"),
        "tickets_24h": health.get("tickets_24h"),
        "support_chats_24h": health.get("support_chats_24h"),
    }

    return jsonify(
        {
            "summary": {
                "total_clients": total_clients,
                "total_tickets": total_tickets,
                "active_users": active_users,
                "pending_payment": pending_payment,
                "pending_approval": pending_approval,
                "system_status": system_status,
                "mongo_ok": mongo_ok,
                "mongo_error": mongo_error,
                "llm_provider": llm_provider,
                "llm_model": llm_model,
                "llm_configured": llm_configured,
                "server_time": now.isoformat(),
            },
            "recent_activity": recent_activity,
            "health": health_compact,
        }
    ), 200


def _build_platform_activity(limit=20):
    """
    Best-effort platform activity feed. Uses existing collections instead of requiring a new event bus.
    """
    events = []

    def add(ts, kind, title, detail, scope=None):
        if not ts:
            return
        events.append(
            {
                "timestamp": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
                "kind": kind,
                "title": title,
                "detail": detail,
                "scope": scope or "",
            }
        )

    # Admin audit logs (approvals, system updates, removals).
    for row in list(admin_audit_collection.find({}).sort("timestamp", -1).limit(limit)):
        add(
            row.get("timestamp"),
            "admin",
            (row.get("action") or "admin_action").replace("_", " ").title(),
            f"{row.get('actor') or 'admin'} • {row.get('scope') or ''}".strip(" •"),
            scope=row.get("scope") or "",
        )

    # Companies created / approved / removed.
    for c in list(company_collection.find({}).sort("created_at", -1).limit(limit)):
        add(
            c.get("created_at"),
            "company",
            "Company Created",
            f"{c.get('name') or 'Company'} • {c.get('slug') or ''}".strip(" •"),
            scope=f"company/{c.get('slug') or str(c.get('_id'))}",
        )
        if c.get("approved_at"):
            add(
                c.get("approved_at"),
                "company",
                "Company Approved",
                f"{c.get('name') or 'Company'}",
                scope=f"company/{c.get('slug') or str(c.get('_id'))}",
            )
        if c.get("removed_at"):
            add(
                c.get("removed_at"),
                "company",
                "Company Removed",
                f"{c.get('name') or 'Company'}",
                scope=f"company/{c.get('slug') or str(c.get('_id'))}",
            )

    # User lifecycle (agents added/removed).
    for u in list(user_collection.find({"company_id": {"$ne": None}}).sort("created_at", -1).limit(limit)):
        role = (u.get("company_role") or "user").strip().lower()
        add(
            u.get("created_at"),
            "user",
            f"{role.title()} Created",
            f"{u.get('name') or u.get('email') or 'User'}",
            scope=f"user/{str(u.get('_id'))}",
        )
        if u.get("removed_at"):
            add(
                u.get("removed_at"),
                "user",
                f"{role.title()} Removed",
                f"{u.get('name') or u.get('email') or 'User'}",
                scope=f"user/{str(u.get('_id'))}",
            )

    # Ticket + chat volume.
    for t in list(tickets_collection.find({}).sort("updated_at", -1).limit(limit)):
        add(
            t.get("updated_at") or t.get("created_at"),
            "ticket",
            "Ticket Updated",
            (t.get("subject") or "Ticket").strip()[:120],
            scope=f"ticket/{str(t.get('_id'))}",
        )

    for s in list(chat_sessions_collection.find({}).sort("updated_at", -1).limit(limit)):
        add(
            s.get("updated_at") or s.get("created_at"),
            "support",
            "Support Chat Updated",
            f"{(s.get('company_name') or 'Company')} • {s.get('customer_email') or ''}".strip(" •")[:140],
            scope=f"chat_session/{str(s.get('_id'))}",
        )

    for m in list(team_chat_collection.find({}).sort("created_at", -1).limit(limit)):
        add(
            m.get("created_at"),
            "team_chat",
            "Team Chat Message",
            f"{m.get('sender_name') or 'User'}: {(m.get('text') or '')[:90]}",
            scope=f"team_chat/{str(m.get('_id'))}",
        )

    # Sort and return.
    def _ts(e):
        try:
            return datetime.fromisoformat(str(e.get("timestamp")).replace("Z", "+00:00"))
        except Exception:
            return datetime.min

    events.sort(key=_ts, reverse=True)
    return events[:limit]


def _build_operational_health():
    now = datetime.utcnow()
    since_24h = now - timedelta(hours=24)

    mongo_ok = True
    mongo_error = None
    try:
        db.command("ping")
    except Exception as e:
        mongo_ok = False
        mongo_error = str(e)

    llm_provider = (os.getenv("LLM_PROVIDER") or "").strip().lower() or "openai"
    llm_model = (os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL") or "").strip()
    llm_configured = bool((os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip())

    pending_payment = company_collection.count_documents({"approval_status": "pending_payment"})
    pending_approval = company_collection.count_documents({"approval_status": "pending_admin_approval"})

    tickets_24h = tickets_collection.count_documents({"updated_at": {"$gte": since_24h}})
    support_chats_24h = chat_sessions_collection.count_documents({"updated_at": {"$gte": since_24h}})

    return {
        "server_time": now.isoformat(),
        "mongo_ok": mongo_ok,
        "mongo_error": mongo_error,
        "llm_provider": llm_provider,
        "llm_model": llm_model,
        "llm_configured": llm_configured,
        "pending_payment": pending_payment,
        "pending_approval": pending_approval,
        "tickets_24h": tickets_24h,
        "support_chats_24h": support_chats_24h,
    }


@admin_bp.route("/activity", methods=["GET"])
@require_auth("admin")
def admin_activity():
    try:
        limit = int(request.args.get("limit") or 30)
    except (TypeError, ValueError):
        limit = 30
    if limit < 10:
        limit = 10
    if limit > 100:
        limit = 100
    return jsonify({"events": _build_platform_activity(limit=limit)}), 200


@admin_bp.route("/health", methods=["GET"])
@require_auth("admin")
def admin_health():
    return jsonify(_build_operational_health()), 200


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

    now = datetime.utcnow()
    since_7d = now.replace(microsecond=0)
    since_30d = now.replace(microsecond=0)
    # Approx windows (demo-safe).
    from datetime import timedelta as _td
    since_7d = now - _td(days=7)
    since_30d = now - _td(days=30)

    tickets_stats = {
        row["_id"]: row
        for row in tickets_collection.aggregate([
            {"$match": {"company_id": {"$ne": None}}},
            {"$group": {
                "_id": "$company_id",
                "count": {"$sum": 1},
                "last_ticket_at": {"$max": "$updated_at"},
                "tickets_7d": {"$sum": {"$cond": [{"$gte": ["$updated_at", since_7d]}, 1, 0]}},
                "tickets_30d": {"$sum": {"$cond": [{"$gte": ["$updated_at", since_30d]}, 1, 0]}},
            }}
        ])
    }

    chat_stats = {
        row["_id"]: row
        for row in chat_sessions_collection.aggregate([
            {"$match": {"company_id": {"$ne": None}}},
            {"$group": {
                "_id": "$company_id",
                "count": {"$sum": 1},
                "last_chat_at": {"$max": "$updated_at"},
                "chats_7d": {"$sum": {"$cond": [{"$gte": ["$updated_at", since_7d]}, 1, 0]}},
                "chats_30d": {"$sum": {"$cond": [{"$gte": ["$updated_at", since_30d]}, 1, 0]}},
            }}
        ])
    }

    client_rows = []
    for company in companies:
        company_name = (company.get("name") or "Unnamed Company").strip()
        company_email = (company.get("email") or "").strip()
        company_slug = (company.get("slug") or "").strip()

        if query:
            haystack = f"{company_name} {company_email} {company_slug}".lower()
            if query not in haystack:
                continue

        company_id = company.get("_id")
        approval_status = (company.get("approval_status") or ("active" if company.get("is_active", True) else "pending_admin_approval")).strip()
        billing_status = (company.get("billing_status") or "unpaid").strip()

        billing_started_at = company.get("billing_started_at")
        billing_renew_at = company.get("billing_renew_at")
        days_left = None
        try:
            if billing_renew_at:
                delta = billing_renew_at - now
                days_left = max(0, int(delta.total_seconds() // 86400))
        except Exception:
            days_left = None

        tstat = tickets_stats.get(company_id, {}) or {}
        cstat = chat_stats.get(company_id, {}) or {}

        client_rows.append({
            "company_id": str(company_id),
            "company_name": company_name,
            "company_email": company_email,
            "company_slug": company_slug,
            "plan": company.get("plan", "N/A"),
            "billing_status": billing_status,
            "approval_status": approval_status,
            "members": int(users_by_company.get(company_id, 0)),
            "tickets": int(tstat.get("count", 0)),
            "tickets_7d": int(tstat.get("tickets_7d", 0)),
            "tickets_30d": int(tstat.get("tickets_30d", 0)),
            "last_ticket_at": (tstat.get("last_ticket_at").isoformat() if tstat.get("last_ticket_at") else None),
            "support_chats": int(cstat.get("count", 0)),
            "support_chats_7d": int(cstat.get("chats_7d", 0)),
            "support_chats_30d": int(cstat.get("chats_30d", 0)),
            "last_support_chat_at": (cstat.get("last_chat_at").isoformat() if cstat.get("last_chat_at") else None),
            "billing_started_at": billing_started_at.isoformat() if billing_started_at else None,
            "billing_renew_at": billing_renew_at.isoformat() if billing_renew_at else None,
            "billing_days_left": days_left,
            "status": "active" if company.get("is_active", True) else "inactive",
            "created_at": company.get("created_at").isoformat() if company.get("created_at") else None,
        })

    client_rows.sort(key=lambda row: row["company_name"].lower())
    return jsonify({"clients": client_rows, "count": len(client_rows)}), 200


@admin_bp.route("/clients/<company_id>/approve", methods=["POST"])
@require_auth("admin")
def approve_client(company_id):
    company = company_collection.find_one({"_id": _to_object_id(company_id)})
    if not company:
        return jsonify({"error": "Company not found"}), 404

    company_collection.update_one(
        {"_id": company["_id"]},
        {
            "$set": {
                "is_active": True,
                "approval_status": "active",
                "approved_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        },
    )

    # Activate company users (supervisor + agents).
    user_collection.update_many(
        {"company_id": company["_id"]},
        {"$set": {"is_active": True}},
    )

    _append_audit_log(
        actor=(request.user.get("email") or request.user.get("name") or "admin"),
        action="approved_client",
        scope=f"admin/clients/{company_id}",
    )

    return jsonify({"message": "Client approved"}), 200


@admin_bp.route("/clients/<company_id>/remove", methods=["POST"])
@require_auth("admin")
def remove_client(company_id):
    company = company_collection.find_one({"_id": _to_object_id(company_id)})
    if not company:
        return jsonify({"error": "Company not found"}), 404

    company_collection.update_one(
        {"_id": company["_id"]},
        {
            "$set": {
                "is_active": False,
                "approval_status": "removed",
                "removed_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        },
    )
    user_collection.update_many({"company_id": company["_id"]}, {"$set": {"is_active": False}})

    _append_audit_log(
        actor=(request.user.get("email") or request.user.get("name") or "admin"),
        action="removed_client",
        scope=f"admin/clients/{company_id}",
    )
    return jsonify({"message": "Client removed"}), 200


@admin_bp.route("/clients/<company_id>/members", methods=["GET"])
@require_auth("admin")
def admin_client_members(company_id):
    company = company_collection.find_one({"_id": _to_object_id(company_id)})
    if not company:
        return jsonify({"error": "Company not found"}), 404

    rows = list(user_collection.find({"company_id": company["_id"]}).sort("created_at", -1))
    out = []
    for u in rows:
        out.append({
            "id": str(u.get("_id")),
            "name": u.get("name") or "",
            "email": u.get("email") or "",
            "company_role": u.get("company_role") or "",
            "platform_role": u.get("platform_role") or "",
            "is_active": bool(u.get("is_active", True)),
            "created_at": u.get("created_at").isoformat() if u.get("created_at") else None,
        })
    return jsonify({"company_id": str(company["_id"]), "members": out, "count": len(out)}), 200


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
