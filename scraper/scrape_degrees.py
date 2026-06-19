"""
Scrapes BS/BA degree requirements from:
  https://catalog.missouri.edu/degreesanddegreeprograms/

Actual structure (verified):
  Index: links with text "BS" / "BA" / "BS in X" at paths like
    /collegeofengineering/computerscience/bs-computer-science/
  Each degree page has tables where:
    Row with 2 cells, numeric 2nd cell = category header  e.g. ["Core Courses", "42"]
    Row with 3 cells, 1st cell has course code            e.g. ["CMP_SC 1050", "Algorithm Design...", "4"]
    Course codes use non-breaking space (\xa0) between subject and number

  Some pages also contain graduate/MPA program requirements — those tables are skipped.
  Courses with numbers >= 7000 are always filtered out (graduate-level).
"""

import re
import time
import logging
from typing import Any

import requests
from bs4 import BeautifulSoup

BASE_URL  = "https://catalog.missouri.edu"
INDEX_URL = "https://catalog.missouri.edu/degreesanddegreeprograms/"
REQUEST_DELAY = 1.0

log = logging.getLogger(__name__)

COLLEGE_MAP = {
    "collegeofagriculturefoodandnaturalresources": "College of Agriculture, Food & Natural Resources",
    "collegeofartsandscience":                     "College of Arts & Science",
    "collegeofbusiness":                           "Trulaske College of Business",
    "collegeofeducation":                          "College of Education & Human Development",
    "collegeofengineering":                        "College of Engineering",
    "collegeofhealthsciences":                     "College of Health Sciences",
    "schoolofmedicine":                            "School of Medicine",
    "schoolofnursing":                             "Sinclair School of Nursing",
    "schoolofsocialwork":                          "School of Social Work",
    "collegeofveterinarymedicine":                 "College of Veterinary Medicine",
    "missourityschooloflaw":                       "Missouri School of Law",
}

# Table headers indicating a graduate-level or sample-plan table that should be skipped
GRAD_TABLE_KEYWORDS = [
    "mpa core", "mpa required", "graduate core", "graduate required",
    "masters thesis", "master's thesis", "doctoral", "phd",
    "provisional graduate", "grad student", "accelerated master",
    "5-year", "4+1",
]

SAMPLE_PLAN_KEYWORDS = ["first year", "second year", "third year", "fourth year"]

# Heading contains any track-like keyword
_TRACK_HEADING_RE = re.compile(
    r"\b(track|emphasis|concentration|specialization)\b",
    re.I,
)
# Heading is a generic section header that CONTAINS tracks — not a specific track name.
# e.g. "Electives and Specialized Tracks", "Approved Science Course Tracks"
_TRACK_SECTION_HEADER_RE = re.compile(
    r"\band\b.*\btrack|elective.*\btrack|\btrack.*\band\b.*\belective",
    re.I,
)
# Heading ends with a singular track keyword → it IS a specific track name.
# e.g. "Biological Sciences Track", "Food Science Track", "HHB Emphasis"
_TRACK_NAME_END_RE = re.compile(
    r"\b(track|emphasis|concentration|specialization)\s*$",
    re.I,
)

# Extracts a minimum credit count from paragraph text before a headerless table.
# Two levels: specific "total N" pattern (most reliable), then generic "at least N".
# Both allow up to 3 modifier words between the number and "credit/hour" (e.g. "15 additional
# Anthropology credits", "29 credits for the BA degree").
_PARA_TOTAL_RE = re.compile(
    r"(?:to\s+total|a\s+total\s+of|totaling)\s+(?:at\s+least\s+)?(\d+)\s+(?:\w+\s+){0,3}(?:credit|hour|semester)",
    re.I,
)
_PARA_CREDIT_RE = re.compile(
    r"(?:at\s+least|minimum\s+of)\s+(\d+)\s+(?:\w+\s+){0,3}(?:credit|hour|semester)",
    re.I,
)

