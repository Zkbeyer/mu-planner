import { useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { Course, GradeRecord, Professor } from '@/types';
import { professorSlug } from '@/lib/utils';
import GPABadge from '@/components/GPABadge';
import RMPBadge from '@/components/RMPBadge';
import GPATrendChart from '@/components/GPATrendChart';

export interface MobileCourseDetailProps {
  course: Course;
  records: GradeRecord[];
  avgGPA: number | null;
  professorMap: Record<string, Professor | null>;
  prereqCourses: Pick<Course, 'id' | 'title'>[];
}

const TERM_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };
function termVal(t: string) {
  const [s, y] = t.split(' ');
  return parseInt(y) * 10 + (TERM_ORDER[s] ?? 0);
}

type ProfessorGroup = {
  professor: string;
  avgGPA: number;
  termCount: number;
  latestTerm: string;
  pctA: number; pctB: number; pctC: number; pctD: number; pctF: number; pctW: number;
  termBreakdown: GradeRecord[];
};

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
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: color, border: '2px solid var(--black)', marginRight: 5, verticalAlign: 'middle',
    }} />
  );
}

export default function MobileCourseDetail({ course, records, avgGPA, professorMap, prereqCourses }: MobileCourseDetailProps) {
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
        avgGPA:     Math.round((recs.reduce((s, r) => s + r.avgGPA, 0) / recs.length) * 100) / 100,
        termCount:  recs.length,
        latestTerm: termsSorted[0]?.term ?? '',
        pctA: avg(r => r.pctA), pctB: avg(r => r.pctB), pctC: avg(r => r.pctC),
        pctD: avg(r => r.pctD), pctF: avg(r => r.pctF), pctW: avg(r => r.pctW),
        termBreakdown: termsSorted,
      };
    });
  }, [records]);

  // Sort by avgGPA descending by default on mobile
  const sorted = useMemo(
    () => [...professorGroups].sort((a, b) => b.avgGPA - a.avgGPA),
    [professorGroups],
  );

  const courseComments = useMemo(() => {
    const out: Array<{ comment: import('@/types').RMPComment; professor: string }> = [];
    for (const [profName, prof] of Object.entries(professorMap)) {
      if (!prof?.comments) continue;
      for (const c of prof.comments) {
        if (matchesCourse(c.courseName, course.number)) out.push({ comment: c, professor: profName });
      }
    }
    return out;
  }, [professorMap, course.number]);

  const quickStats = [
    ['Avg GPA',     avgGPA ? avgGPA.toFixed(2) : 'N/A'],
    ['Sections',    records.length.toString()],
    ['Instructors', professorGroups.length.toString()],
    ['Credits',     course.credits.toString()],
  ];

  return (
    <>
      <Head><title>{`${course.subject} ${course.number} — ${course.title} | MU Planner`}</title></Head>

      {/* Breadcrumb */}
      <div style={{ padding: '12px 16px', background: 'var(--white)', borderBottom: '1px solid var(--g100)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Link href="/" style={{ color: 'var(--gold)', textDecoration: 'underline', fontSize: 13, fontFamily: 'var(--font-sans)' }}>Search</Link>
        <span style={{ color: 'var(--g400)', fontSize: 13 }}>›</span>
        <span style={{ color: 'var(--g400)', fontSize: 13, fontFamily: 'var(--font-sans)' }}>{course.subject}</span>
        <span style={{ color: 'var(--g400)', fontSize: 13 }}>›</span>
        <span style={{ color: 'var(--black)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>{course.subject} {course.number}</span>
      </div>

      {/* Dark header */}
      <div style={{ background: 'var(--black)', padding: '20px 16px 24px', borderBottom: '2px solid var(--black)' }}>
        <span className="chip chip-black" style={{ marginBottom: 10, display: 'inline-flex' }}>{course.subject} {course.number}</span>
        <div className="font-syne font-extrabold" style={{ fontSize: 22, color: 'var(--white)', lineHeight: 1.15, marginBottom: 10 }}>
          {course.title}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>{course.credits} Credits</span>
          <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>{course.subject}</span>
          <GPABadge gpa={avgGPA} />
        </div>
        {course.description && (
          <p className="font-sans" style={{ fontSize: 13, color: 'var(--g400)', lineHeight: 1.55, margin: 0 }}>
            {course.description}
          </p>
        )}
        {course.prerequisites.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <span className="label" style={{ color: 'var(--g600)', display: 'block', marginBottom: 6 }}>Prerequisites</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {course.prerequisites.map(pid => {
                const pre = prereqCourses.find(p => p.id === pid);
                return (
                  <Link key={pid} href={`/course/${pid}`}>
                    <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)', cursor: 'pointer', fontSize: 11 }}>
                      {pid.replace('_', ' ')}{pre ? ` — ${pre.title}` : ''}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Main content */}
      <div style={{ paddingBottom: 80 }}>

        {/* Quick stats 2×2 grid */}
        <div style={{ padding: '16px 14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {quickStats.map(([k, v]) => (
            <div key={k} className="card" style={{ padding: '14px 12px', textAlign: 'center' }}>
              <div className="font-mono font-medium" style={{ fontSize: 20, color: 'var(--black)' }}>{v}</div>
              <div className="label" style={{ fontSize: 9, marginTop: 4 }}>{k}</div>
            </div>
          ))}
        </div>

        {/* GPA Trend */}
        {records.length >= 2 && (
          <div style={{ margin: '14px 14px 0' }} className="card">
            <div style={{ padding: '16px' }}>
              <span className="sec-strip" style={{ marginBottom: 14, display: 'block' }}>GPA Trend Over Time</span>
              <GPATrendChart records={records} />
            </div>
          </div>
        )}

        {/* No prerequisites note */}
        {course.prerequisites.length === 0 && (
          <div style={{ margin: '14px 14px 0' }} className="card card-gold">
            <div style={{ padding: '12px 14px' }}>
              <span className="font-syne font-bold" style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                No Prerequisites
              </span>
              <p className="font-sans" style={{ fontSize: 12, color: 'rgba(0,0,0,0.6)', margin: 0 }}>
                Anyone can enroll in this course.
              </p>
            </div>
          </div>
        )}

        {/* Instructors accordion */}
        <div style={{ padding: '14px 14px 0' }}>
          <span className="sec-strip" style={{ marginBottom: 12, display: 'block' }}>
            Instructors — Tap to Expand
          </span>
          {sorted.length === 0 ? (
            <p className="font-sans" style={{ fontSize: 14, color: 'var(--g400)', textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>
              No grade distribution data yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sorted.map(group => {
                const isOpen = expandedRow === group.professor;
                const prof = professorMap[group.professor];
                return (
                  <div
                    key={group.professor}
                    className="card"
                    style={{
                      overflow: 'hidden', cursor: 'pointer',
                      borderLeft: `3px solid ${isOpen ? 'var(--gold)' : 'transparent'}`,
                      background: isOpen ? '#fffdf0' : 'var(--white)',
                      transition: 'background 0.15s',
                    }}
                    onClick={() => setExpandedRow(isOpen ? null : group.professor)}
                  >
                    {/* Summary row */}
                    <div style={{ padding: '14px 14px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                            <Link
                              href={`/professor/${professorSlug(group.professor)}`}
                              onClick={e => e.stopPropagation()}
                              className="font-sans font-semibold"
                              style={{ fontSize: 14, color: 'var(--black)', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--gold)' }}
                            >
                              {group.professor}
                            </Link>
                            {prof?.rmpUrl && (
                              <a href={prof.rmpUrl} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ fontSize: 10, color: 'var(--g400)', textDecoration: 'none' }}>
                                [RMP ↗]
                              </a>
                            )}
                          </div>
                          <RMPBadge professor={prof} />
                        </div>
                        <div style={{ flexShrink: 0, textAlign: 'right' }}>
                          <GPABadge gpa={group.avgGPA} />
                          <div className="font-sans" style={{ fontSize: 10, color: 'var(--g400)', marginTop: 4 }}>
                            {group.termCount} term{group.termCount !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <span style={{ flexShrink: 0, color: 'var(--g400)', fontSize: 11, marginTop: 2 }}>
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isOpen && (
                      <div style={{ borderTop: '1px dashed var(--g200)', padding: '14px 14px' }}>
                        <div className="label" style={{ fontSize: 9, marginBottom: 8 }}>GRADE BREAKDOWN</div>
                        {GRADE_KEYS.map(grade => {
                          const pct = group[`pct${grade}` as keyof ProfessorGroup] as number;
                          return (
                            <div key={grade} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                              <span className="font-mono font-bold" style={{ fontSize: 11, width: 14, color: 'var(--black)', flexShrink: 0 }}>{grade}</span>
                              <div style={{ flex: 1, height: 7, background: 'var(--g200)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: GRADE_COLORS[grade] ?? 'var(--g400)', transition: 'width 0.3s' }} />
                              </div>
                              <span className="font-mono" style={{ fontSize: 11, width: 38, textAlign: 'right', color: 'var(--g600)', flexShrink: 0 }}>{pct.toFixed(1)}%</span>
                            </div>
                          );
                        })}

                        <div className="label" style={{ fontSize: 9, marginTop: 14, marginBottom: 6 }}>BY TERM</div>
                        {group.termBreakdown.map(r => (
                          <div key={r.term} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--g600)', marginBottom: 3 }}>
                            <span>{r.term}</span>
                            <span className="font-mono" style={{ color: 'var(--black)' }}>{r.avgGPA.toFixed(2)} GPA</span>
                          </div>
                        ))}

                        {prof?.tags && prof.tags.length > 0 && (
                          <>
                            <div className="label" style={{ fontSize: 9, marginTop: 14, marginBottom: 6 }}>RMP TAGS</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {prof.tags.map(tag => (
                                <span key={tag} className="chip" style={{ fontSize: 10 }}>{tag}</span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Student reviews */}
        {courseComments.length > 0 && (
          <div style={{ padding: '14px 14px 0' }}>
            <span className="sec-strip" style={{ marginBottom: 12, display: 'block' }}>Student Reviews</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {courseComments.map(({ comment, professor }, i) => (
                <div key={i} className="card" style={{ padding: '14px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Link
                      href={`/professor/${professorSlug(professor)}`}
                      className="font-sans font-semibold"
                      style={{ fontSize: 12, color: 'var(--black)', textDecoration: 'underline', textDecorationStyle: 'dotted', textDecorationColor: 'var(--gold)' }}
                    >
                      {professor}
                    </Link>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <RatingDot value={comment.rating} />
                      <span className="font-mono font-medium" style={{ fontSize: 12 }}>{comment.rating}/5</span>
                    </span>
                    <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>Diff {comment.difficulty}/5</span>
                    {comment.wouldTakeAgain && (
                      <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>Would take again</span>
                    )}
                    <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginLeft: 'auto' }}>{comment.date}</span>
                  </div>
                  <p className="font-sans" style={{ fontSize: 13, color: 'var(--g600)', lineHeight: 1.55, margin: 0 }}>{comment.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
