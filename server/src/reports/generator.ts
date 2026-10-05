import JSZip from 'jszip';
import XLSX from 'xlsx';

export type ReportAiConfig = {
  tabName: string;
  targetColumn: string;
  targetColumnValue: string;
  reference: string;
  condition: '===' | '!==' | '==' | '!=' | 'includes' | 'notIncludes';
  replacePoint: string;
  deepseekPrompt: string;
};

type CellMap = Record<string, string>;
type WorkbookData = { sheetNames: string[]; sheets: Record<string, CellMap> };
type TextReplacement = { marker: string; value: string };
type ReportData = { xlsx: WorkbookData; textReplacements?: TextReplacement[] };
type LogStep = (event: string, details?: Record<string, string | number>) => Promise<void>;

export class ReportGenerationError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function readWorkbook(file: Buffer): WorkbookData {
  if (file.length < 4 || file[0] !== 0x50 || file[1] !== 0x4b) {
    throw new ReportGenerationError('评估表不是有效的 .xlsx 或 .xlsm 文件', 400);
  }
  try {
    const workbook = XLSX.read(file, { type: 'buffer', cellDates: true });
    if (workbook.SheetNames.length === 0) throw new Error('No worksheets');
    const sheets: WorkbookData['sheets'] = {};
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const cells: CellMap = {};
      for (const address of Object.keys(worksheet)) {
        if (address.startsWith('!')) continue;
        const cell = worksheet[address];
        if (cell) cells[address.toUpperCase()] = XLSX.utils.format_cell(cell).trim();
      }
      sheets[sheetName] = cells;
    }
    return { sheetNames: workbook.SheetNames, sheets };
  } catch {
    throw new ReportGenerationError('评估表不是有效的 .xlsx 或 .xlsm 文件', 400);
  }
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeXmlTextWithLineBreaks(value: string): string {
  return value.split(/\r\n|\n|\r/).map(escapeXml).join('</w:t><w:br/><w:t>');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCellValue(data: ReportData, sheetName: string, address: string): string | null {
  return data.xlsx.sheets[sheetName]?.[address.toUpperCase()] ?? null;
}

function replaceMarkers(xml: string, data: ReportData): { text: string; count: number } {
  let count = 0;
  let text = xml;
  const patterns = [
    /\{?```([^`{}]+)\/([A-Za-z]+[0-9]+)```\}?/g,
    /\{([^{}]+)\/([A-Za-z]+[0-9]+)\}/g,
  ];
  for (const pattern of patterns) {
    text = text.replace(pattern, (marker, sheetName: string, address: string) => {
      const value = getCellValue(data, sheetName, address);
      if (value === null) return marker;
      count += 1;
      return escapeXmlTextWithLineBreaks(value);
    });
  }
  for (const replacement of data.textReplacements ?? []) {
    if (!replacement.marker || !replacement.value.trim()) continue;
    const escaped = escapeXmlTextWithLineBreaks(replacement.value);
    text = text.replace(new RegExp(escapeRegExp(replacement.marker), 'g'), () => {
      count += 1;
      return escaped;
    });
  }
  return { text, count };
}

function compareValues(left: string, condition: ReportAiConfig['condition'], right: string): boolean {
  switch (condition) {
    case '===':
    case '==': return left === right;
    case '!==':
    case '!=': return left !== right;
    case 'includes': return left.includes(right);
    case 'notIncludes': return !left.includes(right);
  }
}

function promptRows(data: ReportData, config: ReportAiConfig) {
  const sheet = data.xlsx.sheets[config.tabName];
  if (!sheet) return [];
  const targetColumn = config.targetColumn.toUpperCase();
  const referenceColumn = config.reference.toUpperCase();
  const rows: { rowNumber: number; referenceValue: string }[] = [];
  for (const [address, targetValue] of Object.entries(sheet)) {
    const match = address.match(/^([A-Z]+)([0-9]+)$/);
    if (!match || match[1] !== targetColumn) continue;
    const referenceValue = sheet[`${referenceColumn}${match[2]}`];
    if (targetValue.trim() && referenceValue?.trim() &&
      compareValues(targetValue, config.condition, config.targetColumnValue)) {
      rows.push({ rowNumber: Number(match[2]), referenceValue });
    }
  }
  return rows.sort((left, right) => left.rowNumber - right.rowNumber);
}

export async function generateReportDocx(
  template: Buffer,
  evaluationForm: Buffer,
  aiConfig: ReportAiConfig | null,
  askDeepSeek: (prompt: string) => Promise<string>,
  log: LogStep,
): Promise<Buffer> {
  const data: ReportData = { xlsx: readWorkbook(evaluationForm) };
  await log('workbook_read', { sheetCount: data.xlsx.sheetNames.length });

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(template);
    if (!zip.file('word/document.xml')) throw new Error('Missing document.xml');
  } catch {
    throw new ReportGenerationError('所选模板不是有效的 .docx 文件', 400);
  }

  if (aiConfig) {
    const rows = promptRows(data, aiConfig);
    await log('ai_rows_selected', { count: rows.length });
    const replacementTexts: string[] = [];
    for (const row of rows) {
      await log('ai_request_started', { rowNumber: row.rowNumber });
      const answer = (await askDeepSeek(`${aiConfig.deepseekPrompt}\n${row.referenceValue}`)).trim();
      if (!answer) throw new ReportGenerationError('DeepSeek 返回了空结果', 502);
      replacementTexts.push(`${row.referenceValue}\n有风险\n${answer}`);
      await log('ai_request_completed', { rowNumber: row.rowNumber });
    }
    if (replacementTexts.length) {
      data.textReplacements = [{
        marker: aiConfig.replacePoint,
        value: `${replacementTexts.join('\n\n')}\n\n`,
      }];
    }
  }

  let replacementCount = 0;
  const wordXmlFiles = Object.keys(zip.files).filter((name) => name.startsWith('word/') && name.endsWith('.xml'));
  for (const fileName of wordXmlFiles) {
    const file = zip.file(fileName);
    if (!file) continue;
    const xml = await file.async('string');
    const replaced = replaceMarkers(xml, data);
    if (replaced.count > 0) {
      zip.file(fileName, replaced.text);
      replacementCount += replaced.count;
    }
  }
  await log('markers_replaced', { count: replacementCount, xmlFileCount: wordXmlFiles.length });
  const output = await zip.generateAsync({ type: 'nodebuffer' });
  if (output.length > 10 * 1024 * 1024) {
    throw new ReportGenerationError('生成的报告超过 10 MB，无法发布到评估台账', 413);
  }
  await log('document_generated', { bytes: output.length });
  return output;
}
