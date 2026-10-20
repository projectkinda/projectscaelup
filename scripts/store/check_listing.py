#!/usr/bin/env python3
"""Checks docs/store/app-store-listing.md against App Store Connect's field limits."""
import re, sys
from pathlib import Path

text = (Path(__file__).resolve().parents[2] / "docs/store/app-store-listing.md").read_text()

def section(title):
    m = re.search(rf"^## {re.escape(title)}.*?\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    return m.group(1).strip() if m else ""

def row(label):
    m = re.search(rf"^\| {re.escape(label)} \| (.*?) \|", text, re.M)
    return m.group(1) if m else ""

checks = [
    ("Subtitle", re.sub(r"^[^A-Za-z]*", "", row("Subtitle")), 30),
    ("Promotional text", section("Promotional text (can be changed without a new build)"), 170),
    ("Description", section("Description"), 4000),
    ("Keywords", section("Keywords (comma-separated, no spaces after commas)"), 100),
    ("What's New", section("What's New (1.0)"), 4000),
]
ok = True
for name, value, limit in checks:
    n = len(value)
    flag = "ok" if 0 < n <= limit else "FAIL"
    ok &= flag == "ok"
    print(f"{name:18} {n:5}/{limit:<5} {flag}")
if "\n" in section("Keywords (comma-separated, no spaces after commas)") or ", " in section("Keywords (comma-separated, no spaces after commas)"):
    print("Keywords: remove spaces after commas"); ok = False
sys.exit(0 if ok else 1)
