import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clipboard, Plus, RefreshCw, Save, X } from "lucide-react";
import type { PublicAgent } from "../../config/agents";
import { useRoom } from "../../context/RoomContext";
import { usePaseo } from "../../context/PaseoContext";
import { useSessionView } from "../../context/SessionViewContext";
import { useWorkspace } from "../../context/WorkspaceContext";
import { tr } from "../../i18n/I18nContext";
import type { AgentSnapshot } from "../../lib/paseo/types";
import { cn } from "../../lib/utils";
import { PendingPermissionCard } from "../chat/PendingPermissionCard";
import { ROOM_FOCUS_EVENT } from "../layout/GlobalShortcuts";
import { PressButton } from "../ui/button";
import { CharacterImportDialog } from "./CharacterImportDialog";
import {
  drawActivityBubble,
  drawAgentLabel,
  renderAgentSprite,
  type AgentSpriteFacing,
  type AgentSpriteState,
  type CustomAgentCharacter,
} from "./AgentSpriteRenderer";
import {
  bubbleLines,
  clamp01,
  distance,
  hostOrder,
  FACING_ARROW,
  FACING_VECTOR,
  hostZoneRects,
  nearestFreeSeat,
  pickCharacter,
  characterOnMap,
  reserveStations,
  rotateFacing,
  spriteMetrics,
  timelineActivity,
  transitionPath,
  walkFacing,
  type ActivityState,
  type Facing,
  type HostZoneRect,
  type Point,
  type StationPoint,
  type RoomSprite,
  type RoomZone,
  type ToolActivity,
} from "./room-scene";
import { useAgentActivity, useHostLatency } from "./useRoomLive";

type RoomState = ActivityState | "alert" | "done";
type PositionKind = ActivityState | "waypoints";

interface RoomMap {
  id: string;
  name: string;
  background?: string;
  backgroundColor: string;
  backgroundUrl?: string;
  source?: "public" | "user";
  positions: Record<ActivityState, StationPoint[]>;
  waypoints: Point[];
  sprite?: RoomSprite;
  zones?: RoomZone[];
}

interface CharacterDescriptor extends CustomAgentCharacter {
  id: string;
  name: string;
  source: "user" | "public";
  agentId?: string;
  hostId?: string;
  shared?: boolean;
  maps?: string[];
  frameSize: number;
}

interface SceneAgent {
  id: string;
  agent?: PublicAgent;
  session: AgentSnapshot | null;
  name: string;
  role: string;
  model: string;
  project: string;
  hostId: string;
  state: RoomState;
  activityState: ActivityState;
  lastAction: string;
  activity: ToolActivity | null;
  accent: string;
  character?: CharacterDescriptor;
  demo: boolean;
}

interface AnimatedAgent {
  x: number;
  y: number;
  state: RoomState;
  activityState: ActivityState;
  mapId: string;
  path: Point[];
  pathIndex: number;
  moving: boolean;
  facing: AgentSpriteFacing;
  stationKey: string;
  /** Position de repli du poste assigné et orientation du bureau (assis face à l'écran). */
  home: Point;
  seatFacing?: AgentSpriteFacing;
  /** Poste choisi à la main par Grab & Drop, valable tant que l'état de l'agent ne change pas. */
  pin?: { key: string; point: StationPoint };
  pinFor?: ActivityState;
  /** Grab & Drop : purement visuel (aucun effet sur Paseo, les sessions ou room.json). */
  grabbed: boolean;
  dropAt: number;
  holdUntil: number;
}

interface ImageRect { x: number; y: number; width: number; height: number }
interface AgentHit { id: string; x: number; y: number; radius: number }
interface CalibrationHit { kind: PositionKind; index: number; x: number; y: number }

const MAP_KEY = "getaroom-the-room-map";
const DEMO_KEY = "getaroom-the-room-demo";
const TIE_COLORS = ["#FF5555", "#8BE9FD", "#FFB86C", "#50FA7B", "#BD93F9"];
const DEMO_AGENTS = [
  { id: "demo-claude", name: "Claude", role: "Architecture", model: "Claude", accent: TIE_COLORS[0]! },
  { id: "demo-codex", name: "Codex", role: "Développement", model: "Codex", accent: TIE_COLORS[1]! },
  { id: "demo-hermes", name: "Hermes", role: "Opérations", model: "Hermes", accent: TIE_COLORS[2]! },
  { id: "demo-qwen", name: "Qwen", role: "Recherche", model: "Qwen", accent: TIE_COLORS[3]! },
] as const;
const DEMO_SEQUENCE: ActivityState[] = ["working", "thinking", "idle", "working", "idle", "thinking"];
const MOVE_SPEED = 0.105;
const ACTIVE_FRAME_MS = 0;
const CALM_FRAME_MS = 33; // ≈ 30 images/s quand personne ne se déplace
const IDLE_FRAME_MS = 66; // ≈ 15 images/s quand tout le monde est au repos
const CALIBRATION_SAVE_DELAY = 600;
const SIZE_KEY = "getaroom-the-room-character-size";
const SIZE_DEFAULT = 1.15;
const SIZE_MIN = 0.7;
const SIZE_MAX = 2;
const clampSize = (value: number) => Math.round(Math.max(SIZE_MIN, Math.min(SIZE_MAX, value)) * 100) / 100;
const GRAB_THRESHOLD = 5; // px : en dessous, c'est un simple clic
const GRAB_LIFT = 26; // px : hauteur à laquelle le personnage est suspendu
const DROP_BOUNCE_MS = 300;
const DROP_PAUSE_MS = 800;
const bounceLift = (progress: number) => GRAB_LIFT * Math.exp(-3.5 * progress) * Math.abs(Math.cos(progress * Math.PI * 1.5));

