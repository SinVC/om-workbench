import type {
  AppConfig,
  AssetInfo,
  Backup,
  BackupSummary,
  HostError,
  HabitPayload,
  ScheduleEventPayload,
  Operation,
  RecordData,
  RecordItem,
  RecordQuery,
  TaskPayload,
  WindowAction,
  WindowConfig,
  WindowState,
} from './types';
import { hostWindow, invokeHost } from './host';
import { reactiveStore } from './store';
import {
  buildCompleteTaskOperations,
  buildSnoozeTaskOperations,
  buildToggleSubtaskOperations,
  buildUncompleteTaskOperations,
  buildUpdateTaskOperations,
} from './tasks';
import { searchRecords, type SearchResultItem } from './search';
import { validateScheduleEvent } from './calendar';

/** Read a complete collection without changing the host's single-page query contract. */
export async function queryAllRecords<T = Record<string, unknown>>(
  query: Omit<RecordQuery, 'limit'>,
): Promise<RecordItem<T>[]> {
  const records: RecordItem<T>[] = [];
  let offset = query.offset ?? 0;
  while (true) {
    const page = await invokeHost<RecordItem<T>[]>('records_query', {
      sort: 'id',
      ...query,
      limit: 1000,
      offset,
    });
    records.push(...page);
    if (page.length < 1000) return records;
    offset += page.length;
  }
}

