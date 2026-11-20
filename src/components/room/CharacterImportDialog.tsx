import { useEffect, useMemo, useRef, useState } from "react";
import { FolderOpen, Loader2, Upload } from "lucide-react";
import type { PublicAgent } from "../../config/agents";
import type { PaseoHost } from "../../lib/paseo/hosts";
import { prepareCharacterImage, type PreparedCharacter } from "../../lib/character-import";
import { cn } from "../../lib/utils";
import { PressButton } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { renderAgentSprite, type AgentSpriteFacing, type AgentSpriteState } from "./AgentSpriteRenderer";

type PreviewMode = "idle" | "walk" | "sit" | "grab";

const MODES: Array<{ id: PreviewMode; label: string }> = [
  { id: "idle", label: "Idle" },
  { id: "walk", label: "Marche" },
  { id: "sit", label: "Assis / Travail" },
  { id: "grab", label: "Attrapé par le col" },
];
const FACINGS: Array<{ id: AgentSpriteFacing; label: string }> = [
  { id: "down", label: "↙" }, { id: "left", label: "↖" }, { id: "up", label: "↗" }, { id: "right", label: "↘" },
];
const PREVIEW_STATE: Record<PreviewMode, AgentSpriteState> = { idle: "idle", walk: "walking", sit: "sitting", grab: "grabbed" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: PublicAgent[];
  hosts: PaseoHost[];
  defaultAgentId?: string | null;
  /** Agents ayant actuellement une session visible dans The Room. */
  presentAgentIds?: ReadonlySet<string>;
  /** Décor actif : par défaut, le personnage n'apparaît que sur celui-ci. */
  mapId: string;
  mapName: string;
  onImported: () => void | Promise<void>;
}

const slug = (value: string) => value.toLocaleLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "personnage";

