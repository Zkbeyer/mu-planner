export const STORAGE_KEYS = {
  PLANNER: 'tigerpath_planner',
  DEGREES: 'tigerpath_degrees',
  SAVED: 'tigerpath_saved',
  SELECTED_DEGREE: 'tigerpath_selected_degree',
  TRACK_SELECTIONS: 'tigerpath_track',
  CONCENTRATION_SELECTIONS: 'tigerpath_concentrations',
} as const;

function isAvailable(): boolean {
  try {
    const test = '__tigerpath_test__';
    localStorage.setItem(test, '1');
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

export const storageAvailable = typeof window !== 'undefined' && isAvailable();

export function storageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silently fail in restricted environments
  }
}

export function storageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // silently fail
  }
}

export function exportAllData(): void {
  try {
    const data: Record<string, unknown> = {};
    for (const key of Object.values(STORAGE_KEYS)) {
      const raw = localStorage.getItem(key);
      if (raw !== null) data[key] = JSON.parse(raw);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tigerpath-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // nothing to do
  }
}

export function importAllData(file: File, onDone: () => void): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      for (const key of Object.values(STORAGE_KEYS)) {
        if (key in parsed) {
          storageSet(key, parsed[key]);
        }
      }
      onDone();
    } catch {
      alert('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}
