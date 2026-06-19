#!/usr/bin/env node
// Pre-build script: splits courses.json by subject and generates a search index.
// Output:
//   public/data/by-subject/{SUBJECT}.json  -> { courses, gpaMap, professorCountMap }
//   public/data/search-index.json          -> [{ id, code, title }]
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'public', 'data');
const BY_SUBJECT_DIR = path.join(DATA_DIR, 'by-subject');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

console.log('Reading source data files...');
const courses = readJson('courses.json', []);
const gradeDist = readJson('grade_dist.json', []);

if (!courses.length) {
  console.log('No courses found — skipping split.');
  process.exit(0);
}

// courseId → subject lookup (avoids string-splitting ambiguity)
const courseIdToSubject = {};
for (const c of courses) courseIdToSubject[c.id] = c.subject;

// Group courses by subject
const coursesBySubject = {};
for (const c of courses) {
  if (!coursesBySubject[c.subject]) coursesBySubject[c.subject] = [];
  coursesBySubject[c.subject].push(c);
}

// GPA sums/counts per courseId
const gpaSums = {};
const gpaCounts = {};
const profsByCourse = {};
for (const r of gradeDist) {
  gpaSums[r.courseId] = (gpaSums[r.courseId] || 0) + r.avgGPA;
  gpaCounts[r.courseId] = (gpaCounts[r.courseId] || 0) + 1;
  if (!profsByCourse[r.courseId]) profsByCourse[r.courseId] = new Set();
  profsByCourse[r.courseId].add(r.professor);
}

fs.mkdirSync(BY_SUBJECT_DIR, { recursive: true });

const subjects = Object.keys(coursesBySubject).sort();
console.log(`Generating ${subjects.length} subject files...`);

for (const subject of subjects) {
  const subjectCourses = coursesBySubject[subject];

  const gpaMap = {};
  const professorCountMap = {};
  for (const c of subjectCourses) {
    gpaMap[c.id] = gpaCounts[c.id]
      ? Math.round((gpaSums[c.id] / gpaCounts[c.id]) * 100) / 100
      : null;
    professorCountMap[c.id] = profsByCourse[c.id]?.size ?? 0;
  }

  fs.writeFileSync(
    path.join(BY_SUBJECT_DIR, `${subject}.json`),
    JSON.stringify({ courses: subjectCourses, gpaMap, professorCountMap })
  );
}

// Search index: one entry per course
console.log('Generating search index...');
const searchIndex = courses.map(c => ({
  id: c.id,
  code: `${c.subject} ${c.number}`,
  title: c.title,
}));
fs.writeFileSync(
  path.join(DATA_DIR, 'search-index.json'),
  JSON.stringify(searchIndex)
);

console.log(`Done. ${subjects.length} subject files, ${searchIndex.length} search entries.`);
