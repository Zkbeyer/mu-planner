import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Degree, DegreeTrack, CollegeRequirement } from '@/types';
import { storageGet, storageSet, STORAGE_KEYS } from '@/lib/storage';
import GPABadge from './GPABadge';

interface Props {
  degree: Degree;
  gpaMap: Record<string, number | null>;
  prereqMap: Record<string, string[]>;
  collegeReqs: CollegeRequirement[];
  activeTrack?: DegreeTrack | null;
}

type DegreeCheckState = Record<string, string[]>;

// "CMP_SC_1050" → "CMP_SC 1050"  (only replace underscore before the number)
function fmtId(id: string): string {
  return id.replace(/_(\d)/, ' $1');
}

function CourseRow({
  courseId,
  title,
  credits,
  checked,
  prereqs,
  gpa,
  onToggle,
  orCourses,
}: {
  courseId: string;
  title: string;
  credits: number;
  checked: boolean;
  prereqs: string[];
  gpa: number | null;
  onToggle: () => void;
  orCourses?: { courseId: string; title: string; credits: number }[];
}) {
  return (
    <div
      style={{
        background: checked ? '#f9f9f7' : 'var(--white)',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ width: 15, height: 15, accentColor: 'var(--gold)', cursor: 'pointer', flexShrink: 0 }}
        />
        <Link href={`/course/${courseId}`} style={{ flex: 1, textDecoration: 'none', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                padding: '2px 7px', borderRadius: 3,
                background: checked ? '#e5e5e0' : 'var(--black)',
                color: checked ? 'var(--g400)' : 'var(--white)',
                flexShrink: 0,
              }}
            >
              {fmtId(courseId)}
            </span>
            <span
              className="font-sans text-sm"
              style={{
                color: checked ? 'var(--g400)' : 'var(--black)',
                textDecoration: checked ? 'line-through' : 'none',
                fontWeight: 500,
              }}
            >
              {title}
            </span>
          </div>
        </Link>
        <GPABadge gpa={gpa} size="sm" />
        <span
          className="font-mono text-xs"
          style={{ color: 'var(--g400)', flexShrink: 0, minWidth: 30, textAlign: 'right' }}
        >
          {credits} cr
        </span>
      </div>

      {orCourses && orCourses.length > 0 && (
        <div style={{ paddingLeft: 39, paddingBottom: 5, paddingRight: 14, marginTop: -3 }}>
          {orCourses.map((oc) => (
            <div key={oc.courseId} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span
                className="font-mono"
                style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                  color: 'var(--g400)', flexShrink: 0, minWidth: 16,
                }}
              >
                or
              </span>
              <Link href={`/course/${oc.courseId}`} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', minWidth: 0 }}>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  padding: '1px 5px', borderRadius: 3,
                  background: 'var(--g100)', color: 'var(--g600)',
                  flexShrink: 0,
                }}>
                  {fmtId(oc.courseId)}
                </span>
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--g600)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {oc.title}
                </span>
              </Link>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--g400)', flexShrink: 0 }}>
                {oc.credits} cr
              </span>
            </div>
          ))}
        </div>
      )}

      {prereqs.length > 0 && (
        <div style={{ paddingLeft: 39, paddingBottom: 7, paddingRight: 14, marginTop: -2 }}>
          <span className="font-sans" style={{ fontSize: 10, color: 'var(--g400)', marginRight: 4 }}>
            {prereqs.length === 1 ? 'Prereq:' : 'Prereq (any one):'}
          </span>
          {prereqs.map((p, i) => (
            <span key={p} style={{ fontSize: 10 }}>
              <Link
                href={`/course/${p}`}
                style={{ color: 'var(--g600)', fontFamily: 'var(--font-mono)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}
              >
                {fmtId(p)}
              </Link>
              {i < prereqs.length - 1 && (
                <span style={{ color: 'var(--g300)', margin: '0 4px' }}>·</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DegreeRequirements({ degree, gpaMap, prereqMap, collegeReqs, activeTrack }: Props) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openPools, setOpenPools] = useState<Set<string>>(new Set());

  useEffect(() => {
    const all = storageGet<DegreeCheckState>(STORAGE_KEYS.DEGREES, {});
    setChecked(new Set(all[degree.id] ?? []));
  }, [degree.id]);

  useEffect(() => {
    const allPools = [
      ...degree.electivePools.map((p) => p.name),
      ...(activeTrack?.electivePools.map((p) => p.name) ?? []),
    ];
    setOpenPools(new Set(allPools));
  }, [degree.id, degree.electivePools, activeTrack]);

  function toggle(courseId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId);
      else next.add(courseId);
      const all = storageGet<DegreeCheckState>(STORAGE_KEYS.DEGREES, {});
      storageSet(STORAGE_KEYS.DEGREES, { ...all, [degree.id]: Array.from(next) });
      return next;
    });
  }

  function togglePool(name: string) {
    setOpenPools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  // Credit tracking (degree-level)
  const reqCheckedCredits = degree.requiredCourses
    .filter((c) => checked.has(c.courseId))
    .reduce((s, c) => s + c.credits, 0);
  const reqTotalCredits = degree.requiredCourses.reduce((s, c) => s + c.credits, 0);
  const electiveMinCredits = degree.electivePools.reduce((s, p) => s + p.minCredits, 0);
  const electiveCheckedCredits = degree.electivePools
    .flatMap((p) => p.courses)
    .filter((c) => checked.has(c.courseId))
    .reduce((s, c) => s + c.credits, 0);
  // Track credit tracking
  const trackReqChecked = (activeTrack?.requiredCourses ?? [])
    .filter((c) => checked.has(c.courseId))
    .reduce((s, c) => s + c.credits, 0);
  const trackElectiveChecked = (activeTrack?.electivePools ?? [])
    .flatMap((p) => p.courses)
    .filter((c) => checked.has(c.courseId))
    .reduce((s, c) => s + c.credits, 0);
  const totalChecked = reqCheckedCredits + electiveCheckedCredits + trackReqChecked + trackElectiveChecked;
  const progressPct = Math.min(100, Math.round((totalChecked / degree.totalCredits) * 100));

  const categories = Array.from(new Set(degree.requiredCourses.map((c) => c.category ?? 'Core')));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span className="font-syne font-bold text-sm">YOUR PROGRESS</span>
          <span className="font-mono text-xs" style={{ color: 'var(--gold)' }}>
            {totalChecked} / {degree.totalCredits} credits
          </span>
        </div>
        <div className="progress" style={{ height: 10, marginBottom: 6 }}>
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
          <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>
            Required: {reqCheckedCredits}/{reqTotalCredits} cr checked
          </span>
          {degree.electivePools.length > 0 && (
            <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>
              Electives: {electiveCheckedCredits}/{electiveMinCredits} cr needed
            </span>
          )}
        </div>
      </div>

      {/* ── College-level requirements ───────────────────────────────── */}
      {collegeReqs.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="sec-strip" style={{ margin: 0 }}>College Requirements</span>
            <span className="font-sans text-xs" style={{ color: 'var(--g400)' }}>
              {degree.college}
            </span>
          </div>
          <div style={{ border: '2px solid var(--gold)', borderRadius: 8, overflow: 'hidden', boxShadow: '3px 3px 0 var(--gold)' }}>
            {collegeReqs.map((req, i) => (
              <div
                key={req.description}
                style={{
                  borderBottom: i < collegeReqs.length - 1 ? '1px solid var(--g100)' : 'none',
                  padding: '12px 14px',
                  background: 'var(--white)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                          padding: '2px 7px', borderRadius: 3,
                          background: 'var(--gold)', color: 'var(--black)',
                          flexShrink: 0,
                        }}
                      >
                        COLLEGE REQ
                      </span>
                      <span className="font-sans text-sm" style={{ fontWeight: 600, color: 'var(--black)' }}>
                        {req.description}
                      </span>
                    </div>
                    {req.note && (
                      <p className="font-sans" style={{ fontSize: 11, color: 'var(--g600)', marginTop: 5, lineHeight: 1.5 }}>
                        {req.note}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs" style={{ color: 'var(--g400)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                    ~{req.credits} cr
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Required course groups ────────────────────────────────────── */}
      {categories.map((cat) => {
        const catCourses = degree.requiredCourses.filter((c) => (c.category ?? 'Core') === cat);
        const catTotal = catCourses.reduce((s, c) => s + c.credits, 0);
        const catChecked = catCourses.filter((c) => checked.has(c.courseId)).reduce((s, c) => s + c.credits, 0);
        return (
          <div key={cat}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="sec-strip" style={{ margin: 0 }}>{cat}</span>
              <span className="font-mono text-xs" style={{ color: catChecked === catTotal ? '#4ade80' : 'var(--g400)' }}>
                {catChecked}/{catTotal} cr
              </span>
            </div>
            <div style={{ border: '2px solid var(--black)', borderRadius: 8, overflow: 'hidden', boxShadow: '3px 3px 0 var(--black)' }}>
              {catCourses.map((req, ci) => (
                <div key={req.courseId} style={{ borderBottom: ci < catCourses.length - 1 ? '1px solid var(--g100)' : 'none' }}>
                  <CourseRow
                    courseId={req.courseId}
                    title={req.title}
                    credits={req.credits}
                    checked={checked.has(req.courseId)}
                    prereqs={prereqMap[req.courseId] ?? []}
                    gpa={gpaMap[req.courseId] ?? null}
                    onToggle={() => toggle(req.courseId)}
                    orCourses={req.orCourses}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Elective pools ───────────────────────────────────────────── */}
      {degree.electivePools.map((pool) => {
        const poolChecked = pool.courses
          .filter((c) => checked.has(c.courseId))
          .reduce((s, c) => s + c.credits, 0);
        const met = pool.minCredits > 0 && poolChecked >= pool.minCredits;
        const isOpen = openPools.has(pool.name);

        return (
          <div key={pool.name}>
            {/* Pool header */}
            <button
              onClick={() => togglePool(pool.name)}
              style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, textAlign: 'left' }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: met ? '#0d1f0d' : 'var(--black)',
                borderRadius: 6, border: `2px solid ${met ? '#4ade80' : 'var(--black)'}`,
                boxShadow: `3px 3px 0 ${met ? '#4ade80' : 'var(--black)'}`,
              }}>
                <div>
                  <div className="font-syne font-bold" style={{ color: met ? '#4ade80' : 'var(--white)', fontSize: 12, letterSpacing: 0.8 }}>
                    {pool.name.toUpperCase()}
                  </div>
                  <div className="font-sans" style={{ fontSize: 11, color: met ? '#86efac' : 'var(--g600)', marginTop: 2 }}>
                    {pool.minCredits > 0
                      ? `Choose ≥ ${pool.minCredits} credits from ${pool.courses.length} options`
                      : `${pool.courses.length} options available`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {pool.minCredits > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div className="font-mono font-bold" style={{ fontSize: 15, color: met ? '#4ade80' : 'var(--gold)' }}>
                        {poolChecked}
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--g600)' }}>/{pool.minCredits} cr</span>
                      </div>
                      {!met && (
                        <div className="font-sans" style={{ fontSize: 10, color: 'var(--g400)' }}>
                          {pool.minCredits - poolChecked} more needed
                        </div>
                      )}
                      {met && (
                        <div className="font-sans" style={{ fontSize: 10, color: '#86efac' }}>✓ requirement met</div>
                      )}
                    </div>
                  )}
                  <span style={{ color: 'var(--g600)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
            </button>

            {isOpen && (
              pool.courses.length > 0 ? (
                <div style={{ border: '2px solid var(--black)', borderRadius: 8, overflow: 'hidden', boxShadow: '3px 3px 0 var(--black)' }}>
                  {pool.courses.map((c, ci) => (
                    <div key={c.courseId} style={{ borderBottom: ci < pool.courses.length - 1 ? '1px solid var(--g100)' : 'none' }}>
                      <CourseRow
                        courseId={c.courseId}
                        title={c.title}
                        credits={c.credits}
                        checked={checked.has(c.courseId)}
                        prereqs={prereqMap[c.courseId] ?? []}
                        gpa={gpaMap[c.courseId] ?? null}
                        onToggle={() => toggle(c.courseId)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="font-sans text-sm italic px-4 py-3" style={{ color: 'var(--g400)' }}>
                  No specific courses listed — see the{' '}
                  <a href="https://catalog.missouri.edu" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>
                    Mizzou catalog
                  </a>{' '}
                  for options.
                </p>
              )
            )}
          </div>
        );
      })}

      {/* ── Active track requirements ─────────────────────────────────── */}
      {activeTrack && (
        <>
          {activeTrack.requiredCourses.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="sec-strip" style={{ margin: 0, color: 'var(--gold)' }}>
                  {activeTrack.name} — Required
                </span>
                <span className="font-mono text-xs" style={{ color: 'var(--gold)' }}>
                  {activeTrack.requiredCourses
                    .filter((c) => checked.has(c.courseId))
                    .reduce((s, c) => s + c.credits, 0)}/
                  {activeTrack.requiredCourses.reduce((s, c) => s + c.credits, 0)} cr
                </span>
              </div>
              <div style={{ border: '2px solid var(--gold)', borderRadius: 8, overflow: 'hidden', boxShadow: '3px 3px 0 var(--gold)' }}>
                {activeTrack.requiredCourses.map((req, ci) => (
                  <div key={req.courseId} style={{ borderBottom: ci < activeTrack.requiredCourses.length - 1 ? '1px solid var(--g100)' : 'none' }}>
                    <CourseRow
                      courseId={req.courseId}
                      title={req.title}
                      credits={req.credits}
                      checked={checked.has(req.courseId)}
                      prereqs={prereqMap[req.courseId] ?? []}
                      gpa={gpaMap[req.courseId] ?? null}
                      onToggle={() => toggle(req.courseId)}
                      orCourses={req.orCourses}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTrack.electivePools.map((pool) => {
            const poolChecked = pool.courses
              .filter((c) => checked.has(c.courseId))
              .reduce((s, c) => s + c.credits, 0);
            const met = pool.minCredits > 0 && poolChecked >= pool.minCredits;
            const isOpen = openPools.has(pool.name);

            return (
              <div key={pool.name}>
                <button
                  onClick={() => togglePool(pool.name)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 8, textAlign: 'left' }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: met ? '#0d1f0d' : '#1a1200',
                    borderRadius: 6,
                    border: `2px solid ${met ? '#4ade80' : 'var(--gold)'}`,
                    boxShadow: `3px 3px 0 ${met ? '#4ade80' : 'var(--gold)'}`,
                  }}>
                    <div>
                      <div className="font-syne font-bold" style={{ color: met ? '#4ade80' : 'var(--gold)', fontSize: 12, letterSpacing: 0.8 }}>
                        {pool.name.toUpperCase()}
                      </div>
                      <div className="font-sans" style={{ fontSize: 11, color: met ? '#86efac' : 'var(--g600)', marginTop: 2 }}>
                        {pool.minCredits > 0
                          ? `Choose ≥ ${pool.minCredits} credits from ${pool.courses.length} options`
                          : `${pool.courses.length} options available`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {pool.minCredits > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div className="font-mono font-bold" style={{ fontSize: 15, color: met ? '#4ade80' : 'var(--gold)' }}>
                            {poolChecked}
                            <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--g600)' }}>/{pool.minCredits} cr</span>
                          </div>
                          {!met && <div className="font-sans" style={{ fontSize: 10, color: 'var(--g400)' }}>{pool.minCredits - poolChecked} more needed</div>}
                          {met  && <div className="font-sans" style={{ fontSize: 10, color: '#86efac' }}>✓ requirement met</div>}
                        </div>
                      )}
                      <span style={{ color: 'var(--g600)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  pool.courses.length > 0 ? (
                    <div style={{ border: '2px solid var(--gold)', borderRadius: 8, overflow: 'hidden', boxShadow: '3px 3px 0 var(--gold)' }}>
                      {pool.courses.map((c, ci) => (
                        <div key={c.courseId} style={{ borderBottom: ci < pool.courses.length - 1 ? '1px solid var(--g100)' : 'none' }}>
                          <CourseRow
                            courseId={c.courseId}
                            title={c.title}
                            credits={c.credits}
                            checked={checked.has(c.courseId)}
                            prereqs={prereqMap[c.courseId] ?? []}
                            gpa={gpaMap[c.courseId] ?? null}
                            onToggle={() => toggle(c.courseId)}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-sans text-sm italic px-4 py-3" style={{ color: 'var(--g400)' }}>
                      No specific courses listed — see the{' '}
                      <a href="https://catalog.missouri.edu" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>
                        Mizzou catalog
                      </a>{' '}
                      for options.
                    </p>
                  )
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