# Concentration area detection — matches headings like "Concentration Areas", "Areas of Concentration"
_CONC_AREA_HEADING_RE = re.compile(
    r"\b(area[s]?\s+of\s+concentration|concentration\s+area[s]?|available\s+concentration[s]?)\b",
    re.I,
)
# Extracts required count from text like "complete three areas of concentration"
# or "choose three concentration areas" — allows up to 3 words between count and "concentration"
_CONC_COUNT_RE = re.compile(
    r"(?:complete|choose|select|earn|required?\s+to\s+complete|must\s+complete)\s+"
    r"(?:at\s+least\s+)?(\w+)\s+(?:\w+\s+){0,3}concentration",
    re.I,
)
_WORD_TO_NUM = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}


def _is_grad_table(table_text: str) -> bool:
    tl = table_text.lower()
    for kw in GRAD_TABLE_KEYWORDS:
        if kw in tl:
            return True
    return False


def _is_sample_plan_table(table_text: str) -> bool:
    tl = table_text.lower()
    # Must have semester columns AND year headers
    has_semesters = ("fall" in tl and "spring" in tl) or ("semester" in tl and "credits" in tl)
    has_years = any(kw in tl for kw in SAMPLE_PLAN_KEYWORDS)
    return has_semesters and has_years


def _is_undergrad_course_id(course_id: str) -> bool:
    """Return False for 7000+ level courses (graduate)."""
    m = re.search(r"_(\d{4})", course_id)
    if m and int(m.group(1)) >= 7000:
        return False
    return True


