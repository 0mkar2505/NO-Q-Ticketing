from flask import Blueprint, jsonify, request
import re
import time
from collections import defaultdict, deque
from models.chat_session import ChatSession
from models.client_config import ClientConfig
from models.db import company_collection
from models.ticket import Ticket
from support.rules import (
    build_subject,
    compute_category,
    compute_priority,
    get_option_label,
    get_step,
)
from ai.triage import triage_support

support_bp = Blueprint("support", __name__)
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_EMAIL_LENGTH = 320
MAX_SUBJECT_LENGTH = 200
MAX_DETAILS_LENGTH = 4000
MAX_REPLY_LENGTH = 2000

# Simple in-memory rate limiter for public support APIs.
# Keyed by "route_key:ip" and enforced with a sliding window.
_RATE_WINDOWS = {
    "config": (60, 60),        # 60 requests / 60s
    "start": (10, 60),         # 10 requests / 60s
    "step": (60, 60),          # 60 requests / 60s
    "create_ticket": (10, 60), # 10 requests / 60s
    "ai_start": (10, 60),      # 10 requests / 60s
    "ai_message": (60, 60),    # 60 requests / 60s
    "ai_create": (10, 60),     # 10 requests / 60s
    "ticket_status": (30, 60), # 30 requests / 60s
    "ticket_reply": (20, 60),  # 20 requests / 60s
    "ticket_reopen": (10, 60), # 10 requests / 60s
}
_RATE_STATE = defaultdict(deque)


