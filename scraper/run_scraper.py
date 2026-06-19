"""
Entry point called by the Next.js /api/scrape route.
Usage: python3 run_scraper.py <target> [--subject SUBJ]
Targets: catalog, grades, degrees, rmp

When --subject is given, only that subject is scraped and the result is
merged into the existing JSON file (other subjects are preserved).
"""

import argparse
import json
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stderr,
)
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "public" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _write(name: str, data) -> None:
    path = DATA_DIR / name
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    count = len(data) if isinstance(data, (list, dict)) else 1
    log.info("Saved %s (%d items)", name, count)
    print(f"Saved {name} ({count} items)", flush=True)


def _load(name: str, fallback):
    path = DATA_DIR / name
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return fallback


def run_subjects() -> None:
    import scrape_catalog
    subjects = scrape_catalog.get_all_subject_codes()
    if not subjects:
        log.error("Could not fetch subjects from catalog index")
        sys.exit(1)
    _write("subjects.json", subjects)


def run_catalog(subject: str | None = None) -> None:
    import scrape_catalog
    # Populate subjects.json on first run (lightweight index-only fetch)
    subjects_path = DATA_DIR / "subjects.json"
    if not subjects_path.exists():
        try:
            all_codes = scrape_catalog.get_all_subject_codes()
            if all_codes:
                _write("subjects.json", all_codes)
        except Exception as e:
            log.warning("Could not prefetch subjects list: %s", e)

    data = scrape_catalog.scrape(subjects=[subject] if subject else None)
    if not data:
        log.error("Catalog scraper returned no data")
        sys.exit(1)
    # Merge new courses into existing file (preserves other subjects)
    existing = {c["id"]: c for c in _load("courses.json", [])}
    for c in data:
        existing[c["id"]] = c
    _write("courses.json", list(existing.values()))


def run_grades(subject: str | None = None) -> None:
    import scrape_grades
    data = scrape_grades.scrape(subjects=[subject] if subject else None)
    if not data:
        log.error("Grades scraper returned no data")
        sys.exit(1)
    # Merge: key by (courseId, term, professor)
    existing_map: dict[tuple, dict] = {}
    for r in _load("grade_dist.json", []):
        key = (r.get("courseId"), r.get("term"), r.get("professor"))
        existing_map[key] = r
    for r in data:
        key = (r.get("courseId"), r.get("term"), r.get("professor"))
        existing_map[key] = r
    _write("grade_dist.json", list(existing_map.values()))


def _validate_concentration_links(degrees: list[dict]) -> None:
    """Cross-reference concentrationAreas[].degreeId values against known degree IDs.
    Clears invalid references and fills in slug-matched ones where the link was absent."""
    import re
    known_ids = {d["id"] for d in degrees}
    for degree in degrees:
        areas = degree.get("concentrationAreas")
        if not areas:
            continue
        for area in areas:
            current = area.get("degreeId")
            if current and current not in known_ids:
                area["degreeId"] = None
            if not area.get("degreeId"):
                # Try to derive the ID by slugifying the area name.
                # Also try a version without "and" / "&" since many degree IDs omit it
                # (e.g. "Food Science and Nutrition" → "bs-food-science-nutrition").
                slug = re.sub(r"[^a-z0-9]+", "-", area["name"].lower()).strip("-")
                slug_no_and = re.sub(r"-(?:and|&)-", "-", slug)
                for prefix in ("bs-", "ba-"):
                    for candidate_slug in dict.fromkeys([slug, slug_no_and]):  # deduplicated order
                        candidate = prefix + candidate_slug
                        if candidate in known_ids:
                            area["degreeId"] = candidate
                            break
                    if area.get("degreeId"):
                        break


