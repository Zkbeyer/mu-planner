import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import type { DataKey, DataStatus } from '@/lib/data-server';
import type { Degree } from '@/types';

export type ScraperNeed = {
  key: DataKey;
  scraper: string;
  label: string;
  description: string;
  subject?: string;
  professor?: string;
  degreeId?: string;
  stubsOnly?: boolean;
};

interface ScraperLoaderProps {
  needs: ScraperNeed[];
  children: React.ReactNode;
  /** When true, always render children immediately and scrape silently in the background. */
  background?: boolean;
  /** Called for each degree as it is scraped, enabling progressive live updates. */
  onDegree?: (degree: Degree) => void;
}

type Phase = 'checking' | 'ready' | 'running' | 'success' | 'error';

function Spinner({ size = 24, color = 'var(--gold)' }: { size?: number; color?: string }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: `${Math.max(2, size / 10)}px solid #333`,
      borderTopColor: color,
      animation: 'mu-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

export default function ScraperLoader({ needs, children, background = false, onDegree }: ScraperLoaderProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');
  const [pendingNeeds, setPendingNeeds] = useState<ScraperNeed[]>([]);
  const [currentLabel, setCurrentLabel] = useState('');
  const [completedLabels, setCompletedLabels] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    const statusParams = new URLSearchParams();
    const sharedSubject = needs.find(n => n.subject)?.subject;
    const sharedProfessor = needs.find(n => n.professor)?.professor;
    const sharedDegreeId = needs.find(n => n.degreeId)?.degreeId;
    if (sharedSubject)   statusParams.set('subject',   sharedSubject);
    if (sharedProfessor) statusParams.set('professor', sharedProfessor);
    if (sharedDegreeId)  statusParams.set('degreeId',  sharedDegreeId);
    const statusUrl = `/api/data-status/${statusParams.toString() ? '?' + statusParams.toString() : ''}`;
    fetch(statusUrl)
      .then((r) => r.json())
      .then((status: DataStatus) => {
        const missing = needs.filter((n) => !status[n.key]?.ready);
        if (missing.length === 0) {
          setPhase('ready');
        } else {
          setPendingNeeds(missing);
          setPhase('running');
        }
      })
      .catch(() => setPhase('ready'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === 'running' && pendingNeeds.length > 0 && !runningRef.current) {
      runningRef.current = true;
      runQueue(pendingNeeds, []);
    }
  }, [phase, pendingNeeds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  function runQueue(queue: ScraperNeed[], done: string[]) {
    if (queue.length === 0) {
      setPhase('success');
      // Skip full-page reload when the caller is handling live degree updates itself
      if (!onDegree) setTimeout(() => router.reload(), background ? 800 : 1500);
      return;
    }

    const [next, ...rest] = queue;
    setCurrentLabel(next.label);

    const scrapeParams = new URLSearchParams({ target: next.scraper });
    if (next.subject)    scrapeParams.set('subject',    next.subject);
    if (next.professor)  scrapeParams.set('professor',  next.professor);
    if (next.degreeId)   scrapeParams.set('degreeId',   next.degreeId);
    if (next.stubsOnly)  scrapeParams.set('stubsOnly',  'true');
    const es = new EventSource(`/api/scrape/?${scrapeParams.toString()}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent) => {
      const data = JSON.parse(e.data as string) as { log?: string; done?: boolean; success?: boolean; degree?: Degree };
      if (data.degree && onDegree) onDegree(data.degree);
      if (data.log) setLogs((prev) => [...prev, data.log!]);
      if (data.done) {
        es.close();
        if (data.success) {
          const newDone = [...done, next.label];
          setCompletedLabels(newDone);
          runQueue(rest, newDone);
        } else {
          setPhase('error');
        }
      }
    };

    es.onerror = () => {
      es.close();
      setLogs((prev) => [...prev, `Connection lost during ${next.label}.`]);
      setPhase('error');
    };
  }

  function skip() {
    esRef.current?.close();
    setPhase('ready');
  }

  function retry() {
    runningRef.current = false;
    setLogs([]);
    setCompletedLabels([]);
    setPhase('running');
  }

  useEffect(() => () => { esRef.current?.close(); }, []);

  const allNeeds = pendingNeeds.length > 0 ? pendingNeeds : needs;

  // ── Background mode: always render children, show a small corner pill ──
  if (background) {
    return (
      <>
        <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}@keyframes mu-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
        {children}
        {phase === 'running' && (
          <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            background: 'var(--black)', color: 'var(--white)',
            border: '1.5px solid #333', borderRadius: 8,
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            animation: 'mu-fadein 0.2s ease',
          }}>
            <Spinner size={13} />
            <span className="font-sans" style={{ fontSize: 12, color: 'var(--g600)' }}>
              Updating {currentLabel}…
            </span>
          </div>
        )}
        {phase === 'error' && (
          <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
            background: 'var(--black)', border: '1.5px solid #ef4444', borderRadius: 8,
            padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <span style={{ color: '#ef4444', fontSize: 13 }}>✗</span>
            <span className="font-sans" style={{ fontSize: 12, color: '#ef4444' }}>Update failed</span>
            <button onClick={retry} className="font-sans" style={{ fontSize: 11, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}>
              Retry
            </button>
            <button onClick={skip} className="font-sans" style={{ fontSize: 11, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
        )}
      </>
    );
  }

  // ── Foreground mode: block with overlay until data is ready ──
  return (
    <>
      <style>{`@keyframes mu-spin{to{transform:rotate(360deg)}}@keyframes mu-fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {children}

      {phase !== 'ready' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: phase === 'checking' ? 'rgba(10,10,10,0.6)' : 'rgba(10,10,10,0.97)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 24px',
        }}>
          {phase === 'checking' && <Spinner size={36} />}

          {(phase === 'running' || phase === 'success' || phase === 'error') && (
            <div style={{
              width: '100%', maxWidth: 560,
              animation: 'mu-fadein 0.25s ease',
              display: 'flex', flexDirection: 'column', gap: 20,
            }}>
              {/* Header */}
              <div className="flex items-center gap-4">
                {phase === 'running' && <Spinner size={28} />}
                {phase === 'success' && <span style={{ fontSize: 24, color: '#4ade80' }}>✓</span>}
                {phase === 'error'   && <span style={{ fontSize: 24, color: '#ef4444' }}>✗</span>}
                <div>
                  <div className="font-syne font-extrabold" style={{
                    fontSize: 22, lineHeight: 1.2,
                    color: phase === 'success' ? '#4ade80' : phase === 'error' ? '#ef4444' : 'var(--white)',
                  }}>
                    {phase === 'running' && `Loading ${currentLabel}…`}
                    {phase === 'success' && 'Data loaded — reloading…'}
                    {phase === 'error'   && 'Scraper error'}
                  </div>
                  {phase === 'running' && (
                    <div className="font-sans text-xs" style={{ color: 'var(--g600)', marginTop: 3 }}>
                      {completedLabels.length}/{allNeeds.length} complete · do not close this tab
                    </div>
                  )}
                  {phase === 'error' && (
                    <div className="font-sans text-xs" style={{ color: 'var(--g600)', marginTop: 3 }}>
                      Check that Python 3 and scraper dependencies are installed.
                    </div>
                  )}
                </div>
              </div>

              {/* Step indicators */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {allNeeds.map((n) => {
                  const done = completedLabels.includes(n.label);
                  const active = n.label === currentLabel && phase === 'running';
                  return (
                    <div key={n.key} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      background: done ? '#0a1a0a' : active ? '#111' : '#0a0a0a',
                      border: `1.5px solid ${done ? '#1c3d1c' : active ? '#2a2a2a' : '#161616'}`,
                      borderRadius: 6, padding: '10px 14px',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {done   && <span style={{ color: '#4ade80', fontSize: 14 }}>✓</span>}
                        {active && <Spinner size={14} />}
                        {!done && !active && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#333' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="font-syne font-bold text-sm" style={{ color: done ? '#4ade80' : active ? 'var(--white)' : '#444' }}>
                          {n.label}
                        </div>
                        <div className="font-sans text-xs" style={{ color: '#333', marginTop: 2 }}>{n.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Log toggle + output */}
              <div>
                <button
                  onClick={() => setShowLogs((v) => !v)}
                  className="font-sans text-xs"
                  style={{ color: 'var(--g600)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}
                >
                  {showLogs ? '▲ Hide log output' : '▼ Show log output'}
                </button>
                {showLogs && (
                  <div ref={logsRef} style={{
                    background: '#050505', border: '1px solid #1a1a1a', borderRadius: 5,
                    height: 180, overflowY: 'auto', padding: '10px 12px',
                    fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#555', lineHeight: 1.7,
                  }}>
                    {logs.map((line, i) => (
                      <div key={i} style={{ color: line.includes('error') || line.includes('Error') ? '#ef4444' : '#555' }}>
                        {line || ' '}
                      </div>
                    ))}
                    {phase === 'running' && (
                      <div style={{ color: 'var(--gold)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Spinner size={8} /> running…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                {phase === 'error' && (
                  <button onClick={retry} className="btn btn-gold" style={{ height: 40, fontSize: 13 }}>
                    Retry
                  </button>
                )}
                {phase !== 'success' && (
                  <button
                    onClick={skip}
                    className="font-sans text-xs"
                    style={{ marginLeft: 'auto', color: '#444', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Skip — use sample data
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
