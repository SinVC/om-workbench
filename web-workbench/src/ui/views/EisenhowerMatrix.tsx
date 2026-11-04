import React from 'react';
import type { RecordItem, TaskPayload } from '../../sdk/types';
import { isOverdue, getTaskQuadrant } from '../../sdk/tasks';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface EisenhowerMatrixProps {
  tasks: RecordItem<TaskPayload>[];
  onToggleComplete: (task: RecordItem<TaskPayload>) => Promise<void>;
  onSnooze: (task: RecordItem<TaskPayload>) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onChangeQuadrant?: (
    task: RecordItem<TaskPayload>,
    quadrant: 'q1' | 'q2' | 'q3' | 'q4',
  ) => Promise<void>;
}

export const EisenhowerMatrix: React.FC<EisenhowerMatrixProps> = ({
  tasks,
  onToggleComplete,
  onSnooze,
  onDelete,
  onChangeQuadrant,
}) => {
  const activeTasks = tasks.filter((task) => !task.payload.completed);
  const q1Tasks = activeTasks.filter((task) => getTaskQuadrant(task) === 'q1');
  const q2Tasks = activeTasks.filter((task) => getTaskQuadrant(task) === 'q2');
  const q3Tasks = activeTasks.filter((task) => getTaskQuadrant(task) === 'q3');
  const q4Tasks = activeTasks.filter((task) => getTaskQuadrant(task) === 'q4');

  const quadrants = [
    {
      id: 'q1' as const,
      title: '第一象限 · 重要且紧急 (立即处理)',
      tasks: q1Tasks,
      badge: 'p0' as const,
    },
    {
      id: 'q2' as const,
      title: '第二象限 · 重要不紧急 (排期专注)',
      tasks: q2Tasks,
      badge: 'p1' as const,
    },
    {
      id: 'q3' as const,
      title: '第三象限 · 紧急不重要 (快速授权/清空)',
      tasks: q3Tasks,
      badge: 'p2' as const,
    },
    {
      id: 'q4' as const,
      title: '第四象限 · 不重要不紧急 (适度裁剪)',
      tasks: q4Tasks,
      badge: 'neutral' as const,
    },
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, qId: 'q1' | 'q2' | 'q3' | 'q4') => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => t.id === taskId);
    if (task && onChangeQuadrant) {
      await onChangeQuadrant(task, qId);
    }
  };

  return (
    <div className="matrix-grid">
      {quadrants.map((quad) => (
        <div
          key={quad.id}
          className="matrix-cell"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, quad.id)}
        >
          {/* Quadrant Header */}
          <h4>
            <span>{quad.title}</span>
            <Badge variant={quad.badge}>{quad.tasks.length}</Badge>
          </h4>

          {/* Quadrant Content */}
          <div className="visible-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {quad.tasks.length === 0 ? (
              <div
                style={{
                  padding: '20px 0',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                此象限暂无待办
              </div>
            ) : (
              quad.tasks.map((task) => {
                const overdue = isOverdue(task);

                return (
                  <div
                    key={task.id}
                    className="matrix-task"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', task.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        className="truncate"
                        style={{ fontWeight: 500, color: 'var(--text-primary)' }}
                      >
                        {task.payload.title}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '9px',
                          color: overdue ? 'var(--color-overdue)' : 'var(--text-muted)',
                          marginTop: '2px',
                        }}
                      >
                        {task.payload.dueDate || '无截止日'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0', flexShrink: 0 }}>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void onSnooze(task)}
                        title="顺延"
                        aria-label="顺延"
                        style={{ width: '22px', height: '22px' }}
                      >
                        <Icon name="fa-clock-rotate-left" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void onToggleComplete(task)}
                        title="完成"
                        aria-label="完成"
                        style={{ width: '22px', height: '22px' }}
                      >
                        <Icon name="fa-check" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void onDelete(task.id)}
                        title="删除"
                        aria-label="删除待办"
                        style={{ width: '22px', height: '22px' }}
                      >
                        <Icon name="fa-xmark" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
