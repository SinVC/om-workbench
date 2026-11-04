/**
 * Core type definitions for personal-workbench SDK.
 * Matches the IPC contracts defined in dev-doc/shared/ipc-contract-and-data-model.md
 */

export type { HostError, WindowState, WindowAction } from './host';
export type WindowMode = 'sidebar' | 'panel';

export interface RecordData<T = Record<string, unknown>> {
  payload: T;
  tags?: string[];
  businessDate?: string; // YYYY-MM-DD
  archived?: boolean;
  assetIds?: string[]; // Max 9 assets
}

export interface RecordItem<T = Record<string, unknown>> extends RecordData<T> {
  id: string;
  collection: string;
  createdAt: number;
  updatedAt: number;
}

export type RecordSort = 'createdAt' | 'updatedAt' | 'businessDate' | 'id';

export interface PayloadFilter {
  path: string[];
  value: unknown;
}

export interface RecordQuery {
  collection: string;
  tags?: string[];
  businessDate?: string;
  archived?: boolean;
  filters?: PayloadFilter[];
  sort?: RecordSort;
  descending?: boolean;
  limit?: number;
  offset?: number;
}

export type Operation<T = Record<string, unknown>> =
  | {
      type: 'create';
      collection: string;
      id?: string;
      data: RecordData<T>;
    }
  | {
      type: 'update';
      id: string;
      data: RecordData<T>;
      expectedUpdatedAt?: number;
    }
  | {
      type: 'delete';
      id: string;
      expectedUpdatedAt?: number;
    };

export interface AssetInfo {
  id: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  url: string;
}

export interface BackupAsset {
  id: string;
  mime: string;
  byteSize: number;
  width: number;
  height: number;
  bytes?: number[];
}

export interface Backup {
  schemaVersion: number;
  exportedAt: number;
  records: RecordItem[];
  assets: BackupAsset[];
}

export interface BackupSummary {
  recordCount: number;
  assetCount: number;
}

export interface WindowConfig {
  mode: WindowMode;
  width: number;
  height: number;
  resizable: boolean;
  rememberBounds: boolean;
}

export interface NetworkConfig {
  allowlist: string[];
  connections: Record<string, unknown>;
}

export interface WorkbenchConfig {
  theme: 'dark' | 'light';
  tokens: Record<string, string>;
  modules: string[];
  layout: Record<string, unknown>;
  activeTemplate?: string;
  initialized?: boolean;
}

export interface AppConfig {
  window: WindowConfig;
  network: NetworkConfig;
  workbench: WorkbenchConfig;
}

// ============ Business Domain Models ============

export type Priority = 'P0' | 'P1' | 'P2';
export type TaskQuadrant = 'q1' | 'q2' | 'q3' | 'q4';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export type RecurType = 'daily' | 'weekly' | 'monthly' | 'interval';

export interface RecurRule {
  type: RecurType;
  intervalDays?: number; // for 'interval' type
  daysOfWeek?: number[]; // 0=Sun, 1=Mon, ..., 6=Sat for 'weekly'
}

export interface TaskPayload {
  [key: string]: unknown;
  title: string;
  priority: Priority;
  quadrant?: TaskQuadrant;
  listId?: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm
  notes?: string;
  completed: boolean;
  completedAt?: number;
  subtasks: Subtask[];
  recurRule?: RecurRule;
  snoozeCount: number;
  originalDueDate?: string;
}

export interface HabitPayload {
  [key: string]: unknown;
  title: string;
  targetFrequency: number; // e.g. 1 per day
  category?: string;
  logs: Record<string, boolean>; // date (YYYY-MM-DD) -> checked
  failReasons?: Record<string, string>; // date (YYYY-MM-DD) -> reason
}

export interface NotePayload {
  [key: string]: unknown;
  title: string;
  content: string;
  pinned?: boolean;
}

export interface ScheduleEventPayload {
  [key: string]: unknown;
  title: string;
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endDate: string; // YYYY-MM-DD
  endTime?: string; // HH:mm
  category?: string;
  location?: string;
  allDay?: boolean;
}

export interface MetricEntryPayload {
  [key: string]: unknown;
  category: string;
  name: string;
  value: number;
  unit: string;
  changeRate?: number;
  target?: number;
}

export interface SaveStatus {
  state: 'saved' | 'saving' | 'error';
  lastSavedAt?: number;
  error?: string;
}
