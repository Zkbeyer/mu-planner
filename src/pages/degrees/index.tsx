import { useState, useMemo, useCallback } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import type { Degree } from '@/types';
import { readDegrees } from '@/lib/data-server';
import ScraperLoader from '@/components/ScraperLoader';

// Phase 1: fast index scrape (~2s) — blocks only when no degree data exists at all
const INDEX_NEEDS = [
  {
    key: 'degreesIndex' as const,
    scraper: 'degrees',
    label: 'Degree List',
    description: 'Quickly loads all degree names and colleges from the Mizzou catalog index.',
    stubsOnly: true,
  },
];

// Phase 2: full degree details — runs silently in the background after stubs are loaded
const FULL_NEEDS = [
  {
    key: 'degrees' as const,
    scraper: 'degrees',
    label: 'Degree Details',
    description: 'Fetching full course requirements for all degrees.',
  },
];

interface DegreesProps {
  degrees: Degree[];
}

export default function DegreesPage({ degrees: initialDegrees }: DegreesProps) {
  const [degrees, setDegrees] = useState(initialDegrees);
  const [college, setCollege] = useState('All');
  const [query, setQuery] = useState('');

  // Called by the background ScraperLoader for each degree as it is scraped
  const handleDegree = useCallback((d: Degree) => {
    setDegrees((prev) => {
      const idx = prev.findIndex((e) => e.id === d.id);
      if (idx === -1) return [...prev, d];
      const next = [...prev];
      next[idx] = d;
      return next;
    });
  }, []);

  const colleges = useMemo(
    () => Array.from(new Set(degrees.map((d) => d.college))).sort(),
    [degrees],
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return degrees.filter((d) => {
      if (college !== 'All' && d.college !== college) return false;
      if (q && !d.name.toLowerCase().includes(q) && !d.college.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [degrees, college, query]);

  return (
    <ScraperLoader needs={INDEX_NEEDS}>
      <ScraperLoader needs={FULL_NEEDS} background onDegree={handleDegree}>
        <>
        <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}@keyframes mu-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <Head><title>Degree Explorer | MU Planner</title></Head>

        <div style={{ maxWidth: 980, margin: '0 auto', padding: '40px 48px 64px' }}>
          <div className="flex items-end gap-5 mb-8 flex-wrap">
            <div>
              <div className="font-syne font-extrabold" style={{ fontSize: 40, letterSpacing: -1, lineHeight: 1 }}>
                DEGREE<br />EXPLORER
              </div>
              <div className="font-sans text-sm mt-1" style={{ color: 'var(--g400)' }}>
                Browse all Mizzou undergraduate degrees
              </div>
            </div>
            <div className="flex gap-2 flex-wrap ml-auto">
              {['All', ...colleges].map((c) => (
                <button key={c} onClick={() => setCollege(c)} className="font-syne font-bold"
                  style={{
                    fontSize: 11, letterSpacing: 0.5, padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
                    background: college === c ? 'var(--black)' : 'var(--white)',
                    color: college === c ? 'var(--gold)' : 'var(--black)',
                    border: '2px solid var(--black)',
                    boxShadow: college === c ? '3px 3px 0 var(--gold)' : '3px 3px 0 var(--black)',
                    transition: 'all 0.1s',
                  }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28, maxWidth: 400 }}>
            <input className="inp" placeholder="Search degrees…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
            {filtered.map((degree, i) => (
              <Link key={degree.id} href={`/degrees/${degree.id}`} className="block">
                <div className="card card-hover fade-up" style={{ padding: 22, cursor: 'pointer', animationDelay: `${i * 0.05}s` }}>
                  <span className="label" style={{ display: 'block', marginBottom: 6 }}>{degree.college}</span>
                  <div className="font-syne font-extrabold text-lg leading-snug mb-3">{degree.name}</div>
                  <div style={{ height: 2, background: 'var(--gold)', marginBottom: 14, width: 40 }} />
                  {degree.stub ? (
                    <div className="flex gap-5" style={{ marginBottom: 14 }}>
                      <div>
                        <div className="font-mono font-medium text-2xl" style={{ color: 'var(--g300)' }}>—</div>
                        <span className="label" style={{ fontSize: 9 }}>total credits</span>
                      </div>
                      <div>
                        <div className="font-mono font-medium text-2xl" style={{ color: 'var(--g300)' }}>—</div>
                        <span className="label" style={{ fontSize: 9 }}>required courses</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-5" style={{ marginBottom: 14 }}>
                      <div>
                        <div className="font-mono font-medium text-2xl" style={{ color: 'var(--gold)' }}>{degree.totalCredits}</div>
                        <span className="label" style={{ fontSize: 9 }}>total credits</span>
                      </div>
                      <div>
                        <div className="font-mono font-medium text-2xl">{degree.requiredCourses.length}</div>
                        <span className="label" style={{ fontSize: 9 }}>required courses</span>
                      </div>
                      {degree.electivePools.length > 0 && (
                        <div>
                          <div className="font-mono font-medium text-2xl" style={{ color: 'var(--g400)' }}>{degree.electivePools.length}</div>
                          <span className="label" style={{ fontSize: 9 }}>elective pools</span>
                        </div>
                      )}
                    </div>
                  )}
                  <button className="btn btn-black btn-sm" style={{ fontSize: 11, alignSelf: 'flex-start' }}>View →</button>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0' }}>
              <div className="font-syne font-extrabold text-3xl mb-2" style={{ color: 'var(--g200)' }}>NO RESULTS</div>
              <button onClick={() => { setQuery(''); setCollege('All'); }} className="btn btn-outline btn-sm mt-3">
                Clear Filters
              </button>
            </div>
          )}
        </div>

        </>
      </ScraperLoader>
    </ScraperLoader>
  );
}

export const getServerSideProps: GetServerSideProps<DegreesProps> = async () => {
  const degrees = readDegrees();
  return { props: { degrees } };
};
