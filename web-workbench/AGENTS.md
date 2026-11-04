# 个人工作台二次开发指南（AI Agent 须知）

## 一、系统定位与作业边界

本工程是一套**本地优先（Local-First）的个人自定义工作台前端工程**（React 19 + TypeScript + Vite）。
系统采用“预编译桌面运行器 + 可编辑前端工作台”的双层架构：
- **桌面宿主（固定运行器）**：已预编译放置于 `runner/` 目录中（`runner/tauri-host.exe`）。宿主负责原生桌面窗口管理、SQLite 物理持久化、本地图片托管与原子事务保障。**开发者与 Agent 不需要安装 Rust 工具链，严禁修改或尝试重新编译宿主代码**。
- **Agent 唯一作业面**：AI Agent 的**唯一作业目录为 `web-workbench/src/`**。你通过编写/修改 React 组件、调用 `workbench.*` SDK 以及调整模板配置，即可完成工作台的定制与全功能扩展。

---

## 二、常用开发与验证命令

在工程根目录执行（统一使用 npm）：

```bash
# 启动增量监听构建（修改源码自动编译产出至 web-workbench/dist/，驱动桌面窗口即时热刷新）
npm run build:watch

# 启动桌面宿主窗口（加载最新静态产物）
npm start
# 或直接双击运行 runner/tauri-host.exe

# 前端独立快速调试（Vite 开发服务器，端口 5173）
npm run dev

# 静态类型检查、ESLint 与代码格式检查
npm run check

# 执行前端自动化回归测试（Vitest）
npm run test

# 单次全量构建前端离线产物
npm run build
```

> **环境边界提示**：在纯浏览器环境（`npm run dev` 未连接桌面宿主）下，`useRecords` 会静默返回空数组 `{ data: [], loading: false, error: null }`；全量数据持久化、本地图片存取与窗口控制**必须在桌面宿主（`runner/tauri-host.exe`）中运行与验证**。

---

## 三、架构底线与开发规范（必须严格遵守）

1. **离线零外链**：
   - 所有第三方库、图标和字体必须本地打包，严禁在前端代码中引入外部 CDN 脚本、公网 Web 字体或未受管的外链媒体。外部 API 统一通过宿主安全代理发起。
2. **单一事实源**：
   - 同一业务实体（待办、日程、习惯、笔记等）在底层必须读写同一个 `collection` 集合，严禁在组件内部建立私有持久化副本或按视图重复建表。
   - 所有数据变更必须通过 `workbench.records.*` 或 `useRecords` / `useAction` SDK 执行，保证多视图（列表、日历、看板、四象限等）同源同步。
3. **外壳直角铺满**：
   - 最外层应用外壳（`#workbench`）必须直角贴合窗口视口，整窗的圆角与边框裁剪由桌面宿主和操作系统统一接管。
   - 严禁在页面外层另画整窗圆角或额外描边，避免产生黑边和双重边框。
4. **CSS 语义主题令牌**：
   - 颜色、背景、边框必须严格使用 CSS 语义变量（如 `var(--bg-surface)`、`var(--text-primary)`、`var(--border-subtle)` 等），确保深浅色主题无缝自适应切换。
5. **容器查询（@container）自适应**：
   - 组件布局优先依赖 `@container` 容器查询，使组件在窄侧栏（单列流）与宽面板（多列看板）之间平滑自适应，严禁依赖单一窗口宽度媒体查询。

---

## 四、Agent 标准 5 步作业流

当接收到用户的定制工作台任务时，严格按照以下依赖顺序执行：

1. **定义数据契约**：在 `src/types/` 或模块定义中声明 `collection` 名称与 TypeScript `Payload` 接口，确定核心字段。
2. **接入数据与动作**：使用 `useRecords(collection)` 订阅数据流，使用 `workbench.records.*` 执行增删改查或原子批处理。
3. **组装交互视图**：优先复用 `src/ui/` 中的六视图一体化组件（`MultiViewContainer`）、无头表格（`DataTable`）、日历（`CalendarView`）或统计图表。
4. **样式与布局合规**：使用语义 Tokens 编写样式，利用 `@container` 实现宽窄形态自适应，检查滚动区域与空状态呈现。
5. **注册模板与回归验证**：在 `src/templates/` 中装配模块并注册到模板列表，运行 `npm run check` 与 `npm run test` 确保无报错、构建产物正常刷新。

---

## 五、开发参考文档索引

随本工程分发了完整的前端开发指南，位于本文件同级的 `./docs/` 目录。以下链接均相对于本文件，支持在项目内使用或随 `web-workbench/` 文件夹独立分发：

- 🧭 **[指南总览与 Agent 导航](./docs/README.md)**：全局体系认知、Agent 作业拓扑与任务查阅索引。
- 📐 **[运行时公共规范](./docs/shared/workbench-runtime-and-conventions.md)**：离线零外链、单一事实源、状态同步、容器自适应与主题设计令牌。
- 🔌 **[宿主开放能力与前端 SDK 契约](./docs/modules/host-and-sdk-interfaces.md)**：`workbench.records` / `assets` / `config` / `window` / `backup` 接口详解与 React Hooks。
- 🧩 **[前端可复用控件与多视图引擎](./docs/modules/reusable-ui-and-views.md)**：基础原语、六视图组件、无头表格、日历与统计图表用法。
- 🏗️ **[业务模块组装与工作台模板扩展](./docs/modules/custom-modules-and-templates.md)**：参考模块结构剖析与 12 大业务域扩展模式。
- 🖼️ **[工作台内容布局规范](./docs/content-layout.md)**：外壳直角铺满、滚动区域分配与外观回归验收基准。
