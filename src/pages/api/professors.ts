import type { NextApiRequest, NextApiResponse } from 'next';
import { readProfessors } from '@/lib/data-server';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const namesParam = req.query.names as string | undefined;
  if (!namesParam) {
    res.status(400).json({ error: 'names is required' });
    return;
  }

  const names = namesParam.split(',').filter(Boolean);
  const allProfs = readProfessors();

  const result: Record<string, unknown> = {};
  for (const name of names) {
    result[name] = allProfs[name] ?? null;
  }

  res.json(result);
}
