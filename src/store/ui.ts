import { create } from 'zustand'
import type { Issue } from '@/types'
import { uid } from '@/lib/utils'

export interface Toast {
  id: string
  title: string
  description?: string
  tone?: 'default' | 'success' | 'error'
  action?: { label: string; onClick: () => void }
}

interface UIState {
  createOpen: boolean
  createDefaults: Partial<Issue>
  openCreate: (defaults?: Partial<Issue>) => void
  closeCreate: () => void

  searchOpen: boolean
  setSearchOpen: (v: boolean) => void

  shortcutsOpen: boolean
  setShortcutsOpen: (v: boolean) => void

  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
}

export const useUI = create<UIState>((set, get) => ({
  createOpen: false,
  createDefaults: {},
  openCreate: (defaults = {}) => set({ createOpen: true, createDefaults: defaults }),
  closeCreate: () => set({ createOpen: false, createDefaults: {} }),

  searchOpen: false,
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  shortcutsOpen: false,
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),

  toasts: [],
  toast: (t) => {
    const id = uid('t')
    set({ toasts: [...get().toasts, { ...t, id }] })
    setTimeout(() => get().dismissToast(id), 5000)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

export const toast = (t: Omit<Toast, 'id'>) => useUI.getState().toast(t)
