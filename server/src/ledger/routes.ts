import Router from '@koa/router';
import multer from '@koa/multer';
import type { LedgerDocumentKey, LedgerFields } from '../../../shared/api.js';
import {
  createLedger, deleteLedger, documentTypes, getLedger, getLedgerFile, listLedger,
  replaceLedgerFile, updateLedger,
} from './repository.js';
import type { LedgerFile, LedgerFiles } from './repository.js';

export const ledgerRouter = new Router({ prefix: '/api/ledger' });
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 3, fields: 8 },
});
const recordUpload = upload.fields([
  { name: 'evaluationForm', maxCount: 1 },
  { name: 'evaluationReport', maxCount: 1 },
  { name: 'riskTrackingSheet', maxCount: 1 },
]);

type UploadedFile = { originalname: string; size: number; buffer: Buffer };

function badRequest(message: string): never {
  const error = new Error(message) as Error & { status: number };
  error.status = 400;
  throw error;
}

function ledgerId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id < 1 || id > 4294967295) badRequest('无效的台账 ID');
  return id;
}

function documentKey(raw: string | undefined): LedgerDocumentKey {
  if (!raw || !Object.hasOwn(documentTypes, raw)) badRequest('无效的附件类型');
  return raw as LedgerDocumentKey;
}

function formFields(body: unknown): LedgerFields {
  const input = body as Record<string, unknown> | undefined;
  const limits: Record<keyof LedgerFields, number> = {
    businessName: 100, requirementName: 100, description: 500, contact: 50,
    completionDate: 10, riskLevel: 20, riskCount: 20, riskResolved: 20,
  };
  const fields = {} as LedgerFields;
  for (const key of Object.keys(limits) as (keyof LedgerFields)[]) {
    const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
    if (!value || value.length > limits[key]) badRequest(`${key} 长度须为 1 到 ${limits[key]} 个字符`);
    fields[key] = value;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.completionDate)) badRequest('评估完成日期格式须为 YYYY-MM-DD');
  if (!['高', '中', '低'].includes(fields.riskLevel)) badRequest('无效的风险等级');
  if (!['是', '否', '无风险项'].includes(fields.riskResolved)) badRequest('无效的风险处置状态');
  return fields;
}

function checkedFile(file: UploadedFile | undefined, key: LedgerDocumentKey, required: boolean): LedgerFile | undefined {
  if (!file) {
    if (required) badRequest(`请选择 ${documentTypes[key].extension} 文件`);
    return undefined;
  }
  const extension = documentTypes[key].extension;
  const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf8');
  const name = decodedName.includes('\uFFFD') ? file.originalname : decodedName;
  if (!name.toLowerCase().endsWith(extension) || file.size === 0 || name.length > 255) {
    badRequest(`附件仅支持非空的 ${extension} 文件，文件名不能超过 255 个字符`);
  }
  return { name, blob: file.buffer };
}

function recordFiles(raw: unknown): LedgerFiles {
  const uploaded = raw as Record<LedgerDocumentKey, UploadedFile[] | undefined> | undefined;
  return {
    evaluationForm: checkedFile(uploaded?.evaluationForm?.[0], 'evaluationForm', false),
    evaluationReport: checkedFile(uploaded?.evaluationReport?.[0], 'evaluationReport', false),
    riskTrackingSheet: checkedFile(uploaded?.riskTrackingSheet?.[0], 'riskTrackingSheet', false),
  };
}

ledgerRouter.get('/', async (ctx) => {
  ctx.body = await listLedger();
});

ledgerRouter.get('/:id', async (ctx) => {
  const record = await getLedger(ledgerId(ctx.params.id));
  if (!record) ctx.throw(404, '台账记录不存在');
  ctx.body = record;
});

ledgerRouter.post('/', recordUpload, async (ctx) => {
  const record = await createLedger(formFields(ctx.request.body), recordFiles(ctx.files));
  ctx.status = 201;
  ctx.set('Location', `/api/ledger/${record.id}`);
  ctx.body = record;
});

ledgerRouter.put('/:id', recordUpload, async (ctx) => {
  const record = await updateLedger(ledgerId(ctx.params.id), formFields(ctx.request.body), recordFiles(ctx.files));
  if (!record) ctx.throw(404, '台账记录不存在');
  ctx.body = record;
});

ledgerRouter.delete('/:id', async (ctx) => {
  if (!await deleteLedger(ledgerId(ctx.params.id))) ctx.throw(404, '台账记录不存在');
  ctx.status = 204;
});

ledgerRouter.get('/:id/files/:key/download', async (ctx) => {
  const id = ledgerId(ctx.params.id);
  const key = documentKey(ctx.params.key);
  const file = await getLedgerFile(id, key);
  if (!file) {
    ctx.throw(404, '附件不存在');
    return;
  }
  ctx.set('Content-Disposition', `attachment; filename="ledger-${id}-${key}${documentTypes[key].extension}"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  ctx.set('Content-Length', String(file.blob.length));
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.type = documentTypes[key].mime;
  ctx.body = file.blob;
});

ledgerRouter.put('/:id/files/:key', upload.single('file'), async (ctx) => {
  const id = ledgerId(ctx.params.id);
  const key = documentKey(ctx.params.key);
  const file = checkedFile(ctx.file, key, true);
  const record = await replaceLedgerFile(id, key, file!);
  if (!record) ctx.throw(404, '台账记录不存在');
  ctx.body = record;
});
