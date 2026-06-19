import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Course, Degree, PlannerSemester, PlannerCourse } from '@/types';
import { storageGet, storageSet, storageRemove, STORAGE_KEYS } from '@/lib/storage';
import GPABadge from './GPABadge';

const DEFAULT_SEMESTERS: PlannerSemester[] = [
  { id: 'fall2025', label: 'Fall 2025', courses: [] },
  { id: 'spring2026', label: 'Spring 2026', courses: [] },
  { id: 'fall2026', label: 'Fall 2026', courses: [] },
  { id: 'spring2027', label: 'Spring 2027', courses: [] },
];

const SEASON_ORDER = ['Spring', 'Summer', 'Fall'];
function nextLabel(label: string): string {
  const [season, yearStr] = label.split(' ');
  const year = parseInt(yearStr);
  const nextIdx = (SEASON_ORDER.indexOf(season) + 1) % SEASON_ORDER.length;
  return `${SEASON_ORDER[nextIdx]} ${nextIdx === 0 ? year + 1 : year}`;
}

function courseUrl(courseId: string) {
  return `/course/${courseId}`;
}

interface SemesterPlannerProps {
  courses: Course[];
  gpaMap: Record<string, number | null>;
  degrees: Degree[];
}

export default function SemesterPlanner({ courses, gpaMap, degrees }: SemesterPlannerProps) {
  const [semesters, setSemesters] = useState<PlannerSemester[]>(DEFAULT_SEMESTERS);
  const [dragging, setDragging] = useState<{ courseId: string; fromSem: string | null } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedDegreeId, setSelectedDegreeId] = useState<string>('');
  const [addTarget, setAddTarget] = useState<string>(''); // semId to add sidebar courses into
  const [openPool, setOpenPool] = useState<string | null>(null);

  useEffect(() => {
    setSemesters(storageGet<PlannerSemester[]>(STORAGE_KEYS.PLANNER, DEFAULT_SEMESTERS));
    const pendingDegree = storageGet<string>(STORAGE_KEYS.SELECTED_DEGREE, '');
    if (pendingDegree) {
      setSelectedDegreeId(pendingDegree);
      storageRemove(STORAGE_KEYS.SELECTED_DEGREE);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (semesters.length > 0 && !addTarget) setAddTarget(semesters[0].id);
  }, [semesters, addTarget]);

  const persist = useCallback((next: PlannerSemester[]) => {
    setSemesters(next);
    storageSet(STORAGE_KEYS.PLANNER, next);
  }, []);

  const allPlannedIds = new Set(semesters.flatMap((s) => s.courses.map((c) => c.courseId)));

  function addCourse(courseId: string, semId: string) {
    const course = courses.find((c) => c.id === courseId);
    if (!course) return;
    setSemesters((prev) => {
      if (prev.some((s) => s.courses.some((c) => c.courseId === courseId))) return prev;
      const next = prev.map((s): PlannerSemester =>
        s.id === semId
          ? { ...s, courses: [...s.courses, { courseId: course.id, title: course.title, credits: course.credits, avgGPA: gpaMap[course.id] ?? undefined }] }
          : s
      );
      storageSet(STORAGE_KEYS.PLANNER, next);
      return next;
    });
  }

  function removeCourse(semId: string, courseId: string) {
    persist(semesters.map((s): PlannerSemester =>
      s.id === semId ? { ...s, courses: s.courses.filter((c) => c.courseId !== courseId) } : s
    ));
  }

  function addSemester() {
    const last = semesters[semesters.length - 1];
    persist([...semesters, { id: `sem_${Date.now()}`, label: last ? nextLabel(last.label) : 'Fall 2028', courses: [] }]);
  }

  function removeSemester(semId: string) {
    persist(semesters.filter((s) => s.id !== semId));
  }

  function getUnmetPrereqs(courseId: string, semId: string): string[] {
    const course = courses.find((c) => c.id === courseId);
    if (!course?.prerequisites.length) return [];
    const semIdx = semesters.findIndex((s) => s.id === semId);
    const priorIds = new Set(semesters.slice(0, semIdx).flatMap((s) => s.courses.map((c) => c.courseId)));
    return course.prerequisites.filter((p) => !priorIds.has(p));
  }

  function handleDrop(toSemId: string) {
    if (!dragging) return;
    const { courseId, fromSem } = dragging;
    setSemesters((prev) => {
      let moved: PlannerCourse | undefined;
      let next = prev.map((s): PlannerSemester => {
        if (s.id === fromSem) {
          moved = s.courses.find((c) => c.courseId === courseId);
          return { ...s, courses: s.courses.filter((c) => c.courseId !== courseId) };
        }
        return s;
      });
      if (!moved) {
        const c = courses.find((c) => c.id === courseId);
        if (!c) return prev;
        moved = { courseId: c.id, title: c.title, credits: c.credits, avgGPA: gpaMap[c.id] ?? undefined };
      }
      const mc = moved;
      next = next.map((s): PlannerSemester =>
        s.id === toSemId && !s.courses.some((c) => c.courseId === courseId)
          ? { ...s, courses: [...s.courses, mc] }
          : s
      );
      storageSet(STORAGE_KEYS.PLANNER, next);
      return next;
    });
    setDragging(null);
    setDragOver(null);
  }

  const selectedDegree = degrees.find((d) => d.id === selectedDegreeId) ?? null;
  const totalPlanned = semesters.reduce((s, sem) => s + sem.courses.reduce((a, c) => a + c.credits, 0), 0);
  const totalRequired = selectedDegree?.totalCredits ?? 120;

  // Build a lookup for degree required course IDs
  const degreeRequiredIds = new Set(selectedDegree?.requiredCourses.map((c) => c.courseId) ?? []);
  const degreeElectiveIds = new Set(
    selectedDegree?.electivePools.flatMap((p) => p.courses.map((c) => c.courseId)) ?? []
  );

  // Per-course prereq status relative to the currently selected add-target semester
  function getCourseStatus(courseId: string): 'planned' | 'no-prereqs' | 'ok' | 'missing-prereq' {
    if (allPlannedIds.has(courseId)) return 'planned';
    const course = courses.find((c) => c.id === courseId);
    if (!course?.prerequisites.length) return 'ok';
    const targetIdx = semesters.findIndex((s) => s.id === addTarget);
    const priorIds = new Set(semesters.slice(0, targetIdx).flatMap((s) => s.courses.map((c) => c.courseId)));
    const unmet = course.prerequisites.filter((p) => !priorIds.has(p));
    return unmet.length > 0 ? 'missing-prereq' : 'ok';
  }

  const categories = selectedDegree
    ? Array.from(new Set(selectedDegree.requiredCourses.map((c) => c.category ?? 'Other')))
    : [];

  if (!mounted) return null;

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Left sidebar: degree guide */}
      <div style={{
        width: 268, background: 'var(--black)', flexShrink: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Degree picker header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
          <div className="font-syne font-extrabold text-xs tracking-widest" style={{ color: 'var(--gold)', textTransform: 'uppercase', marginBottom: 8 }}>
            Degree Guide
          </div>
          <select
            value={selectedDegreeId}
            onChange={(e) => { setSelectedDegreeId(e.target.value); setOpenPool(null); }}
            style={{
              width: '100%', fontFamily: 'Space Grotesk', fontSize: 12, background: '#1a1a1a',
              color: 'var(--white)', border: '1.5px solid #333', borderRadius: 5,
              padding: '7px 10px', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— Select a degree —</option>
            {degrees.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {selectedDegree && (
            <div className="font-sans text-xs mt-2" style={{ color: 'var(--g600)' }}>
              {selectedDegree.college} · {selectedDegree.totalCredits} credits required
            </div>
          )}
        </div>

        {/* Add-to semester selector */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
          <div className="font-sans text-xs mb-1.5" style={{ color: 'var(--g600)' }}>Add courses to:</div>
          <select
            value={addTarget}
            onChange={(e) => setAddTarget(e.target.value)}
            style={{
              width: '100%', fontFamily: 'Space Grotesk', fontSize: 12, background: '#1a1a1a',
              color: 'var(--gold)', border: '1.5px solid #333', borderRadius: 5,
              padding: '6px 10px', outline: 'none', cursor: 'pointer',
            }}
          >
            {semesters.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Scrollable requirement list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {selectedDegree ? (
            <>
              {/* Required courses by category */}
              {categories.map((cat) => {
                const catCourses = selectedDegree.requiredCourses.filter((c) => (c.category ?? 'Other') === cat);
                const doneCount = catCourses.filter((c) => allPlannedIds.has(c.courseId)).length;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-syne font-bold text-xs" style={{ color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {cat}
                      </span>
                      <span className="font-mono text-xs" style={{ color: doneCount === catCourses.length ? '#4ade80' : 'var(--g600)' }}>
                        {doneCount}/{catCourses.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {catCourses.map((req) => {
                        const status = getCourseStatus(req.courseId);
                        return (
                          <SidebarCourseRow
                            key={req.courseId}
                            courseId={req.courseId}
                            title={req.title}
                            credits={req.credits}
                            gpa={gpaMap[req.courseId] ?? null}
                            status={status}
                            onAdd={() => addCourse(req.courseId, addTarget)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Elective pools */}
              {selectedDegree.electivePools.map((pool) => {
                const poolPlanned = pool.courses.filter((c) => allPlannedIds.has(c.courseId)).length;
                const isOpen = openPool === pool.name;
                return (
                  <div key={pool.name}>
                    <button
                      onClick={() => setOpenPool(isOpen ? null : pool.name)}
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-syne font-bold text-xs" style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {pool.name}
                        </span>
                        <span style={{ color: '#555', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                      <div className="font-sans text-xs" style={{ color: 'var(--g600)', marginBottom: 6 }}>
                        ≥ {pool.minCredits} credits · {poolPlanned} planned
                      </div>
                    </button>
                    {isOpen && pool.courses.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingLeft: 4 }}>
                        {pool.courses.map((c) => {
                          const status = getCourseStatus(c.courseId);
                          return (
                            <SidebarCourseRow
                              key={c.courseId}
                              courseId={c.courseId}
                              title={c.title}
                              credits={c.credits}
                              gpa={gpaMap[c.courseId] ?? null}
                              status={status}
                              onAdd={() => addCourse(c.courseId, addTarget)}
                            />
                          );
                        })}
                      </div>
                    )}
                    {isOpen && pool.courses.length === 0 && (
                      <p className="font-sans text-xs italic" style={{ color: 'var(--g600)', paddingLeft: 4 }}>
                        Courses populated after scraper runs.
                      </p>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ textAlign: 'center', paddingTop: 32 }}>
              <div className="font-syne font-bold text-xs" style={{ color: 'var(--g600)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Select a Degree
              </div>
              <p className="font-sans text-xs" style={{ color: '#444', lineHeight: 1.6 }}>
                Choose a degree above to see required courses and electives.
              </p>
              {/* Show all courses as fallback */}
              <div style={{ marginTop: 20, textAlign: 'left' }}>
                <div className="font-syne font-bold text-xs mb-2" style={{ color: 'var(--g600)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  All Courses
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {courses.filter((c) => !allPlannedIds.has(c.id)).map((c) => (
                    <SidebarCourseRow
                      key={c.id}
                      courseId={c.id}
                      title={c.title}
                      credits={c.credits}
                      gpa={gpaMap[c.id] ?? null}
                      status={getCourseStatus(c.id)}
                      onAdd={() => addCourse(c.id, addTarget)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Progress bar */}
        <div style={{ background: 'var(--white)', borderBottom: '2px solid var(--black)', padding: '12px 24px', flexShrink: 0 }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="font-syne font-extrabold text-xs tracking-wide">
              {selectedDegree ? `${selectedDegree.name.toUpperCase()} PROGRESS` : 'DEGREE PROGRESS'}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {selectedDegree && (
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, background: '#4ade80', borderRadius: 2, border: '1.5px solid var(--black)' }} />
                  <span className="font-sans text-xs" style={{ color: 'var(--g600)' }}>
                    Required planned:{' '}
                    <strong style={{ color: '#4ade80' }}>
                      {selectedDegree.requiredCourses.filter((c) => allPlannedIds.has(c.courseId)).length}/
                      {selectedDegree.requiredCourses.length}
                    </strong>
                  </span>
                </div>
              )}
              {[
                ['Planned', `${totalPlanned} cr.`, 'var(--gold)'],
                ['Required', `${totalRequired} cr.`, 'var(--g400)'],
              ].map(([l, v, c]) => (
                <div key={l} className="flex items-center gap-1.5">
                  <div style={{ width: 10, height: 10, background: c, borderRadius: 2, border: '1.5px solid var(--black)' }} />
                  <span className="font-sans text-xs" style={{ color: 'var(--g600)' }}>
                    {l}: <strong style={{ color: c }}>{v}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="progress" style={{ height: 10 }}>
            <div className="progress-fill" style={{ width: `${Math.min(100, (totalPlanned / totalRequired) * 100)}%` }} />
          </div>
        </div>

        {/* Semester columns */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {semesters.map((sem) => {
              const semCredits = sem.courses.reduce((s, c) => s + c.credits, 0);
              const isOver = dragOver === sem.id;
              return (
                <div
                  key={sem.id}
                  style={{ width: 208, flexShrink: 0 }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(sem.id); }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => handleDrop(sem.id)}
                >
                  <div style={{
                    background: isOver ? 'var(--gold)' : 'var(--black)',
                    color: isOver ? 'var(--black)' : 'var(--gold)',
                    fontFamily: 'Syne', fontWeight: 800, fontSize: 11, letterSpacing: 1,
                    padding: '9px 12px', borderRadius: '6px 6px 0 0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: '2px solid var(--black)',
                  }}>
                    <span style={{ letterSpacing: 0.5 }}>{sem.label.toUpperCase()}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs" style={{ color: isOver ? 'rgba(0,0,0,0.5)' : 'rgba(241,184,45,0.6)', fontWeight: 400 }}>
                        {semCredits} cr.
                      </span>
                      <button
                        onClick={() => removeSemester(sem.id)}
                        style={{ color: isOver ? 'rgba(0,0,0,0.4)' : 'rgba(241,184,45,0.3)', fontSize: 16, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                      >×</button>
                    </div>
                  </div>
                  <div style={{
                    border: '2px solid var(--black)', borderTop: 'none',
                    borderRadius: '0 0 6px 6px', minHeight: 260,
                    padding: 8, background: 'var(--off)',
                    boxShadow: '4px 4px 0 var(--black)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {sem.courses.map((c) => {
                        const unmet = getUnmetPrereqs(c.courseId, sem.id);
                        const isRequired = degreeRequiredIds.has(c.courseId);
                        const isElective = degreeElectiveIds.has(c.courseId);
                        return (
                          <div
                            key={c.courseId}
                            draggable
                            onDragStart={() => setDragging({ courseId: c.courseId, fromSem: sem.id })}
                            onDragEnd={() => setDragging(null)}
                            className="card"
                            style={{
                              padding: '8px 10px', boxShadow: '2px 2px 0 var(--black)',
                              borderColor: unmet.length > 0 ? '#f59e0b' : 'var(--black)',
                              borderLeft: `3px solid ${isRequired ? 'var(--gold)' : isElective ? '#60a5fa' : 'var(--g200)'}`,
                              background: unmet.length > 0 ? '#fffdf0' : 'var(--white)',
                              cursor: 'grab',
                            }}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <Link
                                href={courseUrl(c.courseId)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ textDecoration: 'none' }}
                              >
                                <span className="chip chip-black" style={{ fontSize: 9, padding: '2px 6px', cursor: 'pointer' }}>
                                  {c.courseId.replace('_', ' ')}
                                </span>
                              </Link>
                              <GPABadge gpa={c.avgGPA ?? null} size="sm" />
                            </div>
                            <Link
                              href={courseUrl(c.courseId)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ textDecoration: 'none' }}
                            >
                              <div className="font-sans text-xs font-medium leading-snug mb-1.5" style={{ color: 'var(--black)' }}>
                                {c.title}
                              </div>
                            </Link>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs" style={{ color: 'var(--g400)' }}>{c.credits} cr.</span>
                                {unmet.length > 0 && <span className="warn">⚠ Prereq</span>}
                                {isRequired && !unmet.length && (
                                  <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'Space Grotesk', fontWeight: 600 }}>REQ</span>
                                )}
                              </div>
                              <button
                                onClick={() => removeCourse(sem.id, c.courseId)}
                                style={{ color: 'var(--g400)', fontSize: 16, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}
                              >×</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {sem.courses.length === 0 && (
                      <div style={{
                        border: '2px dashed var(--g200)', borderRadius: 6, height: 70,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Space Grotesk', fontSize: 11, color: 'var(--g400)',
                      }}>
                        Drag or add courses
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div style={{ flexShrink: 0, paddingTop: 42 }}>
              <button
                onClick={addSemester}
                className="btn btn-outline"
                style={{ borderStyle: 'dashed', boxShadow: 'none', fontSize: 12, height: 44, minWidth: 130 }}
              >
                + Add Semester
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SidebarCourseRowProps {
  courseId: string;
  title: string;
  credits: number;
  gpa: number | null;
  status: 'planned' | 'ok' | 'missing-prereq' | 'no-prereqs';
  onAdd: () => void;
}

function SidebarCourseRow({ courseId, title, credits, gpa, status, onAdd }: SidebarCourseRowProps) {
  const isPlanned = status === 'planned';
  const isMissing = status === 'missing-prereq';
  const courseUrl = `/course/${courseId}`;

  return (
    <div style={{
      background: isPlanned ? '#0d1a0d' : '#1a1a1a',
      border: `1.5px solid ${isPlanned ? '#1a3d1a' : isMissing ? '#3d2a00' : '#2a2a2a'}`,
      borderRadius: 5, padding: '7px 9px',
      opacity: isPlanned ? 0.6 : 1,
    }}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <Link href={courseUrl} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <span className="font-mono text-xs" style={{ color: isPlanned ? '#4ade80' : isMissing ? '#f59e0b' : 'var(--gold)' }}>
            {courseId.replace('_', ' ')}
          </span>
        </Link>
        {gpa !== null && (
          <span className="font-mono text-xs" style={{ color: 'var(--g600)', flexShrink: 0 }}>
            {gpa.toFixed(2)}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-1">
        <Link href={courseUrl} style={{ textDecoration: 'none', flex: 1, minWidth: 0 }}>
          <span className="font-sans text-xs font-medium" style={{
            color: isPlanned ? '#4ade80' : 'var(--white)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {title}
          </span>
        </Link>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="font-mono text-xs" style={{ color: 'var(--g600)' }}>{credits}cr</span>
          {isPlanned ? (
            <span style={{ fontSize: 12, color: '#4ade80' }}>✓</span>
          ) : (
            <button
              onClick={onAdd}
              title={isMissing ? 'Warning: unmet prerequisites' : 'Add to selected semester'}
              style={{
                fontSize: 14, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer',
                color: isMissing ? '#f59e0b' : 'var(--gold)',
              }}
            >+</button>
          )}
        </div>
      </div>
    </div>
  );
}
