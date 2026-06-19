import type { NextApiRequest, NextApiResponse } from 'next';
import Fuse from 'fuse.js';
import { readCourses, readGradeDist } from '@/lib/data-server';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CourseHit {
  type: 'course';
  id: string;
  code: string;  // "CMP_SC 1050"
  title: string;
}

export interface ProfessorHit {
  type: 'professor';
  name: string;
  slug: string;
}

export interface SearchResponse {
  courses: CourseHit[];
  professors: ProfessorHit[];
}

// ── Index records ─────────────────────────────────────────────────────────────

interface CourseRecord {
  id: string;
  code: string;        // "CMP_SC 1050"
  codeNorm: string;    // "CMPSC 1050" (underscores stripped)
  codeCompact: string; // "cmpsc1050"  (spaces + underscores stripped)
  subject: string;     // "CMP_SC"
  subjectTail: string; // "SC"         (last segment after _)
  number: string;      // "1050"
  title: string;
}

interface ProfRecord {
  name: string;
  slug: string;
  firstName: string;
  lastName: string;
}

// ── Module-level cache (built once per server process) ────────────────────────

let courseFuse: Fuse<CourseRecord> | null = null;
let profFuse: Fuse<ProfRecord> | null = null;

function profSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function ensureIndexes() {
  if (courseFuse && profFuse) return;

  const courses = readCourses();
  const courseRecords: CourseRecord[] = courses.map(c => {
    const subjectTail = c.subject.includes('_')
      ? c.subject.split('_').pop()!
      : c.subject;
    return {
      id: c.id,
      code: `${c.subject} ${c.number}`,
      codeNorm: `${c.subject.replace(/_/g, '')} ${c.number}`,
      codeCompact: `${c.subject.replace(/_/g, '')}${c.number}`.toLowerCase(),
      subject: c.subject,
      subjectTail,
      number: c.number,
      title: c.title,
    };
  });

  courseFuse = new Fuse(courseRecords, {
    keys: [
      { name: 'number',      weight: 0.5 },
      { name: 'codeNorm',    weight: 0.35 },
      { name: 'code',        weight: 0.3 },
      { name: 'codeCompact', weight: 0.25 },
      { name: 'title',       weight: 0.6 },
      { name: 'subjectTail', weight: 0.15 },
    ],
    threshold: 0.42,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  const gradeDist = readGradeDist();
  const profNames = [...new Set(gradeDist.map(r => r.professor))]
    .filter(n => n && n !== 'Unknown');

  const profRecords: ProfRecord[] = profNames.map(name => {
    const parts = name.trim().split(/\s+/);
    return {
      name,
      slug: profSlug(name),
      firstName: parts[0] ?? '',
      lastName:  parts[parts.length - 1] ?? '',
    };
  });

  profFuse = new Fuse(profRecords, {
    keys: [
      { name: 'lastName',  weight: 0.6 },
      { name: 'firstName', weight: 0.3 },
      { name: 'name',      weight: 0.5 },
    ],
    threshold: 0.42,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default function handler(req: NextApiRequest, res: NextApiResponse<SearchResponse>) {
  const q = ((req.query.q as string) ?? '').trim();
  if (!q || q.length < 2) {
    res.json({ courses: [], professors: [] });
    return;
  }

  ensureIndexes();

  // Course search — also do a direct number-match boost for queries that look like course codes
  const numberMatch = q.match(/\b(\d{3,4}[A-Z]?)\b/i);
  const numberQuery = numberMatch?.[1];

  const fuseCoursResults = courseFuse!.search(q, { limit: 8 });

  // Build course hits, boosting exact number matches to the top
  const seen = new Set<string>();
  const courses: CourseHit[] = [];

  // First: exact number matches (if the query contains a course number)
  if (numberQuery) {
    const nl = numberQuery.toLowerCase();
    for (const r of fuseCoursResults) {
      if (r.item.number.toLowerCase() === nl && !seen.has(r.item.id)) {
        seen.add(r.item.id);
        courses.push({ type: 'course', id: r.item.id, code: r.item.code, title: r.item.title });
      }
    }
  }

  // Then: remaining fuzzy results
  for (const r of fuseCoursResults) {
    if (!seen.has(r.item.id)) {
      seen.add(r.item.id);
      courses.push({ type: 'course', id: r.item.id, code: r.item.code, title: r.item.title });
    }
    if (courses.length >= 6) break;
  }

  // Professor search
  const fuseProfs = profFuse!.search(q, { limit: 4 });
  const professors: ProfessorHit[] = fuseProfs.map(r => ({
    type: 'professor',
    name: r.item.name,
    slug: r.item.slug,
  }));

  res.setHeader('Cache-Control', 'no-store');
  res.json({ courses, professors });
}
