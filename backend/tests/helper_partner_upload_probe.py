# Probe: /api/partner/upload repeat + different image per account (object storage 500 investigation)
import base64, os, random, struct, zlib, requests

B = os.environ["EXPO_BACKEND_URL"].rstrip("/")


def png(seed):
    raw = b"\x00" + bytes([seed % 256, random.randint(0, 255), 7])
    def ch(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


SAME = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
for email, pw in [("adaeze.okoye@amass.africa", "Agent2026!"), ("seller.demo@amass.africa", "Partner2026!")]:
    tok = requests.post(f"{B}/api/auth/login", json={"email": email, "password": pw}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    for label, b64 in [("same-png", SAME), ("rand-png", base64.b64encode(png(random.randint(0, 999))).decode()), ("same-png-again", SAME)]:
        r = requests.post(f"{B}/api/partner/upload", json={"data_url": "data:image/png;base64," + b64}, headers=h)
        print(email.split("@")[0], label, r.status_code, r.text[:120], "ACAO:", r.headers.get("access-control-allow-origin"))
