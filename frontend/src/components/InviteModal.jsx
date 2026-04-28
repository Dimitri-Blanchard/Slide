import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { servers, friends as friendsApi, direct as directApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './InviteModal.css';

export default function InviteModal({ isOpen, onClose, initialCode = '', onServerJoined, onBack, exiting }) {
  const [code, setCode] = useState(initialCode);
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const enterInstant = useModalEnterAnimation('invite-modal', isOpen);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode);
      lookupInvite(initialCode);
    }
  }, [initialCode]);

  const lookupInvite = async (inviteCode) => {
    if (!inviteCode || inviteCode.length < 4) return;
    
    setLoading(true);
    setError('');
    setInviteInfo(null);
    
    try {
      // Extract code from URL if full URL is pasted
      let cleanCode = inviteCode;
      if (inviteCode.includes('/')) {
        const parts = inviteCode.split('/');
        cleanCode = parts[parts.length - 1];
      }
      
      const info = await servers.getInviteInfo(cleanCode);
      setInviteInfo(info);
      setCode(cleanCode);
    } catch (err) {
      setError(err.message || 'Invitation invalide ou expirée');
    }
    setLoading(false);
  };

  const handleJoin = async () => {
    if (!inviteInfo) return;
    
    setJoining(true);
    setError('');
    
    try {
      const result = await servers.joinWithInvite(code);
      
      // Add the new server to the list immediately (no refresh needed)
      if (onServerJoined) {
        const newTeam = {
          id: result.team_id,
          name: inviteInfo.team_name || inviteInfo.team?.name,
          avatar_url: inviteInfo.icon_url || inviteInfo.team?.avatar_url,
          unread_count: 0,
          mention_count: 0,
          has_unread: false
        };
        onServerJoined(newTeam);
      }
      
      onClose();
      navigate(`/team/${result.team_id}`);
    } catch (err) {
      setError(err.message || 'Impossible de rejoindre le serveur');
    }
    setJoining(false);
  };

  const handleCodeChange = (e) => {
    const value = e.target.value;
    setCode(value);
    setError('');
    setInviteInfo(null);
    
    // Auto-lookup when code looks complete
    if (value.length >= 8 || value.includes('/')) {
      lookupInvite(value);
    }
  };

  const handlePaste = (e) => {
    setTimeout(() => {
      lookupInvite(e.target.value);
    }, 0);
  };

  if (!isOpen) return null;

  const handleOverlayClick = () => {
    if (!exiting) onClose();
  };

  const modal = (
    <div className={`invite-modal-overlay ${exiting ? 'invite-exiting' : ''}${enterInstant && !exiting ? ' modal-enter-instant' : ''}`} onClick={handleOverlayClick}>
      <div className={`invite-modal ${exiting ? 'invite-exiting' : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2>Rejoindre un serveur</h2>
        <p className="invite-subtitle">
          Entrez un lien d'invitation ci-dessous pour rejoindre un serveur existant
        </p>
        
        <div className="invite-input-group">
          <label>Lien d'invitation</label>
          <input
            type="text"
            value={code}
            onChange={handleCodeChange}
            onPaste={handlePaste}
            placeholder="https://slide.app/invite/abc123 ou abc123"
            autoFocus
          />
          <span className="invite-hint">
            Les invitations ressemblent à : https://slide.app/invite/abc123
          </span>
        </div>

        {loading && (
          <div className="invite-loading">
            <div className="loading-spinner" />
            <span>Vérification de l'invitation...</span>
          </div>
        )}

        {error && (
          <div className="invite-error">
            {error}
          </div>
        )}

        {inviteInfo && !loading && (
          <div className="invite-preview">
            <div className="invite-server-icon">
              {inviteInfo.icon_url ? (
                <AvatarImg src={inviteInfo.icon_url} alt={inviteInfo.team_name} />
              ) : (
                <span>{inviteInfo.team_name?.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="invite-server-info">
              <h3>{inviteInfo.team_name}</h3>
              <span className="invite-member-count">
                {inviteInfo.member_count || 0} membre{inviteInfo.member_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}

        <div className="invite-actions">
          <button className="cancel-btn" onClick={onBack || onClose}>
            Retour
          </button>
          <button 
            className="join-btn" 
            onClick={handleJoin}
            disabled={!inviteInfo || joining}
          >
            {joining ? 'Connexion...' : 'Rejoindre le serveur'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Quick invite share modal - Discord-style: auto-creates link on open, friend list, copy link
export function ShareInviteModal({ isOpen, onClose, team, channels = [] }) {
  const [activeInvite, setActiveInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendingFriendId, setSendingFriendId] = useState(null);
  const [sentFriendId, setSentFriendId] = useState(null);
  const { t } = useLanguage();
  const { notify } = useNotification();
  const enterInstant = useModalEnterAnimation('share-invite-modal', isOpen);

  // Get default channel name (first text channel)
  const defaultChannelName = (channels || []).find(c => c?.channel_type === 'text')?.name || 'general';

  useEffect(() => {
    if (!isOpen || !team) return;
    setLoading(true);
    setActiveInvite(null);
    setSearchQuery('');
    setSentFriendId(null);
    const ensureInvite = async () => {
      try {
        const data = await servers.getInvites(team.id);
        const invites = data || [];
        const valid = invites.find(i => !i.expires_at || new Date(i.expires_at) > new Date());
        if (valid) {
          setActiveInvite(valid);
        } else {
          const created = await servers.createInvite(team.id, { maxAgeHours: 168 });
          setActiveInvite(created);
        }
      } catch (err) {
        // Some roles can create invites but cannot list all server invites.
        if (err?.status === 403) {
          try {
            const created = await servers.createInvite(team.id, { maxAgeHours: 168 });
            setActiveInvite(created);
          } catch (createErr) {
            console.error(createErr);
            notify.error(createErr?.message || (t('invite.createError') || 'Failed to generate invite link'));
          }
        } else {
          console.error(err);
          notify.error(err?.message || (t('invite.loadError') || 'Failed to load invite link'));
        }
      }
      setLoading(false);
    };
    ensureInvite();
  }, [isOpen, team?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setFriendsLoading(true);
    friendsApi.list()
      .then(list => setFriends(list || []))
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  }, [isOpen]);

  const filteredFriends = searchQuery.trim()
    ? friends.filter(f =>
        (f.display_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (f.username || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends;

  const copyInvite = async (code) => {
    const text = `${window.location.origin}/invite/${code}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      notify.error(t('invite.copyFailed') || 'Copy failed. Please copy manually: ' + text);
    }
  };

  const handleInviteFriend = async (friend) => {
    if (!activeInvite) return;
    setSendingFriendId(friend.id);
    try {
      const conv = await directApi.createConversation(friend.id);
      const convId = conv?.conversation_id ?? conv?.id;
      if (!convId) throw new Error('Failed to start conversation');
      const inviteUrl = `${window.location.origin}/invite/${activeInvite.code}`;
      await directApi.sendMessage(convId, inviteUrl, 'text');
      setSentFriendId(friend.id);
      notify.success(t('invite.sentTo', { name: friend.display_name || friend.username || 'friend' }) || `Invite sent to ${friend.display_name || friend.username || 'friend'}`);
      setTimeout(() => setSentFriendId(null), 2000);
    } catch (err) {
      console.error('Failed to send invite:', err);
      notify.error(err?.message || (t('invite.sendError') || 'Failed to send invite'));
    } finally {
      setSendingFriendId(null);
    }
  };

  if (!isOpen || !team) return null;

  const inviteUrl = activeInvite ? `${window.location.origin}/invite/${activeInvite.code}` : '';

  const modal = (
    <div className={`invite-modal-overlay${enterInstant ? ' modal-enter-instant' : ''}`} onClick={onClose}>
      <div className="invite-modal share-invite-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-invite-header">
          <div className="share-invite-title-wrap">
            <h2>{t('invite.inviteFriendsTo') || 'Invite friends to'} {team.name}</h2>
            <p className="share-invite-subtitle">
              {t('invite.recipientsLandIn') || 'Recipients will land in'} #{defaultChannelName}
            </p>
          </div>
          <button className="share-invite-close" onClick={onClose} aria-label={t('common.close') || 'Close'}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
          </button>
        </div>

        <div className="share-invite-search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="share-invite-search-icon">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            type="text"
            placeholder={t('invite.searchFriends') || 'Search for friends'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="share-invite-friends">
          {friendsLoading ? (
            <div className="share-invite-loading">
              <div className="loading-spinner" />
              <span>{t('common.loading') || 'Loading...'}</span>
            </div>
          ) : filteredFriends.length === 0 ? (
            <p className="share-invite-empty">{t('invite.noFriendsToInvite') || 'No friends to invite'}</p>
          ) : (
            <div className="share-invite-friend-list">
              {filteredFriends.map(friend => (
                <div key={friend.id} className="share-invite-friend-row">
                  <div className="share-invite-friend-avatar">
                    {friend.avatar_url ? (
                      <AvatarImg src={friend.avatar_url} alt="" />
                    ) : (
                      <span>{(friend.display_name || friend.username || '?').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="share-invite-friend-info">
                    <span className="share-invite-friend-name">{friend.display_name || friend.username || 'Unknown'}</span>
                    {friend.username && (
                      <span className="share-invite-friend-username">.{friend.username}</span>
                    )}
                  </div>
                  <button
                    className={`share-invite-friend-invite-btn ${sentFriendId === friend.id ? 'sent' : ''}`}
                    onClick={() => handleInviteFriend(friend)}
                    disabled={!activeInvite || loading || !!sendingFriendId}
                  >
                    {sendingFriendId === friend.id
                      ? (t('invite.sending') || 'Sending...')
                      : sentFriendId === friend.id
                        ? (t('invite.sent') || 'Sent!')
                        : (t('invite.invite') || 'Invite')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="share-invite-divider">
          <span>{t('invite.orSendLink') || 'Or, send a server invite link to a friend'}</span>
        </div>

        {loading ? (
          <div className="share-invite-link-loading">
            <div className="loading-spinner" />
            <span>{t('invite.generatingLink') || 'Generating invite link...'}</span>
          </div>
        ) : (
          <div className="share-invite-link-section">
            <div className="share-invite-link-row">
              <input type="text" value={inviteUrl} readOnly />
              <button
                className={`share-invite-copy-btn ${copied ? 'copied' : ''}`}
                onClick={() => copyInvite(activeInvite?.code)}
                disabled={!activeInvite}
              >
                {copied ? (t('invite.copied') || 'Copied!') : (t('invite.copy') || 'Copy')}
              </button>
            </div>
            <p className="share-invite-expiry">
              {activeInvite?.expires_at
                ? (t('invite.linkExpiresIn') || 'Your invite link expires in 7 days.')
                : (t('invite.linkNeverExpires') || 'Your invite link never expires.')}
              {' '}
              <span className="share-invite-edit-link">{t('invite.editInviteLink') || 'Edit invite link'}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
