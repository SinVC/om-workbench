# 项目上下文

## 系统定位
本仓库是一套本地优先（Local-First）的个人自定义工作台，采用“预编译桌面运行器 + 可编辑前端工作台”的解耦交付范式：
- `tauri-host`：由平台方编译分发的固定运行器，收敛窗口、存储、附件、网络代理与权限等系统资源。日常业务迭代不重编译宿主。
- `web-workbench`：客户本机 Agent 持续修改的 React + TypeScript + Vite 工程，构建为离线静态产物后由宿主加载。

设计文档入口为 [dev-doc/README.md](dev-doc/README.md)，工程规范基线见 [技术栈选型与关键架构决策](dev-doc/shared/tech-stack-and-decisions.md)。动手前先读对应模块的下钻文档。

编写、替换内部 HTML/CSS 或测试窗口外观前，先读[工作台内容布局规范](web-workbench/docs/content-layout.md)；用户模板与测试页面共用该规范。

## 目录拓扑
| 路径 | 职责 | 设计文档 |
| :--- | :--- | :--- |
| `dev-doc/` | 分层设计文档 | — |
| `references/` | 选型讨论原始材料，只读参考，不作为约束来源 | — |
| `web-workbench/src/shell/` | 应用壳层、主题令牌、自适应布局 | `dev-doc/web-workbench/build-and-app-shell.md` |
| `web-workbench/src/sdk/` | `workbench.*` SDK、领域规则、跨视图同步 | `dev-doc/web-workbench/sdk-and-domain-services.md` |
| `web-workbench/src/ui/` | 多视图投影与开源交互组件底座 | `dev-doc/web-workbench/ui-primitives-and-views.md` |
| `web-workbench/src/modules/`、`src/templates/` | 业务参考模块与工作台模板 | `dev-doc/web-workbench/templates-and-modules.md` |
| `tauri-host/src/` | 宿主 Rust 源码（IPC 网关、窗口、存储、网络） | `dev-doc/tauri-host/*.md` |
| `tauri-host/capabilities/` | 窗口级最小权限声明 | `dev-doc/tauri-host/security-and-extensions.md` |

## 常用命令
在仓库根目录执行，包管理器统一使用 npm：
- `npm install`：安装全部 workspace 依赖。
- `npm run dev`：仅启动前端 Vite 开发服务器。
- `npm run build` / `npm run build:watch`：单次构建或监听构建前端产物至 `web-workbench/dist/`。
- `npm run host:dev` / `npm run host:build`：启动宿主开发窗口，或构建宿主安装包（需要 Rust 工具链）。
- `npm run check`：依次执行类型检查、ESLint 与 Prettier 校验；宿主侧使用 `cargo fmt` 与 `cargo clippy`。

## 架构底线
- **离线零外链**：前端产物使用相对路径，第三方库、图标与字体全部本地打包；运行时不得请求任何外部资源，外部 API 只能经宿主 `http` 代理访问。
- **单一事实源**：同一业务实体的所有视图读写同一 `records` 集合，严禁按视图建表或保留本地副本。前端不直接持久化数据，一律经 `workbench.*` SDK 调用宿主。
- **宿主兜底安全**：路径沙箱、事务一致性、凭据托管与权限校验只在宿主侧实现，不信任 WebView 传入的参数。
- **简单优先**：不做过度设计或无依据的防御性设计；不增加无意义的 SHA 校验。保留契约明确要求的权限、路径、事务、图片类型与版本检查。


## Sandbox 提权

- 新增 Rust 依赖后，若 `cargo fetch` 因 Sandbox 无法解析或访问 `index.crates.io` / `static.crates.io`，停止同类重试，直接申请以 `require_escalated` 执行 `cargo fetch`（锁文件已更新时加 `--locked`）。该命令仅下载依赖并写入 Cargo 缓存及仓库锁文件，不运行项目或安装系统组件。2026-10-30 已遇到此 DNS 限制。
- 依赖下载完成后，优先用 `cargo test --offline --locked`、`cargo clippy --offline --locked --all-targets -- -D warnings` 验证。本机 Cargo 分支强制把 `target` 重定向至 `F:\Runtime\Rust\.cargo\targets\`，并忽略 `CARGO_TARGET_DIR`、`--target-dir` 和 `build.target-dir`；2026-10-30 已验证其构建锁写入被 Sandbox 拒绝。因此涉及编译的 `cargo check/test/clippy/build` 可直接申请 `require_escalated`，不再尝试改写 target 路径；`cargo fmt` 仍在 Sandbox 内执行。提权仅用于开发构建、测试及缓存写入，不用于规避编译或测试失败。
- 实际启动宿主会写入其受管应用配置目录（数据库、配置、附件与窗口记忆）。在当前仅允许写仓库的 Sandbox 中，运行 `npm run host:dev` 或本仓库构建的 `target/debug/tauri-host.exe --workspace <本仓库产物目录>` 时可为这些必要写入申请提权；窗口交互验证仅控制该工作台窗口。

# 文档的维护原则

> **注意**：以下原则**仅在进行文档创建、维护和修改时**生效并必须严格遵循，不适用于日常代码编写与常规开发任务。

## 风格
文档坚持最小必要原则，但维持：
- 语言的清晰易读，必须是自然流畅的人类自然语言。
- 术语的专业，并且不仅限于名词。
- 中文有歧义的时候可以使用英文术语。

## 结构
遵循“根架构文档 + 共享设计文档 + 模块下钻文档”的分层设计文档体系。根文档负责全局导航、模块关系、依赖顺序和开发优先级；共享文档承载跨模块公共设计与架构约束；模块下钻文档只描述模块特有的职责边界、接口契约、架构关系、关键决策和验收口径，并引用共享规则。所有文档坚持最小必要信息原则，避免实现细节、代码、常识性内容、可推导内容和重复描述，从而实现 AI 开发中的上下文隔离、篇幅控制和信息去冗余。

## 修改
**修改即重构**：需求或约束变化时，先找到管辖它的那一部分并改写；追加新条款是最后手段，需先确认无处可改。新增一条，就检查它是否让旧条失效——失效的删掉，重叠的合并，冲突以最新意图为准。堆砌出的补丁互相矛盾，比缺一条约束更伤。

## 时机
约束必须在行为发生之前记录，例如确定的spec，design。
结果只在行为发生后记录，例如测试获得的结论。

## 文档级规则
如果文档本身有文档级别的规则，请严格遵守它。如果发生规则冲突，请让用户解决
