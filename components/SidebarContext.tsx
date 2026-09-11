'use client';

import { createContext, useContext, useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 1024;
const STORAGE_KEY = 'sidebarCollapsed';
const CHANGE_EVENT = 'hl-sidebar-change';

interface SidebarCtx {
  collapsed: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarCtx>({ collapsed: true, toggle: () => {} });

/** Estado en memoria; null significa "usar el valor por defecto". */
const store: { collapsed: boolean | null } = { collapsed: null };

function isMobile() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

function readCollapsed(): boolean {
  if (store.collapsed !== null) return store.collapsed;
  if (isMobile()) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function emit() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  const onResize = () => {
    if (isMobile() && store.collapsed !== true) {
      store.collapsed = true;
      emit();
    }
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('resize', onResize);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('resize', onResize);
  };
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => true);

  const toggle = () => {
    const next = !collapsed;
    store.collapsed = next;
    if (!isMobile()) {
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* almacenamiento no disponible */
      }
    }
    emit();
  };

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export const useSidebar = () => useContext(SidebarContext);
