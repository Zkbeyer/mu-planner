// Decides which catalog courses are "active" (worth showing by default).
//
// The catalog lists ~11k courses, but more than half have no grade records —
// many haven't been offered in years. Missing grade data alone is a weak signal
// (grad sections are often reported under the 4xxx number, W/H variants under
// the base number, and some departments have no grade data at all), so a course
// counts as active if ANY of these hold:
//
//   1. It, or a linked sibling, has grade records in the last ACTIVE_YEARS years
//      (measured back from the newest term in the data, so the window rolls
//      forward on its own). Siblings = W/H variants of the same number, plus
//      courses named in "cross-leveled with" / "same as" in the description.
//   2. It, or a sibling, is referenced by any degree in degrees.json.
//   3. Its department has too little grade data to judge (under MIN_COVERAGE of
//      its catalog has ever had grade records, e.g. LATIN, RUSS, PORT) — no
//      reliable signal, so nothing there is hidden.
//
// Inactive courses are never deleted — course pages, saved plans and links keep
// working. The UI just tucks them behind a "show older courses" toggle.

const ACTIVE_YEARS = 3;
const MIN_COVERAGE = 0.2;
const SEASON = { Spring: 0, Summer: 1, Fall: 2 };

function termValue(term) {
  const [season, year] = String(term).split(' ');
  return Number(year) * 3 + (SEASON[season] ?? 0);
}

function baseId(id) {
  return id.replace(/(\d)[A-Z]+$/, '$1'); // CMP_SC_4320W -> CMP_SC_4320
}

const SIBLING_RE = /(?:cross-level\w*\s+with|same\s+as)\s+((?:[A-Z][A-Z_]*\s*\d{4}[A-Z]*[\s,]*(?:and|or)?\s*)+)/gi;
const CODE_RE = /([A-Z][A-Z_]*)\s*(\d{4}[A-Z]*)/g;

function collectDegreeRefs(node, out) {
  if (Array.isArray(node)) {
    for (const v of node) collectDegreeRefs(v, out);
  } else if (node && typeof node === 'object') {
    if (typeof node.courseId === 'string') out.add(node.courseId);
    for (const v of Object.values(node)) collectDegreeRefs(v, out);
  }
}

function classifyCourses(courses, gradeDist, degrees) {
  // Union-find over course ids so siblings share one activity verdict.
  const parent = new Map();
  const find = (a) => {
    if (!parent.has(a)) parent.set(a, a);
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)));
      a = parent.get(a);
    }
    return a;
  };
  const union = (a, b) => parent.set(find(a), find(b));

  for (const c of courses) {
    union(c.id, baseId(c.id));
    for (const m of (c.description || '').matchAll(SIBLING_RE)) {
      for (const [, subj, num] of m[1].matchAll(CODE_RE)) union(c.id, `${subj}_${num}`);
    }
  }

  const lastTerm = {};
  let newest = 0;
  for (const r of gradeDist) {
    const v = termValue(r.term);
    if (!lastTerm[r.courseId] || v > termValue(lastTerm[r.courseId])) lastTerm[r.courseId] = r.term;
    if (v > newest) newest = v;
  }

  // Share of each department's catalog that has ever had grade records.
  const totals = {};
  const withGrades = {};
  for (const c of courses) {
    totals[c.subject] = (totals[c.subject] || 0) + 1;
    if (lastTerm[c.id]) withGrades[c.subject] = (withGrades[c.subject] || 0) + 1;
  }
  const lowSignal = new Set(
    Object.keys(totals).filter(s => (withGrades[s] || 0) / totals[s] < MIN_COVERAGE)
  );
  const cutoff = newest - ACTIVE_YEARS * 3;

  const activeGroups = new Set();
  for (const [id, term] of Object.entries(lastTerm)) {
    if (termValue(term) >= cutoff) activeGroups.add(find(id));
  }
  const degreeRefs = new Set();
  collectDegreeRefs(degrees, degreeRefs);
  for (const id of degreeRefs) activeGroups.add(find(id));

  const active = {};
  for (const c of courses) {
    active[c.id] = lowSignal.has(c.subject) || activeGroups.has(find(c.id));
  }
  return { active, lastTerm };
}

module.exports = { classifyCourses, termValue, ACTIVE_YEARS, MIN_COVERAGE };
