# PIA 评估平台

这是一个 npm workspace 项目：`client/` 使用 React、Vite 和 Ant Design，`server/` 使用 Koa，数据保存在 MySQL。当前已实现“报告模板管理”页面；侧栏中的其他页面暂为占位页。

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

当前第一条迁移建立 `template` 表，字段为：

| 字段 | 用途 |
| --- | --- |
| `id` | 自增主键 |
| `name` | 模板名称 |
| `version` | 版本号 |
| `file_blob` | `.docx` 文件内容 |
| `uploaded_at` / `uploaded_by` | 上传时间和上传人 |
| `updated_at` / `updated_by` | 修改时间和修改人 |

上传人、修改人目前由服务端固定写为 `admin`。时间以 UTC 写入数据库，页面按浏览器本地时区显示。以后新增表或变更结构时，新建递增编号的 SQL 文件（例如 `002_create_report.sql`），再运行 `npm run db:setup`；不要修改已经执行过的迁移文件。

## 当前页面与 API

报告模板页面在 `/`，支持列表、按名称搜索、上传、编辑、下载和删除。上传文件必须是非空的 `.docx`，最大 10 MB。数据由 API 和 MySQL 提供，刷新页面后仍会保留。

| 请求 | 功能 |
| --- | --- |
| `GET /api/templates` | 获取模板列表（不返回文件内容） |
| `GET /api/templates/:id` | 获取单个模板信息（不返回文件内容） |
| `POST /api/templates` | 上传模板；`multipart/form-data` 字段为 `name`、`version`、`file` |
| `PUT /api/templates/:id` | 修改名称和版本；可选传入新 `file` 替换附件 |
| `GET /api/templates/:id/download` | 下载 `.docx` 文件 |
| `DELETE /api/templates/:id` | 删除模板 |

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
