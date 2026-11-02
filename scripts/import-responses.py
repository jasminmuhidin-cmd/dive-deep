"""
Turns the kiosk responses spreadsheet into lib/sample-responses.json — the
stand-in thoughts the mobile dive shows until live data takes over.

    npm run import-responses

Reads components/MobileApp/Kiosk_Worries_Responses.xlsx, sheet "Responses":
ID · Timestamp · Response · Theme (coded) · Perceived distance · Notes · Word count.
Standard library only, so it runs anywhere Python 3 does.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "components/MobileApp/Kiosk_Worries_Responses.xlsx"
OUTPUT = ROOT / "lib/sample-responses.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

# The spreadsheet's coded themes, folded into the app's five categories
THEME_TO_CATEGORY = {
    "Climate & environment": "environment",
    "Housing": "economy",
    "Cost of living": "economy",
    "Homelessness": "economy",
    "Work & the future": "economy",
    "Loneliness & connection": "belonging",
    "Mental health": "belonging",
    "Culture & identity": "belonging",
    "Health & care": "community",
    "Safety": "community",
    "Justice & equity": "community",
    "Democracy & civic life": "community",
    "Polarisation": "community",
    "Conflict & war": "future",
    "Technology & media": "future",
    "Personal responsibility": "future",
}

DISTANCES = {"Personal", "Local", "National", "Global"}


def read_sheet(path: Path, name: str) -> list[list[str | None]]:
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
    workbook = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    targets = {r.get("Id"): r.get("Target") for r in rels}

    for sheet in workbook.find("m:sheets", NS):
        if sheet.get("name") != name:
            continue
        target = targets[sheet.get(f"{{{NS['r']}}}id")].lstrip("/").removeprefix("xl/")
        rows = []
        for row in ET.fromstring(z.read(f"xl/{target}")).iter(f"{{{NS['m']}}}row"):
            cells = {}
            for c in row.findall("m:c", NS):
                v, kind = c.find("m:v", NS), c.get("t")
                if kind == "inlineStr":
                    value = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                elif v is None:
                    continue
                else:
                    value = shared[int(v.text)] if kind == "s" else v.text
                letters = re.match(r"[A-Z]+", c.get("r")).group()
                col = 0
                for ch in letters:
                    col = col * 26 + ord(ch) - 64
                cells[col - 1] = value
            if cells:
                rows.append([cells.get(i) for i in range(max(cells) + 1)])
        return rows
    sys.exit(f'No sheet called "{name}" in {path.name}')


def excel_date(serial: str | None) -> str:
    """Excel stores dates as days since 30 Dec 1899"""
    try:
        moment = datetime(1899, 12, 30, tzinfo=timezone.utc) + timedelta(seconds=round(float(serial) * 86400))
    except (TypeError, ValueError):
        moment = datetime.now(timezone.utc).replace(microsecond=0)
    return moment.isoformat().replace("+00:00", "Z")


def main() -> None:
    rows = read_sheet(SOURCE, "Responses")
    header_at = next(i for i, r in enumerate(rows) if r and r[0] == "ID")
    thoughts = []
    for row in rows[header_at + 1 :]:
        row = (row + [None] * 7)[:7]
        rid, stamp, text, theme, distance = row[:5]
        if not rid or not (text or "").strip():
            continue
        thoughts.append(
            {
                "id": f"sample-{rid}",
                "worry_text": text.strip(),
                "offering_text": "",
                "category": THEME_TO_CATEGORY.get(theme or "", "unspecified"),
                "created_at": excel_date(stamp),
                "is_claimed": 0,
                "anonymous_code": f"QW-{rid}",
                "uncover_count": 0,
                "theme": theme or "",
                "feeling_tag": "",
                "connection_group": "",
                "perceived_distance": distance.lower() if distance in DISTANCES else None,
                "is_sample": True,
            }
        )
    OUTPUT.write_text(json.dumps(thoughts, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(thoughts)} thoughts to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
