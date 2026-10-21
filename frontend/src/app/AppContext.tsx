import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, storageAvailable, type AppSettings } from '../services/storage';
import { getHealth, type HealthResponse } from '../services/api';

interface SettingsApi {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  storageOk: boolean;
}

const SettingsContext = createContext<SettingsApi>({ settings: DEFAULT_SETTINGS, update: () => undefined, storageOk: true });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [storageOk] = useState<boolean>(storageAvailable);

  const update = (patch: Partial<AppSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  };

  const api = useMemo(() => ({ settings, update, storageOk }), [settings, storageOk]);
  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

export type EngineStatus = 'checking' | 'online' | 'offline';

/** Probes the optional symbolic backend once; the UI never blocks on it. */
export function useEngineStatus(): { status: EngineStatus; info: HealthResponse | null } {
  const [status, setStatus] = useState<EngineStatus>('checking');
  const [info, setInfo] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let alive = true;
    getHealth().then((h) => {
      if (!alive) return;
      setInfo(h);
      setStatus(h ? 'online' : 'offline');
    });
    return () => {
      alive = false;
    };
  }, []);

  return { status, info };
}

/** Number formatting that honours the precision setting. */
export function useFormat() {
  const { settings } = useSettings();
  return (v: number, digits = settings.precision) => {
    if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return '0';
    const abs = Math.abs(v);
    if (abs >= 1e6 || abs < 1e-4) return v.toExponential(Math.max(1, digits - 1));
    const r = Number(v.toFixed(digits));
    return String(Object.is(r, -0) ? 0 : r);
  };
}