const cloneMap = (map: RoomMap) => JSON.parse(JSON.stringify(map)) as RoomMap;
const latestFirst = (sessions: AgentSnapshot[]) => [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function sessionLabel(session: AgentSnapshot | null): string {
  if (!session) return "En attente d’une session";
  if (session.attentionReason === "permission") return "Validation requise";
  if (session.attentionReason === "finished" || session.status === "completed") return "Tâche terminée";
  if (session.status === "running") return "Session en cours";
  if (session.status === "failed") return "Session en erreur";
  return "En attente de prompt";
}

function stateLabel(state: RoomState): string {
  if (state === "alert") return "À valider";
  if (state === "done") return "À relire";
  if (state === "idle") return "Au repos";
  return "Au travail";
}

function stationLabel(state: ActivityState): string {
  if (state === "working") return "Poste de travail";
  if (state === "thinking") return "Zone d’observation";
  return "Espace de repos";
}

function roomPayload(map: RoomMap): RoomMap {
  return {
    id: map.id,
    name: map.name,
    background: map.background || "bg.jpg",
    backgroundColor: map.backgroundColor,
    positions: map.positions,
    waypoints: map.waypoints,
    ...(map.sprite ? { sprite: map.sprite } : {}),
    ...(map.zones ? { zones: map.zones } : {}),
  };
}

function visibleSessions(sessions: AgentSnapshot[]): AgentSnapshot[] {
  return latestFirst(sessions).filter((session, index) =>
    session.status === "running" ||
    Boolean(session.requiresAttention) ||
    session.attentionReason === "permission" ||
    index === 0,
  );
}


export function TheRoomCanvas({ active = true }: { active?: boolean }) {
  const { agents, selectedAgentId, openAgent, sessionsOf, approvalsOf, setThreadId } = useRoom();
  const { activeAgentId, timeline, setActiveAgentId, pendingPermissions, respondToPermission } = useWorkspace();
  const { client, hosts, hostStates, getClientForHost } = usePaseo();
  const { setViewMode } = useSessionView();
  const activityOf = useAgentActivity(client, active);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressRef = useRef<{ id: string; startX: number; startY: number } | null>(null);
  const grabRef = useRef<{ id: string; pointer: Point } | null>(null);
  const handleRef = useRef<{ kind: PositionKind; index: number } | null>(null);
  const rotateStationRef = useRef<(kind: PositionKind, index: number) => void>(() => {});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const imageRectRef = useRef<ImageRect>({ x: 0, y: 0, width: 1, height: 1 });
  const canvasSizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const animatedAgentsRef = useRef(new Map<string, AnimatedAgent>());
  const agentHitsRef = useRef<AgentHit[]>([]);
  const calibrationHitsRef = useRef<CalibrationHit[]>([]);
  const sceneAgentsRef = useRef<SceneAgent[]>([]);
  const zoneRectsRef = useRef<Array<HostZoneRect & { label: string }>>([]);
  const mapRef = useRef<RoomMap | null>(null);
  const hoveredIdRef = useRef<string | null>(null);
  const focusedIdRef = useRef<string | null>(null);
  const calibratingRef = useRef(false);
  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const lastDrawRef = useRef(0);
  const redrawQueuedRef = useRef(false);
  const activeRef = useRef(active);
  const intersectingRef = useRef(true);
  const visibleRef = useRef(false);
  const draggingRef = useRef<{ kind: PositionKind; index: number } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMapIdRef = useRef("severance-mdr");

  const [maps, setMaps] = useState<RoomMap[]>([]);
  const [mapsStatus, setMapsStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [activeMapId, setActiveMapId] = useState(() => { try { return localStorage.getItem(MAP_KEY) || "severance-mdr"; } catch { return "severance-mdr"; } });
  const [draftMap, setDraftMap] = useState<RoomMap | null>(null);
  const [characters, setCharacters] = useState<CharacterDescriptor[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [selectedStation, setSelectedStation] = useState<number | null>(null);
  const [characterSize, setCharacterSize] = useState(() => {
    try { const stored = Number(localStorage.getItem(SIZE_KEY)); return stored > 0 ? clampSize(stored) : SIZE_DEFAULT; } catch { return SIZE_DEFAULT; }
  });
  const sizeRef = useRef(characterSize);
  const charactersRef = useRef<CharacterDescriptor[]>([]);
  const [simulationStep, setSimulationStep] = useState(0);
  const [demoOverride, setDemoOverride] = useState<boolean | null>(() => {
    try {
      const value = localStorage.getItem(DEMO_KEY);
      return value === "on" ? true : value === "off" ? false : null;
    } catch { return null; }
  });
  sizeRef.current = characterSize;
  charactersRef.current = characters;
  activeMapIdRef.current = activeMapId;
  activeRef.current = active;
  calibratingRef.current = calibrating;

  const loadMaps = useCallback(async () => {
    setMapsStatus("loading");
    try {
      const response = await fetch("/api/room/maps", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as { maps?: RoomMap[] };
      const nextMaps = result.maps || [];
      setMaps(nextMaps);
      const selected = nextMaps.find((map) => map.id === activeMapIdRef.current) || nextMaps[0];
      if (!selected) { setMapsStatus("empty"); return; }
      setActiveMapId(selected.id);
      setDraftMap(cloneMap(selected));
      setMapsStatus("ready");
    } catch {
      setMapsStatus("error");
    }
  }, []);

  const loadCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/room/characters", { cache: "no-store" });
      const result = await response.json() as { characters?: CharacterDescriptor[] };
      setCharacters(result.characters || []);
    } catch { setCharacters([]); }
  }, []);

  useEffect(() => { void loadMaps(); void loadCharacters(); }, [loadMaps, loadCharacters]);

  const realSceneAgents = useMemo<SceneAgent[]>(() => agents.flatMap((agent, agentIndex) => {
    const pending = approvalsOf(agent);
    return visibleSessions(sessionsOf(agent)).map((session) => {
      // Flux `agent_stream` pour toutes les sessions ; la timeline ouverte reste un repli.
      const activity = session.status === "running"
        ? activityOf(session.id) ?? (session.id === activeAgentId ? timelineActivity(timeline) : null)
        : null;
      const hasApproval = pending.some((entry) => entry.agentId === session.id) || session.attentionReason === "permission";
      const done = session.attentionReason === "finished" || session.status === "completed";
      const failed = session.status === "failed" || session.status === "canceled";
      const activityState: ActivityState = session.status === "running" ? activity?.state || "working" : "idle";
      const state: RoomState = hasApproval || failed ? "alert" : done ? "done" : activityState;
      return {
        id: `${agent.id}:${session.id}`,
        agent,
        session,
        name: agent.name,
        role: agent.role,
        model: session.model || agent.paseo.model || agent.paseo.provider || "Paseo",
        project: session.project?.projectName || session.title || session.cwd?.split("/").filter(Boolean).pop() || "Room",
        hostId: session.hostId || agent.paseo.hostId || "local",
        state,
        activityState,
        lastAction: activity?.command ? `$ ${activity.command}` : activity?.label || sessionLabel(session),
        activity,
        accent: agent.accentColor || TIE_COLORS[agentIndex % TIE_COLORS.length]!,
        character: pickCharacter(characters, agent.id, agent.name, session.hostId || agent.paseo.hostId || "local", activeMapId),
        demo: false,
      };
    });
  }), [agents, approvalsOf, sessionsOf, activeAgentId, timeline, characters, activityOf, activeMapId]);

  const realActiveCount = realSceneAgents.filter((item) => item.session?.status === "running" || item.state === "alert").length;
  // La démo ne s'invite que lorsque la pièce est vide : dès qu'un vrai agent travaille, elle disparaît.
  const demoEnabled = demoOverride ?? realActiveCount < 1;

  const demoSceneAgents = useMemo<SceneAgent[]>(() => !demoEnabled ? [] : DEMO_AGENTS.map((resident, index) => {
    const activityState = DEMO_SEQUENCE[(simulationStep + index * 2) % DEMO_SEQUENCE.length]!;
    const state: RoomState = simulationStep > 0 && simulationStep % 7 === 0 && index === simulationStep % DEMO_AGENTS.length ? "done" : activityState;
    const action = activityState === "working" ? "Édition et commande en cours" : activityState === "thinking" ? "Lecture et raisonnement" : "En attente de prompt";
    return {
      id: resident.id,
      session: null,
      name: resident.name,
      role: resident.role,
      model: resident.model,
      project: "Résident The Room",
      hostId: "local",
      state,
      activityState,
      lastAction: action,
      activity: null,
      accent: resident.accent,
      character: pickCharacter(characters, resident.id, resident.name, undefined, activeMapId),
      demo: true,
    };
  }), [demoEnabled, simulationStep, characters, activeMapId]);

  const sceneAgents = useMemo(() => [...realSceneAgents, ...demoSceneAgents], [realSceneAgents, demoSceneAgents]);
  const activeMap = draftMap;
  const focusedAgent = sceneAgents.find((item) => item.id === focusedAgentId) || null;
  const presentAgentIds = useMemo(() => new Set(sceneAgents.flatMap((item) => item.agent ? [item.agent.id] : [])), [sceneAgents]);
  const hoveredAgent = sceneAgents.find((item) => item.id === hoveredId) || null;
  const realHostIds = useMemo(() => hostOrder(realSceneAgents.map((item) => item.hostId)), [realSceneAgents]);
  const latency = useHostLatency(getClientForHost, realHostIds, active);
  const hostName = useCallback((hostId: string) => hosts.find((host) => host.id === hostId)?.name || hostId, [hosts]);
  const focusedApprovals = useMemo(
    () => focusedAgent?.session ? pendingPermissions.filter((entry) => entry.agentId === focusedAgent.session!.id) : [],
    [focusedAgent, pendingPermissions],
  );

  useEffect(() => {
    if (!demoEnabled || !active) return;
    const timer = window.setInterval(() => setSimulationStep((step) => step + 1), 5800);
    return () => window.clearInterval(timer);
  }, [demoEnabled, active]);

  useEffect(() => { focusedIdRef.current = focusedAgentId; }, [focusedAgentId]);

  // ⌘⇧A depuis The Room : l'agent concerné est mis en avant et sa fenêtre d'approbation s'ouvre.
  useEffect(() => {
    if (!active) return;
    const onFocusAgent = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setFocusedAgentId(id);
    };
    window.addEventListener(ROOM_FOCUS_EVENT, onFocusAgent);
    return () => window.removeEventListener(ROOM_FOCUS_EVENT, onFocusAgent);
  }, [active]);

  const updateImageRect = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const image = imageRef.current;
    if (!image || !mapRef.current?.backgroundUrl) {
      // Décor absent : on garde un repère plein cadre plutôt qu'un rectangle 1×1.
      imageRectRef.current = { x: 0, y: 0, width: Math.max(1, bounds.width), height: Math.max(1, bounds.height) };
      return;
    }
    if (!image.naturalWidth || !image.naturalHeight) return;
    const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    imageRectRef.current = { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
  }, []);

  const normalizedToScreen = (point: Point): Point => {
    const rect = imageRectRef.current;
    return { x: rect.x + point.x * rect.width, y: rect.y + point.y * rect.height };
  };

  const screenToNormalized = (point: Point): Point => {
    const rect = imageRectRef.current;
    return { x: clamp01((point.x - rect.x) / rect.width), y: clamp01((point.y - rect.y) / rect.height) };
  };

  const draw = useCallback((time = performance.now()) => {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    lastDrawRef.current = time;
    const { width, height, dpr } = canvasSizeRef.current;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    agentHitsRef.current = [];
    const rect = imageRectRef.current;
    const metrics = spriteMetrics(map, rect.height);
    const style = metrics.style;
    const scale = metrics.scale * sizeRef.current;
    const groundShift = metrics.groundOffset * 30 * scale;
    const toScreen = (point: Point): Point => ({ x: rect.x + point.x * rect.width, y: rect.y + point.y * rect.height });
    const scene = sceneAgentsRef.current;

    // Algorithme du peintre : du plus lointain (y faible) au plus proche, départage stable.
    const grab = grabRef.current;
    const collar = (style === "monochrome" ? 31 : 29) * scale * .9;
    const ordered = scene
      .map((item, number) => ({ item, number, animated: animatedAgentsRef.current.get(item.id) }))
      .filter((entry): entry is { item: SceneAgent; number: number; animated: AnimatedAgent } => Boolean(entry.animated))
      // Le personnage attrapé passe toujours devant ; sinon algorithme du peintre.
      .sort((a, b) => Number(a.animated.grabbed) - Number(b.animated.grabbed)
        || a.animated.y - b.animated.y || a.animated.x - b.animated.x || a.item.id.localeCompare(b.item.id));

    const placed = ordered.map(({ item, number, animated }) => {
      let point = toScreen(animated);
      let lift = 0;
      let facing = animated.facing;
      let spriteState: AgentSpriteState;
      if (animated.grabbed && grab?.id === item.id) {
        // Suspendu par le col : le curseur tient le col, l'ombre reste au sol, juste en dessous.
        point = { x: grab.pointer.x, y: grab.pointer.y + GRAB_LIFT + collar };
        lift = GRAB_LIFT;
        spriteState = "grabbed";
      } else if (animated.holdUntil) {
        const elapsed = time - animated.dropAt;
        lift = elapsed < DROP_BOUNCE_MS ? bounceLift(elapsed / DROP_BOUNCE_MS) : 0;
        spriteState = "idle";
        facing = "down";
      } else if (animated.moving) {
        spriteState = "walking";
      } else if (animated.stationKey.startsWith("working:") && item.state !== "alert" && item.state !== "done") {
        spriteState = "sitting"; // assis face à l'écran, frame `sitting_typing`
      } else {
        spriteState = item.state;
      }
      if (spriteState !== "sitting" && spriteState !== "grabbed") point = { x: point.x, y: point.y + groundShift };
      const bounds = renderAgentSprite({
        context,
        x: point.x,
        y: point.y,
        time,
        index: number,
        scale,
        style,
        state: spriteState,
        lift,
        facing,
        accent: item.accent,
        selected: focusedIdRef.current === item.id,
        hovered: hoveredIdRef.current === item.id,
        custom: item.character,
        requestRedraw: redrawOnce,
      });
      agentHitsRef.current.push({ id: item.id, x: bounds.x, y: bounds.y, radius: bounds.radius });
      return { item, number, point, bounds };
    });

    // Passe de premier plan : étiquettes et bulles ne sont jamais masquées par un sprite voisin.
    for (const { item, number, point, bounds } of placed) {
      const labelled = focusedIdRef.current === item.id || hoveredIdRef.current === item.id;
      if (labelled) {
        drawAgentLabel({
          context, x: point.x, top: bounds.top, accent: item.accent, style,
          label: `${String(number + 1).padStart(2, "0")} · ${item.name.toLocaleUpperCase()}`,
        });
      }
      const bubble = animatedAgentsRef.current.get(item.id)?.grabbed ? null
        : item.state === "working" || item.state === "thinking"
        ? item.activity ? { text: bubbleLines(item.activity).primary, additions: item.activity.additions, deletions: item.activity.deletions } : null
        : item.state === "alert" ? { text: tr("À valider") } : null;
      if (bubble) {
        drawActivityBubble({
          context, x: point.x, top: bounds.top, accent: item.accent, style,
          text: bubble.text,
          additions: "additions" in bubble ? bubble.additions : undefined,
          deletions: "deletions" in bubble ? bubble.deletions : undefined,
          lift: (labelled ? 22 : 0) + (item.state === "alert" || item.state === "done" ? 9 : 0),
          alpha: 1,
          minX: 6,
          maxX: width - 6,
        });
      }
    }

    calibrationHitsRef.current = [];
    if (!calibratingRef.current) return;

    // Zones d'hôtes : visibles uniquement en calibrage, jamais sur le décor en usage normal.
    context.save();
    context.font = "600 9px 'Geist Mono', ui-monospace, monospace";
    context.textAlign = "left";
    context.textBaseline = "top";
    for (const zone of zoneRectsRef.current) {
      const a = toScreen({ x: Math.min(zone.x0, zone.x1), y: Math.min(zone.y0, zone.y1) });
      const b = toScreen({ x: Math.max(zone.x0, zone.x1), y: Math.max(zone.y0, zone.y1) });
      context.setLineDash(zone.derived ? [2, 5] : [6, 4]);
      context.strokeStyle = "rgba(255,255,255,.55)";
      context.fillStyle = "rgba(255,255,255,.05)";
      context.lineWidth = 1;
      context.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      context.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      context.setLineDash([]);
      context.fillStyle = "rgba(255,255,255,.85)";
      context.fillText(zone.label.toLocaleUpperCase(), a.x + 5, a.y + 4);
    }
    context.restore();

    // Aperçu fantôme : le personnage assis, à l'orientation de chaque poste de travail (pivoter = voir le résultat).
    // Sans personnage pour ce décor, l'aperçu montre le design d'origine (fantômes noir et blanc sur Monument).
    const ghost = scene.find((entry) => entry.character)?.character
      ?? charactersRef.current.find((entry) => characterOnMap(entry, map.id) && entry.spriteSheet);
    map.positions.working.forEach((position, index) => {
      const point = toScreen(position);
      context.save();
      context.globalAlpha = .55;
      renderAgentSprite({
        context, x: point.x, y: point.y, time, index, scale, style, state: "sitting",
        facing: position.facing ?? "down", accent: "#67E8F9", selected: false, hovered: false,
        custom: ghost, requestRedraw: redrawOnce,
      });
      context.restore();
    });

    const colors: Record<PositionKind, string> = { working: "#67E8F9", thinking: "#C4B5FD", idle: "#86EFAC", waypoints: "#FFFFFF" };
    const groups: Array<{ kind: PositionKind; points: Point[] }> = [
      { kind: "working", points: map.positions.working },
      { kind: "thinking", points: map.positions.thinking },
      { kind: "idle", points: map.positions.idle },
      { kind: "waypoints", points: map.waypoints },
    ];
    groups.forEach(({ kind, points }) => points.forEach((position, index) => {
      const point = toScreen(position);
      if (kind === "waypoints" && index > 0) {
        const previous = toScreen(points[index - 1]!);
        context.strokeStyle = "rgba(255,255,255,.65)";
        context.setLineDash([4, 4]);
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
        context.setLineDash([]);
      }
      context.save();
      context.shadowBlur = 8;
      context.shadowColor = colors[kind];
      context.fillStyle = colors[kind];
      context.strokeStyle = "rgba(0,0,0,.75)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
      context.fillStyle = "#080808";
      context.font = "bold 8px ui-monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(index + 1), point.x, point.y + .5);
      const facing = kind === "working" ? (position as StationPoint).facing : undefined;
      if (facing) {
        const [vx, vy] = FACING_VECTOR[facing];
        context.fillStyle = "#67E8F9";
        context.strokeStyle = "rgba(0,0,0,.7)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(point.x + vx * 19, point.y + vy * 19);
        context.lineTo(point.x + vx * 11 - vy * 5, point.y + vy * 11 + vx * 5);
        context.lineTo(point.x + vx * 11 + vy * 5, point.y + vy * 11 - vx * 5);
        context.closePath();
        context.fill();
        context.stroke();
      }
      calibrationHitsRef.current.push({ kind, index, x: point.x, y: point.y });
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Un seul rendu différé (chargement d'une image, changement de données) sans relancer la boucle. */
  const redrawOnce = useCallback(() => {
    if (redrawQueuedRef.current) return;
    redrawQueuedRef.current = true;
    requestAnimationFrame(() => { redrawQueuedRef.current = false; draw(); });
  }, [draw]);

  useEffect(() => { redrawOnce(); }, [focusedAgentId, characterSize, redrawOnce]);

  const schedule = useCallback(() => {
    if (animationRef.current !== null || !visibleRef.current) return;
    const tick = (time: number) => {
      animationRef.current = null;
      if (!visibleRef.current) return;
      const scene = sceneAgentsRef.current;
      if (scene.length === 0 && !calibratingRef.current) return; // rien à animer : 0 % CPU

      const previous = lastFrameRef.current || time;
      const delta = Math.min(.05, (time - previous) / 1000);
      lastFrameRef.current = time;

      let moving = false;
      animatedAgentsRef.current.forEach((agent) => {
        if (agent.grabbed) { moving = true; return; }
        if (agent.holdUntil) {
          // Rebond (0,3 s) puis pause (0,8 s) avant de reprendre sa place ou son nouveau poste.
          if (time < agent.holdUntil) { moving = true; return; }
          agent.holdUntil = 0;
          agent.dropAt = 0;
          agent.path = agent.pin ? [agent.pin.point] : transitionPath(agent, agent.home, agent.activityState, mapRef.current?.waypoints ?? []);
          agent.pathIndex = 0;
          agent.moving = true;
        }
        const target = agent.path[agent.pathIndex];
        if (!target) { agent.moving = false; return; }
        const dx = target.x - agent.x;
        const dy = target.y - agent.y;
        const remaining = Math.hypot(dx, dy);
        agent.facing = walkFacing(dx, dy, agent.facing);
        if (remaining < .002) {
          agent.x = target.x;
          agent.y = target.y;
          agent.pathIndex += 1;
          agent.moving = agent.pathIndex < agent.path.length;
          if (!agent.moving && agent.seatFacing && agent.stationKey.startsWith("working:")) agent.facing = agent.seatFacing;
        } else {
          const amount = Math.min(remaining, delta * MOVE_SPEED) / remaining;
          agent.x += dx * amount;
          agent.y += dy * amount;
          agent.moving = true;
        }
        moving ||= agent.moving;
      });

      const allResting = scene.every((item) => item.state === "idle") && !focusedIdRef.current && !hoveredIdRef.current;
      const interval = moving || draggingRef.current || grabRef.current ? ACTIVE_FRAME_MS : allResting && !calibratingRef.current ? IDLE_FRAME_MS : CALM_FRAME_MS;
      if (moving || time - lastDrawRef.current >= interval - 2) draw(time);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [draw]);

  const stopLoop = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    lastFrameRef.current = 0;
  }, []);

  // Pause totale (0 % CPU) : onglet masqué, fenêtre en arrière-plan, Room hors écran ou vue inactive.
  const refreshVisibility = useCallback(() => {
    const next = activeRef.current && !document.hidden && document.hasFocus() && intersectingRef.current;
    const was = visibleRef.current;
    visibleRef.current = next;
    if (!next) { stopLoop(); return; }
    if (!was) { updateImageRect(); draw(); }
    schedule();
  }, [draw, schedule, stopLoop, updateImageRect]);

  useEffect(() => { refreshVisibility(); }, [active, refreshVisibility]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => {
      intersectingRef.current = Boolean(entry?.isIntersecting);
      refreshVisibility();
    }, { threshold: .01 });
    observer.observe(container);
    document.addEventListener("visibilitychange", refreshVisibility);
    window.addEventListener("focus", refreshVisibility);
    window.addEventListener("blur", refreshVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", refreshVisibility);
      window.removeEventListener("focus", refreshVisibility);
      window.removeEventListener("blur", refreshVisibility);
      stopLoop();
      visibleRef.current = false;
    };
  }, [refreshVisibility, stopLoop]);

  // Synchronisation scène ↔ données Paseo.
  useEffect(() => {
    mapRef.current = activeMap;
    sceneAgentsRef.current = sceneAgents;
    if (!activeMap) return;
    // Un poste choisi à la main cesse de s'appliquer dès que l'état réel de l'agent change.
    sceneAgents.forEach((item) => {
      const pinned = animatedAgentsRef.current.get(item.id);
      if (pinned?.pin && pinned.pinFor !== item.activityState) pinned.pin = undefined;
    });
    const stations = reserveStations(sceneAgents, activeMap, animatedAgentsRef.current);
    sceneAgents.forEach((item) => {
      const assignment = stations.get(item.id);
      if (!assignment) return;
      const current = animatedAgentsRef.current.get(item.id);
      if (!current) {
        animatedAgentsRef.current.set(item.id, {
          ...assignment.point,
          state: item.state,
          activityState: item.activityState,
          mapId: activeMap.id,
          path: [],
          pathIndex: 0,
          moving: false,
          facing: assignment.key.startsWith("working:") && assignment.facing ? assignment.facing : "down",
          stationKey: assignment.key,
          home: assignment.point,
          seatFacing: assignment.facing,
          grabbed: false,
          dropAt: 0,
          holdUntil: 0,
        });
        return;
      }
      current.home = assignment.point;
      current.seatFacing = assignment.facing;
      if (current.grabbed || current.holdUntil) {
        // Pendant la manipulation, on suit les données sans toucher au déplacement.
        current.state = item.state;
        current.activityState = item.activityState;
        current.stationKey = assignment.key;
        return;
      }
      const changedMap = current.mapId !== activeMap.id;
      const changedStation = current.stationKey !== assignment.key || distance(current, assignment.point) > .012;
      if (changedMap || changedStation || current.activityState !== item.activityState) {
        current.path = changedMap ? [assignment.point] : transitionPath(current, assignment.point, item.activityState, activeMap.waypoints);
        current.pathIndex = 0;
        current.moving = true;
      }
      current.state = item.state;
      current.activityState = item.activityState;
      current.mapId = activeMap.id;
      current.stationKey = assignment.key;
    });
    for (const id of animatedAgentsRef.current.keys()) {
      if (!sceneAgents.some((item) => item.id === id)) animatedAgentsRef.current.delete(id);
    }
    zoneRectsRef.current = hostZoneRects(activeMap, realHostIds).map((zone) => ({
      ...zone,
      label: activeMap.zones?.find((entry) => entry.hostId === zone.hostId)?.label || hostName(zone.hostId),
    }));
    if (focusedAgentId && !sceneAgents.some((item) => item.id === focusedAgentId)) setFocusedAgentId(null);
    updateImageRect();
    draw();
    schedule();
  }, [activeMap, sceneAgents, focusedAgentId, realHostIds, hostName, draw, schedule, updateImageRect, calibrating, layoutVersion]);

  // Redimensionnement + densité de pixels (Retina ↔ écran externe).
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      if (bounds.width < 2 || bounds.height < 2) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const pixelWidth = Math.round(bounds.width * dpr);
      const pixelHeight = Math.round(bounds.height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      canvasSizeRef.current = { width: bounds.width, height: bounds.height, dpr };
      updateImageRect();
      draw();
      schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    let query: MediaQueryList | null = null;
    const onDensityChange = () => { resize(); watchDensity(); };
    const watchDensity = () => {
      query?.removeEventListener("change", onDensityChange);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener("change", onDensityChange, { once: true });
    };
    watchDensity();
    resize();
    return () => {
      observer.disconnect();
      query?.removeEventListener("change", onDensityChange);
    };
  }, [draw, schedule, updateImageRect]);

  // Raccourci de calibrage : jamais pendant la saisie, et seulement quand The Room est visible.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (event.key.toLocaleLowerCase() !== "e" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .xterm")) return;
      const container = containerRef.current;
      if (!container || container.getClientRects().length === 0) return;
      event.preventDefault();
      setCalibrating((value) => !value);
      setCalibrationStatus("");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  // Calibrage : la touche R pivote le poste de travail survolé (ou le dernier manipulé).
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() !== "r" || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.repeat) return;
      if (!calibratingRef.current || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true'], .xterm")) return;
      const handle = handleRef.current;
      if (!handle || handle.kind !== "working") return;
      event.preventDefault();
      rotateStationRef.current(handle.kind, handle.index);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const moveCalibrationPoint = (kind: PositionKind, index: number, screen: Point) => {
    const position = screenToNormalized(screen);
    setDraftMap((current) => {
      if (!current) return current;
      const next = cloneMap(current);
      if (kind === "waypoints") next.waypoints[index] = position;
      // Déplacer un poste ne doit pas perdre son orientation (facing).
      else next.positions[kind][index] = { ...next.positions[kind][index], ...position };
      return next;
    });
  };

  const openSession = useCallback((item: SceneAgent) => {
    if (!item.session) return;
    if (item.agent) {
      setThreadId(item.agent.id, item.session.id);
      openAgent(item.agent.id);
    }
    setActiveAgentId(item.session.id);
    setViewMode("discussion");
  }, [openAgent, setActiveAgentId, setThreadId, setViewMode]);

  const saveCalibration = useCallback(async (silent = false) => {
    const map = mapRef.current;
    if (!map) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!silent) setCalibrationStatus("Sauvegarde…");
    try {
      const response = await fetch(`/api/room/maps/${encodeURIComponent(map.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(roomPayload(map)),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Sauvegarde impossible.");
      // La liste locale reflète aussitôt le calibrage : revenir sur ce décor ne ressuscite pas l'ancien.
      setMaps((list) => list.map((entry) => entry.id === map.id
        ? { ...entry, positions: map.positions, waypoints: map.waypoints, source: "user" }
        : entry));
      setCalibrationStatus("Coordonnées sauvegardées");
    } catch (error) {
      setCalibrationStatus(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const queueCalibrationSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setCalibrationStatus("Modifications en cours…");
    saveTimerRef.current = setTimeout(() => { saveTimerRef.current = null; void saveCalibration(true); }, CALIBRATION_SAVE_DELAY);
  }, [saveCalibration]);

  // Un calibrage en attente n'est jamais perdu au démontage.
  useEffect(() => () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); void saveCalibration(true); }
  }, [saveCalibration]);

  const hitAgent = (point: Point) => [...agentHitsRef.current].reverse().find((area) => distance(point, area) <= area.radius);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return; // le clic droit est réservé au calibrage (pivoter un poste)
    const point = canvasPoint(event);
    if (calibrating) {
      const handle = [...calibrationHitsRef.current].reverse().find((hit) => distance(point, hit) <= 11);
      if (handle) {
        draggingRef.current = { kind: handle.kind, index: handle.index };
        handleRef.current = { kind: handle.kind, index: handle.index };
        setSelectedStation(handle.kind === "working" ? handle.index : null);
        event.currentTarget.setPointerCapture(event.pointerId);
        schedule();
        return;
      }
    }
    const item = sceneAgents.find((candidate) => candidate.id === hitAgent(point)?.id);
    if (!item) { setFocusedAgentId(null); return; }
    // Clic court → sélection ; clic maintenu + glissement (> 5 px) → on l'attrape par le col.
    pressRef.current = { id: item.id, startX: point.x, startY: point.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const clickAgent = (id: string) => {
    const item = sceneAgents.find((candidate) => candidate.id === id);
    if (!item) return;
    const hasApproval = item.session ? pendingPermissions.some((entry) => entry.agentId === item.session!.id) : false;
    // Un agent en attente de validation ouvre directement la fenêtre d'approbation ; sinon 2ᵉ clic = ouvrir la session.
    if (focusedIdRef.current === item.id && item.session && !hasApproval) openSession(item);
    else setFocusedAgentId(item.id);
    redrawOnce();
  };

  const startGrab = (id: string, point: Point) => {
    const animated = animatedAgentsRef.current.get(id);
    if (!animated) return;
    animated.grabbed = true;
    animated.path = [];
    animated.pathIndex = 0;
    animated.moving = false;
    animated.holdUntil = 0;
    animated.dropAt = 0;
    grabRef.current = { id, pointer: point };
    hoveredIdRef.current = null;
    setHoveredId(null);
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
    schedule();
  };

  const dropGrab = () => {
    const grab = grabRef.current;
    grabRef.current = null;
    pressRef.current = null;
    if (canvasRef.current) canvasRef.current.style.cursor = "default";
    const animated = grab ? animatedAgentsRef.current.get(grab.id) : undefined;
    const map = mapRef.current;
    if (!grab || !animated || !map) return;
    const metrics = spriteMetrics(map, imageRectRef.current.height);
    const collar = (metrics.style === "monochrome" ? 31 : 29) * metrics.scale * sizeRef.current * .9;
    const ground = screenToNormalized({ x: grab.pointer.x, y: grab.pointer.y + GRAB_LIFT + collar });
    const now = performance.now();
    animated.grabbed = false;
    animated.x = ground.x;
    animated.y = ground.y;
    animated.path = [];
    animated.pathIndex = 0;
    animated.moving = false;
    animated.dropAt = now;
    animated.holdUntil = now + DROP_BOUNCE_MS + DROP_PAUSE_MS;
    // Lâché sur un poste de travail libre : il s'y assoit ; sinon il regagne sa place.
    const taken = new Set<string>();
    animatedAgentsRef.current.forEach((other, id) => { if (id !== grab.id) taken.add(other.pin?.key ?? other.stationKey); });
    const seat = nearestFreeSeat(map, ground, taken);
    animated.pin = seat ? { key: seat.key, point: seat.point } : undefined;
    animated.pinFor = seat ? animated.activityState : undefined;
    setLayoutVersion((value) => value + 1);
    schedule();
  };

  const setStationFacing = (index: number, facing: Facing | "next") => {
    setSelectedStation(index);
    setDraftMap((current) => {
      const point = current?.positions.working[index];
      if (!current || !point) return current;
      const next = cloneMap(current);
      next.positions.working[index] = { ...point, facing: facing === "next" ? rotateFacing(point.facing) : facing };
      return next;
    });
    queueCalibrationSave();
  };

  const rotateStation = (kind: PositionKind, index: number) => {
    rotateStationRef.current = rotateStation;
    if (kind === "working") setStationFacing(index, "next");
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event);
    pointerRef.current = point;
    if (draggingRef.current) {
      moveCalibrationPoint(draggingRef.current.kind, draggingRef.current.index, point);
      return;
    }
    const press = pressRef.current;
    if (press && !grabRef.current && distance(point, { x: press.startX, y: press.startY }) > GRAB_THRESHOLD) startGrab(press.id, point);
    if (grabRef.current) {
      grabRef.current.pointer = point;
      event.currentTarget.style.cursor = "grabbing";
      return;
    }
    const handleHit = calibrating ? [...calibrationHitsRef.current].reverse().find((hit) => distance(point, hit) <= 11) : undefined;
    handleRef.current = handleHit ? { kind: handleHit.kind, index: handleHit.index } : handleRef.current;
    const calibrationHandle = Boolean(handleHit);
    const hit = hitAgent(point);
    event.currentTarget.style.cursor = calibrationHandle ? "grab" : hit ? "pointer" : "default";
    // Le tooltip suit le curseur sans re-rendre React : seul le changement d'agent survolé met l'état à jour.
    const tooltip = tooltipRef.current;
    if (tooltip) tooltip.style.transform = `translate(${tooltipX(point.x)}px, ${tooltipY(point.y)}px)`;
    const nextId = hit?.id ?? null;
    if (hoveredIdRef.current !== nextId) {
      hoveredIdRef.current = nextId;
      setHoveredId(nextId);
      redrawOnce();
    }
  };

  const tooltipX = (x: number) => Math.max(12, Math.min(x + 14, canvasSizeRef.current.width - 244));
  const tooltipY = (y: number) => Math.max(12, y - 136);

  const clearHover = () => {
    if (draggingRef.current || grabRef.current) return;
    hoveredIdRef.current = null;
    setHoveredId(null);
    redrawOnce();
  };

  const copyCalibration = async () => {
    if (!activeMap) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(roomPayload(activeMap), null, 2));
      setCalibrationStatus("room.json copié");
    } catch {
      setCalibrationStatus("Copie impossible : autorisation du presse-papiers refusée.");
    }
  };

  const selectMap = (id: string) => {
    const selected = maps.find((map) => map.id === id);
    if (!selected) return;
    if (saveTimerRef.current) void saveCalibration(true);
    setActiveMapId(id);
    setDraftMap(cloneMap(selected));
    setCalibrationStatus("");
    try { localStorage.setItem(MAP_KEY, id); } catch {}
  };

  const nudgeGround = (delta: number) => {
    setDraftMap((current) => {
      if (!current) return current;
      const next = cloneMap(current);
      const value = Math.round(Math.max(-0.3, Math.min(0.3, (next.sprite?.groundOffset ?? 0) + delta)) * 100) / 100;
      next.sprite = { ...next.sprite, groundOffset: value };
      return next;
    });
    queueCalibrationSave();
  };

  const changeSize = (delta: number) => {
    const next = clampSize(characterSize + delta);
    setCharacterSize(next);
    try { localStorage.setItem(SIZE_KEY, String(next)); } catch {}
  };

  const toggleDemo = () => {
    const next = !demoEnabled;
    setDemoOverride(next);
    try { localStorage.setItem(DEMO_KEY, next ? "on" : "off"); } catch {}
  };

  const connectionLabel = (hostId: string) => {
    const state = hosts.find((host) => host.id === hostId)?.enabled === false ? "disabled" : hostStates[hostId] || "disconnected";
    return state === "connected" ? "Connecté" : state === "connecting" || state === "reconnecting" ? "Connexion…" : state === "disabled" ? "Désactivé" : "Déconnecté";
  };
  const hostLine = (item: SceneAgent) => {
    if (item.demo) return null;
    const ms = latency[item.hostId];
    return `${hostName(item.hostId)} · ${connectionLabel(item.hostId)}${typeof ms === "number" ? ` · ${ms} ms` : ""}`;
  };

  const containerWidth = canvasSizeRef.current.width;
  const containerHeight = canvasSizeRef.current.height;
  const approvalAnchor = (() => {
    if (!focusedAgent || !focusedApprovals.length) return null;
    const animated = animatedAgentsRef.current.get(focusedAgent.id);
    if (!animated) return null;
    const point = normalizedToScreen(animated);
    return {
      left: Math.max(12, Math.min(point.x + 34, containerWidth - 372)),
      top: Math.max(12, Math.min(point.y - 150, containerHeight - 330)),
    };
  })();

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full overflow-hidden"
      style={{ backgroundColor: activeMap?.backgroundColor || "#080808" }}
      aria-label="The Room, vue des agents en temps réel"
    >
      {activeMap?.backgroundUrl && <img
        ref={imageRef}
        key={activeMap.backgroundUrl}
        src={activeMap.backgroundUrl}
        alt={`Décor ${activeMap.name}`}
        onLoad={() => { updateImageRect(); draw(); schedule(); }}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        draggable={false}
      />}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          const press = pressRef.current;
          pressRef.current = null;
          if (draggingRef.current) { draggingRef.current = null; queueCalibrationSave(); }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          if (grabRef.current) { dropGrab(); return; }
          if (press) clickAgent(press.id);
        }}
        onPointerCancel={() => { draggingRef.current = null; if (grabRef.current) dropGrab(); pressRef.current = null; }}
        onContextMenu={(event) => {
          // Calibrage : le clic droit pivote le poste de travail sous le curseur.
          if (!calibrating) return;
          event.preventDefault();
          const point = canvasPoint(event as unknown as React.PointerEvent<HTMLCanvasElement>);
          const handle = [...calibrationHitsRef.current].reverse().find((hit) => distance(point, hit) <= 14);
          if (handle) rotateStation(handle.kind, handle.index);
        }}
        onPointerLeave={clearHover}
      />

      {(mapsStatus === "error" || mapsStatus === "empty") && <div role="alert" className="absolute inset-0 z-10 flex items-center justify-center p-6">
        <div className="max-w-xs rounded-xl border border-border/70 bg-background/95 p-4 text-center shadow-2xl backdrop-blur-md">
          <p className="text-xs font-semibold text-foreground">{mapsStatus === "error" ? "Impossible de charger les décors de The Room" : "Aucun décor disponible"}</p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{mapsStatus === "error" ? "Le relais local ne répond pas. Vérifie qu’il est démarré puis réessaie." : "Ajoute un dossier de décor dans ~/.getaroom/rooms/ (room.json + bg.jpg)."}</p>
          <PressButton onPress={() => void loadMaps()} className="mx-auto mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] text-foreground hover:bg-muted"><RefreshCw className="h-3 w-3" /> Réessayer</PressButton>
        </div>
      </div>}

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/85 p-1 shadow-lg backdrop-blur-md">
        <label className="sr-only" htmlFor="the-room-map">Décor de The Room</label>
        <select id="the-room-map" value={activeMapId} onChange={(event) => selectMap(event.target.value)} className="h-7 rounded-lg border-0 bg-transparent px-2 font-mono text-[11px] text-foreground outline-none">
          {maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
        </select>
        <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground" title={`${realActiveCount} agent actif`}>{realActiveCount}</span>
        <div className="flex items-center gap-0.5" role="group" aria-label="Taille des personnages">
          <PressButton onPress={() => changeSize(-.1)} disabled={characterSize <= SIZE_MIN} aria-label="Réduire les personnages" title="Réduire les personnages" className="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">A−</PressButton>
          <span className="w-9 text-center font-mono text-[9px] tabular-nums text-muted-foreground" title="Taille des personnages">{Math.round(characterSize * 100)}%</span>
          <PressButton onPress={() => changeSize(.1)} disabled={characterSize >= SIZE_MAX} aria-label="Agrandir les personnages" title="Agrandir les personnages" className="flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40">A+</PressButton>
        </div>
        <PressButton onPress={() => setImportOpen(true)} className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Ajouter un personnage">
          <Plus className="h-3 w-3" /> Personnage
        </PressButton>
        <CharacterImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          agents={agents}
          hosts={hosts}
          // Par défaut : pool partagé (visible tout de suite). Un agent n'est présélectionné que s'il est mis en avant dans la pièce.
          defaultAgentId={focusedAgent?.agent?.id ?? null}
          presentAgentIds={presentAgentIds}
          mapId={activeMap?.id ?? activeMapId}
          mapName={activeMap?.name ?? activeMapId}
          onImported={loadCharacters}
        />
      </div>

      <div className={cn("absolute left-3 top-3 z-10 rounded-xl border border-border/70 bg-background/90 p-2 shadow-xl backdrop-blur-md", calibrating ? "block" : "hidden")}>
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-foreground"><Check className="h-3.5 w-3.5" /> Mode calibrage</div>
        <div className="flex gap-1">
          <PressButton onPress={() => void saveCalibration()} className="flex h-7 items-center gap-1 rounded-lg bg-muted px-2 text-[10px] text-foreground hover:bg-accent"><Save className="h-3 w-3" /> Sauvegarder</PressButton>
          <PressButton onPress={() => void copyCalibration()} className="flex h-7 items-center gap-1 rounded-lg px-2 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"><Clipboard className="h-3 w-3" /> Copier JSON</PressButton>
          <PressButton onPress={() => setCalibrating(false)} className="h-7 rounded-lg px-2 text-[10px] text-muted-foreground hover:bg-muted">Fermer</PressButton>
        </div>
        {selectedStation !== null && activeMap?.positions.working[selectedStation] && <div className="mt-2 rounded-lg border border-border/60 p-2">
          <div className="mb-1.5 text-[10px] font-medium text-foreground">Poste de travail n° {selectedStation + 1} · direction du regard</div>
          <div className="flex gap-1" role="group" aria-label="Direction du poste">
            {(["down", "left", "up", "right"] as const).map((direction) => (
              <PressButton key={direction} onPress={() => setStationFacing(selectedStation, direction)} aria-pressed={activeMap.positions.working[selectedStation]?.facing === direction} className={cn("flex h-8 w-8 items-center justify-center rounded-md border text-sm", activeMap.positions.working[selectedStation]?.facing === direction ? "border-foreground/60 bg-muted text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>{FACING_ARROW[direction]}</PressButton>
            ))}
            <PressButton onPress={() => setStationFacing(selectedStation, "next")} className="ml-1 h-8 rounded-md border border-border px-2 text-[10px] text-muted-foreground hover:bg-muted" title="Pivoter (R ou clic droit)">Pivoter ↻</PressButton>
          </div>
        </div>}
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-border/60 p-2">
          <span className="flex-1 text-[10px] text-foreground">Hauteur des pieds (marche)</span>
          <PressButton onPress={() => nudgeGround(-0.01)} aria-label="Remonter les personnages" title="Remonter" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted">↑</PressButton>
          <span className="w-10 text-center font-mono text-[9px] tabular-nums text-muted-foreground">{Math.round((activeMap?.sprite?.groundOffset ?? 0) * 100)}%</span>
          <PressButton onPress={() => nudgeGround(0.01)} aria-label="Abaisser les personnages" title="Abaisser" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-xs text-muted-foreground hover:bg-muted">↓</PressButton>
        </div>
        <p className="mt-2 max-w-64 text-[9px] leading-relaxed text-muted-foreground">Glisse les points : sauvegarde automatique. Le point d’un poste de travail est l’endroit exact où le personnage s’assoit (aperçu fantôme). Clic sur un poste, puis flèches, clic droit ou R pour pivoter. Zones d’hôtes en pointillés (visibles uniquement ici).</p>
        {calibrationStatus && <p role="status" className="mt-1 max-w-64 text-[9px] text-muted-foreground">{calibrationStatus}</p>}
      </div>

      {hoveredAgent && !draggingRef.current && <div
        ref={tooltipRef}
        className="pointer-events-none absolute left-0 top-0 z-20 w-56 rounded-xl border border-border/70 bg-background/95 p-3 text-left shadow-2xl backdrop-blur-md"
        style={{ transform: `translate(${tooltipX(pointerRef.current.x)}px, ${tooltipY(pointerRef.current.y)}px)` }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-foreground">{hoveredAgent.name}</span>
          <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{stateLabel(hoveredAgent.state)}</span>
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{hoveredAgent.model} · {hoveredAgent.project}</div>
        {hostLine(hoveredAgent) && <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{hostLine(hoveredAgent)}</div>}
        <div className="mt-2 border-t border-border/50 pt-2 text-[10px] text-foreground"><span className="line-clamp-2 break-words">{hoveredAgent.lastAction}</span></div>
      </div>}

      {focusedAgent && <aside
        className={cn(
          "absolute z-20 rounded-xl border border-border/70 bg-background/95 p-3 shadow-2xl backdrop-blur-md",
          approvalAnchor ? "w-[360px] max-w-[calc(100%-24px)]" : "bottom-3 right-3 w-64",
        )}
        style={approvalAnchor ? { left: approvalAnchor.left, top: approvalAnchor.top } : undefined}
        aria-label={`Fiche de ${focusedAgent.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold text-foreground">{focusedAgent.name}</div>
            <div className="truncate font-mono text-[9px] text-muted-foreground">{focusedAgent.model}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">{stateLabel(focusedAgent.state)}</span>
            <PressButton onPress={() => setFocusedAgentId(null)} aria-label="Fermer la fiche" className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-3 w-3 pointer-events-none" /></PressButton>
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-[52px_1fr] gap-x-2 gap-y-1 text-[10px]">
          <dt className="text-muted-foreground">Poste</dt><dd className="truncate text-foreground">{stationLabel(focusedAgent.activityState)}</dd>
          <dt className="text-muted-foreground">Projet</dt><dd className="truncate text-foreground">{focusedAgent.project}</dd>
          {hostLine(focusedAgent) && <><dt className="text-muted-foreground">Hôte</dt><dd className="truncate text-foreground">{hostLine(focusedAgent)}</dd></>}
          <dt className="text-muted-foreground">Action</dt><dd className="line-clamp-2 break-words text-foreground">{focusedAgent.activity?.file || focusedAgent.lastAction}</dd>
          {(focusedAgent.activity?.additions || focusedAgent.activity?.deletions) ? <><dt className="text-muted-foreground">Diff</dt><dd className="font-mono text-foreground"><span className="text-emerald-400">+{focusedAgent.activity.additions ?? 0}</span> <span className="text-red-400">−{focusedAgent.activity.deletions ?? 0}</span></dd></> : null}
        </dl>
        {focusedApprovals.length > 0 && <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto border-t border-border/50 pt-3" aria-label="Validations en attente">
          {focusedApprovals.map((permission) => <PendingPermissionCard
            key={permission.key}
            permission={permission}
            onRespond={(response) => respondToPermission(permission.agentId, permission.request.id, response)}
          />)}
        </div>}
        <PressButton
          onPress={() => openSession(focusedAgent)}
          disabled={!focusedAgent.session}
          className="mt-3 flex min-h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-[10px] font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          {focusedAgent.session ? "Ouvrir la session" : "Agent de démonstration"}
        </PressButton>
      </aside>}

      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-1.5">
        <PressButton
          onPress={toggleDemo}
          aria-pressed={demoEnabled}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-lg border border-border/60 bg-background/75 px-2 font-mono text-[9px] backdrop-blur-md",
            demoEnabled ? "text-foreground" : "text-muted-foreground",
          )}
          title="Afficher les agents résidents de démonstration"
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", demoEnabled ? "bg-foreground" : "bg-muted-foreground/40")} />
          Démo agents
        </PressButton>
        <span className="pointer-events-none rounded-lg border border-border/50 bg-background/70 px-2 py-1 font-mono text-[9px] text-muted-foreground backdrop-blur-md">Shift + E · Calibrer</span>
      </div>
    </div>
  );
}
