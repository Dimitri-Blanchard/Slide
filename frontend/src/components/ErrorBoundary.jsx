import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught:', error?.message, '\n', errorInfo?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      return (
        <div className="eb-root" role="alert">
          <div className="eb-card">
            <div className="eb-icon" aria-hidden>:(</div>
            <h1 className="eb-title">Something went wrong</h1>
            <p className="eb-desc">
              An unexpected error occurred. You can try again or reload the app. If this keeps happening, contact support with the details below.
            </p>
            {this.state.error && (
              <>
                <pre className="eb-pre">
                  {this.state.error?.message || String(this.state.error)}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="eb-pre eb-pre--stack">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </>
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
