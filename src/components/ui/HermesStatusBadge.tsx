import { RefreshCw } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { cn } from "../../lib/utils";
import { PressButton } from "./button";

const ONLINE_HINT = "Connecté • Agent disponible sur Unraid";
const OFFLINE_HINT = "Hors ligne • Unraid non joignable ou agent désactivé";

/** Badge d'identité Hermes/Unraid, avec état de connexion Paseo et du provider ACP. */
export function HermesStatusBadge({
  providerId,
  hostId,
  providerLabel = "Hermes • Unraid",
  compact = false,
  className,
}: {
  providerId?: string;
  hostId?: string;
  providerLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const { getHostState, reconnectHost, reconnect, hosts } = usePaseo();
  const { providers, refreshProviders } = useWorkspace();
  const provider = providers.find((item) => item.id.toLocaleLowerCase() === providerId?.toLocaleLowerCase());
  const providerAvailable = Boolean(provider?.enabled) && ["available", "active", "ready", "connected", "running"].includes(provider?.status.toLocaleLowerCase() || "");
  const fallbackRemoteHostId = hosts.find((item) => !item.local && item.enabled)?.id;
  const resolvedHostId = hostId || provider?.hostId || fallbackRemoteHostId || "local";
  const connectionState = getHostState(resolvedHostId);
  const online = connectionState === "connected" && Boolean(providerId) && providerAvailable;
  const hint = online ? ONLINE_HINT : OFFLINE_HINT;
  const label = provider?.label && provider.label.toLocaleLowerCase() !== providerLabel.toLocaleLowerCase()
    ? `${providerLabel} · ${provider.label}`
    : providerLabel;

  const contents = <>
    <span
      aria-hidden="true"
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        online
          ? "bg-emerald-500 ring-2 ring-emerald-500/15 shadow-sm shadow-emerald-500/40"
          : "bg-muted-foreground/45",
      )}
    />
    <span className="min-w-0 truncate">{label}</span>
    {!online && <RefreshCw aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" />}
  </>;

  const classes = cn(
    "inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground",
    compact ? "max-w-full px-1.5 py-0.5" : "max-w-full px-2 py-1",
    !online && "cursor-pointer hover:bg-accent",
    className,
  );

  if (online) return <span className={classes} title={hint} aria-label={hint}>{contents}</span>;
  return (
    <PressButton
      type="button"
      className={classes}
      title={`${hint} — Actualiser la connexion et les fournisseurs`}
      aria-label={`${hint}. Actualiser la connexion et les fournisseurs`}
      onPress={() => {
        if (connectionState !== "connected") reconnectHost(resolvedHostId);
        else reconnect();
        void refreshProviders();
        window.setTimeout(() => void refreshProviders(), connectionState === "connected" ? 350 : 1200);
      }}
    >
      {contents}
    </PressButton>
  );
}
