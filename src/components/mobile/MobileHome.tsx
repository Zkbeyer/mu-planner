import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Fuse from 'fuse.js';
import type { Course } from '@/types';
import CourseCard from '@/components/CourseCard';

interface MobileHomeProps {
  initialSubjects: string[];
  initialCourseCount: Record<string, number>;
}

interface SubjectInfo {
  code: string;
  courseCount: number;
}

interface SubjectData {
  courses: Course[];
  gpaMap: Record<string, number | null>;
  professorCountMap: Record<string, number>;
}

interface SearchItem {
  id: string;
  code: string;
  title: string;
}

type Suggestion =
  | { type: 'subject'; code: string; courseCount: number }
  | { type: 'course'; id: string; code: string; title: string };

interface HomeSession {
  selected: string | null;
  query: string;
  minGPA: number;
  credits: 'all' | '1-3' | '4+';
  sidebarQuery: string;
  scrollTop: number;
}

const SESSION_KEY = 'mu-home-state';

function readSession(): Partial<HomeSession> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Partial<HomeSession>) : {};
  } catch { return {}; }
}

function writeSession(s: HomeSession) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}

function StatusDot({ hasData }: { hasData: boolean }) {
  return (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: hasData ? '#4ade80' : 'var(--g200)',
      display: 'inline-block',
    }} />
  );
}

function Spinner() {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      border: '3px solid rgba(200,200,200,0.15)',
      borderTopColor: 'var(--gold)',
      animation: 'mu-spin 0.7s linear infinite',
    }} />
  );
}

