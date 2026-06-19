import Link from 'next/link';
import type { Course } from '@/types';
import GPABadge from './GPABadge';

interface CourseCardProps {
  course: Course;
  avgGPA: number | null;
  professorCount: number;
  index?: number;
}

export default function CourseCard({ course, avgGPA, professorCount, index = 0 }: CourseCardProps) {
  return (
    <Link href={`/course/${course.id}`} className="block">
      <div
        className="card card-hover fade-up p-5 cursor-pointer h-full"
        style={{ animationDelay: `${index * 0.04}s` }}
      >
        <div className="flex items-start justify-between mb-3 gap-2">
          <span className="chip chip-black">{course.subject} {course.number}</span>
          <GPABadge gpa={avgGPA} />
        </div>
        <div className="font-syne font-bold text-base leading-snug mb-3" style={{ color: 'var(--black)' }}>
          {course.title}
        </div>
        <div style={{ height: 1, background: 'var(--g100)', marginBottom: 12 }} />
        <div className="flex items-center justify-between">
          <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>
            {course.credits} cr. · {professorCount} prof{professorCount !== 1 ? 's' : ''}
          </span>
          <span className="font-mono text-xs font-medium" style={{ color: 'var(--gold)' }}>
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}
