import { measureSheet, seatFrame, type SheetMetrics } from "./sprite-metrics";

export type AgentSpriteStyle = "severance" | "monochrome";
export type AgentSpriteState = "idle" | "walking" | "working" | "thinking" | "alert" | "done" | "sitting" | "grabbed";
export type AgentSpriteFacing = "down" | "left" | "right" | "up";

export interface CustomAgentCharacter {
  url: string;
  spriteSheet: boolean;
  columns: number;
  rows: number;
  monochromeFilter?: boolean;
}

export interface AgentSpriteOptions {
  context: CanvasRenderingContext2D;
  x: number;
  y: number;
  time: number;
  index: number;
  scale: number;
  style: AgentSpriteStyle;
  state: AgentSpriteState;
  facing: AgentSpriteFacing;
  accent: string;
  selected: boolean;
  hovered: boolean;
  /** Hauteur (px écran) à laquelle le corps est soulevé ; l'ombre reste au sol. */
  lift?: number;
  custom?: CustomAgentCharacter;
  requestRedraw: () => void;
}

export interface AgentSpriteBounds {
  x: number;
  y: number;
  radius: number;
  top: number;
}

const images = new Map<string, HTMLImageElement>();

function characterImage(url: string, requestRedraw: () => void): HTMLImageElement {
  const cached = images.get(url);
  if (cached) return cached;
  const image = new Image();
  image.decoding = "async";
  image.onload = requestRedraw;
  image.src = url;
  images.set(url, image);
  return image;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

// Le flou d'ombre (context.filter) coûte cher : on le calcule UNE fois par style
// dans un canvas hors-écran, puis on le recopie pour chaque agent et chaque image.
const SHADOW_W = 40;
const SHADOW_H = 16;
const SHADOW_RES = 3;
const shadowCache = new Map<AgentSpriteStyle, HTMLCanvasElement>();

function shadowSprite(style: AgentSpriteStyle): HTMLCanvasElement {
  const cached = shadowCache.get(style);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_W * SHADOW_RES;
  canvas.height = SHADOW_H * SHADOW_RES;
  const context = canvas.getContext("2d")!;
  context.scale(SHADOW_RES, SHADOW_RES);
  context.filter = `blur(${style === "monochrome" ? 2.8 : 3.4}px)`;
  context.fillStyle = style === "monochrome" ? "rgba(0,0,0,.38)" : "rgba(8,12,10,.34)";
  context.beginPath();
  context.ellipse(SHADOW_W / 2, SHADOW_H / 2, 8.5, 3.1, 0, 0, Math.PI * 2);
  context.fill();
  shadowCache.set(style, canvas);
  return canvas;
}

function drawShadow(context: CanvasRenderingContext2D, x: number, y: number, style: AgentSpriteStyle, raised = 0) {
  const shrink = 1 - .22 * raised;
  context.save();
  context.globalAlpha = 1 - .35 * raised;
  context.drawImage(shadowSprite(style), x - (SHADOW_W * shrink) / 2, y + 1.5 - (SHADOW_H * shrink) / 2, SHADOW_W * shrink, SHADOW_H * shrink);
  context.restore();
}

// Filtre niveaux de gris appliqué une seule fois par image, pas à chaque frame.
const monochromeCache = new Map<string, HTMLCanvasElement>();

function monochromeSource(url: string, image: HTMLImageElement): CanvasImageSource {
  const cached = monochromeCache.get(url);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d")!;
  context.filter = "grayscale(1) contrast(1.28) brightness(1.08)";
  context.drawImage(image, 0, 0);
  monochromeCache.set(url, canvas);
  return canvas;
}

function drawGroundRing(context: CanvasRenderingContext2D, options: AgentSpriteOptions) {
  if (!options.selected && !options.hovered) return;
  context.save();
  context.strokeStyle = options.style === "monochrome" ? "rgba(255,255,255,.94)" : options.accent;
  context.globalAlpha = options.selected ? .96 : .68;
  context.lineWidth = options.selected ? 1.35 : 1;
  context.shadowBlur = options.selected ? 6 : 3;
  context.shadowColor = context.strokeStyle;
  context.beginPath();
  context.ellipse(options.x, options.y + 1, 11, 4.4, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

export interface AgentLabelOptions {
  context: CanvasRenderingContext2D;
  x: number;
  top: number;
  label: string;
  accent: string;
  style: AgentSpriteStyle;
}

/** Étiquette de survol/sélection : dessinée après tous les sprites pour rester lisible. */
export function drawAgentLabel(options: AgentLabelOptions) {
  const { context } = options;
  context.save();
  context.font = "600 10.5px 'Geist Mono', ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const width = Math.ceil(context.measureText(options.label).width) + 14;
  const left = options.x - width / 2;
  const y = options.top - 20;
  roundedRect(context, left, y, width, 16, 6);
  context.fillStyle = "rgba(18,18,17,.92)";
  context.fill();
  context.strokeStyle = options.style === "monochrome" ? "rgba(255,255,255,.52)" : `${options.accent}99`;
  context.lineWidth = .85;
  context.stroke();
  context.fillStyle = "#F4F5F2";
  context.fillText(options.label, options.x, y + 8.2);
  context.restore();
}

function drawAlert(context: CanvasRenderingContext2D, options: AgentSpriteOptions, top: number) {
  if (options.state !== "alert" && options.state !== "done") return;
  const pulse = .72 + Math.sin(options.time / 190 + options.index) * .24;
  const color = options.style === "monochrome" ? "#FFFFFF" : options.accent;
  context.save();
  context.shadowBlur = 9;
  context.shadowColor = color;
  context.fillStyle = color;
  context.globalAlpha = pulse;
  context.beginPath();
  context.arc(options.x, top - 5, 2.6 + pulse, 0, Math.PI * 2);
  context.fill();
  if (options.state === "done") {
    context.strokeStyle = options.style === "monochrome" ? "#0E0E10" : "#181920";
    context.lineWidth = .9;
    context.beginPath();
    context.moveTo(options.x - 1.5, top - 5);
    context.lineTo(options.x - .2, top - 3.7);
    context.lineTo(options.x + 1.8, top - 6.2);
    context.stroke();
  }
  context.restore();
}

/*
 * Format universel de sprite sheet : grille 4 colonnes × 4 lignes, auto-découpée en largeur/4 × hauteur/4.
 *   lignes  : 0 = bas · 1 = gauche · 2 = droite · 3 = haut
 *   colonnes: 0 = idle · 1 = walk_1 · 2 = walk_2 · 3 = sitting_typing (ligne 3 : grabbed, suspendu par le col)
 */
export const SPRITE_GRID = 4;
export const SPRITE_ROW: Record<AgentSpriteFacing, number> = { down: 0, left: 1, right: 2, up: 3 };
const TYPING_STEP_MS = 180;
/** Cycle de marche à 4 temps : idle → pas gauche → idle → pas droit, toutes les 150 ms. */
export const WALK_CYCLE = [0, 1, 0, 2] as const;
export const WALK_STEP_MS = 150;

export interface SpriteFrame { row: number; col: number; jitter: number; flip?: boolean }

export function spriteFrame(state: AgentSpriteState, facing: AgentSpriteFacing, time: number, index = 0): SpriteFrame {
  if (state === "grabbed") return { row: 3, col: 3, jitter: 0 };
  const row = SPRITE_ROW[facing];
  if (state === "walking") return { row, col: WALK_CYCLE[Math.floor(time / WALK_STEP_MS + index) % WALK_CYCLE.length]!, jitter: 0 };
  // Assis : micro-mouvement de frappe ±1 px toutes les 180 ms.
  if (state === "sitting") {
    const jitter = Math.floor(time / TYPING_STEP_MS) % 2 === 0 ? 1 : -1;
    // La case (ligne 3, col 3) est la pose « attrapé par le col », pas une pose assise : pour ↗ (dos-droite)
    // on réutilise l'assise ↖ (dos-gauche, ligne 1) retournée en miroir — c'est exactement l'angle opposé.
    if (facing === "up") return { row: SPRITE_ROW.left, col: 3, jitter, flip: true };
    return { row, col: 3, jitter };
  }
  return { row, col: 0, jitter: 0 };
}

/* ───────── Mesures d'une feuille : corps de chaque case, ancrage au sol, taille réelle ───────── */

const ANALYSIS_FRAME = 64;
const metricsCache = new Map<string, SheetMetrics>();

function sheetMetrics(url: string, image: HTMLImageElement): SheetMetrics {
  const cached = metricsCache.get(url);
  if (cached) return cached;
  const size = ANALYSIS_FRAME * SPRITE_GRID;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0, size, size);
  const metrics = measureSheet(context.getImageData(0, 0, size, size).data, size, SPRITE_GRID);
  metricsCache.set(url, metrics);
  return metrics;
}

/* ───────── Réduction de qualité : une feuille 2048 px affichée à ~70 px ne doit pas être échantillonnée brute ───────── */

const SHEET_BUCKETS = [64, 96, 128, 192, 256, 384, 512];
const scaledCache = new Map<string, HTMLCanvasElement>();

function halve(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Version de la feuille pré-réduite (par paliers de 2) à une taille proche de l'affichage, mise en cache. */
function scaledSheet(key: string, base: CanvasImageSource, baseWidth: number, baseHeight: number, destFramePx: number): CanvasImageSource {
  const baseFrame = baseHeight / SPRITE_GRID;
  const bucket = SHEET_BUCKETS.find((value) => value >= destFramePx * 1.25) ?? SHEET_BUCKETS[SHEET_BUCKETS.length - 1]!;
  if (baseFrame <= bucket * 1.25) return base;
  const cacheKey = `${key}|${bucket}`;
  const cached = scaledCache.get(cacheKey);
  if (cached) return cached;
  const ratio = baseWidth / baseHeight;
  const targetH = bucket * SPRITE_GRID;
  const targetW = targetH * ratio;
  let current: CanvasImageSource = base;
  let w = baseWidth;
  let h = baseHeight;
  while (h / 2 > targetH) { w /= 2; h /= 2; current = halve(current, w, h); }
  const result = halve(current, targetW, targetH);
  scaledCache.set(cacheKey, result);
  return result;
}

function drawCustom(context: CanvasRenderingContext2D, options: AgentSpriteOptions, bounce: number): boolean {
  if (!options.custom) return false;
  const image = characterImage(options.custom.url, options.requestRedraw);
  if (!image.complete || !image.naturalWidth) return false;
  context.save();
  const mono = options.style === "monochrome" && options.custom.monochromeFilter !== false;
  const base: CanvasImageSource = mono ? monochromeSource(options.custom.url, image) : image;
  if (options.custom.spriteSheet) {
    const metrics = sheetMetrics(options.custom.url, image);
    const frame = spriteFrame(options.state, options.facing, options.time, options.index);
    if (options.state === "sitting") {
      // Choix de la pose assise d'après le regard réellement dessiné dans la feuille (miroir si besoin).
      const seat = seatFrame(metrics, options.facing);
      frame.row = seat.row;
      frame.flip = seat.flip;
    }
    // Le PERSONNAGE (pas la case) mesure 30 unités : les marges vides de la feuille ne le rapetissent plus.
    const cellHeight = 30 / metrics.standingHeight;
    const cellWidth = cellHeight * (image.naturalWidth / image.naturalHeight);
    const seated = options.state === "sitting" || options.state === "grabbed";
    if (frame.flip) {
      // Miroir autour de l'axe d'ancrage : le personnage reste exactement sur le point du poste.
      context.translate(options.x, 0);
      context.scale(-1, 1);
      context.translate(-options.x, 0);
    }
    // Cadre du corps de CETTE case (débordements des cases voisines exclus).
    const box = metrics.cells[frame.row]![frame.col]!;
    const pad = 1 / ANALYSIS_FRAME;
    const l = Math.max(0, box.l - pad);
    const r = Math.min(1, box.r + pad);
    const t = Math.max(0, box.t - pad);
    const b = box.b; // pas de marge sous les pieds : ils touchent le sol
    // Un seul point d'ancrage : le bas réel de la case (pieds, ou assise) repose exactement sur le point.
    const anchorX = seated ? (box.l + box.r) / 2 : metrics.rowCenter[frame.row]!;
    const anchorY = b;
    const transform = context.getTransform();
    const destFramePx = cellHeight * Math.hypot(transform.a, transform.b);
    const baseWidth = base instanceof HTMLImageElement ? base.naturalWidth : (base as HTMLCanvasElement).width;
    const baseHeight = base instanceof HTMLImageElement ? base.naturalHeight : (base as HTMLCanvasElement).height;
    const source = scaledSheet(`${options.custom.url}|${mono ? "m" : "c"}`, base, baseWidth, baseHeight, destFramePx);
    const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : (source as HTMLCanvasElement).width;
    const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : (source as HTMLCanvasElement).height;
    const frameW = sourceWidth / SPRITE_GRID;
    const frameH = sourceHeight / SPRITE_GRID;
    // Pixel art net quand on agrandit ; lissage de qualité quand on réduit (évite le scintillement).
    context.imageSmoothingEnabled = frameH * 1.01 >= destFramePx;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      source,
      (frame.col + l) * frameW, (frame.row + t) * frameH, (r - l) * frameW, (b - t) * frameH,
      options.x - cellWidth * (anchorX - l),
      options.y - bounce - cellHeight * (anchorY - t) + frame.jitter / Math.max(.5, options.scale),
      cellWidth * (r - l), cellHeight * (b - t),
    );
  } else {
    const width = 25;
    const height = 30;
    const breath = Math.sin(options.time / 620 + options.index) * .55;
    context.drawImage(base, options.x - width / 2, options.y - height - bounce - breath, width, height);
  }
  context.restore();
  return true;
}

function drawSeverance(context: CanvasRenderingContext2D, options: AgentSpriteOptions, bounce: number) {
  const phase = options.time / 120 + options.index * 1.7;
  const walking = options.state === "walking";
  const working = options.state === "working";
  const thinking = options.state === "thinking";
  const idleBreath = walking ? 0 : Math.sin(options.time / 650 + options.index) * .55;
  const lean = working ? 2.1 : thinking ? -.4 : 0;
  const bodyY = options.y - 18 - bounce - idleBreath;
  const headX = options.x + lean + (options.state === "idle" ? Math.sin(options.time / 1050 + options.index) * .45 : 0);
  const legSwing = walking ? Math.sin(phase) * 3.1 : 0;
  const armSwing = walking ? Math.sin(phase + Math.PI) * 2.3 : 0;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = "#181920";
  context.lineWidth = 2.15;
  if (working) {
    context.beginPath();
    context.moveTo(options.x - 2, options.y - 8 - bounce);
    context.lineTo(options.x - 5, options.y - 3 - bounce);
    context.moveTo(options.x + 2, options.y - 8 - bounce);
    context.lineTo(options.x + 5, options.y - 3 - bounce);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(options.x - 2, options.y - 10 - bounce);
    context.lineTo(options.x - 2.3 - legSwing, options.y - 1 - bounce);
    context.moveTo(options.x + 2, options.y - 10 - bounce);
    context.lineTo(options.x + 2.3 + legSwing, options.y - 1 - bounce);
    context.stroke();
  }

  context.fillStyle = "#181920";
  context.beginPath();
  context.moveTo(options.x - 5, bodyY - 1);
  context.quadraticCurveTo(options.x + lean, bodyY - 4, options.x + 5 + lean, bodyY - 1);
  context.lineTo(options.x + 4, options.y - 9 - bounce);
  context.lineTo(options.x - 4, options.y - 9 - bounce);
  context.closePath();
  context.fill();

  context.fillStyle = "#F4F5F2";
  context.beginPath();
  context.moveTo(options.x - 2.7 + lean, bodyY - 1.5);
  context.lineTo(options.x + 2.7 + lean, bodyY - 1.5);
  context.lineTo(options.x + 1.8 + lean, bodyY + 5.2);
  context.lineTo(options.x - 1.8 + lean, bodyY + 5.2);
  context.closePath();
  context.fill();

  context.fillStyle = options.accent;
  context.beginPath();
  context.moveTo(options.x + lean, bodyY);
  context.lineTo(options.x - 1.4 + lean, bodyY + 5.8);
  context.lineTo(options.x + 1.35 + lean, bodyY + 5.8);
  context.closePath();
  context.fill();

  context.strokeStyle = "#181920";
  context.lineWidth = 2;
  if (working) {
    const typing = Math.sin(options.time / 70 + options.index) * 1.2;
    context.beginPath();
    context.moveTo(options.x - 4 + lean, bodyY + 2);
    context.lineTo(options.x - 6 + typing, bodyY + 8);
    context.moveTo(options.x + 4 + lean, bodyY + 2);
    context.lineTo(options.x + 6 - typing, bodyY + 8);
    context.stroke();
    const glow = .2 + (Math.sin(options.time / 155) + 1) * .08;
    context.save();
    context.globalCompositeOperation = "screen";
    const gradient = context.createRadialGradient(options.x + 1, bodyY + 2, 0, options.x + 1, bodyY + 2, 13);
    gradient.addColorStop(0, `rgba(139,255,190,${glow})`);
    gradient.addColorStop(1, "rgba(139,255,190,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(options.x + 1, bodyY + 2, 13, 0, Math.PI * 2);
    context.fill();
    context.restore();
  } else if (thinking) {
    context.beginPath();
    context.moveTo(options.x + 4, bodyY + 2);
    context.lineTo(headX + 4.2, bodyY - 5.5);
    context.stroke();
    context.beginPath();
    context.moveTo(options.x - 4, bodyY + 2);
    context.lineTo(options.x - 5.5, bodyY + 8);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(options.x - 4, bodyY + 2);
    context.lineTo(options.x - 5 - armSwing, bodyY + 8);
    context.moveTo(options.x + 4, bodyY + 2);
    context.lineTo(options.x + 5 + armSwing, bodyY + 8);
    context.stroke();
  }

  context.fillStyle = "#D6C0A8";
  context.beginPath();
  context.ellipse(headX, bodyY - 6.2, 4, 4.4, options.facing === "left" ? -.12 : options.facing === "right" ? .12 : 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#181920";
  context.beginPath();
  context.arc(headX, bodyY - 7.5, 3.9, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(24,25,32,.76)";
  const eyeOffset = options.facing === "left" ? -1.25 : options.facing === "right" ? 1.25 : 0;
  context.beginPath();
  context.arc(headX + eyeOffset, bodyY - 5.8, .55, 0, Math.PI * 2);
  context.fill();

  if (thinking) {
    const pulse = .4 + (Math.sin(options.time / 260 + options.index) + 1) * .22;
    context.fillStyle = options.accent;
    context.globalAlpha = pulse;
    for (let dot = 0; dot < 3; dot += 1) {
      context.beginPath();
      context.arc(headX + 6 + dot * 2.2, bodyY - 10 - dot * 1.8, .8 + dot * .15, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawMonochrome(context: CanvasRenderingContext2D, options: AgentSpriteOptions, bounce: number) {
  const phase = options.time / 125 + options.index * 1.6;
  const walking = options.state === "walking";
  const working = options.state === "working";
  const thinking = options.state === "thinking";
  const breath = walking ? 0 : Math.sin(options.time / 720 + options.index) * .65;
  const sway = walking ? Math.sin(phase) * 1.35 : Math.sin(options.time / 1050 + options.index) * .32;
  const y = options.y - bounce - breath;
  const light = y / Math.max(1, context.canvas.clientHeight || context.canvas.height) > .48;
  const fill = light ? "#0E0E10" : "#DCDCDC";
  const edge = light ? "#FFFFFF" : "#555555";

  context.save();
  context.translate(options.x + sway, 0);
  context.fillStyle = fill;
  context.strokeStyle = edge;
  context.lineWidth = .8;
  context.beginPath();
  context.moveTo(-5.8, y - 1);
  context.quadraticCurveTo(-4.2, y - 15, -2.8, y - 21);
  context.lineTo(2.6, y - 21);
  context.quadraticCurveTo(4.2, y - 14, 6.2, y - 1);
  context.quadraticCurveTo(0, y + (walking ? Math.sin(phase) * .8 : 0), -5.8, y - 1);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = light ? "#181818" : "#FFFFFF";
  context.strokeStyle = edge;
  context.beginPath();
  context.moveTo(-4.2, y - 23.3);
  context.lineTo(0, y - 30.5);
  context.lineTo(4.2, y - 23.3);
  context.closePath();
  context.fill();
  context.stroke();

  context.fillStyle = light ? "#DCDCDC" : "#0E0E10";
  context.beginPath();
  context.arc(options.facing === "left" ? -1.15 : options.facing === "right" ? 1.15 : 0, y - 22.5, .65, 0, Math.PI * 2);
  context.fill();

  if (working) {
    const flicker = .62 + Math.sin(options.time / 110 + options.index) * .22;
    context.save();
    context.shadowBlur = 9;
    context.shadowColor = "#FFFFFF";
    context.globalAlpha = flicker;
    context.fillStyle = "#FFFFFF";
    context.fillRect(3.5, y - 18, 4.5, 2.2);
    context.restore();
  }
  if (thinking) {
    const pulse = .38 + (Math.sin(options.time / 250 + options.index) + 1) * .24;
    context.globalAlpha = pulse;
    context.fillStyle = "#FFFFFF";
    context.beginPath();
    context.arc(5.5, y - 28, 1.15, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

const LIFT_FULL = 26;

export function renderAgentSprite(options: AgentSpriteOptions): AgentSpriteBounds {
  const { context } = options;
  const lift = Math.max(0, options.lift ?? 0);
  const liftLocal = lift / options.scale;
  const grabbed = options.state === "grabbed";
  const walking = options.state === "walking";
  // Les feuilles contiennent déjà le balancement du pas : un rebond en plus rendait la marche saccadée.
  const bounce = walking && !options.custom?.spriteSheet ? Math.abs(Math.sin(options.time / 105 + options.index)) * 2.2 : 0;
  const baseHeight = options.style === "monochrome" ? 31 : 29;
  // Les silhouettes dessinées à la main n'ont pas de frame « assis » ou « suspendu ».
  const proceduralState: AgentSpriteState = options.state === "sitting" ? "working" : grabbed ? "idle" : options.state;
  const body: AgentSpriteOptions = { ...options, y: options.y - liftLocal, state: options.state };
  const proceduralBody: AgentSpriteOptions = { ...body, state: proceduralState };
  const baseTop = body.y - baseHeight - bounce;

  context.save();
  context.translate(options.x, options.y);
  context.scale(options.scale, options.scale);
  context.translate(-options.x, -options.y);
  drawShadow(context, options.x, options.y, options.style, Math.min(1, lift / LIFT_FULL));
  drawGroundRing(context, options);
  context.save();
  if (grabbed) {
    // Pendule : le personnage oscille autour de son col.
    const pivotY = body.y - baseHeight;
    context.translate(options.x, pivotY);
    context.rotate(Math.sin(options.time / 230 + options.index) * .1);
    context.translate(-options.x, -pivotY);
  }
  const customDrawn = drawCustom(context, body, bounce);
  if (!customDrawn) {
    if (options.style === "monochrome") drawMonochrome(context, proceduralBody, bounce);
    else drawSeverance(context, proceduralBody, bounce);
  }
  context.restore();
  drawAlert(context, proceduralBody, baseTop);
  context.restore();
  const top = options.y - (baseHeight + bounce) * options.scale - lift;
  return {
    x: options.x,
    y: options.y - lift - baseHeight * options.scale * .48,
    radius: Math.max(18, 15 * options.scale),
    top,
  };
}

export interface ActivityBubbleOptions {
  context: CanvasRenderingContext2D;
  x: number;
  top: number;
  text: string;
  additions?: number;
  deletions?: number;
  accent: string;
  style: AgentSpriteStyle;
  /** Décalage vertical supplémentaire (étiquette / pastille d'alerte déjà affichées). */
  lift: number;
  alpha: number;
  minX: number;
  maxX: number;
}

/** Bulle d'activité compacte (Swiss dark) : une seule ligne, dessinée en dernier plan. */
export function drawActivityBubble(options: ActivityBubbleOptions) {
  const { context, text } = options;
  const adds = options.additions ? `+${options.additions}` : "";
  const dels = options.deletions ? `−${options.deletions}` : "";
  context.save();
  context.globalAlpha = options.alpha;
  context.font = "500 9.5px 'Geist Mono', ui-monospace, monospace";
  context.textBaseline = "middle";
  context.textAlign = "left";
  const gap = 6;
  const textWidth = Math.ceil(context.measureText(text).width);
  const addWidth = adds ? Math.ceil(context.measureText(adds).width) : 0;
  const delWidth = dels ? Math.ceil(context.measureText(dels).width) : 0;
  const diffWidth = (addWidth && delWidth ? addWidth + 4 + delWidth : addWidth + delWidth);
  const inner = textWidth + (diffWidth ? gap + diffWidth : 0);
  const width = inner + 16;
  const height = 17;
  const left = Math.max(options.minX, Math.min(options.maxX - width, options.x - width / 2));
  const y = options.top - 11 - options.lift - height;
  roundedRect(context, left, y, width, height, 5);
  context.fillStyle = "rgba(14,14,13,.92)";
  context.fill();
  context.strokeStyle = options.style === "monochrome" ? "rgba(255,255,255,.28)" : "rgba(255,255,255,.14)";
  context.lineWidth = .8;
  context.stroke();
  // Liseré d'accent à gauche
  context.fillStyle = options.style === "monochrome" ? "#FFFFFF" : options.accent;
  context.fillRect(left + 4, y + 4.5, 1.5, height - 9);
  // Pointe vers l'agent
  const tipX = Math.max(left + 8, Math.min(left + width - 8, options.x));
  context.fillStyle = "rgba(14,14,13,.92)";
  context.beginPath();
  context.moveTo(tipX - 3, y + height - .4);
  context.lineTo(tipX + 3, y + height - .4);
  context.lineTo(tipX, y + height + 3.2);
  context.closePath();
  context.fill();
  let cursor = left + 10;
  context.fillStyle = "#E9E9E5";
  context.fillText(text, cursor, y + height / 2 + .4);
  cursor += textWidth + gap;
  if (adds) { context.fillStyle = "#7EE0A3"; context.fillText(adds, cursor, y + height / 2 + .4); cursor += addWidth + 4; }
  if (dels) { context.fillStyle = "#FF8F8F"; context.fillText(dels, cursor, y + height / 2 + .4); }
  context.restore();
}
