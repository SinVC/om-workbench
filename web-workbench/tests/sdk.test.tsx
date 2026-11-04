import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { workbench, queryAllRecords } from '../src/sdk/client';
import { useGlobalSearch, useRecords, useWindowState } from '../src/sdk/hooks';
import { checkAndSeedInitialData } from '../src/sdk/seed';
import { reactiveStore } from '../src/sdk/store';
import { buildUpdateTaskOperations, getTaskQuadrant } from '../src/sdk/tasks';
import type { RecordQuery } from '../src/sdk/types';
import { invoke, emit } from './setup';
import { config, task } from './fixtures';

beforeEach(() => {
  invoke.mockReset();
});
describe('SDK host contract regressions', () => {
  it('reads past both 100 and 1000 record boundaries', async () => {
    const data = Array.from({ length: 2005 }, (_, i) => task(String(i).padStart(4, '0')));
    invoke.mockImplementation(async (command, args) => {
      expect(command).toBe('records_query');
      const request = args?.request as RecordQuery;
      expect(request.sort).toBe('id');
      return data.slice(request.offset, (request.offset || 0) + (request.limit || 100));
    });
    expect(await queryAllRecords({ collection: 'tasks' })).toHaveLength(2005);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect((await workbench.records.get('tasks', '2004'))?.id).toBe('2004');
    for (const [, args] of invoke.mock.calls) expect(args?.request).not.toHaveProperty('filters');
  });
  it('searches custom collections through the metadata-only host export', async () => {
    invoke.mockResolvedValue({
      records: [{ ...task(), collection: 'custom', payload: { title: '库存警报' } }],
      assets: [],
    });
    expect(await workbench.search.find('库存')).toEqual([
      expect.objectContaining({ collection: 'custom' }),
    ]);
    expect(invoke).toHaveBeenCalledWith('backup_export', { request: { includeAssets: false } });
  });
  it('never sends browser network requests when proxy is unavailable', async () => {
    const fetch = vi.spyOn(window, 'fetch');
    await expect(workbench.http.fetch('https://example.test')).rejects.toMatchObject({
      code: 'HOST_UNAVAILABLE',
      context: { operation: 'http.fetch' },
    });
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
  it('keeps a concurrent write failure visible after another write succeeds', async () => {
    let resolve!: () => void;
    const success = reactiveStore.trackPending(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    await expect(
      reactiveStore.trackPending(Promise.reject(new Error('disk failed'))),
    ).rejects.toThrow('disk failed');
    resolve();
    await success;
    expect(reactiveStore.getSaveStatus().state).toBe('error');
  });
  it('shares one seed attempt and does not reseed after initialized', async () => {
    invoke.mockImplementation(async (command) =>
      command === 'config_get'
        ? { ...config, workbench: { ...config.workbench, initialized: false } }
        : command === 'config_update'
          ? config
          : [],
    );
    const first = checkAndSeedInitialData();
    const second = checkAndSeedInitialData();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(invoke.mock.calls.filter(([command]) => command === 'records_batch')).toHaveLength(1);
    invoke.mockResolvedValue(config);
    expect(await checkAndSeedInitialData()).toBe(false);
  });
  it('does not seed a workspace with existing notes', async () => {
    invoke.mockImplementation(async (command, args) =>
      command === 'config_get'
        ? { ...config, workbench: { ...config.workbench, initialized: false } }
        : command === 'config_update'
          ? config
          : (args?.request as RecordQuery)?.collection === 'notes'
            ? [task()]
            : [],
    );
    expect(await checkAndSeedInitialData()).toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === 'records_batch')).toBe(false);
  });
  it('writes habit and calendar data without leaking envelope fields into RecordData', async () => {
    invoke.mockResolvedValue([task()]);
    await workbench.habits.toggle(
      {
        ...task('habit'),
        collection: 'habits',
        payload: { title: '阅读', logs: {}, targetFrequency: 1 },
      },
      '2026-10-30',
    );
    const first = invoke.mock.calls[0]?.[1]?.request as { operations: Array<{ data: unknown }> };
    expect(first.operations[0]?.data).not.toHaveProperty('id');
    expect(first.operations[0]?.data).toMatchObject({ payload: { logs: { '2026-10-30': true } } });
    invoke.mockClear();
    await expect(
      workbench.calendar.create({
        title: '无效日程',
        startDate: '2026-10-30',
        endDate: '2026-10-29',
        startTime: '10:00',
        endTime: '11:00',
      }),
    ).rejects.toThrow('结束时间');
    expect(invoke).not.toHaveBeenCalled();
  });
  it('moves quadrant without silently rescheduling the task', () => {
    const original = task('a', { dueDate: '2026-10-01' });
    const [operation] = buildUpdateTaskOperations(original, { priority: 'P1', quadrant: 'q2' });
    expect(operation).toMatchObject({
      expectedUpdatedAt: 2,
      data: { payload: { dueDate: '2026-10-01' } },
    });
    expect(getTaskQuadrant({ ...original, payload: { ...original.payload, quadrant: 'q2' } })).toBe(
      'q2',
    );
  });
});
describe('reactive hooks', () => {
  it('does not repeat an unchanged search and refreshes on collection events', async () => {
    invoke.mockResolvedValue({ records: [task()], assets: [] });
    const { result, rerender } = renderHook(() => useGlobalSearch('示例'));
    await waitFor(() => expect(result.current.results).toHaveLength(1));
    const count = invoke.mock.calls.length;
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(invoke).toHaveBeenCalledTimes(count);
    act(() => emit('workbench://records-changed', ['tasks']));
    await waitFor(() => expect(invoke.mock.calls.length).toBeGreaterThan(count));
  });
  it('ignores old query responses after collection changes', async () => {
    let resolveOld!: (value: unknown) => void;
    invoke.mockImplementation(async (_command, args) =>
      (args?.request as RecordQuery).collection === 'old'
        ? new Promise((resolve) => {
            resolveOld = resolve;
          })
        : [task('new')],
    );
    const { result, rerender } = renderHook(({ collection }) => useRecords(collection), {
      initialProps: { collection: 'old' },
    });
    await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
    rerender({ collection: 'new' });
    await waitFor(() => expect(result.current.data[0]?.id).toBe('new'));
    await act(async () => {
      resolveOld([task('old')]);
    });
    expect(result.current.data[0]?.id).toBe('new');
  });
  it('receives window updates immediately without polling', async () => {
    const initial = {
      mode: 'sidebar',
      width: 360,
      height: 800,
      maximized: false,
      minimized: false,
      visible: true,
    };
    invoke.mockResolvedValue(initial);
    const { result, unmount } = renderHook(useWindowState);
    await waitFor(() => expect(result.current.state?.maximized).toBe(false));
    act(() => emit('workbench://window-changed', { ...initial, maximized: true }));
    expect(result.current.state?.maximized).toBe(true);
    unmount();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
