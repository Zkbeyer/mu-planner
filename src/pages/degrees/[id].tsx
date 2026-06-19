import { useRouter } from 'next/router';
import { useMemo, useState, useEffect } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import type { Degree, DegreeTrack, CollegeRequirement } from '@/types';
import { readDegrees, readGradeDist, readCourses, computeGpaMap, readCollegeRequirements } from '@/lib/data-server';
import { storageSet, storageGet, STORAGE_KEYS } from '@/lib/storage';
import DegreeRequirements from '@/components/DegreeRequirements';
import ScraperLoader from '@/components/ScraperLoader';

interface DegreeDetailProps {
  degree: Degree | null;
  degreeId: string;
  gpaMap: Record<string, number | null>;
  prereqMap: Record<string, string[]>;
  collegeReqs: CollegeRequirement[];
}

export default function DegreeDetail({ degree, degreeId, gpaMap, prereqMap, collegeReqs }: DegreeDetailProps) {
  const router = useRouter();
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedConcs, setSelectedConcs] = useState<string[]>([]);

  useEffect(() => {
    if (!degree?.tracks?.length) return;
    const saved = storageGet<Record<string, string>>(STORAGE_KEYS.TRACK_SELECTIONS, {});
    setSelectedTrackId(saved[degree.id] ?? null);
  }, [degree?.id, degree?.tracks?.length]);

  useEffect(() => {
    if (!degree?.concentrationAreas?.length) return;
    const saved = storageGet<Record<string, string[]>>(STORAGE_KEYS.CONCENTRATION_SELECTIONS, {});
    setSelectedConcs(saved[degree.id] ?? []);
  }, [degree?.id, degree?.concentrationAreas?.length]);

  function toggleConcentration(name: string) {
    if (!degree) return;
    const max = degree.concentrationCount ?? Infinity;
    setSelectedConcs((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : prev.length < max ? [...prev, name] : prev;
      const saved = storageGet<Record<string, string[]>>(STORAGE_KEYS.CONCENTRATION_SELECTIONS, {});
      storageSet(STORAGE_KEYS.CONCENTRATION_SELECTIONS, { ...saved, [degree.id]: next });
      return next;
    });
  }

  const needs = useMemo(() => [
    {
      key: 'degrees' as const,
      scraper: 'degrees',
      label: 'Degree Requirements',
      description: 'Scraping this degree plan from the Mizzou catalog — takes about 5 seconds.',
      degreeId,
    },
  ], [degreeId]);

  const totalReqCredits = degree?.requiredCourses.reduce((s, c) => s + c.credits, 0) ?? 0;
  const activeTrack: DegreeTrack | null =
    degree?.tracks?.find((t) => t.id === selectedTrackId) ?? null;

  function selectTrack(trackId: string | null) {
    setSelectedTrackId(trackId);
    if (!degree) return;
    const saved = storageGet<Record<string, string>>(STORAGE_KEYS.TRACK_SELECTIONS, {});
    storageSet(STORAGE_KEYS.TRACK_SELECTIONS, { ...saved, [degree.id]: trackId ?? '' });
  }

  function planDegree() {
    if (!degree) return;
    storageSet(STORAGE_KEYS.SELECTED_DEGREE, degree.id);
    router.push('/planner');
  }

  return (
    <ScraperLoader needs={needs}>
      {degree && (
        <>
          <Head><title>{degree.name} | MU Planner</title></Head>

          <div style={{ maxWidth: 1020, margin: '0 auto', padding: '32px 48px 64px' }}>
            <div className="flex items-center gap-2 mb-5 font-sans text-sm">
              <Link href="/degrees" style={{ color: 'var(--gold)', textDecoration: 'underline' }}>Degrees</Link>
              <span style={{ color: 'var(--g400)' }}>›</span>
              <span className="font-semibold" style={{ color: 'var(--black)' }}>{degree.name}</span>
            </div>

            <div style={{ background: 'var(--black)', borderRadius: 8, padding: '28px 32px', marginBottom: 28, border: '2px solid var(--black)', boxShadow: '4px 4px 0 var(--black)' }}>
              <div className="flex items-start justify-between gap-6">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span className="label" style={{ color: 'var(--g600)' }}>{degree.college}</span>
                  <div className="font-syne font-extrabold" style={{ fontSize: 28, color: 'var(--white)', lineHeight: 1.1 }}>{degree.name}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="chip chip-black">{degree.totalCredits} Credits Required</span>
                    <span className="chip" style={{ background: '#1a1a1a', borderColor: '#333', color: 'var(--g400)' }}>
                      {degree.requiredCourses.length} Required Courses
                    </span>
                  </div>
                </div>
                <button onClick={planDegree} className="btn btn-gold" style={{ height: 44, flexShrink: 0 }}>
                  + Plan This Degree
                </button>
              </div>
            </div>

            {degree.tracks && degree.tracks.length > 0 && (
              <div className="card" style={{ padding: '18px 22px', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span className="font-syne font-bold" style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--g600)' }}>
                    Select Your Track / Emphasis
                  </span>
                  {activeTrack && (
                    <button
                      onClick={() => selectTrack(null)}
                      className="font-sans"
                      style={{ fontSize: 10, color: 'var(--g400)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {degree.tracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => selectTrack(track.id)}
                      className="font-syne font-bold"
                      style={{
                        fontSize: 11, letterSpacing: 0.4, padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
                        background: selectedTrackId === track.id ? 'var(--black)' : 'var(--white)',
                        color: selectedTrackId === track.id ? 'var(--gold)' : 'var(--black)',
                        border: '2px solid var(--black)',
                        boxShadow: selectedTrackId === track.id ? '3px 3px 0 var(--gold)' : '3px 3px 0 var(--black)',
                        transition: 'all 0.1s',
                      }}
                    >
                      {track.name}
                    </button>
                  ))}
                </div>
                {!activeTrack && (
                  <p className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginTop: 10, marginBottom: 0 }}>
                    Select a track to see its specific course requirements added to the list below.
                  </p>
                )}
              </div>
            )}

            {degree.concentrationAreas && degree.concentrationAreas.length > 0 && (
              <div className="card" style={{ padding: '18px 22px', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="font-syne font-bold" style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--g600)' }}>
                    Concentration Areas
                  </span>
                  {selectedConcs.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedConcs([]);
                        if (degree) {
                          const saved = storageGet<Record<string, string[]>>(STORAGE_KEYS.CONCENTRATION_SELECTIONS, {});
                          storageSet(STORAGE_KEYS.CONCENTRATION_SELECTIONS, { ...saved, [degree.id]: [] });
                        }
                      }}
                      className="font-sans"
                      style={{ fontSize: 10, color: 'var(--g400)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginTop: 0, marginBottom: 12 }}>
                  {degree.concentrationCount
                    ? `Choose ${degree.concentrationCount} of ${degree.concentrationAreas.length} concentration areas. (${selectedConcs.length}/${degree.concentrationCount} selected)`
                    : `Select your concentration areas. (${selectedConcs.length} selected)`}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {degree.concentrationAreas.map((area) => {
                    const selected = selectedConcs.includes(area.name);
                    const maxed = !selected && selectedConcs.length >= (degree.concentrationCount ?? Infinity);
                    return (
                      <div
                        key={area.name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 5, cursor: maxed ? 'not-allowed' : 'pointer',
                          background: selected ? 'var(--black)' : maxed ? 'var(--g50)' : 'var(--white)',
                          border: `2px solid ${selected ? 'var(--black)' : 'var(--g200)'}`,
                          boxShadow: selected ? '2px 2px 0 var(--gold)' : 'none',
                          transition: 'all 0.1s',
                          opacity: maxed ? 0.45 : 1,
                        }}
                        onClick={() => !maxed && toggleConcentration(area.name)}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                          border: `2px solid ${selected ? 'var(--gold)' : 'var(--g300)'}`,
                          background: selected ? 'var(--gold)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {selected && <span style={{ color: 'var(--black)', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span className="font-syne font-bold" style={{ fontSize: 12, flex: 1, color: selected ? 'var(--gold)' : 'var(--black)' }}>
                          {area.name}
                        </span>
                        {area.degreeId ? (
                          <Link
                            href={`/degrees/${area.degreeId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-sans"
                            style={{ fontSize: 10, color: selected ? 'var(--gold)' : 'var(--g400)', textDecoration: 'underline', flexShrink: 0 }}
                          >
                            View degree →
                          </Link>
                        ) : (
                          <span className="font-sans" style={{ fontSize: 10, color: 'var(--g300)', flexShrink: 0 }}>no standalone degree</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 24 }}>
              <DegreeRequirements degree={degree} gpaMap={gpaMap} prereqMap={prereqMap} collegeReqs={collegeReqs} activeTrack={activeTrack} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="card" style={{ padding: '20px 20px' }}>
                  {/* Headline */}
                  <div style={{ marginBottom: 16 }}>
                    <div className="font-syne font-extrabold" style={{ fontSize: 42, lineHeight: 1, color: 'var(--black)' }}>
                      {degree.totalCredits}
                    </div>
                    <div className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginTop: 4, letterSpacing: 0.3 }}>
                      credits to graduate
                    </div>
                  </div>

                  {/* Stacked credit bar */}
                  {(() => {
                    const electiveMin = degree.electivePools.reduce((a, p) => a + p.minCredits, 0);
                    const remaining = Math.max(0, degree.totalCredits - totalReqCredits - electiveMin);
                    const total = degree.totalCredits || 1;
                    return (
                      <>
                        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 14, gap: 2 }}>
                          <div style={{ width: `${(totalReqCredits / total) * 100}%`, background: 'var(--gold)', borderRadius: 3 }} />
                          {electiveMin > 0 && <div style={{ width: `${(electiveMin / total) * 100}%`, background: 'var(--g400)', borderRadius: 3 }} />}
                          {remaining > 0 && <div style={{ flex: 1, background: 'var(--g100)', borderRadius: 3 }} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {([
                            ['Core courses', totalReqCredits, 'var(--gold)', `${degree.requiredCourses.length} courses`],
                            ...(electiveMin > 0 ? [['Elective pools', electiveMin, 'var(--g500)', `${degree.electivePools.length} pool${degree.electivePools.length !== 1 ? 's' : ''}`]] : []),
                            ...(remaining > 0 ? [['General electives', remaining, 'var(--g200)', 'fill as needed']] : []),
                          ] as [string, number, string, string][]).map(([label, cr, color, sub]) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0, marginTop: 1 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="font-sans" style={{ fontSize: 12, color: 'var(--black)', fontWeight: 600 }}>{label}</div>
                                <div className="font-sans" style={{ fontSize: 10, color: 'var(--g400)' }}>{sub}</div>
                              </div>
                              <span className="font-mono font-medium" style={{ fontSize: 13, color: 'var(--black)', flexShrink: 0 }}>{cr} cr</span>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}

                  {/* Track / concentration count if applicable */}
                  {(degree.tracks?.length || degree.concentrationAreas?.length) ? (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--g100)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {degree.tracks?.length ? (
                        <div className="flex justify-between items-center font-sans text-xs" style={{ color: 'var(--g600)' }}>
                          <span>Tracks / emphases</span>
                          <span className="font-mono font-medium" style={{ color: 'var(--black)' }}>{degree.tracks.length}</span>
                        </div>
                      ) : null}
                      {degree.concentrationAreas?.length ? (
                        <div className="flex justify-between items-center font-sans text-xs" style={{ color: 'var(--g600)' }}>
                          <span>Concentration areas</span>
                          <span className="font-mono font-medium" style={{ color: 'var(--black)' }}>
                            {degree.concentrationCount ? `choose ${degree.concentrationCount} of ${degree.concentrationAreas.length}` : degree.concentrationAreas.length}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button onClick={planDegree} className="btn btn-gold" style={{ width: '100%', height: 44, fontSize: 13 }}>
                  + Plan This Degree
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </ScraperLoader>
  );
}

export const getServerSideProps: GetServerSideProps<DegreeDetailProps> = async ({ params }) => {
  const id = params?.id as string;
  const degrees = readDegrees();
  const degree = degrees.find((d) => d.id === id) ?? null;

  // Treat stub degrees (index-only, no course data) the same as missing — trigger single-degree scrape
  if (!degree || degree.stub) {
    return {
      props: {
        degree: null,
        degreeId: id,
        gpaMap: {},
        prereqMap: {},
        collegeReqs: [],
      },
    };
  }

  const gradeDist = readGradeDist();
  const allIds = Array.from(new Set([
    ...degree.requiredCourses.map((c) => c.courseId),
    ...degree.electivePools.flatMap((p) => p.courses.map((c) => c.courseId)),
    ...degree.samplePlan.flatMap((s) => s.courses.map((c) => c.courseId)),
    ...(degree.tracks ?? []).flatMap((t) => [
      ...t.requiredCourses.map((c) => c.courseId),
      ...t.electivePools.flatMap((p) => p.courses.map((c) => c.courseId)),
    ]),
  ]));

  const allCourses = readCourses();
  const prereqMap: Record<string, string[]> = {};
  for (const cId of allIds) {
    const course = allCourses.find((c) => c.id === cId);
    if (course?.prerequisites?.length) {
      prereqMap[cId] = course.prerequisites.filter((p) => p !== cId);
    }
  }

  const collegeReqs = readCollegeRequirements(degree.college);
  return {
    props: {
      degree,
      degreeId: id,
      gpaMap: computeGpaMap(allIds, gradeDist),
      prereqMap,
      collegeReqs,
    },
  };
};
