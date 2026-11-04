import React from 'react';
import type { RecordItem, TaskPayload } from '../../sdk/types';
import { isOverdue } from '../../sdk/tasks';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface CardViewProps {
  tasks: RecordItem<TaskPayload>[];
  onToggleComplete: (task: RecordItem<TaskPayload>) => Promise<void>;
  onSnooze: (task: RecordItem<TaskPayload>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
}

export const CardView: React.FC<CardViewProps> = ({
  tasks,
  onToggleComplete,
  onSnooze,
  onDelete,
}) => {
  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="fa-clone" />
        暂无卡片数据
      </div>
    );
  }

  return (
    <div className="card-grid">
      {tasks.map((task) => {
        const overdue = isOverdue(task);
        const subtasks = task.payload.subtasks || [];
        const completedCount = subtasks.filter((s) => s.completed).length;

        return (
          <article
            key={task.id}
            className={
              'task-card' +
              (overdue ? ' is-overdue' : '') +
              (task.payload.completed ? ' is-done' : '')
            }
          >
            <div>
              <div className="task-card-head">
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  <Badge variant={task.payload.priority.toLowerCase() as 'p0' | 'p1' | 'p2'}>
                    {task.payload.priority}
                  </Badge>
                  {overdue && <Badge variant="overdue">逾期</Badge>}
                  {task.payload.recurRule && (
                    <Badge variant="neutral">
                      <Icon name="fa-rotate" /> {task.payload.recurRule.type}
                    </Badge>
                  )}
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => void onDelete(task.id)}
                  title="删除"
                  aria-label="删除待办"
                >
                  <Icon name="fa-xmark" />
                </Button>
              </div>

              <h4>{task.payload.title}</h4>

              {task.payload.notes && <p>{task.payload.notes}</p>}
            </div>

            <div>
              {subtasks.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '9px',
                      letterSpacing: '0.08em',
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                    }}
                  >
                    <span>子任务进度</span>
                    <span>
                      {completedCount}/{subtasks.length}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${(completedCount / subtasks.length) * 100}%` }} />
                  </div>
                </div>
              )}

              <div className="task-card-foot">
                <span>
                  <Icon name="fa-calendar-day" /> {task.payload.dueDate || '无日期'}
                </span>
                <div style={{ display: 'flex', gap: '2px' }}>
                  {!task.payload.completed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void onSnooze(task)}
                      title="推迟一天"
                    >
                      <Icon name="fa-clock-rotate-left" />
                      顺延
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={task.payload.completed ? 'ghost' : 'primary'}
                    onClick={() => void onToggleComplete(task)}
                  >
                    {task.payload.completed ? '撤销' : '完成'}
                  </Button>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};
