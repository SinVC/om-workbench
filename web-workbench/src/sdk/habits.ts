import type { HabitPayload, RecordItem } from './types';
import { addDays, formatDate, parseDate } from './tasks';

export interface HabitStreakStats {
  currentStreak: number;
  longestStreak: number;
  totalCompleted: number;
  completionRate7Days: number;
  completionRate30Days: number;
}

/**
 * Calculates current streak and longest streak for a habit.
 */
export function calculateHabitStreaks(
  habit: RecordItem<HabitPayload>,
  todayStr: string = formatDate(new Date()),
): HabitStreakStats {
  const logs = habit.payload.logs || {};
  const dates = Object.keys(logs)
    .filter((d) => logs[d])
    .sort();

  const totalCompleted = dates.length;

  if (dates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalCompleted: 0,
      completionRate7Days: 0,
      completionRate30Days: 0,
    };
  }

  // Calculate longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: Date | null = null;

  for (const dateStr of dates) {
    const currDate = parseDate(dateStr);
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diffMs = currDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak += 1;
      } else {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
    prevDate = currDate;
  }

  // Calculate current streak
  let currentStreak = 0;
  const yesterdayStr = addDays(todayStr, -1);

  // If today is checked, count backwards from today; if not checked, check if yesterday was checked
  let checkCursor = logs[todayStr] ? todayStr : logs[yesterdayStr] ? yesterdayStr : null;

  if (checkCursor) {
    while (logs[checkCursor]) {
      currentStreak += 1;
      checkCursor = addDays(checkCursor, -1);
    }
  }

  // Calculate 7-day and 30-day completion rates
  let completed7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(todayStr, -i);
    if (logs[d]) completed7 += 1;
  }

  let completed30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = addDays(todayStr, -i);
    if (logs[d]) completed30 += 1;
  }

  return {
    currentStreak,
    longestStreak,
    totalCompleted,
    completionRate7Days: Math.round((completed7 / 7) * 100),
    completionRate30Days: Math.round((completed30 / 30) * 100),
  };
}

export interface HeatmapDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Builds a 365-day array of daily completion counts aggregated across habits.
 */
export function buildAnnualHeatmap(
  habits: RecordItem<HabitPayload>[],
  endDateStr: string = formatDate(new Date()),
): HeatmapDay[] {
  const result: HeatmapDay[] = [];
  const countsByDate: Record<string, number> = {};

  for (const habit of habits) {
    const logs = habit.payload.logs || {};
    for (const [date, checked] of Object.entries(logs)) {
      if (checked) {
        countsByDate[date] = (countsByDate[date] || 0) + 1;
      }
    }
  }

  for (let i = 364; i >= 0; i--) {
    const date = addDays(endDateStr, -i);
    const count = countsByDate[date] || 0;
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (count >= 4) level = 4;
    else if (count === 3) level = 3;
    else if (count === 2) level = 2;
    else if (count === 1) level = 1;

    result.push({ date, count, level });
  }

  return result;
}
