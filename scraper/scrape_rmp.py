"""
Scrapes RateMyProfessors for Mizzou professors found in grade_dist.json.
Uses the unofficial RMP GraphQL API.

Professor names in grade_dist are already normalized to "First Last" format
by scrape_grades.py (e.g. "Michael Jurczyk"), so we use them directly.
"""

import base64
import json
from datetime import datetime, timezone
import time
import logging
from difflib import get_close_matches
from pathlib import Path
from typing import Any

import requests

RMP_GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
MIZZOU_SCHOOL_ID = "U2Nob29sLTEzMjE="   # School-1321 (University of Missouri)
_MIZZOU_ID_STRIPPED = MIZZOU_SCHOOL_ID.rstrip("=")
REQUEST_DELAY = 1.0
FUZZY_CUTOFF = 0.78
MAX_COMMENTS = 8

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Content-Type": "application/json",
    "Authorization": "Basic dGVzdDp0ZXN0",
    "Origin": "https://www.ratemyprofessors.com",
    "Referer": "https://www.ratemyprofessors.com/",
}

SEARCH_QUERY = """
query TeacherSearchQuery($schoolID: ID!, $name: String!) {
  newSearch {
    teachers(query: { schoolID: $schoolID, text: $name, fallback: true }) {
      edges {
        node {
          id
          firstName
          lastName
          school {
            id
          }
          department
          avgRating
          avgDifficulty
          wouldTakeAgainPercent
          teacherRatingTags {
            tagName
            tagCount
          }
        }
      }
    }
  }
}
"""

RATINGS_QUERY = """
query RatingsListQuery($id: ID!) {
  node(id: $id) {
    ... on Teacher {
      ratings(first: 8) {
        edges {
          node {
            date
            clarityRating
            helpfulRating
            difficultyRatingRounded
            wouldTakeAgain
            comment
            class
          }
        }
      }
    }
  }
}
"""


def _decode_rmp_id(node_id: str) -> str:
    """Decode base64 RMP node ID like 'VGVhY2hlci0xMjM0NTY=' → '1234567'."""
    try:
        decoded = base64.b64decode(node_id + "==").decode("utf-8", errors="ignore")
        parts = decoded.split("-")
        return parts[-1] if parts else node_id
    except Exception:
        return node_id


def _is_mizzou_school(school: dict) -> bool:
    """Return True if this school node belongs to Mizzou (School-581).

    The RMP API sometimes omits trailing '=' padding on base64 IDs, so we
    normalise by stripping padding before comparing. As a final fallback we
    also try decoding and checking the numeric school ID.
    """
    sid = school.get("id", "")
    if not sid:
        return False
    if sid.rstrip("=") == _MIZZOU_ID_STRIPPED:
        return True
    try:
        decoded = base64.b64decode(sid + "==").decode("utf-8", errors="ignore")
        # "School-581" — make sure we're exact, not just containing "581"
        return decoded == "School-581" or decoded.endswith("-581")
    except Exception:
        return False


