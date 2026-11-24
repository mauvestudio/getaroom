// Diagnostic explicite des échecs Paseo : distingue démon arrêté, hôte distant lent/injoignable,
// session expirée et provider (binaire introuvable / non authentifié) au lieu d'un message générique.

export type DiagnosisKind =
  | "daemon-down"
  | "daemon-unresponsive"
  | "host-unreachable"
  | "host-timeout"
  | "auth"
  | "provider-missing"
  | "provider-auth"
  | "provider-unavailable"
  | "unknown";

export type DiagnosisAction = "reconnect" | "start-daemon" | "restart-daemon" | "refresh-providers";

export interface Diagnosis {
  kind: DiagnosisKind;
  title: string;
  detail: string;
  hint?: string;
  actions: DiagnosisAction[];
  providerId?: string;
  hostId?: string;
}

export interface DiagnosisProvider {
  id: string;
  label?: string;
  enabled?: boolean;
  status?: string;
  /** Erreur brute remontée par le démon dans le snapshot des providers. */
  error?: string;
}

export interface BinaryProbe {
  name: string;
  /** Chemin trouvé dans le PATH enrichi, sinon null. */
  path: string | null;
}

export interface DiagnosisContext {
  hostId?: string;
  hostName?: string;
  /** État de connexion WebSocket de l'hôte concerné. */
  hostState?: string;
  isLocal?: boolean;
  provider?: DiagnosisProvider | null;
  /** Résultat de la recherche du binaire côté relais (machine locale uniquement). */
  binary?: BinaryProbe | null;
  /** Dossiers parcourus pour trouver le binaire. */
  searchedDirs?: string[];
}

/** Binaire de CLI lancé par le démon pour chaque provider (commande par défaut de Paseo). */
const PROVIDER_BINARY: Record<string, string> = {
  claude: "claude", codex: "codex", opencode: "opencode", gemini: "gemini", copilot: "copilot",
  antigravity: "agy", "mistral-vibe": "vibe", pi: "pi", omp: "omp",
};
export const providerBinaryName = (providerId: string): string => PROVIDER_BINARY[providerId.toLowerCase()] ?? providerId.toLowerCase();
export const KNOWN_PROVIDER_BINARIES = [...new Set(Object.values(PROVIDER_BINARY))];

/** « Provider 'antigravity' is not available… » (message du démon) → « antigravity ». */
export function providerFromMessage(error: unknown): string | null {
  const match = /provider\s+['"`]?([\w-]+)['"`]?\s+is not available/i.exec(errorMessage(error));
  return match?.[1]?.toLowerCase() ?? null;
}

const HEALTHY_PROVIDER_STATUS = new Set(["available", "active", "ready", "connected", "running"]);

const RE_AUTH = /unauthori[sz]ed|forbidden|\b40[13]\b|invalid (?:token|password)|(?:token|password|session)[^.]{0,20}(?:expired|invalid|expir)|authentication (?:failed|required)|non autoris/i;
const RE_TIMEOUT = /timeout|timed out|time out|délai|etimedout|deadline/i;
const RE_NETWORK = /econnrefused|econnreset|ehostunreach|enetunreach|enotfound|network|fetch failed|socket|not connected|disconnected|connection (?:closed|lost|refused)|failed to connect|hors ligne|offline|closed before/i;
const RE_BINARY_MISSING = /is not available|ensure the cli|please install|enoent|not found|no such file|command not found|introuvable|cannot find|not installed|spawn .* failed|executable/i;
const RE_PROVIDER_AUTH = /log ?in|sign ?in|not authenticated|unauthenticated|api[ _-]?key|credential|authenticat|oauth|connexion requise|non authentifi/i;

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return "";
}

const hostLabel = (ctx: DiagnosisContext) => ctx.isLocal ? "le démon Paseo local (127.0.0.1:6767)" : `l’hôte « ${ctx.hostName || ctx.hostId || "distant"} »`;

