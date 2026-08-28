import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportRendererError } from "../platform/desktopBridge";

type Props = Readonly<{ children: ReactNode }>;
type State = Readonly<{ error: Error | null }>;

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportRendererError({
      message: error.message || "Unknown renderer error",
      stack: [error.stack, info.componentStack].filter(Boolean).join("\n"),
      source: "boundary",
    });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-fatal-error" role="alert">
        <p>Hostfall encontró un error inesperado.</p>
        <h1>No se pudo continuar la Visión</h1>
        <span>Reinicia el juego. El diagnóstico quedó guardado localmente.</span>
      </main>
    );
  }
}
