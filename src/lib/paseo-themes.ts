// Skins de base de Paseo (valeurs reprises de l'app Paseo : light, dark, auto + variantes sombres).
// Une seule source de vérité : chaque skin est converti en variables CSS getaroom au démarrage.

export type SkinId = "light" | "dark" | "zinc" | "midnight" | "claude" | "ghostty" | "pureBlack";
export type ThemePreference = SkinId | "system";

interface PaseoPalette {
  scheme: "light" | "dark";
  surface0: string;
  surface1: string;
  surface2: string;
  surface3: string;
  surface4: string;
  surfaceSidebar: string;
  foreground: string;
  foregroundMuted: string;
  foregroundExtraMuted: string;
  border: string;
  borderAccent: string;
  accent: string;
  accentBright: string;
  destructive: string;
  primary?: string;
  primaryForeground?: string;
}

const DARK_FOREGROUND = "#fafafa";

export const PASEO_SKINS: Record<SkinId, PaseoPalette> = {
  light: {
    scheme: "light", surface0: "#ffffff", surface1: "#fafafa", surface2: "#f4f4f5", surface3: "#e4e4e7", surface4: "#d4d4d8",
    surfaceSidebar: "#f4f4f5", foreground: "#1a1a1e", foregroundMuted: "#71717a", foregroundExtraMuted: "#a1a1aa",
    border: "#e4e4e7", borderAccent: "#ececf1", accent: "#20744A", accentBright: "#239956", destructive: "#b04138",
    primary: "#18181b", primaryForeground: "#fafafa",
  },
  dark: {
    scheme: "dark", surface0: "#181B1A", surface1: "#1E2120", surface2: "#272A29", surface3: "#434645", surface4: "#595B5B",
    surfaceSidebar: "#141716", foreground: DARK_FOREGROUND, foregroundMuted: "#A1A5A4", foregroundExtraMuted: "#717574",
    border: "#252B2A", borderAccent: "#2F3534", accent: "#20744A", accentBright: "#7ccba0", destructive: "#c64f43",
  },
  zinc: {
    scheme: "dark", surface0: "#18181b", surface1: "#1f1f22", surface2: "#27272a", surface3: "#3f3f46", surface4: "#52525b",
    surfaceSidebar: "#131316", foreground: DARK_FOREGROUND, foregroundMuted: "#a1a1aa", foregroundExtraMuted: "#71717a",
    border: "#27272a", borderAccent: "#303036", accent: "#e4e4e7", accentBright: "#fafafa", destructive: "#c44a4a",
  },
  midnight: {
    scheme: "dark", surface0: "#161820", surface1: "#1c1e27", surface2: "#252731", surface3: "#3c3e4c", surface4: "#535564",
    surfaceSidebar: "#121420", foreground: DARK_FOREGROUND, foregroundMuted: "#9a9db0", foregroundExtraMuted: "#6b6e82",
    border: "#242636", borderAccent: "#2e3040", accent: "#3b6fcf", accentBright: "#7eaaeb", destructive: "#c44a52",
  },
  claude: {
    scheme: "dark", surface0: "#1f1f1e", surface1: "#262523", surface2: "#2f2d2b", surface3: "#4a4745", surface4: "#605d5b",
    surfaceSidebar: "#1a1918", foreground: DARK_FOREGROUND, foregroundMuted: "#ada9a5", foregroundExtraMuted: "#78746f",
    border: "#2c2a27", borderAccent: "#36332f", accent: "#d97757", accentBright: "#e89a7f", destructive: "#cf513e",
  },
  ghostty: {
    scheme: "dark", surface0: "#282c34", surface1: "#2f333d", surface2: "#383c48", surface3: "#4a4f5e", surface4: "#5b6175",
    surfaceSidebar: "#21252d", foreground: DARK_FOREGROUND, foregroundMuted: "#c8ccd8", foregroundExtraMuted: "#a0a4b2",
    border: "#353a47", borderAccent: "#3f4454", accent: "#3570e0", accentBright: "#b4d0fc", destructive: "#c44a55",
  },
  pureBlack: {
    scheme: "dark", surface0: "#000000", surface1: "#0a0a0a", surface2: "#181818", surface3: "#202020", surface4: "#2d2d2d",
    surfaceSidebar: "#000000", foreground: DARK_FOREGROUND, foregroundMuted: "#a1a1aa", foregroundExtraMuted: "#71717a",
    border: "#1c1c1c", borderAccent: "#242424", accent: "#20744A", accentBright: "#7ccba0", destructive: "#c44a4a",
  },
};

/** Libellés et pastilles des réglages (pastilles identiques à Paseo). */
export const SKIN_OPTIONS: Array<{ id: SkinId; label: string; swatch: string; group: "primary" | "variant" }> = [
  { id: "light", label: "Clair", swatch: "#ffffff", group: "primary" },
  { id: "dark", label: "Sombre", swatch: "#2D8B62", group: "primary" },
  { id: "zinc", label: "Zinc", swatch: "#808080", group: "variant" },
  { id: "midnight", label: "Midnight", swatch: "#4A6BA8", group: "variant" },
  { id: "claude", label: "Claude", swatch: "#D97757", group: "variant" },
  { id: "ghostty", label: "Ghostty", swatch: "#8caaee", group: "variant" },
  { id: "pureBlack", label: "Pure Black", swatch: "#000000", group: "variant" },
];

