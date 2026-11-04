import React from 'react';
import { TodayFocus } from '../modules/TodayFocus/TodayFocus';
import { TodoList } from '../modules/TodoList/TodoList';
import { CalendarSchedule } from '../modules/CalendarSchedule/CalendarSchedule';
import { HabitMatrix } from '../modules/HabitMatrix/HabitMatrix';
import { MetricsDashboard } from '../modules/MetricsDashboard/MetricsDashboard';
import { QuickNotes } from '../modules/QuickNotes/QuickNotes';

export const PersonalProductivityTemplate: React.FC = () => {
  return (
    <div className="editorial-page">
      {/* 1. Today Focus Area */}
      <TodayFocus />

      {/* 2. Tasks & Calendar Grid */}
      <div className="editorial-grid">
        <TodoList initialView="list" />
        <CalendarSchedule />

        {/* 3. Metrics Dashboard */}
        <MetricsDashboard />

        {/* 4. Habits & Notes */}
        <HabitMatrix />
        <QuickNotes />
      </div>
    </div>
  );
};
