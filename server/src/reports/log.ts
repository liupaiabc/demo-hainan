import { randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const logDirectory = fileURLToPath(new URL('../../logs/', import.meta.url));

export async function openReportLog(): Promise<{
  write: (event: string, details?: Record<string, string | number>) => Promise<void>;
  close: () => Promise<void>;
}> {
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `report-${timestamp}-${randomUUID()}.jsonl`;
  const file: FileHandle = await open(path.join(logDirectory, fileName), 'wx', 0o600);
  return {
    write: async (event, details = {}) => {
      await file.appendFile(`${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`);
    },
    close: () => file.close(),
  };
}
