// Appels au relais local pour l'état et le (re)démarrage du démon Paseo de cette machine.
import type { BinaryProbe } from "./diagnostics";

export interface DaemonStatus {
  local: boolean;
  endpoint: string;
  reachable: boolean;
  cli: string | null;
  binaries: BinaryProbe[];
  searchedDirs: string[];
}

export async function fetchDaemonStatus(): Promise<DaemonStatus | null> {
  try {
    const response = await fetch("/api/paseo/daemon/status", { cache: "no-store" });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function controlLocalDaemon(action: "start" | "restart"): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(`/api/paseo/daemon/${action}`, { method: "POST" });
    const payload = await response.json().catch(() => null);
    return { ok: Boolean(payload?.ok), message: payload?.message || (response.ok ? "Terminé." : `Échec (${response.status}).`) };
  } catch {
    return { ok: false, message: "Le relais local est injoignable." };
  }
}
