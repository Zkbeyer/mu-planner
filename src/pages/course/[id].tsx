import { useState, useMemo } from 'react';
import type { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import type { Course, GradeRecord, Professor } from '@/types';
import { professorSlug } from '@/lib/utils';
import { readCourses, readGradeDist, readProfessors } from '@/lib/data-server';

import GPABadge from '@/components/GPABadge';
import RMPBadge from '@/components/RMPBadge';
import GPATrendChart from '@/components/GPATrendChart';
import { useIsMobile } from '@/lib/hooks';
import MobileCourseDetail from '@/components/mobile/MobileCourseDetail';

type SortKey = 'professor' | 'avgGPA' | 'terms';
type SortDir = 1 | -1;

type ProfessorGroup = {
  professor: string;
  avgGPA: number;
  termCount: number;
  latestTerm: string;
  pctA: number; pctB: number; pctC: number; pctD: number; pctF: number; pctW: number;
  termBreakdown: GradeRecord[];
};

const TERM_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };
function termVal(t: string) {
  const [s, y] = t.split(' ');
  return parseInt(y) * 10 + (TERM_ORDER[s] ?? 0);
}

interface CourseDetailProps {
  course: Course;
  records: GradeRecord[];
  avgGPA: number | null;
  professorMap: Record<string, Professor | null>;
  prereqCourses: Pick<Course, 'id' | 'title'>[];
}

const GRADE_KEYS = ['A', 'B', 'C', 'D', 'F', 'W'] as const;
const GRADE_COLORS: Record<string, string> = {
  A: '#1a7a3c', B: '#2563eb', C: '#ca8a04', D: '#ea580c', F: '#dc2626', W: '#9a9390',
};

function matchesCourse(courseName: string | null | undefined, number: string): boolean {
  if (!courseName) return false;
  return courseName.includes(number);
}

function RatingDot({ value }: { value: number }) {
  const pct = (value / 5) * 100;
  const color = pct >= 70 ? 'var(--gold)' : pct >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: color, border: '2px solid var(--black)', marginRight: 6, verticalAlign: 'middle',
    }} />
  );
}

