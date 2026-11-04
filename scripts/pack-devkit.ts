import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(ROOT_DIR, '.temp-devkit');
const OUTPUT_DIR = path.join(ROOT_DIR, 'release-artifacts');
const ZIP_NAME = 'om-workbench-devkit.zip';
const ZIP_PATH = path.join(OUTPUT_DIR, ZIP_NAME);

interface CopyItem {
  source: string;
  target: string;
  isDir?: boolean;
}

function log(message: string): void {
  console.log(`[pack-devkit] ${message}`);
}

function cleanDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDirectory(source: string, target: string, ignoreNames: Set<string> = new Set()): void {
  ensureDir(target);
  const entries = fs.readdirSync(source, { withFileTypes: true });

  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(source, entry.name);
    const dstPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, dstPath, ignoreNames);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function resolveRunnerBinary(): string | null {
  const candidates = [
    path.join(ROOT_DIR, 'runner', 'tauri-host.exe'),
    path.join(ROOT_DIR, 'target', 'release', 'tauri-host.exe'),
    path.join(ROOT_DIR, 'target', 'debug', 'tauri-host.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const skipRunner = args.includes('--skip-runner');
  const keepTemp = args.includes('--keep-temp');

  log('Starting packaging process for OM Workbench DevKit...');

  // 1. 验证 web-workbench/dist 是否已存在
  const distIndex = path.join(ROOT_DIR, 'web-workbench', 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    log('web-workbench/dist not found. Running "npm run build -w web-workbench"...');
    execSync('npm run build -w web-workbench', { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  // 2. 清理 staging 与准备输出目录
  cleanDir(STAGING_DIR);
  ensureDir(STAGING_DIR);
  ensureDir(OUTPUT_DIR);

  // 3. 处理预编译桌面宿主
  const runnerTargetDir = path.join(STAGING_DIR, 'runner');
  ensureDir(runnerTargetDir);

  if (!skipRunner) {
    const runnerBinary = resolveRunnerBinary();
    if (runnerBinary) {
      const runnerDest = path.join(runnerTargetDir, 'tauri-host.exe');
      log(`Found host runner binary: ${runnerBinary}`);
      fs.copyFileSync(runnerBinary, runnerDest);
      log(`Copied host runner to ${runnerDest}`);
    } else {
      console.warn(
        '\n[WARNING] No precompiled tauri-host.exe found in runner/, target/release/ or target/debug/!'
      );
      console.warn(
        'Please build the host first via "npm run host:build" or provide --skip-runner to test frontend packaging only.\n'
      );
    }
  } else {
    log('Skipping host runner packaging as requested (--skip-runner).');
  }

  // 4. 前端工程目录与文件拷贝
  const webTargetDir = path.join(STAGING_DIR, 'web-workbench');
  ensureDir(webTargetDir);

  const ignoredDirNames = new Set(['node_modules', '.tmp', '.git', '.DS_Store']);

  // 目录树拷贝
  const directoriesToCopy = ['src', 'docs', 'tests', 'dist'];
  for (const dir of directoriesToCopy) {
    const src = path.join(ROOT_DIR, 'web-workbench', dir);
    const dst = path.join(webTargetDir, dir);
    if (fs.existsSync(src)) {
      copyDirectory(src, dst, ignoredDirNames);
      log(`Copied directory web-workbench/${dir}`);
    }
  }

  // 单文件拷贝
  const webFilesToCopy = [
    'index.html',
    'package.json',
    'vite.config.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'tsconfig.test.json',
    'THIRD_PARTY_NOTICES.md',
  ];

  for (const file of webFilesToCopy) {
    const src = path.join(ROOT_DIR, 'web-workbench', file);
    const dst = path.join(webTargetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // 5. 根配置文件拷贝
  const rootFilesToCopy = [
    'tsconfig.base.json',
    'tsconfig.json',
    'eslint.config.ts',
    '.prettierrc.json',
    '.prettierignore',
    '.editorconfig',
    '.gitignore',
    'package-lock.json',
  ];

  for (const file of rootFilesToCopy) {
    const src = path.join(ROOT_DIR, file);
    const dst = path.join(STAGING_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // 6. 核心模板文件映射
  // (1) 客户二开专用 AGENTS.md -> 交付包根目录 AGENTS.md
  const clientAgentsSrc = path.join(ROOT_DIR, 'web-workbench', 'AGENTS.md');
  const clientAgentsDst = path.join(STAGING_DIR, 'AGENTS.md');
  if (fs.existsSync(clientAgentsSrc)) {
    fs.copyFileSync(clientAgentsSrc, clientAgentsDst);
    log('Mapped web-workbench/AGENTS.md -> DevKit AGENTS.md');
  }

  // (2) 客户专用 README.md
  const devkitReadmeSrc = path.join(ROOT_DIR, 'scripts', 'templates', 'devkit-README.md');
  const devkitReadmeDst = path.join(STAGING_DIR, 'README.md');
  if (fs.existsSync(devkitReadmeSrc)) {
    fs.copyFileSync(devkitReadmeSrc, devkitReadmeDst);
    log('Mapped devkit-README.md -> DevKit README.md');
  }

  // (3) 客户专用 package.json
  const devkitPackageSrc = path.join(ROOT_DIR, 'scripts', 'templates', 'devkit-package.json');
  const devkitPackageDst = path.join(STAGING_DIR, 'package.json');
  if (fs.existsSync(devkitPackageSrc)) {
    fs.copyFileSync(devkitPackageSrc, devkitPackageDst);
    log('Mapped devkit-package.json -> DevKit package.json');
  }

  // (4) 快捷启动脚本
  const startBatSrc = path.join(ROOT_DIR, 'scripts', 'templates', 'start-workbench.bat');
  const startBatDst = path.join(STAGING_DIR, 'start-workbench.bat');
  if (fs.existsSync(startBatSrc)) {
    fs.copyFileSync(startBatSrc, startBatDst);
    log('Copied start-workbench.bat -> DevKit root');
  }

  // 7. 压缩为 ZIP 交付包
  log(`Compressing DevKit into ${ZIP_PATH}...`);
  if (fs.existsSync(ZIP_PATH)) {
    fs.unlinkSync(ZIP_PATH);
  }

  try {
    // 使用 Windows 原生 bsdtar 进行标准 zip 压缩
    execSync(`tar -a -c -f "${ZIP_PATH}" *`, { cwd: STAGING_DIR, stdio: 'pipe' });
  } catch (error) {
    // 备用：PowerShell Compress-Archive
    log('Fallback to PowerShell Compress-Archive...');
    execSync(
      `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${ZIP_PATH}' -Force"`,
      { stdio: 'inherit' }
    );
  }

  const stat = fs.statSync(ZIP_PATH);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  log(`DevKit package created successfully! Size: ${sizeMb} MB`);
  log(`Output: ${ZIP_PATH}`);

  // 8. 清理 staging 目录
  if (!keepTemp) {
    cleanDir(STAGING_DIR);
    log('Cleaned staging directory.');
  } else {
    log(`Preserved staging directory at: ${STAGING_DIR}`);
  }

  log('All done!');
}

main().catch((err) => {
  console.error('[pack-devkit] Packaging failed:', err);
  process.exit(1);
});
