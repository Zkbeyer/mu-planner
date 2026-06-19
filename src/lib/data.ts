import type { Course, GradeRecord, Degree, ProfessorsMap } from '@/types';
import { professorSlug as _professorSlug } from './utils';
import coursesRaw from '../../public/data/courses.json';
import gradeDistRaw from '../../public/data/grade_dist.json';
import degreesRaw from '../../public/data/degrees.json';
import professorsRaw from '../../public/data/professors.json';

export const courses: Course[] = coursesRaw as Course[];
export const gradeDist: GradeRecord[] = gradeDistRaw as GradeRecord[];
export const degrees: Degree[] = degreesRaw as Degree[];
export const professors: ProfessorsMap = professorsRaw as unknown as ProfessorsMap;

export function getCourse(id: string): Course | undefined {
  return courses.find((c) => c.id === id);
}

export function getCourseGradeRecords(courseId: string): GradeRecord[] {
  return gradeDist.filter((r) => r.courseId === courseId);
}

export function getCourseAvgGPA(courseId: string): number | null {
  const records = getCourseGradeRecords(courseId);
  if (!records.length) return null;
  const sum = records.reduce((acc, r) => acc + r.avgGPA, 0);
  return Math.round((sum / records.length) * 100) / 100;
}

export function getProfessor(name: string) {
  return professors[name] ?? null;
}

export { professorSlug } from './utils';

export function getProfessorBySlug(slug: string) {
  const entry = Object.values(professors).find((p) => _professorSlug(p.name) === slug);
  return entry ?? null;
}

export function getProfessorRecords(name: string): GradeRecord[] {
  return gradeDist.filter((r) => r.professor === name);
}

export function getDegree(id: string): Degree | undefined {
  return degrees.find((d) => d.id === id);
}

export function getUniqueProfessors(): string[] {
  return Array.from(new Set(gradeDist.map((r) => r.professor)));
}
