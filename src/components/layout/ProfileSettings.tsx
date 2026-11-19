import { useRef, useState } from "react";
import { Download, FolderSync, Upload } from "lucide-react";
import { useI18n } from "../../i18n/I18nContext";
import { PressButton } from "../ui/button";
import { usePaseo } from "../../context/PaseoContext";

export function ProfileSettings() {
  const { t } = useI18n();
  const { client, connectionState } = usePaseo();
  const input = useRef<HTMLInputElement>(null);
  const [includeTokens, setIncludeTokens] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [syncPath, setSyncPath] = useState(() => localStorage.getItem("getaroom-sync-path") || "");
  const [notice, setNotice] = useState("");
  const exportProfile = async () => {
    try {
      const response = await fetch(`/api/profile/export?includeTokens=${includeTokens}`);
      if (!response.ok) throw new Error("Export impossible.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "getaroom-profile.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Profil exporté.");
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const importProfile = async (profile: unknown) => {
    const response = await fetch("/api/profile/import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile, mode }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Import impossible.");
    const projects = (profile as { projects?: Array<{ rootPath?: string }> })?.projects;
    if (connectionState === "connected" && Array.isArray(projects)) {
      for (const project of projects) {
        if (typeof project.rootPath === "string" && project.rootPath.startsWith("/")) {
          await client.addProject(project.rootPath).catch(() => {});
        }
      }
    }
    location.reload();
  };
  const onFile = async (file?: File) => {
    if (!file) return;
    try { await importProfile(JSON.parse(await file.text())); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  const sync = async (direction: "push" | "pull") => {
    try {
      const path = syncPath.trim();
      localStorage.setItem("getaroom-sync-path", path);
      if (direction === "push") {
        const response = await fetch("/api/profile/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, includeTokens }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setNotice("Profil synchronisé.");
      } else {
        const response = await fetch(`/api/profile/sync?path=${encodeURIComponent(path)}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        await importProfile(result);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
  };
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4">
    <h3 className="text-sm font-semibold">{t("Profil & synchronisation")}</h3>
    <p className="text-xs text-muted-foreground">{t("Les tokens sont exclus par défaut. Conserve tout export contenant des tokens dans un lieu sûr.")}</p>
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={includeTokens} onChange={(event) => setIncludeTokens(event.target.checked)} />{t("Inclure les tokens d’accès")}</label>
    <div className="flex flex-wrap gap-2">
      <PressButton onPress={() => void exportProfile()} className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs"><Download className="h-3.5 w-3.5" />{t("Exporter le profil")}</PressButton>
      <PressButton onPress={() => input.current?.click()} className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs"><Upload className="h-3.5 w-3.5" />{t("Importer un profil")}</PressButton>
      <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
    </div>
    <div className="flex gap-2 text-xs">{(["merge", "replace"] as const).map((value) => <PressButton key={value} onPress={() => setMode(value)} className={`min-h-9 rounded-lg border px-3 ${mode === value ? "border-primary bg-primary/10" : "border-border"}`}>{t(value === "merge" ? "Fusionner" : "Remplacer")}</PressButton>)}</div>
    <label className="block space-y-1 text-xs"><span>{t("Fichier synchronisé")}</span><input value={syncPath} onChange={(event) => setSyncPath(event.target.value)} placeholder="~/Library/Mobile Documents/…/getaroom-profile.json" className="box-border h-10 w-full max-w-full rounded-lg border border-border bg-background px-3 font-mono text-xs" /></label>
    <div className="flex flex-wrap gap-2">
      <PressButton onPress={() => void sync("push")} className="flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs"><FolderSync className="h-3.5 w-3.5" />{t("Synchroniser maintenant")}</PressButton>
      <PressButton onPress={() => void sync("pull")} className="min-h-10 rounded-lg border border-border px-3 text-xs">{t("Importer depuis le fichier synchronisé")}</PressButton>
    </div>
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
  </section>;
}
