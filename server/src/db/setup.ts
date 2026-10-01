import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { config } from '../config.js';

async function setupDatabase() {
  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    multipleStatements: true,
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${config.database.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await connection.query(`USE \`${config.database.name}\``);
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const migrationDir = resolve(process.cwd(), 'db/migrations');
    const files = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const filename of files) {
      const [existing] = await connection.execute<RowDataPacket[]>(
        'SELECT filename FROM schema_migrations WHERE filename = ?', [filename],
      );
      if (existing.length) {
        console.info(`Skipped ${filename} (already applied)`);
        continue;
      }
      const sql = await readFile(resolve(migrationDir, filename), 'utf8');
      await connection.query(sql);
      await connection.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
      console.info(`Applied ${filename}`);
    }
    console.info(`Database ${config.database.name} is ready`);
  } finally {
    await connection.end();
  }
}

setupDatabase().catch((error: unknown) => {
  console.error('Database setup failed:', error);
  process.exitCode = 1;
});
