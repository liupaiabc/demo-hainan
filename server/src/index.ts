import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import type { GreetingRequest, GreetingResponse, StatusResponse } from '../../shared/api.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { templateRouter } from './templates/routes.js';
import { ledgerRouter } from './ledger/routes.js';

const app = new Koa();
const router = new Router();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    const status = code === 'LIMIT_FILE_SIZE' ? 413
      : typeof code === 'string' && code.startsWith('LIMIT_') ? 400
      : error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500;
    ctx.status = status;
    ctx.body = { error: code === 'LIMIT_FILE_SIZE' ? '文件不能超过 10 MB'
      : typeof code === 'string' && code.startsWith('LIMIT_') ? '上传字段或文件数量不符合要求'
      : status < 500 && error instanceof Error ? error.message : '服务器内部错误' };
    if (status >= 500) ctx.app.emit('error', error, ctx);
  }
});

app.use(bodyParser());

router.get('/api/status', (ctx) => {
  const response: StatusResponse = { status: 'ok', service: 'koa', time: new Date().toISOString() };
  ctx.body = response;
});

router.post('/api/greet', (ctx) => {
  const body = ctx.request.body as Partial<GreetingRequest> | undefined;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 80) ctx.throw(400, 'Name must be between 1 and 80 characters');

  const response: GreetingResponse = { message: `Hello, ${name}! Your request reached Koa.` };
  ctx.body = response;
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(templateRouter.routes());
app.use(templateRouter.allowedMethods());
app.use(ledgerRouter.routes());
app.use(ledgerRouter.allowedMethods());
app.on('error', (error) => console.error(error));

await pool.query('SELECT 1 FROM template LIMIT 0');
await pool.query('SELECT 1 FROM assessment_ledger LIMIT 0');
const server = app.listen(config.port, () => {
  console.info(`Koa API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