def _get_degree_links(session: requests.Session) -> list[tuple[str, str]]:
    """Return (degree_name, url) for all BS/BA programs."""
    try:
        resp = session.get(INDEX_URL, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch degree index: %s", e)
        return []

    soup = BeautifulSoup(resp.text, "lxml")
    seen: set[str] = set()
    results: list[tuple[str, str]] = []

    for a in soup.select("a[href]"):
        href = a.get("href", "")
        text = a.get_text(strip=True).rstrip("*")
        # BS/BA links are 4+ levels deep and start with BS or BA
        if re.match(r"^(BS|BA)\b", text) and href.count("/") >= 4:
            url = BASE_URL + href if href.startswith("/") else href
            if url not in seen:
                seen.add(url)
                results.append((text, url))

    log.info("Found %d BS/BA degree programs", len(results))
    return results



# Constraint language that indicates a course ID is mentioned as an exception/limit,
# not as a requirement to take.
_CONSTRAINT_TEXT = re.compile(
    r"\b(no\s+more\s+than|may\s+include|not\s+to\s+exceed|except(?:ing)?|excluding"
    r"|not\s+including|maximum\s+of|up\s+to\s+\d+\s+credit|not\s+count|cannot\s+count)\b",
    re.I,
)


def _parse_table_courses(table) -> list[dict[str, Any]]:
    """Parse one requirements table. Each entry includes category + catMinCredits."""
    courses: list[dict[str, Any]] = []
    seen: set[str] = set()
    current_category = "Core"
    current_cat_credits: int | None = None
    current_cat_is_elective = False
    # Track whether the current elective section came from a credit-count header
    # (2-cell row with digit 2nd cell) vs a sub-section header (empty 2nd cell).
    # Credit-count elective headers often represent single-slot choices; after their
    # "or"-alternative block ends the remaining courses should revert to required.
    _cat_from_digit_header = False
    _saw_or_after_digit_elective = False
    # Last appended course entry — used to attach "or X" alternatives in required sections.
    # Reset to None whenever the category changes so or-blocks never cross section boundaries.
    _last_course: dict[str, Any] | None = None

    all_rows = table.find_all("tr")

    for ri, row in enumerate(all_rows):
        cells = [td.get_text(" ", strip=True).replace("\xa0", " ").strip()
                 for td in row.find_all(["td", "th"])]
        if not cells or all(c == "" for c in cells):
            continue

        # Category header: 2 cells, 2nd cell starts with a digit (credit count)
        if len(cells) == 2 and re.match(r"^\d", cells[1].replace("–", "").replace("-", "")):
            new_cat = re.sub(r"\s*\(\d+.*", "", cells[0]).strip() or current_category
            cm = re.search(r"(\d+)", cells[1])
            new_credits = int(cm.group(1)) if cm else None

            # Check the next 1-3 rows for "choose/select" instruction text.
            # Only look at rows that are NOT sub-category headers (2-cell with numeric 2nd cell).
            choose_in_next = False
            for lookahead in all_rows[ri+1:ri+4]:
                la_cells = [td.get_text(" ", strip=True).replace("\xa0", " ").strip()
                            for td in lookahead.find_all(["td", "th"])]
                if not la_cells or all(c == "" for c in la_cells):
                    continue
                # Stop if we hit another sub-category header
                if len(la_cells) == 2 and re.match(r"^\d", la_cells[1].replace("–","").replace("-","")):
                    break
                # Stop if we hit an actual course row
                if re.match(r"^([A-Z][A-Z0-9_]{1,7})\s+\d{4}", la_cells[0]):
                    break
                la_text = " ".join(la_cells).lower()
                if re.search(r"\b(choose|select|pick)\b", la_text):
                    choose_in_next = True
                    break

            current_category = new_cat
            current_cat_credits = new_credits
            current_cat_is_elective = (
                _is_elective_category(new_cat) or choose_in_next
            )
            _cat_from_digit_header = True
            _saw_or_after_digit_elective = False
            _last_course = None  # new section — don't attach or-rows across boundary
            # Extract any course ID embedded in the category header name
            # e.g. "II. Research Skills: HIST 2950 Sophomore Seminar" → HIST_2950
            # Skip if the text has constraint language ("no more than N credits in X")
            if not current_cat_is_elective and not _CONSTRAINT_TEXT.search(new_cat):
                for hm in re.finditer(r"\b([A-Z][A-Z0-9_]{1,7})\s+(\d{4}[A-Z]?)\b", new_cat):
                    hcid = f"{hm.group(1)}_{hm.group(2)}"
                    if _is_undergrad_course_id(hcid) and hcid not in seen:
                        seen.add(hcid)
                        entry = {
                            "courseId":      hcid,
                            "title":         new_cat,
                            "credits":       new_credits or 3,
                            "category":      new_cat,
                            "catMinCredits": new_credits,
                            "isElective":    False,
                        }
                        courses.append(entry)
                        _last_course = entry
            continue

        # Sub-section header: 2-cell row, 2nd cell empty — used for area/pool labels
        # e.g. ["Comparative government (at least one course required)", ""]
        # Ignore instruction sentences like "Choose 3 courses..." or "One course must be..."
        if (len(cells) == 2 and cells[1] == "" and cells[0]
                and not re.match(r"^or\s+", cells[0], re.I)
                and not re.match(r"^([A-Z][A-Z0-9_]{1,7})\s+\d{4}", cells[0])):
            label = cells[0]
            label_lower = label.lower()
            # Skip pure constraint/note rows that don't define a new pool
            if re.match(
                r"^(note:|all\s+(?:courses|students)"
                r"|one\s+course\s+must|a\s+minimum|no\s+more\s+than|must\s+be|students\s+must"
                r"|the\s+following|these\s+courses|\*see\s+list"
                r"|at\s+least\s+\d|at\s+least\s+(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+credit)",
                label_lower
            ):
                continue
            is_required_header = bool(re.search(
                r"\bmust\s+take\b|\bfollowing\s+(?:are\s+)?required\b"
                r"|\b(foundational|foundation|core\s+course|required\s+course"
                r"|all\s+major|major\s+core|required\s+core"
                r"|degree\s+requirement|program\s+requirement)\b",
                label_lower
            ))
            is_elective_header = bool(re.search(
                r"\b(at\s+least|choose|select|pick|one\s+(?:course|of)|two\s+courses|recommended)\b",
                label_lower
            ))
            if is_elective_header and not is_required_header:
                clean_label = re.sub(r"\s*\(.*\)\s*$", "", label).strip() or label
                mc = re.search(
                    r"(?:choose|select|at\s+least)\s+(\w+)\s+(?:course|credit)", label_lower
                )
                word_to_num = {"one": 1, "two": 2, "three": 3, "four": 4,
                               "five": 5, "six": 6, "nine": 9, "twelve": 12}
                min_count = word_to_num.get(mc.group(1), 1) if mc else 1
                current_category = clean_label
                current_cat_credits = min_count * 3
                current_cat_is_elective = True
                _cat_from_digit_header = False
                _saw_or_after_digit_elective = False
                _last_course = None
            elif is_required_header:
                current_category = re.sub(r"\s*\(.*\)\s*$", "", label).strip() or "Core"
                current_cat_credits = None
                current_cat_is_elective = False
                _cat_from_digit_header = False
                _saw_or_after_digit_elective = False
                _last_course = None
            continue

        raw_id = cells[0]

        # Handle "or X" alternative rows
        if re.match(r"^or\s+", raw_id, re.I):
            if current_cat_is_elective and _cat_from_digit_header:
                _saw_or_after_digit_elective = True

            # Parse the course from "or SUBJ XXXX ..."
            or_text = re.sub(r"^or\s+", "", raw_id, flags=re.I).strip()
            or_text = re.split(r"\s+&\s+", or_text)[0].strip()
            m_or = re.match(r"^([A-Z][A-Z0-9_]{1,7})\s+(\d{4}[A-Z]?)\b", or_text)
            if m_or:
                or_id = f"{m_or.group(1)}_{m_or.group(2)}"
                if _is_undergrad_course_id(or_id):
                    or_title = cells[1] if len(cells) > 1 else ""
                    or_title = re.sub(r"\s*\*+$", "", re.sub(r"\s+", " ", or_title)).strip()
                    or_credits = 3
                    if len(cells) > 2:
                        cm2 = re.search(r"(\d+)", cells[2])
                        if cm2:
                            or_credits = int(cm2.group(1))

                    if current_cat_is_elective:
                        # In an elective pool, "or" alternatives are just more pool options
                        if or_id not in seen:
                            seen.add(or_id)
                            entry = {
                                "courseId":      or_id,
                                "title":         or_title,
                                "credits":       or_credits,
                                "category":      current_category,
                                "catMinCredits": current_cat_credits,
                                "isElective":    True,
                            }
                            courses.append(entry)
                            _last_course = entry
                    elif _last_course is not None and not _last_course.get("isElective"):
                        # In a required section, "or" means "take this one instead"
                        _last_course.setdefault("orCourses", []).append({
                            "courseId": or_id,
                            "title":    or_title,
                            "credits":  or_credits,
                        })
            continue

        # A fresh primary course row after an or-block in a single-slot digit-header elective
        # section (catMinCredits ≤ 4) means the slot is filled; revert to required.
        # Multi-course pools (catMinCredits > 4) legitimately have or-rows between distinct
        # options (e.g., "COURSE_A or COURSE_A_ALT" then "COURSE_B"), so don't reset those.
        if (current_cat_is_elective and _cat_from_digit_header
                and _saw_or_after_digit_elective
                and current_cat_credits is not None and current_cat_credits <= 4):
            current_cat_is_elective = False
            current_category = "Core"
            _saw_or_after_digit_elective = False

        # Handle compound entries like "BIO_SC 1010 & BIO_SC 1020" — take first course only
        raw_id = re.split(r"\s+&\s+", raw_id)[0].strip()

        m = re.match(r"^([A-Z][A-Z0-9_]{1,7})\s+(\d{4}[A-Z]?)\b", raw_id)
        if not m:
            continue

        course_id = f"{m.group(1)}_{m.group(2)}"

        # Skip graduate-level courses
        if not _is_undergrad_course_id(course_id):
            continue

        if course_id in seen:
            continue
        seen.add(course_id)

        title = cells[1] if len(cells) > 1 else ""
        # Strip footnote markers like " **" or " *" from titles
        title = re.sub(r"\s*\*+$", "", title).strip()

        credits = 3
        if len(cells) > 2:
            cm2 = re.search(r"(\d+)", cells[2])
            if cm2:
                credits = int(cm2.group(1))

        entry = {
            "courseId":      course_id,
            "title":         re.sub(r"\s+", " ", title).strip(),
            "credits":       credits,
            "category":      current_category,
            "catMinCredits": current_cat_credits,
            "isElective":    current_cat_is_elective,
        }
        courses.append(entry)
        _last_course = entry

    return courses


def _is_elective_category(name: str) -> bool:
    nl = name.lower()
    return (
        "elective" in nl or "choose" in nl or "select" in nl
        or "option" in nl or "concentration" in nl
        or "additional hours" in nl          # e.g. "Additional hours in sociology"
        or "additional course" in nl         # e.g. "Additional courses in X"
        or bool(re.match(r"^any\b", nl))    # "Any PUB_AF..." style headers
    )


# Labels to skip when parsing general requirements from the sample plan
_GEN_REQ_SKIP = re.compile(
    r"^(fall|spring|summer|credits?|total|year|semester|second\s+major|minor|certificate"
    r"|elective$|free\s+elective|general\s+elective|additional\s+elective|undefined"
    r"|concentration|emphasis|internship|study\s+abroad|departmental\s+approval)\b",
    re.I,
)
_GEN_REQ_KEEP = re.compile(
    r"(language|second\s+language|foreign\s+language"
    r"|humanities|social\s+science|behavioral\s+science|biological\s+science"
    r"|physical\s+science|math|quantitative|writing\s+intensive|capstone"
    r"|missouri\s+state\s+law|american\s+history|american\s+government"
    r"|distribution|science\s+lab|lab\s+science|general\s+education"
    r"|english\s+composition|communication\s+requirement)",
    re.I,
)


def _parse_general_requirements(tables) -> list[dict[str, Any]]:
    """
    Parse the sample plan table to extract college/university-level general
    requirements (non-course slots like 'Second Language Requirement', 'Humanities').
    Returns [{description, credits}, ...] deduplicated by description.
    """
    seen: dict[str, int] = {}  # description -> total credits

    for table in tables:
        table_text = table.get_text(" ", strip=True)
        if not _is_sample_plan_table(table_text):
            continue
        if _is_grad_table(table_text):
            continue

        for row in table.find_all("tr"):
            cells = [td.get_text(" ", strip=True).replace("\xa0", " ").strip()
                     for td in row.find_all(["td", "th"])]
            if not cells:
                continue

            # Row format is typically [item, credits, item, credits, ...]
            # or [item, credits] or just [item]
            i = 0
            while i < len(cells):
                label = cells[i]
                i += 1
                # Try to grab the next cell as credits
                credits = 3
                if i < len(cells) and re.match(r"^\d+$", cells[i]):
                    credits = int(cells[i])
                    i += 1

                if not label or len(label) < 5:
                    continue
                # Skip course IDs
                if re.match(r"^[A-Z][A-Z0-9_]{1,7}\s+\d{4}", label):
                    continue
                # Skip numeric-only or year/semester headers
                if re.match(r"^\d", label) or _GEN_REQ_SKIP.match(label):
                    continue
                # Only keep rows that look like genuine requirement categories
                if not _GEN_REQ_KEEP.search(label):
                    continue

                # Normalize the description
                desc = re.sub(r"\s+", " ", label).strip()
                # Accumulate credits (same requirement might appear multiple semesters
                # e.g., Second Language semester 1 + 2)
                seen[desc] = max(seen.get(desc, 0), credits)

    # Convert to list, merge similar descriptions
    result: list[dict[str, Any]] = []
    for desc, credits in sorted(seen.items()):
        result.append({"description": desc, "credits": credits})
    return result


def _scrape_degree(session: requests.Session, link_text: str, url: str, _depth: int = 0) -> dict[str, Any] | None:
    try:
        resp = session.get(url, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch %s: %s", url, e)
        return None

    soup = BeautifulSoup(resp.text, "lxml")

    page_title = soup.title.get_text(strip=True) if soup.title else link_text
    name = page_title.split("|")[0].strip() or link_text

    path_parts = url.replace(BASE_URL, "").strip("/").split("/")
    college_slug = path_parts[0] if path_parts else ""
    college = COLLEGE_MAP.get(college_slug, college_slug.replace("-", " ").title())

    # Walk the DOM in document order, bucketing tables under the current track context.
    # h4 headings matching track keywords start a new track; h2/h3 headings reset context.
    # Paragraph text is accumulated since the last heading and passed with each table for
    # minCredits extraction (credit requirements may appear 1-3 paragraphs before the table).
    general_tables: list[tuple[Any, str]] = []
    tracks_tables: dict[str, list[tuple[Any, str]]] = {}  # track_name -> [(table, section_p), ...]
    current_track: str | None = None
    section_p_text: str = ""  # all <p> text since the last heading reset

    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "table"]):
        if el.name == "table":
            if current_track:
                tracks_tables.setdefault(current_track, []).append((el, section_p_text))
            else:
                general_tables.append((el, section_p_text))
            # Don't reset section_p_text — subsequent tables in same section share the same context
        elif el.name == "p":
            t = el.get_text(" ", strip=True)
            if t:
                section_p_text = (section_p_text + " " + t).strip()
        else:
            text = el.get_text(strip=True)
            if el.name in ("h1", "h2"):
                current_track = None
                section_p_text = ""
            elif _TRACK_HEADING_RE.search(text) and 5 < len(text) < 120:
                if _TRACK_SECTION_HEADER_RE.search(text):
                    # Generic section header e.g. "Electives and Tracks" — reset context
                    current_track = None
                    section_p_text = ""
                else:
                    # Specific track name — carry section_p_text into the track so that
                    # a credit requirement stated before the first track heading is inherited.
                    is_specific = el.name == "h4" or (
                        el.name == "h3"
                        and (_TRACK_NAME_END_RE.search(text) or ":" in text)
                    )
                    current_track = text if is_specific else None
                    # Don't reset section_p_text; let track-specific paragraphs append to it
            elif el.name == "h3":
                current_track = None
                section_p_text = ""

    def _process_tables(tables: list[tuple[Any, str]], general_seen: set[str] | None = None) -> list[dict[str, Any]]:
        """Parse a list of (table, ctx_para) tuples into a flat course list, skipping plan/grad tables."""
        courses: list[dict[str, Any]] = []
        seen: set[str] = set()
        for table, section_p in tables:
            table_text = table.get_text(" ", strip=True)
            if _is_sample_plan_table(table_text):
                continue
            if _is_grad_table(table_text):
                continue
            has_credit_header = any(
                len(row.find_all(["td", "th"])) == 2
                and re.match(r"^\d", row.find_all(["td", "th"])[1].get_text(strip=True).replace("–", "").replace("-", ""))
                for row in table.find_all("tr")
                if len(row.find_all(["td", "th"])) == 2
            )
            parsed = _parse_table_courses(table)
            if not has_credit_header and len(parsed) >= 8:
                min_cr = 0
                if section_p:
                    # Prefer "total N credits" (specific to pool totals); fall back to first
                    # "at least N credits" (first mention is usually the total, not sub-reqs).
                    pm = _PARA_TOTAL_RE.search(section_p)
                    if pm:
                        min_cr = int(pm.group(1))
                    else:
                        matches = _PARA_CREDIT_RE.findall(section_p)
                        if matches:
                            min_cr = int(matches[0])
                for c in parsed:
                    if c["category"] == "Core" and not c.get("isElective"):
                        c["isElective"] = True
                        c["category"] = "Additional Courses"
                        c["catMinCredits"] = min_cr
            for c in parsed:
                if c["courseId"] not in seen:
                    if general_seen is not None and c["courseId"] in general_seen:
                        continue  # skip courses already in degree-level requirements
                    seen.add(c["courseId"])
                    courses.append(c)
        return courses

    def _split_courses(all_courses: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Split a flat course list into (required, elective_pools)."""
        required: list[dict[str, Any]] = []
        pool_map: dict[str, dict[str, Any]] = {}
        for c in all_courses:
            cat = c["category"]
            if c.get("isElective") or _is_elective_category(cat):
                if cat not in pool_map:
                    pool_map[cat] = {"name": cat, "minCredits": c["catMinCredits"] or 0, "courses": []}
                pool_map[cat]["courses"].append({
                    "courseId": c["courseId"],
                    "title":    c["title"],
                    "credits":  c["credits"],
                })
            else:
                req_entry: dict[str, Any] = {
                    "courseId": c["courseId"],
                    "title":    c["title"],
                    "credits":  c["credits"],
                    "category": cat,
                }
                if c.get("orCourses"):
                    req_entry["orCourses"] = c["orCourses"]
                required.append(req_entry)
        return required, list(pool_map.values())

    # Process general (degree-level) tables first
    general_courses = _process_tables(general_tables)
    general_seen = {c["courseId"] for c in general_courses}
    required, elective_pools = _split_courses(general_courses)

    # Process each track's tables
    tracks: list[dict[str, Any]] = []
    for track_name, t_tables in tracks_tables.items():
        track_courses = _process_tables(t_tables, general_seen=general_seen)
        if not track_courses:
            continue
        t_required, t_pools = _split_courses(track_courses)
        track_id = re.sub(r"[^a-z0-9]+", "-", track_name.lower()).strip("-")
        tracks.append({
            "id":              track_id,
            "name":            track_name,
            "requiredCourses": t_required,
            "electivePools":   t_pools,
        })

    # Some umbrella degree pages list no course tables themselves — the real requirements
    # live on emphasis sub-pages (e.g. bs-nutrition-exercise-physiology-emphasis-nutrition-foods).
    # When we find no tables at all AND emphasis sub-pages exist (URLs with "-emphasis-" at
    # the same dept depth), scrape each one and add it as a track.  _depth guard prevents
    # recursive emphasis scraping of already-fetched emphasis pages.
    if _depth == 0 and not required and not elective_pools and not tracks:
        dept_prefix = "/" + "/".join(path_parts[:2]) + "/"
        current_path = url.replace(BASE_URL, "").rstrip("/")
        seen_emph_slugs: set[str] = set()
        emphasis_queue: list[tuple[str, str]] = []  # (name, full_url)
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            if not (href.startswith(dept_prefix) and "-emphasis-" in href):
                continue
            emph_slug = href.rstrip("/").rsplit("/", 1)[-1]
            if emph_slug in seen_emph_slugs or emph_slug == current_path.rsplit("/", 1)[-1]:
                continue
            seen_emph_slugs.add(emph_slug)
            emph_name = a.get_text(strip=True)
            # Strip trailing parenthetical abbreviations like "(APD)"
            emph_name = re.sub(r"\s*\([\w/]+\)\s*$", "", emph_name).strip()
            if emph_name:
                emphasis_queue.append((emph_name, BASE_URL + href))
        for emph_name, emph_url in emphasis_queue:
            log.info("Scraping emphasis sub-page: %s (%s)", emph_name, emph_url)
            time.sleep(REQUEST_DELAY)
            emph = _scrape_degree(session, emph_name, emph_url, _depth=1)
            if emph and (emph.get("requiredCourses") or emph.get("electivePools")):
                track_id = re.sub(r"[^a-z0-9]+", "-", emph_name.lower()).strip("-")
                tracks.append({
                    "id":              track_id,
                    "name":            emph_name,
                    "requiredCourses": emph["requiredCourses"],
                    "electivePools":   emph["electivePools"],
                })

    total_credits = 120
    text = soup.get_text(" ", strip=True)
    # Prefer an explicit "Total Credits: N" row (most reliable for Mizzou catalog pages).
    # The generic "N credit hours" pattern can match unrelated sentences (e.g. GPA rules
    # like "138 credit hours attempted"), so it's the fallback only.
    tc_explicit = re.search(r"total\s+credits?:?\s*(\d{3,})", text, re.I)
    if tc_explicit:
        total_credits = int(tc_explicit.group(1))
    else:
        cm = re.search(r"(\d{3,})\s*(?:credit|hour|semester\s+hour)", text, re.I)
        if cm:
            total_credits = int(cm.group(1))

    degree_id = path_parts[-1] if path_parts else re.sub(r"[^a-z0-9]+", "_", name.lower())

    all_tables = soup.find_all("table")
    general_reqs = _parse_general_requirements(all_tables)

    # --- Concentration area detection ---
    # Some degrees (e.g. BS Agriculture) require students to pick N concentration areas
    # from a list. Each area may have a standalone degree page or may be concentration-only.
    concentration_areas: list[dict[str, Any]] = []
    concentration_count: int | None = None

    if _CONC_AREA_HEADING_RE.search(text):
        cm2 = _CONC_COUNT_RE.search(text)
        if cm2:
            word = cm2.group(1).lower()
            concentration_count = _WORD_TO_NUM.get(word) or (int(word) if word.isdigit() else None)

        in_conc = False
        for el in soup.find_all(["h1", "h2", "h3", "h4", "li", "td"]):
            tag = el.name
            el_text = el.get_text(strip=True)
            if tag in ("h1", "h2", "h3", "h4"):
                in_conc = bool(_CONC_AREA_HEADING_RE.search(el_text))
                continue
            if not in_conc:
                continue
            name_text = el_text.strip()
            if not name_text or len(name_text) < 3:
                continue
            # Skip rows that look like course IDs or numbers
            if re.match(r"^[A-Z][A-Z0-9_]{1,7}\s+\d{4}", name_text) or re.match(r"^\d+$", name_text):
                continue
            # Try to extract a degree-page link from the element
            a_tag = el.find("a", href=True)
            conc_degree_id: str | None = None
            if a_tag:
                href = a_tag.get("href", "")
                slug = href.rstrip("/").rsplit("/", 1)[-1]
                if re.match(r"^b[sa]-", slug):
                    conc_degree_id = slug
            if not any(c["name"] == name_text for c in concentration_areas):
                concentration_areas.append({"name": name_text, "degreeId": conc_degree_id})

    log.info("Scraped: %s (%d required, %d elective pools, %d tracks, %d general reqs, %d concentration areas)",
             name, len(required), len(elective_pools), len(tracks), len(general_reqs), len(concentration_areas))

    result: dict[str, Any] = {
        "id":                  degree_id,
        "name":                name,
        "college":             college,
        "totalCredits":        total_credits,
        "requiredCourses":     required,
        "electivePools":       elective_pools,
        "samplePlan":          [],
        "generalRequirements": general_reqs,
        "tracks":              tracks,
    }
    if concentration_areas:
        result["concentrationAreas"] = concentration_areas
    if concentration_count is not None:
        result["concentrationCount"] = concentration_count
    return result


def _slug_to_name(slug: str) -> str:
    """'bs-computer-science' → 'BS in Computer Science'"""
    parts = slug.split("-")
    if not parts:
        return slug
    degree_type = parts[0].upper()
    rest = " ".join(p.capitalize() for p in parts[1:])
    return f"{degree_type} in {rest}" if rest else degree_type


def scrape_stubs() -> list[dict[str, Any]]:
    """Fast: 1 HTTP request to the index. Returns a stub for every BS/BA program."""
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"
    links = _get_degree_links(session)
    stubs: list[dict[str, Any]] = []
    for _link_text, url in links:
        path_parts = url.replace(BASE_URL, "").strip("/").split("/")
        college_slug = path_parts[0] if path_parts else ""
        college = COLLEGE_MAP.get(college_slug, college_slug.replace("-", " ").title())
        degree_id = path_parts[-1] if path_parts else ""
        stubs.append({
            "id":                  degree_id,
            "name":                _slug_to_name(degree_id),
            "college":             college,
            "totalCredits":        120,
            "requiredCourses":     [],
            "electivePools":       [],
            "samplePlan":          [],
            "generalRequirements": [],
            "stub":                True,
        })
    log.info("Stubs: %d degrees indexed", len(stubs))
    return stubs


def scrape_each(skip_ids: set[str] | None = None):
    """Generator: yields each scraped degree as it completes. Skips IDs in skip_ids."""
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"
    links = _get_degree_links(session)
    if not links:
        log.warning("No degree links found")
        return
    for link_text, url in links:
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if skip_ids and slug in skip_ids:
            log.debug("Skipping already-scraped: %s", slug)
            continue
        time.sleep(REQUEST_DELAY)
        degree = _scrape_degree(session, link_text, url)
        if degree:
            yield degree


def scrape_one(degree_id: str) -> dict[str, Any] | None:
    """Scrape a single degree by its URL-slug ID (e.g. 'bs-computer-science')."""
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"

    links = _get_degree_links(session)
    for link_text, url in links:
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if slug == degree_id:
            log.info("Scraping single degree: %s (%s)", link_text, url)
            return _scrape_degree(session, link_text, url)

    log.warning("No degree link found for id: %s", degree_id)
    return None


def scrape() -> list[dict[str, Any]]:
    session = requests.Session()
    session.headers["User-Agent"] = "MUPlannerBot/1.0 (educational)"

    links = _get_degree_links(session)
    if not links:
        log.warning("No degree links found")
        return []

    degrees: list[dict[str, Any]] = []
    for link_text, url in links:
        time.sleep(REQUEST_DELAY)
        degree = _scrape_degree(session, link_text, url)
        if degree and (degree["requiredCourses"] or degree["electivePools"] or degree.get("tracks")):
            degrees.append(degree)

    log.info("Degrees total: %d", len(degrees))
    return degrees


if __name__ == "__main__":
    import json, sys
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s", datefmt="%H:%M:%S")
    data = scrape()
    cs = next((d for d in data if "computer science" in d["name"].lower()), data[0] if data else None)
    if cs:
        print(json.dumps(cs, indent=2), file=sys.stderr)
    print(f"Total: {len(data)} degrees")
