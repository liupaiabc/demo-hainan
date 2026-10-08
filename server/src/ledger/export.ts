import * as XLSX from 'xlsx';
import type { LedgerRecord } from '../../../shared/api.js';

const headers = [
  '业务名称', '需求名称', '需求描述', '对接人', '评估完成日期',
  '风险等级', '风险项个数', '风险是否处置完成',
  '评估表', '评估报告', '风险跟踪表',
];

function excelDate(value: string): Date | string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : date;
}

function excelCount(value: string): number | string {
  const count = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(count) ? count : value;
}

export function buildLedgerExport(records: LedgerRecord[]): Buffer {
  const rows = [headers, ...records.map((record) => [
    record.businessName, record.requirementName, record.description, record.contact,
    excelDate(record.completionDate), record.riskLevel, excelCount(record.riskCount), record.riskResolved,
    record.evaluationFormFileName ?? '', record.evaluationReportFileName ?? '', record.riskTrackingSheetFileName ?? '',
  ])];
  const sheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'yyyy-mm-dd', UTC: true });
  sheet['!cols'] = [18, 24, 50, 14, 18, 12, 14, 22, 32, 32, 32].map((wch) => ({ wch }));
  sheet['!autofilter'] = { ref: sheet['!ref'] ?? 'A1:K1' };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '评估台账');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