export const isSkinId = (value: unknown): value is SkinId => typeof value === "string" && value in PASEO_SKINS;

/** Couleurs des pastilles d'état Paseo (terminé, erreur, validation, en cours). */
const STATUS = {
  light: { success: "#299f51", danger: "#f12e2f", warning: "#b37824", running: "#268ae0" },
  dark: { success: "#35c264", danger: "#f7796d", warning: "#db932e", running: "#5caaf6" },
};

/** Couleurs « statusSuccess/Warning/Danger » de Paseo : remplissage des barres de quotas. */
const USAGE_FILL = {
  light: { ok: "#3e704a", warning: "#7b5d39", danger: "#9d433b" },
  dark: { ok: "#6cb17b", warning: "#c09664", danger: "#d8847b" },
};

/** Couleurs ANSI du terminal Paseo. */
export const TERMINAL_ANSI = {
  light: {
    red: "#dc2626", green: "#16a34a", yellow: "#ca8a04", blue: "#2563eb", magenta: "#9333ea", cyan: "#0891b2", white: "#ffffff",
    brightRed: "#ef4444", brightGreen: "#22c55e", brightYellow: "#f59e0b", brightBlue: "#3b82f6", brightMagenta: "#a855f7", brightCyan: "#06b6d4", brightWhite: "#fafafa",
  },
  dark: {
    red: "#e07070", green: "#5dba80", yellow: "#d4a44a", blue: "#6a9de0", magenta: "#b07ad0", cyan: "#4aabb8", white: "#d4d4d8",
    brightRed: "#e89090", brightGreen: "#7ecf9a", brightYellow: "#e0be6e", brightBlue: "#8ab4e8", brightMagenta: "#c49ae0", brightCyan: "#6ec2cc", brightWhite: "#f0f0f2",
  },
};

/** Variables CSS getaroom (convention shadcn) dérivées d'une palette Paseo. */
export function skinVariables(id: SkinId): Record<string, string> {
  const p = PASEO_SKINS[id];
  const dark = p.scheme === "dark";
  const status = STATUS[p.scheme];
  // Comme Paseo : l'espace de travail est surface1 en sombre, surface0 en clair.
  const workspace = dark ? p.surface1 : p.surface0;
  const raised = dark ? p.surface2 : p.surface1;
  const hover = dark ? `color-mix(in srgb, ${p.surface2} 55%, ${p.surface3})` : p.surface2;
  return {
    "--background": workspace,
    "--foreground": p.foreground,
    "--card": raised,
    "--card-foreground": p.foreground,
    "--popover": dark ? p.surface2 : p.surface0,
    "--popover-foreground": p.foreground,
    "--primary": p.primary ?? p.foreground,
    "--primary-foreground": p.primaryForeground ?? p.surface0,
    "--secondary": p.surface2,
    "--secondary-foreground": p.foreground,
    "--muted": p.surface2,
    "--muted-foreground": p.foregroundMuted,
    "--accent": hover,
    "--accent-foreground": p.foreground,
    "--destructive": p.destructive,
    "--border": p.border,
    "--input": p.borderAccent,
    "--ring": p.accent,
    "--sidebar": p.surfaceSidebar,
    "--sidebar-foreground": p.foreground,
    "--sidebar-primary": p.primary ?? p.foreground,
    "--sidebar-primary-foreground": p.primaryForeground ?? p.surface0,
    "--sidebar-accent": dark ? p.surface2 : p.surface3,
    "--sidebar-accent-foreground": p.foreground,
    "--sidebar-border": p.border,
    "--sidebar-ring": p.accent,
    "--sidebar-room-active": dark ? p.surface2 : p.surface3,
    "--sidebar-studio-active": dark ? p.surface2 : p.surface3,
    "--paseo-accent": p.accent,
    "--paseo-accent-bright": p.accentBright,
    "--foreground-extra-muted": p.foregroundExtraMuted,
    "--status-success": status.success,
    "--status-danger": status.danger,
    "--status-warning": status.warning,
    "--status-running": status.running,
    "--terminal-background": p.surface0,
    "--surface-3": p.surface3,
    "--border-accent": p.borderAccent,
    "--usage-ok": USAGE_FILL[p.scheme].ok,
    "--usage-warning": USAGE_FILL[p.scheme].warning,
    "--usage-danger": USAGE_FILL[p.scheme].danger,
  };
}

export const skinScheme = (id: SkinId) => PASEO_SKINS[id].scheme;

/** Thème xterm du terminal, identique à celui de Paseo pour le skin donné. */
export function terminalTheme(id: SkinId) {
  const p = PASEO_SKINS[id];
  const dark = p.scheme === "dark";
  return {
    background: p.surface0,
    foreground: p.foreground,
    cursor: p.foreground,
    cursorAccent: p.surface0,
    selectionBackground: dark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.15)",
    selectionForeground: p.foreground,
    black: dark ? p.surfaceSidebar : "#1a1a1e",
    brightBlack: dark ? p.surface3 : "#3f3f46",
    ...TERMINAL_ANSI[p.scheme],
  };
}
