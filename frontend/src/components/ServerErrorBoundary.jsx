import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './ServerErrorBoundary.css';

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
  const { t } = useLanguage();

  const renderFallback = (error) => (
    <div className="seb-fallback" role="alert">
      <div className="seb-fallback-icon" aria-hidden>:(</div>
      <p className="seb-fallback-msg">
        {t('errorBoundary.serverLoadFailed')}
      </p>
      {error && (
        <pre className="seb-fallback-pre">
          {error?.message || String(error)}
        </pre>
      )}
      <button
        type="button"
        className="seb-fallback-btn"
        onClick={() => navigate('/channels/@me')}
      >
        {t('errorBoundary.backToMessages')}
      </button>
    </div>
  );

  return (
    <ServerErrorBoundaryClass renderFallback={renderFallback}>
      {children}
    </ServerErrorBoundaryClass>
  );
}
