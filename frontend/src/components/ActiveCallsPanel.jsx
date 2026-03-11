import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import Avatar from './Avatar';
import './ActiveCallsPanel.css';

/**
 * Always-visible panel showing people in voice/calls:
 * - Incoming call (someone waiting for you in DM/group)
 * - Voice channels with participants (across all servers)
 */
const ActiveCallsPanel = memo(function ActiveCallsPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const {
    incomingCall,
    voiceUsers,
    voiceChannelMeta,
    voiceChannelId,
    voiceConversationId,
    joinVoiceDM,
    rejectIncomingCall,
  } = useVoice();

  const hasIncomingCall = !!incomingCall;
  const dmKey = (id) => `dm_${id}`;

  // Voice channels (numeric keys) with participants, excluding the one we're in
  const activeVoiceChannels = React.useMemo(() => {
    const entries = [];
    for (const [key, users] of Object.entries(voiceUsers)) {
      if (typeof key === 'string' && key.startsWith('dm_')) continue; // Skip DM keys
      const channelId = parseInt(key, 10);
      if (Number.isNaN(channelId) || !users?.length) continue;
      if (voiceChannelId === channelId) continue; // We're in this channel
      const meta = voiceChannelMeta[channelId];
      const names = (users || [])
        .filter((u) => u.id !== user?.id)
        .map((u) => u.display_name || 'User')
        .slice(0, 3);
      if (names.length === 0) continue;
      entries.push({
        channelId,
        teamId: meta?.teamId,
        channelName: meta?.channelName || 'Voice',
        teamName: meta?.teamName || 'Server',
        users,
        names,
      });
    }
    return entries;
  }, [voiceUsers, voiceChannelMeta, voiceChannelId, user?.id]);

  const hasContent = hasIncomingCall || activeVoiceChannels.length > 0;
  if (!hasContent) return null;

  const handleAcceptCall = () => {
    if (incomingCall) {
      navigate(`/channels/@me/${incomingCall.conversationId}`);
      joinVoiceDM(incomingCall.conversationId, incomingCall.caller?.display_name);
    }
  };

  return (
    <div className="active-calls-panel">
      {hasIncomingCall && (
        <div className="acp-incoming">
          <div className="acp-incoming-info">
            <Avatar user={incomingCall.caller} size="small" showPresence={false} />
            <span className="acp-incoming-text">
              {incomingCall.caller?.display_name || t('chat.someone')} — {t('friends.incomingCall', 'Incoming call')}
            </span>
          </div>
          <div className="acp-incoming-actions">
            <button
              className="acp-btn acp-btn-decline"
              onClick={() => rejectIncomingCall(incomingCall.conversationId)}
              title={t('friends.decline')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
              <span>{t('friends.decline')}</span>
            </button>
            <button
              className="acp-btn acp-btn-accept"
              onClick={handleAcceptCall}
              title={t('friends.accept')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 15.5c-1.25 0-2.45-.2-3.57-.57-.35-.11-.74-.03-1.02.24l-2.2 2.2c-2.83-1.44-5.15-3.75-6.59-6.59l2.2-2.21c.28-.26.36-.65.25-1A11.36 11.36 0 018.5 4c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.5c0-.55-.45-1-1-1z" />
              </svg>
              <span>{t('friends.accept')}</span>
            </button>
          </div>
        </div>
      )}

      {activeVoiceChannels.map(({ channelId, teamId, channelName, teamName, names }) => (
        <button
          key={channelId}
          className="acp-voice-item"
          onClick={() => {
            if (teamId) navigate(`/team/${teamId}/channel/${channelId}`);
          }}
        >
          <span className="acp-voice-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" opacity="0.8">
              <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z" />
            </svg>
          </span>
          <span className="acp-voice-label">
            <strong>#{channelName}</strong> · {teamName}: {names.join(', ')}
          </span>
        </button>
      ))}
    </div>
  );
});

export default ActiveCallsPanel;
