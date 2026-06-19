"""
Updates only professors.json from RateMyProfessors.
Merges with the existing file so non-RMP professors are preserved.
"""

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import scrape_rmp

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "public" / "data"


def main() -> None:
    grade_dist_path = DATA_DIR / "grade_dist.json"
    if not grade_dist_path.exists():
        log.error("grade_dist.json not found — run run_all.py first")
        sys.exit(1)

    with open(grade_dist_path) as f:
        grade_dist = json.load(f)

    professors = scrape_rmp.scrape(grade_dist)

    existing: dict = {}
    prof_path = DATA_DIR / "professors.json"
    if prof_path.exists():
        try:
            raw = json.loads(prof_path.read_text())
            if isinstance(raw, dict):
                existing = raw
        except Exception:
            pass

    merged = {**existing, **professors}

    with open(prof_path, "w") as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)

    log.info("Done: %d professors written to professors.json", len(merged))


if __name__ == "__main__":
    main()
