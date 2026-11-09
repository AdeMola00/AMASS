# Helper for iteration 90: snapshot / restore a user's unread notification ids (used around the UI mark-all-read test).
import json
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
mode, email = sys.argv[1], sys.argv[2]
path = f"/tmp/unread_{email}.json"
uid = db.users.find_one({"email": email}, {"id": 1})["id"]
if mode == "snap":
    ids = [d["id"] for d in db.notifications.find({"user_id": uid, "read": False}, {"id": 1})]
    json.dump(ids, open(path, "w"))
    print("snapshot unread", len(ids))
else:
    ids = json.load(open(path))
    r = db.notifications.update_many({"id": {"$in": ids}}, {"$set": {"read": False}, "$unset": {"read_at": ""}})
    print("restored", r.modified_count, "of", len(ids))
