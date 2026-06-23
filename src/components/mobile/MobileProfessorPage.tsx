import Head from 'next/head';
import Link from 'next/link';
import type { Professor, GradeRecord } from '@/types';

export interface MobileProfessorPageProps {
  professor: Professor;
  records: GradeRecord[];
  courseMap: Record<string, { title: string; subject: string; number: string }>;
}

const GRADE_COLORS: Record<string, string> = {
  A: 'var(--gold)', B: '#6ee7b7', C: '#fde68a', D: '#fca5a5', F: '#ef4444', W: '#a3a3a3',
};

function RatingDot({ value, max = 5 }: { value: number; max?: number }) {
  const pct = (value / max) * 100;
  const color = pct >= 70 ? 'var(--gold)' : pct >= 45 ? '#f59e0b' : '#ef4444';
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: color, border: '2px solid var(--black)', marginRight: 5, verticalAlign: 'middle',
    }} />
  );
}

function GradeBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
      <span style={{ width: 16, fontSize: 11, color: 'var(--g400)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: 'var(--g100)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: color }} />
      </div>
      <span style={{ width: 38, textAlign: 'right', fontSize: 11, color: 'var(--g600)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

export default function MobileProfessorPage({ professor, records, courseMap }: MobileProfessorPageProps) {
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

      {/* Breadcrumb */}
      <div style={{ padding: '12px 16px', background: 'var(--white)', borderBottom: '1px solid var(--g100)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Link href="/" style={{ color: 'var(--gold)', textDecoration: 'underline', fontSize: 13, fontFamily: 'var(--font-sans)' }}>Courses</Link>
        <span style={{ color: 'var(--g400)', fontSize: 13 }}>›</span>
        <span style={{ color: 'var(--black)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {professor.name}
        </span>
      </div>

      {/* Dark header */}
      <div style={{ background: 'var(--black)', padding: '20px 16px 24px', borderBottom: '2px solid var(--black)' }}>
        {professor.department && (
          <span className="label" style={{ color: 'var(--g600)', display: 'block', marginBottom: 6 }}>
            {professor.department}
          </span>
        )}
        <div className="font-syne font-extrabold" style={{ fontSize: 24, color: 'var(--white)', lineHeight: 1.1, marginBottom: 12 }}>
          {professor.name}
        </div>

        {hasProfData ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="chip chip-black">★ {professor.avgRating!.toFixed(1)} / 5.0</span>
            <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>
              Difficulty {professor.avgDifficulty!.toFixed(1)} / 5.0
            </span>
            <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>
              {professor.wouldTakeAgainPct}% Would Take Again
            </span>
          </div>
        ) : (
          <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g600)', marginBottom: 8, display: 'inline-flex' }}>
            No RMP data
          </span>
        )}

        {overallAvgGPA !== null && (
          <div style={{ marginBottom: 12 }}>
            <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--gold)' }}>
              Avg GPA {overallAvgGPA.toFixed(2)}
            </span>
          </div>
        )}

        {professor.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {professor.tags.map(tag => (
              <span key={tag} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#1a1a1a', border: '1px solid #333', color: 'var(--g400)', fontFamily: 'var(--font-sans)' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {hasProfData && professor.rmpUrl && (
          <a href={professor.rmpUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="btn" style={{ height: 38, fontSize: 12, background: 'transparent', color: 'var(--gold)', border: '2px solid var(--gold)', boxShadow: '3px 3px 0 var(--gold)' }}>
              View on RMP ↗
            </button>
          </a>
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: 80 }}>

        {/* RMP stats card */}
        {hasProfData && (
          <div style={{ margin: '16px 14px 0' }} className="card">
            <div style={{ padding: '16px' }}>
              <span className="sec-strip" style={{ marginBottom: 14, display: 'block' }}>RMP Stats</span>
              {([
                ['Rating',           `${professor.avgRating!.toFixed(1)} / 5.0`],
                ['Difficulty',       `${professor.avgDifficulty!.toFixed(1)} / 5.0`],
                ['Would Take Again', `${professor.wouldTakeAgainPct}%`],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--g100)' }}>
                  <span className="font-sans" style={{ fontSize: 13, color: 'var(--g600)' }}>{k}</span>
                  <span className="font-mono font-medium" style={{ fontSize: 15, color: 'var(--black)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Courses taught */}
        <div style={{ padding: '16px 14px 0' }}>
          <span className="sec-strip" style={{ marginBottom: 12, display: 'block' }}>Courses Taught</span>

          {Object.keys(courseRecords).length === 0 ? (
            <p className="font-sans" style={{ fontSize: 14, color: 'var(--g400)' }}>No grade records found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Object.entries(courseRecords).map(([courseId, cRecords]) => {
                const info = courseMap[courseId];
                const avgGPA = Math.round((cRecords.reduce((s, r) => s + r.avgGPA, 0) / cRecords.length) * 100) / 100;
                const latest = [...cRecords].sort((a, b) => b.term.localeCompare(a.term))[0];
                return (
                  <div key={courseId} className="card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/course/${courseId}`} className="font-syne font-bold" style={{ fontSize: 15, color: 'var(--black)', textDecoration: 'none', display: 'block', marginBottom: 4 }}>
                          {info ? `${info.subject} ${info.number} — ${info.title}` : courseId}
                        </Link>
                        <span className="font-sans" style={{ fontSize: 12, color: 'var(--g400)' }}>
                          {cRecords.length} section{cRecords.length !== 1 ? 's' : ''} · Most recent: {latest.term}
                        </span>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="font-mono font-medium" style={{ fontSize: 22, color: 'var(--gold)' }}>{avgGPA.toFixed(2)}</div>
                        <div className="label" style={{ fontSize: 9 }}>avg GPA</div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      {(['A', 'B', 'C', 'D', 'F', 'W'] as const).map(g => (
                        <GradeBar key={g} label={g} pct={latest[`pct${g}` as keyof GradeRecord] as number} color={GRADE_COLORS[g] ?? '#aaa'} />
                      ))}
                    </div>

                    <div style={{ borderTop: '1px solid var(--g100)', paddingTop: 10 }}>
                      <div className="label" style={{ fontSize: 9, marginBottom: 6 }}>All Sections</div>
                      {[...cRecords].sort((a, b) => b.term.localeCompare(a.term)).map(r => (
                        <div key={r.term} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--g600)', marginBottom: 3 }}>
                          <span>{r.term}</span>
                          <span className="font-mono" style={{ color: 'var(--black)' }}>{r.avgGPA.toFixed(2)} GPA</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Student reviews */}
        {professor.comments.length > 0 && (
          <div style={{ padding: '16px 14px 0' }}>
            <span className="sec-strip" style={{ marginBottom: 12, display: 'block' }}>Student Reviews</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {professor.comments.map((c, i) => (
                <div key={i} className="card" style={{ padding: '14px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <RatingDot value={c.rating} />
                      <span className="font-mono font-medium" style={{ fontSize: 13 }}>{c.rating}/5</span>
                    </span>
                    <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>Diff {c.difficulty}/5</span>
                    {c.wouldTakeAgain && (
                      <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>
                        Would take again
                      </span>
                    )}
                    {c.courseName && (
                      <span className="chip" style={{ fontSize: 10, padding: '2px 8px', background: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }}>
                        {c.courseName}
                      </span>
                    )}
                    <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginLeft: 'auto' }}>{c.date}</span>
                  </div>
                  <p className="font-sans" style={{ fontSize: 13, color: 'var(--g600)', lineHeight: 1.55, margin: 0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasProfData && professor.comments.length === 0 && (
          <div style={{ margin: '16px 14px 0' }} className="card">
            <div style={{ padding: '18px', textAlign: 'center' }}>
              <p className="font-sans" style={{ fontSize: 14, color: 'var(--g400)', margin: 0 }}>
                No RateMyProfessors data available yet.
              </p>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
