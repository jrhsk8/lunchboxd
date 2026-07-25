import { Component, type ErrorInfo, type ReactNode } from 'react';

import { btnPrimary, panel } from './ui';

/**
 * Catches a render throw and shows something honest instead of a blank page.
 *
 * Without this, any exception during render unmounts the whole tree and leaves
 * the warm-black background with nothing on it — indistinguishable from a
 * failed deploy. The realistic triggers are a query result whose shape doesn't
 * match its type and `new Date(...)` on an unexpected value.
 *
 * Logging is console-only, deliberately. The Terms promise "no analytics, no
 * tracking" as a stated product position, so a third-party reporter (Sentry and
 * friends) is not a free addition here — it needs a ruling first.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('lunchboxd: render failed —', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className={`${panel} p-6`}>
          <h1 className="text-lg font-bold text-ink">Something fell off the plate</h1>
          <p className="mt-2 text-sm text-dim">
            The page hit an error it couldn't render around. Nothing you did caused it and nothing
            you logged is lost.
          </p>
          <button
            type="button"
            className={`mt-5 ${btnPrimary}`}
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
