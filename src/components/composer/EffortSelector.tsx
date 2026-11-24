import React, { useState } from "react";
import { useWorkspace } from "../../context/WorkspaceContext";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Brain, ChevronDown, Check } from "lucide-react";
import { PressButton } from "../ui/button";

export function EffortSelector({ providerFilter, value, onSelect, modelId, quiet = false }: { providerFilter?: string; value?: string; onSelect?: (effort: string) => void; modelId?: string; quiet?: boolean } = {}) {
  const { models, selectedModel, thinkingEffort, setThinkingEffort } = useWorkspace();
  const providerKey = providerFilter?.toLocaleLowerCase();
  const candidateModels = providerKey ? models.filter((m) => m.agentProvider?.toLocaleLowerCase() === providerKey) : models;
  const effectiveModel = modelId || (providerFilter ? candidateModels[0]?.id || "" : selectedModel);
  const effectiveEffort = value || thinkingEffort;
  const [isOpen, setIsOpen] = useState(false);

  if (providerFilter && candidateModels.length === 0) {
    return null;
  }

  const activeModel =
    candidateModels.find((m) => m.id === effectiveModel) ||
    (effectiveModel ? candidateModels.find((m) => m.id.endsWith(`/${effectiveModel}`)) : undefined);

  const options =
    activeModel?.thinkingOptions && activeModel.thinkingOptions.length > 0
      ? activeModel.thinkingOptions
      : [
          { id: "off", label: "Off" },
          { id: "low", label: "Low" },
          { id: "medium", label: "Medium" },
          { id: "high", label: "High" },
          { id: "max", label: "Max" },
        ];

  const currentOption = options.find((o) => o.id === effectiveEffort) || options[0]!;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 touch-manipulation ${quiet ? "bg-transparent" : "border border-border/40 bg-muted/60"}`}
          title={`Effort de raisonnement : ${currentOption.label}`}
          aria-label={`Effort de raisonnement : ${currentOption.label}`}
        >
          <Brain className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="min-w-0 truncate capitalize">{currentOption.label}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-48 p-1.5"
      >
        <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Effort de raisonnement
        </div>
        <div className="space-y-0.5">
          {options.map((opt) => {
            const isSelected = opt.id === effectiveEffort;
            return (
              <PressButton
                key={opt.id}
                type="button"
                onPress={() => {
                  (onSelect || setThinkingEffort)(opt.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                <div className="capitalize font-medium">{opt.label}</div>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
              </PressButton>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
