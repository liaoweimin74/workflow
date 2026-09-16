/**
 * index.ts — backend-node 组合根（8081）
 *
 * 现阶段：/health + /api/auth/*（登录链路全量对齐）
 * 后续模块按 13-4~13-7 逐个挂载（system / form / datasource / page / bizdata / workflow / notification）。
 *
 * 切换设计（摘要契约）：/home/z/tools/backend-engine-node 标记文件存在 →
 * service-supervisor 把 8080 交给本进程（另起端口转发或直接改端口）；监督器每 20s 动态决策。
 */
import express from 'express';
import { config } from './config';
import { errorMiddleware } from './lib/http';
import { authRouter } from './routes/auth';
import { usersRouter } from './routes/users';
import { rolesRouter } from './routes/roles';
import { menusRouter } from './routes/menus';
import { orgsRouter } from './routes/orgs';
import { dictTypesRouter, dictDataRouter } from './routes/dicts';
import { formRouter } from './routes/form';
import { pageRouter } from './routes/page';
import { processCategoryRouter } from './routes/process-category';
import { processDefinitionRouter } from './routes/process-definition';
import { bizdataRouter } from './routes/bizdata';
import { datasourceRouter, internalSystemRouter } from './routes/datasource';
import { processInstanceRouter } from './routes/process-instance';
import { taskRouter } from './routes/task';
import { notificationRouter } from './routes/notification';
import { notificationAdminRouter } from './routes/notification-admin';
import { dashboardRouter } from './routes/dashboard';
import { getDb, one } from './lib/db';

const app = express();

// —— 全局中间件（顺序对齐 Java FilterChain 语义）——
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// —— CORS（v1 时代后端允许跨域；网关同源场景其实用不到，保险保留）——
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Tenant-Id');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// —— 健康检查（start-services.sh / supervisor 探活用）——
app.get('/health', (_req, res) => {
  let db = 'down';
  try {
    const row = one('SELECT COUNT(*) AS C FROM SYS_USER');
    db = row && Number(row['C']) >= 0 ? 'up' : 'down';
  } catch {
    db = 'down';
  }
  res.json({ status: 'ok', engine: 'node', db, time: new Date().toISOString() });
});

// —— 业务路由 ——
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/roles', rolesRouter);
app.use('/api/menus', menusRouter);
app.use('/api/orgs', orgsRouter);
app.use('/api/dict-types', dictTypesRouter);
app.use('/api/dict-data', dictDataRouter);
// form/page 路由自带完整路径（/api/v1/...），直接挂载
app.use(formRouter);
app.use(pageRouter);
app.use(processCategoryRouter);
app.use(processDefinitionRouter);
app.use(bizdataRouter);
app.use(datasourceRouter);
app.use(internalSystemRouter);
app.use(processInstanceRouter);
app.use(taskRouter);
app.use(notificationRouter);
app.use(notificationAdminRouter);
app.use(dashboardRouter);

// —— 未知路径（对齐 Spring "No static resource" 行为：HTTP 500 + R 信封；首参无前导斜杠）——
app.use((req, res) => {
  res.status(500).json({ code: 500, msg: `No static resource ${req.path.replace(/^\//, '')} for request '${req.path}'.`, data: null });
});

// —— 全局错误处理 ——
app.use(errorMiddleware);

app.listen(config.port, () => {
  console.log(`[backend-node] listening on :${config.port} (env=${config.env}, db=${config.dbPath})`);
});
