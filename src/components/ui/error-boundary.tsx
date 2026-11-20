import React from "react";
import { AlertTriangle } from "lucide-react";
import { PressButton } from "./button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Toute variation de cette clé efface l'erreur (ex. changement de mode/vue). */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && !Object.is(previous.resetKey, this.props.resetKey)) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack?.slice(0, 500));
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background p-8">
        <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-foreground">
            Une erreur d'interface est survenue
          </h2>
          <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
            L'affichage a été interrompu, mais ta session et tes données restent intactes.
          </p>
          <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground/70" title={this.state.error.message}>
            {this.state.error.message}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <PressButton
              onPress={() => this.setState({ error: null })}
              className="min-h-9 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation"
            >
              Réessayer
            </PressButton>
            <PressButton
              onPress={() => window.location.reload()}
              className="min-h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground cursor-pointer touch-manipulation"
            >
              Recharger l'application
            </PressButton>
          </div>
        </div>
      </div>
    );
  }
}
