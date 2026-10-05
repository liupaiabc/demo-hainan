# PIA 评估平台

这是一个 npm workspace 项目：`client/` 使用 React、Vite 和 Ant Design，`server/` 使用 Koa，报告模板和评估台账数据保存在 MySQL。

## 环境要求

- Node.js 20.19+ 或 22.12+
- Docker Desktop（含 Docker Compose）
- npm

## 首次启动

在项目根目录执行：

```bash
npm install
cp server/.env.example server/.env
npm run db:up
npm run db:setup
npm run dev
```

打开 <http://localhost:5173>。前端开发服务使用 5173 端口，Koa API 使用 3001 端口，Vite 会将 `/api` 请求转发到 Koa。

数据库容器名为 `demo-mysql`，数据库名为 `demo`，用户名和密码按当前约定均为 `root`。容器内是 3306 端口；为避免占用本机已有的 MySQL，默认只将 `127.0.0.1:3307` 映射到容器。数据库文件保存在 Docker 命名卷中，重启容器不会清除数据。

如果在其他电脑上部署或修改连接参数，请同步修改 `server/.env`。`npm run db:up` 会通过 `--env-file server/.env` 将相同的数据库端口、密码和库名传给 Docker Compose。`server/.env` 已被 Git 忽略；仓库中的 `server/.env.example` 是可复制的配置示例。

## 数据库初始化与后续迁移

`npm run db:setup` 会创建 `demo` 数据库、迁移记录表 `schema_migrations`，并依次执行 `server/db/migrations/` 下尚未执行的 `.sql` 文件。重复运行会跳过已执行的文件。

第一条迁移建立 `template` 表，字段为：

| 字段 | 用途 |
| --- | --- |
| `id` | 自增主键 |
| `name` | 模板名称 |
| `version` | 版本号 |
| `file_blob` | `.docx` 文件内容 |
| `uploaded_at` / `uploaded_by` | 上传时间和上传人 |
| `updated_at` / `updated_by` | 修改时间和修改人 |

第二条迁移建立 `assessment_ledger` 表：`id` 为自增主键；`business_name`、`requirement_name`、`description`、`contact`、`completion_date`、`risk_level`、`risk_count`、`risk_resolved` 对应台账表格的八个文本字段。评估表、评估报告和风险跟踪表分别用文件名列和 `MEDIUMBLOB` 列保存，附件可以为空。`created_at`、`created_by`、`updated_at`、`updated_by` 保存创建和修改信息。

模板的上传人、修改人以及台账的创建者、修改者目前都由服务端固定写为 `admin`。时间以 UTC 写入数据库。以后新增表或变更结构时，新建递增编号的 SQL 文件（例如 `003_create_report.sql`），再运行 `npm run db:setup`；不要修改已经执行过的迁移文件。

## 当前页面与 API

页面路径如下：

| 路径 | 页面 | 当前状态 |
| --- | --- | --- |
| `/` | 首页仪表盘 | 已接入统计 API 和 MySQL |
| `/templates` | 报告模板管理 | 已接入 API 和 MySQL |
| `/ledger` | 评估台账 | 已接入 API 和 MySQL |
| `/reports` | 报告生成 | 已接入模板选择、评估表上传、临时生成、预览和发布 |

报告模板管理支持列表、按名称搜索、上传、编辑、下载和删除。上传文件必须是非空的 `.docx`，最大 10 MB。数据由 API 和 MySQL 提供，刷新页面后仍会保留。

首页通过 `GET /api/dashboard` 读取统计数据：评估总数量、按业务名称分组的评估数量、风险处置状态分布和最近 10 条未处置完成记录来自 `assessment_ledger`；已上传模板数量来自 `template`。目前“风险未处置完成”的大数字按 `risk_resolved = '否'` 的台账记录数统计。首页快捷入口可进入模板管理、报告生成和评估台账。

评估台账可以按业务名称、需求名称、风险等级和风险是否处置完成在已加载列表中查询；处置状态可选“是”“否”“无风险项”。页面支持手动新增、编辑或删除记录。新增和编辑弹窗可填写所有文本字段，并上传评估表（`.xlsx` 或 `.xlsm`）、评估报告（仅 `.docx`）和风险跟踪表（仅 `.xlsx`）。每个文件须非空且不超过 10 MB。表格提供对应文件的下载和上传/替换入口。记录与附件保存在 MySQL，刷新页面后仍会保留。导出台账按钮暂为界面占位。

