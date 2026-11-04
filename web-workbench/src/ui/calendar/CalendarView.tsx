import React, { useEffect, useRef, useState } from 'react';
import FullCalendar, { type CalendarRef } from '@fullcalendar/react';
import classicThemePlugin from '@fullcalendar/react/themes/classic';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import zhLocale from '@fullcalendar/react/locales/zh-cn';
import type { CalendarOptions, EventDropInfo } from '@fullcalendar/react';
import type { RecordItem, ScheduleEventPayload, TaskPayload } from '../../sdk/types';
import { eventOccursOnDate } from '../../sdk/calendar';
import { addDays, formatDate } from '../../sdk/tasks';
import { useAction } from '../../sdk/hooks';
import { Input } from '../primitives/Input';
import { Button } from '../primitives/Button';
import { Icon } from '../icons/Icon';

export interface CalendarViewProps {
  tasks: RecordItem<TaskPayload>[];
  events?: RecordItem<ScheduleEventPayload>[];
  onSelectDate?: (date: string) => void;
  onRescheduleTask?: (taskId: string, newDueDate: string) => Promise<void>;
  onRescheduleEvent?: (eventId: string, patch: Partial<ScheduleEventPayload>) => Promise<void>;
  calendarOptions?: CalendarOptions;
}
export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  events = [],
  onSelectDate,
  onRescheduleTask,
  onRescheduleEvent,
  calendarOptions,
}) => {
  const container = useRef<HTMLDivElement>(null);
  const calendar = useRef<CalendarRef>(null);
  const [width, setWidth] = useState(0);
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const action = useAction();
  const compact = width < 520;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const select = (date: string) => {
    setSelectedDate(date);
    onSelectDate?.(date);
    calendar.current?.getApi().gotoDate(date);
  };
  const selectedTasks = tasks.filter(
    (task) => (task.payload.dueDate || task.businessDate) === selectedDate,
  );
  const selectedEvents = events.filter((event) => eventOccursOnDate(event.payload, selectedDate));
  const handleDrop = (info: EventDropInfo) => {
    void action.run(async () => {
      try {
        const start = info.event.start;
        if (!start) return;
        const id = String(info.event.extendedProps.recordId);
        if (info.event.extendedProps.kind === 'task' && onRescheduleTask)
          await onRescheduleTask(id, formatDate(start));
        else if (onRescheduleEvent) {
          const end = info.event.end || start;
          const time = (date: Date) => date.toTimeString().slice(0, 5);
          await onRescheduleEvent(id, {
            startDate: formatDate(start),
            endDate: info.event.allDay ? addDays(formatDate(end), -1) : formatDate(end),
            startTime: time(start),
            endTime: time(end),
            allDay: info.event.allDay,
          });
        }
      } catch (error) {
        info.revert();
        throw error;
      }
    });
  };
  return (
    <div ref={container} className="calendar-view module-container">
      {action.error && <p role="alert">{action.error}</p>}
      <div className="calendar-date-picker calendar-toolbar">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => select(addDays(selectedDate, -1))}
          aria-label="前一天"
          title="前一天"
        >
          <Icon name="fa-chevron-left" />
        </Button>
        <Input
          type="date"
          aria-label="查看日期"
          value={selectedDate}
          onChange={(event) => {
            if (event.target.value) select(event.target.value);
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => select(addDays(selectedDate, 1))}
          aria-label="后一天"
          title="后一天"
        >
          <Icon name="fa-chevron-right" />
        </Button>
        <Button size="sm" variant="outline" onClick={() => select(formatDate(new Date()))}>
          今天
        </Button>
      </div>
      {!compact && (
        <div className="calendar-surface">
          <FullCalendar
            ref={calendar}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, classicThemePlugin]}
            locale={zhLocale}
            initialView="dayGridMonth"
            initialDate={selectedDate}
            headerToolbar={{
              left: 'prev,next',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay',
            }}
            toolbarTitleClass="cal-title"
            height="auto"
            dayMaxEventRows={3}
            dayCellClass={(info) => (info.isOther ? 'cal-cell cal-outside' : 'cal-cell')}
            {...calendarOptions}
            events={[
              ...tasks
                .filter((task) => task.payload.dueDate || task.businessDate)
                .map((task) => ({
                  id: 'task-' + task.id,
                  title: task.payload.title,
                  start: task.payload.dueDate || task.businessDate,
                  allDay: true,
                  startEditable: Boolean(onRescheduleTask),
                  durationEditable: false,
                  color: task.payload.completed ? 'var(--color-revenue)' : 'var(--accent-primary)',
                  contrastColor: 'var(--bg-workbench)',
                  extendedProps: { kind: 'task', recordId: task.id },
                })),
              ...events.map((event) => ({
                id: 'event-' + event.id,
                title: event.payload.title,
                start:
                  event.payload.startDate +
                  (event.payload.allDay ? '' : 'T' + (event.payload.startTime || '00:00')),
                end: event.payload.allDay
                  ? addDays(event.payload.endDate || event.payload.startDate, 1)
                  : (event.payload.endDate || event.payload.startDate) +
                    'T' +
                    (event.payload.endTime || '00:00'),
                allDay: Boolean(event.payload.allDay),
                startEditable: Boolean(onRescheduleEvent),
                durationEditable: false,
                color: 'var(--bg-surface-elevated)',
                contrastColor: 'var(--text-primary)',
                extendedProps: { kind: 'event', recordId: event.id },
              })),
            ]}
            dateClick={(info) => select(info.dateStr.slice(0, 10))}
            eventClick={(info) => {
              if (info.event.start) select(formatDate(info.event.start));
            }}
            eventDrop={handleDrop}
          />
        </div>
      )}
      <section className="calendar-day-details" aria-label="当日明细">
        <h4>{selectedDate} · 日程与任务</h4>
        {selectedTasks.length + selectedEvents.length === 0 && <p>本日无待办或日程事项</p>}
        {selectedTasks.map((task) => (
          <div key={'task-' + task.id}>
            <span>
              <Icon name={task.payload.completed ? 'fa-circle-check' : 'fa-circle'} />{' '}
              {task.payload.title}
            </span>
            {task.payload.completed ? <small>已完成</small> : null}
          </div>
        ))}
        {selectedEvents.map((event) => (
          <div key={'event-' + event.id}>
            <span>
              <Icon name="fa-calendar-day" /> {event.payload.title}
            </span>
            <small>
              {event.payload.allDay
                ? '全天'
                : event.payload.startDate +
                  ' ' +
                  event.payload.startTime +
                  ' — ' +
                  event.payload.endDate +
                  ' ' +
                  event.payload.endTime}
            </small>
          </div>
        ))}
      </section>
    </div>
  );
};
