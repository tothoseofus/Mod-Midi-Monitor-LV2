#!/usr/bin/env python3
"""Synchronise LV2 metadata with VERSION; fail if the Git tag disagrees.

Run at build time from the repository root. Intended for Python 3 standard library.
"""

import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
match = re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version)
if not match:
    sys.exit(f"Invalid VERSION {version!r}; expected MAJOR.MINOR.PATCH")
major, minor, patch = map(int, match.groups())
# LV2's lv2:minorVersion is the numeric minor release and lv2:microVersion
# is the numeric patch level. MAJOR is preserved as the full doap:revision.
if major != 0:
    print("Note: LV2 minor/micro fields expose MINOR.PATCH; doap:revision contains full SemVer.")
if os.environ.get("GITHUB_REF_TYPE") == "tag":
    tag = os.environ.get("GITHUB_REF_NAME", "")
    if tag != "v" + version:
        sys.exit(f"Tag {tag!r} does not match VERSION v{version}; update VERSION first")

file = ROOT / "monitor.ttl"
source = file.read_text(encoding="utf-8")
# Remove the exact version predicates previously added by this script. Avoid
# changing existing port data or any unrelated Turtle statements.
source = re.sub(r"(?m)^    (?:lv2:minorVersion|lv2:microVersion|doap:revision) [^\n]* ;\n", "", source)
anchor = '    doap:license <https://spdx.org/licenses/GPL-3.0-or-later.html> ;\n'
if source.count(anchor) != 1:
    sys.exit("Cannot find unique metadata insertion point in monitor.ttl")
source = source.replace(anchor, anchor +
    f'    doap:revision "{version}" ;\n'
    f'    lv2:minorVersion {minor} ;\n'
    f'    lv2:microVersion {patch} ;\n', 1)
file.write_text(source, encoding="utf-8")
print(f"Stamped {file.relative_to(ROOT)}: version {version}, LV2 minor={minor}, micro={patch}")
