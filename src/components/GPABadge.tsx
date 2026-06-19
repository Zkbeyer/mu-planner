interface GPABadgeProps {
  gpa: number | null;
  size?: 'sm' | 'md';
}

function gpaCls(gpa: number) {
  if (gpa >= 3.5) return 'badge-green';
  if (gpa >= 2.5) return 'badge-yellow';
  return 'badge-red';
}

export default function GPABadge({ gpa, size = 'md' }: GPABadgeProps) {
  if (gpa === null) {
    return <span className={`badge badge-gray ${size === 'sm' ? 'text-[10px]' : ''}`}>N/A</span>;
  }
  return (
    <span className={`badge ${gpaCls(gpa)} ${size === 'sm' ? 'text-[10px] px-1.5' : ''}`}>
      {gpa.toFixed(2)}
    </span>
  );
}
