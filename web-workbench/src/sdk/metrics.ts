import type { RecordItem, TaskPayload } from './types';
import { formatDate } from './tasks';

export interface BudgetStatus {
  monthlyBudget: number;
  totalExpenses: number;
  totalIncome: number;
  remainingBudget: number;
  daysRemainingInMonth: number;
  dailyAvailableBudget: number;
  usagePercentage: number;
}

export interface TransactionRecord {
  type: 'expense' | 'income';
  amount: number;
  category: string;
  date: string;
  notes?: string;
}

/**
 * Calculates monthly budget, total expenses, remaining amount, and daily available quota.
 */
export function calculateBudgetStatus(
  monthlyBudget: number,
  transactions: RecordItem<TransactionRecord>[],
  now: Date = new Date(),
): BudgetStatus {
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const currentDay = now.getDate();
  const daysRemainingInMonth = Math.max(1, daysInMonth - currentDay + 1);

  let totalExpenses = 0;
  let totalIncome = 0;

  for (const t of transactions) {
    if (t.payload.date && t.payload.date.startsWith(currentMonthStr)) {
      if (t.payload.type === 'expense') {
        totalExpenses += t.payload.amount;
      } else if (t.payload.type === 'income') {
        totalIncome += t.payload.amount;
      }
    }
  }

  const remainingBudget = monthlyBudget - totalExpenses;
  const dailyAvailableBudget =
    remainingBudget > 0 ? Math.round((remainingBudget / daysRemainingInMonth) * 100) / 100 : 0;
  const usagePercentage =
    monthlyBudget > 0 ? Math.min(100, Math.round((totalExpenses / monthlyBudget) * 100)) : 0;

  return {
    monthlyBudget,
    totalExpenses,
    totalIncome,
    remainingBudget,
    daysRemainingInMonth,
    dailyAvailableBudget,
    usagePercentage,
  };
}

export interface WeeklyReviewData {
  startOfWeek: string;
  endOfWeek: string;
  completedTasks: RecordItem<TaskPayload>[];
  pendingTasks: RecordItem<TaskPayload>[];
  overdueTasks: RecordItem<TaskPayload>[];
  totalCreated: number;
  completionRate: number;
  snoozedCountTotal: number;
}

/**
 * Generates structured weekly review data: completed tasks this week vs pending carry-over tasks.
 */
export function generateWeeklyReview(
  tasks: RecordItem<TaskPayload>[],
  now: Date = new Date(),
): WeeklyReviewData {
  // Determine current week's Monday and Sunday
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startOfWeek = formatDate(monday);
  const endOfWeek = formatDate(sunday);
  const todayStr = formatDate(now);

  const completedTasks: RecordItem<TaskPayload>[] = [];
  const pendingTasks: RecordItem<TaskPayload>[] = [];
  const overdueTasks: RecordItem<TaskPayload>[] = [];
  let snoozedCountTotal = 0;

  for (const t of tasks) {
    snoozedCountTotal += t.payload.snoozeCount || 0;

    if (t.payload.completed) {
      if (t.payload.completedAt) {
        const completedDateStr = formatDate(new Date(t.payload.completedAt));
        if (completedDateStr >= startOfWeek && completedDateStr <= endOfWeek) {
          completedTasks.push(t);
        }
      } else {
        completedTasks.push(t);
      }
    } else {
      if (t.payload.dueDate && t.payload.dueDate < todayStr) {
        overdueTasks.push(t);
      }
      pendingTasks.push(t);
    }
  }

  const totalRelevant = completedTasks.length + pendingTasks.length;
  const completionRate =
    totalRelevant > 0 ? Math.round((completedTasks.length / totalRelevant) * 100) : 0;

  return {
    startOfWeek,
    endOfWeek,
    completedTasks,
    pendingTasks,
    overdueTasks,
    totalCreated: tasks.length,
    completionRate,
    snoozedCountTotal,
  };
}
