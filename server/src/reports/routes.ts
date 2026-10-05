import Router from '@koa/router';
import multer from '@koa/multer';
import { config } from '../config.js';
import { getTemplateFile } from '../templates/repository.js';
import { askDeepSeek } from './deepseek.js';
import { generateReportDocx } from './generator.js';
import { openReportLog } from './log.js';

export const reportRouter = new Router({ prefix: '/api/reports' });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 },
});

reportRouter.post('/generate', upload.single('evaluationForm'), async (ctx) => {
  const log = await openReportLog();
  try {
    const rawId = (ctx.request.body as Record<string, unknown> | undefined)?.templateId;
    const templateId = typeof rawId === 'string' ? Number(rawId) : NaN;
    if (!Number.isSafeInteger(templateId) || templateId < 1 || templateId > 4294967295) {
      ctx.throw(400, '请选择报告模板');
    }

    const file = ctx.file;
    if (!file || !/\.(xlsx|xlsm)$/i.test(file.originalname) || file.size === 0) {
      ctx.throw(400, '请上传非空的 .xlsx 或 .xlsm 评估表');
    }
    await log.write('generation_started', { templateId, evaluationFormBytes: file.size });

    const template = await getTemplateFile(templateId);
    if (!template) {
      ctx.throw(404, '报告模板不存在');
      return;
    }

    const output = await generateReportDocx(
      template.fileBlob, file.buffer, config.reportAi, askDeepSeek, log.write,
    );
    await log.write('generation_completed', { outputBytes: output.length });
    ctx.set('Content-Disposition', `attachment; filename="report-${templateId}.docx"; filename*=UTF-8''${encodeURIComponent(`${template.name}-${template.version}.docx`)}`);
    ctx.set('Content-Length', String(output.length));
    ctx.set('X-Content-Type-Options', 'nosniff');
    ctx.set('Cache-Control', 'no-store');
    ctx.type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    ctx.body = output;
  } catch (error) {
    await log.write('generation_failed', { reason: error instanceof Error ? error.message : 'Unknown error' }).catch(() => {});
    throw error;
  } finally {
    await log.close();
  }
});
