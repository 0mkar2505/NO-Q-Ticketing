import json
import os
import urllib.request
import urllib.error

from dotenv import load_dotenv

from models.client_config import ClientConfig
from ai.rag import retrieve_snippets


CANON_PRIORITIES = {"high", "normal", "low"}
CANON_SEVERITIES = {"critical", "high", "medium", "low"}

_AI_DIR = os.path.dirname(os.path.abspath(__file__))
# Prefer backend/.env (this repo uses backend/.env for server config), but allow root .env too.
load_dotenv(os.path.join(_AI_DIR, "..", ".env"))
load_dotenv()


def _get_llm_config():
    """
    Supports OpenAI-compatible providers (OpenAI, Groq, etc.).
    Environment variables:
      - LLM_PROVIDER: "openai" | "groq" | ...
      - LLM_API_KEY: provider key (preferred)
      - LLM_BASE_URL: OpenAI-compatible base URL, e.g. https://api.groq.com/openai/v1
      - LLM_MODEL: model id
    Backward compatible:
      - OPENAI_API_KEY, OPENAI_MODEL
    """
    provider = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    api_key = (os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
    base_url = (os.getenv("LLM_BASE_URL") or "").strip()
    model = (os.getenv("LLM_MODEL") or os.getenv("OPENAI_MODEL") or "").strip()

    if not base_url:
        if provider == "groq":
            base_url = "https://api.groq.com/openai/v1"
        else:
            base_url = "https://api.openai.com/v1"

    if not model:
        if provider == "groq":
            model = "llama-3.1-8b-instant"
        else:
            model = "gpt-4o-mini"

    return {
        "provider": provider or "openai",
        "api_key": api_key,
        "base_url": base_url.rstrip("/"),
        "model": model,
    }


def _safe_category(value, allowed):
    if not isinstance(value, str):
        return "Other"
    v = value.strip()
    if not v:
        return "Other"
    for a in allowed:
        if v.lower() == str(a).strip().lower():
            return a
    return "Other"


def _safe_enum(value, allowed, fallback):
    v = str(value or "").strip().lower()
    return v if v in allowed else fallback


def _openai_compat_chat_json(base_url, api_key, model, messages, timeout=20):
    endpoint = f"{(base_url or '').rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        # Keep responses short to avoid token/rate limits on free tiers.
        "max_tokens": 320,
        "response_format": {"type": "json_object"},
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            # Groq sits behind Cloudflare and may block urllib's default UA (403 error code: 1010).
            # Use a browser-like UA to avoid false-positive bot/WAF blocks.
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")
        except Exception:
            err_body = ""
        # Some OpenAI-compatible providers don't support response_format.
        # Retry once without it if we detect that kind of error.
        if getattr(e, "code", None) == 400 and "response_format" in err_body:
            payload.pop("response_format", None)
            body = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(
                endpoint,
                data=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {api_key}",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8")
        else:
            raise RuntimeError(f"LLM HTTP {getattr(e, 'code', '?')}: {err_body}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"LLM connection error: {e}") from e
    data = json.loads(raw)
    content = (
        (data.get("choices") or [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    # If response_format isn't supported, the model may return a JSON string (or mixed text).
    if not content:
        return {}
    try:
        return json.loads(content)
    except Exception:
        # Best-effort extraction of first JSON object.
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(content[start : end + 1])
            except Exception:
                return {}
        return {}


def triage_support(company_id, company_name, customer_email, transcript, user_message):
    cfg = ClientConfig.get_by_company(company_id) or {}
    taxonomy = (cfg.get("taxonomy") or {})
    categories = taxonomy.get("categories") or ["Other"]
    if not isinstance(categories, list) or not categories:
        categories = ["Other"]
    if not any(str(c).strip().lower() == "other" for c in categories):
        categories = list(categories) + ["Other"]

    policy_text = str(taxonomy.get("policy_text") or "").strip()

    snippets = retrieve_snippets(company_id, f"{user_message} {company_name}", k=4)

    llm = _get_llm_config()

    # Fallback: no API key configured.
    if not llm["api_key"]:
        return {
            "assistant_message": "Thanks. I can create a ticket now. If you have an error message, paste it here to help the team.",
            "triage": {
                "category": "Other",
                "priority": "normal",
                "severity": "medium",
                "summary": (user_message or "")[:240],
                "recommended_next_steps": [],
                "questions_to_ask": ["What error do you see?", "When did this start?", "What have you tried so far?"],
                "confidence": 0.2,
                "should_create_ticket": True,
                "proposed_subject": "Support request",
            },
            "sources": snippets,
        }

    # Build a compact transcript for the prompt.
    turns = transcript or []
    last_turns = turns[-8:]
    transcript_text = "\n".join(
        f"{(t.get('speaker') or 'unknown')}: {(t.get('text') or '').strip()}"
        for t in last_turns
        if (t.get("text") or "").strip()
    )
    if len(transcript_text) > 1200:
        transcript_text = transcript_text[-1200:]

    # Heuristics to prevent the assistant from endlessly asking for "more context".
    # If the customer has already provided a meaningful description, allow ticket creation.
    customer_turns = [
        t for t in last_turns
        if (t.get("speaker") or "").lower() == "customer" and (t.get("text") or "").strip()
    ]
    combined_customer_text = " ".join((t.get("text") or "") for t in customer_turns).lower()
    has_detail = len(combined_customer_text) >= 80
    mentions_payment = any(k in combined_customer_text for k in ["refund", "charge", "charged", "deducted", "stripe", "payment", "declin", "invoice"])
    allow_create_by_heuristic = len(customer_turns) >= 2 or (has_detail and mentions_payment)

    sources_text = "\n\n".join(
        f"[{i+1}] {s['title']}\nTags: {', '.join(s.get('tags') or [])}\n{s['content']}"
        for i, s in enumerate(snippets)
    ).strip()

    system = (
        "You are a customer support intake assistant for a SaaS helpdesk. "
        "Your job is to ask clarifying questions, classify the issue, and propose a ticket summary. "
        "Use ONLY the provided tenant knowledge snippets as factual ground truth. "
        "If the snippets do not contain an answer, ask questions instead of guessing."
    )

    developer = (
        "Return a single JSON object with these keys:\n"
        "- assistant_message (string)\n"
        "- category (string, must be one of the allowed categories)\n"
        "- priority (high|normal|low)\n"
        "- severity (critical|high|medium|low)\n"
        "- summary (string)\n"
        "- recommended_next_steps (array of strings)\n"
        "- questions_to_ask (array of strings)\n"
        "- confidence (number 0..1)\n"
        "- should_create_ticket (boolean)\n"
        "- proposed_subject (string)\n\n"
        f"Allowed categories: {categories}\n"
        f"Tenant policy notes: {policy_text or '(none)'}\n"
        "Rules:\n"
        "- Do NOT repeat greetings or filler like \"I'm here to help\". Vary wording and be direct.\n"
        "- Do NOT ask the customer to confirm with \"okay\" / \"go ahead\". Ask the next question directly.\n"
        "- If you still need info, ask at most 2 focused questions and set should_create_ticket=false.\n"
        "- If enough info exists, set should_create_ticket=true and do not ask more than 1 optional question.\n"
        "- Keep assistant_message <= 2 sentences.\n"
    )

    user = (
        f"Company: {company_name}\n"
        f"Recent transcript:\n{transcript_text}\n\n"
        f"Tenant knowledge snippets:\n{sources_text or '(none)'}\n\n"
        f"Customer message:\n{user_message}"
    )

    try:
        result = _openai_compat_chat_json(
            base_url=llm["base_url"],
            api_key=llm["api_key"],
            model=llm["model"],
            messages=[
                # Chat Completions expects system/user/assistant roles. Keep policy + schema in system.
                {"role": "system", "content": f"{system}\n\n{developer}"},
                {"role": "user", "content": user},
            ],
            timeout=25,
        )
    except Exception as e:
        # Log for local debugging (do not include secrets).
        print(f"[AI] LLM triage error ({llm['provider']}): {e}")
        result = {}

    if not result:
        return {
            "assistant_message": "AI is temporarily unavailable. I can create a ticket now, and you can add any extra details here if you want.",
            "triage": {
                "category": "Other",
                "priority": "normal",
                "severity": "medium",
                "summary": (user_message or "")[:240],
                "recommended_next_steps": [],
                "questions_to_ask": [],
                "confidence": 0.0,
                "should_create_ticket": True,
                "proposed_subject": "Support request",
            },
            "sources": snippets,
        }

    triage = {
        "category": _safe_category(result.get("category"), categories),
        "priority": _safe_enum(result.get("priority"), CANON_PRIORITIES, "normal"),
        "severity": _safe_enum(result.get("severity"), CANON_SEVERITIES, "medium"),
        "summary": str(result.get("summary") or "").strip()[:800],
        "recommended_next_steps": result.get("recommended_next_steps") if isinstance(result.get("recommended_next_steps"), list) else [],
        "questions_to_ask": result.get("questions_to_ask") if isinstance(result.get("questions_to_ask"), list) else [],
        "confidence": float(result.get("confidence") or 0.0) if str(result.get("confidence") or "").strip() else 0.0,
        "should_create_ticket": bool(result.get("should_create_ticket")),
        "proposed_subject": str(result.get("proposed_subject") or "Support request").strip()[:200],
    }

    # Server-side guardrail: if we already have enough customer detail, allow ticket creation.
    if allow_create_by_heuristic:
        triage["should_create_ticket"] = True
        # Keep questions minimal once we're ready to create.
        if isinstance(triage.get("questions_to_ask"), list) and len(triage["questions_to_ask"]) > 1:
            triage["questions_to_ask"] = triage["questions_to_ask"][:1]

    assistant_message = str(result.get("assistant_message") or "").strip()
    if not assistant_message:
        assistant_message = "Thanks. Can you share a bit more detail so I can create the right ticket?"

    # If we're ready to create, avoid looping language.
    if triage.get("should_create_ticket"):
        assistant_message = "Got it. Press Create Ticket to submit this to support."
        triage["questions_to_ask"] = []

    return {
        "assistant_message": assistant_message,
        "triage": triage,
        "sources": snippets,
    }
