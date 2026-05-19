import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copyDone: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, copyDone: false };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo, copyDone: false });
    console.error('ErrorBoundary caught:', error?.message, '\n', errorInfo?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, copyDone: false });
  };

  handleCopyDetails = async () => {
    const { error, errorInfo } = this.state;
    const parts = [error?.stack || error?.message || String(error), errorInfo?.componentStack].filter(Boolean);
    const text = parts.join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copyDone: true });
      window.setTimeout(() => this.setState({ copyDone: false }), 2500);
    } catch (_) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        this.setState({ copyDone: true });
        window.setTimeout(() => this.setState({ copyDone: false }), 2500);
      } catch (__) {}
    }
  };

  render() {
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error);
      const stack = this.state.errorInfo?.componentStack;
      return (
        <div className="eb-root" role="alert">
          <div className="eb-card">
            <header className="eb-header">
              <div className="eb-mark" aria-hidden>
                <svg className="eb-mark-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h1 className="eb-title">Something went wrong</h1>
              <p className="eb-desc">
                Slide hit an unexpected error. You can try again, reload the page, or copy the details below if you need to report the issue.
              </p>
            </header>

            {this.state.error && (
              <section className="eb-details" aria-labelledby="eb-details-heading">
                <div className="eb-details-bar">
                  <h2 id="eb-details-heading" className="eb-details-label">
                    Technical details
                  </h2>
                  <button type="button" className="eb-copy" onClick={this.handleCopyDetails}>
                    {this.state.copyDone ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="eb-scroll" tabIndex={0}>
                  <pre className="eb-pre eb-pre--message">{msg}</pre>
                  {this.state.error?.stack && (
                    <pre className="eb-pre eb-pre--stacktrace">{this.state.error.stack}</pre>
                  )}
                  {stack && <pre className="eb-pre eb-pre--stack">{stack}</pre>}
                </div>
              </section>
            )}

            <div className="eb-actions">
              <button type="button" className="eb-btn eb-btn--secondary" onClick={this.handleReset}>
                Try again
              </button>
              <button type="button" className="eb-btn eb-btn--primary" onClick={this.handleReload}>
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