export function CharacterImportDialog({ open, onOpenChange, agents, hosts, defaultAgentId, presentAgentIds, mapId, mapName, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<File | null>(null);
  const [chroma, setChroma] = useState(true);
  const [prepared, setPrepared] = useState<PreparedCharacter | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("shared");
  const [scope, setScope] = useState<"map" | "all">("map");
  const [mode, setMode] = useState<PreviewMode>("idle");
  const [facing, setFacing] = useState<AgentSpriteFacing>("down");
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setTarget(defaultAgentId ? `agent:${defaultAgentId}` : "shared");
    setScope("map");
  }, [open, defaultAgentId]);

  // Réinitialisation à la fermeture.
  useEffect(() => {
    if (open) return;
    setSource(null); setPrepared(null); setName(""); setStatus(""); setWarnings([]); setBusy(false); setMode("idle"); setFacing("down");
  }, [open]);

  // (Re)calcule l'image détourée quand le fichier ou l'option change.
  useEffect(() => {
    if (!source) { setPrepared(null); return; }
    let cancelled = false;
    setStatus("Préparation…");
    prepareCharacterImage(source, chroma).then((result) => {
      if (cancelled) return;
      setPrepared(result);
      setWarnings([
        result.width % 4 || result.height % 4 ? "Dimensions non divisibles par 4 : la grille sera légèrement rognée." : "",
        Math.abs(result.width - result.height) > 4 ? "Les frames ne sont pas carrées (largeur et hauteur de la feuille différentes)." : "",
      ].filter(Boolean));
      setStatus(result.keyed ? "Fond détouré automatiquement." : "");
    }).catch((error) => {
      if (cancelled) return;
      setPrepared(null);
      setWarnings([]);
      setStatus(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [source, chroma]);

  useEffect(() => {
    if (!prepared) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(prepared.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  // Aperçu animé : même moteur de rendu que The Room.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !canvas || !previewUrl) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = 220 * dpr;
    canvas.height = 190 * dpr;
    let frame = 0;
    const loop = (time: number) => {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, 220, 190);
      renderAgentSprite({
        context, x: 110, y: 150, time, index: 0, scale: 3.4, style: "severance",
        state: PREVIEW_STATE[mode], facing, accent: "#8BE9FD", selected: false, hovered: false,
        lift: mode === "grab" ? 26 : 0,
        custom: { url: previewUrl, spriteSheet: true, columns: 4, rows: 4, monochromeFilter: false },
        requestRedraw: () => {},
      });
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [open, previewUrl, mode, facing]);

  const accept = (file: File | undefined | null) => {
    if (!file) return;
    setSource(file);
    setName((current) => current || file.name.replace(/\.[a-z0-9]+$/i, ""));
  };

  const targetOptions = useMemo(() => ({
    agents: agents.map((agent) => ({ value: `agent:${agent.id}`, label: `${agent.name} · ${hosts.find((host) => host.id === agent.paseo.hostId)?.name || agent.paseo.hostId || "Local"}${presentAgentIds && !presentAgentIds.has(agent.id) ? " (absent de la pièce)" : ""}` })),
    hosts: hosts.filter((host) => host.enabled).map((host) => ({ value: `host:${host.id}`, label: host.name })),
  }), [agents, hosts, presentAgentIds]);

  const save = async () => {
    if (!prepared) return;
    setBusy(true);
    setStatus("Enregistrement…");
    try {
      const form = new FormData();
      const characterName = name.trim() || "personnage";
      form.set("image", new File([prepared.blob], `${slug(characterName)}.png`, { type: "image/png" }));
      form.set("spriteSheet", "true");
      form.set("frameSize", String(Math.floor(prepared.width / 4)));
      form.set("name", characterName);
      if (target.startsWith("agent:")) form.set("agentId", target.slice(6));
      else if (target.startsWith("host:")) form.set("hostId", target.slice(5));
      else form.set("shared", "true");
      if (scope === "map") form.set("maps", mapId);
      const response = await fetch("/api/room/characters", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Import impossible.");
      await onImported();
      const absent = target.startsWith("agent:") && presentAgentIds && !presentAgentIds.has(target.slice(6));
      setStatus(absent
        ? "Enregistré, mais cet agent n’a pas de session visible dans The Room : le personnage apparaîtra dès qu’il en aura une. Choisis « Personnage du décor » pour le voir tout de suite."
        : "Personnage enregistré dans ~/.getaroom/characters/ et appliqué dans The Room.");
      setBusy(false);
      if (!absent) window.setTimeout(() => onOpenChange(false), 900);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Ajouter un personnage</DialogTitle>
          <DialogDescription className="text-xs">Sprite sheet 4 × 4 : colonnes idle · marche 1 · marche 2 · assis (ligne 3 : attrapé). Lignes : bas · gauche · droite · haut.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              aria-label="Déposer une sprite sheet ou parcourir"
              onClick={() => fileInput.current?.click()}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.current?.click(); } }}
              onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => { event.preventDefault(); setDragOver(false); accept(event.dataTransfer.files?.[0]); }}
              className={cn(
                "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-4 text-center transition-colors",
                dragOver ? "border-foreground/60 bg-muted" : "border-border hover:border-foreground/40 hover:bg-muted/50",
              )}
            >
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-foreground">{source ? source.name : "Glisse une image ici ou clique pour parcourir"}</span>
              <span className="text-[10px] text-muted-foreground">PNG, JPG ou WebP · 4 × 4 · 20 Mo max</span>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { accept(event.target.files?.[0]); event.target.value = ""; }} />
            </div>

            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={chroma} onChange={(event) => setChroma(event.target.checked)} className="h-3.5 w-3.5 accent-primary" />
              Détourage automatique du fond uni
            </label>

            <div className="space-y-1">
              <label htmlFor="character-name" className="text-[11px] font-medium text-foreground">Nom</label>
              <input id="character-name" value={name} maxLength={48} onChange={(event) => setName(event.target.value)} placeholder="Nom du personnage" className="box-border h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-foreground/40" />
            </div>

            <div className="space-y-1">
              <label htmlFor="character-target" className="text-[11px] font-medium text-foreground">Attribution</label>
              <select id="character-target" value={target} onChange={(event) => setTarget(event.target.value)} className="box-border h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground">
                <option value="shared">Personnage du décor (tous les agents)</option>
                {targetOptions.agents.length > 0 && <optgroup label="Agent précis">{targetOptions.agents.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
                {targetOptions.hosts.length > 0 && <optgroup label="Tous les agents d’un hôte">{targetOptions.hosts.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</optgroup>}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="character-scope" className="text-[11px] font-medium text-foreground">Décor</label>
              <select id="character-scope" value={scope} onChange={(event) => setScope(event.target.value as "map" | "all")} className="box-border h-9 w-full rounded-lg border border-border bg-background px-2 text-xs text-foreground">
                <option value="map">{`Ce décor uniquement · ${mapName}`}</option>
                <option value="all">Tous les décors</option>
              </select>
              <p className="text-[10px] leading-relaxed text-muted-foreground">Un décor sans personnage garde son design d’origine.</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="relative overflow-hidden rounded-xl border border-border bg-[#101011]">
              <canvas ref={canvasRef} className="block h-[190px] w-full" aria-label="Aperçu animé du personnage" />
              {!previewUrl && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[10px] text-muted-foreground">{source ? "Préparation de l’aperçu…" : "L’aperçu animé apparaît ici"}</div>}
            </div>
            <div className="grid grid-cols-2 gap-1" role="group" aria-label="Posture de l’aperçu">
              {MODES.map(({ id, label }) => (
                <PressButton key={id} onPress={() => setMode(id)} aria-pressed={mode === id} className={cn("min-h-8 rounded-md border px-1.5 text-[10px]", mode === id ? "border-foreground/50 bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>{label}</PressButton>
              ))}
            </div>
            <div className="flex items-center justify-between gap-1" role="group" aria-label="Orientation de l’aperçu">
              {FACINGS.map(({ id, label }) => (
                <PressButton key={id} onPress={() => setFacing(id)} aria-pressed={facing === id} disabled={mode === "grab"} className={cn("h-7 flex-1 rounded-md border text-xs disabled:opacity-40", facing === id ? "border-foreground/50 bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>{label}</PressButton>
              ))}
            </div>
          </div>
        </div>

        {warnings.map((warning) => <p key={warning} className="text-[11px] leading-relaxed text-amber-500">{warning}</p>)}
        {status && <p role="status" className="text-[11px] leading-relaxed text-muted-foreground">{status}</p>}

        <div className="flex items-center justify-between gap-2">
          <PressButton onPress={() => void fetch("/api/room/characters/open", { method: "POST" })} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"><FolderOpen className="h-3.5 w-3.5" /> Ouvrir le dossier</PressButton>
          <div className="flex gap-2">
            <PressButton onPress={() => onOpenChange(false)} className="h-8 rounded-lg border border-border px-3 text-[11px] text-muted-foreground hover:bg-muted">Annuler</PressButton>
            <PressButton onPress={() => void save()} disabled={!prepared || busy} className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45">{busy && <Loader2 className="h-3 w-3 animate-spin" />} Enregistrer</PressButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