def run_degrees(subject: str | None = None, degree_id: str | None = None, stubs_only: bool = False) -> None:
    import scrape_degrees

    if stubs_only:
        data = scrape_degrees.scrape_stubs()
        if not data:
            log.error("Degrees scraper returned no data")
            sys.exit(1)
        existing = {d["id"]: d for d in _load("degrees.json", [])}
        for d in data:
            if not d.get("stub") or d["id"] not in existing or existing[d["id"]].get("stub"):
                existing[d["id"]] = d
        _write("degrees.json", list(existing.values()))
        return

    if degree_id:
        degree = scrape_degrees.scrape_one(degree_id)
        if not degree:
            log.error("No degree found for id: %s", degree_id)
            sys.exit(1)
        existing = {d["id"]: d for d in _load("degrees.json", [])}
        existing[degree["id"]] = degree
        all_degrees = list(existing.values())
        _validate_concentration_links(all_degrees)
        _write("degrees.json", all_degrees)
        return

    # Full scrape — write and emit after each degree so the frontend can update in real-time
    existing = {d["id"]: d for d in _load("degrees.json", [])}
    already_full = {d["id"] for d in existing.values() if not d.get("stub")}
    degrees_path = DATA_DIR / "degrees.json"
    count = 0
    for degree in scrape_degrees.scrape_each(skip_ids=already_full):
        existing[degree["id"]] = degree
        # Write incrementally so the data is available immediately
        with open(degrees_path, "w") as f:
            json.dump(list(existing.values()), f, indent=2, ensure_ascii=False)
        count += 1
        # Emit a parseable marker on stdout — the API strips this into a {degree:...} SSE event
        print(f"__DEGREE__:{json.dumps(degree, ensure_ascii=False)}", flush=True)

    if not count and not already_full:
        log.error("Degrees scraper returned no data")
        sys.exit(1)

    # Final pass: validate and fill in concentration area degree ID cross-references
    all_degrees = list(existing.values())
    _validate_concentration_links(all_degrees)
    with open(degrees_path, "w") as f:
        json.dump(all_degrees, f, indent=2, ensure_ascii=False)

    log.info("Degrees total scraped: %d, file entries: %d", count, len(existing))
    print(f"Saved degrees.json ({len(existing)} items)", flush=True)


def run_rmp(subject: str | None = None, professor: str | None = None) -> None:
    import scrape_rmp
    grade_dist = _load("grade_dist.json", [])
    if not grade_dist:
        log.error("grade_dist.json not found — run the grades scraper first")
        sys.exit(1)
    professors_filter = [professor] if professor else None
    result = scrape_rmp.scrape(grade_dist, subject=subject, professors_filter=professors_filter)
    if not result:
        log.error("RMP scraper returned no data")
        sys.exit(1)
    existing = _load("professors.json", {})
    merged = {**existing, **result}
    _write("professors.json", merged)


TARGETS = {
    "catalog":  run_catalog,
    "grades":   run_grades,
    "degrees":  run_degrees,
    "rmp":      run_rmp,
    "subjects": run_subjects,
}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("target", choices=sorted(TARGETS))
    parser.add_argument("--subject",   default=None, help="Scope to this subject (e.g. CMP_SC)")
    parser.add_argument("--professor", default=None, help="Scope RMP lookup to this professor name")
    parser.add_argument("--degree-id",   default=None,  help="Scrape only this degree (URL slug)")
    parser.add_argument("--stubs-only",  action="store_true", help="Only index degree names/colleges, no course scraping")
    args = parser.parse_args()

    scope = f" (subject={args.subject})" if args.subject else ""
    scope += f" (professor={args.professor})" if args.professor else ""
    scope += f" (degree-id={args.degree_id})" if args.degree_id else ""
    scope += " (stubs-only)" if args.stubs_only else ""
    log.info("Starting scraper: %s%s", args.target, scope)

    if args.target == "rmp":
        run_rmp(subject=args.subject, professor=args.professor)
    elif args.target == "subjects":
        run_subjects()
    elif args.target == "degrees":
        run_degrees(subject=args.subject, degree_id=args.degree_id, stubs_only=args.stubs_only)
    else:
        TARGETS[args.target](subject=args.subject)

    log.info("Done: %s", args.target)
