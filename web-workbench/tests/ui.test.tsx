import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type ColumnDef } from '../src/ui/table/DataTable';
import { QuickNotes } from '../src/modules/QuickNotes/QuickNotes';
import * as imageTools from '../src/ui/media/imageOptimizer';
import { CalendarView } from '../src/ui/calendar/CalendarView';
import { TodayFocus } from '../src/modules/TodayFocus/TodayFocus';
import { TodoList } from '../src/modules/TodoList/TodoList';
import { exportStaticHtmlSnapshot } from '../src/ui/export/exportUtils';
import { detectEventConflicts, validateScheduleEvent, buildMonthMatrix } from '../src/sdk/calendar';
import { optimizeImageFile, validateImageCount } from '../src/ui/media/imageOptimizer';
import type { RecordItem, ScheduleEventPayload, TaskPayload } from '../src/sdk/types';
import { formatDate } from '../src/sdk/tasks';
import { invoke, emit } from './setup';
import { task } from './fixtures';

beforeEach(() => {
  invoke.mockReset();
});
describe('view regressions', () => {
  it('edits a custom-rendered cell and combines two column filters', async () => {
    const columns: ColumnDef<TaskPayload>[] = [
      {
        key: 'title',
        header: '标题',
        editable: true,
        render: (record) => <span>{record.payload.title}</span>,
      },
      {
        key: 'dueDate',
        header: '日期',
        editable: true,
        render: (record) => <span>{record.payload.dueDate}</span>,
      },
    ];
    const update = vi.fn().mockResolvedValue(undefined);
    const { container } = render(
      <DataTable
        records={[task('1'), task('2', { title: '第二条', dueDate: '2026-10-31' })]}
        columns={columns}
        onUpdateRecord={update}
      />,
    );
    const desktop = within(container.querySelector('.table-desktop')!);
    await userEvent.click(desktop.getAllByRole('button', { name: '编辑' })[0]!);
    await userEvent.clear(desktop.getByLabelText('标题'));
    await userEvent.type(desktop.getByLabelText('标题'), '新标题');
    await userEvent.click(desktop.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('1', { title: '新标题' }));
    await userEvent.type(screen.getByLabelText('筛选标题'), '第二');
    await userEvent.type(screen.getByLabelText('筛选日期'), '10-31');
    expect(desktop.queryByText('示例待办')).toBeNull();
    expect(desktop.getByText('第二条')).toBeTruthy();
  });
  it('moves completed kanban cards with one version-checked write', async () => {
    invoke.mockImplementation(async (command) =>
      command === 'records_query' ? [task('done', { completed: true })] : [task('done')],
    );
    render(<TodoList />);
    await screen.findByText('示例待办');
    await userEvent.click(screen.getByRole('button', { name: /看板/ }));
    const column = screen.getByText('P1 · 高优先级').parentElement!.parentElement!;
    fireEvent.drop(column, { dataTransfer: { getData: () => 'done' } });
    await waitFor(() =>
      expect(invoke.mock.calls.filter(([command]) => command === 'records_batch')).toHaveLength(1),
    );
    const write = invoke.mock.calls.find(([command]) => command === 'records_batch');
    expect(write?.[1]?.request).toMatchObject({
      operations: [
        {
          type: 'update',
          expectedUpdatedAt: 2,
          data: { payload: { completed: false, priority: 'P1' } },
        },
      ],
    });
  });
  it('renders the installed calendar engine in a wide container', async () => {
    const previous = globalThis.ResizeObserver;
    class WideObserver implements ResizeObserver {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        queueMicrotask(() =>
          this.callback(
            [
              {
                target,
                contentRect: new DOMRectReadOnly(0, 0, 900, 600),
                borderBoxSize: [],
                contentBoxSize: [],
                devicePixelContentBoxSize: [],
              },
            ],
            this,
          ),
        );
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', WideObserver);
    const { unmount } = render(<CalendarView tasks={[task()]} />);
    try {
      await screen.findByRole('button', { name: '上月' });
      await userEvent.click(screen.getByRole('tab', { name: /周/ }));
      await userEvent.click(screen.getByRole('tab', { name: /^日/ }));
    } finally {
      unmount();
      vi.stubGlobal('ResizeObserver', previous);
    }
  });
  it('shows event content in compact mode and lets users choose another day', async () => {
    const today = formatDate(new Date());
    const event: RecordItem<ScheduleEventPayload> = {
      ...task(),
      collection: 'events',
      payload: {
        title: '跨日会议',
        startDate: today,
        endDate: '2099-12-31',
        startTime: '23:00',
        endTime: '01:00',
      },
    };
    render(<CalendarView tasks={[]} events={[event]} />);
    expect(screen.getByText(/跨日会议/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('查看日期'), { target: { value: '2099-12-30' } });
    expect(screen.getByText(/2099-12-30 ·/)).toBeTruthy();
    expect(screen.getByText(/跨日会议/)).toBeTruthy();
  });
  it('refreshes focus and todo projections after completing a recurring task', async () => {
    const today = formatDate(new Date());
    const original = task('recurring', { dueDate: today, recurRule: { type: 'daily' } });
    let records = [original];
    invoke.mockImplementation(async (command, args) => {
      if (command === 'records_query') return records;
      const request = args?.request as {
        operations: Array<{ type: string; data: { payload: TaskPayload } }>;
      };
      const completed = request.operations[0]!.data.payload;
      const next = request.operations[1]!.data.payload;
      records = [
        { ...original, payload: completed },
        { ...original, id: 'next', payload: next },
      ];
      queueMicrotask(() => emit('workbench://records-changed', ['tasks']));
      return records;
    });
    const { container } = render(
      <>
        <TodayFocus />
        <TodoList />
      </>,
    );
    await screen.findByText('今日到期');
    const focus = within(container.querySelector('#module-focus')!);
    await userEvent.click(focus.getByRole('button', { name: '完成' }));
    await waitFor(() => expect(focus.queryByText('今日到期')).toBeNull());
    expect(focus.getByText('3天内临近到期')).toBeTruthy();
    expect(container.querySelector('#module-tasks')?.textContent).toContain(
      '共 2 项（已完成 1 项）',
    );
  });
  it('releases uploaded draft images when creation is cancelled', async () => {
    vi.spyOn(imageTools, 'optimizeImageFile').mockResolvedValue({
      bytes: new Uint8Array([1]),
      width: 1,
      height: 1,
      mime: 'image/png',
      fileName: 'image.png',
    });
    invoke.mockImplementation(async (command) =>
      command === 'records_query'
        ? []
        : command === 'assets_import' || command === 'assets_get'
          ? { id: 'draft-image', url: 'data:image/png;base64,AA==' }
          : undefined,
    );
    const { container } = render(<QuickNotes />);
    await userEvent.click(screen.getByRole('button', { name: /记录灵感/ }));
    const input = container.ownerDocument.querySelector('input[type="file"]')!;
    await userEvent.upload(
      input as HTMLInputElement,
      new File(['image'], 'image.png', { type: 'image/png' }),
    );
    await screen.findByRole('button', { name: '移除附件' });
    await userEvent.click(screen.getByRole('button', { name: '取消' }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('assets_delete', { request: { id: 'draft-image' } }),
    );
    expect(invoke.mock.calls.some(([command]) => command === 'records_batch')).toBe(false);
    vi.restoreAllMocks();
  });
  it('does not mask read failures as empty lists', async () => {
    invoke.mockRejectedValue({ code: 'DATABASE', message: '读取失败' });
    render(<TodoList />);
    expect((await screen.findByRole('alert')).textContent).toContain('读取失败');
  });
});
describe('exports, media and date boundaries', () => {
  it('escapes all snapshot text contexts including the document title', () => {
    let blob!: Blob;
    vi.stubGlobal('URL', {
      createObjectURL: (value: Blob) => {
        blob = value;
        return 'blob:test';
      },
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    exportStaticHtmlSnapshot('<script>title</script>', [
      {
        ...task(),
        collection: '<img src=x>',
        tags: ['<script>tag</script>'],
        payload: { title: '<script>item</script>', notes: '<img onerror=alert(1)>' },
      },
    ]);
    return new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const html = String(reader.result);
        const document = new DOMParser().parseFromString(html, 'text/html');
        expect(document.querySelector('script, img')).toBeNull();
        expect(document.title).toContain('<script>title</script>');
        expect(document.body.textContent).toContain('<script>item</script>');
        resolve();
      };
      reader.readAsText(blob);
    }).finally(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });
  });
  it('rejects an oversized attachment batch before import and releases small images without re-encoding', async () => {
    expect(() => validateImageCount(8, 2)).toThrow('9');
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 500, height: 250, close }),
    );
    const file = new File(['gif'], 'animated.gif', { type: 'image/gif' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('gif').buffer,
    });
    const result = await optimizeImageFile(file);
    expect(result.mime).toBe('image/gif');
    expect(close).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
  it('detects midnight overlap, expands cross-day events and rejects reversed intervals', () => {
    const first: RecordItem<ScheduleEventPayload> = {
      ...task(),
      payload: {
        title: '跨日',
        startDate: '2026-10-30',
        endDate: '2026-10-31',
        startTime: '23:00',
        endTime: '01:00',
      },
    };
    const second = {
      ...first,
      id: 'second',
      payload: { ...first.payload, startDate: '2026-10-31', startTime: '00:30', endTime: '00:45' },
    };
    expect(detectEventConflicts([first, second])[0]?.overlapMinutes).toBe(15);
    expect(
      buildMonthMatrix(2026, 9, [], [first])
        .flat()
        .find((cell) => cell.date === '2026-10-31')?.events,
    ).toHaveLength(1);
    expect(() => validateScheduleEvent({ ...first.payload, endDate: '2026-10-29' })).toThrow(
      '结束时间',
    );
  });
});
