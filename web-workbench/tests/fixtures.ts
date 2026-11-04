import type { AppConfig, RecordItem, TaskPayload } from '../src/sdk/types';
export const config: AppConfig = {
  window: { mode: 'sidebar', width: 360, height: 800, resizable: true, rememberBounds: true },
  network: { allowlist: [], connections: {} },
  workbench: { theme: 'dark', tokens: {}, modules: [], layout: {}, initialized: true },
};
export function task(id = 'task', patch: Partial<TaskPayload> = {}): RecordItem<TaskPayload> {
  return {
    id,
    collection: 'tasks',
    createdAt: 1,
    updatedAt: 2,
    tags: ['tag'],
    businessDate: '2026-10-30',
    archived: false,
    assetIds: [],
    payload: {
      title: '示例待办',
      priority: 'P1',
      completed: false,
      snoozeCount: 0,
      subtasks: [],
      dueDate: '2026-10-30',
      ...patch,
    },
  };
}
