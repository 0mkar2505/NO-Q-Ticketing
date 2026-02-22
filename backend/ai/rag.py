import re

from models.knowledge import Knowledge


def _tokenize(text):
    words = re.findall(r"[a-z0-9]{3,}", (text or "").lower())
    # De-dupe but keep order-ish.
    seen = set()
    out = []
    for w in words:
        if w in seen:
            continue
        seen.add(w)
        out.append(w)
    return out


def retrieve_snippets(company_id, query, k=4, limit=120):
    """
    MVP retrieval:
    - load a bounded number of tenant knowledge entries
    - score by keyword overlap (title/tags weighted higher than content)
    """
    tokens = _tokenize(query)
    if not tokens:
        return []

    entries = Knowledge.list(company_id, query=None, limit=limit)
    scored = []
    for e in entries:
        title = (e.get("title") or "").lower()
        content = (e.get("content") or "").lower()
        tags = " ".join(e.get("tags") or []).lower()

        score = 0
        for t in tokens:
            if t in title:
                score += 4
            if t in tags:
                score += 3
            if t in content:
                score += 1

        if score <= 0:
            continue

        scored.append((score, e))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    out = []
    for score, e in scored[: max(1, int(k))]:
        content = (e.get("content") or "").strip()
        # Give the model a bit more grounding context without overloading the prompt.
        if len(content) > 900:
            content = content[:900] + "..."
        out.append(
            {
                "id": e.get("_id"),
                "title": e.get("title") or "",
                "tags": e.get("tags") or [],
                "content": content,
                "score": score,
            }
        )
    return out
