import type { RecordItem } from '../../sdk/types';

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

/**
 * Copies text to system clipboard.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

/**
 * Exports records as a UTF-8 CSV with BOM for Excel compatibility.
 */
export function exportRecordsToCSV(
  records: RecordItem[],
  filename: string = 'workbench_records.csv',
) {
  if (records.length === 0) return;

  const headers = [
    'ID',
    '集合',
    '标题/内容',
    '业务日期',
    '标签',
    '归档状态',
    '创建时间',
    '更新时间',
  ];

  const rows = records.map((r) => {
    const payload = (r.payload || {}) as Record<string, unknown>;
    const title = String(payload.title || payload.name || payload.content || '');
    const cleanTitle = `"${title.replace(/"/g, '""')}"`;
    const cleanTags = `"${(r.tags || []).join(', ').replace(/"/g, '""')}"`;

    return [
      r.id,
      r.collection,
      cleanTitle,
      r.businessDate || '',
      cleanTags,
      r.archived ? '已归档' : '正常',
      new Date(r.createdAt).toISOString(),
      new Date(r.updatedAt).toISOString(),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Triggers clean print view.
 */
export function triggerPrint() {
  window.print();
}

/**
 * Generates and downloads a self-contained read-only static HTML snapshot.
 */
export function exportStaticHtmlSnapshot(
  title: string,
  records: RecordItem[],
  filename: string = 'workbench_snapshot.html',
) {
  const dateStr = escapeHtml(new Date().toLocaleString());
  title = escapeHtml(title);

  const recordCardsHtml = records
    .map((r) => {
      const payload = (r.payload || {}) as Record<string, unknown>;
      const itemTitle = escapeHtml(payload.title || payload.name || '未命名条目');
      const content = escapeHtml(payload.content || payload.notes || '');
      const tags = (r.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join(' ');

      return `
      <div class="card">
        <div class="card-header">
          <span class="badge">${escapeHtml(r.collection)}</span>
          <span class="date">${escapeHtml(r.businessDate)}</span>
        </div>
        <div class="title">${itemTitle}</div>
        ${content ? `<div class="content">${content}</div>` : ''}
        ${tags ? `<div class="tags">${tags}</div>` : ''}
      </div>
    `;
    })
    .join('\n');

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title} - 工作台快照</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #121318;
      color: #e2e4ea;
      margin: 0;
      padding: 30px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid #2a2b36;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 8px;
    }
    .meta {
      font-size: 12px;
      color: #7b8092;
    }
    .card {
      background: #1b1c24;
      border: 1px solid #282a36;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 11px;
    }
    .badge {
      background: #2b2e3e;
      color: #70b4ff;
      padding: 2px 8px;
      border-radius: 99px;
    }
    .date {
      color: #7b8092;
    }
    .title {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 6px;
      color: #ffffff;
    }
    .content {
      font-size: 13px;
      color: #a4a8b8;
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .tags {
      margin-top: 10px;
    }
    .tag {
      font-size: 11px;
      background: #252733;
      color: #8c91a4;
      padding: 2px 6px;
      border-radius: 4px;
      margin-right: 4px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="meta">快照生成时间：${dateStr} | 记录总数：${records.length} 条（只读视图）</div>
    </header>
    <main>
      ${recordCardsHtml || '<p style="color:#7b8092;">暂无记录</p>'}
    </main>
  </div>
</body>
</html>`;

  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
