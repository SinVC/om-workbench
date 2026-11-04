import React from 'react';
import {
  useRecords,
  calculateHabitStreaks,
  calculateBudgetStatus,
  formatDate,
  addDays,
  type HabitPayload,
  type TaskPayload,
  type TransactionRecord,
} from '../../sdk';
import { MetricCard } from '../../ui/charts/MetricCard';
import { LineChart, type LineChartPoint } from '../../ui/charts/LineChart';
import { BarChart, type BarChartItem } from '../../ui/charts/BarChart';
import { ProgressRing } from '../../ui/charts/ProgressRing';
import { Icon } from '../../ui/icons/Icon';

export const MetricsDashboard: React.FC = () => {
  const { data: tasks, loading, error } = useRecords<TaskPayload>('tasks');
  const {
    data: habits,
    loading: habitsLoading,
    error: habitsError,
  } = useRecords<HabitPayload>('habits');
  const {
    data: transactions,
    loading: transactionsLoading,
    error: transactionsError,
  } = useRecords<TransactionRecord>('transactions');

  const todayStr = formatDate(new Date());

  // Task metrics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.payload.completed).length;
  const overdueTasks = tasks.filter(
    (t) => !t.payload.completed && t.payload.dueDate && t.payload.dueDate < todayStr,
  ).length;
  const totalSnoozeCount = tasks.reduce((sum, t) => sum + (t.payload.snoozeCount || 0), 0);
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Habit metrics: average 7-day rate
  let habitAvgRate = 0;
  if (habits.length > 0) {
    const sumRates = habits.reduce(
      (sum, h) => sum + calculateHabitStreaks(h, todayStr).completionRate7Days,
      0,
    );
    habitAvgRate = Math.round(sumRates / habits.length);
  }

  // Budget metric (default 5000 budget if empty)
  const budgetStatus = calculateBudgetStatus(5000, transactions);

  // 7-day completion trend data for LineChart
  const lineChartData: LineChartPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const dStr = addDays(todayStr, -i);
    const dayCompleted = tasks.filter((t) => {
      if (!t.payload.completed || !t.payload.completedAt) return false;
      return formatDate(new Date(t.payload.completedAt)) === dStr;
    }).length;
    lineChartData.push({
      label: dStr.slice(5),
      value: dayCompleted,
    });
  }

  // Tasks by priority for BarChart
  const p0Count = tasks.filter((t) => t.payload.priority === 'P0').length;
  const p1Count = tasks.filter((t) => t.payload.priority === 'P1').length;
  const p2Count = tasks.filter((t) => t.payload.priority === 'P2').length;

  const barChartData: BarChartItem[] = [
    { label: 'P0 极高优待办', value: p0Count, color: 'var(--color-p0)' },
    { label: 'P1 高优先级', value: p1Count, color: 'var(--color-p1)' },
    { label: 'P2 普通日常', value: p2Count, color: 'var(--color-p2)' },
  ];

  if (loading || habitsLoading || transactionsLoading)
    return (
      <div className="panel">
        <div className="empty-state">
          <Icon name="fa-circle-notch" />
          正在加载指标...
        </div>
      </div>
    );
  if (error || habitsError || transactionsError)
    return <p role="alert">{(error || habitsError || transactionsError)?.message}</p>;
  return (
    <div id="module-transactions" className="module-container panel">
      {/* Header */}
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-index">04</span>
          <div>
            <h3 className="panel-title">
              <Icon name="fa-chart-simple" />
              量化核算
            </h3>
            <p className="panel-sub">任务完成率、顺延统计、习惯坚持度及收支核算 · 实时</p>
          </div>
        </div>
      </header>

      {/* Metric Cards Row */}
      <div className="metric-strip">
        <MetricCard
          title="待办总完成率"
          value={completionRate}
          unit="%"
          changePeriod="较上周"
          variant="revenue"
          icon={<Icon name="fa-circle-check" />}
        />

        <MetricCard
          title="逾期滞留项"
          value={overdueTasks}
          unit="项"
          changePeriod="需尽快解决"
          variant={overdueTasks > 0 ? 'overdue' : 'default'}
          icon={<Icon name="fa-triangle-exclamation" />}
        />

        <MetricCard
          title="累计顺延次数"
          value={totalSnoozeCount}
          unit="次"
          changePeriod="推迟总量"
          icon={<Icon name="fa-clock-rotate-left" />}
        />

        <MetricCard
          title="7天习惯坚持度"
          value={habitAvgRate}
          unit="%"
          variant="revenue"
          icon={<Icon name="fa-seedling" />}
        />

        <MetricCard
          title="月度可用预算"
          value={`¥${budgetStatus.remainingBudget}`}
          changePeriod={`日均可花 ¥${budgetStatus.dailyAvailableBudget}`}
          icon={<Icon name="fa-wallet" />}
        />
      </div>

      {/* Visual Charts Grid */}
      <div className="charts-grid">
        {/* Line Chart */}
        <div className="chart-block">
          <div className="chart-block-head">
            <span className="chart-label">Completion Trend · 最近 7 天</span>
            <span className="chart-legend">
              <span
                style={{
                  width: '14px',
                  height: '1px',
                  background: 'var(--text-primary)',
                  display: 'inline-block',
                }}
              />
              每日完成
            </span>
          </div>
          <LineChart data={lineChartData} height={132} />
        </div>

        {/* Bar Chart & Progress Rings */}
        <div className="chart-block">
          <div className="chart-block-head">
            <span className="chart-label">Priority Mix · 优先级结构</span>
          </div>

          <BarChart data={barChartData} />

          <div className="ring-row">
            <ProgressRing
              progress={completionRate}
              size={64}
              strokeWidth={2}
              color="var(--text-primary)"
              label="任务达成"
            />
            <ProgressRing
              progress={habitAvgRate}
              size={64}
              strokeWidth={2}
              color="var(--color-revenue)"
              label="习惯坚持"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
