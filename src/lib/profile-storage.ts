type Preferences = Record<string, string>;
export interface FirstRunStatus { firstRun: boolean; paseoDetected: boolean; hostsCount: number }
let initialStatus: FirstRunStatus | null = null;
export const getInitialProfileStatus = () => initialStatus;

/** Move legacy WebView localStorage into the app's Application Support store before React mounts. */
export async function initializeProfileStorage(): Promise<void> {
  const native = window.localStorage;
  const legacy: Preferences = {};
  for (let index = 0; index < native.length; index++) {
    const key = native.key(index);
    if (key) legacy[key] = native.getItem(key) || "";
  }
  try {
    const statusResponse = await fetch("/api/profile/status");
    if (statusResponse.ok) initialStatus = await statusResponse.json() as FirstRunStatus;
    const response = await fetch("/api/profile/preferences");
    if (!response.ok) return;
    const stored = await response.json() as Preferences;
    const values: Preferences = { ...legacy, ...stored };
    if (initialStatus?.firstRun && Object.keys(legacy).length) initialStatus.firstRun = false;

    const persist = () => fetch("/api/profile/preferences", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(values), keepalive: true,
    });
    // Confirm durable migration before removing the original WebView values.
    if (Object.keys(legacy).some((key) => !(key in stored))) {
      const migrated = await persist();
      if (!migrated.ok) return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void persist().catch(() => {}); }, 120);
    };
    const virtual = {
      get length() { return Object.keys(values).length; },
      key(index: number) { return Object.keys(values)[index] ?? null; },
      getItem(key: string) { return Object.prototype.hasOwnProperty.call(values, String(key)) ? values[String(key)] : null; },
      setItem(key: string, value: string) { values[String(key)] = String(value); schedule(); },
      removeItem(key: string) { delete values[String(key)]; schedule(); },
      clear() { for (const key of Object.keys(values)) delete values[key]; schedule(); },
    } as Storage;
    try { Object.defineProperty(window, "localStorage", { configurable: true, get: () => virtual }); }
    catch { return; }
    for (const key of Object.keys(legacy)) native.removeItem(key);
    window.addEventListener("pagehide", () => {
      if (timer) clearTimeout(timer);
      navigator.sendBeacon("/api/profile/preferences", new Blob([JSON.stringify(values)], { type: "application/json" }));
    });
  } catch {
    // Development without a relay keeps the original browser storage intact.
  }
}
