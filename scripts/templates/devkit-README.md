# OM Workbench 二次开发套件 (OM Workbench DevKit)

欢迎使用 OM Workbench 二次开发套件！

本套件采用 **“预编译桌面运行器 + 可编辑前端工作台”** 的解耦架构。你（以及你的本地 AI 编码助手，如 Cursor、Claude Code、Windsurf 等）可以在无需配置 Rust 编译环境的前提下，随心定制或扩展专属的个人工作台。

---

## 快速开始（3 步走）

### 1. 环境准备
- 操作系统：Windows 10/11（已内置 WebView2 运行环境）
- 运行依赖：[Node.js](https://nodejs.org/) (`>= 22.12`) 与 npm

### 2. 初始化安装
在解压后的本工程根目录下打开终端，执行：

```bash
npm install
```

### 3. 运行与二次开发

你可以选择以下任一方式启动工作台：

- **方式 A（一键启动预置工作台）**：
  双击运行根目录的 `start-workbench.bat`（或在终端运行 `npm start`），预编译的桌面宿主将直接挂载预置的前端产物运行。

- **方式 B（联动 AI Agent 边改边预览，推荐）**：
  1. 在根目录打开终端运行监听构建：
     ```bash
     npm run build:watch
     ```
  2. 启动桌面宿主窗口（运行 `npm start` 或双击 `runner/tauri-host.exe`）；
  3. 让你的本地 AI Agent（如 Cursor/Claude Code）读取根目录的 `AGENTS.md`，开始修改或新增业务功能；
  4. 每次保存代码，Vite 将自动完成增量构建，桌面窗口即时热刷新展示新界面！

---

## 常用开发命令

| 命令 | 说明 |
| :--- | :--- |
| `npm start` | 启动预编译桌面宿主窗口（加载 `web-workbench/dist/`） |
| `npm run build:watch` | 监听模式构建前端（源码修改后自动重编，触发宿主热重载） |
| `npm run build` | 单次构建前端离线静态产物 |
| `npm run dev` | 启动前端 Vite 本地开发服务器（适合仅调试 UI 视觉） |
| `npm run check` | 运行 TypeScript 类型检查、ESLint 与 Prettier 代码格式检查 |
| `npm run test` | 运行 Vitest 前端自动化回归测试 |

---

## 目录结构速览

```text
.
├── runner/                      # 预编译桌面宿主运行器（tauri-host.exe）
├── web-workbench/               # 前端工程与二开核心作业面
│   ├── src/                     # 前端源码（模块、组件、SDK、样式与模板）
│   ├── docs/                    # 完整的前端开发指南（含 5 步作业流与各模块规范）
│   ├── dist/                    # 离线自包含构建产物
│   └── tests/                   # 自动化测试用例
├── AGENTS.md                    # 面向本机 AI Agent 的核心规则与架构底线
├── package.json                 # 统一工程命令入口
└── start-workbench.bat          # Windows 快捷启动脚本
```

---

## 开发者与 AI 协作须知

如果使用 AI 助手（如 Cursor、Claude 等）协助二次开发：
- 请确保 AI 读取了根目录的 `AGENTS.md`；
- 所有开发请在 `web-workbench/src/` 目录下进行；
- 详细的 API 契约与控件使用方法请查阅 `web-workbench/docs/` 目录。
