import type { Professor } from '@/types';

interface RMPBadgeProps {
  professor: Professor | null;
  showTags?: boolean;
}

export default function RMPBadge({ professor, showTags = false }: RMPBadgeProps) {
  if (!professor || professor.avgRating === null) {
    return (
      <span className="font-sans text-[11px] italic" style={{ color: 'var(--g400)' }}>No RMP data</span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <a
        href={professor.rmpUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{
          fontFamily: 'DM Mono', fontSize: 10,
          background: 'var(--yellow-bg)', color: 'var(--yellow)',
          border: '1px solid var(--gold-dark)', borderRadius: 3, padding: '1px 5px',
        }}>⭐ {professor.avgRating.toFixed(1)}</span>
        <span style={{
          fontFamily: 'DM Mono', fontSize: 10,
          background: 'var(--red-bg)', color: 'var(--red)',
          border: '1px solid var(--red)', borderRadius: 3, padding: '1px 5px',
        }}>🔥 {professor.avgDifficulty?.toFixed(1)}</span>
        {professor.wouldTakeAgainPct !== null && (
          <span style={{
            fontFamily: 'DM Mono', fontSize: 10,
            background: 'var(--green-bg)', color: 'var(--green)',
            border: '1px solid var(--green)', borderRadius: 3, padding: '1px 5px',
          }}>👍 {professor.wouldTakeAgainPct}%</span>
        )}
      </a>
      {showTags && professor.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {professor.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="chip" style={{ fontSize: 10 }}>{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}
