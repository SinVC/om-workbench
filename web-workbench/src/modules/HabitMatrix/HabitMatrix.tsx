import React, { useState } from 'react';
import {
  useRecords,
  useAction,
  workbench,
  formatDate,
  addDays,
  calculateHabitStreaks,
  buildAnnualHeatmap,
  type HabitPayload,
  type RecordItem,
} from '../../sdk';
import { YearHeatmap } from '../../ui/charts/YearHeatmap';
import { Button } from '../../ui/primitives/Button';
import { Dialog } from '../../ui/primitives/Dialog';
import { Input } from '../../ui/primitives/Input';
import { Badge } from '../../ui/primitives/Badge';
import { Icon } from '../../ui/icons/Icon';

export const HabitMatrix: React.FC = () => {
  const action = useAction();
  const { data: habits, loading, error: loadError } = useRecords<HabitPayload>('habits');
  const todayStr = formatDate(new Date());

  // Past 7 days columns for check-in grid
  const daysList: string[] = [];
  for (let i = 6; i >= 0; i--) {
    daysList.push(addDays(todayStr, -i));
  }

  // Create Habit Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('日常健康');

  // Break Reason Dialog
  const [breakReasonOpen, setBreakReasonOpen] = useState(false);
  const [activeHabitForReason, setActiveHabitForReason] = useState<{
    habit: RecordItem<HabitPayload>;
    date: string;
  } | null>(null);
  const [breakReasonInput, setBreakReasonInput] = useState('');

  // 365-day heatmap data
  const heatmapData = buildAnnualHeatmap(habits, todayStr);

  const handleToggleHabit = async (habit: RecordItem<HabitPayload>, date: string) => {
    await workbench.habits.toggle(habit, date);
  };

  const handleCreateHabit = async () => {
    if (!newTitle.trim()) return;

    await workbench.records.create<HabitPayload>('habits', {
      payload: {
        title: newTitle.trim(),
        targetFrequency: 1,
        category: newCategory,
        logs: {},
        failReasons: {},
      },
      tags: [newCategory],
      businessDate: todayStr,
      archived: false,
      assetIds: [],
    });

    setNewTitle('');
    setCreateOpen(false);
  };

  const openBreakReason = (habit: RecordItem<HabitPayload>, date: string) => {
    setActiveHabitForReason({ habit, date });
    setBreakReasonInput(habit.payload.failReasons?.[date] || '');
    setBreakReasonOpen(true);
  };

  const saveBreakReason = async () => {
    if (!activeHabitForReason) return;
    const { habit, date } = activeHabitForReason;

    await workbench.habits.recordFailure(habit, date, breakReasonInput);

    setBreakReasonOpen(false);
    setActiveHabitForReason(null);
  };

  const handleDeleteHabit = async (id: string) => {
    await workbench.records.delete(id);
  };

  return (
    <div id="module-habits" className="module-container panel">
      {(loadError || action.error) && <p role="alert">{loadError?.message || action.error}</p>}

      {/* Header */}
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-index">05</span>
          <div>
            <h3 className="panel-title">
              <Icon name="fa-seedling" />
              习惯矩阵
            </h3>
            <p className="panel-sub">连续天数 · 断卡归因 · 365 格年度轨迹</p>
          </div>
        </div>

        <div className="panel-actions">
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Icon name="fa-plus" />
            新增习惯
          </Button>
        </div>
      </header>

      {/* Habits Grid Table */}
      {loading ? (
        <div className="empty-state">
          <Icon name="fa-circle-notch" />
          正在加载习惯数据...
        </div>
      ) : habits.length === 0 ? (
        <div className="empty-state">
          <Icon name="fa-seedling" />
          暂无打卡习惯，点击「新增习惯」建立每日坚持目标
        </div>
      ) : (
        <div className="habit-table-wrap visible-scrollbar">
          <table className="habit-table">
            <thead>
              <tr>
                <th>习惯项目</th>
                <th style={{ width: '70px' }}>连续</th>
                <th style={{ width: '70px' }}>最长</th>
                {daysList.map((d) => (
                  <th
                    key={d}
                    className={d === todayStr ? 'habit-today' : undefined}
                    style={{ width: '38px' }}
                  >
                    {d.slice(5)}
                  </th>
                ))}
                <th style={{ width: '44px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {habits.map((h) => {
                const stats = calculateHabitStreaks(h, todayStr);
                const logs = h.payload.logs || {};
                const reasons = h.payload.failReasons || {};

                return (
                  <tr key={h.id}>
                    <td>
                      <div className="habit-name">
                        <span>{h.payload.title}</span>
                        {h.payload.category && (
                          <Badge variant="neutral">{h.payload.category}</Badge>
                        )}
                      </div>
                    </td>

                    <td>
                      <span
                        className={'habit-streak' + (stats.currentStreak > 0 ? '' : ' is-zero')}
                      >
                        {stats.currentStreak}
                        <small> 天</small>
                      </span>
                    </td>

                    <td>
                      <span className="habit-best">
                        <Icon name="fa-crown" />
                        {stats.longestStreak}
                      </span>
                    </td>

                    {daysList.map((d) => {
                      const checked = Boolean(logs[d]);
                      const hasReason = Boolean(reasons[d]);

                      return (
                        <td key={d}>
                          <button
                            className={
                              'habit-check' +
                              (checked ? ' is-checked' : '') +
                              (!checked && hasReason ? ' is-missed' : '')
                            }
                            onClick={() => void action.run(() => handleToggleHabit(h, d))}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              openBreakReason(h, d);
                            }}
                            aria-label={`${h.payload.title} ${d} ${checked ? '已完成' : hasReason ? '已记录断卡' : '未打卡'}`}
                            title={
                              checked
                                ? `${d}: 已完成`
                                : hasReason
                                  ? `${d}: 断卡原因 - ${reasons[d]}`
                                  : `${d}: 未打卡 (右键可登记断卡原因)`
                            }
                          >
                            <Icon
                              name={checked ? 'fa-check' : hasReason ? 'fa-question' : 'fa-minus'}
                            />
                          </button>
                        </td>
                      );
                    })}

                    <td>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="删除习惯"
                        title="删除习惯"
                        onClick={() => void action.run(() => handleDeleteHabit(h.id))}
                      >
                        <Icon name="fa-xmark" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 365 Days Heatmap */}
      <div>
        <div className="chart-block-head" style={{ marginBottom: '8px' }}>
          <span className="chart-label">365 格年度坚持热力图 · 全习惯总览</span>
        </div>
        <YearHeatmap data={heatmapData} />
      </div>

      {/* Create Habit Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新增习惯目标"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={action.pending}
              onClick={() => void action.run(handleCreateHabit)}
            >
              确认建立
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-field">
            <label>习惯名称 *</label>
            <Input
              placeholder="例如: 早起阅读 30 分钟、每日饮水 2000ml、健身运动"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-field">
            <label>分类标签</label>
            <Input
              placeholder="例如: 个人成长、日常健康、专注学习"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      {/* Break Reason Dialog */}
      <Dialog
        open={breakReasonOpen}
        onClose={() => setBreakReasonOpen(false)}
        title="登记断卡归因"
        description={
          activeHabitForReason
            ? `记录 ${activeHabitForReason.habit.payload.title} 于 ${activeHabitForReason.date} 的中断原因`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setBreakReasonOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={action.pending}
              onClick={() => void action.run(saveBreakReason)}
            >
              保存归因
            </Button>
          </>
        }
      >
        <div className="form-field">
          <label>断卡原因备注</label>
          <Input
            placeholder="例如: 加班紧急交付、身体不适、出差出行..."
            value={breakReasonInput}
            onChange={(e) => setBreakReasonInput(e.target.value)}
            autoFocus
          />
        </div>
      </Dialog>
    </div>
  );
};
