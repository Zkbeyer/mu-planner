import { useEffect, useState } from 'react';
import { storageAvailable } from '@/lib/storage';

export default function StorageBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!storageAvailable);
  }, []);

  if (!show) return null;

  return (
    <div className="w-full flex items-center justify-between gap-4 px-6 py-2" style={{
      background: 'var(--yellow-bg)',
      borderBottom: '2px solid var(--gold-dark)',
      fontFamily: 'Space Grotesk',
    }}>
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--yellow)' }}>
        <span>⚠</span>
        Your browser is blocking local storage. Data won&apos;t be saved this session.
      </div>
      <button
        onClick={() => setShow(false)}
        className="font-syne font-bold text-xs"
        style={{ color: 'var(--gold-dark)' }}
      >
        Dismiss
      </button>
    </div>
  );
}
