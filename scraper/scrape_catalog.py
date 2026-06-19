"""
Scrapes the MU course catalog from:
https://catalog.missouri.edu/courseofferings/

Actual page structure (verified):
  Subject list: <a href="/courseofferings/cmp_sc/"> style links on the index page
  Each subject page has <div class="courseblock"> entries with:
    <p class="courseblocktitle"><strong>CMP_SC 1000:  Course Title</strong></p>
    <p class="courseblockdesc">...description... Credit Hour: 3</p>
"""

import re
import time
import logging
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_URL    = "https://catalog.missouri.edu/courseofferings/"
REQUEST_DELAY = 1.0

log = logging.getLogger(__name__)


def _get_subjects(session: requests.Session) -> list[tuple[str, str]]:
    """Returns list of (SUBJECT_CODE, url) from the catalog index."""
    try:
        resp = session.get(BASE_URL, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch catalog index: %s", e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    subjects: dict[str, tuple[str, str]] = {}

    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if re.match(r"^/courseofferings/[a-z0-9_]+/?$", href):
            slug = href.strip("/").split("/")[-1]
            code = slug.upper()
            url  = f"https://catalog.missouri.edu{href}"
            subjects[url] = (code, url)

    log.info("Found %d subjects in catalog", len(subjects))
    return list(subjects.values())


def _parse_prereqs(text: str) -> list[str]:
    """Extract course ID mentions like 'CMP_SC 1050' from description text."""
    return list({
        f"{m.group(1)}_{m.group(2)}"
        for m in re.finditer(r"\b([A-Z][A-Z0-9_]{1,7})\s+(\d{4}[A-Z]?)\b", text)
    })


def _scrape_subject(session: requests.Session, subject: str, url: str) -> list[dict[str, Any]]:
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch subject %s: %s", subject, e)
        return []

    soup   = BeautifulSoup(resp.text, "lxml")
    courses: list[dict[str, Any]] = []

    for block in soup.select(".courseblock"):
        try:
            title_el = block.select_one(".courseblocktitle")
            desc_el  = block.select_one(".courseblockdesc")
            if not title_el:
                continue

            # Title format: "CMP_SC 1000:  Introduction to Computer Science"
            raw = title_el.get_text(" ", strip=True)
            m   = re.match(r"^(\S+)\s+(\d{4}[A-Z]?):\s+(.*)", raw)
            if not m:
                continue

            subj   = m.group(1)
            number = m.group(2)
            title  = re.sub(r"\s+", " ", m.group(3)).strip()

            credits = 3
            description = ""
            prereqs: list[str] = []

            if desc_el:
                desc_text = desc_el.get_text(" ", strip=True)
                # Extract "Credit Hour(s): N" or "Credit Hours: N-M"
                cm = re.search(r"Credit\s+Hours?\s*:\s*(\d+)", desc_text, re.I)
                if cm:
                    credits = int(cm.group(1))
                # Strip credit line from description
                description = re.sub(r"Credit\s+Hours?\s*:\s*[\d\-]+", "", desc_text).strip()
                prereqs = _parse_prereqs(desc_text)

            courses.append({
                "id":            f"{subj}_{number}",
                "subject":       subj,
                "number":        number,
                "title":         title,
                "description":   description,
                "credits":       credits,
                "prerequisites": prereqs,
            })
        except Exception as e:
            log.debug("Skipping block: %s", e)

    log.info("Subject %s: %d courses", subject, len(courses))
    return courses


def get_all_subject_codes() -> list[str]:
    """Fetch only the subject codes from the catalog index (no course pages scraped)."""
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"
    pairs = _get_subjects(session)
    return sorted([code for code, _ in pairs])


def scrape(subjects: list[str] | None = None) -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"

    all_subjects = _get_subjects(session)
    if not all_subjects:
        log.warning("No subjects found; returning empty catalog")
        return []

    if subjects:
        subject_set = set(subjects)
        all_subjects = [(code, url) for code, url in all_subjects if code in subject_set]
        log.info("Filtered to %d subjects: %s", len(all_subjects), subjects)

    seen: set[str] = set()
    all_courses: list[dict[str, Any]] = []

    for subject, url in all_subjects:
        time.sleep(REQUEST_DELAY)
        for course in _scrape_subject(session, subject, url):
            if course["id"] not in seen:
                seen.add(course["id"])
                all_courses.append(course)

    log.info("Catalog total: %d courses across %d subjects", len(all_courses), len(all_subjects))
    return all_courses


if __name__ == "__main__":
    import json, sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s", datefmt="%H:%M:%S")
    data = scrape()
    print(json.dumps(data[:5], indent=2), file=sys.stderr)
    print(f"Total: {len(data)} courses")
