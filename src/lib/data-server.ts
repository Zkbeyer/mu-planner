import fs from 'fs';
import path from 'path';
import type { Course, GradeRecord, Degree, ProfessorsMap, Professor, CollegeRequirement } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'public', 'data');

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function readCourses(): Course[] {
  return readJson<Course[]>('courses.json', []);
}

export function readSubjects(): string[] {
  const fromFile = readJson<string[]>('subjects.json', []);
  if (fromFile.length > 0) return fromFile;
  return [...new Set(readCourses().map(c => c.subject))].sort();
}

export function readGradeDist(): GradeRecord[] {
  return readJson<GradeRecord[]>('grade_dist.json', []);
}

export function readDegrees(): Degree[] {
  return readJson<Degree[]>('degrees.json', []);
}

export function readProfessors(): ProfessorsMap {
  return readJson<ProfessorsMap>('professors.json', {});
}

export function readCollegeRequirements(college: string): CollegeRequirement[] {
  const map = readJson<Record<string, CollegeRequirement[]>>('college_requirements.json', {});
  return map[college] ?? [];
}

export function computeGpaMap(
  courseIds: string[],
  gradeDist: GradeRecord[],
): Record<string, number | null> {
  const map: Record<string, number | null> = {};
  for (const id of courseIds) {
    const records = gradeDist.filter((r) => r.courseId === id);
    if (!records.length) {
      map[id] = null;
    } else {
      const sum = records.reduce((a, r) => a + r.avgGPA, 0);
      map[id] = Math.round((sum / records.length) * 100) / 100;
    }
  }
  return map;
}

export function getDataStatus(subject?: string, professor?: string, degreeId?: string) {
  const courses    = readCourses();
  const grades     = readGradeDist();
  const degrees    = readDegrees();
  const professors = readProfessors();
  const profList   = Object.values(professors) as Professor[];

  const fullDegrees   = degrees.filter(d => !d.stub);
  const degreesIndex  = { count: degrees.length,     ready: degrees.length > 0     };
  const degreesStatus = { count: fullDegrees.length, ready: fullDegrees.length > 3 };

  // Degree-scoped: only ready when that specific non-stub degree exists
  if (degreeId) {
    const found = degrees.some(d => d.id === degreeId && !d.stub);
    return {
      courses:      { count: courses.length,  ready: true  },
      grades:       { count: grades.length,   ready: true  },
      degrees:      { count: degrees.length,  ready: found },
      degreesIndex,
      professors:   { count: profList.length, ready: true  },
    };
  }

  if (subject) {
    const subjectCourses   = courses.filter(c => c.subject === subject);
    const subjectGrades    = grades.filter(g => g.courseId.startsWith(subject + '_'));
    const subjectProfNames = new Set(subjectGrades.map(g => g.professor));
    const professorsReady  = subjectProfNames.size > 0 &&
      [...subjectProfNames].some(name => professors[name]?.rmpSearched === true);
    return {
      courses:      { count: subjectCourses.length, ready: subjectCourses.length > 0 },
      grades:       { count: subjectGrades.length,  ready: subjectGrades.length  > 0 },
      degrees:      degreesStatus,
      degreesIndex,
      professors:   { count: subjectProfNames.size, ready: professorsReady },
    };
  }

  const professorsReady = professor
    ? professors[professor]?.rmpSearched === true
    : profList.filter(p => p.rmpSearched === true).length > 10;
  const profCount = professor
    ? (professors[professor]?.rmpSearched ? 1 : 0)
    : profList.length;

  return {
    courses:      { count: courses.length, ready: courses.length > 10 },
    grades:       { count: grades.length,  ready: grades.length  > 20 },
    degrees:      degreesStatus,
    degreesIndex,
    professors:   { count: profCount,      ready: professorsReady     },
  };
}

export type DataStatus = ReturnType<typeof getDataStatus>;
export type DataKey = keyof DataStatus;
