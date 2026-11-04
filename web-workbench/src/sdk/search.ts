import type { RecordItem } from './types';

export interface SearchResultItem {
  id: string;
  collection: string;
  title: string;
  snippet?: string;
  tags?: string[];
  businessDate?: string;
  record: RecordItem;
  score: number;
}

/**
 * Searches across an array of records using keyword matching.
 */
export function searchRecords(
  records: RecordItem[],
  query: string,
  limit: number = 20,
): SearchResultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResultItem[] = [];

  for (const record of records) {
    let score = 0;
    const payload = record.payload || {};

    const title = String(
      payload.title || payload.name || payload.content?.toString().slice(0, 30) || record.id,
    );
    const content = String(payload.content || payload.notes || '');

    const lowerTitle = title.toLowerCase();
    const lowerContent = content.toLowerCase();

    if (lowerTitle === q) {
      score += 100;
    } else if (lowerTitle.startsWith(q)) {
      score += 60;
    } else if (lowerTitle.includes(q)) {
      score += 40;
    }

    if (lowerContent.includes(q)) {
      score += 20;
    }

    if (record.tags) {
      for (const tag of record.tags) {
        if (tag.toLowerCase().includes(q)) {
          score += 30;
        }
      }
    }

    if (score > 0) {
      let snippet: string | undefined;
      const indexInContent = lowerContent.indexOf(q);
      if (indexInContent >= 0) {
        const start = Math.max(0, indexInContent - 20);
        const end = Math.min(content.length, indexInContent + q.length + 30);
        snippet =
          (start > 0 ? '...' : '') +
          content.slice(start, end) +
          (end < content.length ? '...' : '');
      }

      results.push({
        id: record.id,
        collection: record.collection,
        title,
        snippet,
        tags: record.tags,
        businessDate: record.businessDate,
        record,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
