import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSettingsUi } from '../context/SettingsUiContext';
import { users as usersApi, direct as directApi } from '../api';
import { getProfile, getCachedProfile } from '../utils/profileCache';
import { useAuth } from '../context/AuthContext';
import { useOnlineUsers } from '../context/SocketContext';
import { getStaticUrl } from '../utils/staticUrl';
import { getStoredCustomStatus, getStoredOnlineStatus } from '../utils/presenceStorage';
import { harmonizeGradientColors } from '../utils/gradientColors';
import Avatar from './Avatar';
import ProfileSpotifyActivity from './ProfileSpotifyActivity';
import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import { loadUserNote, saveUserNote } from '../utils/userNotes';
import { dmPath } from '../utils/appRoutes';
import { canShowProfileActivities } from '../utils/profileActivities';
import './UserDetailModal.css';

const STATUS_COLORS = {
  online:    '#23a55a',
  idle:      '#f0b232',
  dnd:       '#f23f43',
  invisible: '#80848e',
  offline:   '#80848e',
};

function isGifUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.gif(?:$|[?#])/i.test(url) || /format=gif/i.test(url);
}

export default function UserDetailModal({ userId, user: providedUser, isOpen, onClose, containerRef }) {
  const navigate = useNavigate();
  const { openSettings } = useSettingsUi();
  const { user: currentUser } = useAuth();
  const { isUserOnline } = useOnlineUsers();
  const { developerMode, settings: appSettings } = useSettings();
  const { t } = useLanguage();

  const [user, setUser]               = useState(providedUser || null);
  const [loading, setLoading]         = useState(!providedUser);
  const [commonTeams, setCommonTeams] = useState([]);
  const [commonFriends, setCommonFriends] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [note, setNote]               = useState('');
  const [noteEditing, setNoteEditing] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [activeTab, setActiveTab]     = useState('profil');

  const modalRef = useRef(null);
  const noteInputRef = useRef(null);
  const lastNoteTapRef = useRef(0);
  const propResolvedId = userId || providedUser?.id;
  const resolvedId = propResolvedId;
  const isOwnProfile = currentUser?.id === resolvedId;

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('profil');
    setNoteEditing(false);
  }, [isOpen]);

  // Fetch profile + mutuals (uses cache — instant when prefetched)
  useEffect(() => {
    if (!isOpen || !resolvedId) return;

    const isInitialUser = String(resolvedId) === String(propResolvedId);
    if (isInitialUser && providedUser) {
      setUser(providedUser);
      setLoading(false);
    } else {
      const cached = getCachedProfile(resolvedId);
      if (cached) {
        setUser(cached);
        setLoading(false);
      } else {
        setLoading(true);
        getProfile(resolvedId)
          .then(d => { setUser(d); setLoading(false); })
          .catch(() => setLoading(false));
      }
    }

    if (!isOwnProfile) {
      setTeamsLoading(true);
      setFriendsLoading(true);
      usersApi.getCommonTeams(resolvedId)
        .then(data => { setCommonTeams(Array.isArray(data) ? data : []); setTeamsLoading(false); })
        .catch(() => { setCommonTeams([]); setTeamsLoading(false); });
      usersApi.getCommonFriends(resolvedId)
        .then(data => { setCommonFriends(Array.isArray(data) ? data : []); setFriendsLoading(false); })
        .catch(() => { setCommonFriends([]); setFriendsLoading(false); });
      setNote(loadUserNote(resolvedId));
    } else {
      setCommonTeams([]);
      setCommonFriends([]);
      setNote('');
    }
  }, [isOpen, resolvedId, propResolvedId, providedUser, isOwnProfile]);

  useEffect(() => {
    if (!resolvedId || isOwnProfile) return;
    const onNoteChanged = (e) => {
      if (String(e.detail?.userId) === String(resolvedId)) {
        setNote(e.detail?.note ?? loadUserNote(resolvedId));
      }
    };
    window.addEventListener('slide:user-note-changed', onNoteChanged);
    return () => window.removeEventListener('slide:user-note-changed', onNoteChanged);
  }, [resolvedId, isOwnProfile]);

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
      navigate(dmPath(conv));
    } catch {}
  }, [user?.id, navigate, onClose]);

  const handleTeamClick = useCallback((team) => {
    if (!team?.id) return;
    onClose();
    navigate(serverPath(team));
  }, [navigate, onClose]);

  const handleFriendClick = useCallback(async (friend) => {
    if (!friend?.id) return;
    try {
      const conv = await directApi.createConversation(parseInt(friend.id, 10));
      onClose();
      navigate(dmPath(conv));
    } catch {}
  }, [navigate, onClose]);

  const handleNoteChange = useCallback((val) => {
    setNote(val);
    saveUserNote(resolvedId, val);
  }, [resolvedId]);

  const autoResizeNoteInput = useCallback(() => {
    const input = noteInputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, []);

  // Scroll note input into view when opening on mobile (keyboard can cover it)
  useEffect(() => {
    if (noteEditing && noteInputRef.current) {
      const t = setTimeout(() => {
        noteInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [noteEditing]);

  useEffect(() => {
    if (!noteEditing) return;
    autoResizeNoteInput();
  }, [noteEditing, note, autoResizeNoteInput]);

  const handleCopyId = async () => {
    await navigator.clipboard.writeText(String(resolvedId)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const enterInstant = useModalEnterAnimation('user-detail-modal', isOpen);

  const showSpotifyListening =
    !isOwnProfile || appSettings.show_spotify_listening !== false;
  const activitiesVisible = canShowProfileActivities({
    isOwnProfile,
    userId: resolvedId,
    isUserOnline,
  });
  const spotifyEnabled =
    activitiesVisible &&
    showSpotifyListening &&
    !!(user?.spotify_connected || user?.spotify_now_playing);

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

  const mutualServersTabLabel = teamsLoading
    ? (t('profile.mutualServers') || 'Serveurs en commun')
    : commonTeams.length === 0
      ? (t('profile.noMutualServers') || 'Aucun serveur en commun')
      : `${commonTeams.length} ${t('profile.mutualServers') || 'serveurs en commun'}`;

  const mutualFriendsTabLabel = friendsLoading
    ? (t('profile.mutualFriends') || 'Amis en commun')
    : commonFriends.length === 0
      ? (t('profile.noMutualFriends') || 'Aucun ami en commun')
      : `${commonFriends.length} ${t('profile.mutualFriends') || 'amis en commun'}`;

  const modal = (
    <div className={`udm-overlay${enterInstant ? ' modal-enter-instant' : ''}`} role="dialog" aria-modal="true" aria-label={`Profil de ${displayName}`} ref={containerRef}>
      <div
          className="udm-backdrop"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (noteEditing) return;
            if (Date.now() - lastNoteTapRef.current < 400) return;
            onClose();
          }}
        />
      <div className="udm-modal" ref={modalRef}>
        <button className="udm-close-btn udm-close-btn--outside" onClick={onClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="udm-layout">
          <aside className="udm-sidebar">
            <div className="udm-sidebar-top">
              <div className={`udm-banner${bannerUrl ? ' udm-banner--image' : ''}`} style={bannerStyle}>
                {bannerUrl && hasGifBanner && (
                  <img className="udm-banner-img" src={bannerUrl} alt="" draggable={false} />
                )}
              </div>
              <div className="udm-sidebar-avatar">
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
              </div>
            </div>

            <div className="udm-sidebar-body">
              {loading ? (
                <div className="udm-skeleton-body">
                  <div className="udm-skeleton-line udm-skeleton-line--name" />
                  <div className="udm-skeleton-line udm-skeleton-line--tag" />
                </div>
              ) : user ? (
                <>
                  <div className="udm-identity">
                    <h2 className="udm-displayname">
                      {displayName}
                      {Boolean(user.is_webhook) && <span className="udm-badge udm-badge--bot">BOT</span>}
                      {Boolean(user.has_nitro) && <span className="udm-badge udm-badge--nitro">Nitro</span>}
                    </h2>
                    {username && <span className="udm-username">@{username}</span>}
                  </div>

                  {statusMessage && (
                    <div className="udm-status-msg">{statusMessage}</div>
                  )}

                  <div className="udm-sidebar-actions">
                    {!isOwnProfile ? (
                      <>
                        <button type="button" className="udm-sidebar-btn udm-sidebar-btn--primary" onClick={handleMessage}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                          Message
                        </button>
                        {developerMode && (
                          <button
                            type="button"
                            className="udm-sidebar-btn udm-sidebar-btn--icon"
                            onClick={handleCopyId}
                            title="Copier l'ID utilisateur"
                            aria-label="Copier l'ID utilisateur"
                          >
                            {copied ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                            ) : (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                              </svg>
                            )}
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="udm-sidebar-btn udm-sidebar-btn--primary"
                        onClick={() => { onClose(); openSettings(); }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        Modifier le profil
                      </button>
                    )}
                  </div>

                  {joinDate && (
                    <div className="udm-sidebar-meta">
                      <span className="udm-sidebar-meta-label">Membre depuis</span>
                      <span className="udm-sidebar-meta-value">{joinDate}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="udm-error">Impossible de charger le profil.</div>
              )}
            </div>
          </aside>

          <main className="udm-panel">
            <nav className="udm-tabs" role="tablist" aria-label="Sections du profil">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'profil'}
                className={`udm-tab${activeTab === 'profil' ? ' udm-tab--active' : ''}`}
                onClick={() => setActiveTab('profil')}
              >
                Profil
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'activite'}
                className={`udm-tab${activeTab === 'activite' ? ' udm-tab--active' : ''}`}
                onClick={() => setActiveTab('activite')}
              >
                {t('profile.activities') || 'Activité'}
              </button>
              {!isOwnProfile && (
                <>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'serveurs'}
                    className={`udm-tab${activeTab === 'serveurs' ? ' udm-tab--active' : ''}`}
                    onClick={() => setActiveTab('serveurs')}
                  >
                    {mutualServersTabLabel}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'amis'}
                    className={`udm-tab${activeTab === 'amis' ? ' udm-tab--active' : ''}`}
                    onClick={() => setActiveTab('amis')}
                  >
                    {mutualFriendsTabLabel}
                  </button>
                </>
              )}
            </nav>

            <div className="udm-panel-scroll">
              {loading ? (
                <div className="udm-skeleton-body">
                  <div className="udm-skeleton-line udm-skeleton-line--card" />
                  <div className="udm-skeleton-line udm-skeleton-line--card" />
                </div>
              ) : user ? (
                <div className="udm-tab-panel">
                  {activeTab === 'profil' && (
                    <>
                      <div className="udm-card">
                        <h3 className="udm-card-title">À propos de moi</h3>
                        <p className={`udm-card-text${!aboutMe ? ' udm-card-text--empty' : ''}`}>
                          {aboutMe || 'Aucune description.'}
                        </p>
                      </div>

                      {!isOwnProfile && (
                        <div className="udm-card">
                          <h3 className="udm-card-title">Note personnelle</h3>
                          {noteEditing ? (
                            <textarea
                              ref={noteInputRef}
                              className="udm-note-input"
                              value={note}
                              onChange={e => {
                                handleNoteChange(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                              }}
                              onBlur={() => setNoteEditing(false)}
                              placeholder="Ajouter une note sur cet utilisateur…"
                              rows={3}
                              autoFocus
                            />
                          ) : (
                            <button
                              type="button"
                              className={`udm-note-preview${!note ? ' udm-note-preview--empty' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                lastNoteTapRef.current = Date.now();
                                setNoteEditing(true);
                              }}
                            >
                              {note || 'Cliquez pour ajouter une note…'}
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {activeTab === 'activite' && (
                      <div className="udm-card">
                        <h3 className="udm-card-title">{t('profile.activities') || 'Activité'}</h3>
                        {spotifyEnabled ? (
                          <ProfileSpotifyActivity
                            userId={resolvedId}
                            initialTrack={user?.spotify_now_playing}
                            enabled={spotifyEnabled && isOpen}
                            className="udm-spotify-activity"
                            compact
                          />
                        ) : (
                          <p className="udm-empty-text">{t('profile.noActivities') || 'Aucune activité à afficher.'}</p>
                        )}
                      </div>
                  )}

                  {activeTab === 'serveurs' && !isOwnProfile && (
                      <div className="udm-card">
                        <h3 className="udm-card-title">{t('profile.mutualServers') || 'Serveurs en commun'}</h3>
                        {teamsLoading ? (
                          <div className="udm-teams-loading">
                            {[0, 1, 2].map(i => <div key={i} className="udm-team-skeleton" />)}
                          </div>
                        ) : commonTeams.length === 0 ? (
                          <p className="udm-empty-text">{t('profile.noMutualServers') || 'Aucun serveur en commun'}</p>
                        ) : (
                          <div className="udm-teams-list">
                            {commonTeams.map(team => (
                              <button
                                key={team.id}
                                type="button"
                                className="udm-team-item udm-team-item--clickable"
                                onClick={() => handleTeamClick(team)}
                              >
                                <div className="udm-team-icon">
                                  {team.avatar_url ? (
                                    <img src={getStaticUrl(team.avatar_url)} alt="" />
                                  ) : (
                                    <span>{team.name.slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="udm-team-info">
                                  <span className="udm-team-name">{team.name}</span>
                                  <span className="udm-team-meta">
                                    {team.member_count} membre{team.member_count !== 1 ? 's' : ''}
                                    {team.target_role && team.target_role !== 'member' && (
                                      <span className="udm-team-role">
                                        {team.target_role === 'owner' ? 'Propriétaire' : team.target_role === 'admin' ? 'Admin' : team.target_role}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <svg className="udm-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                  )}

                  {activeTab === 'amis' && !isOwnProfile && (
                      <div className="udm-card">
                        <h3 className="udm-card-title">{t('profile.mutualFriends') || 'Amis en commun'}</h3>
                        {friendsLoading ? (
                          <div className="udm-teams-loading">
                            {[0, 1, 2].map(i => <div key={i} className="udm-team-skeleton" />)}
                          </div>
                        ) : commonFriends.length === 0 ? (
                          <p className="udm-empty-text">{t('profile.noMutualFriends') || 'Aucun ami en commun'}</p>
                        ) : (
                          <div className="udm-friends-list">
                            {commonFriends.map(friend => (
                              <button
                                key={friend.id}
                                type="button"
                                className="udm-friend-item udm-friend-item--clickable"
                                onClick={() => handleFriendClick(friend)}
                              >
                                <div className="udm-friend-avatar">
                                  <Avatar user={friend} size="small" showPresence />
                                </div>
                                <div className="udm-friend-info">
                                  <span className="udm-friend-name">{friend.display_name || friend.username}</span>
                                  {friend.username && friend.display_name && (
                                    <span className="udm-friend-username">@{friend.username}</span>
                                  )}
                                </div>
                                <svg className="udm-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                  )}
                </div>
              ) : null}
            </div>
          </main>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
