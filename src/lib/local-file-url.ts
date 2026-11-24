// Images locales dans la timeline : Paseo écrit `![Image](file:///var/folders/.../paseo-attachments-xxx/<hash>.png)`,
// un fichier sur la machine du démon. Une page web ne peut pas l'ouvrir : on le fait lire par le démon.

/** `file:///a/b%20c.png` → `/a/b c.png` (même règle que `fileUriToPath` de Paseo, hors Windows). */
export function fileUriToPath(uri: string): string {
  if (!uri.toLowerCase().startsWith("file://")) return uri;
  const raw = uri.slice(7).replace(/[?#].*$/, "");
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* garde la valeur brute */ }
  return decoded.replace(/^\/([A-Za-z]:[\\/])/, "$1");
}

/** Source que le navigateur ne sait pas charger lui-même et qui désigne un fichier du démon. */
export function localFilePath(src: string | undefined | null): string | null {
  if (!src) return null;
  const value = src.trim();
  if (/^(https?:|data:|blob:)/i.test(value)) return null;
  if (value.toLowerCase().startsWith("file://")) return fileUriToPath(value);
  return value.startsWith("/") && !value.startsWith("//") ? value : null;
}
