import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import './MobileServerPicker.css';

function ServerIcon({ team }) {
  if (team.icon_url) {
    return <AvatarImg src={team.icon_url} alt={team.name} className="msp-icon-img" />;
  }
  const initials = team.name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return <span className="msp-icon-initials">{initials}</span>;
}

export default function MobileServerPicker({ teams, onCreateServer }) {
  const navigate = useNavigate();

  return (
    <div className="mobile-server-picker">
      <div className="msp-header">
        <h1 className="msp-title">Serveurs</h1>
      </div>

      <div className="msp-scroll">
        {teams.length === 0 ? (
          <p className="msp-empty">Vous n'avez rejoint aucun serveur.</p>
        ) : (
          teams.map(team => (
            <button
              key={team.id}
              className={`msp-item ${team.has_unread ? 'unread' : ''}`}
              onClick={() => navigate(`/team/${team.id}`)}
            >
              <div className="msp-icon">
                <ServerIcon team={team} />
              </div>

              <div className="msp-info">
                <span className="msp-name">{team.name}</span>
                {team.has_unread && !team.mention_count && (
                  <span className="msp-sub">Nouveaux messages</span>
                )}
              </div>

              {team.mention_count > 0 ? (
                <span className="msp-mention-badge">
                  {team.mention_count > 99 ? '99+' : team.mention_count}
                </span>
              ) : team.has_unread ? (
                <span className="msp-unread-dot" />
              ) : null}

              <svg className="msp-chevron" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
              </svg>
            </button>
          ))
        )}

        {onCreateServer && (
          <button className="msp-add-btn" onClick={onCreateServer}>
            <div className="msp-add-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
              </svg>
            </div>
            <span className="msp-add-label">Ajouter ou créer un serveur</span>
            <svg className="msp-chevron" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
