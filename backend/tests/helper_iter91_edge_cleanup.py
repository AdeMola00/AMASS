# Iter91 helper: edge probe (deactivated-agency member) + cleanup of @amass-qa.africa test data
import os, sys, uuid, asyncio, requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
API = os.environ["EXPO_BACKEND_URL"].rstrip("/") + "/api"


def H(t): return {"Authorization": f"Bearer {t}"}


def tok(e, p): return requests.post(f"{API}/auth/login", json={"email": e, "password": p}).json()["access_token"]


def reg(tag):
    e = f"qa91_{tag}_{uuid.uuid4().hex[:6]}@amass-qa.africa"
    r = requests.post(f"{API}/auth/register", json={"email": e, "password": "Test1234!", "full_name": "QA91 " + tag}).json()
    return e, r["access_token"]


def edge():
    demo = tok("demo@amass.africa", "amass2026")
    oe, ot = reg("edgeowner")
    ae, at = reg("edgeagent")
    a = requests.post(f"{API}/admin/agencies", headers=H(demo), json={"name": "QA91 Edge", "owner_email": oe}).json()
    inv = requests.post(f"{API}/agency/invites", headers=H(ot), json={"email": ae, "role": "agent"}).json()
    print("accept", requests.post(f"{API}/agency/invites/{inv['id']}/accept", headers=H(at)).status_code)
    print("deactivate", requests.patch(f"{API}/admin/agencies/{a['id']}", headers=H(demo), json={"status": "inactive"}).status_code)
    print("agent /me agency:", requests.get(f"{API}/agency/me", headers=H(at)).json()["agency"])
    r = requests.post(f"{API}/agency/leave", headers=H(at)); print("agent leave:", r.status_code, r.text[:100])
    r = requests.post(f"{API}/agency/invites", headers=H(demo), json={"email": ae, "role": "agent"}); print("demo invites stuck agent:", r.status_code, r.text[:120])
    r = requests.post(f"{API}/admin/agencies", headers=H(demo), json={"name": "QA91 Edge2", "owner_email": ae}); print("admin create w/ stuck agent as owner:", r.status_code, r.text[:120])
    # duplicate invite across agencies? invite a user with pending invite elsewhere -> allowed
    # 6 work photos on PUT
    r = requests.put(f"{API}/fixa/me", headers=H(at), json={"business_name": "xx", "categories": ["Plumbing"], "city": "Lagos", "phone": "08031234567", "work_photos": ["https://x/%d" % i for i in range(6)]})
    print("PUT 6 photos (no profile):", r.status_code)
    r = requests.post(f"{API}/fixa/apply", headers=H(at), json={"business_name": "xx", "categories": ["Plumbing"], "city": "Lagos", "phone": "08031234567", "work_photos": ["not-a-url", "data:image/png;base64,AAAA"]})
    print("apply with non-url photos:", r.status_code, (r.json().get("work_photos") if r.status_code == 201 else r.text[:100]))


async def cleanup():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    users = await db.users.find({"email": {"$regex": "@amass-qa\\.africa$"}}, {"_id": 0, "id": 1, "email": 1}).to_list(5000)
    ids = [u["id"] for u in users]; emails = [u["email"] for u in users]
    ag = await db.agencies.find({"owner_id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(1000)
    ag_ids = [a["id"] for a in ag]
    svc = await db.marketplace.find({"seller_id": {"$in": ids}}, {"_id": 0, "id": 1}).to_list(1000)
    print("users", len(ids), "agencies", len(ag_ids), "services", len(svc))
    print("members", (await db.agency_members.delete_many({"$or": [{"user_id": {"$in": ids}}, {"email": {"$regex": "@amass-qa\\.africa$"}}, {"agency_id": {"$in": ag_ids}}]})).deleted_count)
    print("agencies", (await db.agencies.delete_many({"id": {"$in": ag_ids}})).deleted_count)
    print("notifs", (await db.notifications.delete_many({"user_id": {"$in": ids}})).deleted_count)
    print("market", (await db.marketplace.delete_many({"seller_id": {"$in": ids}})).deleted_count)
    print("wallets", (await db.wallets.delete_many({"user_id": {"$in": ids}})).deleted_count)
    print("users", (await db.users.delete_many({"id": {"$in": ids}})).deleted_count)
    # restore: demo leads no longer assigned to anyone off-team
    demo = await db.users.find_one({"email": "demo@amass.africa"}, {"_id": 0, "id": 1})
    print("leads assigned to deleted users reset", (await db.lead_unlocks.update_many({"assigned_to": {"$in": ids}}, {"$set": {"assigned_to": None}})).modified_count)
    da = await db.agencies.find_one({"name": "AMASS Demo Realty"}, {"_id": 0, "id": 1})
    mem = await db.agency_members.find({"agency_id": da["id"], "status": {"$in": ["active", "invited"]}}, {"_id": 0, "email": 1, "role": 1, "status": 1}).to_list(20)
    print("demo realty members:", mem)


if __name__ == "__main__":
    if "edge" in sys.argv: edge()
    if "cleanup" in sys.argv: asyncio.run(cleanup())
