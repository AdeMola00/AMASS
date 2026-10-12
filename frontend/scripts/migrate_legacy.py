#!/usr/bin/env python3
"""Mechanically convert a legacy light-only RN file to theme-aware styles.

- Drops `colors` from the `constants/theme` import, adds useLegacyColors import
- `const styles = StyleSheet.create({` -> `const makeStyles = (colors: LegacyColors) => StyleSheet.create({`
- In every top-level function component whose body references `styles.` or
  `colors.`, injects `const colors = useLegacyColors(); const styles = useMemo(...)`
- `backgroundColor: "#fff"` inside the stylesheet -> colors.surface

Usage: migrate_legacy.py <file> [--dry]
Prints the component names it touched so the operator can review.
"""
import re
import sys

path = sys.argv[1]
dry = "--dry" in sys.argv
src = open(path).read()
orig = src

# 1. imports
m = re.search(r'import \{([^}]*)\} from "(@/src/constants/theme|\.{1,2}/(?:\.\./)*src/constants/theme)";', src)
if not m:
    print("NO legacy import found", path)
    sys.exit(1)
names = [n.strip() for n in m.group(1).split(",") if n.strip()]
had_colors = "colors" in names
names = [n for n in names if n != "colors"]
if names:
    new_import = f'import {{ {", ".join(names)} }} from "{m.group(2)}";'
else:
    new_import = ""
src = src[: m.start()] + new_import + src[m.end():]

uses_memo = "useMemo" in src
# react import
rm = re.search(r'^import React(?:,\s*\{([^}]*)\})? from "react";', src, re.M)
if rm:
    hooks = [h.strip() for h in (rm.group(1) or "").split(",") if h.strip()]
    if "useMemo" not in hooks:
        hooks.append("useMemo")
    src = src[: rm.start()] + f'import React, {{ {", ".join(hooks)} }} from "react";' + src[rm.end():]
else:
    rm2 = re.search(r'^import \{([^}]*)\} from "react";', src, re.M)
    if rm2:
        hooks = [h.strip() for h in rm2.group(1).split(",") if h.strip()]
        if "useMemo" not in hooks:
            hooks.append("useMemo")
        src = src[: rm2.start()] + f'import {{ {", ".join(hooks)} }} from "react";' + src[rm2.end():]
    else:
        src = 'import { useMemo } from "react";\n' + src

if "useLegacyColors" not in src:
    # insert after the last import line
    lines = src.split("\n")
    last_import = max(i for i, l in enumerate(lines) if l.startswith("import ") or l.startswith("} from "))
    lines.insert(last_import + 1, 'import { useLegacyColors, type LegacyColors } from "@/src/theme/legacy";')
    src = "\n".join(lines)

# 2. stylesheet -> factory
count_styles = len(re.findall(r"^const styles = StyleSheet\.create\(\{", src, re.M))
if count_styles != 1:
    print(f"WARN: found {count_styles} StyleSheet.create blocks named styles in {path}")
src = re.sub(r"^const styles = StyleSheet\.create\(\{", "const makeStyles = (colors: LegacyColors) =>\n  StyleSheet.create({", src, flags=re.M)

# 3. white bg inside the factory -> surface
fs = src.find("const makeStyles = (colors: LegacyColors)")
if fs >= 0:
    head, tail = src[:fs], src[fs:]
    tail = re.sub(r'backgroundColor: "#(?:fff|FFF|FFFFFF|ffffff)"', "backgroundColor: colors.surface", tail)
    src = head + tail

# 4. inject hooks into components
INJECT = "  const colors = useLegacyColors();\n  const styles = useMemo(() => makeStyles(colors), [colors]);\n"
touched = []

def find_body_start(s, start_idx):
    """Given index of a function signature start, return index right after the body's opening brace."""
    i = start_idx
    depth = 0
    seen_paren = False
    while i < len(s):
        c = s[i]
        if c == "(":
            depth += 1
            seen_paren = True
        elif c == ")":
            depth -= 1
        elif c == "{" and seen_paren and depth == 0:
            return i + 1
        i += 1
    return -1

def body_end(s, open_idx):
    depth = 1
    i = open_idx
    while i < len(s) and depth > 0:
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
        i += 1
    return i

pattern = re.compile(
    r"^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*(<[^>]*>)?\s*\(|"
    r"^(?:export\s+)?const\s+([A-Z]\w*)\s*(?::\s*[^=]+)?=\s*(?:React\.)?(?:memo|forwardRef)?[<(]*\s*(?:function\s*\w*\s*)?\(|"
    r"^(?:export\s+)?const\s+([A-Z]\w*)\s*=\s*\(",
    re.M,
)
offset = 0
for mm in list(pattern.finditer(src)):
    name = mm.group(1) or mm.group(3) or mm.group(5)
    sig_start = mm.start() + offset
    # Locate the arrow or brace
    bstart = find_body_start(src, sig_start)
    if bstart < 0:
        continue
    # for arrow functions, find_body_start stops at first "{" after params at depth 0 -> that's "=> {" body or an object literal; check preceding "=>"
    pre = src[sig_start:bstart]
    if "=>" not in pre and not re.search(r"function", pre):
        continue
    bend = body_end(src, bstart)
    body = src[bstart:bend]
    if ("styles." not in body) and ("colors." not in body):
        continue
    if "useLegacyColors()" in body[:400]:
        continue
    # skip non-component (lowercase handled by regex requiring capital)
    src = src[:bstart] + "\n" + INJECT + src[bstart:]
    offset += len(INJECT) + 1
    touched.append(name)

if dry:
    print("WOULD TOUCH:", touched)
else:
    open(path, "w").write(src)
    print(f"{path}: had_colors={had_colors} touched={touched}")
