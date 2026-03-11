import React from 'react';

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
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f0f2f7',
          color: '#0f1117',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>:(</div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', color: '#fff' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#949ba4', marginBottom: '0.5rem', maxWidth: '400px' }}>
            An unexpected error occurred. You can try going back or reloading the app.
          </p>
          {this.state.error && (
            <>
              <pre style={{ color: '#da373c', fontSize: '0.75rem', textAlign: 'left', maxWidth: '100%', overflow: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginBottom: '0.5rem', userSelect: 'text', WebkitUserSelect: 'text' }}>
                {this.state.error?.message || String(this.state.error)}
              </pre>
              {this.state.errorInfo?.componentStack && (
                <pre style={{ color: '#b9bbbe', fontSize: '0.65rem', textAlign: 'left', maxWidth: '100%', overflow: 'auto', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: 4, marginBottom: '1.5rem', whiteSpace: 'pre-wrap', userSelect: 'text', WebkitUserSelect: 'text' }}>
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.6rem 1.5rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#e4e7ed',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Try Again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.6rem 1.5rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#4f6ef7',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
