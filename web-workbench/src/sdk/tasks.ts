import type {
  Operation,
  RecordData,
  RecordItem,
  RecurRule,
  Subtask,
  TaskPayload,
  TaskQuadrant,
} from './types';

type TaskWriteOperation = Exclude<Operation<TaskPayload>, { type: 'delete' }>;

export function getTaskQuadrant(
  task: RecordItem<TaskPayload>,
  today = formatDate(new Date()),
): TaskQuadrant {
  if (task.payload.quadrant) return task.payload.quadrant;
  const urgent = Boolean(task.payload.dueDate && task.payload.dueDate <= today);
  if (task.payload.priority === 'P0') return 'q1';
  if (task.payload.priority === 'P1') return urgent ? 'q1' : 'q2';
  return urgent ? 'q3' : 'q4';
}

export function buildUpdateTaskOperations(
  task: RecordItem<TaskPayload>,
  patch: Partial<TaskPayload>,
): TaskWriteOperation[] {
  if (
    patch.dueDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate) ||
      formatDate(parseDate(patch.dueDate)) !== patch.dueDate)
  ) {
    throw new Error('请输入有效的截止日期');
  }
  return [
    {
      type: 'update',
      id: task.id,
      expectedUpdatedAt: task.updatedAt,
      data: {
        payload: { ...task.payload, ...patch },
        tags: task.tags,
        businessDate: 'dueDate' in patch ? patch.dueDate || undefined : task.businessDate,
        archived: task.archived,
        assetIds: task.assetIds,
      },
    },
  ];
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 2026;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function computeNextDueDate(currentDueDate: string, rule: RecurRule): string {
  const d = parseDate(currentDueDate);
  switch (rule.type) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      return formatDate(d);

    case 'weekly': {
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        const sorted = [...rule.daysOfWeek].sort((a, b) => a - b);
        const currentDay = d.getDay();
        const nextDay = sorted.find((day) => day > currentDay);
        if (nextDay !== undefined) {
          d.setDate(d.getDate() + (nextDay - currentDay));
          return formatDate(d);
        } else {
          // Wrap around to the first day of next week
          const firstDay = sorted[0] ?? 0;
          d.setDate(d.getDate() + (7 - currentDay + firstDay));
          return formatDate(d);
        }
      }
      d.setDate(d.getDate() + 7);
      return formatDate(d);
    }

    case 'monthly': {
      const origDay = d.getDate();
      d.setMonth(d.getMonth() + 1);
      // In case month has fewer days (e.g. Jan 31 -> Feb 28)
      if (d.getDate() !== origDay) {
        d.setDate(0);
      }
      return formatDate(d);
    }

    case 'interval': {
      const interval = rule.intervalDays && rule.intervalDays > 0 ? rule.intervalDays : 1;
      d.setDate(d.getDate() + interval);
      return formatDate(d);
    }
  }
}

export function isOverdue(
  task: RecordItem<TaskPayload>,
  todayStr: string = formatDate(new Date()),
): boolean {
  if (task.payload.completed || !task.payload.dueDate) return false;
  return task.payload.dueDate < todayStr;
}

export function isDueToday(
  task: RecordItem<TaskPayload>,
  todayStr: string = formatDate(new Date()),
): boolean {
  if (task.payload.completed || !task.payload.dueDate) return false;
  return task.payload.dueDate === todayStr;
}

export function isDueWithinDays(
  task: RecordItem<TaskPayload>,
  days: number,
  todayStr: string = formatDate(new Date()),
): boolean {
  if (task.payload.completed || !task.payload.dueDate) return false;
  const maxDate = addDays(todayStr, days);
  return task.payload.dueDate > todayStr && task.payload.dueDate <= maxDate;
}

/**
 * Creates batch operations for completing a task.
 * If recurRule is present, completes the current task and spawns the next recurring instance.
 */
