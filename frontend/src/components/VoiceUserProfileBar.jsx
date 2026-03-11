import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { getStoredCustomStatus } from '../utils/presenceStorage';
import './VoiceUserProfileBar.css';

/**
 * Barre de profil style Discord - en bas à gauche du live / zone principale
 * Avatar, nom, statut, mic (mute), headphones (deafen), paramètres
 */
const VoiceUserProfileBar = memo(function VoiceUserProfileBar({ compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    voiceChannelId,
    voiceChannelName,
    voiceConversationId,
    voiceConversationName,
    isMuted,
    isDeafened,
    isScreenSharing,
    toggleMute,
    toggleDeafen,
    startScreenShare,
    stopScreenShare,
    leaveVoice,
    leaveVoiceDM,
  } = useVoice();
  const isInVoice = voiceChannelId || voiceConversationId;
  const displayName = voiceChannelId ? (voiceChannelName || 'Voice') : (voiceConversationName || 'DM');

  const handleDisconnect = () => {
    if (voiceChannelId) leaveVoice();
    else leaveVoiceDM();
  };

  const customStatus = getStoredCustomStatus(user?.id);

  if (!user || !isInVoice) return null;

  return (
    <div className={`voice-user-profile-bar ${compact ? 'compact' : ''}`}>
      <div className="vupb-avatar-wrap">
        {user.avatar_url ? (
          <AvatarImg src={user.avatar_url} alt={user.display_name} className="vupb-avatar" />
        ) : (
          <span className="vupb-avatar-fallback">
            {(user.display_name || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <span className="vupb-presence-dot" />
      </div>
      <div className="vupb-info">
        <span className="vupb-username" title={user.display_name}>
          {user.display_name || 'User'}
        </span>
        <span className="vupb-status">
          {customStatus ? (
            <><span className="vupb-status-icon">🎵</span> {customStatus}</>
          ) : (
            displayName
          )}
        </span>
      </div>
      <div className="vupb-controls">
        <div className="vupb-ctrl-wrap">
          <button
            className={`vupb-btn ${isMuted ? 'active danger' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            )}
          </button>
        </div>
        <div className="vupb-ctrl-wrap">
          <button
            className={`vupb-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
                <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
              </svg>
            )}
          </button>
        </div>
        {voiceChannelId && (
          <button
            className={`vupb-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V8h4V4h2v4h4v2z"/>
            </svg>
          </button>
        )}
        <button
          className="vupb-btn disconnect"
          onClick={handleDisconnect}
          title="Déconnecter"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
          </svg>
        </button>
        <button
          className="vupb-btn"
          onClick={() => navigate('/settings')}
          title="Paramètres"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>
    </div>
  );
});

export default VoiceUserProfileBar;
