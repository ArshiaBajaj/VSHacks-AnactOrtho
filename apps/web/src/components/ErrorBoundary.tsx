import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Anact Ortho render error:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "#0f172a",
            color: "#f8fafc",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 560 }}>
            <h1 style={{ fontSize: 24, marginBottom: 8 }}>Anact Ortho failed to load</h1>
            <p style={{ color: "#94a3b8", marginBottom: 16 }}>
              The app hit a runtime error. Try a hard refresh. If this keeps happening, restart the dev server.
            </p>
            <pre
              style={{
                background: "#1e293b",
                padding: 16,
                borderRadius: 12,
                overflow: "auto",
                fontSize: 13,
                color: "#fda4af",
              }}
            >
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
