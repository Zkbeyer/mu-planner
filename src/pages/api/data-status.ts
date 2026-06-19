import type { NextApiRequest, NextApiResponse } from 'next';
import { getDataStatus } from '@/lib/data-server';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const subject   = req.query.subject   as string | undefined;
  const professor = req.query.professor as string | undefined;
  const degreeId  = req.query.degreeId  as string | undefined;
  res.json(getDataStatus(subject, professor, degreeId));
}
