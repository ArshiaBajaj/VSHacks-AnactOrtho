import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

/** Feature-level boundary so HooperIQ never blanks the whole app shell. */
export class HooperErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[hooperiq]", err, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-sm font-semibold text-white">HooperIQ hit a snag</p>
          <p className="mt-2 text-xs text-court-muted">
            Your other features are fine. Reload this page to restart the IQ session.
          </p>
          <button
            type="button"
            className="mt-5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-black"
            onClick={() => {
              this.setState({ crashed: false });
              try {
                window.location.assign("/iq");
              } catch {
                window.location.reload();
              }
            }}
          >
            Restart HooperIQ
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
