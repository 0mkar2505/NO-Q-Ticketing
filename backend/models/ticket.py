from datetime import datetime, timedelta, timezone
from bson import ObjectId
from models.db import db

ticket_collection = db["tickets"]

class Ticket:
    @staticmethod
    def _coerce_company_id(company_id):
        """
        JWT payloads carry company_id as a string, while Mongo may store it as an ObjectId.
        Keep reads compatible with both and writes consistent (ObjectId when possible).
        """
        try:
            return ObjectId(company_id)
        except Exception:
            return company_id

    @staticmethod
    def _company_id_filters(company_id):
        coerced = Ticket._coerce_company_id(company_id)
        # Support legacy string-stored company_id docs as well.
        if isinstance(coerced, ObjectId):
            return {"$in": [coerced, str(coerced)]}
        return coerced

    @staticmethod
    def _coerce_object_id(ticket_id):
        try:
            return ObjectId(ticket_id)
        except Exception:
            return ticket_id

    @staticmethod
    def _serialize(ticket):
        if not ticket:
            return None
        data = dict(ticket)
        if "_id" in data:
            data["_id"] = str(data["_id"])
        # Prevent Flask JSON serialization errors (ObjectId is not JSON serializable).
        if "company_id" in data and isinstance(data["company_id"], ObjectId):
            data["company_id"] = str(data["company_id"])
        if "chat_session_id" in data and isinstance(data["chat_session_id"], ObjectId):
            data["chat_session_id"] = str(data["chat_session_id"])
        return data

    @staticmethod
    def _coerce_datetime(value):
        if isinstance(value, datetime):
            if value.tzinfo:
                return value.astimezone(timezone.utc).replace(tzinfo=None)
            return value
        if isinstance(value, str):
            try:
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                if parsed.tzinfo:
                    return parsed.astimezone(timezone.utc).replace(tzinfo=None)
                return parsed
            except ValueError:
                return None
        return None

    @staticmethod
    def create(company_id, subject, customer_email, message):
        now = datetime.utcnow()
        coerced_company_id = Ticket._coerce_company_id(company_id)
        ticket = {
            "company_id": coerced_company_id,
            "subject": subject,
            "customer_email": customer_email.lower().strip(),
            "messages": [
                {
                    "sender": "customer",
                    "text": message,
                    "timestamp": now
                }
            ],
            "status": "open",
            "ai_summary": None,
            "ai_priority_suggestion": None,
            "ai_meta": None,
            "ai_last_processed_at": None,
            "created_at": now,
            "updated_at": now
        }
        result = ticket_collection.insert_one(ticket)
        ticket["_id"] = str(result.inserted_id)
        return Ticket._serialize(ticket)

    @staticmethod
    def create_from_support(company_id, customer_email, subject, transcript, category, severity, priority, chat_session_id=None):
        now = datetime.utcnow()
        coerced_company_id = Ticket._coerce_company_id(company_id)
        ticket = {
            "company_id": coerced_company_id,
            "subject": subject,
            "customer_email": customer_email.lower().strip(),
            "messages": transcript or [],
            "status": "open",
            "category": category,
            "severity": severity,
            "priority": priority,
            "source": "customer_assistant",
            "chat_session_id": chat_session_id,
            "ai_summary": None,
            "ai_priority_suggestion": None,
            "ai_meta": None,
            "ai_last_processed_at": None,
            "created_at": now,
            "updated_at": now,
        }
        result = ticket_collection.insert_one(ticket)
        ticket["_id"] = str(result.inserted_id)
        return Ticket._serialize(ticket)

    @staticmethod
    def get_by_company(company_id):
        tickets = ticket_collection.find(
            {"company_id": Ticket._company_id_filters(company_id)}
        ).sort("updated_at", -1)
        return [Ticket._serialize(ticket) for ticket in tickets]

    @staticmethod
    def get_by_id(ticket_id, company_id):
        ticket = ticket_collection.find_one(
            {"_id": Ticket._coerce_object_id(ticket_id), "company_id": Ticket._company_id_filters(company_id)}
        )
        return Ticket._serialize(ticket)

    @staticmethod
    def reply(ticket_id, company_id, message):
        ticket = ticket_collection.find_one(
            {"_id": Ticket._coerce_object_id(ticket_id), "company_id": Ticket._company_id_filters(company_id)}
        )
        if not ticket:
            return False, "not_found"

        if ticket.get("status") == "resolved":
            return False, "already_resolved"

        result = ticket_collection.update_one(
            {"_id": ticket["_id"], "company_id": Ticket._company_id_filters(company_id)},
            {
                "$push": {
                    "messages": {
                        "sender": "client",
                        "text": message,
                        "timestamp": datetime.utcnow()
                    }
                },
                "$set": {"updated_at": datetime.utcnow()}
            }
        )
        return result.modified_count == 1, None

    @staticmethod
    def resolve(ticket_id, company_id):
        ticket = ticket_collection.find_one(
            {"_id": Ticket._coerce_object_id(ticket_id), "company_id": Ticket._company_id_filters(company_id)}
        )
        if not ticket:
            return False, "not_found"

        if ticket.get("status") == "resolved":
            return False, "already_resolved"

        result = ticket_collection.update_one(
            {"_id": ticket["_id"], "company_id": Ticket._company_id_filters(company_id)},
            {
                "$set": {
                    "status": "resolved",
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count == 1, None

    @staticmethod
    def get_analytics(company_id):
        now = datetime.utcnow()
        start_date = (now - timedelta(days=6)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_keys = [(start_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(7)]
        volume_map = {key: 0 for key in day_keys}

        tickets = list(ticket_collection.find({"company_id": Ticket._company_id_filters(company_id)}))
        total_tickets = len(tickets)
        status_counts = {"open": 0, "pending": 0, "resolved": 0}
        resolved_tickets = 0
        tickets_this_week = 0
        reopened_tickets = 0
        response_total_minutes = 0
        response_sample_size = 0
        categories = {}

        for ticket in tickets:
            status = (ticket.get("status") or "open").lower()
            if status in status_counts:
                status_counts[status] += 1
            if status == "resolved":
                resolved_tickets += 1

            created_at = Ticket._coerce_datetime(ticket.get("created_at"))
            if created_at:
                created_key = created_at.strftime("%Y-%m-%d")
                if created_key in volume_map:
                    volume_map[created_key] += 1
                    tickets_this_week += 1

            if ticket.get("reopened_count"):
                reopened_tickets += int(ticket.get("reopened_count", 0))

            category = (ticket.get("category") or "Uncategorized").strip()
            categories[category] = categories.get(category, 0) + 1

            messages = ticket.get("messages") or []
            first_customer_time = None
            first_client_time = None

            for message in messages:
                sender = (message.get("sender") or "").lower()
                timestamp = Ticket._coerce_datetime(message.get("timestamp"))
                if not timestamp:
                    continue
                if sender == "customer" and first_customer_time is None:
                    first_customer_time = timestamp
                if sender == "client" and first_customer_time:
                    if timestamp >= first_customer_time:
                        first_client_time = timestamp
                        break

            if first_customer_time and first_client_time:
                delta_minutes = (first_client_time - first_customer_time).total_seconds() / 60
                if delta_minutes >= 0:
                    response_total_minutes += delta_minutes
                    response_sample_size += 1

        if total_tickets > 0:
            resolution_rate = round((resolved_tickets / total_tickets) * 100)
        else:
            resolution_rate = 0

        if response_sample_size > 0:
            avg_response_minutes = round(response_total_minutes / response_sample_size)
        else:
            avg_response_minutes = None

        top_categories = [
            {"name": name, "count": count}
            for name, count in sorted(categories.items(), key=lambda item: item[1], reverse=True)[:5]
        ]

        volume_last_7_days = [
            {"date": day, "count": volume_map[day]}
            for day in day_keys
        ]

        return {
            "summary": {
                "tickets_this_week": tickets_this_week,
                "avg_response_minutes": avg_response_minutes,
                "resolution_rate": resolution_rate,
                "reopened_tickets": reopened_tickets
            },
            "status_distribution": status_counts,
            "volume_last_7_days": volume_last_7_days,
            "top_categories": top_categories,
            "team_performance": []
        }

    @staticmethod
    def update_ai_assist(ticket_id, company_id, ai_assist):
        ticket = ticket_collection.find_one(
            {"_id": Ticket._coerce_object_id(ticket_id), "company_id": Ticket._company_id_filters(company_id)}
        )
        if not ticket:
            return None, "not_found"

        now = datetime.utcnow()
        ticket_collection.update_one(
            {"_id": ticket["_id"], "company_id": Ticket._company_id_filters(company_id)},
            {
                "$set": {
                    "ai_summary": ai_assist.get("ai_summary"),
                    "ai_priority_suggestion": ai_assist.get("ai_priority_suggestion"),
                    "ai_meta": ai_assist.get("ai_meta"),
                    "ai_last_processed_at": now,
                    "updated_at": now,
                }
            }
        )

        updated = ticket_collection.find_one({"_id": ticket["_id"], "company_id": Ticket._company_id_filters(company_id)})
        return Ticket._serialize(updated), None

    @staticmethod
    def get_customer_status(ticket_id, customer_email):
        ticket = ticket_collection.find_one(
            {
                "_id": Ticket._coerce_object_id(ticket_id),
                "customer_email": (customer_email or "").strip().lower(),
            }
        )
        return Ticket._serialize(ticket)

    @staticmethod
    def customer_reply(ticket_id, customer_email, message):
        ticket = ticket_collection.find_one(
            {
                "_id": Ticket._coerce_object_id(ticket_id),
                "customer_email": (customer_email or "").strip().lower(),
            }
        )
        if not ticket:
            return None, "not_found"

        if (ticket.get("status") or "").lower() == "resolved":
            return None, "resolved"

        now = datetime.utcnow()
        update = {
            "$push": {
                "messages": {
                    "sender": "customer",
                    "text": message,
                    "timestamp": now,
                }
            },
            "$set": {"updated_at": now},
        }

        ticket_collection.update_one({"_id": ticket["_id"]}, update)
        updated = ticket_collection.find_one({"_id": ticket["_id"]})
        return Ticket._serialize(updated), None

    @staticmethod
    def customer_reopen(ticket_id, customer_email):
        ticket = ticket_collection.find_one(
            {
                "_id": Ticket._coerce_object_id(ticket_id),
                "customer_email": (customer_email or "").strip().lower(),
            }
        )
        if not ticket:
            return None, "not_found"

        if (ticket.get("status") or "").lower() != "resolved":
            # Idempotent: if it's already open/pending, just return it.
            return Ticket._serialize(ticket), None

        now = datetime.utcnow()
        ticket_collection.update_one(
            {"_id": ticket["_id"]},
            {
                "$set": {"status": "open", "updated_at": now},
                "$inc": {"reopened_count": 1},
            },
        )
        updated = ticket_collection.find_one({"_id": ticket["_id"]})
        return Ticket._serialize(updated), None
