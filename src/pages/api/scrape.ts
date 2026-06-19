import type { NextApiRequest, NextApiResponse } from 'next';
import { spawn } from 'child_process';
import path from 'path';

export const config = {
  api: { responseLimit: false, externalResolver: true },
};

const VALID_TARGETS = new Set(['catalog', 'grades', 'degrees', 'rmp', 'subjects']);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const target = req.query.target as string;

  if (!VALID_TARGETS.has(target)) {
    res.status(400).json({ error: `Unknown scraper: ${target}` });
    return;
  }

  const scriptPath = path.join(process.cwd(), 'scraper', 'run_scraper.py');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ log: `[scraper] Starting ${target}…` });

  const subject    = req.query.subject    as string | undefined;
  const professor  = req.query.professor  as string | undefined;
  const degreeId   = req.query.degreeId   as string | undefined;
  const stubsOnly  = req.query.stubsOnly === 'true';
  const args = [
    scriptPath, target,
    ...(subject   ? ['--subject',    subject]   : []),
    ...(professor ? ['--professor',  professor] : []),
    ...(degreeId  ? ['--degree-id',  degreeId]  : []),
    ...(stubsOnly ? ['--stubs-only']            : []),
  ];
  const proc = spawn('python3', args, { cwd: process.cwd() });

  proc.stdout.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      if (line.startsWith('__DEGREE__:')) {
        try {
          const degree = JSON.parse(line.slice(11));
          send({ log: `Scraped: ${(degree as { name: string }).name}`, degree });
        } catch {
          send({ log: line });
        }
      } else {
        send({ log: line });
      }
    }
  });

  proc.stderr.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      send({ log: line });
    }
  });

  proc.on('close', (code) => {
    send({ done: true, success: code === 0, code });
    res.end();
  });

  proc.on('error', (err) => {
    send({ log: `[error] ${err.message}`, done: true, success: false });
    res.end();
  });

  req.on('close', () => {
    if (!proc.killed) proc.kill();
  });
}