function providerIsUnhealthy(provider: DiagnosisProvider | null | undefined): provider is DiagnosisProvider {
  if (!provider) return false;
  if (provider.error) return true;
  if (provider.enabled === false) return false;
  return provider.status !== undefined && !HEALTHY_PROVIDER_STATUS.has(provider.status.toLowerCase());
}

function diagnoseProvider(provider: DiagnosisProvider, raw: string, ctx: DiagnosisContext): Diagnosis {
  const name = provider.label || provider.id;
  const text = `${provider.error ?? ""} ${raw}`;
  const base = { providerId: provider.id, hostId: ctx.hostId };
  const probe = ctx.binary;
  const searched = ctx.searchedDirs?.length ? ` Dossiers testés : ${ctx.searchedDirs.join(", ")}.` : "";

  if (RE_PROVIDER_AUTH.test(text) && !RE_BINARY_MISSING.test(text)) {
    return {
      ...base,
      kind: "provider-auth",
      title: `${name} n’est pas authentifié`,
      detail: provider.error || raw || `Le provider ${name} demande une connexion.`,
      hint: `Connecte-toi dans le terminal (ex. « ${provider.id} login »), puis actualise les providers.`,
      actions: ["refresh-providers"],
    };
  }

  // Le binaire existe sur le disque mais le démon ne le voit pas : PATH du démon (lancement GUI) incomplet.
  if (probe?.path) {
    return {
      ...base,
      kind: "provider-missing",
      title: `${name} : binaire trouvé mais invisible pour le démon`,
      detail: `${probe.name} est installé (${probe.path}) mais le démon Paseo ne le détecte pas${provider.error ? ` — ${provider.error}` : ""}.`,
      hint: ctx.isLocal
        ? "Le démon a probablement démarré avec un PATH minimal (lancement GUI). Redémarre-le depuis getaroom pour qu’il utilise le PATH complet."
        : undefined,
      actions: ctx.isLocal ? ["restart-daemon", "refresh-providers"] : ["refresh-providers"],
    };
  }

  if (RE_BINARY_MISSING.test(text) || probe?.path === null) {
    return {
      ...base,
      kind: "provider-missing",
      title: `${name} : binaire introuvable`,
      detail: `${provider.error || raw || `Le binaire ${probe?.name ?? provider.id} est introuvable.`}${searched}`,
      hint: `Installe la CLI « ${probe?.name ?? provider.id} » ou ajoute son dossier au PATH, puis actualise les providers.`,
      actions: ["refresh-providers"],
    };
  }

  return {
    ...base,
    kind: "provider-unavailable",
    title: `${name} est indisponible`,
    detail: provider.error || raw || `Statut du provider : ${provider.status ?? "inconnu"}.`,
    actions: ["refresh-providers"],
  };
}

/**
 * Détermine la cause la plus probable d'un échec. Ordre : état de l'hôte → provider défaillant →
 * contenu du message d'erreur.
 */
