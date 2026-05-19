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
            <span className="slide-preview-channel-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" opacity="0.7">
                <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z" />
                <path
                  d="M14 9.00304C14 9.00304 16 10.003 16 12.003C16 14.003 14 15.003 14 15.003"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M17 7.00304C17 7.00304 20 9.00304 20 12.003C20 15.003 17 17.003 17 17.003"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="slide-preview-channel-name">Lounge</span>
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
