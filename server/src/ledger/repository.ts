import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { LedgerDocumentKey, LedgerFields, LedgerRecord } from '../../../shared/api.js';
import { pool } from '../db/pool.js';

export type LedgerFile = { name: string; blob: Buffer };
export type LedgerFiles = Partial<Record<LedgerDocumentKey, LedgerFile>>;

export const documentTypes = {
  evaluationForm: {
    filenameColumn: 'evaluation_form_filename', blobColumn: 'evaluation_form_blob',
    extensions: ['.xlsx', '.xlsm'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  evaluationReport: {
    filenameColumn: 'evaluation_report_filename', blobColumn: 'evaluation_report_blob',
    extensions: ['.docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  riskTrackingSheet: {
    filenameColumn: 'risk_tracking_sheet_filename', blobColumn: 'risk_tracking_sheet_blob',
    extensions: ['.xlsx'], mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
} as const;

type LedgerRow = RowDataPacket & LedgerRecord;
type FileRow = RowDataPacket & { fileName: string | null; fileBlob: Buffer | null };

const metadataColumns = `id,
  business_name AS businessName, requirement_name AS requirementName,
  description, contact, completion_date AS completionDate,
  risk_level AS riskLevel, risk_count AS riskCount, risk_resolved AS riskResolved,
  evaluation_form_filename AS evaluationFormFileName,
  evaluation_report_filename AS evaluationReportFileName,
  risk_tracking_sheet_filename AS riskTrackingSheetFileName,
  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS createdAt,
  created_by AS createdBy,
  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%sZ') AS updatedAt,
  updated_by AS updatedBy`;

const fieldValues = (fields: LedgerFields) => [
  fields.businessName, fields.requirementName, fields.description, fields.contact,
  fields.completionDate, fields.riskLevel, fields.riskCount, fields.riskResolved,
];

export async function listLedger(): Promise<LedgerRecord[]> {
  const [rows] = await pool.query<LedgerRow[]>(`SELECT ${metadataColumns} FROM assessment_ledger ORDER BY created_at DESC, id DESC`);
  return rows;
}

export async function getLedger(id: number): Promise<LedgerRecord | null> {
  const [rows] = await pool.execute<LedgerRow[]>(`SELECT ${metadataColumns} FROM assessment_ledger WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createLedger(fields: LedgerFields, files: LedgerFiles): Promise<LedgerRecord> {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO assessment_ledger (
      business_name, requirement_name, description, contact, completion_date,
      risk_level, risk_count, risk_resolved,
      evaluation_form_filename, evaluation_form_blob,
      evaluation_report_filename, evaluation_report_blob,
      risk_tracking_sheet_filename, risk_tracking_sheet_blob,
      created_at, created_by, updated_at, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP(), ?)`,
    [...fieldValues(fields),
      files.evaluationForm?.name ?? null, files.evaluationForm?.blob ?? null,
      files.evaluationReport?.name ?? null, files.evaluationReport?.blob ?? null,
      files.riskTrackingSheet?.name ?? null, files.riskTrackingSheet?.blob ?? null,
      'admin', 'admin'],
  );
  const record = await getLedger(result.insertId);
  if (!record) throw new Error('Created ledger record could not be retrieved');
  return record;
}

export async function updateLedger(id: number, fields: LedgerFields, files: LedgerFiles): Promise<LedgerRecord | null> {
  const assignments = [
    'business_name = ?', 'requirement_name = ?', 'description = ?', 'contact = ?',
    'completion_date = ?', 'risk_level = ?', 'risk_count = ?', 'risk_resolved = ?',
  ];
  const values: (string | Buffer | number)[] = fieldValues(fields);
  for (const key of Object.keys(documentTypes) as LedgerDocumentKey[]) {
    const file = files[key];
    if (!file) continue;
    assignments.push(`${documentTypes[key].filenameColumn} = ?`, `${documentTypes[key].blobColumn} = ?`);
    values.push(file.name, file.blob);
  }
  assignments.push('updated_at = UTC_TIMESTAMP()', 'updated_by = ?');
  values.push('admin', id);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE assessment_ledger SET ${assignments.join(', ')} WHERE id = ?`, values,
  );
  return result.affectedRows ? getLedger(id) : null;
}

export async function deleteLedger(id: number): Promise<boolean> {
  const [result] = await pool.execute<ResultSetHeader>('DELETE FROM assessment_ledger WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

export async function getLedgerFile(id: number, key: LedgerDocumentKey): Promise<LedgerFile | null> {
  const { filenameColumn, blobColumn } = documentTypes[key];
  const [rows] = await pool.execute<FileRow[]>(
    `SELECT ${filenameColumn} AS fileName, ${blobColumn} AS fileBlob FROM assessment_ledger WHERE id = ?`, [id],
  );
  const row = rows[0];
  return row?.fileName && row.fileBlob ? { name: row.fileName, blob: row.fileBlob } : null;
}

export async function replaceLedgerFile(id: number, key: LedgerDocumentKey, file: LedgerFile): Promise<LedgerRecord | null> {
  const { filenameColumn, blobColumn } = documentTypes[key];
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE assessment_ledger SET ${filenameColumn} = ?, ${blobColumn} = ?, updated_at = UTC_TIMESTAMP(), updated_by = ? WHERE id = ?`,
    [file.name, file.blob, 'admin', id],
  );
  return result.affectedRows ? getLedger(id) : null;
}
