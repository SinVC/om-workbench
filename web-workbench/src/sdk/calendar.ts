import type { RecordItem, ScheduleEventPayload, TaskPayload } from './types';
import { addDays, formatDate, parseDate } from './tasks';

export interface CalendarDayCell {
  date: string; // YYYY-MM-DD
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: RecordItem<TaskPayload>[];
  events: RecordItem<ScheduleEventPayload>[];
}

export interface EventConflict {
  event1: RecordItem<ScheduleEventPayload>;
  event2: RecordItem<ScheduleEventPayload>;
  overlapMinutes: number;
}

export function eventOccursOnDate(event: ScheduleEventPayload, date: string): boolean {
  const end = event.endDate || event.startDate;
  return (
    event.startDate <= date &&
    date <= end &&
    !(date === end && end > event.startDate && !event.allDay && event.endTime === '00:00')
  );
}

function eventInterval(event: ScheduleEventPayload): [number, number] {
  const at = (date: string, time: string) => new Date(date + 'T' + time + ':00').getTime();
  return event.allDay
    ? [at(event.startDate, '00:00'), at(addDays(event.endDate || event.startDate, 1), '00:00')]
    : [
        at(event.startDate, event.startTime || '00:00'),
        at(event.endDate || event.startDate, event.endTime || '00:00'),
      ];
}

export function validateScheduleEvent(event: ScheduleEventPayload): void {
  for (const date of [event.startDate, event.endDate]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || formatDate(parseDate(date)) !== date)
      throw new Error('请输入有效的日程日期');
  }
  if (
    !event.allDay &&
    [event.startTime, event.endTime].some(
      (time) => !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time),
    )
  )
    throw new Error('请输入有效的日程时间');
  const [start, end] = eventInterval(event);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    throw new Error('结束时间必须晚于开始时间');
}

export function detectEventConflicts(events: RecordItem<ScheduleEventPayload>[]): EventConflict[] {
  const conflicts: EventConflict[] = [];
  for (let i = 0; i < events.length; i++) {
    for (const e2 of events.slice(i + 1)) {
      const e1 = events[i];
      if (!e1 || e1.payload.allDay || e2.payload.allDay) continue;
      const [start1, end1] = eventInterval(e1.payload);
      const [start2, end2] = eventInterval(e2.payload);
      const overlapMinutes = (Math.min(end1, end2) - Math.max(start1, start2)) / 60000;
      if (overlapMinutes > 0) conflicts.push({ event1: e1, event2: e2, overlapMinutes });
    }
  }
  return conflicts;
}

/**
 * Builds a month grid matrix (6 weeks x 7 days = 42 cells) with padding days from previous and next months.
 */
export function buildMonthMatrix(
  year: number,
  month: number, // 0-based: 0 = Jan, 11 = Dec
  tasks: RecordItem<TaskPayload>[] = [],
  events: RecordItem<ScheduleEventPayload>[] = [],
): CalendarDayCell[][] {
  const todayStr = formatDate(new Date());
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Index tasks and events by date for fast lookup
  const tasksByDate = new Map<string, RecordItem<TaskPayload>[]>();
  for (const t of tasks) {
    const d = t.payload.dueDate || t.businessDate;
    if (d) {
      if (!tasksByDate.has(d)) tasksByDate.set(d, []);
      tasksByDate.get(d)!.push(t);
    }
  }

  const cells: CalendarDayCell[] = [];

  // Previous month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevDate = new Date(year, month - 1, day);
    const dateStr = formatDate(prevDate);
    cells.push({
      date: dateStr,
      dayOfMonth: day,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      tasks: tasksByDate.get(dateStr) || [],
      events: events.filter((event) => eventOccursOnDate(event.payload, dateStr)),
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const currDate = new Date(year, month, day);
    const dateStr = formatDate(currDate);
    cells.push({
      date: dateStr,
      dayOfMonth: day,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
      tasks: tasksByDate.get(dateStr) || [],
      events: events.filter((event) => eventOccursOnDate(event.payload, dateStr)),
    });
  }

  // Next month padding to reach full 35 or 42 cells
  const remaining = (7 - (cells.length % 7)) % 7;
  const targetTotal = cells.length + remaining < 35 ? 35 : cells.length + remaining;
  const nextMonthCount = targetTotal - cells.length;

  for (let day = 1; day <= nextMonthCount; day++) {
    const nextDate = new Date(year, month + 1, day);
    const dateStr = formatDate(nextDate);
    cells.push({
      date: dateStr,
      dayOfMonth: day,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
      tasks: tasksByDate.get(dateStr) || [],
      events: events.filter((event) => eventOccursOnDate(event.payload, dateStr)),
    });
  }

  // Chunk into 7-day rows
  const weeks: CalendarDayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }

  return weeks;
}
