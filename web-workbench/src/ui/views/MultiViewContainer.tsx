import React, { useState } from 'react';
import { useAction } from '../../sdk/hooks';
import type { RecordItem, TaskPayload } from '../../sdk/types';
import { Button } from '../primitives/Button';
import { ListView } from './ListView';
import { CardView } from './CardView';
import { KanbanView } from './KanbanView';
import { EisenhowerMatrix } from './EisenhowerMatrix';
import { CalendarView } from '../calendar/CalendarView';
import { DataTable, type ColumnDef } from '../table/DataTable';
import {
  copyTextToClipboard,
  exportRecordsToCSV,
  exportStaticHtmlSnapshot,
  triggerPrint,
} from '../export/exportUtils';
import { Badge } from '../primitives/Badge';
import { Icon } from '../icons/Icon';

export type ViewType = 'list' | 'cards' | 'kanban' | 'matrix' | 'calendar' | 'table';

export interface MultiViewContainerProps {
  tasks: RecordItem<TaskPayload>[];
  onToggleComplete: (task: RecordItem<TaskPayload>) => Promise<void>;
  onSnooze: (task: RecordItem<TaskPayload>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onToggleSubtask?: (
    task: RecordItem<TaskPayload>,
    subtaskId: string,
    completed: boolean,
  ) => Promise<void>;
  onUpdateTask?: (id: string, updatedPayload: Partial<TaskPayload>) => Promise<void>;
  onRescheduleTask?: (taskId: string, newDueDate: string) => Promise<void>;
  onChangeQuadrant?: (
    task: RecordItem<TaskPayload>,
    quadrant: 'q1' | 'q2' | 'q3' | 'q4',
  ) => Promise<void>;
  onMoveToPriority?: (task: RecordItem<TaskPayload>, priority: 'P0' | 'P1' | 'P2') => Promise<void>;
  initialView?: ViewType;
}

export const MultiViewContainer: React.FC<MultiViewContainerProps> = ({
  tasks,
  onToggleComplete,
  onSnooze,
  onDelete,
  onToggleSubtask,
  onUpdateTask,
  onRescheduleTask,
  onChangeQuadrant,
  onMoveToPriority,
  initialView = 'list',
}) => {
  const action = useAction();
  const [activeView, setActiveView] = useState<ViewType>(initialView);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const viewTabs: { id: ViewType; label: string; icon: string }[] = [
    { id: 'list', label: '列表', icon: 'fa-list-ul' },
    { id: 'cards', label: '卡片', icon: 'fa-table-cells-large' },
    { id: 'kanban', label: '看板', icon: 'fa-columns' },
    { id: 'matrix', label: '四象限', icon: 'fa-border-all' },
    { id: 'calendar', label: '日历', icon: 'fa-calendar-days' },
    { id: 'table', label: '表格', icon: 'fa-table' },
  ];

  const handleCopySummary = async () => {
    const text = tasks
      .map(
        (t) =>
          `${t.payload.completed ? '[✓]' : '[ ]'} [${t.payload.priority}] ${t.payload.title}${t.payload.dueDate ? ` (${t.payload.dueDate})` : ''}`,
      )
      .join('\n');
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    }
  };

