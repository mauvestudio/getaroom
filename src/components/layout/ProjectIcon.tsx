import React, { useState, useEffect } from "react";
import type { ProjectItem } from "../../lib/paseo/types";
import type { PaseoClient } from "../../lib/paseo/client";
import { usePaseo } from "../../context/PaseoContext";
import { cn } from "../../lib/utils";
import { deriveIdentityColorName, identityColor } from "../../lib/identity-color";

interface ProjectIconProps {
  project?: ProjectItem | null;
  client?: PaseoClient | null;
  className?: string;
}

export function ProjectIcon({ project, client: propClient, className }: ProjectIconProps) {
  const { client: contextClient } = usePaseo();
  const client = propClient || contextClient;
  const [iconUri, setIconUri] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !client) {
      setIconUri(null);
      return;
    }

    let cancelled = false;

    const loadIcon = async () => {
      try {
        let res: { icon: { mimeType: string; data: string } | null } | null = null;
        if (project.rootPath) {
          res = await client.requestProjectIcon(project.rootPath).catch(() => null);
        }
        if (!res?.icon && project.id) {
          res = await client.getProjectIcon(project.id).catch(() => null);
        }
        if (!cancelled && res?.icon) {
          setIconUri(`data:${res.icon.mimeType};base64,${res.icon.data}`);
        }
      } catch {}
    };

    loadIcon();

    return () => {
      cancelled = true;
    };
  }, [project, client]);

  if (iconUri) {
    return (
      <img
        src={iconUri}
        alt=""
        className={cn("h-4 w-4 object-contain shrink-0 rounded-[4px]", className)}
      />
    );
  }

  // Repli de Paseo : carré 16 px, rayon 4, initiale blanche de 9 px sur une couleur d'identité du projet.
  const label = (project?.name || project?.rootPath?.split("/").filter(Boolean).pop() || "?").trim();
  const color = identityColor(deriveIdentityColorName(project?.projectKey || project?.rootPath || project?.id || label));
  return (
    <span
      aria-hidden="true"
      className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] text-[9px] leading-none text-white", className)}
      style={{ backgroundColor: color }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