def _search_professor(session: requests.Session, name: str) -> list[dict[str, Any]]:
    payload = {
        "query": SEARCH_QUERY,
        "variables": {"schoolID": MIZZOU_SCHOOL_ID, "name": name},
    }
    try:
        resp = session.post(RMP_GRAPHQL_URL, json=payload, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        edges = (
            data.get("data", {})
            .get("newSearch", {})
            .get("teachers", {})
            .get("edges", [])
        )
        # Discard professors from other schools (fallback: true can return anyone).
        # Compare with padding stripped — the API sometimes omits the trailing "==".
        return [
            e["node"] for e in edges
            if e.get("node") and _is_mizzou_school(e["node"].get("school") or {})
        ]
    except Exception as e:
        log.error("RMP search failed for '%s': %s", name, e)
        return []


def _format_date(raw: str) -> str:
    try:
        # "2025-12-29 20:32:00 +0000 UTC" → "Dec 29, 2025"
        dt = datetime.strptime(raw.split(" +")[0].strip(), "%Y-%m-%d %H:%M:%S")
        return dt.strftime("%b %d, %Y")
    except Exception:
        return raw


def _fetch_comments(session: requests.Session, node_id: str) -> list[dict[str, Any]]:
    payload = {"query": RATINGS_QUERY, "variables": {"id": node_id}}
    try:
        resp = session.post(RMP_GRAPHQL_URL, json=payload, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        edges = (
            data.get("data", {})
            .get("node", {})
            .get("ratings", {})
            .get("edges", [])
        )
        comments = []
        for e in edges:
            node = e.get("node", {})
            text = (node.get("comment") or "").strip()
            if not text:
                continue
            rating = node.get("helpfulRating") or node.get("clarityRating") or 0
            course_name = (node.get("class") or "").strip() or None
            comments.append({
                "date":          _format_date(node.get("date", "")),
                "rating":        float(rating),
                "difficulty":    float(node.get("difficultyRatingRounded") or 0),
                "wouldTakeAgain": node.get("wouldTakeAgain") == 1,
                "text":          text,
                "courseName":    course_name,
            })
        return comments[:MAX_COMMENTS]
    except Exception as e:
        log.debug("Failed to fetch comments for %s: %s", node_id, e)
        return []


def _strip_middle_names(name: str) -> str | None:
    """Return first + last only, dropping all middle tokens.
    'James E Reis' → 'James Reis', 'James Edward Reis' → 'James Reis'.
    Returns None when there is nothing to strip (already 2 tokens or fewer)."""
    parts = name.split()
    if len(parts) < 3:
        return None
    stripped = f"{parts[0]} {parts[-1]}"
    return stripped if stripped != name else None


def _fuzzy_match(target: str, candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None
    candidate_names = [f"{c['firstName']} {c['lastName']}" for c in candidates]

    # Try original name first
    matches = get_close_matches(target, candidate_names, n=1, cutoff=FUZZY_CUTOFF)

    # If no match, retry with middle names/initials stripped from the target.
    # "James E Reis" vs "James Reis" usually scores ~0.91, but edge cases
    # (short names, multiple candidates diluting the list) can still miss.
    if not matches:
        stripped = _strip_middle_names(target)
        if stripped:
            matches = get_close_matches(stripped, candidate_names, n=1, cutoff=FUZZY_CUTOFF)

    if not matches:
        return None
    for c in candidates:
        if f"{c['firstName']} {c['lastName']}" == matches[0]:
            return c
    return None


def _build_record(name: str, node: dict[str, Any] | None, comments: list[dict[str, Any]]) -> dict[str, Any]:
    if node is None:
        return {
            "name": name,
            "rmpSearched": True,   # searched; not found on RMP
            "department": None,
            "rmpId": None,
            "avgRating": None,
            "avgDifficulty": None,
            "wouldTakeAgainPct": None,
            "tags": [],
            "rmpUrl": None,
            "comments": [],
        }

    node_id = node.get("id", "")
    numeric_id = _decode_rmp_id(node_id)
    tags: list[str] = [
        t["tagName"]
        for t in sorted(
            node.get("teacherRatingTags", []),
            key=lambda t: t.get("tagCount", 0),
            reverse=True,
        )[:6]
    ]
    wta = node.get("wouldTakeAgainPercent")
    return {
        "name": name,
        "rmpSearched": True,   # searched and found on RMP
        "department": node.get("department"),
        "rmpId": numeric_id,
        "avgRating": node.get("avgRating"),
        "avgDifficulty": node.get("avgDifficulty"),
        "wouldTakeAgainPct": round(wta) if wta is not None else None,
        "tags": tags,
        "rmpUrl": f"https://www.ratemyprofessors.com/professor/{numeric_id}" if numeric_id else None,
        "comments": comments,
    }


def scrape(
    grade_dist: list[dict[str, Any]],
    subject: str | None = None,
    professors_filter: list[str] | None = None,
) -> dict[str, Any]:
    if professors_filter:
        unique_professors = [p for p in professors_filter if p and p != "Unknown"]
        log.info("Looking up %d specific professor(s): %s", len(unique_professors), unique_professors)
    elif subject:
        grade_dist = [r for r in grade_dist if r.get("courseId", "").startswith(subject + "_")]
        log.info("Filtered grade_dist to %d records for subject %s", len(grade_dist), subject)
        unique_professors = sorted({r["professor"] for r in grade_dist if r.get("professor") and r["professor"] != "Unknown"})
    else:
        unique_professors = sorted({r["professor"] for r in grade_dist if r.get("professor") and r["professor"] != "Unknown"})
    log.info("Looking up %d unique professors on RMP", len(unique_professors))

    session = requests.Session()
    result: dict[str, Any] = {}

    for name in unique_professors:
        log.info("RMP lookup: %s", name)
        time.sleep(REQUEST_DELAY)

        # 1. Full name search
        candidates = _search_professor(session, name)
        match_name = name

        # 2. Strip middle names/initials and retry
        if not candidates:
            stripped = _strip_middle_names(name)
            if stripped:
                log.info("Retrying without middle name: '%s'", stripped)
                candidates = _search_professor(session, stripped)
                time.sleep(REQUEST_DELAY)
                if candidates:
                    match_name = stripped  # use stripped name for fuzzy match

        # 3. Last name only
        if not candidates:
            last = name.split()[-1] if " " in name else name
            candidates = _search_professor(session, last)
            time.sleep(REQUEST_DELAY)
            match_name = name  # full name gives best fuzzy discrimination here

        node = _fuzzy_match(match_name, candidates)

        # Final fallback: full-name search found candidates but none matched.
        # Try a fresh search with the stripped name in case the original search
        # returned different (or no) results for the short form.
        if node is None and match_name == name:
            stripped = _strip_middle_names(name)
            if stripped:
                log.info("Fuzzy match failed, retrying with stripped name: '%s'", stripped)
                stripped_cands = _search_professor(session, stripped)
                time.sleep(REQUEST_DELAY)
                if stripped_cands:
                    node = _fuzzy_match(stripped, stripped_cands)

        comments: list[dict[str, Any]] = []

        if node:
            log.info("Matched '%s' → %s %s (%.1f★)",
                     name, node.get("firstName", ""), node.get("lastName", ""),
                     node.get("avgRating") or 0)
            time.sleep(REQUEST_DELAY)
            comments = _fetch_comments(session, node["id"])
        else:
            log.info("No RMP match for '%s'", name)

        result[name] = _build_record(name, node, comments)

    log.info("RMP scrape complete: %d professors", len(result))
    return result


if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s", datefmt="%H:%M:%S")
    data_dir = Path(__file__).parent.parent / "public" / "data"
    grade_dist_path = data_dir / "grade_dist.json"

    if not grade_dist_path.exists():
        log.error("grade_dist.json not found at %s", grade_dist_path)
        raise SystemExit(1)

    with open(grade_dist_path) as f:
        grade_dist = json.load(f)

    professors = scrape(grade_dist)
    out = list(professors.values())[:3]
    print(json.dumps(out, indent=2), file=sys.stderr)
    print(f"Total: {len(professors)} professors")
