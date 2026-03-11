import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Error boundary for the server view (TeamChat). Shows a fallback with "Go back"
 * so users can recover without reloading when the server view crashes (e.g. in Electron).
 */
class ServerErrorBoundaryClass extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ServerErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.renderFallback?.(this.state.error)
        ?? this.props.children;
    }
    return this.props.children;
  }
}

export default function ServerErrorBoundary({ children }) {
  const navigate = useNavigate();

  const renderFallback = (error) => (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      padding: '2rem',
      textAlign: 'center',
      minHeight: '200px',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem', userSelect: 'text', WebkitUserSelect: 'text' }}>:(</div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', userSelect: 'text', WebkitUserSelect: 'text' }}>
        Something went wrong loading this server.
      </p>
      {error && (
        <pre style={{
          color: 'var(--error, #da373c)',
          fontSize: '0.7rem',
          maxWidth: '100%',
          overflow: 'auto',
          padding: '0.5rem',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 4,
          marginBottom: '1rem',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          cursor: 'text',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {error?.message || String(error)}
        </pre>
      )}
      <button
        onClick={() => navigate('/channels/@me')}
        style={{
          padding: '0.5rem 1.25rem',
          borderRadius: 4,
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '0.9rem',
        }}
      >
        Go back to DMs
      </button>
    </div>
  );

  return (
    <ServerErrorBoundaryClass renderFallback={renderFallback}>
      {children}
    </ServerErrorBoundaryClass>
  );
}
