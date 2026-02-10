from datetime import datetime
from models.db import db

ticket_collection = db["tickets"]

class Ticket:
    @staticmethod
    def create(company_id, subject, customer_email, message):
        ticket = {
            "company_id": company_id,
            "subject": subject,
            "customer_email": customer_email,
            "messages": [
                {
                    "sender": "customer",
                    "text": message,
                    "timestamp": datetime.utcnow()
                }
            ],
            "status": "open",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        ticket_collection.insert_one(ticket)
        return ticket

    @staticmethod
    def get_by_company(company_id):
        return list(ticket_collection.find(
            {"company_id": company_id},
            {"_id": 0}
        ))

    @staticmethod
    def get_by_id(ticket_id, company_id):
        return ticket_collection.find_one(
            {"_id": ticket_id, "company_id": company_id},
            {"_id": 0}
        )

    @staticmethod
    def reply(ticket_id, company_id, message):
        ticket_collection.update_one(
            {"_id": ticket_id, "company_id": company_id},
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

    @staticmethod
    def resolve(ticket_id, company_id):
        ticket_collection.update_one(
            {"_id": ticket_id, "company_id": company_id},
            {
                "$set": {
                    "status": "resolved",
                    "updated_at": datetime.utcnow()
                }
            }
        )