  const tableColumns: ColumnDef<TaskPayload>[] = [
    {
      key: 'completed',
      header: '状态',
      width: '70px',
      render: (r) => (
        <input
          type="checkbox"
          checked={r.payload.completed}
          onChange={() => void onToggleComplete(r)}
          style={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      key: 'title',
      header: '待办标题',
      editable: true,
      render: (r) => (
        <span
          style={{
            textDecoration: r.payload.completed ? 'line-through' : 'none',
            color: r.payload.completed ? 'var(--text-muted)' : 'inherit',
          }}
        >
          {r.payload.title}
        </span>
      ),
    },
    {
      key: 'priority',
      header: '优先级',
      width: '90px',
      render: (r) => (
        <Badge variant={r.payload.priority.toLowerCase() as 'p0' | 'p1' | 'p2'}>
          {r.payload.priority}
        </Badge>
      ),
    },
    {
      key: 'dueDate',
      header: '截止日期',
      editable: true,
      width: '120px',
      render: (r) => <span>{r.payload.dueDate || '-'}</span>,
    },
    {
      key: 'snoozeCount',
      header: '顺延',
      width: '70px',
      render: (r) => <span>{r.payload.snoozeCount || 0}</span>,
    },
  ];

  return (
    <div className="task-view-wrap">
      {action.error && <p role="alert">{action.error}</p>}

      {/* View Switcher Header & Action Toolbar */}
      <div className="task-viewbar">
        {/* View Tabs */}
        <div className="view-tabs" aria-label="待办视图">
          {viewTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={activeView === tab.id}
              className={'view-tab' + (activeView === tab.id ? ' is-active' : '')}
              onClick={() => setActiveView(tab.id)}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Export / Quick Actions */}
        <div className="task-view-actions">
          <Button size="sm" variant="ghost" onClick={handleCopySummary} title="复制为文本">
            <Icon name={copiedNotice ? 'fa-check' : 'fa-copy'} />
            <span className="action-label">{copiedNotice ? '已复制' : '复制'}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportRecordsToCSV(tasks, 'tasks.csv')}
            title="导出 CSV"
          >
            <Icon name="fa-file-csv" />
            <span className="action-label">CSV</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportStaticHtmlSnapshot('待办清单快照', tasks, 'tasks_snapshot.html')}
            title="生成无编辑入口的离线快照"
          >
            <Icon name="fa-file-image" />
            <span className="action-label">快照</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={triggerPrint} title="打印">
            <Icon name="fa-print" />
          </Button>
        </div>
      </div>

      {/* Active View Projection */}
      <div>
        {activeView === 'list' && (
          <ListView
            tasks={tasks}
            onToggleComplete={(value) => action.run(() => onToggleComplete(value))}
            onSnooze={(value) => action.run(() => onSnooze(value))}
            onDelete={(value) => action.run(() => onDelete(value))}
            onToggleSubtask={
              onToggleSubtask
                ? (task, id, completed) => action.run(() => onToggleSubtask(task, id, completed))
                : undefined
            }
          />
        )}

        {activeView === 'cards' && (
          <CardView
            tasks={tasks}
            onToggleComplete={(value) => action.run(() => onToggleComplete(value))}
            onSnooze={(value) => action.run(() => onSnooze(value))}
            onDelete={(value) => action.run(() => onDelete(value))}
          />
        )}

        {activeView === 'kanban' && (
          <KanbanView
            tasks={tasks}
            onToggleComplete={(value) => action.run(() => onToggleComplete(value))}
            onSnooze={(value) => action.run(() => onSnooze(value))}
            onDelete={(value) => action.run(() => onDelete(value))}
            onMoveToPriority={
              onMoveToPriority
                ? (task, priority) => action.run(() => onMoveToPriority(task, priority))
                : undefined
            }
          />
        )}

        {activeView === 'matrix' && (
          <EisenhowerMatrix
            tasks={tasks}
            onToggleComplete={(value) => action.run(() => onToggleComplete(value))}
            onSnooze={(value) => action.run(() => onSnooze(value))}
            onDelete={(value) => action.run(() => onDelete(value))}
            onChangeQuadrant={
              onChangeQuadrant
                ? (task, quadrant) => action.run(() => onChangeQuadrant(task, quadrant))
                : undefined
            }
          />
        )}

        {activeView === 'calendar' && (
          <CalendarView tasks={tasks} onRescheduleTask={onRescheduleTask} />
        )}

        {activeView === 'table' && (
          <DataTable<TaskPayload>
            records={tasks}
            columns={tableColumns}
            onUpdateRecord={onUpdateTask}
          />
        )}
      </div>
    </div>
  );
};
