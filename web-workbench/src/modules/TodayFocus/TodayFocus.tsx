import React from 'react';
import {
  useRecords,
  useAction,
  workbench,
  isOverdue,
  isDueToday,
  isDueWithinDays,
  formatDate,
  type RecordItem,
  type TaskPayload,
} from '../../sdk';
import { Button } from '../../ui/primitives/Button';
import { Icon } from '../../ui/icons/Icon';

export const TodayFocus: React.FC = () => {
  const action = useAction();
  const { data: tasks, loading, error: loadError } = useRecords<TaskPayload>('tasks');
  const todayStr = formatDate(new Date());
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date().getDay()];

  // Aggregate active tasks into overdue, today, and next 3 days
  const overdueTasks = tasks.filter((t) => !t.payload.completed && isOverdue(t, todayStr));
  const todayTasks = tasks.filter((t) => !t.payload.completed && isDueToday(t, todayStr));
  const upcomingTasks = tasks.filter(
    (t) => !t.payload.completed && isDueWithinDays(t, 3, todayStr),
  );

  const totalFocusCount = overdueTasks.length + todayTasks.length + upcomingTasks.length;

  const handleComplete = async (task: RecordItem<TaskPayload>) => {
    await action.run(() => workbench.tasks.complete(task));
  };

  const handleSnooze = async (task: RecordItem<TaskPayload>) => {
    await action.run(() => workbench.tasks.snooze(task, 1));
  };

  if (loading) {
    return (
      <div className="panel hero-panel">
        <p className="panel-sub">正在加载今日聚焦...</p>
      </div>
    );
  }

  return (
    <section id="module-focus" className="module-container panel hero-panel">
      {(loadError || action.error) && <p role="alert">{loadError?.message || action.error}</p>}

      <div className="hero-figure">
        <span className="hero-kicker">
          <b>01</b> Focus / 今日聚焦
        </span>
        <span className="hero-number">
          {String(totalFocusCount).padStart(2, '0')}
          <sup>Items</sup>
        </span>
        <span className="hero-caption">逾期 · 今日 · 临近</span>
        <span className="hero-date">
          {todayStr} / {weekday}
        </span>
        <div className="hero-stats">
          <span className={overdueTasks.length > 0 ? 'is-alert' : ''}>
            <em>{String(overdueTasks.length).padStart(2, '0')}</em>
            逾期
          </span>
          <span>
            <em>{String(todayTasks.length).padStart(2, '0')}</em>
            今日
          </span>
          <span>
            <em>{String(upcomingTasks.length).padStart(2, '0')}</em>
            临近
          </span>
        </div>
      </div>

      <div className="hero-body">
        <header className="hero-head">
          <div>
            <h3 className="panel-title">今日聚焦</h3>
            <p className="panel-sub">置顶聚合已逾期与临近事项，逐项收敛</p>
          </div>
          {overdueTasks.length > 0 ? (
            <span className="status-chip danger">
              <Icon name="fa-triangle-exclamation" />
              {overdueTasks.length} 项逾期
            </span>
          ) : (
            <span className="status-chip ok">
              <Icon name="fa-circle-check" />
              状态极佳
            </span>
          )}
        </header>

        {totalFocusCount === 0 ? (
          <div className="focus-empty">
            <Icon name="fa-feather" />
            <span>当前没有逾期或临近截止事项，保持这份节奏。</span>
          </div>
        ) : (
          <div>
            {/* Overdue Section */}
            {overdueTasks.length > 0 && (
              <div className="focus-group">
                <div className="focus-group-title alert">
                  <span>已逾期事项</span> <b>{overdueTasks.length}</b>
                </div>
                {overdueTasks.map((t) =>
                  renderFocusItem(t, 'overdue', handleComplete, handleSnooze),
                )}
              </div>
            )}

            {/* Today Section */}
            {todayTasks.length > 0 && (
              <div className="focus-group">
                <div className="focus-group-title">
                  <span>今日到期</span> <b>{todayTasks.length}</b>
                </div>
                {todayTasks.map((t) => renderFocusItem(t, 'today', handleComplete, handleSnooze))}
              </div>
            )}

            {/* Upcoming Section */}
            {upcomingTasks.length > 0 && (
              <div className="focus-group">
                <div className="focus-group-title">
                  <span>3天内临近到期</span> <b>{upcomingTasks.length}</b>
                </div>
                {upcomingTasks.map((t) =>
                  renderFocusItem(t, 'upcoming', handleComplete, handleSnooze),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

function renderFocusItem(
  task: RecordItem<TaskPayload>,
  category: 'overdue' | 'today' | 'upcoming',
  onComplete: (t: RecordItem<TaskPayload>) => Promise<void>,
  onSnooze: (t: RecordItem<TaskPayload>) => Promise<void>,
) {
  const isOver = category === 'overdue';
  const subtasks = task.payload.subtasks || [];
  const completedSubtasks = subtasks.filter((s) => s.completed).length;

  return (
    <article key={task.id} className={'focus-row' + (isOver ? ' is-overdue' : '')}>
      <span className="priority-mark" data-priority={task.payload.priority}>
        {task.payload.priority}
      </span>

      <div className="focus-main">
        <span className="focus-title truncate">{task.payload.title}</span>

        {subtasks.length > 0 && (
          <span className="focus-meta">
            {completedSubtasks}/{subtasks.length} 子步骤
          </span>
        )}

        {task.payload.snoozeCount > 0 && (
          <span className="focus-meta warn">
            <Icon name="fa-clock-rotate-left" /> 顺延 {task.payload.snoozeCount} 次
          </span>
        )}
      </div>

      <span className="focus-date">{task.payload.dueDate}</span>

      <div className="focus-actions">
        <Button size="sm" variant="ghost" onClick={() => void onSnooze(task)} title="推迟1天">
          <Icon name="fa-clock-rotate-left" />
          <span>顺延</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="focus-complete"
          onClick={() => void onComplete(task)}
          title="标记完成"
        >
          <Icon name="fa-check" />
          <span>完成</span>
        </Button>
      </div>
    </article>
  );
}
