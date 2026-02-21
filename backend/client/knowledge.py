from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from models.knowledge import Knowledge


client_knowledge_bp = Blueprint("client_knowledge", __name__)

MAX_TITLE_LEN = 120
MAX_CONTENT_LEN = 8000
MAX_TAG_LEN = 32
MAX_TAGS = 12


def _normalize_tags(tags):
    if tags is None:
        return []
    if not isinstance(tags, list):
        return None
    out = []
    seen = set()
    for t in tags:
        s = str(t or "").strip()
        if not s:
            continue
        if len(s) > MAX_TAG_LEN:
            return None
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
        if len(out) >= MAX_TAGS:
            break
    return out


@client_knowledge_bp.route("/api/client/knowledge", methods=["GET"])
@require_auth(required_role="client")
def list_knowledge():
    q = (request.args.get("q") or "").strip()
    entries = Knowledge.list(request.user["company_id"], query=q, limit=80)
    return jsonify({"entries": entries}), 200


@client_knowledge_bp.route("/api/client/knowledge", methods=["POST"])
@require_auth(required_role="client")
def create_knowledge():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    tags = _normalize_tags(data.get("tags"))

    if not title:
        return jsonify({"error": "title is required"}), 400
    if len(title) > MAX_TITLE_LEN:
        return jsonify({"error": f"title is too long (max {MAX_TITLE_LEN})"}), 400
    if not content:
        return jsonify({"error": "content is required"}), 400
    if len(content) > MAX_CONTENT_LEN:
        return jsonify({"error": f"content is too long (max {MAX_CONTENT_LEN})"}), 400
    if tags is None:
        return jsonify({"error": "tags must be an array of short strings"}), 400

    entry = Knowledge.create(request.user["company_id"], title=title, content=content, tags=tags)
    return jsonify({"entry": entry}), 201


@client_knowledge_bp.route("/api/client/knowledge/<entry_id>", methods=["PATCH"])
@require_auth(required_role="client")
def update_knowledge(entry_id):
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    tags = _normalize_tags(data.get("tags"))

    if not title:
        return jsonify({"error": "title is required"}), 400
    if len(title) > MAX_TITLE_LEN:
        return jsonify({"error": f"title is too long (max {MAX_TITLE_LEN})"}), 400
    if not content:
        return jsonify({"error": "content is required"}), 400
    if len(content) > MAX_CONTENT_LEN:
        return jsonify({"error": f"content is too long (max {MAX_CONTENT_LEN})"}), 400
    if tags is None:
        return jsonify({"error": "tags must be an array of short strings"}), 400

    entry = Knowledge.update(entry_id, request.user["company_id"], title=title, content=content, tags=tags)
    if not entry:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"entry": entry}), 200


@client_knowledge_bp.route("/api/client/knowledge/<entry_id>", methods=["DELETE"])
@require_auth(required_role="client")
def delete_knowledge(entry_id):
    ok = Knowledge.delete(entry_id, request.user["company_id"])
    if not ok:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"message": "Deleted"}), 200

