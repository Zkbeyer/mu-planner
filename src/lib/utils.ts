export function professorSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

const SEASON_ORDER: Record<string, number> = { Spring: 0, Summer: 1, Fall: 2 };

/** Sortable number for a term like "Fall 2025" (string compare puts every Spring after every Fall). */
export function termValue(term: string): number {
  const [season, year] = term.split(' ');
  return Number(year) * 3 + (SEASON_ORDER[season] ?? 0);
}
