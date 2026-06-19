import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import StorageBanner from './StorageBanner';
import { exportAllData, importAllData } from '@/lib/storage';

interface LayoutProps {
  children: React.ReactNode;
}

const NAV_LINKS = [
  { href: '/', label: 'Search' },
  { href: '/planner', label: 'Planner' },
  { href: '/degrees', label: 'Degrees' },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    importAllData(file, () => {
      e.target.value = '';
      router.reload();
    });
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--off)' }}>
      <StorageBanner />

      <nav style={{
        background: 'var(--black)',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        gap: 32,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderBottom: '2px solid #1a1a1a',
        flexShrink: 0,
      }}>
        <Link href="/" className="font-syne font-extrabold text-lg tracking-wide" style={{ color: 'var(--gold)', letterSpacing: 1 }}>
          MU PLANNER
        </Link>
        <div style={{ flex: 1 }} />
        {NAV_LINKS.map((link) => {
          const active =
            router.pathname === link.href ||
            (link.href !== '/' && router.pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className="font-syne font-bold text-sm transition-colors"
              style={{
                color: active ? 'var(--gold)' : 'var(--g400)',
                borderBottom: active ? '2px solid var(--gold)' : '2px solid transparent',
                paddingBottom: 2,
                letterSpacing: '0.5px',
              }}
            >
              {link.label}
            </Link>
          );
        })}

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={exportAllData}
            className="font-syne font-bold text-xs px-3 py-1.5 rounded transition-colors"
            style={{ color: 'var(--g400)', border: '1.5px solid #2a2a2a', background: 'transparent' }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--g400)'; }}
          >
            Export
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="font-syne font-bold text-xs px-3 py-1.5 rounded transition-colors"
            style={{ color: 'var(--g400)', border: '1.5px solid #2a2a2a', background: 'transparent' }}
            onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = 'var(--g400)'; }}
          >
            Import
          </button>
          <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
        </div>
      </nav>

      <main className="flex-1">
        {children}
      </main>

      <footer className="text-center text-xs py-4" style={{
        background: 'var(--black)',
        color: 'var(--g600)',
        fontFamily: 'Space Grotesk',
        borderTop: '2px solid #1a1a1a',
      }}>
        Data sourced from MU Registrar and RateMyProfessors. Not affiliated with the University of Missouri.
      </footer>
    </div>
  );
}
