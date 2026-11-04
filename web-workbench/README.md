# 可编辑工作台前端（web-workbench）

本目录是本工作台的前端源码工程（React 19 + TypeScript + Vite）。在“预编译桌面运行器 + 可编辑前端工作台”的双层架构中，**本目录是客户与本机 AI Agent 编写、扩展和定制个人工作台页面的唯一作业面**。

页面构建为完全离线自包含的静态产物后由 Tauri 宿主挂载加载，修改业务界面或新增功能模块无需安装 Rust 工具链或重新编译宿主。

---

## 一、常用开发命令

在仓库根目录执行（包管理器统一使用 npm）：

```bash
# 启动前端 Vite 实时开发服务器（默认端口 5173）
npm run dev

# 单次构建离线静态产物至 web-workbench/dist/（触发宿主窗口热刷新）
npm run build

# 监听模式构建（修改源码自动编译产出）
npm run build:watch

# 执行 TypeScript 类型检查、ESLint 与 Prettier 格式校验
npm run check
```

---

## 二、源码目录拓扑

| 目录路径 | 核心职责 | 开发参考文档 |
| :--- | :--- | :--- |
| `src/shell/` | 应用外壳（`AppShell`）、窗口标题栏拖动区、窗口状态记忆与深浅色主题注入 | [运行时与开发公共规范](docs/shared/workbench-runtime-and-conventions.md) |
| `src/sdk/` | `workbench.*` 类型化 SDK、领域服务（tasks/habits/calendar/search）与响应式状态总线 | [宿主开放能力与前端 SDK 契约](docs/modules/host-and-sdk-interfaces.md) |
| `src/ui/` | 基础交互原语（`primitives/`）、多视图投影器（`views/`）、表格日历与图表（`charts/`） | [前端可复用控件与多视图引擎](docs/modules/reusable-ui-and-views.md) |
| `src/modules/` | 生产级参考业务模块（今日聚焦、待办列表、日历、习惯矩阵、量化看板、速记） | [业务模块组装与工作台模板扩展](docs/modules/custom-modules-and-templates.md) |
| `src/templates/` | 成品工作台模板定义（全能效率、极简专注、习惯复盘与知识库） | [业务模块组装与工作台模板扩展](docs/modules/custom-modules-and-templates.md) |
| `src/styles/` | 主题设计令牌（`tokens.css`）与工作台全局样式（`global.css`） | [工作台内容布局规范](docs/content-layout.md) |

---

## 三、面向 AI Agent 的工作台开发指南

为帮助本机 AI Agent 或前端开发者高效完成个人工作台的定制与扩展，我们在 `docs/` 目录中整理了完整的开发指南套件。本指南遵循“根架构文档 + 共享设计文档 + 模块下钻文档”分层规范：

- 🧭 **[指南总览与 Agent 导航](docs/README.md)**：全局体系认知、系统拓扑、Agent 标准 5 步作业流与任务查阅索引。
- 📐 **[工作台运行时与开发公共规范](docs/shared/workbench-runtime-and-conventions.md)**：离线零外链底线、单一事实源范式、响应式单向数据流、容器查询与主题令牌规范。
- 🔌 **[宿主开放能力与前端 SDK 契约](docs/modules/host-and-sdk-interfaces.md)**：通用资源客户端（`records` / `assets` / `config` / `backup` / `window`）、业务动作层与 React 响应式 Hooks。
- 🧩 **[前端可复用控件与多视图引擎](docs/modules/reusable-ui-and-views.md)**：基础原语（Button/Input/Select/Badge/Dialog）、六视图一体化容器（MultiViewContainer）、无头表格（DataTable）、排程日历（CalendarView）、统计图表与媒体导出工具。
- 🏗️ **[业务模块组装与工作台模板扩展](docs/modules/custom-modules-and-templates.md)**：三层解耦结构、参考模块实现剖析、新增自定义模块 4 步走、模板注册切换与 12 大业务域扩展模式。
- 🖼️ **[工作台内容布局规范：背景、窗口轮廓与滚动](docs/content-layout.md)**：页面与宿主边界、外壳直角铺满、滚动区域分配与外观回归验收基准。

---

## 四、核心开发约束（Agent 须知）

1. **离线零外链**：严禁在前端代码中引入任何外部 CDN、公网字体或未经本地受管的媒体 URL。
2. **单一事实源**：同类实体必须读写同一个底层 `collection`，禁止在组件私建存储副本。
3. **样式变量化**：颜色与边框一律使用 `var(--bg-surface)`、`var(--text-primary)` 等设计令牌，确保深浅主题平滑适配。
4. **外壳直角铺满**：最外层外壳贴合视口且无圆角，由原生桌面窗口统一裁剪，严禁在页面外层另画整窗圆角。
