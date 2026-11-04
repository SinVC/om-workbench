import React, { useState } from 'react';
import {
  useRecords,
  useAction,
  type TaskQuadrant,
  workbench,
  formatDate,
  isOverdue,
  type Priority,
  type RecordItem,
  type RecurRule,
  type RecurType,
  type Subtask,
  type TaskPayload,
} from '../../sdk';
import { MultiViewContainer, type ViewType } from '../../ui/views/MultiViewContainer';
import { FilterSortToolbar, type FilterState } from '../../ui/views/FilterSortToolbar';
import { Button } from '../../ui/primitives/Button';
import { Dialog } from '../../ui/primitives/Dialog';
import { Input, Textarea } from '../../ui/primitives/Input';
import { Select } from '../../ui/primitives/Select';
import { Icon } from '../../ui/icons/Icon';

export interface TodoListProps {
  initialView?: ViewType;
}

export const TodoList: React.FC<TodoListProps> = ({ initialView = 'list' }) => {
  const action = useAction();
  const { data: tasks, loading, error: loadError } = useRecords<TaskPayload>('tasks');

  // Filter state
  const [filter, setFilter] = useState<FilterState>({
    search: '',
    tag: '',
    priority: '',
    status: 'all',
    sort: 'dueDate',
    desc: false,
  });

  // Create Task Dialog State
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('P1');
  const [newDueDate, setNewDueDate] = useState(formatDate(new Date()));
  const [newNotes, setNewNotes] = useState('');
  const [newTagsStr, setNewTagsStr] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurType, setRecurType] = useState<RecurType>('daily');
  const [newSubtaskInput, setNewSubtaskInput] = useState('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);

  // Collect all unique tags for toolbar
  const allTags = Array.from(new Set(tasks.flatMap((t) => t.tags || []))).filter(Boolean);

  // Filter & sort tasks
  const filteredTasks = tasks.filter((t) => {
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const matchTitle = t.payload.title?.toLowerCase().includes(q);
      const matchNotes = t.payload.notes?.toLowerCase().includes(q);
      const matchTag = t.tags?.some((tag) => tag.toLowerCase().includes(q));
      if (!matchTitle && !matchNotes && !matchTag) return false;
    }

    if (filter.tag && (!t.tags || !t.tags.includes(filter.tag))) {
      return false;
    }

    if (filter.priority && t.payload.priority !== filter.priority) {
      return false;
    }

    if (filter.status === 'active' && t.payload.completed) return false;
    if (filter.status === 'completed' && !t.payload.completed) return false;
    if (filter.status === 'overdue' && (!isOverdue(t) || t.payload.completed)) return false;

    return true;
  });

  // Sort
  filteredTasks.sort((a, b) => {
    let cmp = 0;
    if (filter.sort === 'dueDate') {
      const d1 = a.payload.dueDate || '9999-99-99';
      const d2 = b.payload.dueDate || '9999-99-99';
      cmp = d1.localeCompare(d2);
    } else if (filter.sort === 'priority') {
      const pOrder = { P0: 0, P1: 1, P2: 2 };
      cmp = pOrder[a.payload.priority] - pOrder[b.payload.priority];
    } else if (filter.sort === 'updatedAt') {
      cmp = a.updatedAt - b.updatedAt;
    } else if (filter.sort === 'createdAt') {
      cmp = a.createdAt - b.createdAt;
    }
    return filter.desc ? -cmp : cmp;
  });

  // Action handlers
  const handleToggleComplete = async (task: RecordItem<TaskPayload>) => {
    if (task.payload.completed) {
      await workbench.tasks.uncomplete(task);
    } else {
      await workbench.tasks.complete(task);
    }
  };

  const handleSnooze = async (task: RecordItem<TaskPayload>) => {
    await workbench.tasks.snooze(task, 1);
  };

  const handleDelete = async (taskId: string) => {
    await workbench.records.delete(taskId);
  };

  const handleToggleSubtask = async (
    task: RecordItem<TaskPayload>,
    subtaskId: string,
    completed: boolean,
  ) => {
    await workbench.tasks.toggleSubtask(task, subtaskId, completed);
  };

  const handleUpdateTask = async (id: string, updatedPayload: Partial<TaskPayload>) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await workbench.tasks.update(task, updatedPayload);
  };
  const handleRescheduleTask = async (taskId: string, dueDate: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (task) await workbench.tasks.update(task, { dueDate });
  };
  const handleMoveToPriority = async (task: RecordItem<TaskPayload>, priority: Priority) => {
    await workbench.tasks.update(task, {
      priority,
      completed: false,
      completedAt: undefined,
      quadrant: undefined,
    });
  };
  const handleChangeQuadrant = async (task: RecordItem<TaskPayload>, quadrant: TaskQuadrant) => {
    const priority: Priority = quadrant === 'q1' ? 'P0' : quadrant === 'q2' ? 'P1' : 'P2';
    await workbench.tasks.update(task, { priority, quadrant });
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;

    const parsedTags = newTagsStr
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    let rule: RecurRule | undefined;
    if (isRecurring) {
      rule = { type: recurType };
    }

    await workbench.records.create<TaskPayload>('tasks', {
      payload: {
        title: newTitle.trim(),
        priority: newPriority,
        dueDate: newDueDate || undefined,
        notes: newNotes.trim() || undefined,
        completed: false,
        subtasks,
        recurRule: rule,
        snoozeCount: 0,
        originalDueDate: newDueDate || undefined,
      },
      tags: parsedTags,
      businessDate: newDueDate || undefined,
      archived: false,
      assetIds: [],
    });

    // Reset and close
    setNewTitle('');
    setNewNotes('');
    setNewTagsStr('');
    setSubtasks([]);
    setIsRecurring(false);
    setCreateOpen(false);
  };

  const addSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    setSubtasks((prev) => [
      ...prev,
      {
        id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: newSubtaskInput.trim(),
        completed: false,
      },
    ]);
    setNewSubtaskInput('');
  };

  return (
    <div id="module-tasks" className="module-container panel">
      {(loadError || action.error) && <p role="alert">{loadError?.message || action.error}</p>}

      {/* Top action header */}
      <header className="panel-head">
        <div className="panel-heading">
          <span className="panel-index">02</span>
          <div>
            <h3 className="panel-title">
              <Icon name="fa-list-check" />
              待办清单
            </h3>
            <p className="panel-sub">
              共 {tasks.length} 项（已完成 {tasks.filter((t) => t.payload.completed).length} 项）
            </p>
          </div>
        </div>

        <div className="panel-actions">
          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
            <Icon name="fa-plus" />
            新建待办
          </Button>
        </div>
      </header>

      {/* Filter and sorting toolbar */}
      <FilterSortToolbar filter={filter} onChange={setFilter} availableTags={allTags} />

      {/* Multi-view projection */}
      {loading ? (
        <div className="empty-state">
          <Icon name="fa-circle-notch" />
          正在加载待办列表...
        </div>
      ) : (
        <MultiViewContainer
          tasks={filteredTasks}
          initialView={initialView}
          onToggleComplete={handleToggleComplete}
          onSnooze={handleSnooze}
          onDelete={handleDelete}
          onToggleSubtask={handleToggleSubtask}
          onUpdateTask={handleUpdateTask}
          onRescheduleTask={handleRescheduleTask}
          onMoveToPriority={handleMoveToPriority}
          onChangeQuadrant={handleChangeQuadrant}
        />
      )}

      {/* Create Task Modal Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建待办事项"
        description="支持拆分子任务、配置周期性重复及优先级"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={action.pending}
              onClick={() => void action.run(handleCreateTask)}
            >
              确认创建
            </Button>
          </>
        }
      >
        <div className="form-stack">
          <div className="form-field">
            <label>待办名称 *</label>
            <Input
              placeholder="输入任务标题..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-pair">
            <div className="form-field">
              <label>优先级</label>
              <Select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as Priority)}
                options={[
                  { value: 'P0', label: 'P0 · 极高优 / 紧急' },
                  { value: 'P1', label: 'P1 · 高优先级' },
                  { value: 'P2', label: 'P2 · 普通待办' },
                ]}
              />
            </div>

            <div className="form-field">
              <label>截止日期</label>
              <Input
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label>标签（空格或逗号分隔）</label>
            <Input
              placeholder="例如: 工作 核心评审 必办"
              value={newTagsStr}
              onChange={(e) => setNewTagsStr(e.target.value)}
            />
          </div>

          {/* Subtasks Builder */}
          <div className="form-field">
            <label>拆分子步骤（Subtasks）</label>
            <div className="subtask-input-row">
              <Input
                placeholder="输入子步骤并按回车..."
                value={newSubtaskInput}
                onChange={(e) => setNewSubtaskInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
              />
              <Button size="sm" variant="outline" onClick={addSubtask}>
                添加
              </Button>
            </div>

            {subtasks.length > 0 && (
              <div className="subtask-chips">
                {subtasks.map((s, index) => (
                  <div key={s.id} className="subtask-chip">
                    <span>
                      {String(index + 1).padStart(2, '0')} · {s.title}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="移除子步骤"
                      onClick={() => setSubtasks(subtasks.filter((item) => item.id !== s.id))}
                    >
                      <Icon name="fa-xmark" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recurrence Rule Toggle */}
          <div className="form-inline">
            <label className="check-line">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              <span>周期性重复任务</span>
            </label>

            {isRecurring && (
              <Select
                value={recurType}
                onChange={(e) => setRecurType(e.target.value as RecurType)}
                options={[
                  { value: 'daily', label: '每天重复' },
                  { value: 'weekly', label: '每周重复' },
                  { value: 'monthly', label: '每月重复' },
                ]}
              />
            )}
          </div>

          <div className="form-field">
            <label>备注说明</label>
            <Textarea
              placeholder="补充任务背景或执行要点..."
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
        </div>
      </Dialog>
    </div>
  );
};
