import Router from '@koa/router';
import multer from '@koa/multer';
import type { TemplateRecord } from '../../../shared/api.js';
import { createTemplate, deleteTemplate, getTemplate, getTemplateFile, listTemplates, updateTemplate } from './repository.js';

export const templateRouter = new Router({ prefix: '/api/templates' });
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 2 },
});

function templateId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !Number.isSafeInteger(id) || id < 1 || id > 4294967295) {
    const error = new Error('无效的模板 ID') as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return id;
}

function formFields(body: unknown): { name: string; version: string } {
  const fields = body as Record<string, unknown> | undefined;
  const name = typeof fields?.name === 'string' ? fields.name.trim() : '';
  const version = typeof fields?.version === 'string' ? fields.version.trim() : '';
  if (!name || name.length > 100) {
    const error = new Error('模板名称长度须为 1 到 100 个字符') as Error & { status: number };
    error.status = 400;
    throw error;
  }
  if (!version || version.length > 30) {
    const error = new Error('版本号长度须为 1 到 30 个字符') as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return { name, version };
}

function uploadedFile(file: { originalname: string; size: number; buffer: Buffer } | undefined, required: true): Buffer;
function uploadedFile(file: { originalname: string; size: number; buffer: Buffer } | undefined, required: false): Buffer | undefined;
function uploadedFile(file: { originalname: string; size: number; buffer: Buffer } | undefined, required: boolean): Buffer | undefined {
  if (!file) {
    if (required) {
      const error = new Error('请选择 .docx 文件') as Error & { status: number };
      error.status = 400;
      throw error;
    }
    return undefined;
  }
  if (!file.originalname.toLowerCase().endsWith('.docx') || file.size === 0) {
    const error = new Error('仅支持非空的 .docx 文件') as Error & { status: number };
    error.status = 400;
    throw error;
  }
  return file.buffer;
}

templateRouter.get('/', async (ctx) => {
  ctx.body = await listTemplates();
});

templateRouter.get('/:id', async (ctx) => {
  const record = await getTemplate(templateId(ctx.params.id));
  if (!record) ctx.throw(404, '模板不存在');
  ctx.body = record;
});

templateRouter.post('/', upload.single('file'), async (ctx) => {
  const { name, version } = formFields(ctx.request.body);
  const file = uploadedFile(ctx.file, true);
  const record: TemplateRecord = await createTemplate(name, version, file);
  ctx.status = 201;
  ctx.set('Location', `/api/templates/${record.id}`);
  ctx.body = record;
});

templateRouter.put('/:id', upload.single('file'), async (ctx) => {
  const id = templateId(ctx.params.id);
  const { name, version } = formFields(ctx.request.body);
  const file = uploadedFile(ctx.file, false);
  const record = await updateTemplate(id, name, version, file);
  if (!record) ctx.throw(404, '模板不存在');
  ctx.body = record;
});

templateRouter.get('/:id/download', async (ctx) => {
  const id = templateId(ctx.params.id);
  const record = await getTemplateFile(id);
  if (!record) {
    ctx.throw(404, '模板不存在');
    return;
  }
  const filename = `${record.name}-${record.version}.docx`;
  ctx.set('Content-Disposition', `attachment; filename="template-${id}.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  ctx.set('Content-Length', String(record.fileBlob.length));
  ctx.set('X-Content-Type-Options', 'nosniff');
  ctx.type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  ctx.body = record.fileBlob;
});

templateRouter.delete('/:id', async (ctx) => {
  const deleted = await deleteTemplate(templateId(ctx.params.id));
  if (!deleted) ctx.throw(404, '模板不存在');
  ctx.status = 204;
});
