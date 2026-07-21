import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BUILD_ID } from './build';
import { buildCrashReport, copyDebugText } from './game/debug';
import './styles.css';

class GameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; componentStack?: string; copied: boolean }> {
  state: { error: Error | null; componentStack?: string; copied: boolean } = { error: null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Kessel Sabacc crashed', error, info);
    this.setState({ componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.error) {
      return (
        <main className="setup-screen">
          <section className="hero-panel">
            <p className="eyebrow">TABLE MALFUNCTION · {BUILD_ID}</p>
            <h1>The game hit an unexpected error.</h1>
            <p>Your browser is fine. Reloading starts a fresh table instead of leaving you with a blank screen.</p>
            <div className="modal-actions crash-actions">
              <button
                className="secondary-button"
                onClick={async () => {
                  await copyDebugText(buildCrashReport(this.state.error!, this.state.componentStack));
                  this.setState({ copied: true });
                }}
              >
                {this.state.copied ? 'Crash report copied' : 'Copy crash report'}
              </button>
              <button className="primary-button" onClick={() => window.location.reload()}>Reload game</button>
            </div>
            <details>
              <summary>Technical detail</summary>
              <code>{this.state.error.message}</code>
            </details>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GameErrorBoundary>
      <App />
    </GameErrorBoundary>
  </StrictMode>,
);