export function buildCompleteTaskOperations(
  task: RecordItem<TaskPayload>,
  nowMs: number = Date.now(),
): TaskWriteOperation[] {
  const operations: TaskWriteOperation[] = [];
  const completedPayload: TaskPayload = {
    ...task.payload,
    completed: true,
    completedAt: nowMs,
  };

  operations.push({
    type: 'update',
    id: task.id,
    expectedUpdatedAt: task.updatedAt,
    data: {
      payload: completedPayload,
      tags: task.tags,
      businessDate: task.businessDate,
      archived: task.archived,
      assetIds: task.assetIds,
    },
  });

  if (task.payload.recurRule) {
    const baseDueDate = task.payload.dueDate || formatDate(new Date(nowMs));
    const nextDueDate = computeNextDueDate(baseDueDate, task.payload.recurRule);

    const resetSubtasks: Subtask[] = (task.payload.subtasks || []).map((s) => ({
      ...s,
      completed: false,
    }));

    const nextData: RecordData<TaskPayload> = {
      payload: {
        ...task.payload,
        dueDate: nextDueDate,
        originalDueDate: nextDueDate,
        completed: false,
        completedAt: undefined,
        snoozeCount: 0,
        subtasks: resetSubtasks,
      },
      tags: task.tags,
      businessDate: nextDueDate,
      archived: false,
      assetIds: [],
    };

    operations.push({
      type: 'create',
      collection: task.collection || 'tasks',
      data: nextData,
    });
  }

  return operations;
}

/**
 * Creates batch operations for toggling a subtask.
 * If all subtasks become completed, automatically marks the parent task completed (with recurrence spawn if configured).
 * If unchecking a subtask from an already completed task, uncompletes the parent.
 */
export function buildToggleSubtaskOperations(
  task: RecordItem<TaskPayload>,
  subtaskId: string,
  completed: boolean,
  nowMs: number = Date.now(),
): TaskWriteOperation[] {
  const currentSubtasks = task.payload.subtasks || [];
  const nextSubtasks = currentSubtasks.map((s) => (s.id === subtaskId ? { ...s, completed } : s));

  const allCompleted = nextSubtasks.length > 0 && nextSubtasks.every((s) => s.completed);

  if (allCompleted && !task.payload.completed) {
    const updatedTask: RecordItem<TaskPayload> = {
      ...task,
      payload: {
        ...task.payload,
        subtasks: nextSubtasks,
      },
    };
    return buildCompleteTaskOperations(updatedTask, nowMs);
  }

  const shouldRevertMaster = !completed && task.payload.completed;
  const nextPayload: TaskPayload = {
    ...task.payload,
    subtasks: nextSubtasks,
    completed: shouldRevertMaster ? false : task.payload.completed,
    completedAt: shouldRevertMaster ? undefined : task.payload.completedAt,
  };

  return [
    {
      type: 'update',
      id: task.id,
      expectedUpdatedAt: task.updatedAt,
      data: {
        payload: nextPayload,
        tags: task.tags,
        businessDate: task.businessDate,
        archived: task.archived,
        assetIds: task.assetIds,
      },
    },
  ];
}

/**
 * Creates batch operations for snoozing a task by N days (default 1).
 */
export function buildSnoozeTaskOperations(
  task: RecordItem<TaskPayload>,
  days: number = 1,
  todayStr: string = formatDate(new Date()),
): TaskWriteOperation[] {
  const baseDate =
    task.payload.dueDate && task.payload.dueDate >= todayStr ? task.payload.dueDate : todayStr;
  const newDueDate = addDays(baseDate, days);
  const snoozeCount = (task.payload.snoozeCount || 0) + 1;

  const nextPayload: TaskPayload = {
    ...task.payload,
    dueDate: newDueDate,
    snoozeCount,
    originalDueDate: task.payload.originalDueDate || task.payload.dueDate || baseDate,
  };

  return [
    {
      type: 'update',
      id: task.id,
      expectedUpdatedAt: task.updatedAt,
      data: {
        payload: nextPayload,
        tags: task.tags,
        businessDate: newDueDate,
        archived: task.archived,
        assetIds: task.assetIds,
      },
    },
  ];
}

/**
 * Uncompletes a task.
 */
export function buildUncompleteTaskOperations(task: RecordItem<TaskPayload>): TaskWriteOperation[] {
  const nextPayload: TaskPayload = {
    ...task.payload,
    completed: false,
    completedAt: undefined,
  };

  return [
    {
      type: 'update',
      id: task.id,
      expectedUpdatedAt: task.updatedAt,
      data: {
        payload: nextPayload,
        tags: task.tags,
        businessDate: task.businessDate,
        archived: task.archived,
        assetIds: task.assetIds,
      },
    },
  ];
}
