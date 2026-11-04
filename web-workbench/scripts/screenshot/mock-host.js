/* Demo host bridge for screenshots: presents the workbench with sample records
   and a controllable theme, without launching the Tauri host. */
(() => {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const add = (base, days) => {
    const date = new Date(base + 'T12:00:00');
    date.setDate(date.getDate() + days);
    return fmt(date);
  };
  const today = fmt(new Date());
  const yesterday = add(today, -1);
  let seq = 0;
  const record = (collection, id, payload, tags = []) => ({
    id,
    collection,
    payload,
    tags,
    businessDate: payload.dueDate || payload.startDate || today,
    archived: false,
    assetIds: [],
    createdAt: Date.now() - ++seq * 60000,
    updatedAt: Date.now() - seq * 30000,
  });
  const task = (id, title, priority, dueDate, extra = {}) =>
    record('tasks', id, {
      title,
      priority,
      dueDate,
      completed: false,
      subtasks: [],
      snoozeCount: 0,
      ...extra,
    });

  let records = [
    task('t1', '完成系统架构设计与跨端契约冻结', 'P0', add(today, -2), {
      snoozeCount: 1,
      subtasks: [
        { id: 's1', title: '梳理宿主与前端职责边界', completed: true },
        { id: 's2', title: '定义三层抽象体系', completed: true },
        { id: 's3', title: '完成验收口径审查', completed: false },
      ],
    }),
    task('t2', '跑通离线工作台构建管线与容器查询布局', 'P1', today, {
      subtasks: [
        { id: 's4', title: '验证断网环境打包无外链引用', completed: false },
        { id: 's5', title: '测试深浅色设计令牌切换', completed: false },
      ],
    }),
    task('t3', '审阅季度设计系统规范与动效基线', 'P1', today, {
      completed: true,
      completedAt: Date.now(),
    }),
    task('t4', '配置习惯矩阵打卡与年度热力图展示', 'P2', add(today, 2)),
    task('t5', '整理本地优先架构的迁移笔记', 'P2', add(today, 1), { snoozeCount: 2 }),
    task('t6', '复盘本月指标并校准下阶段节奏', 'P1', add(today, -4), { completed: true }),
    record('habits', 'h1', {
      title: '晨间专注阅读与技术复盘',
      targetFrequency: 1,
      category: '个人成长',
      logs: { [today]: true, [yesterday]: true, [add(today, -2)]: true },
      failReasons: {},
    }),
    record('habits', 'h2', {
      title: '每日饮水 2000ml',
      targetFrequency: 1,
      category: '日常健康',
      logs: { [yesterday]: true, [add(today, -3)]: true },
      failReasons: { [today]: '外出会议，未记录' },
    }),
    record('habits', 'h3', {
      title: '力量训练 40 分钟',
      targetFrequency: 1,
      category: '日常健康',
      logs: { [add(today, -1)]: true, [add(today, -2)]: true },
      failReasons: {},
    }),
    record(
      'notes',
      'n1',
      {
        title: '个人工作台四大架构底线',
        content:
          '1. 离线零外链：构建产物完全自包含，无外部 CDN 依赖。\n2. 跨视图单一事实源：所有视图读写同一记录集合。\n3. 宿主兜底安全：沙箱安全与资产落盘由原生层管控。',
        pinned: true,
      },
      ['架构基线'],
    ),
    record(
      'notes',
      'n2',
      {
        title: '关于「少即是多」的界面笔记',
        content: '删掉一个元素，直到再删就会损失意义为止。留白不是空白，是呼吸的节奏。',
        pinned: false,
      },
      ['设计'],
    ),
    record(
      'notes',
      'n3',
      {
        title: '本周阅读清单',
        content: '《设计中的设计》第四章、《The Elements of Typographic Style》网格章节。',
        pinned: false,
      },
      ['阅读'],
    ),
    record('events', 'e1', {
      title: '架构评审：前端壳层与 SDK 边界',
      startDate: today,
      startTime: '10:00',
      endDate: today,
      endTime: '11:30',
      category: '会议',
      allDay: false,
    }),
    record('events', 'e2', {
      title: '深度工作块 · 无会议',
      startDate: add(today, 1),
      startTime: '09:00',
      endDate: add(today, 1),
      endTime: '12:00',
      category: '专注',
      allDay: false,
    }),
  ];

  const config = {
    window: { mode: 'panel', width: 1280, height: 860, resizable: true, rememberBounds: true },
    network: { allowlist: [], connections: {} },
    workbench: {
      theme: new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark',
      tokens: {},
      modules: [],
      layout: {},
      activeTemplate: 'productivity',
      initialized: true,
    },
  };

  const invoke = async (command, args = {}) => {
    const request = args.request || {};
    switch (command) {
      case 'config_get':
      case 'config_reset':
        return JSON.parse(JSON.stringify(config));
      case 'config_update':
        Object.assign(config[request.namespace], request.patch);
        return JSON.parse(JSON.stringify(config));
      case 'records_query': {
        let list = records.filter((item) => item.collection === request.collection);
        list = [...list].sort((a, b) => a.id.localeCompare(b.id));
        const offset = request.offset || 0;
        return JSON.parse(JSON.stringify(list.slice(offset, offset + (request.limit ?? 1000))));
      }
      case 'records_batch': {
        const results = [];
        for (const op of request.operations || []) {
          if (op.type === 'create') {
            const item = {
              id: op.id || 'r' + Math.random().toString(36).slice(2),
              collection: op.collection,
              ...op.data,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            records.push(item);
            results.push(item);
          } else if (op.type === 'update') {
            const item = records.find((entry) => entry.id === op.id);
            if (item) {
              Object.assign(item, op.data, { updatedAt: Date.now() });
              results.push(item);
            } else results.push(null);
          } else if (op.type === 'delete') {
            records = records.filter((entry) => entry.id !== op.id);
            results.push(null);
          }
        }
        return JSON.parse(JSON.stringify(results));
      }
      case 'window_state':
      case 'window_control':
      case 'window_apply':
      case 'workspace_reload':
        return {
          mode: 'panel',
          width: 1280,
          height: 860,
          visible: true,
          maximized: true,
          minimized: false,
        };
      case 'backup_export':
        return {
          schemaVersion: 1,
          exportedAt: Date.now(),
          records: JSON.parse(JSON.stringify(records)),
          assets: [],
        };
      case 'backup_validate':
        return { recordCount: records.length, assetCount: 0 };
      case 'backup_restore':
      case 'backup_clear':
        return { recordCount: 0, assetCount: 0 };
      default:
        return null;
    }
  };

  window.__TAURI__ = { core: { invoke }, event: { listen: async () => () => {} } };
})();