export default function CourseDetail({ course, records, avgGPA, professorMap, prereqCourses }: CourseDetailProps) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState<SortKey>('avgGPA');
  const [sortDir, setSortDir] = useState<SortDir>(-1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const professorGroups = useMemo((): ProfessorGroup[] => {
    const groups: Record<string, GradeRecord[]> = {};
    for (const r of records) {
      if (!groups[r.professor]) groups[r.professor] = [];
      groups[r.professor].push(r);
    }
    return Object.entries(groups).map(([professor, recs]) => {
      const avg = (fn: (r: GradeRecord) => number) =>
        Math.round((recs.reduce((s, r) => s + fn(r), 0) / recs.length) * 10) / 10;
      const termsSorted = [...recs].sort((a, b) => termVal(b.term) - termVal(a.term));
      return {
        professor,
        avgGPA:       Math.round((recs.reduce((s, r) => s + r.avgGPA, 0) / recs.length) * 100) / 100,
        termCount:    recs.length,
        latestTerm:   termsSorted[0]?.term ?? '',
        pctA: avg(r => r.pctA), pctB: avg(r => r.pctB), pctC: avg(r => r.pctC),
        pctD: avg(r => r.pctD), pctF: avg(r => r.pctF), pctW: avg(r => r.pctW),
        termBreakdown: termsSorted,
      };
    });
  }, [records]);

  const sorted = useMemo(() => [...professorGroups].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'professor') cmp = a.professor.localeCompare(b.professor);
    else if (sortKey === 'terms') cmp = a.termCount - b.termCount;
    else cmp = a.avgGPA - b.avgGPA;
    return cmp * sortDir;
  }), [professorGroups, sortKey, sortDir]);

  if (isMobile) return <MobileCourseDetail course={course} records={records} avgGPA={avgGPA} professorMap={professorMap} prereqCourses={prereqCourses} />;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setSortDir(-1); }
  }

  const COLS = [
    { key: 'terms' as SortKey,     label: 'TERMS',     flex: '0 0 72px' },
    { key: 'professor' as SortKey, label: 'PROFESSOR', flex: '1 1 200px' },
    { key: 'avgGPA' as SortKey,    label: 'AVG GPA',   flex: '0 0 80px' },
  ];

  return (
    <>
      <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}`}</style>
      <Head><title>{`${course.subject} ${course.number} — ${course.title} | MU Planner`}</title></Head>

      <div style={{ maxWidth: 1020, margin: '0 auto', padding: '32px 48px 64px' }}>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-5 font-sans text-sm">
          <Link href="/" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Search</Link>
          <span style={{ color: 'var(--g400)' }}>›</span>
          <span style={{ color: 'var(--g400)' }}>{course.subject}</span>
          <span style={{ color: 'var(--g400)' }}>›</span>
          <span className="font-semibold" style={{ color: 'var(--black)' }}>{course.subject} {course.number}</span>
        </div>

        {/* Header card */}
        <div className="card-dark" style={{
          background: 'var(--black)', borderRadius: 8, padding: '28px 32px', marginBottom: 24,
          border: '2px solid var(--black)', boxShadow: '4px 4px 0 var(--black)',
        }}>
          <div className="flex items-start gap-6">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="chip chip-black" style={{ width: 'fit-content' }}>{course.subject} {course.number}</span>
              <div className="font-syne font-extrabold" style={{ fontSize: 28, color: 'var(--white)', lineHeight: 1.1 }}>
                {course.title}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>
                  {course.credits} Credits
                </span>
                <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>
                  {course.subject}
                </span>
                <GPABadge gpa={avgGPA} />
              </div>
              <p className="font-sans text-sm leading-relaxed" style={{ color: 'var(--g400)', maxWidth: 560 }}>
                {course.description}
              </p>
              {course.prerequisites.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="label" style={{ color: 'var(--g600)' }}>Prerequisites</span>
                  {course.prerequisites.map((pid) => {
                    const pre = prereqCourses.find((p) => p.id === pid);
                    return (
                      <Link key={pid} href={`/course/${pid}`}>
                        <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)', cursor: 'pointer' }}>
                          {pid.replace('_', ' ')}{pre ? ` — ${pre.title}` : ''}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
            {/* GPA Trend */}
            {records.length >= 2 && (
              <div className="card" style={{ padding: '20px 24px' }}>
                <span className="sec-strip" style={{ marginBottom: 16 }}>GPA Trend Over Time</span>
                <GPATrendChart records={records} />
              </div>
            )}

            {/* Sections table */}
            <div>
              <span className="sec-strip" style={{ marginBottom: 12 }}>
                Instructors — Click Row to Expand
              </span>
              <div style={{ border: '2px solid var(--black)', borderRadius: 8, overflow: 'hidden', boxShadow: '4px 4px 0 var(--black)' }}>
                <div className="tbl-header">
                  {COLS.map((col) => (
                    <div
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      style={{
                        flex: col.flex, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        color: sortKey === col.key ? 'var(--gold)' : 'rgba(255,255,255,0.5)',
                        fontSize: 10, fontFamily: 'Syne', fontWeight: 700, letterSpacing: 1.5, userSelect: 'none',
                      }}
                    >
                      {col.label}
                      {sortKey === col.key ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
                    </div>
                  ))}
                  <div style={{ flex: '1 1 220px', color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Syne', fontWeight: 700, letterSpacing: 1.5 }}>
                    A / B / C / D / F / W
                  </div>
                  <div style={{ width: 24 }} />
                </div>

                {sorted.length === 0 ? (
                  <p className="font-sans text-sm italic text-center py-8" style={{ color: 'var(--g400)' }}>
                    No grade distribution data yet.
                  </p>
                ) : sorted.map((group) => {
                  const rowKey = group.professor;
                  const isOpen = expandedRow === rowKey;
                  const prof = professorMap[group.professor];
                  return (
                    <div
                      key={rowKey}
                      style={{
                        borderTop: '1px solid var(--g100)',
                        background: isOpen ? '#fffdf0' : 'var(--white)',
                        borderLeft: `3px solid ${isOpen ? 'var(--gold)' : 'transparent'}`,
                        transition: 'background 0.15s',
                      }}
                      onClick={() => setExpandedRow(isOpen ? null : rowKey)}
                    >
                      <div className="tbl-row" style={{ gap: 0 }}>
                        <div style={{ flex: '0 0 72px' }}>
                          <span className="font-mono text-xs font-medium" style={{ color: 'var(--g600)' }}>
                            {group.termCount} {group.termCount === 1 ? 'term' : 'terms'}
                          </span>
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Link
                                href={`/professor/${professorSlug(group.professor)}`}
                                onClick={(e) => e.stopPropagation()}
                                className="font-sans font-semibold text-sm"
                                style={{ color: 'var(--black)', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--gold)' }}
                              >
                                {group.professor}
                              </Link>
                              {prof?.rmpUrl && (
                                <a href={prof.rmpUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ fontSize: 10, color: 'var(--g400)', textDecoration: 'none' }}>
                                  [RMP ↗]
                                </a>
                              )}
                            </div>
                            <RMPBadge professor={prof} />
                          </div>
                        </div>
                        <div style={{ flex: '0 0 80px' }}>
                          <GPABadge gpa={group.avgGPA} />
                        </div>
                        <div style={{ flex: '1 1 220px' }}>
                          <span className="font-mono text-xs" style={{ color: 'var(--black)' }}>
                            {group.pctA.toFixed(0)}% / {group.pctB.toFixed(0)}% / {group.pctC.toFixed(0)}% / {group.pctD.toFixed(0)}% / {group.pctF.toFixed(0)}% / {group.pctW.toFixed(0)}%
                          </span>
                        </div>
                        <div style={{ width: 24, textAlign: 'center', color: 'var(--g400)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</div>
                      </div>

                      {isOpen && (
                        <div style={{ padding: '8px 16px 14px 36px', background: '#fffdf0', borderTop: '1px dashed var(--g200)' }}>
                          <div className="flex gap-8 flex-wrap">
                            <div style={{ minWidth: 180 }}>
                              <span className="label text-xs mb-2 block">Avg Grade Breakdown</span>
                              {GRADE_KEYS.map((grade) => {
                                const pct = group[`pct${grade}` as keyof ProfessorGroup] as number;
                                return (
                                  <div key={grade} className="flex items-center gap-2 mb-1">
                                    <span className="font-mono font-bold text-xs w-4" style={{ color: 'var(--black)' }}>{grade}</span>
                                    <div style={{ flex: 1, height: 6, background: 'var(--g200)', borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{ width: `${pct}%`, height: '100%', background: GRADE_COLORS[grade] ?? 'var(--g400)', transition: 'width 0.3s' }} />
                                    </div>
                                    <span className="font-mono text-xs w-9 text-right" style={{ color: 'var(--g600)' }}>{pct.toFixed(1)}%</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ minWidth: 160 }}>
                              <span className="label text-xs mb-2 block">By Term</span>
                              {group.termBreakdown.map((r) => (
                                <div key={r.term} className="flex justify-between gap-4 font-sans text-xs mb-1" style={{ color: 'var(--g600)' }}>
                                  <span>{r.term}</span>
                                  <span className="font-mono" style={{ color: 'var(--black)' }}>{r.avgGPA.toFixed(2)} GPA</span>
                                </div>
                              ))}
                            </div>
                            {prof?.tags && prof.tags.length > 0 && (
                              <div>
                                <span className="label text-xs mb-2 block">RMP Tags</span>
                                <div className="flex flex-wrap gap-1.5">
                                  {prof.tags.map((tag) => (
                                    <span key={tag} className="chip" style={{ fontSize: 10 }}>{tag}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Student Reviews (RMP comments for this course) */}
            {(() => {
              const courseComments: Array<{ comment: import('@/types').RMPComment; professor: string }> = [];
              for (const [profName, prof] of Object.entries(professorMap)) {
                if (!prof?.comments) continue;
                for (const c of prof.comments) {
                  if (matchesCourse(c.courseName, course.number)) {
                    courseComments.push({ comment: c, professor: profName });
                  }
                }
              }
              if (courseComments.length === 0) return null;
              return (
                <div>
                  <span className="sec-strip" style={{ marginBottom: 12 }}>Student Reviews</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {courseComments.map(({ comment, professor }, i) => (
                      <div key={i} className="card" style={{ padding: '14px 16px' }}>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <Link
                            href={`/professor/${professorSlug(professor)}`}
                            className="font-sans font-semibold text-xs"
                            style={{ color: 'var(--black)', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--gold)' }}
                          >
                            {professor}
                          </Link>
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            <RatingDot value={comment.rating} />
                            <span className="font-mono font-medium" style={{ fontSize: 13 }}>{comment.rating}/5</span>
                          </span>
                          <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>Diff {comment.difficulty}/5</span>
                          {comment.wouldTakeAgain && (
                            <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>Would take again</span>
                          )}
                          <span className="font-sans text-xs ml-auto" style={{ color: 'var(--g400)' }}>{comment.date}</span>
                        </div>
                        <p className="font-sans text-xs" style={{ color: 'var(--g600)', lineHeight: 1.55, margin: 0 }}>{comment.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '18px 20px' }}>
              <span className="sec-strip" style={{ marginBottom: 14 }}>Quick Stats</span>
              {[
                ['Avg GPA', avgGPA ? avgGPA.toFixed(2) : 'N/A'],
                ['Sections', records.length.toString()],
                ['Instructors', professorGroups.length.toString()],
                ['Credits', course.credits.toString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--g100)' }}>
                  <span className="font-sans text-xs" style={{ color: 'var(--g600)' }}>{k}</span>
                  <span className="font-mono text-sm font-medium" style={{ color: 'var(--black)' }}>{v}</span>
                </div>
              ))}
            </div>

            {course.prerequisites.length === 0 && (
              <div className="card card-gold" style={{ padding: '14px 16px' }}>
                <span className="font-syne font-bold text-xs tracking-wider" style={{ textTransform: 'uppercase', letterSpacing: 2, color: 'rgba(0,0,0,0.5)', display: 'block', marginBottom: 6 }}>
                  No Prerequisites
                </span>
                <p className="font-sans text-xs" style={{ color: 'rgba(0,0,0,0.6)' }}>
                  Anyone can enroll in this course.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Module-level cache to avoid re-reading large JSON files for each page ──────
let _courses: Course[] | null = null;
let _gradeDist: GradeRecord[] | null = null;
let _professors: ReturnType<typeof readProfessors> | null = null;

function cachedCourses()   { return (_courses   ??= readCourses()); }
function cachedGradeDist() { return (_gradeDist ??= readGradeDist()); }
function cachedProfessors(){ return (_professors ??= readProfessors()); }

export const getStaticPaths: GetStaticPaths = () => {
  const courses = cachedCourses();
  return {
    paths: courses.map(c => ({ params: { id: c.id } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<CourseDetailProps> = async ({ params }) => {
  const id = params?.id as string;
  const courses = cachedCourses();
  const course = courses.find(c => c.id === id);
  if (!course) return { notFound: true };

  const gradeDist = cachedGradeDist();
  const records = gradeDist.filter(r => r.courseId === id);

  const avgGPA = records.length
    ? Math.round((records.reduce((a, r) => a + r.avgGPA, 0) / records.length) * 100) / 100
    : null;

  const professorsMap = cachedProfessors();
  const professorMap: Record<string, Professor | null> = {};
  for (const r of records) {
    if (!(r.professor in professorMap)) professorMap[r.professor] = professorsMap[r.professor] ?? null;
  }

  const prereqCourses = course.prerequisites
    .map(pid => courses.find(c => c.id === pid))
    .filter((c): c is Course => c !== undefined)
    .map(({ id, title }) => ({ id, title }));

  return { props: { course, records, avgGPA, professorMap, prereqCourses } };
};
