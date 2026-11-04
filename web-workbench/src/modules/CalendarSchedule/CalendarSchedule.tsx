import React, { useState } from 'react';
import {
  useRecords,
  useAction,
  workbench,
  formatDate,
  detectEventConflicts,
  type ScheduleEventPayload,
  type TaskPayload,
} from '../../sdk';
import { CalendarView } from '../../ui/calendar/CalendarView';
import { Button } from '../../ui/primitives/Button';
import { Dialog } from '../../ui/primitives/Dialog';
import { Input } from '../../ui/primitives/Input';
import { Badge } from '../../ui/primitives/Badge';
import { Icon } from '../../ui/icons/Icon';

export const CalendarSchedule: React.FC = () => {
  const action = useAction();
  const { data: tasks, error: tasksError } = useRecords<TaskPayload>('tasks');
  const { data: events, loading, error: loadError } = useRecords<ScheduleEventPayload>('events');

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState(formatDate(new Date()));
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newEndDate, setNewEndDate] = useState(formatDate(new Date()));
  const [newEndTime, setNewEndTime] = useState('10:00');
  const [newCategory, setNewCategory] = useState('会议');

  // Detect conflicts
  const conflicts = detectEventConflicts(events);

  const handleCreateEvent = async () => {
    if (!newTitle.trim()) return;

    const payload: ScheduleEventPayload = {
      title: newTitle.trim(),
      startDate: newStartDate,
      startTime: newStartTime,
      endDate: newEndDate,
      endTime: newEndTime,
      category: newCategory,
      allDay: false,
    };
    await workbench.calendar.create(payload);

    setNewTitle('');
    setCreateOpen(false);
  };

  const handleRescheduleTask = async (taskId: string, newDueDate: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    await workbench.tasks.update(task, { dueDate: newDueDate });
  };
  const handleRescheduleEvent = async (id: string, patch: Partial<ScheduleEventPayload>) => {
    const event = events.find((item) => item.id === id);
    if (!event) return;
    await workbench.calendar.reschedule(event, patch);
  };

  return (
    <div id="module-events" className="module-container panel">
      {(loadError || tasksError || action.error) && (
        <p role="alert">{loadError?.message || tasksError?.message || action.error}</p>
      )}

      {/* Header */}
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-index">03</span>
          <div>
            <h3 className="panel-title">
              <Icon name="fa-calendar-days" />
              日历排程
            </h3>
            <p className="panel-sub">叠加待办与日程事件，支持拖拽改期与冲突校验</p>
          </div>
        </div>

        <div className="panel-actions">
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Icon name="fa-plus" />
            新建日程
          </Button>
        </div>
      </header>

      {/* Conflict Alert Banner if any */}
      {conflicts.length > 0 && conflicts[0] && (
        <div className="conflict-banner">
          <span>
            <Icon name="fa-triangle-exclamation" /> 检测到 {conflicts.length} 处日程时间冲突：
            {conflicts[0].event1.payload.title} 与 {conflicts[0].event2.payload.title}
          </span>
          <Badge variant="p1">重叠 {conflicts[0].overlapMinutes} 分钟</Badge>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <Icon name="fa-circle-notch" />
          正在加载日程...
        </div>
      ) : (
        <CalendarView
          tasks={tasks}
          events={events}
          onRescheduleTask={handleRescheduleTask}
          onRescheduleEvent={handleRescheduleEvent}
        />
      )}

      {/* Create Event Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建日程事件"
        description="设定起止日期与时间，自动校验时间冲突"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={action.pending}
              onClick={() => void action.run(handleCreateEvent)}
            >
              创建日程
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-field">
            <label>日程标题 *</label>
            <Input
              placeholder="输入日程或会议名称..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-pair">
            <div className="form-field">
              <label>开始日期</label>
              <Input
                type="date"
                value={newStartDate}
                onChange={(e) => setNewStartDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>开始时间</label>
              <Input
                type="time"
                value={newStartTime}
                onChange={(e) => setNewStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-pair">
            <div className="form-field">
              <label>结束日期</label>
              <Input
                type="date"
                value={newEndDate}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>结束时间</label>
              <Input
                type="time"
                value={newEndTime}
                onChange={(e) => setNewEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label>分类标签</label>
            <Input
              placeholder="例如: 会议, 评审, 专注, 运动"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};
