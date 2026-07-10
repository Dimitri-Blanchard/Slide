import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  users as usersApi,
  friends as friendsApi,
  teams as teamsApi,
  servers,
  direct as directApi,
} from '../api';
import { notifyFriendsChanged } from '../utils/friendsSync';
import { serverPath } from '../utils/appRoutes';
import { getProfile, getCachedProfile } from '../utils/profileCache';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useSettings } from '../context/SettingsContext';
import { useOnlineUsers } from '../context/SocketContext';
import { canShowProfileActivities } from '../utils/profileActivities';
import { getStaticUrl } from '../utils/staticUrl';
import { invitePublicUrl } from '../utils/publicSiteUrl';
import { harmonizeGradientColors } from '../utils/gradientColors';
import Avatar, { hasDefaultAvatar } from './Avatar';
import ProfileSpotifyActivity from './ProfileSpotifyActivity';
import ReportModal from './ReportModal';
import { useRightPanelWidth } from '../hooks/useRightPanelWidth';
import './DMProfileSidebar.css';

function isGifUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /\.gif(?:$|[?#])/i.test(url) || /format=gif/i.test(url);
}

function stripInvisible(value) {
  return String(value || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function normalizeHandle(value) {
  return stripInvisible(value)
    .replace(/(\s+|#)0*\s*$/, '')
    .replace(/(?<![0-9])0\s*$/, '')
    .replace(/([^\d])0+\s*$/, '$1')
    .trim();
}

function normalizeDisplayName(value, username) {
  const base = stripInvisible(value)
    .trim()
    .replace(/\s*#\s*0+\s*$/i, '')
    .replace(/([^\d])0+\s*$/, '$1');
  const normalizedHandle = normalizeHandle(username);
  if (normalizedHandle && new RegExp(`^${normalizedHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*0+$`, 'i').test(base)) {
    return normalizedHandle;
  }
  return base.replace(/0+\s*$/, '').trim();
}

const DMProfileSidebar = memo(function DMProfileSidebar({
  userId,
  user: providedUser,
  onViewFullProfile,
}) {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { developerMode, settings: appSettings } = useSettings();

  const resolvedId = userId || providedUser?.id;
  const cached = resolvedId ? getCachedProfile(resolvedId) : null;
  const [user, setUser] = useState(() => {
    if (providedUser && String(providedUser.id) === String(resolvedId)) return cached || providedUser;
    return cached || null;
  });
  const [loading, setLoading] = useState(() => !cached);
  const [commonTeams, setCommonTeams] = useState([]);
  const [commonFriends, setCommonFriends] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [inviteTeams, setInviteTeams] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteMenuOpen, setInviteMenuOpen] = useState(false);
  const [serversExpanded, setServersExpanded] = useState(false);
  const [friendsExpanded, setFriendsExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const menuRef = useRef(null);
  const { width, handleResizeStart } = useRightPanelWidth();
  const isOwnProfile = currentUser?.id === resolvedId;

  useLayoutEffect(() => {
    if (!resolvedId) {
      setUser(null);
      setLoading(false);
      return;
    }
    const cachedNow = getCachedProfile(resolvedId);
    const partial = providedUser && String(providedUser.id) === String(resolvedId) ? providedUser : null;
    setUser(cachedNow || partial);
    setLoading(!cachedNow);
    setCommonTeams([]);
    setCommonFriends([]);
    setMenuOpen(false);
    setInviteMenuOpen(false);
    setServersExpanded(false);
    setFriendsExpanded(false);
  }, [resolvedId, providedUser?.id]);

  useEffect(() => {
    if (!resolvedId) return;
    if (getCachedProfile(resolvedId)) return;
    let cancelled = false;
    getProfile(resolvedId)
      .then((d) => {
        if (!cancelled) {
          setUser(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [resolvedId]);

  useEffect(() => {
    if (!resolvedId || isOwnProfile) return;
    setTeamsLoading(true);
    setFriendsLoading(true);
    usersApi.getCommonTeams(resolvedId)
      .then((data) => {
        const teams = Array.isArray(data) ? data : [];
        setCommonTeams(teams);
        setServersExpanded(teams.length > 0);
        setTeamsLoading(false);
      })
      .catch(() => { setCommonTeams([]); setServersExpanded(false); setTeamsLoading(false); });
    usersApi.getCommonFriends(resolvedId)
      .then((data) => {
        const friends = Array.isArray(data) ? data : [];
        setCommonFriends(friends);
        setFriendsExpanded(friends.length > 0);
        setFriendsLoading(false);
      })
      .catch(() => { setCommonFriends([]); setFriendsExpanded(false); setFriendsLoading(false); });
    teamsApi.list()
      .then((list) => setInviteTeams(Array.isArray(list) ? list : []))
      .catch(() => setInviteTeams([]));
  }, [resolvedId, isOwnProfile]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setInviteMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const handleCopyId = useCallback(async () => {
    await navigator.clipboard.writeText(String(resolvedId)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setMenuOpen(false);
    setInviteMenuOpen(false);
  }, [resolvedId]);

  const handleBlock = useCallback(async () => {
    if (!resolvedId || isOwnProfile) return;
    setMenuOpen(false);
    setInviteMenuOpen(false);
    try {
      await friendsApi.block(resolvedId);
      notifyFriendsChanged({ userId: resolvedId, action: 'blocked' });
      notify.success(t('friends.userBlocked') || t('friends.blocked') || 'User blocked');
    } catch (err) {
      notify.error(err.message);
    }
  }, [resolvedId, isOwnProfile, notify, t]);

  const handleInviteToServer = useCallback(async (targetTeam) => {
    if (!resolvedId || !targetTeam?.id) return;
    setMenuOpen(false);
    setInviteMenuOpen(false);
    try {
      const invite = await servers.createInvite(targetTeam.id, { maxUses: 1 });
      const code = invite?.code || invite?.invite_code;
      if (!code) throw new Error('Invite failed');
      const conv = await directApi.createConversation(resolvedId);
      const convId = conv?.conversation_id ?? conv?.id;
      if (!convId) throw new Error('Failed to start conversation');
      await directApi.sendMessage(convId, invitePublicUrl(code), 'text');
      notify.success(
        (t('invite.sentTo') || 'Invite sent to {name}').replace(
          '{name}',
          user?.display_name || user?.username || ''
        )
      );
    } catch (err) {
      notify.error(err?.message || (t('invite.sendError') || 'Failed to send invite'));
    }
  }, [resolvedId, user?.display_name, user?.username, notify, t]);

  const handleTeamClick = useCallback((team) => {
    if (!team?.id) return;
    navigate(serverPath(team.id));
  }, [navigate]);

  const handleFriendClick = useCallback(async (friend) => {
    if (!friend?.id) return;
    try {
      const conv = await directApi.createConversation(parseInt(friend.id, 10));
      navigate(`/channels/@me/${conv.conversation_id ?? conv.id}`);
    } catch (err) {
      notify.error(err?.message || (t('errors.generic') || 'Une erreur est survenue'));
    }
  }, [navigate, notify, t]);

  if (!resolvedId) return null;

  const username = user?.username || user?.email?.split('@')[0] || null;
  const finalUsername = username ? normalizeHandle(username) : null;
  const displayName = normalizeDisplayName(user?.display_name, finalUsername)
    || finalUsername
    || t('chat.user');

  const aboutMe = user?.about_me || user?.bio;
  const joinDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  const bannerColor = user?.banner_color || '#4f6ef7';
  const bannerColor2 = user?.banner_color_2;
  const bannerUrl = !loading && user?.banner_url ? getStaticUrl(user.banner_url) : null;
  const hasGifBanner = isGifUrl(user?.banner_url || bannerUrl);
  const hasDualBanner = !!bannerColor2;
  const [c1, c2] = hasDualBanner ? harmonizeGradientColors(bannerColor, bannerColor2 || '#000') : [bannerColor, '#000'];
  const verticalGrad = (a, b) => `linear-gradient(180deg, ${a} 0%, ${a} 12%, ${b} 88%, ${b} 100%)`;
  const bannerStyle = bannerUrl
    ? (hasGifBanner
        ? { backgroundColor: c1 }
        : { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: `center ${user?.banner_position || 'center'}` })
    : hasDualBanner
      ? { backgroundImage: verticalGrad(c1, c2) }
      : { backgroundColor: c1 };

  const mutualServersCount = commonTeams.length || user?.common_teams || 0;
  const mutualFriendsCount = commonFriends.length || user?.common_friends || 0;
  const inviteableTeams = inviteTeams.filter((srv) => srv?.id != null);
  const { isUserOnline } = useOnlineUsers();
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

  return (
    <>
      <aside
        className={`dm-profile-sidebar${menuOpen ? ' dps-menu-open' : ''}`}
        style={{ width, minWidth: width }}
        aria-label={t('profile.viewFullProfile') || 'User profile'}
      >
        <div
          className="dps-resize-edge"
          onMouseDown={handleResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('dmHeader.resizeProfile') || 'Resize profile panel'}
        />
        <div className="dps-scroll">
          <div className="dps-header">
            <div
              className={`dps-banner${loading ? ' dps-banner--skeleton' : ''}${bannerUrl ? ' dps-banner--image' : ''}`}
              style={loading ? undefined : bannerStyle}
              aria-hidden="true"
            >
              {bannerUrl && hasGifBanner && (
                <img className="dps-banner-img" src={bannerUrl} alt="" draggable={false} />
              )}
              {!isOwnProfile && (
                <div className="dps-menu-wrap" ref={menuRef}>
                  <button
                    type="button"
                    className="dps-menu-btn"
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label={t('profile.moreActions')}
                    aria-expanded={menuOpen}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="12" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                    </svg>
                  </button>
                  {menuOpen && (
                    <div className="dps-dropdown" role="menu">
                      {inviteableTeams.length > 0 && (
                        <div
                          className="dps-dropdown-item dps-dropdown-item--submenu"
                          onMouseEnter={() => setInviteMenuOpen(true)}
                          onMouseLeave={() => setInviteMenuOpen(false)}
                        >
                          <button type="button" role="menuitem" className="dps-dropdown-trigger">
                            <span>{t('invite.inviteToServer') || 'Invite to Server'}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                          {inviteMenuOpen && (
                            <div className="dps-submenu" role="menu">
                              {inviteableTeams.map((srv) => (
                                <button
                                  key={srv.id}
                                  type="button"
                                  role="menuitem"
                                  className="dps-submenu-item"
                                  onClick={() => handleInviteToServer(srv)}
                                >
                                  <span className="dps-submenu-icon">
                                    {srv.avatar_url ? (
                                      <img src={getStaticUrl(srv.avatar_url)} alt="" />
                                    ) : (
                                      <span>{(srv.name || '?').slice(0, 2).toUpperCase()}</span>
                                    )}
                                  </span>
                                  <span className="dps-submenu-label">{srv.name || `Server ${srv.id}`}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button type="button" role="menuitem" className="dps-dropdown-item" onClick={handleBlock}>
                        {t('friends.block') || 'Block'}
                      </button>
                      <button type="button" role="menuitem" className="dps-dropdown-item" onClick={() => { setMenuOpen(false); setReportOpen(true); }}>
                        {t('chat.report') || 'Report'}
                      </button>
                      {developerMode && (
                        <button type="button" role="menuitem" className="dps-dropdown-item" onClick={handleCopyId}>
                          {copied ? (t('common.copied') || 'Copied!') : (t('common.copyUserId') || 'Copy User ID')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dps-avatar-row">
              <div className="dps-avatar-wrap">
                {user ? (
                  <Avatar user={user} size="xlarge" gifAnimate showPresence />
                ) : (
                  <div className="dps-avatar-skeleton" />
                )}
              </div>
            </div>
          </div>

          <div className="dps-body">
            {user ? (
              <>
                <div className="dps-identity">
                  <h2 className="dps-displayname">
                    {displayName}
                    {!loading && Boolean(user.is_webhook) && <span className="dps-badge dps-badge--bot">APP</span>}
                    {!loading && Boolean(user.has_nitro) && <span className="dps-badge dps-badge--nitro">Nitro</span>}
                  </h2>
                  {finalUsername && (
                    <div className="dps-username-row">
                      <span className="dps-username">@{finalUsername}</span>
                    </div>
                  )}
                </div>

                {spotifyEnabled && (
                  <ProfileSpotifyActivity
                    userId={resolvedId}
                    initialTrack={user.spotify_now_playing}
                    enabled={spotifyEnabled}
                    compact
                  />
                )}

                {(aboutMe || joinDate) && (
                  <div className="dps-info-card">
                    {aboutMe && (
                      <div className="dps-info-section">
                        <h3 className="dps-info-label">{t('profile.aboutMe') || 'Bio'}</h3>
                        <p className="dps-info-value">{aboutMe}</p>
                      </div>
                    )}
                    {joinDate && (
                      <div className="dps-info-section">
                        <h3 className="dps-info-label">{t('profile.memberSince') || 'Member Since'}</h3>
                        <p className="dps-info-value">{joinDate}</p>
                      </div>
                    )}
                  </div>
                )}

                {!isOwnProfile && (
                  <>
                    <div className={`dps-accordion-group${serversExpanded ? ' dps-accordion-group--open' : ''}`}>
                      <button
                        type="button"
                        className="dps-accordion"
                        onClick={() => setServersExpanded((v) => !v)}
                        aria-expanded={serversExpanded}
                      >
                        <span className="dps-accordion-label">
                          {t('profile.mutualServers') || 'Mutual Servers'}
                        </span>
                        <span className="dps-accordion-trail">
                          {(teamsLoading || mutualServersCount > 0) && (
                            <span className="dps-accordion-count">
                              {teamsLoading ? '…' : mutualServersCount}
                            </span>
                          )}
                          <svg className="dps-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </button>
                      <div className="dps-accordion-panel-wrap" aria-hidden={!serversExpanded}>
                        <div className="dps-accordion-panel">
                          {teamsLoading ? (
                            <div className="dps-list-loading">
                              {[0, 1, 2].map((i) => <div key={i} className="dps-list-skeleton" />)}
                            </div>
                          ) : commonTeams.length === 0 ? (
                            <p className="dps-empty-text">{t('profile.noMutualServers') || 'No mutual servers'}</p>
                          ) : (
                            commonTeams.map((team) => (
                              <button
                                key={team.id}
                                type="button"
                                className="dps-list-item dps-list-item--clickable"
                                onClick={() => handleTeamClick(team)}
                              >
                                <div className="dps-list-icon dps-list-icon--square">
                                  {team.avatar_url && !hasDefaultAvatar({ avatar_url: team.avatar_url }) ? (
                                    <img src={getStaticUrl(team.avatar_url)} alt="" />
                                  ) : (
                                    <span>{(team.name || '?').slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="dps-list-info">
                                  <span className="dps-list-name">{team.name}</span>
                                  {team.member_count != null && (
                                    <span className="dps-list-meta">
                                      {team.member_count} {team.member_count === 1 ? 'member' : 'members'}
                                    </span>
                                  )}
                                </div>
                                <svg className="dps-list-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`dps-accordion-group${friendsExpanded ? ' dps-accordion-group--open' : ''}`}>
                      <button
                        type="button"
                        className="dps-accordion"
                        onClick={() => setFriendsExpanded((v) => !v)}
                        aria-expanded={friendsExpanded}
                      >
                        <span className="dps-accordion-label">
                          {t('profile.mutualFriends') || 'Mutual Friends'}
                        </span>
                        <span className="dps-accordion-trail">
                          {(friendsLoading || mutualFriendsCount > 0) && (
                            <span className="dps-accordion-count">
                              {friendsLoading ? '…' : mutualFriendsCount}
                            </span>
                          )}
                          <svg className="dps-accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </span>
                      </button>
                      <div className="dps-accordion-panel-wrap" aria-hidden={!friendsExpanded}>
                        <div className="dps-accordion-panel">
                          {friendsLoading ? (
                            <div className="dps-list-loading">
                              {[0, 1, 2].map((i) => <div key={i} className="dps-list-skeleton" />)}
                            </div>
                          ) : commonFriends.length === 0 ? (
                            <p className="dps-empty-text">{t('profile.noMutualFriends') || 'No mutual friends'}</p>
                          ) : (
                            commonFriends.map((friend) => (
                              <button
                                key={friend.id}
                                type="button"
                                className="dps-list-item dps-list-item--clickable"
                                onClick={() => handleFriendClick(friend)}
                              >
                                <div className="dps-list-icon">
                                  <Avatar user={friend} size="small" showPresence />
                                </div>
                                <div className="dps-list-info">
                                  <span className="dps-list-name">{friend.display_name || friend.username}</span>
                                  {friend.username && friend.display_name && (
                                    <span className="dps-list-meta">@{friend.username}</span>
                                  )}
                                </div>
                                <svg className="dps-list-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="dps-skeleton">
                <div className="dps-skeleton-line dps-skeleton-line--name" />
                <div className="dps-skeleton-line dps-skeleton-line--tag" />
              </div>
            )}
          </div>
        </div>

        {!isOwnProfile && onViewFullProfile && (
          <button type="button" className="dps-footer" onClick={onViewFullProfile}>
            {t('profile.viewFullProfileLink') || 'View Full Profile'}
          </button>
        )}
      </aside>

      {reportOpen && (
        <ReportModal
          reportedUserId={resolvedId}
          reportedUsername={displayName}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
});

export default DMProfileSidebar;
