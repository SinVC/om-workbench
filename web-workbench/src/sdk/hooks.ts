import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppConfig, RecordItem, RecordQuery, SaveStatus, WindowState } from './types';
import { workbench } from './client';
import { reactiveStore } from './store';
import { hasHost, listenHost } from './host';
import type { SearchResultItem } from './search';

export function errorMessage(error: unknown): string {
  return error && typeof error === 'object' && 'message' in error
    ? String(error.message)
    : String(error);
}

/** Catch async UI actions once, while keeping each module's error visible. */
export function useAction() {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const run = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { error, pending, run };
}

export function useRecords<T = Record<string, unknown>>(
  collection: string,
  queryOptions?: Omit<RecordQuery, 'collection'>,
  deps: unknown[] = [],
) {
  const key = JSON.stringify({ collection, ...queryOptions });
  const depKey = JSON.stringify(deps);
  const [result, setResult] = useState<{
    key: string;
    data: RecordItem<T>[];
    error: Error | null;
  } | null>(null);
  const requestVersion = useRef(0);
  const invalidate = useCallback(() => {
    requestVersion.current++;
  }, []);
  const fetchRecords = useCallback(async () => {
    if (!hasHost()) return;
    const version = ++requestVersion.current;
    const query = JSON.parse(key) as RecordQuery;
    try {
      const data =
        query.limit === undefined
          ? await workbench.records.queryAll<T>(query)
          : await workbench.records.query<T>(query);
      if (version === requestVersion.current) setResult({ key, data, error: null });
    } catch (err) {
      if (version === requestVersion.current)
        setResult({ key, data: [], error: new Error(errorMessage(err)) });
    }
  }, [key]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return fetchRecords();
    });
    const unsubscribe = reactiveStore.subscribeCollection(collection, () => {
      void fetchRecords();
    });
    return () => {
      active = false;
      invalidate();
      unsubscribe();
    };
  }, [collection, fetchRecords, depKey, invalidate]);
  return {
    data: result?.key === key ? result.data : [],
    loading: hasHost() && result?.key !== key,
    error: result?.key === key ? result.error : null,
    refetch: fetchRecords,
  };
}

export function useRecord<T = Record<string, unknown>>(collection: string, id: string) {
  const result = useRecords<T>(collection);
  return { ...result, data: result.data.find((record) => record.id === id) ?? null };
}

export function useConfig(): {
  config: AppConfig | null;
  loading: boolean;
  error: Error | null;
  update: (namespace: 'window' | 'network' | 'workbench', patch: unknown) => Promise<AppConfig>;
} {
  const [config, setConfig] = useState<AppConfig | null>(() => reactiveStore.getCachedConfig());
  const [loading, setLoading] = useState(() => hasHost() && !reactiveStore.getCachedConfig());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!hasHost()) {
      return;
    }
    const unsubscribe = reactiveStore.subscribeConfig((next) => {
      setConfig(next);
      setLoading(false);
    });

    if (!reactiveStore.getCachedConfig()) {
      workbench.config
        .get()
        .then((cfg) => {
          setConfig(cfg);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        });
    }

    return unsubscribe;
  }, []);

  const update = async (namespace: 'window' | 'network' | 'workbench', patch: unknown) => {
    return await workbench.config.update(namespace, patch);
  };

  return { config, loading, error, update };
}

export function useSaveStatus(): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>(reactiveStore.getSaveStatus());

  useEffect(() => {
    return reactiveStore.subscribeSaveStatus(setStatus);
  }, []);

  return status;
}

export function useWindowState(): {
  state: WindowState | undefined;
  control: (action: Parameters<typeof workbench.window.control>[0]) => void;
  toggleMaximize: () => void;
} {
  const [state, setState] = useState<WindowState>();

  useEffect(() => {
    if (!hasHost()) return;
    let active = true;
    let unlisten: (() => void) | undefined;
    let eventSeen = false;
    void listenHost<WindowState>('workbench://window-changed', (next) => {
      eventSeen = true;
      if (active) setState(next);
    })
      .then(async (stop) => {
        if (!active) {
          stop();
          return;
        }
        unlisten = stop;
        const initial = await workbench.window.state();
        if (active && !eventSeen) setState(initial);
      })
      .catch(console.error);
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  const control = (action: Parameters<typeof workbench.window.control>[0]) => {
    void workbench.window.control(action).catch(console.error);
  };

  const toggleMaximize = () => control('toggleMaximize');

  return { state, control, toggleMaximize };
}

export function useGlobalSearch(query: string, collections?: readonly string[]) {
  const trimmed = query.trim();
  const collectionKey = JSON.stringify(collections ?? null);
  const [result, setResult] = useState<{
    key: string;
    results: SearchResultItem[];
    error: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([trimmed, collectionKey, revision]);
  useEffect(() => reactiveStore.subscribeAllCollections(() => setRevision((n) => n + 1)), []);
  useEffect(() => {
    if (!trimmed || !hasHost()) return;
    let active = true;
    const timer = setTimeout(() => {
      const selected = JSON.parse(collectionKey) as string[] | null;
      void workbench.search
        .find(trimmed, selected ?? undefined)
        .then((results) => {
          if (active) setResult({ key, results, error: '' });
        })
        .catch((err) => {
          if (active) setResult({ key, results: [], error: errorMessage(err) });
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [trimmed, collectionKey, key]);
  return {
    results: trimmed && result?.key === key ? result.results : [],
    loading: hasHost() && Boolean(trimmed) && result?.key !== key,
    error: result?.key === key ? result.error : '',
  };
}
