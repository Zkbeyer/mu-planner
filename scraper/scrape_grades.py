"""
Scrapes MU grade distribution from:
  https://musis1.missouri.edu/gradedist/mu_grade_dist_intro.cfm?search=true&subject=SUBJ

Subject list is pulled from the same catalog index used by scrape_catalog.py.

Verified column layout (13 cols):
  [0] Term      e.g. "FS2025"
  [1] Acad Unit
  [2] Subject   e.g. "CMP_SC"
  [3] Number    e.g. "1000"
  [4] Title
  [5] Section
  [6] Instructor e.g. "Jurczyk,Michael"
  [7] A Range   (count)
  [8] B Range   (count)
  [9] C Range   (count)
  [10] D Range  (count)
  [11] F Range  (count)
  [12] Avg GPA
"""

import re
import time
import logging
from typing import Any

import requests
from bs4 import BeautifulSoup

CATALOG_INDEX = "https://catalog.missouri.edu/courseofferings/"
GRADE_URL     = "https://musis1.missouri.edu/gradedist/mu_grade_dist_intro.cfm"
REQUEST_DELAY = 1.0

log = logging.getLogger(__name__)


def _get_subjects(session: requests.Session) -> list[str]:
    """Return subject codes (e.g. 'CMP_SC') from the catalog index."""
    try:
        resp = session.get(CATALOG_INDEX, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch catalog index: %s", e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    seen: set[str] = set()
    codes: list[str] = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if re.match(r"^/courseofferings/[a-z0-9_]+/?$", href):
            slug = href.strip("/").split("/")[-1]
            code = slug.upper()
            if code not in seen:
                seen.add(code)
                codes.append(code)

    log.info("Found %d subjects", len(codes))
    return codes


def _parse_term(raw: str) -> str:
    """Convert 'FS2025' → 'Fall 2025', 'SP2025' → 'Spring 2025', etc."""
    m = re.match(r"^([A-Z]+)(\d{4})$", raw.strip())
    if not m:
        return raw
    prefix, year = m.group(1), m.group(2)
    season = {"FS": "Fall", "SP": "Spring", "SS": "Spring", "SU": "Summer"}.get(prefix, prefix)
    return f"{season} {year}"


def _normalize_name(raw: str) -> str:
    """Convert 'Last,First' → 'First Last'."""
    if "," in raw:
        last, first = raw.split(",", 1)
        return f"{first.strip()} {last.strip()}"
    return raw.strip()


def _safe_int(val: str) -> int:
    try:
        return int(val.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return 0


def _safe_float(val: str) -> float:
    try:
        return float(val.strip().replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0


def _scrape_subject(session: requests.Session, subject: str) -> list[dict[str, Any]]:
    try:
        resp = session.get(
            GRADE_URL,
            params={"search": "true", "subject": subject},
            timeout=30,
        )
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch grades for %s: %s", subject, e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")

    # Find the data table — pick the one with the most rows
    tables = soup.find_all("table")
    if not tables:
        log.warning("No tables found for subject %s", subject)
        return []

    best = max(tables, key=lambda t: len(t.find_all("tr")))
    rows = best.find_all("tr")

    records: list[dict[str, Any]] = []
    for row in rows:
        cells = [td.get_text(" ", strip=True) for td in row.find_all("td")]
        if len(cells) < 13:
            continue

        term_raw  = cells[0]
        subj_cell = cells[2]
        number    = cells[3]
        instructor = _normalize_name(cells[6]) if cells[6].strip() else "Unknown"

        # Skip header rows
        if subj_cell.upper() in ("SUBJECT", "") or not re.match(r"^\d", number):
            continue

        a = _safe_int(cells[7])
        b = _safe_int(cells[8])
        c = _safe_int(cells[9])
        d = _safe_int(cells[10])
        f = _safe_int(cells[11])
        avg_gpa = _safe_float(cells[12])

        total = a + b + c + d + f
        if total == 0:
            continue

        def pct(n: int) -> float:
            return round(n / total * 100, 1)

        records.append({
            "courseId":  f"{subj_cell}_{number}",
            "term":      _parse_term(term_raw),
            "professor": instructor,
            "avgGPA":    avg_gpa,
            "pctA":      pct(a),
            "pctB":      pct(b),
            "pctC":      pct(c),
            "pctD":      pct(d),
            "pctF":      pct(f),
            "pctW":      0.0,
        })

    log.info("Subject %s: %d records", subject, len(records))
    return records


def scrape(subjects: list[str] | None = None) -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"

    all_subjects = _get_subjects(session)
    if not all_subjects:
        log.warning("No subjects found; returning empty grade dist")
        return []

    if subjects:
        subject_set = set(subjects)
        all_subjects = [s for s in all_subjects if s in subject_set]
        log.info("Filtered to %d subjects: %s", len(all_subjects), subjects)

    all_records: list[dict[str, Any]] = []
    for subject in all_subjects:
        time.sleep(REQUEST_DELAY)
        all_records.extend(_scrape_subject(session, subject))

    log.info("Grade dist total: %d records across %d subjects", len(all_records), len(all_subjects))
    return all_records


if __name__ == "__main__":
    import json, sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s", datefmt="%H:%M:%S")
    data = scrape()
    print(json.dumps(data[:5], indent=2), file=sys.stderr)
    print(f"Total: {len(data)} records")
