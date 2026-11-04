import React from 'react';
import type { RecordItem, TaskPayload } from '../../sdk/types';
import { isOverdue } from '../../sdk/tasks';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface ListViewProps {
  tasks: RecordItem<TaskPayload>[];
  onToggleComplete: (task: RecordItem<TaskPayload>) => Promise<void>;
  onSnooze: (task: RecordItem<TaskPayload>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onToggleSubtask?: (
    task: RecordItem<TaskPayload>,
    subtaskId: string,
    completed: boolean,
  ) => Promise<void>;
}

export const ListView: React.FC<ListViewProps> = ({
  tasks,
  onToggleComplete,
  onSnooze,
  onDelete,
  onToggleSubtask,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="fa-inbox" />
        <span>暂无待办事项，点击右上角新建开启高效一日</span>
      </div>
    );
  }

  return (
    <div className="task-list">
      {tasks.map((task) => {
        const overdue = isOverdue(task);
        const subtasks = task.payload.subtasks || [];
        const completedSubtasks = subtasks.filter((s) => s.completed).length;

        return (
          <div
            key={task.id}
            className={
              'task-item' +
              (overdue ? ' is-overdue' : '') +
              (task.payload.completed ? ' is-done' : '')
            }
          >
            <div className="task-row-header task-main">
              {/* Left check and title */}
              <input
                type="checkbox"
                aria-label={'完成 ' + task.payload.title}
                checked={task.payload.completed}
                onChange={() => void onToggleComplete(task)}
                style={{ width: '14px', height: '14px' }}
              />

              <span className="task-title truncate">{task.payload.title}</span>

              <Badge variant={task.payload.priority.toLowerCase() as 'p0' | 'p1' | 'p2'}>
                {task.payload.priority}
              </Badge>

              {overdue && <Badge variant="overdue">逾期</Badge>}

              {task.payload.snoozeCount > 0 && (
                <span className="task-meta" title="顺延次数">
                  <Icon name="fa-clock-rotate-left" />
                  {task.payload.snoozeCount}
                </span>
              )}

              {/* Right meta and actions */}
              <div className="task-actions">
                {task.payload.dueDate && (
                  <span className={'task-meta' + (overdue ? ' overdue' : '')}>
                    <Icon name="fa-calendar-day" />
                    {task.payload.dueDate}
                  </span>
                )}

                {!task.payload.completed && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void onSnooze(task)}
                    title="顺延至明天"
                    aria-label="顺延至明天"
                  >
                    <Icon name="fa-clock-rotate-left" />
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void onDelete(task.id)}
                  title="删除"
                  aria-label="删除待办"
                >
                  <Icon name="fa-trash-can" />
                </Button>
              </div>
            </div>

            {/* Subtasks row if present */}
            {subtasks.length > 0 && (
              <div className="task-subtasks">
                <span className="task-subtasks-label">
                  子步骤 {completedSubtasks}/{subtasks.length}
                </span>
                {subtasks.map((sub) => (
                  <label
                    key={sub.id}
                    className={'task-subtask' + (sub.completed ? ' is-done' : '')}
                  >
                    <input
                      type="checkbox"
                      checked={sub.completed}
                      onChange={(e) => void onToggleSubtask?.(task, sub.id, e.target.checked)}
                    />
                    <span>{sub.title}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
