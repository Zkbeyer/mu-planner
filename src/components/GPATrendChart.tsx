import type { GradeRecord } from '@/types';

interface GPATrendChartProps {
  records: GradeRecord[];
}

const TERM_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };

function sortTerms(a: string, b: string): number {
  const [sA, yA] = a.split(' ');
  const [sB, yB] = b.split(' ');
  if (yA !== yB) return Number(yA) - Number(yB);
  return (TERM_ORDER[sA] ?? 0) - (TERM_ORDER[sB] ?? 0);
}

export default function GPATrendChart({ records }: GPATrendChartProps) {
  const byTerm: Record<string, number[]> = {};
  records.forEach((r) => {
    if (!byTerm[r.term]) byTerm[r.term] = [];
    byTerm[r.term].push(r.avgGPA);
  });

  const data = Object.entries(byTerm)
    .sort(([a], [b]) => sortTerms(a, b))
    .map(([term, gpas]) => ({
      term,
      gpa: Math.round((gpas.reduce((s, g) => s + g, 0) / gpas.length) * 100) / 100,
    }));

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 font-sans text-sm" style={{ color: 'var(--g400)' }}>
        Not enough data to display trend
      </div>
    );
  }

  const W = 400, H = 110, PX = 40, PY = 14;
  const MIN = 2.0, MAX = 4.0;
  const xPos = (i: number) => PX + (i / (data.length - 1)) * (W - PX * 2);
  const yPos = (v: number) => H - PY - ((v - MIN) / (MAX - MIN)) * (H - PY * 2);

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i)},${yPos(d.gpa)}`).join(' ');
  const areaPath = `${linePath} L${xPos(data.length - 1)},${H - PY} L${xPos(0)},${H - PY} Z`;

  const latestGpa = data[data.length - 1]?.gpa;
  const prevGpa = data[data.length - 2]?.gpa;
  const delta = latestGpa !== undefined && prevGpa !== undefined ? latestGpa - prevGpa : null;

  return (
    <div>
      {delta !== null && (
        <div className="flex items-baseline gap-3 mb-3">
          <span className="font-mono font-medium text-2xl" style={{ color: latestGpa! >= 3.5 ? 'var(--green)' : latestGpa! >= 2.5 ? 'var(--yellow)' : 'var(--red)' }}>
            {latestGpa!.toFixed(2)}
          </span>
          <span className="font-sans text-xs" style={{ color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(2)} vs prior term
          </span>
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {[2.5, 3.0, 3.5, 4.0].map((v) => (
          <line key={v} x1={PX} x2={W - PX} y1={yPos(v)} y2={yPos(v)} stroke="var(--g100)" strokeWidth={1} />
        ))}
        {[2.5, 3.0, 3.5, 4.0].map((v) => (
          <text key={v} x={PX - 4} y={yPos(v) + 4} textAnchor="end" fontSize={8} fill="var(--g400)" fontFamily="DM Mono">
            {v.toFixed(1)}
          </text>
        ))}
        <path d={areaPath} fill="rgba(241,184,45,0.12)" />
        <path d={linePath} fill="none" stroke="var(--gold)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <g key={i}>
            <circle cx={xPos(i)} cy={yPos(d.gpa)} r={5} fill="var(--gold)" stroke="var(--black)" strokeWidth={2} />
          </g>
        ))}
        {data.filter((_, i) => i % 2 === 0 || i === data.length - 1).map((d) => {
          const origIdx = data.indexOf(d);
          return (
            <text key={d.term} x={xPos(origIdx)} y={H - 1} textAnchor="middle" fontSize={8} fill="var(--g400)" fontFamily="Space Grotesk">
              {d.term}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
