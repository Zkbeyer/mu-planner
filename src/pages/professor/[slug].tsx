import type { GetStaticProps, GetStaticPaths } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import type { Professor, GradeRecord, Course } from '@/types';
import { professorSlug } from '@/lib/utils';
import { readProfessors, readGradeDist, readCourses } from '@/lib/data-server';
import { useIsMobile } from '@/lib/hooks';
import MobileProfessorPage from '@/components/mobile/MobileProfessorPage';

interface ProfessorPageProps {
  professor: Professor;
  records: GradeRecord[];
  courseMap: Record<string, { title: string; subject: string; number: string }>;
}

function RatingDot({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'var(--gold)' : pct >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: color, border: '2px solid var(--black)', marginRight: 6, verticalAlign: 'middle',
    }} />
  );
}

function GradeBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ width: 18, fontSize: 11, color: 'var(--g400)', fontFamily: 'var(--font-mono)' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--g100)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ width: 36, textAlign: 'right', fontSize: 11, color: 'var(--g600)', fontFamily: 'var(--font-mono)' }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function ProfessorPage({ professor, records, courseMap }: ProfessorPageProps) {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileProfessorPage professor={professor} records={records} courseMap={courseMap} />;

  const hasProfData = professor.avgRating !== null;

  const courseRecords: Record<string, GradeRecord[]> = {};
  for (const r of records) {
    if (!courseRecords[r.courseId]) courseRecords[r.courseId] = [];
    courseRecords[r.courseId].push(r);
  }

  const overallAvgGPA = records.length > 0
    ? Math.round((records.reduce((s, r) => s + r.avgGPA, 0) / records.length) * 100) / 100
    : null;

  return (
    <>
      <Head><title>{`${professor.name} | MU Planner`}</title></Head>

      <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 48px 64px' }}>
        <div className="flex items-center gap-2 mb-5 font-sans text-sm">
          <Link href="/" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Courses</Link>
          <span style={{ color: 'var(--g400)' }}>›</span>
          <span className="font-semibold" style={{ color: 'var(--black)' }}>{professor.name}</span>
        </div>

        <div style={{ background: 'var(--black)', borderRadius: 8, padding: '28px 32px', marginBottom: 28, border: '2px solid var(--black)', boxShadow: '4px 4px 0 var(--black)' }}>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span className="label" style={{ color: 'var(--g600)' }}>{professor.department}</span>
              <div className="font-syne font-extrabold" style={{ fontSize: 30, color: 'var(--white)', lineHeight: 1.1 }}>{professor.name}</div>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 4 }}>
                {hasProfData ? (
                  <>
                    <span className="chip chip-black">★ {professor.avgRating!.toFixed(1)} / 5.0</span>
                    <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>Difficulty {professor.avgDifficulty!.toFixed(1)} / 5.0</span>
                    <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>{professor.wouldTakeAgainPct}% Would Take Again</span>
                  </>
                ) : (
                  <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g600)' }}>No RMP data</span>
                )}
                {overallAvgGPA !== null && (
                  <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--gold)' }}>Avg GPA {overallAvgGPA.toFixed(2)}</span>
                )}
              </div>
            </div>
            {hasProfData && professor.rmpUrl && (
              <a href={professor.rmpUrl} target="_blank" rel="noopener noreferrer">
                <button className="btn" style={{ height: 40, fontSize: 12, background: 'transparent', color: 'var(--gold)', border: '2px solid var(--gold)', boxShadow: '3px 3px 0 var(--gold)', flexShrink: 0 }}>
                  View on RMP ↗
                </button>
              </a>
            )}
          </div>
          {professor.tags.length > 0 && (
            <div className="flex flex-wrap gap-2" style={{ marginTop: 18 }}>
              {professor.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#1a1a1a', border: '1px solid #333', color: 'var(--g400)', fontFamily: 'var(--font-sans)' }}>{tag}</span>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <span className="sec-strip" style={{ marginBottom: 16 }}>Courses Taught</span>
              {Object.keys(courseRecords).length === 0 ? (
                <p className="font-sans text-sm" style={{ color: 'var(--g400)' }}>No grade records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {Object.entries(courseRecords).map(([courseId, cRecords]) => {
                    const info = courseMap[courseId];
                    const avgGPA = Math.round((cRecords.reduce((s, r) => s + r.avgGPA, 0) / cRecords.length) * 100) / 100;
                    const latest = [...cRecords].sort((a, b) => b.term.localeCompare(a.term))[0];
                    return (
                      <div key={courseId} className="card" style={{ padding: '18px 20px' }}>
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div>
                            <Link href={`/course/${courseId}`} className="font-syne font-bold" style={{ fontSize: 15, color: 'var(--black)', textDecoration: 'none' }}>
                              {info ? `${info.subject} ${info.number} — ${info.title}` : courseId}
                            </Link>
                            <div className="font-sans text-xs mt-1" style={{ color: 'var(--g400)' }}>
                              {cRecords.length} section{cRecords.length !== 1 ? 's' : ''} · Most recent: {latest.term}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div className="font-mono font-medium" style={{ fontSize: 20, color: 'var(--gold)' }}>{avgGPA.toFixed(2)}</div>
                            <div className="label" style={{ fontSize: 9 }}>avg GPA</div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 10 }}>
                          <GradeBar label="A" pct={latest.pctA} color="var(--gold)" />
                          <GradeBar label="B" pct={latest.pctB} color="#6ee7b7" />
                          <GradeBar label="C" pct={latest.pctC} color="#fde68a" />
                          <GradeBar label="D" pct={latest.pctD} color="#fca5a5" />
                          <GradeBar label="F" pct={latest.pctF} color="#ef4444" />
                          <GradeBar label="W" pct={latest.pctW} color="#a3a3a3" />
                        </div>
                        <div style={{ borderTop: '1px solid var(--g100)', paddingTop: 10, marginTop: 2 }}>
                          <div className="label" style={{ marginBottom: 6 }}>All Sections</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {[...cRecords].sort((a, b) => b.term.localeCompare(a.term)).map((r) => (
                              <div key={r.term} className="flex justify-between items-center font-sans text-xs" style={{ color: 'var(--g600)' }}>
                                <span>{r.term}</span>
                                <span className="font-mono" style={{ color: 'var(--black)' }}>{r.avgGPA.toFixed(2)} GPA</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {hasProfData && (
              <div className="card" style={{ padding: '18px 20px' }}>
                <span className="sec-strip" style={{ marginBottom: 14 }}>RMP Stats</span>
                {[
                  ['Rating', `${professor.avgRating!.toFixed(1)} / 5.0`],
                  ['Difficulty', `${professor.avgDifficulty!.toFixed(1)} / 5.0`],
                  ['Would Take Again', `${professor.wouldTakeAgainPct}%`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-2" style={{ borderBottom: '1px solid var(--g100)' }}>
                    <span className="font-sans text-xs" style={{ color: 'var(--g600)' }}>{k}</span>
                    <span className="font-mono font-medium" style={{ fontSize: 14, color: 'var(--black)' }}>{v}</span>
                  </div>
                ))}
              </div>
            )}
            {professor.comments.length > 0 && (
              <div>
                <span className="sec-strip" style={{ marginBottom: 12 }}>Student Reviews</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {professor.comments.map((c, i) => (
                    <div key={i} className="card" style={{ padding: '14px 16px' }}>
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          <RatingDot value={c.rating} />
                          <span className="font-mono font-medium" style={{ fontSize: 13 }}>{c.rating}/5</span>
                        </span>
                        <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>Diff {c.difficulty}/5</span>
                        {c.wouldTakeAgain && (
                          <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>Would take again</span>
                        )}
                        {c.courseName && (
                          <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>{c.courseName}</span>
                        )}
                        <span className="font-sans text-xs ml-auto" style={{ color: 'var(--g400)' }}>{c.date}</span>
                      </div>
                      <p className="font-sans text-xs" style={{ color: 'var(--g600)', lineHeight: 1.55, margin: 0 }}>{c.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!hasProfData && professor.comments.length === 0 && (
              <div className="card" style={{ padding: '18px 20px', textAlign: 'center' }}>
                <p className="font-sans text-sm" style={{ color: 'var(--g400)', margin: 0 }}>No RateMyProfessors data available yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Module-level cache ─────────────────────────────────────────────────────────
let _professors: ReturnType<typeof readProfessors> | null = null;
let _gradeDist: GradeRecord[] | null = null;
let _courses: Course[] | null = null;

function cachedProfessors() { return (_professors ??= readProfessors()); }
function cachedGradeDist()  { return (_gradeDist  ??= readGradeDist()); }
function cachedCourses()    { return (_courses    ??= readCourses()); }

export const getStaticPaths: GetStaticPaths = () => {
  const professors = cachedProfessors();
  const gradeDist = cachedGradeDist();

  // Collect all unique professor names (from professors.json + grade data)
  const names = new Set<string>(Object.values(professors).map(p => p.name));
  for (const r of gradeDist) names.add(r.professor);

  return {
    paths: [...names].map(name => ({ params: { slug: professorSlug(name) } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<ProfessorPageProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const professors = cachedProfessors();
  const gradeDist = cachedGradeDist();

  let professor = Object.values(professors).find(p => professorSlug(p.name) === slug) ?? null;
  if (!professor) {
    const nameFromGrades = [...new Set(gradeDist.map(r => r.professor))]
      .find(name => professorSlug(name) === slug) ?? null;
    if (!nameFromGrades) return { notFound: true };
    professor = {
      name: nameFromGrades,
      department: '',
      rmpId: null,
      avgRating: null,
      avgDifficulty: null,
      wouldTakeAgainPct: null,
      tags: [],
      rmpUrl: null,
      rmpSearched: false,
      comments: [],
    };
  }

  const records = gradeDist.filter(r => r.professor === professor!.name);
  const courses = cachedCourses();
  const courseMap: Record<string, { title: string; subject: string; number: string }> = {};
  for (const r of records) {
    if (!courseMap[r.courseId]) {
      const c = courses.find(x => x.id === r.courseId);
      if (c) courseMap[r.courseId] = { title: c.title, subject: c.subject, number: c.number };
    }
  }

  return { props: { professor: professor as Professor, records, courseMap } };
};
