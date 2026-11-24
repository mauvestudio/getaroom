import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { usePaseo } from "../../context/PaseoContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { getAgentHostId } from "../../lib/paseo/multi-host-client";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// Une même image est affichée à chaque rendu du message : on ne la relit pas.
const urlCache = new Map<string, Promise<string>>();

/** Image dont la source est un fichier du démon (file://…) : lue via le démon de l'hôte de la session. */
export function LocalFileImage({ path, alt, className }: { path: string; alt?: string; className?: string }) {
  const { getClientForHost } = usePaseo();
  const { activeAgentId } = useWorkspace();
  const hostId = activeAgentId ? getAgentHostId(activeAgentId) : "local";
  const [state, setState] = useState<{ url?: string; error?: string }>({});

  useEffect(() => {
    let cancelled = false;
    const key = `${hostId}:${path}`;
    let pending = urlCache.get(key);
    if (!pending) {
      const client = getClientForHost(hostId) ?? getClientForHost("local");
      if (!client) { setState({ error: "Aucune connexion au démon." }); return; }
      pending = client.readFile("/", path, MAX_IMAGE_BYTES).then((file: any) => {
        const bytes: Uint8Array = file.bytes instanceof Uint8Array ? file.bytes : Uint8Array.from(Object.values(file.bytes ?? {}) as number[]);
        return URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.mime || "image/png" }));
      });
      urlCache.set(key, pending);
      // Un échec ne doit pas rester en cache : la lecture sera retentée au prochain affichage.
      pending.catch(() => urlCache.delete(key));
    }
    setState({});
    pending.then(
      (url) => { if (!cancelled) setState({ url }); },
      (error) => { if (!cancelled) setState({ error: error instanceof Error ? error.message : "Lecture impossible." }); },
    );
    return () => { cancelled = true; };
  }, [path, hostId, getClientForHost]);

  if (state.url) return <img src={state.url} alt={alt || ""} className={className} />;
  if (state.error) {
    return (
      <span className="my-3 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground" title={`${path}\n${state.error}`}>
        <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">Image indisponible · {path.split("/").pop()}</span>
      </span>
    );
  }
  return <span aria-label="Chargement de l’image" className="my-3 block h-24 w-40 animate-pulse rounded-lg border border-border bg-muted/40" />;
}
