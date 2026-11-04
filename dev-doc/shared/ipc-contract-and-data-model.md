# 跨端通信契约与公共数据规范

本文档定义 Tauri 桌面宿主（`tauri-host`）与工作台页面（`web-workbench`）之间的职责分界、三层接口抽象契约、IPC 通信机制及共享数据模型，作为双端并行开发的唯一接口基准。

---

## 一、跨端职责分界原则

1. **宿主收敛系统资源与安全边界**：数据库持久化、多步写入事务原子性、物理文件读写、外部 API 密钥托管、跨域网络请求、桌面窗口控制及目录访问白名单全部下沉至 `tauri-host`，严禁将表结构迁移、路径越权防护或明文凭据暴露给页面侧自理。
2. **页面收敛业务编排与多视图渲染**：界面交互、响应式重排、日期计算、统计聚合及常规多步业务规则统一留在 `web-workbench`，通过调用标准 SDK 访问宿主资源，最大化减少宿主原生代码的变更频率。

---

## 二、三层接口抽象体系（`workbench.*`）

对外暴露给工作台与本机编码 Agent 的编程接口按“复用广度与规则稳定性”划分为三层，共用同一套底层数据集合与校验规则：

| 接口层级 | 核心定位 | 命名空间与能力契约 | 实现归属 |
| :--- | :--- | :--- | :--- |
| **第一层：通用资源接口** | 覆盖绝大多数常规及自定义模块的默认基座，新增普通模块无需新增 Rust 命令 | - `records`：按集合（Collection）查询、单条增删改、跨记录**原子批量操作**（Batch Transaction）<br>- `assets`：选取/导入本地图片附件、解析本地受管访问地址、读取元信息、删除附件<br>- `config`：读取、持久化工作台及窗口运行时配置，合并系统默认值<br>- `http`：兼容标准 `fetch` 语义的代理请求、超时与取消控制、可选连接凭据引用 | 宿主原生命令实现底层能力，前端 SDK 提供薄封装与类型声明 |
| **第二层：常见业务接口** | 面向待办、日程、习惯打卡等超高频稳定场景，封装“完整领域动作”而非简单改名的增删改查 | - 示例能力：完成重复待办（含标记完成、记录时间戳、推算并创建下一次实例、触发跨视图更新）、日程创建与冲突校验、习惯打卡与连续天数刷新 | 优先在前端 SDK 层组合通用资源接口与宿主原子批处理实现；仅强原生耦合逻辑下沉宿主 |
| **第三层：底层扩展接口** | 面向通用接口无法表达的特殊定制控件与高阶查询需求，按需开放逃生舱 | - `db`：受控的工作区 SQL 查询与参数化执行<br>- `files`：指定受权沙箱目录内的文本/二进制文件读写<br>- `http`：底层自定义原始请求控制 | 宿主严格管控权限范围、路径沙箱、事务边界与参数校验，按需授权开放 |

---

## 三、IPC 通信与异常规范

1. **内部进程间通信（IPC）**：页面与宿主全程通过 Tauri 2 原生命令（Commands）完成异步请求-响应调用，通过事件（Events）与通道（Channels）传递宿主状态变更（如外部配置文件更新、窗口形态切换、批量任务进度），无需启动任何本机 HTTP 监听服务。
2. **全局桥接兼容**：宿主开启全局 Tauri 对象注入（`withGlobalTauri`），确保前端 SDK 在 Vite 模块化打包环境与极简原生脚本环境下均可通过统一桥接通道调用底层命令。
3. **统一结构化错误契约**：所有跨端调用失败必须返回结构化错误对象（包含稳定错误分类码、可读错误摘要及上下文标识），显式区分：**参数与数据校验失败**、**数据库事务冲突与回滚**、**路径或域名未获白名单授权**、**外部网络超时或远端异常**，便于页面展示友好状态并降低 Agent 调试定位成本。

### P0 命令基线（契约版本 1）

所有资源命令使用单一 `request` 对象，字段采用 camelCase；无参数命令省略该对象。失败对象统一为 `{code, message, context}`，`context` 仅包含操作名和可选 `operationIndex`。稳定错误码为 `VALIDATION`、`NOT_FOUND`、`CONFLICT`、`PERMISSION_DENIED`、`IO`、`DATABASE`、`UNSUPPORTED_VERSION` 和 `INTERNAL`；Tauri 桥接自身的反序列化与 ACL 拒绝由 SDK 归一化。

