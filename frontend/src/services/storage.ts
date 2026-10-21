/**
 * Local persistence layer.
 *
 * Data lives in the browser's localStorage under a versioned namespace. It is
 * *not* synced anywhere: saved experiments exist only in this browser profile
 * on this device. JSON export/import is provided for backup and transfer.
 */
import { DEFAULT_PARAMS, DEFAULT_TIME_SPEC, type SignalParams, type TimeSpec } from '../core/signals';

const NS = 'smp.v1';
const K_EXPERIMENTS = `${NS}.experiments`;
const K_RECENTS = `${NS}.recents`;
const K_SETTINGS = `${NS}.settings`;
const K_PROGRESS = `${NS}.progress`;

export interface SavedExperiment {
  id: string;
  name: string;
  /** Route id of the module that created it, e.g. "convolution". */
  module: string;
  createdAt: string;
  updatedAt: string;
  /** Module-specific configuration snapshot (validated on import). */
  config: Record<string, unknown>;
  /** Optional short human-readable summary shown in the dashboard. */
  summary?: string;
}

export interface AppSettings {
  precision: number;
  seedExamples: boolean;
  autoRun: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = { precision: 4, seedExamples: true, autoRun: true, reduceMotion: false };

export interface ProgressEntry {
  attempted: number;
  correct: number;
  lastPracticed?: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = (): boolean => {
  try {
    const k = `${NS}.probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
};

/* ----------------------------- Experiments ----------------------------- */

export function listExperiments(): SavedExperiment[] {
  const items = read<SavedExperiment[]>(K_EXPERIMENTS, []);
  return items.filter(isSavedExperiment).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function saveExperiment(input: Omit<SavedExperiment, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): SavedExperiment | null {
  const items = listExperiments();
  const now = new Date().toISOString();
  if (input.id) {
    const idx = items.findIndex((e) => e.id === input.id);
    if (idx >= 0) {
      const updated: SavedExperiment = { ...items[idx], ...input, id: items[idx].id, createdAt: items[idx].createdAt, updatedAt: now };
      items[idx] = updated;
      return write(K_EXPERIMENTS, items) ? updated : null;
    }
  }
  const created: SavedExperiment = {
    ...input,
    id: makeId(),
    createdAt: now,
    updatedAt: now,
  };
  items.unshift(created);
  return write(K_EXPERIMENTS, items.slice(0, 200)) ? created : null;
}

export function renameExperiment(id: string, name: string): boolean {
  const items = listExperiments();
  const target = items.find((e) => e.id === id);
  if (!target) return false;
  target.name = name;
  target.updatedAt = new Date().toISOString();
  return write(K_EXPERIMENTS, items);
}

export function duplicateExperiment(id: string): SavedExperiment | null {
  const items = listExperiments();
  const target = items.find((e) => e.id === id);
  if (!target) return null;
  const copy: SavedExperiment = {
    ...target,
    id: makeId(),
    name: `${target.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: JSON.parse(JSON.stringify(target.config)),
  };
  items.unshift(copy);
  return write(K_EXPERIMENTS, items) ? copy : null;
}

export function deleteExperiment(id: string): boolean {
  const items = listExperiments().filter((e) => e.id !== id);
  return write(K_EXPERIMENTS, items);
}

export function exportExperiments(): string {
  return JSON.stringify({ format: 'signalmaster-pro/experiments', version: 1, exportedAt: new Date().toISOString(), experiments: listExperiments() }, null, 2);
}

export interface ImportReport {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Import with strict validation — malformed files are rejected, not partially applied. */
export function importExperiments(json: string): ImportReport {
  const report: ImportReport = { imported: 0, skipped: 0, errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { imported: 0, skipped: 0, errors: ['The file is not valid JSON.'] };
  }
  const root = parsed as { format?: string; experiments?: unknown };
  if (!root || root.format !== 'signalmaster-pro/experiments' || !Array.isArray(root.experiments)) {
    return { imported: 0, skipped: 0, errors: ['This is not a SignalMaster Pro experiment file.'] };
  }
  const existing = listExperiments();
  const incoming: SavedExperiment[] = [];
  for (const raw of root.experiments) {
    if (!isSavedExperiment(raw)) {
      report.skipped++;
      continue;
    }
    const item = raw as SavedExperiment;
    if (existing.some((e) => e.id === item.id) || incoming.some((e) => e.id === item.id)) {
      incoming.push({ ...item, id: makeId(), name: `${item.name} (imported)` });
    } else {
      incoming.push(item);
    }
    report.imported++;
  }
  if (incoming.length) write(K_EXPERIMENTS, [...incoming, ...existing].slice(0, 300));
  return report;
}

export function isSavedExperiment(v: unknown): v is SavedExperiment {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.module === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.updatedAt === 'string' &&
    typeof o.config === 'object' &&
    o.config !== null
  );
}

/* ------------------------------- Recents ------------------------------- */

export interface RecentEntry {
  route: string;
  title: string;
  at: string;
}

export function listRecents(): RecentEntry[] {
  return read<RecentEntry[]>(K_RECENTS, []).filter((r) => typeof r.route === 'string' && typeof r.title === 'string');
}

export function recordRecent(route: string, title: string): void {
  const items = listRecents().filter((r) => r.route !== route);
  items.unshift({ route, title, at: new Date().toISOString() });
  write(K_RECENTS, items.slice(0, 12));
}

export function clearRecents(): void {
  write(K_RECENTS, []);
}

/* ------------------------------- Settings ------------------------------ */

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<AppSettings>>(K_SETTINGS, {}) };
}

export function saveSettings(s: AppSettings): void {
  write(K_SETTINGS, s);
}

/* ------------------------------- Progress ------------------------------ */

export function loadProgress(): Record<string, ProgressEntry> {
  return read<Record<string, ProgressEntry>>(K_PROGRESS, {});
}

export function recordAnswer(topicId: string, correct: boolean): Record<string, ProgressEntry> {
  const p = loadProgress();
  const entry = p[topicId] ?? { attempted: 0, correct: 0 };
  entry.attempted += 1;
  if (correct) entry.correct += 1;
  entry.lastPracticed = new Date().toISOString();
  p[topicId] = entry;
  write(K_PROGRESS, p);
  return p;
}

export function resetProgress(): void {
  write(K_PROGRESS, {});
}

/* -------------------------------- Helpers ------------------------------ */

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate a signal-generator config loaded from storage or a file.
 * Unknown fields are dropped rather than trusted.
 */
export function sanitizeSignalConfig(config: unknown): { params: SignalParams; spec: TimeSpec } | null {
  if (typeof config !== 'object' || config === null) return null;
  const c = config as Record<string, unknown>;
  const p = (c.params ?? {}) as Record<string, unknown>;
  const s = (c.spec ?? {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const params: SignalParams = {
    ...DEFAULT_PARAMS,
    type: typeof p.type === 'string' ? (p.type as SignalParams['type']) : DEFAULT_PARAMS.type,
    amplitude: num(p.amplitude, DEFAULT_PARAMS.amplitude),
    frequency: num(p.frequency, DEFAULT_PARAMS.frequency),
    phase: num(p.phase, DEFAULT_PARAMS.phase),
    shift: num(p.shift, DEFAULT_PARAMS.shift),
    decay: num(p.decay, DEFAULT_PARAMS.decay),
    width: num(p.width, DEFAULT_PARAMS.width),
    expr: typeof p.expr === 'string' ? p.expr.slice(0, 500) : DEFAULT_PARAMS.expr,
  };
  const spec: TimeSpec = {
    domain: s.domain === 'discrete' ? 'discrete' : 'continuous',
    t0: num(s.t0, DEFAULT_TIME_SPEC.t0),
    t1: num(s.t1, DEFAULT_TIME_SPEC.t1),
    samples: Math.round(num(s.samples, DEFAULT_TIME_SPEC.samples)),
    n0: Math.round(num(s.n0, DEFAULT_TIME_SPEC.n0)),
    n1: Math.round(num(s.n1, DEFAULT_TIME_SPEC.n1)),
  };
  return { params, spec };
}

/* ------------------------------ Downloads ------------------------------ */

export function downloadBlob(filename: string, content: string, mime: string): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* handled by callers via toast */
  }
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}
