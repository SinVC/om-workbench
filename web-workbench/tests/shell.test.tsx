import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../src/shell/AppShell';
import { reactiveStore } from '../src/sdk/store';
import { invoke } from './setup';
import { config } from './fixtures';
vi.mock('../src/templates', () => ({
  WORKBENCH_TEMPLATES: [
    { id: 'productivity', name: '测试模板', icon: '⚡', render: () => <div>工作台内容</div> },
  ],
}));
beforeEach(() => {
  reactiveStore.setCachedConfig(config);
  invoke.mockImplementation(async (command) =>
    command === 'backup_validate' || command === 'backup_restore'
      ? { recordCount: 1, assetCount: 0 }
      : command === 'window_state'
        ? { maximized: false }
        : config,
  );
});
it('validates backup selection and restores only after explicit confirmation', async () => {
  render(<AppShell />);
  await userEvent.click(screen.getByRole('button', { name: '备份与数据管理' }));
  const file = new File(
    [JSON.stringify({ schemaVersion: 1, records: [], assets: [] })],
    'backup.json',
    { type: 'application/json' },
  );
  await userEvent.upload(screen.getByLabelText('选择备份文件'), file);
  await screen.findByRole('button', { name: '确认覆盖恢复' });
  expect(invoke.mock.calls.some(([command]) => command === 'backup_restore')).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(invoke.mock.calls.some(([command]) => command === 'backup_restore')).toBe(false);
  await userEvent.upload(screen.getByLabelText('选择备份文件'), file);
  await userEvent.click(await screen.findByRole('button', { name: '确认覆盖恢复' }));
  await waitFor(() =>
    expect(invoke.mock.calls.filter(([command]) => command === 'backup_restore')).toHaveLength(1),
  );
});
it('applies token overrides and removes them when configuration changes', async () => {
  reactiveStore.setCachedConfig({
    ...config,
    workbench: { ...config.workbench, tokens: { '--accent-primary': 'red' } },
  });
  const { unmount } = render(<AppShell />);
  expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('red');
  unmount();
  expect(document.documentElement.style.getPropertyValue('--accent-primary')).toBe('');
});