报告生成页从 `template` 表加载已上传的模板，手动选择一个模板并上传非空的 `.xlsx` 或 `.xlsm` 评估表后，调用 `POST /api/reports/generate`。服务端读取数据库中的模板 DOCX 和上传的评估表，按模板中的 `{工作表名/单元格地址}` 或反引号标记填充单元格值，并返回新的 DOCX。页面使用浏览器内的 DOCX 渲染器提供预览，下载得到同一份 DOCX；预览样式可能与 Word 有差异。点击发布报告后，弹窗要求填写台账的八个文本字段，成功后将上传的评估表和生成的 DOCX 分别保存到 `assessment_ledger` 的评估表、评估报告附件列，并跳转到评估台账。生成结果在发布前仅保存在当前页面内，刷新页面需重新生成。

生成逻辑位于 `server/src/reports/`，参照 `server/template/` 的命令行示例实现，示例目录本身不参与 API 运行。服务端使用 SheetJS 0.20.3 解析 Excel，依赖来自其官方 CDN。`server/.env` 中的 `REPORT_AI_*` 项对应示例的 `ai-xlsm-config.json`：匹配指定工作表中不符合条件的行时，会调用 DeepSeek 并填入配置的风险处置标记。`DEEPSEEK_API_KEY` 只放在已忽略的 `server/.env`；不配置 `REPORT_AI_*` 时仅填充单元格标记。每次请求在已忽略的 `server/logs/` 下创建带时间戳的 JSONL 日志，记录步骤、数量和错误，不记录评估表全文、提示词、模型回复或密钥。生成的 DOCX 限制为 10 MB，以便后续发布到台账。DeepSeek 的实际请求尚未联调。

| 请求 | 功能 |
| --- | --- |
| `GET /api/dashboard` | 获取首页统计和未处置完成记录列表 |
| `GET /api/templates` | 获取模板列表（不返回文件内容） |
| `GET /api/templates/:id` | 获取单个模板信息（不返回文件内容） |
| `POST /api/templates` | 上传模板；`multipart/form-data` 字段为 `name`、`version`、`file` |
| `PUT /api/templates/:id` | 修改名称和版本；可选传入新 `file` 替换附件 |
| `GET /api/templates/:id/download` | 下载 `.docx` 文件 |
| `DELETE /api/templates/:id` | 删除模板 |
| `POST /api/reports/generate` | 生成报告；`multipart/form-data` 字段为 `templateId` 和 `evaluationForm`（`.xlsx` 或 `.xlsm`），返回填充后的 DOCX 文件 |

台账 API 的记录 JSON 包含八个文本字段、三个附件文件名、`id` 和创建/修改信息，不包含附件内容。新增和整条修改使用 `multipart/form-data`，文本字段名依次为 `businessName`、`requirementName`、`description`、`contact`、`completionDate`、`riskLevel`、`riskCount`、`riskResolved`；可选文件字段为 `evaluationForm`、`evaluationReport`、`riskTrackingSheet`。整条修改时不上传某个附件会保留原文件。

| 请求 | 功能 |
| --- | --- |
| `GET /api/ledger` | 获取台账列表 |
| `GET /api/ledger/:id` | 获取单条台账 |
| `POST /api/ledger` | 新增台账，可同时上传三个附件 |
| `PUT /api/ledger/:id` | 修改台账字段，可选择替换附件 |
| `DELETE /api/ledger/:id` | 删除台账及其附件 |
| `GET /api/ledger/:id/files/:key/download` | 下载附件 |
| `PUT /api/ledger/:id/files/:key` | 用 `multipart/form-data` 的 `file` 字段上传或替换单个附件 |

附件路径中的 `:key` 取 `evaluationForm`、`evaluationReport` 或 `riskTrackingSheet`。

项目原有的 `GET /api/status` 健康接口和 `POST /api/greet` 示例接口仍保留。当前没有登录系统或权限控制；`admin` 仅是按现阶段需求写入的固定操作人。

## 常用命令

```bash
npm run dev        # 同时启动 Koa 和前端开发服务
npm run build      # 构建前后端
npm run start      # 运行已构建的 Koa 服务
npm run db:setup   # 执行未运行的数据库迁移
npm run db:down    # 停止数据库容器，保留数据卷
```

部署到新电脑时，复制项目、安装依赖、创建 `server/.env`，依次运行 `npm run db:up`、`npm run db:setup` 和构建/启动命令。生产环境需要单独托管 `client/dist`，将 `/api/*` 转发到 Koa，并让前端路由回退到 `index.html`。
