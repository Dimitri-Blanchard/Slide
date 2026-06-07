import React, { memo } from 'react';
import { useSettingsUi } from '../context/SettingsUiContext';
import { AvatarImg } from './Avatar';
import { useAuth } from '../context/AuthContext';
import { useVoice } from '../context/VoiceContext';
import { getStoredCustomStatus } from '../utils/presenceStorage';
import AppIcon from './icons/AppIcon';
import './VoiceUserProfileBar.css';

/**
 * Barre de profil style Discord - en bas à gauche du live / zone principale
 * Avatar, nom, statut, mic (mute), headphones (deafen), paramètres
 */
const VoiceUserProfileBar = memo(function VoiceUserProfileBar({ compact = false }) {
  const { user } = useAuth();
  const { openSettings } = useSettingsUi();
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
            data-voice-mute-trigger
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            <AppIcon name={isMuted ? 'micOff' : 'mic'} size={20} />
          </button>
        </div>
        <div className="vupb-ctrl-wrap">
          <button
            className={`vupb-btn ${isDeafened ? 'active danger' : ''}`}
            onClick={toggleDeafen}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            <AppIcon name={isDeafened ? 'deafenOff' : 'deafen'} size={20} />
          </button>
        </div>
        {voiceChannelId && (
          <button
            className={`vupb-btn ${isScreenSharing ? 'active' : ''}`}
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
            title={isScreenSharing ? 'Arrêter le partage' : 'Partager l\'écran'}
          >
            <AppIcon name="screenShare" size={20} />
          </button>
        )}
        <button
          className="vupb-btn disconnect"
          onClick={handleDisconnect}
          title="Déconnecter"
        >
          <AppIcon name="phoneOff" size={20} />
        </button>
        <button
          className="vupb-btn"
          onClick={() => openSettings()}
          title="Paramètres"
        >
          <AppIcon name="settings" size={20} />
        </button>
      </div>
    </div>
  );
});

export default VoiceUserProfileBar;
