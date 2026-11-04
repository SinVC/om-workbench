import React, { useEffect, useState } from 'react';
import {
  useConfig,
  useSaveStatus,
  useWindowState,
  useGlobalSearch,
  useAction,
  errorMessage,
  workbench,
  checkAndSeedInitialData,
  hasHost,
  type Backup,
  type BackupSummary,
  type SearchResultItem,
} from '../sdk';
import { WORKBENCH_TEMPLATES } from '../templates';
import { Button } from '../ui/primitives/Button';
import { Dialog } from '../ui/primitives/Dialog';
import { Input } from '../ui/primitives/Input';
import { Icon } from '../ui/icons/Icon';

const TEMPLATE_ICONS: Record<string, string> = {
  productivity: 'fa-bolt',
  minimal: 'fa-crosshairs',
  knowledge: 'fa-book-open',
};

export const AppShell: React.FC = () => {
  const { config, error: configError, update } = useConfig();
  const status = useSaveStatus();
  const { state, control, toggleMaximize } = useWindowState();
  const action = useAction();
  const [startupError, setStartupError] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { results, loading: searching, error: searchError } = useGlobalSearch(query);
  const [selected, setSelected] = useState<SearchResultItem | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [restore, setRestore] = useState<{
    backup: Backup;
    summary: BackupSummary;
    file: string;
  } | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const theme = config?.workbench.theme || 'dark';
  const template =
    WORKBENCH_TEMPLATES.find((item) => item.id === config?.workbench.activeTemplate) ||
    WORKBENCH_TEMPLATES[0];
  useEffect(() => {
    if (hasHost())
      void checkAndSeedInitialData().catch((error) => setStartupError(errorMessage(error)));
  }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((old) => !old);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const tokensKey = JSON.stringify(config?.workbench.tokens || {});
  useEffect(() => {
    const root = document.documentElement;
    const tokens = Object.entries(JSON.parse(tokensKey) as Record<string, string>).map(
      ([key, value]) => [key.startsWith('--') ? key : '--' + key, value] as const,
    );
    for (const [key, value] of tokens) root.style.setProperty(key, value);
    return () => {
      for (const [key] of tokens) root.style.removeProperty(key);
    };
  }, [tokensKey]);
  const importBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file)
      void action.run(async () => {
        const backup = JSON.parse(await file.text()) as Backup;
        const summary = await workbench.backup.validate(backup);
        setRestore({ backup, summary, file: file.name });
      });
  };
  const exportBackup = async () => {
    const backup = await workbench.backup.export(true);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      'workbench_backup_v' +
      backup.schemaVersion +
      '_' +
      new Date().toISOString().slice(0, 10) +
      '.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice('备份已导出');
  };
  const toggleMode = () =>
    workbench.window.apply({ mode: state?.mode === 'sidebar' ? 'panel' : 'sidebar' });
  const toggleTheme = () => update('workbench', { theme: theme === 'dark' ? 'light' : 'dark' });
  const saveText =
    status.state === 'saving'
      ? '保存中...'
      : status.state === 'error'
        ? '本地保存失败'
        : hasHost()
          ? '已保存到本机'
          : '浏览器预览';
  return (
    <main id="workbench" className={state?.maximized ? 'maximized' : ''} data-theme={theme}>
      <header className="titlebar" data-tauri-drag-region>
        <div className="titlebar-left" data-tauri-drag-region>
          <span className="brand-mark" aria-hidden="true" />
          <strong className="titlebar-title" data-tauri-drag-region>
            Personal Workbench
          </strong>
          <span className="masthead-rule" aria-hidden="true" />
          <Button
            className="template-button"
            size="sm"
            variant="ghost"
            title="切换工作台模板"
            onClick={() => setTemplatesOpen(true)}
          >
            <Icon name="fa-layer-group" />
            <span className="template-label">{template?.name}</span>
            <Icon name="fa-angle-down" />
          </Button>
          <div className="save-status-indicator" role="status" title={status.error || saveText}>
            <span className={'save-status-dot ' + status.state} />
            <span className="save-status-text">{saveText}</span>
          </div>
        </div>
        <nav className="titlebar-nav" aria-label="工作台与窗口操作">
          <button
            className="titlebar-btn desktop-tool"
            aria-label="全局搜索"
            title="全局搜索 · Ctrl K"
            onClick={() => setSearchOpen(true)}
          >
            <Icon name="fa-magnifying-glass" />
          </button>
          <button
            className="titlebar-btn desktop-tool"
            aria-label="备份与数据管理"
            title="备份与数据管理"
            onClick={() => setBackupOpen(true)}
          >
            <Icon name="fa-database" />
          </button>
          <button
            className="titlebar-btn desktop-tool"
            aria-label="切换窗口形态"
            title="切换窗口形态"
            disabled={!hasHost()}
            onClick={() => void action.run(toggleMode)}
          >
            <Icon name="fa-table-columns" />
          </button>
          <button
            className="titlebar-btn desktop-tool"
            aria-label="切换深浅主题"
            title="切换深浅主题"
            disabled={!hasHost()}
            onClick={() => void action.run(toggleTheme)}
          >
            <Icon name={theme === 'dark' ? 'fa-sun' : 'fa-moon'} />
          </button>
          <button
            className="titlebar-btn compact-tool"
            aria-label="更多工作台操作"
            title="更多工作台操作"
            onClick={() => setToolsOpen(true)}
          >
            <Icon name="fa-ellipsis" />
          </button>
          <span className="titlebar-divider" aria-hidden="true" />
          <button
            className="titlebar-btn"
            aria-label="最小化"
            title="最小化"
            disabled={!hasHost()}
            onClick={() => control('minimize')}
          >
            <Icon name="fa-minus" />
          </button>
          <button
            className="titlebar-btn"
            aria-label={state?.maximized ? '还原窗口' : '最大化'}
            title={state?.maximized ? '还原窗口' : '最大化'}
            disabled={!hasHost()}
            onClick={toggleMaximize}
          >
            <Icon name={state?.maximized ? 'fa-compress' : 'fa-expand'} />
          </button>
          <button
            className="titlebar-btn close"
            aria-label="关闭"
            title="关闭"
            disabled={!hasHost()}
            onClick={() => control('close')}
          >
            <Icon name="fa-xmark" />
          </button>
        </nav>
      </header>
      {(action.error || configError || startupError) && (
        <div className="shell-error" role="alert">
          {action.error || configError?.message || startupError}
        </div>
      )}
      <div className="workbench-viewport">
        <div className="workbench-main-scroller" tabIndex={0}>
          {template?.render()}
        </div>
      </div>
      <Dialog open={toolsOpen} onClose={() => setToolsOpen(false)} title="工作台操作">
        <div className="tool-menu">
          <Button
            onClick={() => {
              setToolsOpen(false);
              setSearchOpen(true);
            }}
          >
            <Icon name="fa-magnifying-glass" />
            全局搜索
          </Button>
          <Button
            onClick={() => {
              setToolsOpen(false);
              setBackupOpen(true);
            }}
          >
            <Icon name="fa-database" />
            备份与数据管理
          </Button>
          <Button disabled={!hasHost()} onClick={() => void action.run(toggleMode)}>
            <Icon name="fa-table-columns" />
            切换窗口形态
          </Button>
          <Button disabled={!hasHost()} onClick={() => void action.run(toggleTheme)}>
            <Icon name={theme === 'dark' ? 'fa-sun' : 'fa-moon'} />
            切换深浅主题
          </Button>
          <p>{saveText}</p>
        </div>
      </Dialog>
      <Dialog
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setQuery('');
        }}
        title="跨模块全局检索"
        description="搜索全部集合的标题、正文与标签，包括自定义模块"
      >
        <Input
          aria-label="搜索关键词"
          placeholder="输入搜索关键词..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
        {searchError && <p role="alert">{searchError}</p>}
        {searching ? (
          <p>正在搜索中...</p>
        ) : results.length === 0 ? (
          <p>{query.trim() ? '未找到相关结果' : '输入关键词即可检索'}</p>
        ) : (
          <div className="search-results">
            {results.map((result) => (
              <button
                key={result.id}
                onClick={() => {
                  setSelected(result);
                  setSearchOpen(false);
                }}
              >
                <strong>{result.title}</strong>
                <small>
                  {result.collection} · {result.businessDate}
                </small>
                <p>{result.snippet}</p>
              </button>
            ))}
          </div>
        )}
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title || '记录详情'}
        footer={
          <Button
            onClick={() =>
              void action.run(async () => {
                const collection = selected?.collection;
                await update('workbench', { activeTemplate: 'productivity' });
                setSelected(null);
                requestAnimationFrame(() =>
                  document
                    .getElementById('module-' + collection)
                    ?.scrollIntoView({ behavior: 'smooth' }),
                );
              })
            }
          >
            查看所在模块
          </Button>
        }
      >
        <pre className="record-details">{JSON.stringify(selected?.record.payload, null, 2)}</pre>
      </Dialog>
      <Dialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="选择工作台起步模板"
        description="仅改变界面排布，保留全部业务数据"
      >
        <div className="tool-menu">
          {WORKBENCH_TEMPLATES.map((item) => (
            <Button
              key={item.id}
              disabled={action.pending || !hasHost()}
              onClick={() =>
                void action.run(async () => {
                  await update('workbench', { activeTemplate: item.id });
                  setTemplatesOpen(false);
                })
              }
            >
              <Icon name={TEMPLATE_ICONS[item.id] ?? 'fa-layer-group'} />
              {item.name}
            </Button>
          ))}
        </div>
      </Dialog>
      <Dialog
        open={backupOpen}
        onClose={() => {
          if (!action.pending) setBackupOpen(false);
        }}
        title="数据备份与版本化恢复"
        description="导出全部记录与图片；恢复会覆盖当前工作区"
      >
        {(notice || action.error) && (
          <p role={action.error ? 'alert' : 'status'}>{action.error || notice}</p>
        )}
        <div className="tool-menu">
          <Button
            disabled={action.pending || !hasHost()}
            onClick={() => void action.run(exportBackup)}
          >
            导出版本化 JSON 备份
          </Button>
          <label>
            选择备份文件以校验
            <input
              type="file"
              accept=".json"
              aria-label="选择备份文件"
              disabled={action.pending || !hasHost()}
              onChange={importBackup}
            />
          </label>
          <Button
            variant="destructive"
            disabled={action.pending || !hasHost()}
            onClick={() => setClearOpen(true)}
          >
            清空工作区全部数据
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(restore)}
        onClose={() => {
          if (!action.pending) setRestore(null);
        }}
        title="确认覆盖当前工作区？"
        description="当前全部记录和附件将被备份内容替换，请先导出当前数据"
        footer={
          <>
            <Button disabled={action.pending} onClick={() => setRestore(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  if (!restore) return;
                  await workbench.backup.restore(restore.backup);
                  setNotice('恢复成功：' + restore.summary.recordCount + ' 条记录');
                  setRestore(null);
                })
              }
            >
              确认覆盖恢复
            </Button>
          </>
        }
      >
        <p>{restore?.file}</p>
        <p>
          将导入 {restore?.summary.recordCount} 条记录与 {restore?.summary.assetCount} 个附件。
        </p>
        {action.error && <p role="alert">{action.error}</p>}
      </Dialog>
      <Dialog
        open={clearOpen}
        onClose={() => {
          if (!action.pending) setClearOpen(false);
        }}
        title="确认清空全部数据？"
        description="此操作不可逆，请先完成备份"
        footer={
          <>
            <Button disabled={action.pending} onClick={() => setClearOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await workbench.backup.clear();
                  setClearOpen(false);
                  setNotice('工作区已清空');
                })
              }
            >
              确认永久清空
            </Button>
          </>
        }
      >
        <p>清空全部记录和图片附件，保留运行时配置。</p>
        {action.error && <p role="alert">{action.error}</p>}
      </Dialog>
    </main>
  );
};
