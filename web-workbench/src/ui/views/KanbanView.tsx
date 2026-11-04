import React from 'react';
import type { RecordItem, TaskPayload } from '../../sdk/types';
import { isOverdue } from '../../sdk/tasks';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface KanbanColumn {
  id: string;
  title: string;
  filter: (task: RecordItem<TaskPayload>) => boolean;
  onDropTask?: (task: RecordItem<TaskPayload>) => Promise<void>;
}

export interface KanbanViewProps {
  tasks: RecordItem<TaskPayload>[];
  columns?: KanbanColumn[];
  onToggleComplete: (task: RecordItem<TaskPayload>) => Promise<void>;
  onSnooze: (task: RecordItem<TaskPayload>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onMoveToPriority?: (task: RecordItem<TaskPayload>, priority: 'P0' | 'P1' | 'P2') => Promise<void>;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  tasks,
  columns,
  onToggleComplete,
  onSnooze,
  onDelete,
  onMoveToPriority,
}) => {
  // Default columns: P0 紧急, P1 高优, P2 普通, 已完成
  const defaultColumns: KanbanColumn[] = [
    {
      id: 'P0',
      title: 'P0 · 极高优 / 紧急',
      filter: (t) => !t.payload.completed && t.payload.priority === 'P0',
      onDropTask: async (t) => {
        if (onMoveToPriority) await onMoveToPriority(t, 'P0');
      },
    },
    {
      id: 'P1',
      title: 'P1 · 高优先级',
      filter: (t) => !t.payload.completed && t.payload.priority === 'P1',
      onDropTask: async (t) => {
        if (onMoveToPriority) await onMoveToPriority(t, 'P1');
      },
    },
    {
      id: 'P2',
      title: 'P2 · 日常 / 普通',
      filter: (t) => !t.payload.completed && t.payload.priority === 'P2',
      onDropTask: async (t) => {
        if (onMoveToPriority) await onMoveToPriority(t, 'P2');
      },
    },
    {
      id: 'done',
      title: '已完成归档',
      filter: (t) => t.payload.completed,
      onDropTask: async (t) => {
        if (!t.payload.completed) await onToggleComplete(t);
      },
    },
  ];

  const activeColumns = columns || defaultColumns;

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, col: KanbanColumn) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => t.id === taskId);
    if (task && col.onDropTask) {
      await col.onDropTask(task);
    }
  };

  return (
    <div className="kanban-board visible-scrollbar">
      {activeColumns.map((col) => {
        const colTasks = tasks.filter(col.filter);

        return (
          <div
            key={col.id}
            className="kanban-col"
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, col)}
          >
            {/* Column Header */}
            <div className="kanban-col-head">
              <strong>{col.title}</strong>
              <Badge variant="neutral">{colTasks.length}</Badge>
            </div>

            {/* Column Cards */}
            <div className="kanban-cards visible-scrollbar">
              {colTasks.length === 0 ? (
                <div className="kanban-empty">可将任务拖拽至此处</div>
              ) : (
                colTasks.map((task) => {
                  const overdue = isOverdue(task);

                  return (
                    <div
                      key={task.id}
                      className={'kanban-card' + (overdue ? ' is-overdue' : '')}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 500,
                            color: task.payload.completed
                              ? 'var(--text-muted)'
                              : 'var(--text-primary)',
                            textDecoration: task.payload.completed ? 'line-through' : 'none',
                          }}
                        >
                          {task.payload.title}
                        </span>

                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void onDelete(task.id)}
                          title="删除"
                          aria-label="删除待办"
                          style={{ width: '20px', height: '20px' }}
                        >
                          <Icon name="fa-xmark" />
                        </Button>
                      </div>

                      {task.payload.dueDate && (
                        <div
                          className="task-meta"
                          style={{
                            color: overdue ? 'var(--color-overdue)' : 'var(--text-muted)',
                          }}
                        >
                          <Icon name="fa-calendar-day" />
                          {task.payload.dueDate}
                        </div>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '4px',
                          borderTop: '1px solid var(--border-subtle)',
                          paddingTop: '6px',
                        }}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void onToggleComplete(task)}
                          style={{ padding: '2px 6px', fontSize: '10px' }}
                        >
                          {task.payload.completed ? '撤销' : '完成'}
                        </Button>

                        {!task.payload.completed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void onSnooze(task)}
                            style={{ padding: '2px 6px', fontSize: '10px' }}
                          >
                            +1天
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
