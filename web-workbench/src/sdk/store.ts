import type { AppConfig, HostError, SaveStatus } from './types';
import { hasHost, listenHost } from './host';

type CollectionListener = () => void;
type ConfigListener = (config: AppConfig) => void;
type SaveStatusListener = (status: SaveStatus) => void;

class ReactiveStore {
  private collectionListeners = new Map<string, Set<CollectionListener>>();
  private allCollectionListeners = new Set<CollectionListener>();
  private configListeners = new Set<ConfigListener>();
  private saveStatusListeners = new Set<SaveStatusListener>();

  private cachedConfig: AppConfig | null = null;
  private pendingOperationsCount = 0;
  private writeFailed = false;
  private saveStatus: SaveStatus = { state: 'saved', lastSavedAt: Date.now() };

  private isListening = false;
  private unlistens: (() => void)[] = [];

  constructor() {
    this.initListeners();
  }

  private async initListeners() {
    if (!hasHost() || this.isListening) return;
    this.isListening = true;

    try {
      const unlistenRecords = await listenHost<string[]>(
        'workbench://records-changed',
        (collections) => {
          this.notifyCollections(collections);
        },
      );
      this.unlistens.push(unlistenRecords);

      const unlistenConfig = await listenHost<AppConfig>('workbench://config-changed', (config) => {
        this.cachedConfig = config;
        this.notifyConfig(config);
      });
      this.unlistens.push(unlistenConfig);

      const unlistenRestored = await listenHost<void>('workbench://data-restored', () => {
        this.notifyAll();
      });
      this.unlistens.push(unlistenRestored);
    } catch (e) {
      console.warn('Could not register host event listeners:', e);
    }
  }

  // Operation tracking for local save indicator
  public trackPending<T>(operationPromise: Promise<T>): Promise<T> {
    if (this.pendingOperationsCount === 0) this.writeFailed = false;
    this.pendingOperationsCount += 1;
    this.updateSaveStatus({ state: 'saving' });

    return operationPromise
      .then((res) => {
        this.pendingOperationsCount = Math.max(0, this.pendingOperationsCount - 1);
        if (this.pendingOperationsCount === 0 && !this.writeFailed) {
          this.updateSaveStatus({ state: 'saved', lastSavedAt: Date.now(), error: undefined });
        }
        return res;
      })
      .catch((err: HostError | Error) => {
        this.writeFailed = true;
        this.pendingOperationsCount = Math.max(0, this.pendingOperationsCount - 1);
        const errorMsg = (err as HostError)?.message || (err as Error)?.message || '保存失败';
        this.updateSaveStatus({ state: 'error', error: errorMsg });
        throw err;
      });
  }

  public getSaveStatus(): SaveStatus {
    return this.saveStatus;
  }

  private updateSaveStatus(status: Partial<SaveStatus>) {
    this.saveStatus = { ...this.saveStatus, ...status };
    for (const listener of this.saveStatusListeners) {
      listener(this.saveStatus);
    }
  }

  public subscribeSaveStatus(listener: SaveStatusListener): () => void {
    this.saveStatusListeners.add(listener);
    listener(this.saveStatus);
    return () => this.saveStatusListeners.delete(listener);
  }

  public subscribeCollection(collection: string, listener: CollectionListener): () => void {
    if (!this.collectionListeners.has(collection)) {
      this.collectionListeners.set(collection, new Set());
    }
    this.collectionListeners.get(collection)!.add(listener);
    return () => {
      this.collectionListeners.get(collection)?.delete(listener);
    };
  }

  public subscribeAllCollections(listener: CollectionListener): () => void {
    this.allCollectionListeners.add(listener);
    return () => this.allCollectionListeners.delete(listener);
  }

  public subscribeConfig(listener: ConfigListener): () => void {
    this.configListeners.add(listener);
    if (this.cachedConfig) {
      listener(this.cachedConfig);
    }
    return () => this.configListeners.delete(listener);
  }

  public notifyCollections(collections: string[]) {
    for (const col of collections) {
      const set = this.collectionListeners.get(col);
      if (set) {
        for (const fn of set) {
          fn();
        }
      }
    }
    for (const fn of this.allCollectionListeners) {
      fn();
    }
  }

  public notifyAll() {
    for (const set of this.collectionListeners.values()) {
      for (const fn of set) {
        fn();
      }
    }
    for (const fn of this.allCollectionListeners) {
      fn();
    }
    if (this.cachedConfig) {
      this.notifyConfig(this.cachedConfig);
    }
  }

  private notifyConfig(config: AppConfig) {
    for (const listener of this.configListeners) {
      listener(config);
    }
  }

  public setCachedConfig(config: AppConfig) {
    this.cachedConfig = config;
    this.notifyConfig(config);
  }

  public getCachedConfig(): AppConfig | null {
    return this.cachedConfig;
  }

  public destroy() {
    for (const unlisten of this.unlistens) {
      unlisten();
    }
    this.unlistens = [];
    this.collectionListeners.clear();
    this.allCollectionListeners.clear();
    this.configListeners.clear();
    this.saveStatusListeners.clear();
  }
}

export const reactiveStore = new ReactiveStore();
