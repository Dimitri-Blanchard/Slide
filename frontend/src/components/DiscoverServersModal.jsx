import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { servers } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './DiscoverServersModal.css';

const CATEGORIES = ['All', 'Gaming', 'Music', 'Education', 'Tech', 'Art', 'Social', 'Sports'];

export default function DiscoverServersModal({ isOpen, onClose, onServerJoined, onBack, exiting }) {
  const [serversList, setServersList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const enterInstant = useModalEnterAnimation('discover-servers-modal', isOpen);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSearch('');
    setActiveCategory('All');
    setLoading(true);
    servers.getDiscoverable()
      .then((list) => setServersList(list || []))
      .catch((err) => setError(err.message || 'Erreur chargement'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleJoin = async (team) => {
    setJoiningId(team.id);
    setError('');
    try {
      const result = await servers.joinPublic(team.id);
      const joinedTeam = {
        id: result.team_id ?? result.team?.id ?? team.id,
        name: result.team?.name ?? team.name,
        avatar_url: result.team?.avatar_url ?? team.avatar_url,
        unread_count: 0,
        mention_count: 0,
        has_unread: false
      };
      onServerJoined?.(joinedTeam);
      onClose();
      navigate(`/team/${joinedTeam.id}`);
    } catch (err) {
      setError(err.message || 'Impossible de rejoindre');
    }
    setJoiningId(null);
  };

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!exiting) onClose();
  };

  const filtered = serversList.filter((team) => {
    const matchSearch = !search || (team.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (team.description || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  const modal = (
    <div className={`dsm-overlay ${exiting ? 'dsm-exiting' : ''}${enterInstant && !exiting ? ' modal-enter-instant' : ''}`} onClick={handleOverlayClick}>
      <div className={`dsm-modal ${exiting ? 'dsm-exiting' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button className="dsm-close" onClick={onBack || onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
          </svg>
        </button>

        <div className="dsm-hero">
          <div className="dsm-hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <h2 className="dsm-hero-title">Discover Communities</h2>
          <p className="dsm-hero-subtitle">Find and join public servers to connect with people who share your interests.</p>
          <div className="dsm-search-wrap">
            <svg className="dsm-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="dsm-search-input"
              type="text"
              placeholder="Search communities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="dsm-categories">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`dsm-cat-pill ${activeCategory === cat ? 'dsm-cat-active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="dsm-loading">
            <div className="loading-spinner" />
            <span>{t('common.loading') || 'Loading...'}</span>
          </div>
        ) : error ? (
          <div className="dsm-error">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="dsm-empty">
            {search ? `No communities found for "${search}"` : (t('discover.empty') || 'No public servers available yet.')}
          </div>
        ) : (
          <div className="dsm-grid">
            {filtered.map((team) => {
              const isJoining = joiningId === team.id;
              const isMember = team.is_member;
              const initial = (team.name || '?').charAt(0).toUpperCase();
              return (
                <div key={team.id} className="dsm-card">
                  <div className="dsm-card-icon">
                    {team.avatar_url ? (
                      <AvatarImg src={team.avatar_url} alt={team.name} />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <div className="dsm-card-body">
                    <span className="dsm-card-name">{team.name}</span>
                    <span className="dsm-card-members">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.6 }}>
                        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                      </svg>
                      {(team.member_count ?? 0).toLocaleString()} members
                    </span>
                    {team.description && (
                      <p className="dsm-card-desc">{team.description.slice(0, 80)}{team.description.length > 80 ? '…' : ''}</p>
                    )}
                  </div>
                  <div className="dsm-card-footer">
                    {isMember ? (
                      <span className="dsm-your-badge">{t('discover.yourServer') || 'Joined'}</span>
                    ) : (
                      <button
                        className="dsm-join-btn"
                        onClick={() => handleJoin(team)}
                        disabled={!!joiningId}
                      >
                        {isJoining ? 'Joining...' : 'Join'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
