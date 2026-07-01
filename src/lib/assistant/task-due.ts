const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type TaskDueTone = 'normal' | 'soon' | 'overdue';

export function taskDueIso(task: { dueAt?: string | null; dueDate?: string | null }): string | null {
  return task.dueAt ?? task.dueDate ?? null;
}

export function isTaskOverdue(iso: string | null | undefined, done = false): boolean {
  if (!iso || done) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

export function isTaskDueSoon(iso: string | null | undefined, done = false): boolean {
  if (!iso || done) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const ms = d.getTime() - Date.now();
  return ms >= 0 && ms <= 48 * 60 * 60 * 1000;
}

export function taskDueTone(iso: string | null | undefined, done = false): TaskDueTone {
  if (!iso || done) return 'normal';
  if (isTaskOverdue(iso, done)) return 'overdue';
  if (isTaskDueSoon(iso, done)) return 'soon';
  return 'normal';
}

export function formatTaskDue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hasTime = iso.includes('T') && !iso.endsWith('T12:00:00.000Z') && !iso.endsWith('T12:00:00Z');
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (!hasTime) return date;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
