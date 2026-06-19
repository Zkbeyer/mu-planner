import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import type { Course, Degree } from '@/types';
import { readCourses, readDegrees, readGradeDist, computeGpaMap } from '@/lib/data-server';
import SemesterPlanner from '@/components/SemesterPlanner';
import ScraperLoader from '@/components/ScraperLoader';

const NEEDS = [
  { key: 'courses' as const, scraper: 'catalog', label: 'Course Catalog', description: 'Scrapes course titles, descriptions, and credit hours from the Mizzou catalog.' },
  { key: 'degrees' as const, scraper: 'degrees', label: 'Degree Requirements', description: 'Scrapes degree plans and required courses from the Mizzou catalog.' },
];

interface PlannerProps {
  courses: Course[];
  degrees: Degree[];
  gpaMap: Record<string, number | null>;
}

export default function PlannerPage({ courses, degrees, gpaMap }: PlannerProps) {
  return (
    <ScraperLoader needs={NEEDS}>
      <Head><title>Semester Planner | MU Planner</title></Head>
      <SemesterPlanner courses={courses} degrees={degrees} gpaMap={gpaMap} />
    </ScraperLoader>
  );
}

export const getServerSideProps: GetServerSideProps<PlannerProps> = async () => {
  const courses = readCourses();
  const degrees = readDegrees();
  const gradeDist = readGradeDist();
  const gpaMap = computeGpaMap(courses.map((c) => c.id), gradeDist);
  return { props: { courses, degrees, gpaMap } };
};
