import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db/pool.js';
import type { TemplateRecord } from '../../../shared/api.js';

type TemplateRow = RowDataPacket & TemplateRecord;
type FileRow = RowDataPacket & { name: string; version: string; fileBlob: Buffer };

const metadataColumns = `id, name, version,
  DATE_FORMAT(uploaded_at, '%Y-%m-%dT%H:%i:%sZ') AS uploadedAt,
  uploaded_by AS uploadedBy,
  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt,
  updated_by AS updatedBy`;

export async function listTemplates(): Promise<TemplateRecord[]> {
  const [rows] = await pool.query<TemplateRow[]>(`SELECT ${metadataColumns} FROM template ORDER BY uploaded_at DESC, id DESC`);
  return rows;
}

export async function getTemplate(id: number): Promise<TemplateRecord | null> {
  const [rows] = await pool.execute<TemplateRow[]>(`SELECT ${metadataColumns} FROM template WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function getTemplateFile(id: number): Promise<FileRow | null> {
  const [rows] = await pool.execute<FileRow[]>(
    'SELECT name, version, file_blob AS fileBlob FROM template WHERE id = ?', [id],
  );
  return rows[0] ?? null;
}

export async function createTemplate(name: string, version: string, file: Buffer): Promise<TemplateRecord> {
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO template (name, version, file_blob, uploaded_at, uploaded_by, updated_at, updated_by) VALUES (?, ?, ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP(), ?)',
    [name, version, file, 'admin', 'admin'],
  );
  const record = await getTemplate(result.insertId);
  if (!record) throw new Error('Created template could not be retrieved');
  return record;
}

export async function updateTemplate(id: number, name: string, version: string, file?: Buffer): Promise<TemplateRecord | null> {
  const sql = file
    ? 'UPDATE template SET name = ?, version = ?, file_blob = ?, updated_at = UTC_TIMESTAMP(), updated_by = ? WHERE id = ?'
    : 'UPDATE template SET name = ?, version = ?, updated_at = UTC_TIMESTAMP(), updated_by = ? WHERE id = ?';
  const values = file ? [name, version, file, 'admin', id] : [name, version, 'admin', id];
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  if (result.affectedRows === 0) return null;
  return getTemplate(id);
}

export async function deleteTemplate(id: number): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>('DELETE FROM template WHERE id = ?', [id]);
  return result.affectedRows > 0;
}
