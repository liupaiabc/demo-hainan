import Router from '@koa/router';
import { getDashboard } from './repository.js';

export const dashboardRouter = new Router({ prefix: '/api/dashboard' });

dashboardRouter.get('/', async (ctx) => {
  ctx.body = await getDashboard();
});
