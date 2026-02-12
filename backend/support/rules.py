FLOW_STEPS = {
    "category": {
        "message": "Tell us what type of issue you are facing.",
        "options": [
            {"id": "login", "label": "Login / Access"},
            {"id": "payment", "label": "Payment / Billing"},
            {"id": "bug", "label": "App Bug / Error"},
            {"id": "feature", "label": "Feature Request"},
            {"id": "other", "label": "Other"},
        ],
        "next_step": "impact",
    },
    "impact": {
        "message": "How much is this affecting you right now?",
        "options": [
            {"id": "blocked", "label": "Completely blocked"},
            {"id": "degraded", "label": "Partially working"},
            {"id": "minor", "label": "Minor issue"},
        ],
        "next_step": "urgency",
    },
    "urgency": {
        "message": "When do you need this resolved?",
        "options": [
            {"id": "immediate", "label": "Immediately"},
            {"id": "today", "label": "Today"},
            {"id": "this_week", "label": "Within this week"},
        ],
        "next_step": "details",
    },
    "details": {
        "message": "Add a short description to help the support team.",
        "options": [],
        "next_step": "review",
    },
}

IMPACT_SCORE = {"blocked": 3, "degraded": 2, "minor": 1}
URGENCY_SCORE = {"immediate": 3, "today": 2, "this_week": 1}


def get_step(step_key):
    return FLOW_STEPS.get(step_key)


def get_option_label(step_key, option_id):
    step = FLOW_STEPS.get(step_key) or {}
    for option in step.get("options", []):
        if option["id"] == option_id:
            return option["label"]
    return None


def compute_category(category_answer):
    mapping = {
        "login": "Login & Access",
        "payment": "Billing & Payments",
        "bug": "Product Bug",
        "feature": "Feature Request",
        "other": "General Inquiry",
    }
    return mapping.get(category_answer, "General Inquiry")


def compute_priority(answers):
    category = answers.get("category")
    impact = answers.get("impact")
    urgency = answers.get("urgency")

    score = IMPACT_SCORE.get(impact, 1) + URGENCY_SCORE.get(urgency, 1)
    if category in {"payment", "login"}:
        score += 1
    if category == "feature":
        score -= 1

    if score >= 6:
        return "high", "high"
    if score >= 4:
        return "normal", "medium"
    return "low", "low"


def build_subject(answers):
    category_label = compute_category(answers.get("category"))
    detail = (answers.get("details") or "").strip()
    if detail:
        short = detail[:55] + ("..." if len(detail) > 55 else "")
        return f"{category_label}: {short}"
    return f"{category_label} issue"
