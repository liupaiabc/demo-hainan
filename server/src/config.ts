import 'dotenv/config';

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

export const config = {
  port: integerEnv('PORT', 3001),
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: integerEnv('DB_PORT', 3307),
    user: process.env.DB_USER ?? 'root',
    password: requiredEnv('DB_PASSWORD'),
    name: process.env.DB_NAME ?? 'demo',
  },
} as const;

if (!/^[a-zA-Z0-9_]+$/.test(config.database.name)) {
  throw new Error('DB_NAME may contain only letters, numbers, and underscores');
}
