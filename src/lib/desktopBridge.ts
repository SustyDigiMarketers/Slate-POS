/**
 * SLATE POS — Desktop Runtime Bridge & IPC Integration
 * 
 * Capability detection:
 * - Returns true ONLY when running inside supported desktop runtime (e.g. Electron with preload bridge)
 * - Returns false in standard web browsers (Chrome, Edge, Firefox, etc.)
 * 
 * Guarantees Close, Minimize, Maximize controls only appear when native desktop integration exists.
 */

export interface ElectronWindowAPI {
  minimize?: () => void;
  maximize?: () => void;
  unmaximize?: () => void;
  close?: () => void;
  isMaximized?: () => boolean;
  isDesktop?: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronWindowAPI;
    electron?: ElectronWindowAPI;
  }
}

/**
 * Checks if the application is running in an Electron / native desktop container
 * with working window control IPC integration.
 * Does not rely merely on user-agent sniffing.
 */
export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;

  const api = window.electronAPI || window.electron;
  if (!api) return false;

  const hasClose = typeof api.close === 'function';
  const hasMinimize = typeof api.minimize === 'function';
  const hasMaximize = typeof api.maximize === 'function';

  return Boolean(hasClose && hasMinimize && hasMaximize);
}

/**
 * Invokes native desktop minimize
 */
export function minimizeWindow(): void {
  const api = window.electronAPI || window.electron;
  if (api && typeof api.minimize === 'function') {
    api.minimize();
  }
}

/**
 * Invokes native desktop maximize / restore
 */
export function toggleMaximizeWindow(): boolean {
  const api = window.electronAPI || window.electron;
  if (api && typeof api.maximize === 'function') {
    if (typeof api.isMaximized === 'function' && api.isMaximized()) {
      if (typeof api.unmaximize === 'function') {
        api.unmaximize();
        return false;
      }
    }
    api.maximize();
    return true;
  }
  return false;
}

/**
 * Invokes native desktop window close
 */
export function closeWindow(): void {
  const api = window.electronAPI || window.electron;
  if (api && typeof api.close === 'function') {
    api.close();
  }
}
