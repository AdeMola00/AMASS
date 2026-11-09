"""Static check: every router.push/replace/href target must map to a file in app/."""
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
APP = os.path.join(ROOT, "app")

# Build set of route patterns from files
routes = []
for dirpath, _, files in os.walk(APP):
    for f in files:
        if not f.endswith(".tsx") or f.startswith("_") or f.startswith("+"):
            continue
        rel = os.path.relpath(os.path.join(dirpath, f), APP)[:-4]
        segs = [s for s in rel.split(os.sep) if not (s.startswith("(") and s.endswith(")"))]
        if segs and segs[-1] == "index":
            segs = segs[:-1]
        routes.append(segs)


def matches(path):
    segs = [s for s in path.strip("/").split("/") if s]
    for r in routes:
        if len(r) != len(segs):
            continue
        ok = True
        for a, b in zip(r, segs):
            if a.startswith("[") and a.endswith("]"):
                continue
            if a != b:
                ok = False
                break
        if ok:
            return True
    return False


pat = re.compile(r"""(?:router\.(?:push|replace|navigate)\(|href=|pathname:\s*)\s*[{(]?\s*["'`](/[^"'`?]*)""")
missing = {}
for base in ["app", "src"]:
    for dirpath, _, files in os.walk(os.path.join(ROOT, base)):
        for f in files:
            if not f.endswith((".tsx", ".ts")):
                continue
            p = os.path.join(dirpath, f)
            with open(p, encoding="utf-8", errors="ignore") as fh:
                for i, line in enumerate(fh, 1):
                    for m in pat.finditer(line):
                        target = m.group(1)
                        # template literal dynamic segments
                        target = re.sub(r"\$\{[^}]*\}", "[x]", target)
                        if target.startswith("/(tabs)"):
                            pass
                        if not matches(target):
                            missing.setdefault(target, []).append(f"{os.path.relpath(p, ROOT)}:{i}")

if not missing:
    print("All route targets resolve.")
else:
    for t, locs in sorted(missing.items()):
        print(f"MISSING {t}")
        for l in locs[:5]:
            print("   ", l)
