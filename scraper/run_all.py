"""
Orchestrates all four scrapers and writes final JSON files to /public/data/.
Run from repo root or from /scraper/.
"""

import json
import logging
import sys
import traceback
from pathlib import Path

# Allow running from repo root or from /scraper/
sys.path.insert(0, str(Path(__file__).parent))

import scrape_grades
import scrape_catalog
import scrape_degrees
import scrape_rmp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "public" / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def load_existing(path: Path, fallback):
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return fallback


def write_json(path: Path, data) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    log.info("Wrote %s (%d items)", path.name, len(data) if isinstance(data, (list, dict)) else 1)


def run() -> None:
    errors: list[str] = []

    # ── 1. Grade distribution ────────────────────────────────────────────
    log.info("=== Scraping grade distribution ===")
    try:
        grade_dist = scrape_grades.scrape()
        if not grade_dist:
            log.warning("Grade dist scraper returned no data; keeping existing file")
            grade_dist = load_existing(DATA_DIR / "grade_dist.json", [])
    except Exception:
        tb = traceback.format_exc()
        log.error("Grade dist scraper crashed:\n%s", tb)
        errors.append(f"scrape_grades: {tb}")
        grade_dist = load_existing(DATA_DIR / "grade_dist.json", [])

    # Deduplicate by (courseId, term, professor)
    seen_gd: set[tuple] = set()
    deduped_gd = []
    for r in grade_dist:
        key = (r.get("courseId"), r.get("term"), r.get("professor"))
        if key not in seen_gd:
            seen_gd.add(key)
            deduped_gd.append(r)
    write_json(DATA_DIR / "grade_dist.json", deduped_gd)

    # ── 2. Course catalog ────────────────────────────────────────────────
    log.info("=== Scraping course catalog ===")
    try:
        catalog = scrape_catalog.scrape()
        if not catalog:
            log.warning("Catalog scraper returned no data; keeping existing file")
            catalog = load_existing(DATA_DIR / "courses.json", [])
    except Exception:
        tb = traceback.format_exc()
        log.error("Catalog scraper crashed:\n%s", tb)
        errors.append(f"scrape_catalog: {tb}")
        catalog = load_existing(DATA_DIR / "courses.json", [])

    # Deduplicate by id
    seen_courses: dict[str, dict] = {}
    for c in catalog:
        seen_courses[c["id"]] = c
    write_json(DATA_DIR / "courses.json", list(seen_courses.values()))

    # ── 3. Degree requirements ───────────────────────────────────────────
    log.info("=== Scraping degree requirements ===")
    try:
        degrees = scrape_degrees.scrape()
        if not degrees:
            log.warning("Degrees scraper returned no data; keeping existing file")
            degrees = load_existing(DATA_DIR / "degrees.json", [])
    except Exception:
        tb = traceback.format_exc()
        log.error("Degrees scraper crashed:\n%s", tb)
        errors.append(f"scrape_degrees: {tb}")
        degrees = load_existing(DATA_DIR / "degrees.json", [])

    seen_degrees: dict[str, dict] = {}
    for d in degrees:
        seen_degrees[d["id"]] = d
    write_json(DATA_DIR / "degrees.json", list(seen_degrees.values()))

    # ── 4. RateMyProfessors ──────────────────────────────────────────────
    log.info("=== Scraping RateMyProfessors ===")
    try:
        professors = scrape_rmp.scrape(deduped_gd)
        if not professors:
            log.warning("RMP scraper returned no data; keeping existing file")
            professors = load_existing(DATA_DIR / "professors.json", {})
    except Exception:
        tb = traceback.format_exc()
        log.error("RMP scraper crashed:\n%s", tb)
        errors.append(f"scrape_rmp: {tb}")
        professors = load_existing(DATA_DIR / "professors.json", {})

    # Merge: keep existing entries for professors not in new results
    existing_profs = load_existing(DATA_DIR / "professors.json", {})
    merged_profs = {**existing_profs, **professors}
    write_json(DATA_DIR / "professors.json", merged_profs)

    # ── Summary ──────────────────────────────────────────────────────────
    log.info("=== Run complete ===")
    log.info("  grade_dist: %d records", len(deduped_gd))
    log.info("  courses:    %d courses", len(seen_courses))
    log.info("  degrees:    %d degrees", len(seen_degrees))
    log.info("  professors: %d entries", len(merged_profs))

    if errors:
        log.error("%d scraper(s) had errors:", len(errors))
        for e in errors:
            log.error("  - %s", e[:200])
        sys.exit(1)


if __name__ == "__main__":
    run()
