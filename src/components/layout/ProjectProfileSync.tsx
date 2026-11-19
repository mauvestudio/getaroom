import { useEffect } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";

/** Paseo remains the project authority; keep a portable reference snapshot in appDataDir. */
export function ProjectProfileSync() {
  const { projects } = useWorkspace();
  useEffect(() => {
    if (!projects.length) return;
    void fetch("/api/profile/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(projects.map(({ id, name, rootPath }) => ({ id, name, rootPath }))),
    }).catch(() => {});
  }, [projects]);
  return null;
}
