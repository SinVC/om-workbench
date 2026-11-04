import React from 'react';
import type { WorkbenchTemplate } from './types';
import { PersonalProductivityTemplate } from './PersonalProductivity';
import { MinimalFocusTemplate } from './MinimalFocus';
import { KnowledgeHabitTemplate } from './KnowledgeHabit';

export * from './types';
export * from './PersonalProductivity';
export * from './MinimalFocus';
export * from './KnowledgeHabit';

export const WORKBENCH_TEMPLATES: WorkbenchTemplate[] = [
  {
    id: 'productivity',
    name: '全能效率工作台',
    description: '聚合今日聚焦、待办多视图、日历排程、习惯打卡、指标与速记',
    icon: '⚡',
    render: () => React.createElement(PersonalProductivityTemplate),
  },
  {
    id: 'minimal',
    name: '极简专注工作台',
    description: '聚焦待办重点，以四象限与核心完成率指标驱动专注推进',
    icon: '🎯',
    render: () => React.createElement(MinimalFocusTemplate),
  },
  {
    id: 'knowledge',
    name: '习惯复盘与知识库',
    description: '主打 365 格习惯坚持热力图、断卡归因与轻量速记灵感库',
    icon: '📚',
    render: () => React.createElement(KnowledgeHabitTemplate),
  },
];
