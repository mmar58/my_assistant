import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

export const toasts = writable<Toast[]>([]);

export function addToast(message: string, type: ToastType = 'info', duration = 3000) {
  const id = crypto.randomUUID();
  toasts.update(t => [...t, { id, type, message }]);
  setTimeout(() => {
    toasts.update(t => t.filter(toast => toast.id !== id));
  }, duration);
}
