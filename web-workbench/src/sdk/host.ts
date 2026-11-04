export interface HostError {
  code:
    | 'VALIDATION'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'PERMISSION_DENIED'
    | 'IO'
    | 'DATABASE'
    | 'UNSUPPORTED_VERSION'
    | 'INTERNAL'
    | 'HOST_UNAVAILABLE'
    | 'BRIDGE';
  message: string;
  context: { operation: string; operationIndex?: number };
}

export interface WindowState {
  mode: 'sidebar' | 'panel';
  width: number;
  height: number;
  visible: boolean;
  maximized: boolean;
  minimized: boolean;
}

export type WindowAction =
  'minimize' | 'maximize' | 'restore' | 'toggleMaximize' | 'close' | 'startDragging';

declare global {
  interface Window {
    __TAURI__?: {
      core: { invoke<T>(command: string, args?: { request: unknown }): Promise<T> };
      event: {
        listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<() => void>;
      };
    };
  }
}

export const hasHost = () => Boolean(window.__TAURI__);

export async function invokeHost<T>(command: string, request?: unknown): Promise<T> {
  if (!window.__TAURI__) {
    throw {
      code: 'HOST_UNAVAILABLE',
      message: '请在桌面运行器中打开工作台',
      context: { operation: command },
    } satisfies HostError;
  }
  try {
    return await window.__TAURI__.core.invoke<T>(
      command,
      request === undefined ? undefined : { request },
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error) throw error;
    throw {
      code: 'BRIDGE',
      message: '宿主调用被拒绝或参数无效',
      context: { operation: command },
    } satisfies HostError;
  }
}

export async function listenHost<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!window.__TAURI__) return () => {};
  return window.__TAURI__.event.listen<T>(event, ({ payload }) => handler(payload));
}

export const hostWindow = {
  state: () => invokeHost<WindowState>('window_state'),
  control: (action: WindowAction) => invokeHost<void>('window_control', { action }),
  apply: (config: {
    mode?: WindowState['mode'];
    width?: number;
    height?: number;
    resizable?: boolean;
    rememberBounds?: boolean;
  }) => invokeHost<WindowState>('window_apply', config),
  reload: () => invokeHost<void>('workspace_reload'),
};