export default function MobileHome({ initialSubjects, initialCourseCount }: MobileHomeProps) {
  const router = useRouter();

  const [subjectList] = useState<SubjectInfo[]>(() =>
    initialSubjects.map(code => ({ code, courseCount: initialCourseCount[code] ?? 0 }))
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null);
  const [subjectLoading, setSubjectLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [minGPA, setMinGPA] = useState(0);
  const [credits, setCredits] = useState<'all' | '1-3' | '4+'>('all');
  const [deptFilter, setDeptFilter] = useState('');

  const [globalQuery, setGlobalQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);

  const fuseRef = useRef<Fuse<SearchItem> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const deptSectionRef = useRef<HTMLDivElement>(null);
  const saveStateRef = useRef<HomeSession>({
    selected: null, query: '', minGPA: 0, credits: 'all', sidebarQuery: '', scrollTop: 0,
  });

  useEffect(() => {
    saveStateRef.current = { selected, query, minGPA, credits, sidebarQuery: deptFilter, scrollTop: 0 };
  }, [selected, query, minGPA, credits, deptFilter]);

  const loadSubjectData = useCallback(async (code: string) => {
    setSubjectLoading(true);
    setSubjectData(null);
    try {
      const r = await fetch(`/data/by-subject/${code}.json`);
      if (!r.ok) throw new Error('Not found');
      setSubjectData(await r.json() as SubjectData);
    } catch {
      // no data for this subject
    } finally {
      setSubjectLoading(false);
    }
  }, []);

  async function handleSelectSubject(code: string) {
    if (code === selected) {
      setSelected(null);
      setSubjectData(null);
      return;
    }
    setSelected(code);
    setQuery('');
    setSubjectData(null);
    setGlobalQuery('');
    setShowSugs(false);
    await loadSubjectData(code);
  }

  function handleDeselect() {
    setSelected(null);
    setSubjectData(null);
    setQuery('');
    deptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Session restore
  useEffect(() => {
    const saved = readSession();
    if (saved.query) setQuery(saved.query);
    if (saved.minGPA !== undefined) setMinGPA(saved.minGPA);
    if (saved.credits) setCredits(saved.credits);
    if (saved.sidebarQuery) setDeptFilter(saved.sidebarQuery);
    if (saved.selected) {
      setSelected(saved.selected);
      loadSubjectData(saved.selected);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => writeSession({ ...saveStateRef.current, scrollTop: 0 });
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  // Global search suggestions
  useEffect(() => {
    const q = globalQuery.trim();
    if (q.length < 2) { setSuggestions([]); setShowSugs(false); return; }

    const ql = q.toLowerCase();
    const subjectSugs: Suggestion[] = [];
    for (const s of subjectList) {
      if (s.code.toLowerCase().includes(ql)) {
        subjectSugs.push({ type: 'subject', code: s.code, courseCount: s.courseCount });
        if (subjectSugs.length >= 3) break;
      }
    }
    setSuggestions(subjectSugs);
    if (subjectSugs.length > 0) setShowSugs(true);

    const timer = setTimeout(async () => {
      if (!fuseRef.current) {
        try {
          const r = await fetch('/data/search-index.json');
          const data: SearchItem[] = await r.json();
          fuseRef.current = new Fuse(data, { keys: ['title', 'code', 'id'], threshold: 0.35, includeScore: true });
        } catch { return; }
      }
      const results = fuseRef.current.search(q, { limit: 6 });
      const courseSugs: Suggestion[] = results.map(r => ({
        type: 'course' as const, id: r.item.id, code: r.item.code, title: r.item.title,
      }));
      const combined = [...subjectSugs, ...courseSugs];
      setSuggestions(combined);
      setShowSugs(combined.length > 0);
    }, 220);

    return () => clearTimeout(timer);
  }, [globalQuery, subjectList]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchInputRef.current?.contains(e.target as Node) || suggestionsRef.current?.contains(e.target as Node)) return;
      setShowSugs(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const deptFiltered = useMemo(() => {
    const q = deptFilter.toLowerCase().trim();
    if (!q) return subjectList;
    return subjectList.filter(s => s.code.toLowerCase().includes(q));
  }, [deptFilter, subjectList]);

  const filteredCourses = useMemo(() => {
    if (!subjectData) return [];
    const q = query.toLowerCase().trim();
    return subjectData.courses.filter(c => {
      if (q) {
        const code = `${c.subject} ${c.number}`.toLowerCase();
        if (!c.title.toLowerCase().includes(q) && !code.includes(q)) return false;
      }
      if (minGPA > 0) {
        const gpa = subjectData.gpaMap[c.id];
        if (gpa == null || gpa < minGPA) return false;
      }
      if (credits === '1-3' && c.credits > 3) return false;
      if (credits === '4+' && c.credits < 4) return false;
      return true;
    });
  }, [query, minGPA, credits, subjectData]);

  const subjectSugs = suggestions.filter(s => s.type === 'subject');
  const courseSugs = suggestions.filter(s => s.type === 'course');

  return (
    <>
      <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}`}</style>
      <Head>
        <title>MU Planner — Mizzou Course Explorer</title>
        <meta name="description" content="Browse Mizzou courses by department, check grade distributions, and explore professor ratings." />
      </Head>

      {/* ── Hero ── */}
      <div className="hero-stripe" style={{ padding: '20px 16px 18px', borderBottom: '2px solid var(--black)' }}>
        <div className="font-syne font-extrabold" style={{ fontSize: 28, color: 'var(--black)', letterSpacing: -0.5, lineHeight: 1, marginBottom: 5 }}>
          FIND YOUR COURSES.
        </div>
        <div className="font-sans" style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginBottom: 14 }}>
          Browse by department · Check grade distributions
        </div>

        <div style={{ position: 'relative' }}>
          <input
            ref={searchInputRef}
            className="inp"
            placeholder="Search courses or departments…"
            value={globalQuery}
            onChange={e => { setGlobalQuery(e.target.value); setShowSugs(true); }}
            onFocus={() => suggestions.length > 0 && setShowSugs(true)}
            style={{ height: 46, fontSize: 15, paddingRight: 42 }}
          />
          <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--g400)', pointerEvents: 'none' }}>⌕</span>

          {showSugs && suggestions.length > 0 && (
            <div
              ref={suggestionsRef}
              style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
                background: 'var(--white)', border: '2px solid var(--black)',
                borderRadius: 6, boxShadow: '4px 4px 0 var(--black)',
                marginTop: 4, overflow: 'hidden',
              }}
            >
              {subjectSugs.length > 0 && (
                <>
                  <div style={{ padding: '5px 14px 3px', fontSize: 9, fontFamily: 'Syne, sans-serif', fontWeight: 700, letterSpacing: 1.4, color: 'var(--g400)', background: 'var(--off)', borderBottom: '1px solid var(--g100)' }}>
                    DEPARTMENTS
                  </div>
                  {subjectSugs.map(sug => sug.type === 'subject' && (
                    <button
                      key={`s-${sug.code}`}
                      onMouseDown={() => { setShowSugs(false); setGlobalQuery(''); handleSelectSubject(sug.code); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--g100)', cursor: 'pointer' }}
                    >
                      <StatusDot hasData={sug.courseCount > 0} />
                      <span className="font-mono font-bold" style={{ fontSize: 13, color: 'var(--black)' }}>{sug.code}</span>
                      <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>
                        {sug.courseCount > 0 ? `${sug.courseCount} courses` : 'No data yet'}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {courseSugs.length > 0 && (
                <>
                  <div style={{ padding: '5px 14px 3px', fontSize: 9, fontFamily: 'Syne, sans-serif', fontWeight: 700, letterSpacing: 1.4, color: 'var(--g400)', background: 'var(--off)', borderBottom: '1px solid var(--g100)' }}>
                    COURSES
                  </div>
                  {courseSugs.map(sug => sug.type === 'course' && (
                    <Link key={`c-${sug.id}`} href={`/course/${sug.id}`} onClick={() => setShowSugs(false)} style={{ textDecoration: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', borderBottom: '1px solid var(--g100)', cursor: 'pointer' }}>
                        <span className="chip chip-black" style={{ fontSize: 10, padding: '2px 7px', flexShrink: 0 }}>{sug.code}</span>
                        <span className="font-sans" style={{ fontSize: 13, color: 'var(--black)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sug.title}</span>
                        <span style={{ fontSize: 10, color: 'var(--gold)', flexShrink: 0 }}>View →</span>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          )}

          {showSugs && globalQuery && suggestions.length === 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300, background: 'var(--white)', border: '2px solid var(--black)', borderRadius: 6, marginTop: 4, padding: '12px 14px' }}>
              <span className="font-sans text-sm" style={{ color: 'var(--g400)' }}>No matches found.</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Departments pill strip ── */}
      <div ref={deptSectionRef} style={{ background: 'var(--off)', borderBottom: '2px solid var(--black)' }}>
        <div style={{ padding: '10px 16px 6px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="label" style={{ fontSize: 9, letterSpacing: 1.2, flexShrink: 0 }}>
            DEPARTMENTS ({subjectList.length})
          </span>
          <input
            className="inp"
            placeholder="Filter…"
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ height: 28, fontSize: 12, padding: '0 9px', flex: 1, boxShadow: '2px 2px 0 var(--black)' }}
          />
        </div>
        <div style={{
          overflowX: 'auto', display: 'flex', gap: 6,
          padding: '4px 16px 12px',
          msOverflowStyle: 'none',
        }}>
          {deptFiltered.length === 0 && (
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--g400)', padding: '6px 0' }}>No departments match.</span>
          )}
          {deptFiltered.map(s => {
            const isSel = selected === s.code;
            return (
              <button
                key={s.code}
                onClick={() => handleSelectSubject(s.code)}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '7px 12px', borderRadius: 20,
                  border: `2px solid ${isSel ? 'var(--black)' : 'var(--g200)'}`,
                  background: isSel ? 'var(--black)' : 'var(--white)',
                  color: isSel ? 'var(--gold)' : 'var(--g600)',
                  fontFamily: 'DM Mono, monospace', fontSize: 12,
                  fontWeight: isSel ? 700 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  boxShadow: isSel ? '2px 2px 0 var(--black)' : 'none',
                  transition: 'all 0.1s',
                }}
              >
                <StatusDot hasData={s.courseCount > 0} />
                {s.code}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      {!selected && (
        <div style={{ textAlign: 'center', padding: '52px 24px 24px' }}>
          <div className="font-syne font-extrabold" style={{ fontSize: 24, color: 'var(--g200)', marginBottom: 8 }}>
            SELECT A DEPARTMENT
          </div>
          <div className="font-sans" style={{ fontSize: 14, color: 'var(--g400)' }}>
            Tap a department above to see its courses and grade data.
          </div>
        </div>
      )}

      {selected && (
        <>
          {/* Sticky filter bar */}
          <div style={{
            position: 'sticky', top: 56, zIndex: 50,
            background: 'var(--black)', padding: '10px 14px',
            borderBottom: '2px solid #222', display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* Row 1: dept chip + search */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={handleDeselect}
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 10px', borderRadius: 20,
                  border: '2px solid var(--gold)', background: 'transparent',
                  color: 'var(--gold)', fontFamily: 'DM Mono, monospace', fontSize: 11,
                  fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                ← {selected}
              </button>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  className="inp"
                  placeholder={`Search in ${selected}…`}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  disabled={!subjectData}
                  style={{
                    height: 36, fontSize: 13, paddingRight: 34,
                    background: !subjectData ? '#111' : undefined,
                    color: !subjectData ? 'var(--g600)' : undefined,
                  }}
                />
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--g400)', pointerEvents: 'none' }}>⌕</span>
              </div>
            </div>

            {/* Row 2: GPA + credits + count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>Min GPA</span>
                <input
                  type="range" min={0} max={4} step={0.5} value={minGPA}
                  onChange={e => setMinGPA(+e.target.value)}
                  style={{ width: 68, accentColor: 'var(--gold)', cursor: 'pointer' }}
                />
                <span className="font-mono" style={{ fontSize: 11, color: 'var(--gold)', minWidth: 24 }}>
                  {minGPA === 0 ? 'Any' : minGPA.toFixed(1)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', '1-3', '4+'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setCredits(v)}
                    style={{
                      fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                      padding: '4px 8px', borderRadius: 3, cursor: 'pointer',
                      background: credits === v ? 'var(--gold)' : '#1a1a1a',
                      color: credits === v ? 'var(--black)' : 'var(--g400)',
                      border: `1.5px solid ${credits === v ? 'var(--gold)' : '#333'}`,
                    }}
                  >
                    {v === 'all' ? 'All cr.' : `${v} cr.`}
                  </button>
                ))}
              </div>
              {subjectData && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--g600)', fontFamily: 'var(--font-sans)' }}>
                  {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Loading */}
          {subjectLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '52px 16px', gap: 12 }}>
              <Spinner />
              <span className="font-sans" style={{ color: 'var(--g400)', fontSize: 14 }}>Loading {selected}…</span>
            </div>
          )}

          {/* No data */}
          {!subjectLoading && !subjectData && (
            <div style={{ textAlign: 'center', padding: '52px 24px' }}>
              <div className="font-syne font-extrabold" style={{ fontSize: 24, color: 'var(--g200)', marginBottom: 8 }}>NO DATA YET</div>
              <div className="font-sans" style={{ fontSize: 14, color: 'var(--g400)' }}>
                Data for {selected} will be available after the next scheduled update.
              </div>
            </div>
          )}

          {/* No results */}
          {subjectData && filteredCourses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '52px 24px' }}>
              <div className="font-syne font-extrabold" style={{ fontSize: 24, color: 'var(--g200)', marginBottom: 8 }}>NO RESULTS</div>
              <div className="font-sans" style={{ fontSize: 14, color: 'var(--g400)', marginBottom: 16 }}>
                Try a different search or relax your filters.
              </div>
              <button onClick={() => { setQuery(''); setMinGPA(0); setCredits('all'); }} className="btn btn-outline btn-sm">
                Clear Filters
              </button>
            </div>
          )}

          {/* Course list */}
          {subjectData && filteredCourses.length > 0 && (
            <div style={{ padding: '16px 14px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredCourses.map((course, i) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  avgGPA={subjectData.gpaMap[course.id] ?? null}
                  professorCount={subjectData.professorCountMap[course.id] ?? 0}
                  index={i}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