def _get_request_ip():
    forwarded_for = (request.headers.get("X-Forwarded-For") or "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return (request.remote_addr or "unknown").strip()


def _check_rate_limit(route_key):
    limit, window_seconds = _RATE_WINDOWS[route_key]
    ip = _get_request_ip()
    key = f"{route_key}:{ip}"
    bucket = _RATE_STATE[key]
    now = time.time()
    window_start = now - window_seconds

    while bucket and bucket[0] < window_start:
        bucket.popleft()

    if len(bucket) >= limit:
        retry_after = max(1, int(bucket[0] + window_seconds - now))
        return False, retry_after

    bucket.append(now)
    return True, None


def _find_company_by_slug(company_slug):
    if not company_slug:
        return None
    return company_collection.find_one({"slug": company_slug.strip().lower()})


def _review_payload(answers):
    category_label = compute_category(answers.get("category"))
    priority, severity = compute_priority(answers)
    return {
        "category": category_label,
        "priority": priority,
        "severity": severity,
        "details": (answers.get("details") or "").strip(),
    }


@support_bp.route("/api/support/ai-start", methods=["POST"])
def support_ai_start():
    allowed, retry_after = _check_rate_limit("ai_start")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    company_slug = (data.get("company_slug") or "").strip().lower()
    customer_email = (data.get("customer_email") or "").strip().lower()

    if not company_slug:
        return jsonify({"error": "company_slug is required"}), 400
    if not SLUG_PATTERN.match(company_slug):
        return jsonify({"error": "company_slug format is invalid"}), 400
    if not customer_email:
        return jsonify({"error": "customer_email is required"}), 400
    if len(customer_email) > MAX_EMAIL_LENGTH:
        return jsonify({"error": "customer_email is too long"}), 400
    if not EMAIL_PATTERN.match(customer_email):
        return jsonify({"error": "customer_email format is invalid"}), 400

    company = _find_company_by_slug(company_slug)
    if not company:
        return jsonify({"error": "Company not found"}), 404

    client_config = ClientConfig.get_by_company(company["_id"])
    customer_chat_ui = (client_config or {}).get("customer_chat_ui") or {}

    session = ChatSession.create(
        company_id=company["_id"],
        company_name=company.get("name") or company_slug,
        customer_email=customer_email,
        mode="ai",
        current_step="ai",
    )

    greeting = "Hi. Tell me what's going on and I'll ask a couple quick questions before creating your ticket."
    ChatSession.append_turn(session["_id"], "assistant", greeting)

    return jsonify(
        {
            "session_id": session["_id"],
            "message": greeting,
            "customer_chat_ui": customer_chat_ui,
        }
    ), 200


@support_bp.route("/api/support/ai-message", methods=["POST"])
def support_ai_message():
    allowed, retry_after = _check_rate_limit("ai_message")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    message = (data.get("message") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > MAX_DETAILS_LENGTH:
        return jsonify({"error": f"message is too long (max {MAX_DETAILS_LENGTH} characters)"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    if session.get("status") != "active":
        return jsonify({"error": "Session is not active"}), 409
    if session.get("mode") != "ai":
        return jsonify({"error": "Session mode is not ai"}), 409

    ChatSession.append_turn(session_id, "customer", message)

    result = triage_support(
        company_id=session.get("company_id"),
        company_name=session.get("company_name"),
        customer_email=session.get("customer_email"),
        transcript=session.get("transcript") or [],
        user_message=message,
    )

    assistant_message = (result.get("assistant_message") or "").strip()
    triage = result.get("triage") or {}
    sources = result.get("sources") or []

    if assistant_message:
        ChatSession.append_turn(session_id, "assistant", assistant_message)

    ChatSession.set_ai_triage(session_id, triage, sources)

    return jsonify(
        {
            "message": assistant_message,
            "triage": triage,
            "sources": sources,
        }
    ), 200


@support_bp.route("/api/support/ai-create-ticket", methods=["POST"])
def support_ai_create_ticket():
    allowed, retry_after = _check_rate_limit("ai_create")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    if session.get("status") != "active":
        # Idempotent-ish
        if session.get("ticket_id"):
            return jsonify({"message": "Ticket already created", "ticket": {"_id": session.get("ticket_id")}}), 200
        return jsonify({"error": "Session is not active"}), 409
    if session.get("mode") != "ai":
        return jsonify({"error": "Session mode is not ai"}), 409

    triage = session.get("ai_triage") or {}
    if not triage or not triage.get("should_create_ticket"):
        return jsonify({"error": "AI is not ready to create a ticket yet"}), 409

    subject = (triage.get("proposed_subject") or "").strip()
    if not subject:
        subject = "Support request"
    if len(subject) > MAX_SUBJECT_LENGTH:
        subject = subject[:MAX_SUBJECT_LENGTH]

    category_label = (triage.get("category") or "Other").strip()
    priority = (triage.get("priority") or "normal").strip().lower()
    severity = (triage.get("severity") or "medium").strip().lower()

    transcript = []
    for turn in session.get("transcript") or []:
        speaker = (turn.get("speaker") or "").lower()
        if speaker not in {"assistant", "customer"}:
            speaker = "assistant"
        sender = "customer" if speaker == "customer" else "assistant"
        transcript.append(
            {
                "sender": sender,
                "text": (turn.get("text") or "").strip(),
                "timestamp": turn.get("timestamp"),
            }
        )

    ticket = Ticket.create_from_support(
        company_id=session["company_id"],
        customer_email=session["customer_email"],
        subject=subject,
        transcript=transcript,
        category=category_label,
        severity=severity,
        priority=priority,
        chat_session_id=session["_id"],
    )
    ChatSession.complete(session_id, ticket["_id"])

    return jsonify(
        {
            "message": "Ticket created",
            "ticket": {
                "_id": ticket["_id"],
                "subject": ticket["subject"],
                "status": ticket["status"],
                "category": ticket.get("category"),
                "severity": ticket.get("severity"),
                "priority": ticket.get("priority"),
            },
        }
    ), 201

@support_bp.route("/api/support/config", methods=["GET"])
def support_config():
    allowed, retry_after = _check_rate_limit("config")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    company_slug = (request.args.get("company_slug") or "").strip().lower()
    if not company_slug:
        return jsonify({"error": "company_slug is required"}), 400
    if not SLUG_PATTERN.match(company_slug):
        return jsonify({"error": "company_slug format is invalid"}), 400

    company = _find_company_by_slug(company_slug)
    if not company:
        return jsonify({"error": "Company not found"}), 404

    client_config = ClientConfig.get_by_company(company["_id"])
    customer_chat_ui = (client_config or {}).get("customer_chat_ui") or {}
    return jsonify({"customer_chat_ui": customer_chat_ui}), 200


@support_bp.route("/api/support/start", methods=["POST"])
def support_start():
    allowed, retry_after = _check_rate_limit("start")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    company_slug = (data.get("company_slug") or "").strip().lower()
    customer_email = (data.get("customer_email") or "").strip().lower()

    if not company_slug:
        return jsonify({"error": "company_slug is required"}), 400
    if not SLUG_PATTERN.match(company_slug):
        return jsonify({"error": "company_slug format is invalid"}), 400
    if not customer_email:
        return jsonify({"error": "customer_email is required"}), 400
    if len(customer_email) > MAX_EMAIL_LENGTH:
        return jsonify({"error": "customer_email is too long"}), 400
    if not EMAIL_PATTERN.match(customer_email):
        return jsonify({"error": "customer_email format is invalid"}), 400

    company = _find_company_by_slug(company_slug)
    if not company:
        return jsonify({"error": "Company not found"}), 404
    client_config = ClientConfig.get_by_company(company["_id"])
    customer_chat_ui = (client_config or {}).get("customer_chat_ui") or {}

    session = ChatSession.create(
        company_id=company["_id"],
        company_name=company.get("name") or company_slug,
        customer_email=customer_email,
    )

    step = get_step("category")
    ChatSession.append_turn(session["_id"], "assistant", step["message"])

    return jsonify(
        {
            "session_id": session["_id"],
            "step": "category",
            "message": step["message"],
            "options": step["options"],
            "ready_to_create_ticket": False,
            "customer_chat_ui": customer_chat_ui,
        }
    ), 200


@support_bp.route("/api/support/step", methods=["POST"])
def support_step():
    allowed, retry_after = _check_rate_limit("step")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    option_id = (data.get("option_id") or "").strip()
    details = (data.get("details") or "").strip()

    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    if session.get("status") != "active":
        return jsonify({"error": "Session is not active"}), 409

    current_step = session.get("current_step") or "category"
    if current_step == "review":
        return jsonify({"error": "Review complete. Create ticket to continue."}), 409

    step_config = get_step(current_step)
    if not step_config:
        return jsonify({"error": "Invalid session state"}), 500

    answers = dict(session.get("answers") or {})

    if current_step == "details":
        if not details:
            return jsonify({"error": "details is required for this step"}), 400
        if len(details) > MAX_DETAILS_LENGTH:
            return jsonify({"error": f"details is too long (max {MAX_DETAILS_LENGTH} characters)"}), 400
        answers["details"] = details
        ChatSession.append_turn(session_id, "customer", details)
    else:
        if not option_id:
            return jsonify({"error": "option_id is required"}), 400
        option_label = get_option_label(current_step, option_id)
        if not option_label:
            return jsonify({"error": "Invalid option for current step"}), 400
        answers[current_step] = option_id
        ChatSession.append_turn(session_id, "customer", option_label)

    next_step = step_config.get("next_step")
    if next_step == "review":
        review = _review_payload(answers)
        review_message = (
            f"Thanks. I categorized this as '{review['category']}' with "
            f"{review['priority']} priority. Please create the ticket to proceed."
        )
        ChatSession.update_progress(session_id, "review", answers)
        ChatSession.append_turn(session_id, "assistant", review_message)
        return jsonify(
            {
                "session_id": session_id,
                "step": "review",
                "message": review_message,
                "options": [],
                "ready_to_create_ticket": True,
                "review": review,
            }
        ), 200

    next_config = get_step(next_step)
    ChatSession.update_progress(session_id, next_step, answers)
    ChatSession.append_turn(session_id, "assistant", next_config["message"])

    return jsonify(
        {
            "session_id": session_id,
            "step": next_step,
            "message": next_config["message"],
            "options": next_config["options"],
            "ready_to_create_ticket": False,
        }
    ), 200


@support_bp.route("/api/support/create-ticket", methods=["POST"])
def support_create_ticket():
    allowed, retry_after = _check_rate_limit("create_ticket")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    if not session_id:
        return jsonify({"error": "session_id is required"}), 400

    session = ChatSession.get_by_id(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    if session.get("ticket_id"):
        ticket = Ticket.get_customer_status(session["ticket_id"], session.get("customer_email"))
        return jsonify({"message": "Ticket already created", "ticket": ticket}), 200

    answers = dict(session.get("answers") or {})
    required = ["category", "impact", "urgency", "details"]
    missing = [key for key in required if not answers.get(key)]
    if missing:
        return jsonify({"error": f"Missing answers: {', '.join(missing)}"}), 400

    category_label = compute_category(answers["category"])
    priority, severity = compute_priority(answers)
    subject = (data.get("subject") or "").strip() or build_subject(answers)
    if len(subject) > MAX_SUBJECT_LENGTH:
        return jsonify({"error": f"subject is too long (max {MAX_SUBJECT_LENGTH} characters)"}), 400

    transcript = []
    for turn in session.get("transcript") or []:
        speaker = (turn.get("speaker") or "").lower()
        sender = "assistant" if speaker == "assistant" else "customer"
        transcript.append(
            {
                "sender": sender,
                "text": (turn.get("text") or "").strip(),
                "timestamp": turn.get("timestamp"),
            }
        )

    ticket = Ticket.create_from_support(
        company_id=session["company_id"],
        customer_email=session["customer_email"],
        subject=subject,
        transcript=transcript,
        category=category_label,
        severity=severity,
        priority=priority,
        chat_session_id=session["_id"],
    )
    ChatSession.complete(session_id, ticket["_id"])

    return jsonify(
        {
            "message": "Ticket created",
            "ticket": {
                "_id": ticket["_id"],
                "subject": ticket["subject"],
                "status": ticket["status"],
                "category": ticket.get("category"),
                "severity": ticket.get("severity"),
                "priority": ticket.get("priority"),
            },
        }
    ), 201


@support_bp.route("/api/support/ticket-status", methods=["GET"])
def support_ticket_status():
    allowed, retry_after = _check_rate_limit("ticket_status")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    ticket_id = (request.args.get("ticket_id") or "").strip()
    customer_email = (request.args.get("email") or "").strip().lower()

    if not ticket_id:
        return jsonify({"error": "ticket_id is required"}), 400
    if not customer_email:
        return jsonify({"error": "email is required"}), 400
    if len(customer_email) > MAX_EMAIL_LENGTH:
        return jsonify({"error": "email is too long"}), 400
    if not EMAIL_PATTERN.match(customer_email):
        return jsonify({"error": "email format is invalid"}), 400

    ticket = Ticket.get_customer_status(ticket_id, customer_email)
    if not ticket:
        return jsonify({"error": "Ticket not found"}), 404

    messages = ticket.get("messages") or []
    recent_messages = messages[-10:]

    return jsonify(
        {
            "ticket": {
                "_id": ticket.get("_id"),
                "subject": ticket.get("subject"),
                "status": ticket.get("status"),
                "category": ticket.get("category"),
                "severity": ticket.get("severity"),
                "priority": ticket.get("priority"),
                "updated_at": ticket.get("updated_at"),
                "messages": recent_messages,
            }
        }
    ), 200


@support_bp.route("/api/support/ticket-reply", methods=["POST"])
def support_ticket_reply():
    allowed, retry_after = _check_rate_limit("ticket_reply")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    ticket_id = (data.get("ticket_id") or "").strip()
    customer_email = (data.get("email") or "").strip().lower()
    message = (data.get("message") or "").strip()

    if not ticket_id:
        return jsonify({"error": "ticket_id is required"}), 400
    if not customer_email:
        return jsonify({"error": "email is required"}), 400
    if len(customer_email) > MAX_EMAIL_LENGTH:
        return jsonify({"error": "email is too long"}), 400
    if not EMAIL_PATTERN.match(customer_email):
        return jsonify({"error": "email format is invalid"}), 400
    if not message:
        return jsonify({"error": "message is required"}), 400
    if len(message) > MAX_REPLY_LENGTH:
        return jsonify({"error": f"message is too long (max {MAX_REPLY_LENGTH} characters)"}), 400

    updated, err = Ticket.customer_reply(ticket_id, customer_email, message)
    if err == "resolved":
        return jsonify({"error": "Ticket is resolved. Re-open the ticket to reply."}), 409
    if err == "not_found" or not updated:
        return jsonify({"error": "Ticket not found"}), 404

    return jsonify({"message": "Reply sent", "ticket": updated}), 200


@support_bp.route("/api/support/ticket-reopen", methods=["POST"])
def support_ticket_reopen():
    allowed, retry_after = _check_rate_limit("ticket_reopen")
    if not allowed:
        return jsonify({"error": "Too many requests. Please try again shortly."}), 429, {"Retry-After": str(retry_after)}

    data = request.get_json(silent=True) or {}
    ticket_id = (data.get("ticket_id") or "").strip()
    customer_email = (data.get("email") or "").strip().lower()

    if not ticket_id:
        return jsonify({"error": "ticket_id is required"}), 400
    if not customer_email:
        return jsonify({"error": "email is required"}), 400
    if len(customer_email) > MAX_EMAIL_LENGTH:
        return jsonify({"error": "email is too long"}), 400
    if not EMAIL_PATTERN.match(customer_email):
        return jsonify({"error": "email format is invalid"}), 400

    updated, err = Ticket.customer_reopen(ticket_id, customer_email)
    if err == "not_found" or not updated:
        return jsonify({"error": "Ticket not found"}), 404

    return jsonify({"message": "Ticket reopened", "ticket": updated}), 200
