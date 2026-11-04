/**
 * Standalone Domain Rules Test Suite for Personal Workbench Frontend SDK
 *
 * Verifies 7 Core Domain Capabilities:
 * 1. 任务周期推算 (Task Recurrence Computation)
 * 2. 子任务联动完成与撤销 (Subtask Linkage Completion & Revocation)
 * 3. 一键顺延 (One-Click Snooze / Extension)
 * 4. 习惯打卡连续天数与最长天数计算 (Habit Streaks & Longest Streak Calculation)
 * 5. 日程冲突校验 (Calendar Schedule Conflict Detection)
 * 6. 预算与周复盘核算 (Budget & Weekly Review Calculation)
 * 7. 全局关键词检索 (Global Keyword Search)
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type {
  RecordItem,
  TaskPayload,
  ScheduleEventPayload,
  TransactionRecord,
  RecurRule,
} from '../src/sdk';
import {
  formatDate,
  parseDate,
  addDays,
  computeNextDueDate,
  isOverdue,
  isDueToday,
  isDueWithinDays,
  buildCompleteTaskOperations,
  buildToggleSubtaskOperations,
  buildSnoozeTaskOperations,
  buildUncompleteTaskOperations,
} from '../src/sdk/tasks';
import { calculateHabitStreaks, buildAnnualHeatmap } from '../src/sdk/habits';
import { detectEventConflicts, buildMonthMatrix } from '../src/sdk/calendar';
import { calculateBudgetStatus, generateWeeklyReview } from '../src/sdk/metrics';
import { searchRecords } from '../src/sdk/search';

// Helper to create mock Task RecordItem
function createMockTask(
  overrides: Omit<Partial<RecordItem<TaskPayload>>, 'payload'> & {
    payload?: Partial<TaskPayload>;
  } = {},
): RecordItem<TaskPayload> {
  return {
    id: 'task-1',
    collection: 'tasks',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    tags: ['work'],
    businessDate: '2026-10-30',
    archived: false,
    assetIds: [],
    ...overrides,
    payload: {
      title: 'Sample Task',
      priority: 'P1',
      completed: false,
      subtasks: [],
      snoozeCount: 0,
      dueDate: '2026-10-30',
      ...overrides.payload,
    },
  };
}

// Helper to create mock Schedule Event
function createMockEvent(
  overrides: Omit<Partial<RecordItem<ScheduleEventPayload>>, 'payload'> & {
    payload?: Partial<ScheduleEventPayload>;
  } = {},
): RecordItem<ScheduleEventPayload> {
  return {
    id: 'event-1',
    collection: 'schedules',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
    payload: {
      title: 'Meeting',
      startDate: '2026-10-30',
      startTime: '09:00',
      endDate: '2026-10-30',
      endTime: '10:00',
      allDay: false,
      ...overrides.payload,
    },
  };
}

// =========================================================================
// Suite 1: 任务周期推算 (Task Recurrence Computation)
// =========================================================================
describe('Domain Rule 1: 任务周期推算 (Task Recurrence Computation)', () => {
  it('Date utilities: formatDate, parseDate, addDays across boundaries', () => {
    const d = new Date(2026, 9, 30); // Oct 30, 2026
    assert.equal(formatDate(d), '2026-10-30');

    const parsed = parseDate('2026-10-30');
    assert.equal(parsed.getFullYear(), 2026);
    assert.equal(parsed.getMonth(), 9);
    assert.equal(parsed.getDate(), 30);

    // Month boundary
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-11-01', -1), '2026-10-31');

    // Year boundary
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');

    // Leap year boundary: 2028 is leap year
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2028-02-29', 1), '2028-03-01');
    // Non-leap year: 2026
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  });

  it('Daily recurrence: regular days, month ends, year ends, leap years', () => {
    const rule: RecurRule = { type: 'daily' };
    assert.equal(computeNextDueDate('2026-10-15', rule), '2026-10-16');
    assert.equal(computeNextDueDate('2026-10-31', rule), '2026-11-01');
    assert.equal(computeNextDueDate('2026-12-31', rule), '2027-01-01');
    assert.equal(computeNextDueDate('2028-02-28', rule), '2028-02-29'); // Leap year
    assert.equal(computeNextDueDate('2026-02-28', rule), '2026-03-01'); // Non-leap year
  });

  it('Weekly recurrence without daysOfWeek: defaults to +7 days', () => {
    const rule: RecurRule = { type: 'weekly' };
    assert.equal(computeNextDueDate('2026-10-15', rule), '2026-10-22');
    assert.equal(computeNextDueDate('2026-10-28', rule), '2026-11-04');
    assert.equal(computeNextDueDate('2026-12-30', rule), '2027-01-06');
  });

  it('Weekly recurrence with daysOfWeek: multiple days [1, 3, 5] (Mon, Wed, Fri)', () => {
    const rule: RecurRule = { type: 'weekly', daysOfWeek: [1, 3, 5] };
    // 2026-10-19 is Monday (day 1)
    assert.equal(computeNextDueDate('2026-10-19', rule), '2026-10-21'); // -> Wednesday (day 3)
    // 2026-10-21 is Wednesday (day 3)
    assert.equal(computeNextDueDate('2026-10-21', rule), '2026-10-23'); // -> Friday (day 5)
    // 2026-10-23 is Friday (day 5) -> wrap around to next week Monday (day 1)
    assert.equal(computeNextDueDate('2026-10-23', rule), '2026-10-26'); // -> Next Monday

    // Starting on intermediate non-matching days:
    // 2026-10-20 is Tuesday (day 2) -> Next is Wednesday (day 3)
    assert.equal(computeNextDueDate('2026-10-20', rule), '2026-10-21');
    // 2026-10-24 is Saturday (day 6) -> Wraps to Monday
    assert.equal(computeNextDueDate('2026-10-24', rule), '2026-10-26');
    // 2026-10-25 is Sunday (day 0) -> Next is Monday (day 1)
    assert.equal(computeNextDueDate('2026-10-25', rule), '2026-10-26');
  });

  it('Weekly recurrence with weekdays Mon-Fri [1, 2, 3, 4, 5]', () => {
    const rule: RecurRule = { type: 'weekly', daysOfWeek: [1, 2, 3, 4, 5] };
    // Thursday -> Friday
    assert.equal(computeNextDueDate('2026-10-29', rule), '2026-10-30');
    // Friday -> next Monday (+3 days)
    assert.equal(computeNextDueDate('2026-10-30', rule), '2026-11-02');
    // Saturday -> next Monday (+2 days)
    assert.equal(computeNextDueDate('2026-10-31', rule), '2026-11-02');
    // Sunday -> next Monday (+1 day)
    assert.equal(computeNextDueDate('2026-11-01', rule), '2026-11-02');
  });

  it('Weekly recurrence with Sunday (0) and unordered array [5, 1, 0]', () => {
    const rule: RecurRule = { type: 'weekly', daysOfWeek: [5, 1, 0] }; // Sunday(0), Mon(1), Fri(5)
    // 2026-10-25 is Sunday (day 0) -> Next should be Monday (day 1)
    assert.equal(computeNextDueDate('2026-10-25', rule), '2026-10-26');
    // 2026-10-30 is Friday (day 5) -> Wraps to Sunday (day 0, +2 days)
    assert.equal(computeNextDueDate('2026-10-30', rule), '2026-11-01');
    // Single day [0] (Sunday) on Sunday -> +7 days to next Sunday
    const singleSunRule: RecurRule = { type: 'weekly', daysOfWeek: [0] };
    assert.equal(computeNextDueDate('2026-10-25', singleSunRule), '2026-11-01');
  });

  it('Monthly recurrence: day clamping at month ends (31st -> 28/29/30th)', () => {
    const rule: RecurRule = { type: 'monthly' };
    // Regular mid-month
    assert.equal(computeNextDueDate('2026-05-15', rule), '2026-06-15');

    // 31st to 28th (non-leap Feb)
    assert.equal(computeNextDueDate('2026-01-31', rule), '2026-02-28');
    assert.equal(computeNextDueDate('2026-01-30', rule), '2026-02-28');

    // 31st to 29th (leap year Feb 2028)
    assert.equal(computeNextDueDate('2028-01-31', rule), '2028-02-29');

    // 31st to 30th (Mar 31 -> Apr 30, May 31 -> Jun 30, Aug 31 -> Sep 30, Oct 31 -> Nov 30)
    assert.equal(computeNextDueDate('2026-03-31', rule), '2026-04-30');
    assert.equal(computeNextDueDate('2026-05-31', rule), '2026-06-30');
    assert.equal(computeNextDueDate('2026-08-31', rule), '2026-09-30');
    assert.equal(computeNextDueDate('2026-10-31', rule), '2026-11-30');

    // Feb 28 to Mar 28
    assert.equal(computeNextDueDate('2026-02-28', rule), '2026-03-28');

    // Year end: Dec 31 -> Jan 31 next year
    assert.equal(computeNextDueDate('2026-12-31', rule), '2027-01-31');
  });

  it('Interval recurrence: specified days, month overflow, invalid/fallback intervals', () => {
    assert.equal(
      computeNextDueDate('2026-10-15', { type: 'interval', intervalDays: 3 }),
      '2026-10-18',
    );
    assert.equal(
      computeNextDueDate('2026-10-29', { type: 'interval', intervalDays: 5 }),
      '2026-11-03',
    );
    assert.equal(
      computeNextDueDate('2026-12-30', { type: 'interval', intervalDays: 4 }),
      '2027-01-03',
    );

    // Fallback when intervalDays is undefined, 0, or negative
    assert.equal(computeNextDueDate('2026-10-15', { type: 'interval' }), '2026-10-16');
    assert.equal(
      computeNextDueDate('2026-10-15', { type: 'interval', intervalDays: 0 }),
      '2026-10-16',
    );
    assert.equal(
      computeNextDueDate('2026-10-15', { type: 'interval', intervalDays: -2 }),
      '2026-10-16',
    );
  });

  it('Predicates: isOverdue, isDueToday, isDueWithinDays', () => {
    const today = '2026-10-30';

    const overdueTask = createMockTask({ payload: { dueDate: '2026-10-29', completed: false } });
    const todayTask = createMockTask({ payload: { dueDate: '2026-10-30', completed: false } });
    const futureTask3 = createMockTask({ payload: { dueDate: '2026-11-02', completed: false } });
    const futureTask10 = createMockTask({ payload: { dueDate: '2026-11-10', completed: false } });
    const completedOverdueTask = createMockTask({
      payload: { dueDate: '2026-10-25', completed: true },
    });
    const noDueDateTask = createMockTask({ payload: { dueDate: undefined, completed: false } });

    // isOverdue
    assert.equal(isOverdue(overdueTask, today), true);
    assert.equal(isOverdue(todayTask, today), false);
    assert.equal(isOverdue(futureTask3, today), false);
    assert.equal(isOverdue(completedOverdueTask, today), false);
    assert.equal(isOverdue(noDueDateTask, today), false);

    // isDueToday
    assert.equal(isDueToday(todayTask, today), true);
    assert.equal(isDueToday(overdueTask, today), false);
    assert.equal(isDueToday(futureTask3, today), false);
    assert.equal(isDueToday(completedOverdueTask, today), false);
    assert.equal(isDueToday(noDueDateTask, today), false);

    // isDueWithinDays
    // 2026-11-02 is 3 days from 2026-10-30
    assert.equal(isDueWithinDays(futureTask3, 3, today), true);
    assert.equal(isDueWithinDays(futureTask3, 2, today), false); // only 2 days requested
    assert.equal(isDueWithinDays(futureTask10, 3, today), false);
    assert.equal(isDueWithinDays(todayTask, 3, today), false); // today itself is not "within future days"
    assert.equal(isDueWithinDays(overdueTask, 3, today), false); // past date is not within days
    assert.equal(isDueWithinDays(completedOverdueTask, 3, today), false);
  });
});

// =========================================================================
// Suite 2: 子任务联动完成与撤销 (Subtask Linkage Completion & Revocation)
// =========================================================================
describe('Domain Rule 2: 子任务联动完成与撤销 (Subtask Linkage Completion & Revocation)', () => {
  it('Toggling subtask to complete when all become completed: auto completes parent task', () => {
    const task = createMockTask({
      payload: {
        completed: false,
        subtasks: [
          { id: 'sub-1', title: 'Part 1', completed: true },
          { id: 'sub-2', title: 'Part 2', completed: false },
        ],
      },
    });

    const now = 1761800000000;
    const ops = buildToggleSubtaskOperations(task, 'sub-2', true, now);

    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.type, 'update');
    assert.equal(op.id, 'task-1');
    assert.equal(op.data.payload.completed, true);
    assert.equal(op.data.payload.completedAt, now);
    assert.deepEqual(op.data.payload.subtasks, [
      { id: 'sub-1', title: 'Part 1', completed: true },
      { id: 'sub-2', title: 'Part 2', completed: true },
    ]);
  });

  it('Single subtask task: toggling true completes parent; toggling false uncompletes parent', () => {
    const task = createMockTask({
      payload: {
        completed: false,
        subtasks: [{ id: 'single-sub', title: 'Solo task', completed: false }],
      },
    });

    const now = 1761800000000;
    // Toggle to true -> completes master
    const ops1 = buildToggleSubtaskOperations(task, 'single-sub', true, now);
    assert.equal(ops1[0]!.data.payload.completed, true);
    assert.equal(ops1[0]!.data.payload.subtasks[0]!.completed, true);

    // Toggle back to false on completed master -> reverts master
    const completedMaster = {
      ...task,
      payload: { ...ops1[0]!.data.payload, completed: true, completedAt: now },
    };
    const ops2 = buildToggleSubtaskOperations(completedMaster, 'single-sub', false);
    assert.equal(ops2[0]!.data.payload.completed, false);
    assert.equal(ops2[0]!.data.payload.completedAt, undefined);
    assert.equal(ops2[0]!.data.payload.subtasks[0]!.completed, false);
  });

  it('Toggling subtask on recurring task when all become completed: auto completes parent and spawns next instance', () => {
    const task = createMockTask({
      id: 'task-recur',
      collection: 'tasks',
      tags: ['work', 'project'],
      payload: {
        completed: false,
        dueDate: '2026-10-30',
        recurRule: { type: 'daily' },
        snoozeCount: 2,
        subtasks: [
          { id: 'sub-1', title: 'Step 1', completed: true },
          { id: 'sub-2', title: 'Step 2', completed: false },
        ],
      },
    });

    const now = 1761800000000;
    const ops = buildToggleSubtaskOperations(task, 'sub-2', true, now);

    // Should return 2 operations: 1 update (current task completed), 1 create (next recurring instance)
    assert.equal(ops.length, 2);

    // Op 1: update original task
    assert.equal(ops[0]!.type, 'update');
    assert.equal(ops[0]!.id, 'task-recur');
    assert.equal(ops[0]!.data.payload.completed, true);
    assert.equal(ops[0]!.data.payload.completedAt, now);
    assert.equal(ops[0]!.data.payload.subtasks[1]!.completed, true);

    // Op 2: create spawned instance
    assert.equal(ops[1]!.type, 'create');
    assert.equal(ops[1]!.collection, 'tasks');
    const spawned = ops[1]!.data;
    assert.equal(spawned.payload.completed, false);
    assert.equal(spawned.payload.completedAt, undefined);
    assert.equal(spawned.payload.dueDate, '2026-10-31');
    assert.equal(spawned.payload.originalDueDate, '2026-10-31');
    assert.equal(spawned.businessDate, '2026-10-31');
    assert.equal(spawned.payload.snoozeCount, 0); // Reset snooze count
    assert.deepEqual(spawned.tags, ['work', 'project']); // Preserves tags
    // Subtasks reset to uncompleted
    assert.deepEqual(spawned.payload.subtasks, [
      { id: 'sub-1', title: 'Step 1', completed: false },
      { id: 'sub-2', title: 'Step 2', completed: false },
    ]);
  });

  it('Unchecking subtask on already completed task: reverts parent task to incomplete', () => {
    const task = createMockTask({
      payload: {
        completed: true,
        completedAt: 1761800000000,
        subtasks: [
          { id: 'sub-1', title: 'Part 1', completed: true },
          { id: 'sub-2', title: 'Part 2', completed: true },
        ],
      },
    });

    const ops = buildToggleSubtaskOperations(task, 'sub-2', false);
    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.type, 'update');
    assert.equal(op.data.payload.completed, false);
    assert.equal(op.data.payload.completedAt, undefined);
    assert.equal(op.data.payload.subtasks[1]!.completed, false);
  });

  it('Partial subtask completion: parent task remains incomplete', () => {
    const task = createMockTask({
      payload: {
        completed: false,
        subtasks: [
          { id: 'sub-1', title: 'Part 1', completed: false },
          { id: 'sub-2', title: 'Part 2', completed: false },
          { id: 'sub-3', title: 'Part 3', completed: false },
        ],
      },
    });

    const ops = buildToggleSubtaskOperations(task, 'sub-1', true);
    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.data.payload.completed, false);
    assert.equal(op.data.payload.subtasks[0]!.completed, true);
    assert.equal(op.data.payload.subtasks[1]!.completed, false);
  });

  it('Direct buildCompleteTaskOperations and buildUncompleteTaskOperations', () => {
    const simpleTask = createMockTask({ payload: { completed: false } });
    const completeOps = buildCompleteTaskOperations(simpleTask, 123456789);
    assert.equal(completeOps.length, 1);
    assert.equal(completeOps[0]!.data.payload.completed, true);
    assert.equal(completeOps[0]!.data.payload.completedAt, 123456789);

    const completedTask = createMockTask({ payload: { completed: true, completedAt: 123456789 } });
    const uncompleteOps = buildUncompleteTaskOperations(completedTask);
    assert.equal(uncompleteOps.length, 1);
    assert.equal(uncompleteOps[0]!.data.payload.completed, false);
    assert.equal(uncompleteOps[0]!.data.payload.completedAt, undefined);
  });
});

// =========================================================================
// Suite 3: 一键顺延 (One-Click Snooze / Extension)
// =========================================================================
describe('Domain Rule 3: 一键顺延 (One-Click Snooze / Extension)', () => {
  it('Snooze a future task: adds days to dueDate and increments snoozeCount', () => {
    const task = createMockTask({
      payload: {
        dueDate: '2026-11-05',
        snoozeCount: 0,
      },
    });

    const ops = buildSnoozeTaskOperations(task, 2, '2026-10-30');
    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.type, 'update');
    assert.equal(op.data.payload.dueDate, '2026-11-07');
    assert.equal(op.data.payload.snoozeCount, 1);
    assert.equal(op.data.payload.originalDueDate, '2026-11-05');
    assert.equal(op.data.businessDate, '2026-11-07');
  });

  it('Snooze an overdue task: calculates new dueDate from today, not from old overdue date', () => {
    const task = createMockTask({
      payload: {
        dueDate: '2026-10-15', // 15 days overdue
        snoozeCount: 1,
        originalDueDate: '2026-10-15',
      },
    });

    // When today is 2026-10-30, snoozing 1 day should make it due 2026-10-31!
    const ops = buildSnoozeTaskOperations(task, 1, '2026-10-30');
    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.data.payload.dueDate, '2026-10-31');
    assert.equal(op.data.payload.snoozeCount, 2);
    assert.equal(op.data.payload.originalDueDate, '2026-10-15'); // Preserves original
    assert.equal(op.data.businessDate, '2026-10-31');
  });

  it('Multiple consecutive snoozes preserve originalDueDate', () => {
    const task = createMockTask({
      payload: {
        dueDate: '2026-11-02',
        snoozeCount: 3,
        originalDueDate: '2026-10-20',
      },
    });

    const ops = buildSnoozeTaskOperations(task, 3, '2026-10-30');
    assert.equal(ops[0]!.data.payload.dueDate, '2026-11-05');
    assert.equal(ops[0]!.data.payload.snoozeCount, 4);
    assert.equal(ops[0]!.data.payload.originalDueDate, '2026-10-20');
  });

  it('Snooze task due today: snoozes to tomorrow with default 1 day parameter', () => {
    const task = createMockTask({
      payload: {
        dueDate: '2026-10-30',
      },
    });

    const ops = buildSnoozeTaskOperations(task, undefined, '2026-10-30');
    assert.equal(ops.length, 1);
    const op = ops[0]!;
    assert.equal(op.data.payload.dueDate, '2026-10-31');
    assert.equal(op.data.payload.snoozeCount, 1);
  });
});

// =========================================================================
// Suite 4: 习惯打卡连续天数与最长天数计算 (Habit Streaks & Longest Streak Calculation)
// =========================================================================
describe('Domain Rule 4: 习惯打卡连续天数与最长天数计算 (Habit Streaks & Longest Streak Calculation)', () => {
  it('Empty logs or all-false logs', () => {
    const emptyHabit = {
      id: 'h-1',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: { title: 'Water', targetFrequency: 1, logs: {} },
    };
    const stats1 = calculateHabitStreaks(emptyHabit, '2026-10-30');
    assert.equal(stats1.currentStreak, 0);
    assert.equal(stats1.longestStreak, 0);
    assert.equal(stats1.totalCompleted, 0);
    assert.equal(stats1.completionRate7Days, 0);
    assert.equal(stats1.completionRate30Days, 0);

    const allFalseHabit = {
      id: 'h-2',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Water',
        targetFrequency: 1,
        logs: { '2026-10-30': false, '2026-10-29': false },
      },
    };
    const stats2 = calculateHabitStreaks(allFalseHabit, '2026-10-30');
    assert.equal(stats2.currentStreak, 0);
    assert.equal(stats2.longestStreak, 0);
    assert.equal(stats2.totalCompleted, 0);
  });

  it('Current streak: checked today vs checked yesterday (today in progress)', () => {
    // Case A: Checked today and yesterday -> streak = 2
    const habitA = {
      id: 'h-a',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Exercise',
        targetFrequency: 1,
        logs: { '2026-10-29': true, '2026-10-30': true },
      },
    };
    const statsA = calculateHabitStreaks(habitA, '2026-10-30');
    assert.equal(statsA.currentStreak, 2);
    assert.equal(statsA.longestStreak, 2);

    // Case B: Not checked today, but checked yesterday and 2 days ago -> streak = 2 (active since today not over)
    const habitB = {
      id: 'h-b',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Exercise',
        targetFrequency: 1,
        logs: { '2026-10-28': true, '2026-10-29': true },
      },
    };
    const statsB = calculateHabitStreaks(habitB, '2026-10-30');
    assert.equal(statsB.currentStreak, 2);
    assert.equal(statsB.longestStreak, 2);

    // Case C: Checked today, but not yesterday -> currentStreak = 1
    const habitC = {
      id: 'h-c',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Exercise',
        targetFrequency: 1,
        logs: { '2026-10-28': true, '2026-10-30': true },
      },
    };
    const statsC = calculateHabitStreaks(habitC, '2026-10-30');
    assert.equal(statsC.currentStreak, 1);
    assert.equal(statsC.longestStreak, 1);

    // Case D: Not checked today AND not checked yesterday -> streak broken (currentStreak = 0)
    const habitD = {
      id: 'h-d',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Exercise',
        targetFrequency: 1,
        logs: { '2026-10-27': true, '2026-10-28': true },
      },
    };
    const statsD = calculateHabitStreaks(habitD, '2026-10-30');
    assert.equal(statsD.currentStreak, 0);
    assert.equal(statsD.longestStreak, 2);
  });

  it('Longest streak across month boundary and leap year', () => {
    // 5-day streak in September, then broken, then 3-day streak ending Oct 30
    const habit = {
      id: 'h-long',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Read',
        targetFrequency: 1,
        logs: {
          // 5-day streak spanning month boundary Sep 28 -> Oct 02
          '2026-09-28': true,
          '2026-09-29': true,
          '2026-09-30': true,
          '2026-10-01': true,
          '2026-10-02': true,
          // Gap: Oct 03 to Oct 27
          // 3-day streak: Oct 28, Oct 29, Oct 30
          '2026-10-28': true,
          '2026-10-29': true,
          '2026-10-30': true,
        },
      },
    };

    const stats = calculateHabitStreaks(habit, '2026-10-30');
    assert.equal(stats.longestStreak, 5);
    assert.equal(stats.currentStreak, 3);
    assert.equal(stats.totalCompleted, 8);

    // Leap year streak: 2028-02-27, 2028-02-28, 2028-02-29, 2028-03-01
    const leapHabit = {
      id: 'h-leap',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Leap test',
        targetFrequency: 1,
        logs: {
          '2028-02-27': true,
          '2028-02-28': true,
          '2028-02-29': true,
          '2028-03-01': true,
        },
      },
    };
    const leapStats = calculateHabitStreaks(leapHabit, '2028-03-01');
    assert.equal(leapStats.longestStreak, 4);
    assert.equal(leapStats.currentStreak, 4);
  });

  it('Completion rate 7 days and 30 days calculation', () => {
    const logs: Record<string, boolean> = {};
    // Check 3 out of last 7 days (today, today-1, today-2)
    logs['2026-10-30'] = true;
    logs['2026-10-29'] = true;
    logs['2026-10-28'] = true;

    const habit = {
      id: 'h-rates',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: { title: 'Rate Test', targetFrequency: 1, logs },
    };

    const stats = calculateHabitStreaks(habit, '2026-10-30');
    // 3/7 = 42.857... -> Math.round -> 43%
    assert.equal(stats.completionRate7Days, 43);
    // 3/30 = 10%
    assert.equal(stats.completionRate30Days, 10);
  });

  it('Annual Heatmap: 365 days, aggregation and level boundaries', () => {
    const habit1 = {
      id: 'h-1',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Habit 1',
        targetFrequency: 1,
        logs: { '2026-10-30': true, '2026-10-29': true },
      },
    };
    const habit2 = {
      id: 'h-2',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Habit 2',
        targetFrequency: 1,
        logs: { '2026-10-30': true, '2026-10-29': true },
      },
    };
    const habit3 = {
      id: 'h-3',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Habit 3',
        targetFrequency: 1,
        logs: { '2026-10-30': true },
      },
    };
    const habit4 = {
      id: 'h-4',
      collection: 'habits',
      createdAt: 1,
      updatedAt: 1,
      payload: {
        title: 'Habit 4',
        targetFrequency: 1,
        logs: { '2026-10-30': true },
      },
    };

    const heatmap = buildAnnualHeatmap([habit1, habit2, habit3, habit4], '2026-10-30');
    assert.equal(heatmap.length, 365);
    assert.equal(heatmap[364]!.date, '2026-10-30');

    // On 2026-10-30: all 4 checked -> count 4 -> level 4
    const todayCell = heatmap[364]!;
    assert.equal(todayCell.count, 4);
    assert.equal(todayCell.level, 4);

    // On 2026-10-29: 2 checked -> count 2 -> level 2
    const yesterdayCell = heatmap[363]!;
    assert.equal(yesterdayCell.date, '2026-10-29');
    assert.equal(yesterdayCell.count, 2);
    assert.equal(yesterdayCell.level, 2);

    // Old day with 0 checked -> level 0
    assert.equal(heatmap[0]!.count, 0);
    assert.equal(heatmap[0]!.level, 0);
  });
});

// =========================================================================
// Suite 5: 日程冲突校验 (Calendar Schedule Conflict Detection)
// =========================================================================
describe('Domain Rule 5: 日程冲突校验 (Calendar Schedule Conflict Detection)', () => {
  it('Time conflicts: partial overlap, full inclusion, exact match', () => {
    const e1 = createMockEvent({
      id: 'e1',
      payload: { startDate: '2026-10-30', startTime: '09:00', endTime: '10:30' },
    });
    const e2 = createMockEvent({
      id: 'e2',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });

    const conflicts = detectEventConflicts([e1, e2]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.overlapMinutes, 30); // 10:00 to 10:30
  });

  it('No conflict: back-to-back events (touching boundary) and disjoint events', () => {
    const e1 = createMockEvent({
      id: 'e1',
      payload: { startDate: '2026-10-30', startTime: '09:00', endTime: '10:00' },
    });
    const e2 = createMockEvent({
      id: 'e2',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });
    const e3 = createMockEvent({
      id: 'e3',
      payload: { startDate: '2026-10-30', startTime: '13:00', endTime: '14:00' },
    });

    const conflicts = detectEventConflicts([e1, e2, e3]);
    assert.equal(conflicts.length, 0);
  });

  it('One minute overlap detected; multiple conflicting pairs', () => {
    const e1 = createMockEvent({
      id: 'e1',
      payload: { startDate: '2026-10-30', startTime: '09:00', endTime: '10:01' },
    });
    const e2 = createMockEvent({
      id: 'e2',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });
    const conflicts = detectEventConflicts([e1, e2]);
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0]!.overlapMinutes, 1);

    // 3 events all overlapping at 10:00-11:00 -> 3 pairs
    const eA = createMockEvent({
      id: 'eA',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });
    const eB = createMockEvent({
      id: 'eB',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });
    const eC = createMockEvent({
      id: 'eC',
      payload: { startDate: '2026-10-30', startTime: '10:00', endTime: '11:00' },
    });
    assert.equal(detectEventConflicts([eA, eB, eC]).length, 3);
  });

  it('No conflict across different dates or with allDay events', () => {
    const e1 = createMockEvent({
      id: 'e1',
      payload: { startDate: '2026-10-30', startTime: '09:00', endTime: '11:00' },
    });
    const e2DifferentDate = createMockEvent({
      id: 'e2',
      payload: { startDate: '2026-10-31', startTime: '09:00', endTime: '11:00' },
    });
    const e3AllDay = createMockEvent({
      id: 'e3',
      payload: { startDate: '2026-10-30', startTime: '09:00', endTime: '11:00', allDay: true },
    });

    const conflicts = detectEventConflicts([e1, e2DifferentDate, e3AllDay]);
    assert.equal(conflicts.length, 0);
  });

  it('Month matrix: grid dimensions (5 or 6 weeks x 7), padding flags, task/event mapping', () => {
    // Oct 2026 (month index 9) starts on Thursday -> 4 prev month days + 31 days = 35 cells (5 weeks)
    const task = createMockTask({ payload: { dueDate: '2026-10-15' } });
    const event = createMockEvent({ payload: { startDate: '2026-10-15' } });

    const matrix = buildMonthMatrix(2026, 9, [task], [event]);
    assert.equal(matrix.length, 5); // 5 weeks
    for (const week of matrix) {
      assert.equal(week.length, 7); // 7 days each
    }

    const flatCells = matrix.flat();
    assert.equal(flatCells.length, 35);

    // Check padding from September (Sep 27, 28, 29, 30)
    assert.equal(flatCells[0]!.date, '2026-09-27');
    assert.equal(flatCells[0]!.isCurrentMonth, false);

    // Check Oct 1st
    assert.equal(flatCells[4]!.date, '2026-10-01');
    assert.equal(flatCells[4]!.isCurrentMonth, true);

    // Check task & event indexed on Oct 15
    const cell15 = flatCells.find((c) => c.date === '2026-10-15');
    assert.ok(cell15);
    assert.equal(cell15.tasks.length, 1);
    assert.equal(cell15.events.length, 1);

    // Month requiring 6 weeks (42 cells), e.g., May 2026 (May 1 is Friday)
    const matrixMay = buildMonthMatrix(2026, 4, [], []);
    assert.equal(matrixMay.length, 6); // 6 weeks = 42 cells
    assert.equal(matrixMay.flat().length, 42);
  });
});

// =========================================================================
// Suite 6: 预算与周复盘核算 (Budget & Weekly Review Calculation)
// =========================================================================
describe('Domain Rule 6: 预算与周复盘核算 (Budget & Weekly Review Calculation)', () => {
  it('calculateBudgetStatus: expenses, income, remaining budget and usage percentage', () => {
    const transactions: RecordItem<TransactionRecord>[] = [
      {
        id: 't-1',
        collection: 'transactions',
        createdAt: 1,
        updatedAt: 1,
        payload: { type: 'expense', amount: 1500, category: 'Food', date: '2026-10-05' },
      },
      {
        id: 't-2',
        collection: 'transactions',
        createdAt: 1,
        updatedAt: 1,
        payload: { type: 'expense', amount: 500, category: 'Transport', date: '2026-10-12' },
      },
      {
        id: 't-3',
        collection: 'transactions',
        createdAt: 1,
        updatedAt: 1,
        payload: { type: 'income', amount: 8000, category: 'Salary', date: '2026-10-01' },
      },
      // Different month transaction: should be excluded
      {
        id: 't-4',
        collection: 'transactions',
        createdAt: 1,
        updatedAt: 1,
        payload: { type: 'expense', amount: 9999, category: 'Old', date: '2026-09-20' },
      },
    ];

    const now = new Date(2026, 9, 20); // Oct 20, 2026 (31 days in Oct -> 31 - 20 + 1 = 12 days remaining)
    const budget = calculateBudgetStatus(6000, transactions, now);

    assert.equal(budget.monthlyBudget, 6000);
    assert.equal(budget.totalExpenses, 2000); // 1500 + 500
    assert.equal(budget.totalIncome, 8000);
    assert.equal(budget.remainingBudget, 4000); // 6000 - 2000
    assert.equal(budget.daysRemainingInMonth, 12);
    // 4000 / 12 = 333.33
    assert.equal(budget.dailyAvailableBudget, 333.33);
    // (2000 / 6000) * 100 = 33%
    assert.equal(budget.usagePercentage, 33);
  });

  it('calculateBudgetStatus: overbudget boundaries (capped usage, 0 daily available)', () => {
    const transactions: RecordItem<TransactionRecord>[] = [
      {
        id: 't-1',
        collection: 'transactions',
        createdAt: 1,
        updatedAt: 1,
        payload: { type: 'expense', amount: 7000, category: 'Rent', date: '2026-10-01' },
      },
    ];

    const now = new Date(2026, 9, 31); // Last day of month
    const budget = calculateBudgetStatus(5000, transactions, now);

    assert.equal(budget.remainingBudget, -2000);
    assert.equal(budget.dailyAvailableBudget, 0); // No negative daily budget
    assert.equal(budget.usagePercentage, 100); // Capped at 100%
    assert.equal(budget.daysRemainingInMonth, 1); // Last day = 1 day remaining
  });

  it('generateWeeklyReview: week range Monday to Sunday, completed vs overdue classification', () => {
    // 2026-10-28 is Wednesday.
    // Week: Monday 2026-10-26 to Sunday 2026-11-01
    const refDate = new Date(2026, 9, 28);

    const taskCompletedThisWeek = createMockTask({
      id: 't-comp',
      payload: {
        completed: true,
        completedAt: new Date(2026, 9, 27).getTime(), // Tuesday this week
        snoozeCount: 1,
      },
    });

    const taskCompletedLastWeek = createMockTask({
      id: 't-comp-old',
      payload: {
        completed: true,
        completedAt: new Date(2026, 9, 20).getTime(), // Last week
        snoozeCount: 0,
      },
    });

    const taskPendingOverdue = createMockTask({
      id: 't-overdue',
      payload: {
        completed: false,
        dueDate: '2026-10-25', // Overdue before today (2026-10-28)
        snoozeCount: 2,
      },
    });

    const taskPendingFuture = createMockTask({
      id: 't-future',
      payload: {
        completed: false,
        dueDate: '2026-10-31', // Later this week
        snoozeCount: 1,
      },
    });

    const review = generateWeeklyReview(
      [taskCompletedThisWeek, taskCompletedLastWeek, taskPendingOverdue, taskPendingFuture],
      refDate,
    );

    assert.equal(review.startOfWeek, '2026-10-26');
    assert.equal(review.endOfWeek, '2026-11-01');
    assert.equal(review.completedTasks.length, 1);
    assert.equal(review.completedTasks[0]!.id, 't-comp');
    assert.equal(review.pendingTasks.length, 2);
    assert.equal(review.overdueTasks.length, 1);
    assert.equal(review.overdueTasks[0]!.id, 't-overdue');
    // Total snooze count = 1 + 0 + 2 + 1 = 4
    assert.equal(review.snoozedCountTotal, 4);
    // Completion rate = 1 / (1 + 2) = 33%
    assert.equal(review.completionRate, 33);
  });

  it('generateWeeklyReview: executed on Monday vs Sunday edge days', () => {
    // Reference on Monday 2026-10-26
    const monday = new Date(2026, 9, 26);
    const reviewMon = generateWeeklyReview([], monday);
    assert.equal(reviewMon.startOfWeek, '2026-10-26');
    assert.equal(reviewMon.endOfWeek, '2026-11-01');

    // Reference on Sunday 2026-11-01
    const sunday = new Date(2026, 10, 1);
    const reviewSun = generateWeeklyReview([], sunday);
    assert.equal(reviewSun.startOfWeek, '2026-10-26');
    assert.equal(reviewSun.endOfWeek, '2026-11-01');
  });
});

// =========================================================================
// Suite 7: 全局关键词检索 (Global Keyword Search)
// =========================================================================
describe('Domain Rule 7: 全局关键词检索 (Global Keyword Search)', () => {
  it('Empty query returns empty array', () => {
    const records = [createMockTask({ payload: { title: 'Test Task' } })];
    assert.deepEqual(searchRecords(records, ''), []);
    assert.deepEqual(searchRecords(records, '   '), []);
  });

  it('Scoring weights: exact match (100), prefix match (60), substring match (40), content (20), tag (30)', () => {
    const recordExact = createMockTask({
      id: 'r-exact',
      payload: { title: 'report' },
    });
    const recordPrefix = createMockTask({
      id: 'r-prefix',
      payload: { title: 'reporting quarterly' },
    });
    const recordSubstring = createMockTask({
      id: 'r-sub',
      payload: { title: 'annual report final' },
    });
    const recordContentOnly = createMockTask({
      id: 'r-content',
      payload: { title: 'meeting', notes: 'need to check the report soon' },
    });
    const recordTagOnly = createMockTask({
      id: 'r-tag',
      tags: ['report-team'],
      payload: { title: 'random discussion' },
    });

    const records = [recordSubstring, recordExact, recordTagOnly, recordPrefix, recordContentOnly];
    const results = searchRecords(records, 'report');

    assert.equal(results.length, 5);
    // Highest score should be exact match (100)
    assert.equal(results[0]!.id, 'r-exact');
    assert.equal(results[0]!.score, 100);

    // Second should be prefix match (60)
    assert.equal(results[1]!.id, 'r-prefix');
    assert.equal(results[1]!.score, 60);

    // Third should be substring match (40)
    assert.equal(results[2]!.id, 'r-sub');
    assert.equal(results[2]!.score, 40);

    // Fourth should be tag match (30)
    assert.equal(results[3]!.id, 'r-tag');
    assert.equal(results[3]!.score, 30);

    // Fifth should be content only (20)
    assert.equal(results[4]!.id, 'r-content');
    assert.equal(results[4]!.score, 20);
  });

  it('Combined scoring: prefix (60) + content (20) + tag (30) = 110', () => {
    const combinedRecord = createMockTask({
      id: 'r-combo',
      tags: ['design-system'],
      payload: {
        title: 'Design guidelines',
        notes: 'review the design updates',
      },
    });

    const results = searchRecords([combinedRecord], 'design');
    assert.equal(results.length, 1);
    // Prefix 60 + Content 20 + Tag 30 = 110
    assert.equal(results[0]!.score, 110);
  });

  it('Chinese characters keyword search and fallback fields (name, content slice, id)', () => {
    const recordChinese = createMockTask({
      id: 'r-zh',
      payload: {
        title: '',
        name: '工作台前端架构',
        content: '进行个人工作台核心领域规则的测试与校验。',
      },
    });

    const results = searchRecords([recordChinese], '工作台');
    assert.equal(results.length, 1);
    assert.equal(results[0]!.id, 'r-zh');
    assert.equal(results[0]!.title, '工作台前端架构');
    // Prefix match (60) + Content match (20) = 80
    assert.equal(results[0]!.score, 80);
  });

  it('Case-insensitive match, snippet generation, and limit', () => {
    const record = createMockTask({
      id: 'r-snippet',
      payload: {
        title: 'Project Alpha',
        content: 'The quick brown fox jumps over the LAZY dog in the garden on Friday afternoon.',
      },
    });

    const results = searchRecords([record], 'lazy');
    assert.equal(results.length, 1);
    assert.ok(results[0]!.snippet);
    assert.ok(results[0]!.snippet.includes('LAZY'));
    // Snippet has ellipsis
    assert.ok(results[0]!.snippet.includes('...'));

    // Limit truncation
    const manyRecords = Array.from({ length: 15 }, (_, i) =>
      createMockTask({ id: `r-${i}`, payload: { title: `Keyword Item ${i}` } }),
    );
    const limited = searchRecords(manyRecords, 'keyword', 5);
    assert.equal(limited.length, 5);
  });
});
