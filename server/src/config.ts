import 'dotenv/config';
import type { ReportAiConfig } from './reports/generator.js';

function integerEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return value;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function reportAiConfig(): ReportAiConfig | null {
  const names = [
    'REPORT_AI_TAB_NAME', 'REPORT_AI_TARGET_COLUMN', 'REPORT_AI_TARGET_COLUMN_VALUE',
    'REPORT_AI_REFERENCE_COLUMN', 'REPORT_AI_CONDITION', 'REPORT_AI_REPLACE_POINT', 'REPORT_AI_PROMPT',
  ] as const;
  if (names.every((name) => !process.env[name])) return null;
  for (const name of names) requiredEnv(name);
  const condition = process.env.REPORT_AI_CONDITION;
  if (!['===', '!==', '==', '!=', 'includes', 'notIncludes'].includes(condition!)) {
    throw new Error('Invalid REPORT_AI_CONDITION');
  }
  if (!/^[A-Za-z]+$/.test(process.env.REPORT_AI_TARGET_COLUMN!) ||
      !/^[A-Za-z]+$/.test(process.env.REPORT_AI_REFERENCE_COLUMN!)) {
    throw new Error('REPORT_AI column names must contain only letters');
  }
  return {
    tabName: process.env.REPORT_AI_TAB_NAME!,
    targetColumn: process.env.REPORT_AI_TARGET_COLUMN!,
    targetColumnValue: process.env.REPORT_AI_TARGET_COLUMN_VALUE!,
    reference: process.env.REPORT_AI_REFERENCE_COLUMN!,
    condition: condition as ReportAiConfig['condition'],
    replacePoint: process.env.REPORT_AI_REPLACE_POINT!,
    deepseekPrompt: process.env.REPORT_AI_PROMPT!,
  };
}

function timeoutEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1000 || value > 600000) {
    throw new Error(`${name} must be between 1000 and 600000 milliseconds`);
  }
  return value;
}

export const config = {
  port: integerEnv('PORT', 3001),
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: integerEnv('DB_PORT', 3307),
    user: process.env.DB_USER ?? 'root',
    password: requiredEnv('DB_PASSWORD'),
    name: process.env.DB_NAME ?? 'demo',
  },
  reportAi: reportAiConfig(),
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-pro',
    timeoutMs: timeoutEnv('DEEPSEEK_TIMEOUT_MS', 120000),
  },
} as const;

if (!/^[a-zA-Z0-9_]+$/.test(config.database.name)) {
  throw new Error('DB_NAME may contain only letters, numbers, and underscores');
}
