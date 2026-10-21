import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/**
 * Last-resort UI guard: a render error in one module shows a recoverable
 * message instead of a blank screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console for debugging; no data leaves the browser.
    console.error('SignalMaster Pro UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-bg p-6">
          <div className="card max-w-lg p-6">
            <h1 className="text-lg font-semibold">Something went wrong in the interface</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              The application caught an unexpected rendering error. Your saved experiments are untouched. Reloading usually fixes it.
            </p>
            <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-surface2 p-3 text-[11px] text-err">{this.state.error.message}</pre>
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
                Reload application
              </button>
              <button type="button" className="btn-secondary" onClick={() => this.setState({ error: null })}>
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
