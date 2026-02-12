from datetime import datetime
from ai.ai_engine import classify_issue


def _infer_category(text):
    content = (text or "").lower()
    if any(word in content for word in ["login", "password", "signin", "sign in", "access"]):
        return "login"
    if any(word in content for word in ["payment", "invoice", "billing", "charge", "refund"]):
        return "payment"
    if any(word in content for word in ["bug", "error", "crash", "broken"]):
        return "bug"
    return "other"


def _build_summary(subject, messages):
    customer_messages = []
    for message in messages:
        if (message.get("sender") or "").lower() == "customer":
            text = (message.get("text") or "").strip()
            if text:
                customer_messages.append(text)

    if not customer_messages:
        return f"Ticket '{subject}' has no customer message context yet."

    latest = customer_messages[-1]
    latest = latest[:220] + ("..." if len(latest) > 220 else "")
    return f"Customer issue for '{subject}': {latest}"


def generate_ticket_ai_assist(ticket):
    subject = (ticket.get("subject") or "Untitled ticket").strip()
    messages = ticket.get("messages") or []
    combined_text = " ".join((msg.get("text") or "") for msg in messages)

    category = _infer_category(f"{subject} {combined_text}")
    classification = classify_issue(
        {
            "category": category,
            "amount": ticket.get("amount", 0),
            "account_locked": "locked" in combined_text.lower(),
        }
    )

    priority_map = {1: "high", 2: "normal", 3: "low"}
    priority = priority_map.get(classification.get("priority"), "normal")

    return {
        "ai_summary": _build_summary(subject, messages),
        "ai_priority_suggestion": priority,
        "ai_meta": {
            "category": category,
            "severity": classification.get("severity", "LOW"),
            "action": classification.get("action", "AUTO_REPLY"),
            "generated_at": datetime.utcnow().isoformat() + "Z",
        },
    }
