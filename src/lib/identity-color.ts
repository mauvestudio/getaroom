// Palette d'identité de Paseo (reprise de son bundle : IDENTITY_COLOR_NAMES / identityColor / deriveIdentityColorName).
// Sert aux avatars de projet : un carré coloré avec l'initiale, la couleur dépendant d'un hash de la clé du projet.

export const IDENTITY_COLOR_NAMES = ["violet", "sky", "emerald", "orange", "pink", "indigo", "teal", "red", "amber", "blue"] as const;
export type IdentityColorName = (typeof IDENTITY_COLOR_NAMES)[number];

const IDENTITY_COLORS: Record<IdentityColorName, string> = {
  violet: "#7a6aa8", sky: "#3d7ea6", emerald: "#388068", orange: "#a4673a", pink: "#b05c80",
  indigo: "#6a70b8", teal: "#368080", red: "#b06260", amber: "#8f7838", blue: "#5179b0",
};

/** Paseo : `t = (31 * t + charCode) >>> 0` sur chaque caractère (UTF-16). */
export function identityHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) hash = (Math.imul(31, hash) + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function deriveIdentityColorName(key: string): IdentityColorName {
  return IDENTITY_COLOR_NAMES[identityHash(key) % IDENTITY_COLOR_NAMES.length]!;
}

export const identityColor = (name: IdentityColorName): string => IDENTITY_COLORS[name];
