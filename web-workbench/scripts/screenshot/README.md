# 无头浏览器截图

用本机 Chrome/Edge 的 headless 模式截取 `web-workbench/dist` 的真实渲染结果，不启动 Tauri 宿主。

```bash
# 1. 先构建最新产物
npm run build

# 2. 深色 + 演示数据
node web-workbench/scripts/screenshot/shoot.mjs --mock --theme dark --out workbench-dark.png

# 3. 浅色
node web-workbench/scripts/screenshot/shoot.mjs --mock --theme light --out workbench-light.png

# 4. 更高视口，查看整页（工作台内部滚动，靠加高视口展示更多内容）
node web-workbench/scripts/screenshot/shoot.mjs --mock --height 2400 --out workbench-full.png
```

命令直接运行仓库内的脚本，它会自动：

1. 在随机本地端口启动静态服务（`dist` 根目录）；
2. 用 `--remote-debugging-port=0` 启动 Chrome/Edge headless；
3. 通过 CDP 等待 `document.readyState === 'complete'` 与 `document.fonts.ready`；
4. 按需注入 `mock-host.js` 演示数据，并按 `?theme=` 设置深浅色；
5. 截图并清理浏览器进程、临时 profile 与静态服务。

## 参数

| 参数 | 说明 | 默认 |
| :--- | :--- | :--- |
| `--out <path>` | 输出 PNG | `screenshot.png` |
| `--width <px>` / `--height <px>` | 视口尺寸 | `1280 × 900` |
| `--theme <dark\|light>` | 深浅色 | `dark` |
| `--mock` | 注入演示记录（任务/习惯/便签/日程） | 关闭，展示空状态 |
| `--eval <file>` | 截图前执行一段 JS（可用来点开弹窗、切换视图） | 无 |
| `--wait <ms>` | 字体加载后的额外等待 | `1200` |
| `--keep-open` | 保留静态服务便于手动检查 | 关闭 |

## 截图交互态

写一个 `open-dialog.js`：

```js
const button = [...document.querySelectorAll('#module-tasks button')].find((node) =>
  node.textContent.includes('新建待办'),
);
button?.click();
await new Promise((resolve) => setTimeout(resolve, 400));
```

然后：

```bash
node web-workbench/scripts/screenshot/shoot.mjs --mock --eval open-dialog.js --out dialog.png
```

## 只用原生命令的等价做法

不想用脚本时，可以自己起服务并用 Chrome 的 `--screenshot`：

```powershell
# 终端 A：vite preview 以 HTTP 提供 dist（file:// 会因 ES module CORS 打不开）
npm run preview -w web-workbench -- --port 4173

# 终端 B：无数据、默认深色；PowerShell 里整条写完即可
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1280,900 --virtual-time-budget=4000 --screenshot="F:\path\shot.png" "http://127.0.0.1:4173/"
```

这种方式拿不到演示数据和浅色主题；需要数据或切主题时用 `shoot.mjs`。
