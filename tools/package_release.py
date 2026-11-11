#!/usr/bin/env python3
"""Validate artifacts from reusable workflows; create release ZIPs and notes."""
import argparse
from pathlib import Path
import re
import sys
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("--tag", required=True)
parser.add_argument("--run-number", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
version = (root / "VERSION").read_text(encoding="utf-8").strip()
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) or args.tag != f"v{version}":
    sys.exit(f"Refusing release: tag {args.tag!r} does not match VERSION {version!r}")
if not re.fullmatch(r"[0-9]+", args.run_number):
    sys.exit("Invalid run number")

out = root / "release-assets"
out.mkdir(exist_ok=True)
expected = {
    "aarch64": "midi-monitor.so",
    "windows-x64": "midi-monitor.dll",
    "linux-x64": "midi-monitor.so",
}
for platform, binary in expected.items():
    name = f"v{version}-pistomp-midi-probe-{platform}-{args.run_number}"
    stage = root / "downloaded" / name
    bundle = stage / "pistomp-midi-probe.lv2"
    if not bundle.is_dir():
        sys.exit(f"Missing staged LV2 bundle: {bundle}")
    for filename in (binary, "manifest.ttl", "monitor.ttl", "modgui/icon.html",
                     "modgui/javascript.js", "modgui/stylesheet.css",
                     "modgui/screenshot.png", "modgui/thumbnail.png"):
        if not (bundle / filename).is_file():
            sys.exit(f"Missing {filename} in {name}")
    ttl = (bundle / "monitor.ttl").read_text(encoding="utf-8")
    if f'doap:revision "{version}"' not in ttl:
        sys.exit(f"Version mismatch in {name}/monitor.ttl")
    if 'https://github.com/tothoseofus/Mod-Midi-Monitor-LV2' not in ttl:
        sys.exit(f"Unexpected plugin URI in {name}")
    zip_path = out / f"{name}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for entry in sorted(bundle.rglob("*")):
            if entry.is_file():
                archive.write(entry, entry.relative_to(stage))
    with zipfile.ZipFile(zip_path) as archive:
        if archive.testzip() is not None:
            sys.exit(f"Invalid ZIP: {zip_path}")
    print(f"Prepared {zip_path.name}")

changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
pattern = rf"(?ms)^## \[\s*{re.escape(version)}\s*\].*?(?=^## \[|\Z)"
match = re.search(pattern, changelog)
if not match:
    sys.exit(f"No changelog entry found for {version}")
(out / "RELEASE_NOTES.md").write_text(match.group().strip() + "\n", encoding="utf-8")
print("Prepared release notes from CHANGELOG.md")
