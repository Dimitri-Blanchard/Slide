import React, { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { servers } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import './InviteLinkPreview.css';

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [
    /\/invite\/([A-Za-z0-9]{6,20})/,
    /^([A-Za-z0-9]{8})$/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function containsInviteLink(text) {
  return extractInviteCode(text) !== null;
}

const inviteCache = new Map();

const InviteLinkPreview = memo(function InviteLinkPreview({ url, onJoined }) {
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const code = extractInviteCode(url);

  const isMember = inviteInfo?.is_member || joined;
  
  useEffect(() => {
    if (!code) {
      setLoading(false);
      setError('Invalid invite');
      return;
    }
    
    if (inviteCache.has(code)) {
      setInviteInfo(inviteCache.get(code));
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    servers.getInviteInfo(code)
      .then(info => {
        inviteCache.set(code, info);
        setInviteInfo(info);
      })
      .catch(err => {
        setError(err.message || 'Invalid invite');
      })
      .finally(() => setLoading(false));
  }, [code]);
  
  const handleJoin = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isMember && inviteInfo?.team?.id) {
      navigate(`/team/${inviteInfo.team.id}`);
      return;
    }
    
    if (!user) {
      navigate(`/login?redirect=/invite/${code}`);
      return;
    }
    
    if (!code || joining) return;
    
    setJoining(true);
    try {
      const result = await servers.joinWithInvite(code);
      setJoined(true);

      if (inviteCache.has(code)) {
        inviteCache.set(code, { ...inviteCache.get(code), is_member: true });
      }
      
      localStorage.removeItem('slide_teams_cache');
      
      if (onJoined) {
        onJoined(result.team_id, inviteInfo?.team);
      } else {
        navigate(`/team/${result.team_id}`);
      }
    } catch (err) {
      if (err.message?.includes('already_member') || err.response?.data?.already_member) {
        setJoined(true);
      } else {
        setError(err.message || 'Failed to join');
      }
    }
    setJoining(false);
  }, [code, user, joining, isMember, navigate, onJoined, inviteInfo]);

  const handleCopyLink = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const inviteUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  const formattedDate = useMemo(() => {
    if (!inviteInfo?.team?.created_at) return null;
    const date = new Date(inviteInfo.team.created_at);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
  }, [inviteInfo?.team?.created_at]);
  
  if (!code) return null;
  
  if (loading) {
    return (
      <div className="invite-embed invite-embed--loading">
        <div className="invite-embed__spinner" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="invite-embed invite-embed--error">
        <svg className="invite-embed__error-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <span className="invite-embed__error-text">{t('invite.invalid') || 'Invitation invalide ou expirée'}</span>
      </div>
    );
  }
  
  if (!inviteInfo) return null;
  
  const team = inviteInfo.team;
  
  const inviteUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;

  return (
    <div className="invite-embed" onClick={(e) => e.stopPropagation()}>
      <div className="invite-embed__header">
        {isMember
          ? (t('invite.alreadyMember') || "Tu es déjà membre de ce serveur")
          : (t('invite.youAreInvited') || "You've been invited to join a server")}
      </div>

      <div className="invite-embed__server">
        <div className="invite-embed__icon">
          {team.avatar_url ? (
            <AvatarImg src={team.avatar_url} alt={team.name} />
          ) : (
            <span className="invite-embed__icon-letter">
              {team.name?.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        
        <div className="invite-embed__details">
          <div className="invite-embed__name">{team.name}</div>
          
          <div className="invite-embed__meta">
            <span className="invite-embed__meta-item">
              <span className="invite-embed__dot invite-embed__dot--online" />
              {team.online_count || 0} {t('invite.online') || 'Online'}
            </span>
            <span className="invite-embed__meta-sep" />
            <span className="invite-embed__meta-item">
              <span className="invite-embed__dot invite-embed__dot--members" />
              {team.member_count || 0} {t('invite.members') || 'Members'}
            </span>
          </div>

          {formattedDate && (
            <div className="invite-embed__established">
              {t('invite.established') || 'Est.'} {formattedDate}
            </div>
          )}
        </div>

        <button 
          className={`invite-embed__btn ${isMember ? 'invite-embed__btn--member' : ''}`}
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? (
            <span className="invite-embed__btn-spinner" />
          ) : isMember ? (
            t('invite.goToServer') || 'Go to Server'
          ) : (
            t('invite.join') || 'Join'
          )}
        </button>
      </div>

      <div className="invite-embed__link-row">
        <span className="invite-embed__link-url">{inviteUrl}</span>
        <button className="invite-embed__link-copy" onClick={handleCopyLink}>
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});

export default InviteLinkPreview;
