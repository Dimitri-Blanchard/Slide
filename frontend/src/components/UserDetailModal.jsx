import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { users as usersApi, direct as directApi } from '../api';
import { getProfile, getCachedProfile } from '../utils/profileCache';
import { useAuth } from '../context/AuthContext';
import { useOnlineUsers } from '../context/SocketContext';
import { getStaticUrl } from '../utils/staticUrl';
import { getStoredCustomStatus, getStoredOnlineStatus } from '../utils/presenceStorage';
import { harmonizeGradientColors } from '../utils/gradientColors';
import Avatar from './Avatar';
import './UserDetailModal.css';

const STATUS_COLORS = {
  online:    '#23a55a',
  idle:      '#f0b232',
  dnd:       '#f23f43',
  invisible: '#80848e',
  offline:   '#80848e',
};

const NOTE_KEY = 'slide_profile_notes';
function loadNote(uid) {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) || '{}')[uid] ?? ''; } catch { return ''; }
}
function saveNote(uid, note) {
  try {
    const d = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
    if (note) d[uid] = note; else delete d[uid];
    localStorage.setItem(NOTE_KEY, JSON.stringify(d));
  } catch {}
}

function isGifUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.gif(?:$|[?#])/i.test(url) || /format=gif/i.test(url);
}

export default function UserDetailModal({ userId, user: providedUser, isOpen, onClose, containerRef }) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { isUserOnline } = useOnlineUsers();

  const [user, setUser]               = useState(providedUser || null);
  const [loading, setLoading]         = useState(!providedUser);
  const [commonTeams, setCommonTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [note, setNote]               = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [copied, setCopied]           = useState(false);

  const modalRef = useRef(null);
  const resolvedId = userId || providedUser?.id;
  const isOwnProfile = currentUser?.id === resolvedId;

  // Fetch profile + common teams on open (uses cache — instant when prefetched)
  useEffect(() => {
    if (!isOpen) return;
    if (providedUser) setUser(providedUser);
    if (userId) {
      const cached = getCachedProfile(userId);
      if (cached) {
        setUser(cached);
        setLoading(false);
      } else {
        setLoading(true);
        getProfile(userId)
          .then(d => { setUser(d); setLoading(false); })
          .catch(() => setLoading(false));
      }
    } else {
      setLoading(false);
    }
    if (resolvedId && !isOwnProfile) {
      setTeamsLoading(true);
      usersApi.getCommonTeams(resolvedId)
        .then(data => { setCommonTeams(Array.isArray(data) ? data : []); setTeamsLoading(false); })
        .catch(() => { setCommonTeams([]); setTeamsLoading(false); });
      setNote(loadNote(resolvedId));
    }
  }, [isOpen, userId, providedUser, resolvedId, isOwnProfile]);

  // Close on Escape / outside click
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleMessage = useCallback(async () => {
    if (!user?.id) return;
    try {
      const conv = await directApi.createConversation(parseInt(user.id, 10));
      onClose();
      navigate(`/channels/@me/${conv.conversation_id ?? conv.id}`);
    } catch {}
  }, [user?.id, navigate, onClose]);

  const handleNoteChange = useCallback((val) => {
    setNote(val);
    saveNote(resolvedId, val);
  }, [resolvedId]);

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(String(resolvedId)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!isOpen) return null;

  // Derived display data
  const username      = user?.username || user?.email?.split('@')[0] || null;
  const displayName   = user?.display_name || username || 'Utilisateur';
  const aboutMe       = user?.about_me || user?.bio;
  const statusMessage = user?.status_message
    || (isOwnProfile ? getStoredCustomStatus(currentUser?.id) : null)
    || null;
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const presenceStatus = isOwnProfile
    ? getStoredOnlineStatus(currentUser?.id)
    : (isUserOnline(user?.id) ? 'online' : 'offline');
  const statusColor = STATUS_COLORS[presenceStatus] || STATUS_COLORS.offline;

  const bannerColor  = user?.banner_color  || '#4f6ef7';
  const bannerColor2 = user?.banner_color_2;
  const bannerUrl    = user?.banner_url ? getStaticUrl(user.banner_url) : null;
  const hasGifBanner = isGifUrl(user?.banner_url || bannerUrl);
  const hasDualBanner = !!bannerColor2;
  const [c1, c2] = hasDualBanner ? harmonizeGradientColors(bannerColor, bannerColor2 || '#000') : [bannerColor, '#000'];
  const verticalGrad = (a, b) => `linear-gradient(180deg, ${a} 0%, ${a} 12%, ${b} 88%, ${b} 100%)`;
  const bannerStyle = bannerUrl
    ? (hasGifBanner
        ? { backgroundColor: c1 }
        : { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center top' })
    : hasDualBanner
      ? { backgroundImage: verticalGrad(c1, c2) }
      : { backgroundColor: c1 };

  const modal = (
    <div className="udm-overlay" role="dialog" aria-modal="true" aria-label={`Profil de ${displayName}`} ref={containerRef}>
      <div className="udm-backdrop" onClick={onClose} />
      <div className="udm-modal" ref={modalRef}>
        <button className="udm-close-btn udm-close-btn--outside" onClick={onClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="udm-layout">
          <aside className="udm-side-panel udm-side-panel--activities">
            <div className="udm-section">
              <h3 className="udm-section-title">Activities</h3>
              <p className="udm-empty-text">User activities will appear here soon.</p>
            </div>
          </aside>

          <section className="udm-main-card">
            <div className={`udm-banner${bannerUrl ? ' udm-banner--image' : ''}`} style={bannerStyle}>
              {bannerUrl && hasGifBanner && (
                <img className="udm-banner-img" src={bannerUrl} alt="" draggable={false} />
              )}
            </div>

            <div className="udm-avatar-row">
              <div className="udm-avatar-wrap">
                {loading ? (
                  <div className="udm-avatar-skeleton" />
                ) : (
                  <>
                    <Avatar user={user} size="xlarge" gifAnimate />
                    <div className="udm-status-dot" style={{ background: statusColor }} title={presenceStatus} />
                  </>
                )}
              </div>
              {!loading && user && (
                <div className="udm-actions">
                  {!isOwnProfile ? (
                    <button className="udm-action-btn udm-action-btn--primary" onClick={handleMessage}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      Message
                    </button>
                  ) : (
                    <button className="udm-action-btn" onClick={() => { onClose(); navigate('/settings'); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Modifier le profil
                    </button>
                  )}
                  <button
                    className="udm-action-btn"
                    onClick={handleCopyId}
                    title="Copier l'ID utilisateur"
                  >
                    {copied ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                    )}
                    {copied ? 'Copié !' : 'Copier l\'ID'}
                  </button>
                </div>
              )}
            </div>

            <div className="udm-main-body">
              {loading ? (
                <div className="udm-skeleton-body">
                  <div className="udm-skeleton-line udm-skeleton-line--name" />
                  <div className="udm-skeleton-line udm-skeleton-line--tag" />
                  <div className="udm-skeleton-line udm-skeleton-line--text" />
                </div>
              ) : user ? (
                <>
                  <div className="udm-identity">
                    <h2 className="udm-displayname">
                      {displayName}
                      {Boolean(user.is_webhook) && <span className="udm-badge udm-badge--bot">BOT</span>}
                      {Boolean(user.has_nitro) && <span className="udm-badge udm-badge--nitro">Nitro</span>}
                    </h2>
                    {username && (
                      <span className="udm-username">@{username}</span>
                    )}
                  </div>

                  {statusMessage && (
                    <div className="udm-status-msg">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.6 }}>
                        <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                      </svg>
                      {statusMessage}
                    </div>
                  )}

                  <hr className="udm-divider" />

                  {aboutMe && (
                    <div className="udm-section">
                      <h3 className="udm-section-title">A propos de moi</h3>
                      <p className="udm-section-text">{aboutMe}</p>
                    </div>
                  )}

                  {joinDate && (
                    <div className="udm-section">
                      <h3 className="udm-section-title">Membre depuis</h3>
                      <div className="udm-date-row">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        <p className="udm-section-text">{joinDate}</p>
                      </div>
                    </div>
                  )}

                  {!isOwnProfile && (
                    <div className="udm-section">
                      <h3 className="udm-section-title">
                        Serveurs et groupes en commun
                        {!teamsLoading && commonTeams.length > 0 && (
                          <span className="udm-section-count">{commonTeams.length}</span>
                        )}
                      </h3>
                      {teamsLoading ? (
                        <div className="udm-teams-loading">
                          {[0,1,2].map(i => <div key={i} className="udm-team-skeleton" />)}
                        </div>
                      ) : commonTeams.length === 0 ? (
                        <p className="udm-empty-text">Aucun serveur ou groupe en commun</p>
                      ) : (
                        <div className="udm-teams-list">
                          {commonTeams.map(team => (
                            <div key={team.id} className="udm-team-item">
                              <div className="udm-team-icon">
                                {team.avatar_url ? (
                                  <img src={getStaticUrl(team.avatar_url)} alt={team.name} />
                                ) : (
                                  <span>{team.name.slice(0, 2).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="udm-team-info">
                                <span className="udm-team-name">{team.name}</span>
                                <span className="udm-team-meta">
                                  {team.member_count} membre{team.member_count !== 1 ? 's' : ''}
                                  {team.target_role && team.target_role !== 'member' && (
                                    <span className="udm-team-role">{team.target_role === 'owner' ? 'Proprietaire' : team.target_role === 'admin' ? 'Admin' : team.target_role}</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!isOwnProfile && (
                    <div className="udm-section udm-section--note">
                      <h3 className="udm-section-title">Note personnelle</h3>
                      {noteEditing ? (
                        <textarea
                          className="udm-note-input"
                          value={note}
                          onChange={e => handleNoteChange(e.target.value)}
                          onBlur={() => setNoteEditing(false)}
                          placeholder="Cliquez pour ajouter une note sur cet utilisateur…"
                          rows={3}
                          autoFocus
                        />
                      ) : (
                        <div
                          className={`udm-note-preview${!note ? ' udm-note-preview--empty' : ''}`}
                          onClick={() => setNoteEditing(true)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={e => e.key === 'Enter' && setNoteEditing(true)}
                        >
                          {note || 'Cliquez pour ajouter une note…'}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="udm-error">Impossible de charger le profil.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
