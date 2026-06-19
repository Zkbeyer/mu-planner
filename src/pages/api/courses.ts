import type { NextApiRequest, NextApiResponse } from 'next';
import { readCourses, readGradeDist, computeGpaMap } from '@/lib/data-server';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const subject = req.query.subject as string | undefined;
  if (!subject) {
    res.status(400).json({ error: 'subject is required' });
    return;
  }

  const allCourses = readCourses();
  const courses = allCourses.filter(c => c.subject === subject);

  const allGrades = readGradeDist();
  const grades = allGrades.filter(g => g.courseId.startsWith(subject + '_'));

  const gpaMap = computeGpaMap(courses.map(c => c.id), grades);

  const profMap: Record<string, Set<string>> = {};
  for (const r of grades) {
    if (!profMap[r.courseId]) profMap[r.courseId] = new Set();
    profMap[r.courseId].add(r.professor);
  }
  const professorCountMap: Record<string, number> = {};
  for (const [id, profs] of Object.entries(profMap)) {
    professorCountMap[id] = profs.size;
  }

  res.json({ subject, courses, gpaMap, professorCountMap });
}