export const workbench = {
  records: {
    queryAll: queryAllRecords,
    query: async <T = Record<string, unknown>>(query: RecordQuery): Promise<RecordItem<T>[]> => {
      return await invokeHost<RecordItem<T>[]>('records_query', query);
    },

    batch: async <T = Record<string, unknown>>(
      operations: Operation<T>[],
    ): Promise<(RecordItem<T> | null)[]> => {
      return await reactiveStore.trackPending(
        invokeHost<(RecordItem<T> | null)[]>('records_batch', { operations }),
      );
    },

    create: async <T = Record<string, unknown>>(
      collection: string,
      data: RecordData<T>,
      id?: string,
    ): Promise<RecordItem<T>> => {
      const operations: Operation<T>[] = [{ type: 'create', collection, id, data }];
      const results = await workbench.records.batch<T>(operations);
      const created = results[0];
      if (!created) {
        throw new Error('Failed to create record: returned null');
      }
      return created;
    },

    update: async <T = Record<string, unknown>>(
      id: string,
      data: RecordData<T>,
      expectedUpdatedAt?: number,
    ): Promise<RecordItem<T>> => {
      const operations: Operation<T>[] = [{ type: 'update', id, data, expectedUpdatedAt }];
      const results = await workbench.records.batch<T>(operations);
      const updated = results[0];
      if (!updated) {
        throw new Error('Failed to update record: returned null');
      }
      return updated;
    },

    delete: async (id: string, expectedUpdatedAt?: number): Promise<void> => {
      const operations: Operation[] = [{ type: 'delete', id, expectedUpdatedAt }];
      await workbench.records.batch(operations);
    },

    get: async <T = Record<string, unknown>>(
      collection: string,
      id: string,
    ): Promise<RecordItem<T> | null> => {
      let offset = 0;
      while (true) {
        const page = await workbench.records.query<T>({
          collection,
          sort: 'id',
          limit: 1000,
          offset,
        });
        const record = page.find((item) => item.id === id);
        if (record) return record;
        if (page.length < 1000) return null;
        offset += page.length;
      }
    },
  },

  assets: {
    import: async (bytes: Uint8Array | number[]): Promise<AssetInfo> => {
      const bytesArray = Array.isArray(bytes) ? bytes : Array.from(bytes);
      return await reactiveStore.trackPending(
        invokeHost<AssetInfo>('assets_import', { bytes: bytesArray }),
      );
    },

    get: async (id: string): Promise<AssetInfo> => {
      return await invokeHost<AssetInfo>('assets_get', { id });
    },

    delete: async (id: string): Promise<void> => {
      return await reactiveStore.trackPending(invokeHost<void>('assets_delete', { id }));
    },
  },

  config: {
    get: async (): Promise<AppConfig> => {
      const config = await invokeHost<AppConfig>('config_get');
      reactiveStore.setCachedConfig(config);
      return config;
    },

    update: async (
      namespace: 'window' | 'network' | 'workbench',
      patch: unknown,
    ): Promise<AppConfig> => {
      const config = await reactiveStore.trackPending(
        invokeHost<AppConfig>('config_update', { namespace, patch }),
      );
      reactiveStore.setCachedConfig(config);
      return config;
    },

    reset: async (namespace: 'window' | 'network' | 'workbench'): Promise<AppConfig> => {
      const config = await reactiveStore.trackPending(
        invokeHost<AppConfig>('config_reset', { namespace }),
      );
      reactiveStore.setCachedConfig(config);
      return config;
    },
  },

  backup: {
    export: async (includeAssets: boolean = true): Promise<Backup> => {
      return await invokeHost<Backup>('backup_export', { includeAssets });
    },

    validate: async (backup: Backup): Promise<BackupSummary> => {
      return await invokeHost<BackupSummary>('backup_validate', { backup });
    },

    restore: async (backup: Backup): Promise<BackupSummary> => {
      await workbench.config.update('workbench', { initialized: true });
      return await reactiveStore.trackPending(
        invokeHost<BackupSummary>('backup_restore', { backup }),
      );
    },

    clear: async (): Promise<void> => {
      await workbench.config.update('workbench', { initialized: true });
      return await reactiveStore.trackPending(invokeHost<void>('backup_clear'));
    },
  },

  window: {
    state: async (): Promise<WindowState> => {
      return await hostWindow.state();
    },

    control: async (action: WindowAction): Promise<void> => {
      return await hostWindow.control(action);
    },

    apply: async (config: Partial<WindowConfig>): Promise<WindowState> => {
      return await hostWindow.apply(config);
    },

    reload: async (): Promise<void> => {
      return await hostWindow.reload();
    },
  },

  http: {
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      void input;
      void init;
      throw {
        code: 'HOST_UNAVAILABLE',
        message: '当前运行器尚未启用原生网络代理',
        context: { operation: 'http.fetch' },
      } satisfies HostError;
    },
  },

  // Business Action Layer (Tasks domain)
  tasks: {
    update: async (task: RecordItem<TaskPayload>, patch: Partial<TaskPayload>): Promise<void> => {
      await workbench.records.batch(buildUpdateTaskOperations(task, patch));
    },
    complete: async (task: RecordItem<TaskPayload>): Promise<void> => {
      const operations = buildCompleteTaskOperations(task);
      await workbench.records.batch(operations);
    },

    toggleSubtask: async (
      task: RecordItem<TaskPayload>,
      subtaskId: string,
      completed: boolean,
    ): Promise<void> => {
      const operations = buildToggleSubtaskOperations(task, subtaskId, completed);
      await workbench.records.batch(operations);
    },

    snooze: async (task: RecordItem<TaskPayload>, days: number = 1): Promise<void> => {
      const operations = buildSnoozeTaskOperations(task, days);
      await workbench.records.batch(operations);
    },

    uncomplete: async (task: RecordItem<TaskPayload>): Promise<void> => {
      const operations = buildUncompleteTaskOperations(task);
      await workbench.records.batch(operations);
    },
  },

  habits: {
    toggle: async (habit: RecordItem<HabitPayload>, date: string): Promise<void> => {
      const logs = { ...habit.payload.logs };
      if (logs[date]) delete logs[date];
      else logs[date] = true;
      await workbench.records.update(
        habit.id,
        {
          tags: habit.tags,
          businessDate: habit.businessDate,
          archived: habit.archived,
          assetIds: habit.assetIds,
          payload: { ...habit.payload, logs },
        },
        habit.updatedAt,
      );
    },
    recordFailure: async (
      habit: RecordItem<HabitPayload>,
      date: string,
      reason: string,
    ): Promise<void> => {
      await workbench.records.update(
        habit.id,
        {
          tags: habit.tags,
          businessDate: habit.businessDate,
          archived: habit.archived,
          assetIds: habit.assetIds,
          payload: {
            ...habit.payload,
            failReasons: { ...habit.payload.failReasons, [date]: reason.trim() },
          },
        },
        habit.updatedAt,
      );
    },
  },

  calendar: {
    create: async (payload: ScheduleEventPayload): Promise<RecordItem<ScheduleEventPayload>> => {
      validateScheduleEvent(payload);
      return await workbench.records.create('events', {
        payload,
        tags: payload.category ? [payload.category] : [],
        businessDate: payload.startDate,
        archived: false,
        assetIds: [],
      });
    },
    reschedule: async (
      event: RecordItem<ScheduleEventPayload>,
      patch: Partial<ScheduleEventPayload>,
    ): Promise<void> => {
      const payload = { ...event.payload, ...patch };
      validateScheduleEvent(payload);
      await workbench.records.update(
        event.id,
        {
          payload,
          tags: event.tags,
          businessDate: payload.startDate,
          archived: event.archived,
          assetIds: event.assetIds,
        },
        event.updatedAt,
      );
    },
  },

  // Global Search across collections
  search: {
    find: async (
      query: string,
      collections?: readonly string[],
      limit: number = 20,
    ): Promise<SearchResultItem[]> => {
      if (!query.trim()) return [];
      // P0 has no collection-enumeration command. The metadata-only export includes
      // every collection, including custom modules, without reading image bytes.
      const allRecords = collections
        ? (
            await Promise.all(collections.map((collection) => queryAllRecords({ collection })))
          ).flat()
        : (await workbench.backup.export(false)).records;
      return searchRecords(allRecords, query, limit);
    },
  },
};
