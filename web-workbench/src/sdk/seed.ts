import type { HabitPayload, NotePayload, Operation, TaskPayload } from './types';
import { addDays, formatDate } from './tasks';
import { workbench } from './client';

let seedPromise: Promise<boolean> | undefined;

export function checkAndSeedInitialData(): Promise<boolean> {
  seedPromise ??= seedInitialData().finally(() => {
    seedPromise = undefined;
  });
  return seedPromise;
}

async function seedInitialData(): Promise<boolean> {
  const config = await workbench.config.get();
  if (config.workbench?.initialized) {
    return false;
  }

  // Check if tasks collection already has records
  const existing = await workbench.records.query({
    collection: 'tasks',
    limit: 1,
  });

  const otherData = await Promise.all(
    ['habits', 'notes', 'events'].map((collection) =>
      workbench.records.query({ collection, limit: 1 }),
    ),
  );
  if (existing.length > 0 || otherData.some((records) => records.length > 0)) {
    // Already has data, just mark initialized so we don't query again
    await workbench.config.update('workbench', { initialized: true });
    return false;
  }

  const today = formatDate(new Date());
  const overdueDate = addDays(today, -2);
  const futureDate = addDays(today, 2);
  const yesterday = addDays(today, -1);

  const operations: Operation[] = [
    // 1. Overdue P0 task (triggers red highlight in TodayFocus)
    {
      type: 'create',
      collection: 'tasks',
      id: 'seed-task-overdue',
      data: {
        payload: {
          title: '完成系统架构设计与跨端契约冻结',
          priority: 'P0',
          dueDate: overdueDate,
          dueTime: '18:00',
          notes: '必须严格遵循最小必要原则与单一事实源约束。',
          completed: false,
          subtasks: [
            { id: 'sub-1', title: '梳理宿主与前端职责边界', completed: true },
            { id: 'sub-2', title: '定义三层抽象体系与稳定错误码', completed: true },
            { id: 'sub-3', title: '完成验收口径审查', completed: false },
          ],
          snoozeCount: 1,
          originalDueDate: addDays(overdueDate, -1),
        } satisfies TaskPayload,
        tags: ['核心架构', 'P0', '必办'],
        businessDate: overdueDate,
        archived: false,
        assetIds: [],
      },
    },

    // 2. Due today P1 task
    {
      type: 'create',
      collection: 'tasks',
      id: 'seed-task-today',
      data: {
        payload: {
          title: '跑通离线工作台构建管线与容器查询布局',
          priority: 'P1',
          dueDate: today,
          dueTime: '20:00',
          notes: '保证侧栏与面板双形态下文字不折叠、内容自适应降级。',
          completed: false,
          subtasks: [
            { id: 'sub-4', title: '验证断网环境打包无外链引用', completed: false },
            { id: 'sub-5', title: '测试深浅色设计令牌无缝切换', completed: false },
          ],
          snoozeCount: 0,
          originalDueDate: today,
        } satisfies TaskPayload,
        tags: ['前端', '响应式'],
        businessDate: today,
        archived: false,
        assetIds: [],
      },
    },

    // 3. Due in 2 days P2 task
    {
      type: 'create',
      collection: 'tasks',
      id: 'seed-task-future',
      data: {
        payload: {
          title: '配置习惯矩阵打卡与年度热力图展示',
          priority: 'P2',
          dueDate: futureDate,
          dueTime: '21:00',
          notes: '支持每日打卡打通 365 格年度色阶与连续天数统计。',
          completed: false,
          subtasks: [],
          snoozeCount: 0,
          originalDueDate: futureDate,
        } satisfies TaskPayload,
        tags: ['习惯', '统计'],
        businessDate: futureDate,
        archived: false,
        assetIds: [],
      },
    },

    // 4. Habit check-in seed
    {
      type: 'create',
      collection: 'habits',
      id: 'seed-habit-reading',
      data: {
        payload: {
          title: '晨间专注阅读与技术复盘',
          targetFrequency: 1,
          category: '个人成长',
          logs: {
            [yesterday]: true,
            [today]: true,
          },
          failReasons: {},
        } satisfies HabitPayload,
        tags: ['习惯', '阅读'],
        businessDate: today,
        archived: false,
        assetIds: [],
      },
    },

    // 5. Quick notes seed
    {
      type: 'create',
      collection: 'notes',
      id: 'seed-note-manifesto',
      data: {
        payload: {
          title: '个人工作台四大架构底线',
          content:
            '1. 离线零外链：构建产物完全自包含，无外部 CDN 依赖\n2. 跨视图单一事实源：所有视图读写同一记录集合，绝无多重副本\n3. 宿主兜底安全：沙箱安全与资产落盘由 Tauri 原生管控\n4. 简单优先：面向 Agent 白盒化交付，去除冗余黑盒抽象',
          pinned: true,
        } satisfies NotePayload,
        tags: ['架构基线', '置顶'],
        businessDate: today,
        archived: false,
        assetIds: [],
      },
    },
  ];

  await workbench.records.batch(operations);

  // Mark workspace as initialized
  await workbench.config.update('workbench', { initialized: true });

  return true;
}