| 命令 | 请求与结果 |
| :--- | :--- |
| `records_query` | `{collection, tags?, businessDate?, archived?, filters?, sort?, descending?, limit?, offset?}` → 记录数组；filters 为 `{path, value}` 的等值条件，path 为 JSON 字段名数组；sort 为 `createdAt` / `updatedAt` / `businessDate` / `id`，默认每页 100 条、最多 1000 条 |
| `records_batch` | `{operations}` → 按序返回记录或删除项的 `null`；操作为 `create`（collection、可选 id、data）、`update`（id、data、可选 expectedUpdatedAt）或 `delete`（id、可选 expectedUpdatedAt）；data 为完整替换的 `{payload, tags?, businessDate?, archived?, assetIds?}`，单批最多 500 项 |
| `assets_import` / `assets_get` / `assets_delete` | 导入 `{bytes}`，其余 `{id}`；返回含 id、mime、byteSize、width、height、url 的元信息，删除返回空值；只接受真实 PNG/JPEG/WebP/GIF，单图上限 10 MiB；已被记录引用的附件不可删除 |
| `config_get` / `config_update` / `config_reset` | 获取完整配置；更新 `{namespace, patch}` 或重置 `{namespace}`，返回合并默认值后的完整配置；namespace 为 window / network / workbench；null 恢复字段默认值，数组整体替换 |
| `backup_export` / `backup_validate` / `backup_restore` / `backup_clear` | 导出 `{includeAssets}` → 版本化 JSON 数据包；校验与恢复 `{backup}`，前者仅返回计数；恢复为全量替换记录和附件元信息，清空无参数；两者均不修改运行时配置或凭据 |
| `window_state` / `window_apply` / `workspace_reload` | 查询当前模式、逻辑尺寸和可见状态；应用 `{mode?, width?, height?, resizable?, rememberBounds?}`，返回同查询；刷新无参数 |
| `window_control` | `{action}` → 空值；action 为 `minimize` / `maximize` / `restore` / `toggleMaximize` / `close` / `startDragging`；窗口状态同时提供 maximized、minimized，以驱动页面按钮状态 |

记录信封固定为 `{id, collection, createdAt, updatedAt, tags, businessDate, archived, assetIds, payload}`。时间戳为宿主生成的 Unix 毫秒整数，更新严格递增；新建 ID 可省略，由宿主生成 UUID，提供时限制为 ASCII 字母、数字、下划线和连字符，最长 128 字符。`assetIds` 最多 9 项，必须指向已有资产。变更仅在提交成功后广播 `workbench://records-changed`（collection 数组）、`workbench://config-changed`（完整配置）、`workbench://window-changed`（窗口状态）、`workbench://data-restored`（无载荷）。P1 网络命令及 P2 底层扩展不在此基线中开放。

---

## 四、公共数据与运行时配置规范

### 1. 可扩展通用记录模型（Extensible Record Model）
为支撑 Agent 在不修改宿主数据库表结构的前提下自由扩充 12 大业务域模块，`records` 接口采用 **“固定系统信封字段 + 可扩展 JSON 业务载荷”** 结构：
- **宿主受管信封字段**：集合名称（`collection`）、全局唯一记录标识（`id`）、创建时间戳、最后更新时间戳及可选的通用检索索引字段（如标签集合、业务日期、归档状态）。
- **业务载荷（Payload）**：以结构化 JSON 承载各模块特有字段（如待办的优先级与顺延次数、账目的收支分类与金额、库存的补货阈值）。

### 2. 跨视图单一事实源约束（Single Source of Truth）
严禁按视图组件孤立建表或拆分冗余副本。例如“今日聚焦、多清单待办、四象限矩阵、看板、日历视图、周复盘”涉及的任务条目必须读写统一的 `tasks` 记录集合；业务接口与通用接口操作同一集合时共享一致的数据约束，保障一次变更全局生效。

### 3. 运行时配置逻辑分区
配置文件采用结构化 JSON 存储于受管配置目录，划分为三个正交命名空间，修改后无需重编译宿主即可读取生效：
- **`window`（窗口形态配置）**：声明当前激活模式（`sidebar` 侧栏 / `panel` 面板）、目标宽高、是否允许拖拽缩放（`resizable`）及是否启用位置尺寸记忆（`rememberBounds`）。
- **`network`（外部连接配置）**：声明运行时允许访问的外部 API 域名/URL 匹配规则，以及命名连接标识（Connection Alias）与宿主托管凭据、允许目标地址的绑定关系。
- **`workbench`（工作台视图配置）**：声明深浅色主题、设计令牌覆盖项、当前启用的业务模块列表及面板布局编排参数。

### 4. 版本化备份与数据库迁移边界
- **备份包契约**：JSON 导出文件与含附件的完整备份归档包必须在头部携带明确的 **数据契约版本号（Schema Version）** 与导出时间戳；导入恢复时先校验版本兼容性并在单一事务或受控恢复流程内原子替换/合并。
- **物理结构演进约束**：若未来升级宿主底层 SQLite 物理表结构，必须通过宿主内置的版本化迁移器（Migrations）在应用启动阶段幂等执行，严禁假设前端刷新页面可自行完成底层表结构迁移。
