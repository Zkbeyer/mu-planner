import type { NextApiRequest, NextApiResponse } from 'next';
import { readSubjects, readCourses } from '@/lib/data-server';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const subjects = readSubjects();
  const courses = readCourses();

  const courseCountMap: Record<string, number> = {};
  for (const c of courses) {
    courseCountMap[c.subject] = (courseCountMap[c.subject] || 0) + 1;
  }

  res.json({
    subjects: subjects.map(code => ({
      code,
      courseCount: courseCountMap[code] ?? 0,
    })),
  });
}