export function diagnoseFailure(error: unknown, ctx: DiagnosisContext = {}): Diagnosis {
  const raw = errorMessage(error).trim();
  const base = { hostId: ctx.hostId };
  const label = hostLabel(ctx);
  const state = ctx.hostState;
  const snapshotProvider: DiagnosisProvider | null | undefined = ctx.provider;

  if (state && state !== "connected") {
    const connecting = state === "connecting" || state === "reconnecting";
    if (ctx.isLocal) {
      return {
        ...base,
        kind: "daemon-down",
        title: connecting ? "Reconnexion au démon Paseo…" : "Le démon Paseo local est arrêté ou injoignable",
        detail: connecting
          ? `Connexion à ${label} en cours.`
          : `Aucune connexion à ${label}. Paseo a peut-être été fermé, ou le démon a planté.`,
        hint: connecting ? undefined : "Démarre le démon depuis getaroom ou relance Paseo.",
        actions: connecting ? ["reconnect"] : ["start-daemon", "reconnect"],
      };
    }
    return {
      ...base,
      kind: "host-unreachable",
      title: connecting ? `Reconnexion à ${ctx.hostName || "l’hôte"}…` : `${ctx.hostName || "L’hôte distant"} est injoignable`,
      detail: `Aucune connexion à ${label}. Vérifie le réseau (Tailscale/VPN) et que le démon distant tourne.`,
      actions: ["reconnect"],
    };
  }

  if (providerIsUnhealthy(ctx.provider)) return diagnoseProvider(ctx.provider, raw, ctx);

  // Le démon nomme lui-même le provider défaillant même quand le snapshot n'est pas à jour.
  const named = providerFromMessage(raw);
  if (named) return diagnoseProvider({ id: named, label: snapshotProvider?.label, error: snapshotProvider?.error }, raw, ctx);

  if (RE_AUTH.test(raw)) {
    return {
      ...base,
      kind: "auth",
      title: "Session ou jeton refusé",
      detail: `${label[0]!.toUpperCase()}${label.slice(1)} a refusé la connexion${raw ? ` : ${raw}` : "."}`,
      hint: ctx.isLocal ? "Reconnecte-toi." : "Vérifie le jeton de l’hôte dans Réglages › Hôtes.",
      actions: ["reconnect"],
    };
  }

  if (RE_TIMEOUT.test(raw)) {
    return ctx.isLocal
      ? {
          ...base,
          kind: "daemon-unresponsive",
          title: "Le démon Paseo local ne répond pas",
          detail: `Délai dépassé en attendant ${label}${raw ? ` (${raw})` : ""}.`,
          hint: "Le démon est peut-être gelé après une veille : reconnecte, ou redémarre-le.",
          actions: ["reconnect", "restart-daemon"],
        }
      : {
          ...base,
          kind: "host-timeout",
          title: `${ctx.hostName || "L’hôte distant"} met trop de temps à répondre`,
          detail: `Délai dépassé vers ${label}${raw ? ` (${raw})` : ""}. Le réseau a peut-être changé (veille, Tailscale, VPN).`,
          actions: ["reconnect"],
        };
  }

  if (RE_NETWORK.test(raw)) {
    return ctx.isLocal
      ? {
          ...base,
          kind: "daemon-down",
          title: "Connexion au démon Paseo perdue",
          detail: raw,
          hint: "Démarre le démon s’il est arrêté, sinon reconnecte.",
          actions: ["start-daemon", "reconnect"],
        }
      : {
          ...base,
          kind: "host-unreachable",
          title: `${ctx.hostName || "L’hôte distant"} est injoignable`,
          detail: raw,
          actions: ["reconnect"],
        };
  }

  return {
    ...base,
    kind: "unknown",
    title: "Échec inattendu",
    detail: raw || "Aucun détail fourni par Paseo.",
    actions: state === "connected" ? ["refresh-providers"] : ["reconnect"],
  };
}

export const DIAGNOSIS_ACTION_LABEL: Record<DiagnosisAction, string> = {
  reconnect: "Reconnecter",
  "start-daemon": "Démarrer le démon",
  "restart-daemon": "Redémarrer le démon",
  "refresh-providers": "Actualiser les providers",
};

/**
 * Providers activés dans le démon mais indisponibles alors que leur CLI existe sur le disque :
 * le démon (lancé depuis le Finder) a un PATH minimal et ne les voit pas.
 */
export function providersHiddenByDaemonPath(
  providers: Array<{ id: string; label?: string; status?: string; daemonEnabled?: boolean; hostId?: string }>,
  binaries: BinaryProbe[],
): Array<{ id: string; label: string; binary: BinaryProbe }> {
  const result: Array<{ id: string; label: string; binary: BinaryProbe }> = [];
  for (const provider of providers) {
    if ((provider.hostId && provider.hostId !== "local") || provider.daemonEnabled === false) continue;
    if (provider.status && HEALTHY_PROVIDER_STATUS.has(provider.status.toLowerCase())) continue;
    const binary = binaries.find((entry) => entry.name === providerBinaryName(provider.id));
    if (binary?.path) result.push({ id: provider.id, label: provider.label || provider.id, binary });
  }
  return result;
}
