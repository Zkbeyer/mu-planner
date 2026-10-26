interface OlderCoursesToggleProps {
  count: number;
  open: boolean;
  onToggle: () => void;
}

/** Divider + button that reveals courses with no grade data in the last few years. */
export default function OlderCoursesToggle({ count, open, onToggle }: OlderCoursesToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '26px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--g200)' }} />
      <button onClick={onToggle} className="btn btn-outline btn-sm" style={{ flexShrink: 0 }}>
        {open ? 'Hide' : 'Show'} {count} older course{count !== 1 ? 's' : ''} {open ? '▴' : '▾'}
      </button>
      <div style={{ flex: 1, height: 1, background: 'var(--g200)' }} />
    </div>
  );
}

export const OLDER_COURSES_NOTE =
  'No grade data in the last 3 years — may not be offered anymore, or only rarely (topics, research, thesis).';
