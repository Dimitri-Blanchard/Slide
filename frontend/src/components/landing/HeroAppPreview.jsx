import React from 'react';
import './HeroAppPreview.css';

/**
 * Static miniature of Slide’s team + channel view (dark theme tokens).
 * Matches server-bar → channel-sidebar → chat layout; no animation.
 */
export default function HeroAppPreview() {
  return (
    <div className="slide-app-preview" data-theme="dark" aria-hidden>
      <div className="slide-app-preview__shell">
        <aside className="slide-app-preview__server-bar">
          <div className="slide-preview-server slide-preview-server--home slide-preview-server--active">
            <img src="/logo.png" alt="" width={28} height={28} />
          </div>
          <div className="slide-preview-server-sep" />
          <div className="slide-preview-server">
            <span className="slide-preview-server-letter">G</span>
          </div>
          <div className="slide-preview-server slide-preview-server--active">
            <span className="slide-preview-server-letter">S</span>
            <span className="slide-preview-server-indicator" />
          </div>
          <div className="slide-preview-server">
            <span className="slide-preview-server-letter">A</span>
          </div>
          <div className="slide-preview-server slide-preview-server--add">+</div>
        </aside>

        <aside className="slide-app-preview__channel-sidebar">
          <div className="slide-preview-server-header">
            <span className="slide-preview-server-header-name">Gaming Squad</span>
          </div>
          <div className="slide-preview-category">
            <span className="slide-preview-category-name">Text channels</span>
          </div>
          <div className="slide-preview-channel slide-preview-channel--active">
            <span className="slide-preview-channel-hash">#</span>
            <span>general</span>
          </div>
          <div className="slide-preview-channel">
            <span className="slide-preview-channel-hash">#</span>
            <span>gaming</span>
          </div>
          <div className="slide-preview-category">
            <span className="slide-preview-category-name">Voice</span>
          </div>
          <div className="slide-preview-channel slide-preview-channel--voice">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            </svg>
            <span>Lounge</span>
          </div>
        </aside>

        <div className="slide-app-preview__chat">
          <header className="slide-preview-ch-header">
            <span className="slide-preview-ch-hash">#</span>
            <span className="slide-preview-ch-name">general</span>
          </header>
          <div className="slide-preview-messages">
            <article className="slide-preview-message">
              <div className="slide-preview-avatar slide-preview-avatar--violet" />
              <div className="slide-preview-message-body">
                <div className="slide-preview-message-meta">
                  <span className="slide-preview-sender">Nova</span>
                  <time>Today at 9:41 PM</time>
                </div>
                <p>Anyone up for ranked tonight?</p>
              </div>
            </article>
            <article className="slide-preview-message">
              <div className="slide-preview-avatar slide-preview-avatar--accent" />
              <div className="slide-preview-message-body">
                <div className="slide-preview-message-meta">
                  <span className="slide-preview-sender">You</span>
                  <time>Today at 9:42 PM</time>
                </div>
                <p>I'm in — voice channel in 5</p>
              </div>
            </article>
          </div>
          <div className="slide-preview-composer">
            <span className="slide-preview-composer-placeholder">Message #general</span>
          </div>
        </div>
      </div>

      <div className="slide-preview-userbar">
        <div className="slide-preview-userbar-avatar" />
        <div className="slide-preview-userbar-info">
          <span className="slide-preview-userbar-name">You</span>
          <span className="slide-preview-userbar-status">Online</span>
        </div>
      </div>
    </div>
  );
}
