import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import Fuse from 'fuse.js';
import type { Course } from '@/types';
import { readSubjects, readCourses } from '@/lib/data-server';
import CourseCard from '@/components/CourseCard';

// ── Types ──────────────────────────────────────────────────────────────────────

interface HomeProps {
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
  | { type: 'course'; id: string; code: string; title: string }
  | { type: 'professor'; name: string; slug: string };

interface HomeSession {
  selected: string | null;
  query: string;
  minGPA: number;
  credits: 'all' | '1-3' | '4+';
  sidebarQuery: string;
  scrollTop: number;
}

// ── Session helpers ────────────────────────────────────────────────────────────

const SESSION_KEY = 'mu-home-state';

function readSession(): Partial<HomeSession> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Partial<HomeSession>) : {};
  } catch { return {}; }
}

function writeSession(s: HomeSession) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  catch {}
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Spinner({ size = 16, color = 'var(--gold)' }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `${Math.max(2, Math.floor(size / 7))}px solid rgba(200,200,200,0.15)`,
      borderTopColor: color,
      animation: 'mu-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function StatusDot({ hasData }: { hasData: boolean }) {
  return (
    <div style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: hasData ? '#4ade80' : 'var(--g200)',
    }} />
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Home({ initialSubjects, initialCourseCount }: HomeProps) {
  const router = useRouter();

  const [subjectList] = useState<SubjectInfo[]>(() =>
    initialSubjects.map(code => ({
      code,
      courseCount: initialCourseCount[code] ?? 0,
    }))
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null);
  const [subjectLoading, setSubjectLoading] = useState(false);

  const [query, setQuery] = useState('');
  const [minGPA, setMinGPA] = useState(0);
  const [credits, setCredits] = useState<'all' | '1-3' | '4+'>('all');
  const [sidebarQuery, setSidebarQuery] = useState('');

  const [globalQuery, setGlobalQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSugs, setShowSugs] = useState(false);

  const fuseRef = useRef<Fuse<SearchItem> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number>(0);
  const saveStateRef = useRef<HomeSession>({
    selected: null, query: '', minGPA: 0, credits: 'all', sidebarQuery: '', scrollTop: 0,
  });

  useEffect(() => {
    saveStateRef.current = { selected, query, minGPA, credits, sidebarQuery, scrollTop: scrollRef.current?.scrollTop ?? 0 };
  }, [selected, query, minGPA, credits, sidebarQuery]);

  // ── Subject selection ────────────────────────────────────────────────────────

  const loadSubjectData = useCallback(async (code: string) => {
    setSubjectLoading(true);
    setSubjectData(null);
    try {
      const r = await fetch(`/data/by-subject/${code}.json`);
      if (!r.ok) throw new Error('Not found');
      const data = (await r.json()) as SubjectData;
      setSubjectData(data);
    } catch {
      // No data for this subject
    } finally {
      setSubjectLoading(false);
    }
  }, []);

  async function handleSelectSubject(code: string) {
    if (code === selected) return;
    setSelected(code);
    setQuery('');
    setSubjectData(null);
    setSubjectLoading(false);
    setGlobalQuery('');
    setShowSugs(false);
    await loadSubjectData(code);
  }

  // ── Session restore + navigation save ────────────────────────────────────────

  useEffect(() => {
    const saved = readSession();
    if (saved.query) setQuery(saved.query);
    if (saved.minGPA !== undefined) setMinGPA(saved.minGPA);
    if (saved.credits) setCredits(saved.credits);
    if (saved.sidebarQuery) setSidebarQuery(saved.sidebarQuery);
    if (saved.scrollTop) pendingScrollRef.current = saved.scrollTop;
    if (saved.selected) {
      setSelected(saved.selected);
      loadSubjectData(saved.selected);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => {
      writeSession({ ...saveStateRef.current, scrollTop: scrollRef.current?.scrollTop ?? 0 });
    };
    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [router.events]);

  useEffect(() => {
    if (subjectData && pendingScrollRef.current > 0) {
      const el = scrollRef.current;
      const target = pendingScrollRef.current;
      pendingScrollRef.current = 0;
      requestAnimationFrame(() => { if (el) el.scrollTop = target; });
    }
  }, [subjectData]);

  // ── Global autocomplete search (Fuse.js, lazy index load) ──────────────────

  useEffect(() => {
    const q = globalQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setShowSugs(false);
      return;
    }

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
          fuseRef.current = new Fuse(data, {
            keys: ['title', 'code', 'id'],
            threshold: 0.35,
            includeScore: true,
          });
        } catch { return; }
      }
      const results = fuseRef.current.search(q, { limit: 6 });
      const courseSugs: Suggestion[] = results.map(r => ({
        type: 'course', id: r.item.id, code: r.item.code, title: r.item.title,
      }));
      const combined = [...subjectSugs, ...courseSugs];
      setSuggestions(combined);
      setShowSugs(combined.length > 0);
    }, 220);

    return () => clearTimeout(timer);
  }, [globalQuery, subjectList]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        searchInputRef.current?.contains(e.target as Node) ||
        suggestionsRef.current?.contains(e.target as Node)
      ) return;
      setShowSugs(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function handleSuggestionClick(sug: Suggestion) {
    setShowSugs(false);
    setGlobalQuery('');
    if (sug.type === 'subject') handleSelectSubject(sug.code);
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const sidebarFiltered = useMemo(() => {
    const q = sidebarQuery.toLowerCase().trim();
    if (!q) return subjectList;
    return subjectList.filter(s => s.code.toLowerCase().includes(q));
  }, [sidebarQuery, subjectList]);

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

  const readyCount = subjectList.filter(s => s.courseCount > 0).length;

  const subjectSugs = suggestions.filter(s => s.type === 'subject');
  const courseSugs  = suggestions.filter(s => s.type === 'course');

  return (
    <>
      <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}`}</style>
      <Head>
        <title>MU Planner — Mizzou Course Explorer</title>
        <meta name="description" content="Browse Mizzou courses by department, check grade distributions, and plan your degree." />
      </Head>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="hero-stripe" style={{ padding: '36px 48px 28px', borderBottom: '2px solid var(--black)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div className="font-syne font-extrabold" style={{ fontSize: 44, color: 'var(--black)', letterSpacing: -1, lineHeight: 1, marginBottom: 8 }}>
            FIND YOUR COURSES.
          </div>
          <div className="font-sans" style={{ fontSize: 15, color: 'rgba(0,0,0,0.5)', marginBottom: 20 }}>
            Browse by department · Check grade distributions · Explore professor ratings
          </div>

          {/* Global search */}
          <div style={{ position: 'relative', maxWidth: 600 }}>
            <input
              ref={searchInputRef}
              className="inp"
              placeholder='Search courses, departments, or professors — e.g. "Algorithms", "CMP_SC", "Smith"'
              value={globalQuery}
              onChange={e => { setGlobalQuery(e.target.value); setShowSugs(true); }}
              onFocus={() => suggestions.length > 0 && setShowSugs(true)}
              style={{ height: 48, fontSize: 14, paddingRight: 44 }}
            />
            <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--g400)', pointerEvents: 'none' }}>⌕</span>

            {showSugs && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
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
                        onMouseDown={() => handleSuggestionClick(sug)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '9px 14px', textAlign: 'left',
                          background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--g100)',
                          cursor: 'pointer',
                        }}
                      >
                        <StatusDot hasData={sug.courseCount > 0} />
                        <span className="font-mono font-bold" style={{ fontSize: 13, color: 'var(--black)' }}>{sug.code}</span>
                        <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)', marginLeft: 4 }}>
                          {sug.courseCount > 0 ? `${sug.courseCount} courses` : 'No data yet'}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--g400)', fontFamily: 'var(--font-sans)' }}>Department ↗</span>
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
                      <Link
                        key={`c-${sug.id}`}
                        href={`/course/${sug.id}`}
                        onClick={() => setShowSugs(false)}
                        style={{ textDecoration: 'none' }}
                      >
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 14px',
                          borderBottom: '1px solid var(--g100)',
                          cursor: 'pointer',
                        }}>
                          <span className="chip chip-black" style={{ fontSize: 10, padding: '2px 7px', flexShrink: 0 }}>{sug.code}</span>
                          <span className="font-sans" style={{ fontSize: 13, color: 'var(--black)' }}>{sug.title}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>View →</span>
                        </div>
                      </Link>
                    ))}
                  </>
                )}
              </div>
            )}

            {showSugs && globalQuery && suggestions.length === 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
                background: 'var(--white)', border: '2px solid var(--black)',
                borderRadius: 6, marginTop: 4, padding: '12px 14px',
              }}>
                <span className="font-sans text-sm" style={{ color: 'var(--g400)' }}>No matches found.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-panel body ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '256px 1fr', height: 'calc(100vh - 56px - 148px)' }}>

        {/* ─ Left sidebar ─────────────────────────────────────────────────── */}
        <div style={{
          borderRight: '2px solid var(--black)',
          display: 'flex', flexDirection: 'column',
          height: '100%', overflow: 'hidden',
          background: 'var(--off)',
        }}>
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--g100)', flexShrink: 0 }}>
            <div className="font-syne font-bold" style={{ fontSize: 9, letterSpacing: 1.2, color: 'var(--g400)', marginBottom: 7 }}>
              DEPARTMENTS ({subjectList.length})
            </div>
            <input
              className="inp"
              placeholder="Filter…"
              value={sidebarQuery}
              onChange={e => setSidebarQuery(e.target.value)}
              style={{ height: 30, fontSize: 12, padding: '0 9px' }}
            />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 3, paddingBottom: 4 }}>
            {sidebarFiltered.length === 0 && (
              <div className="font-sans" style={{ fontSize: 12, color: 'var(--g400)', padding: '16px 12px' }}>
                No departments match.
              </div>
            )}
            {sidebarFiltered.map(s => {
              const isSelected = selected === s.code;
              return (
                <button
                  key={s.code}
                  onClick={() => handleSelectSubject(s.code)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 12px',
                    background: isSelected ? 'rgba(241,183,0,0.1)' : 'transparent',
                    borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                    borderLeft: `3px solid ${isSelected ? 'var(--gold)' : 'transparent'}`,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <StatusDot hasData={s.courseCount > 0} />
                  <span className="font-mono" style={{
                    fontSize: 12,
                    color: isSelected ? 'var(--black)' : 'var(--g600)',
                    fontWeight: isSelected ? 700 : 400,
                    flex: 1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.code}
                  </span>
                  {s.courseCount > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--g400)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                      {s.courseCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '8px 12px', borderTop: '1px solid var(--g100)', flexShrink: 0 }}>
            <div className="font-sans" style={{ fontSize: 10, color: 'var(--g400)' }}>
              {readyCount} of {subjectList.length} departments loaded
            </div>
          </div>
        </div>

        {/* ─ Main content panel ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* Sticky filter bar */}
          <div style={{
            background: 'var(--black)', padding: '8px 20px',
            borderBottom: '2px solid #222',
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            flexShrink: 0,
          }}>
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 0 }}>
              <input
                className="inp"
                placeholder={subjectData ? `Search in ${selected}…` : 'Select a department →'}
                value={query}
                onChange={e => setQuery(e.target.value)}
                disabled={!subjectData}
                style={{
                  height: 34, fontSize: 13, paddingRight: 34,
                  background: !subjectData ? '#111' : undefined,
                  color: !subjectData ? 'var(--g600)' : undefined,
                }}
              />
              <span style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--g400)', pointerEvents: 'none' }}>⌕</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>Min GPA</span>
              <input
                type="range" min={0} max={4} step={0.5} value={minGPA}
                onChange={e => setMinGPA(+e.target.value)}
                style={{ width: 66, accentColor: 'var(--gold)', cursor: 'pointer' }}
              />
              <span className="font-mono" style={{ fontSize: 11, color: 'var(--gold)', minWidth: 22 }}>
                {minGPA === 0 ? 'Any' : minGPA.toFixed(1)}
              </span>
            </div>

            <div className="flex gap-1">
              {(['all', '1-3', '4+'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setCredits(v)}
                  style={{
                    fontSize: 10, fontFamily: 'Syne, sans-serif', fontWeight: 700,
                    letterSpacing: 0.3, padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
                    background: credits === v ? 'var(--gold)' : '#1a1a1a',
                    color: credits === v ? 'var(--black)' : 'var(--g400)',
                    border: `1.5px solid ${credits === v ? 'var(--gold)' : '#333'}`,
                    transition: 'all 0.12s',
                  }}
                >
                  {v === 'all' ? 'All credits' : `${v} cr.`}
                </button>
              ))}
            </div>

            {subjectData && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--g600)', fontFamily: 'var(--font-sans)' }}>
                {filteredCourses.length} course{filteredCourses.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Scrollable course content */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '22px 20px' }}>

            {!selected && (
              <div style={{ textAlign: 'center', paddingTop: 72 }}>
                <div className="font-syne font-extrabold" style={{ fontSize: 32, color: 'var(--g200)', marginBottom: 12 }}>
                  BROWSE BY DEPARTMENT
                </div>
                <div className="font-sans text-sm" style={{ color: 'var(--g400)', marginBottom: 16 }}>
                  Select a department from the sidebar to see its courses and grade data.
                </div>
                <div className="font-sans" style={{ fontSize: 11, color: 'var(--g400)' }}>
                  {readyCount} department{readyCount !== 1 ? 's' : ''} loaded.
                </div>
              </div>
            )}

            {selected && subjectLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 }}>
                <Spinner size={22} />
                <span className="font-sans" style={{ color: 'var(--g400)', fontSize: 14 }}>
                  Loading {selected}…
                </span>
              </div>
            )}

            {selected && !subjectLoading && !subjectData && (
              <div style={{ textAlign: 'center', paddingTop: 72 }}>
                <div className="font-syne font-extrabold" style={{ fontSize: 28, color: 'var(--g200)', marginBottom: 12 }}>
                  NO DATA YET
                </div>
                <div className="font-sans text-sm" style={{ color: 'var(--g400)' }}>
                  Course data for {selected} hasn't been scraped yet. It will be available after the next scheduled update.
                </div>
              </div>
            )}

            {selected && subjectData && (
              filteredCourses.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: 60 }}>
                  <div className="font-syne font-extrabold" style={{ fontSize: 28, color: 'var(--g200)', marginBottom: 12 }}>
                    NO RESULTS
                  </div>
                  <div className="font-sans text-sm" style={{ color: 'var(--g400)', marginBottom: 16 }}>
                    Try a different search or relax your filters.
                  </div>
                  <button
                    onClick={() => { setQuery(''); setMinGPA(0); setCredits('all'); }}
                    className="btn btn-outline btn-sm"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 14 }}>
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
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Static data ────────────────────────────────────────────────────────────────

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const subjects = readSubjects();
  const courses = readCourses();

  const initialCourseCount: Record<string, number> = {};
  for (const c of courses) {
    initialCourseCount[c.subject] = (initialCourseCount[c.subject] || 0) + 1;
  }

  return { props: { initialSubjects: subjects, initialCourseCount } };
};
