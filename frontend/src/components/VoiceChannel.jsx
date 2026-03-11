import React, { memo, useMemo, useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, Monitor, PhoneOff, ChevronDown } from 'lucide-react';
import { AvatarImg } from './Avatar';
import { useVoice } from '../context/VoiceContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import './VoiceChannel.css';

const ScreenShareVideo = memo(function ScreenShareVideo({ stream, displayName }) {
  const videoRef = React.useRef(null);
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div className="vc-screen-share-tile">
      <video ref={videoRef} autoPlay playsInline muted className="vc-screen-video" />
      <span className="vc-screen-share-name">{displayName}</span>
    </div>
  );
});

const VoiceUserTile = memo(function VoiceUserTile({ voiceUser, isSpeaking, isCurrentUser }) {
  const statusIcons = [];
  if (voiceUser.muted) statusIcons.push('muted');
  if (voiceUser.deafened) statusIcons.push('deafened');

  return (
    <div className={`vc-user-tile ${isSpeaking ? 'speaking' : ''} ${isCurrentUser ? 'is-self' : ''}`}>
      <div className="vc-user-avatar-ring">
        <div className="vc-user-avatar">
          {voiceUser.avatar_url ? (
            <AvatarImg
              src={voiceUser.avatar_url}
              alt={voiceUser.display_name}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%236366f1"/><text x="32" y="42" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">${(voiceUser.display_name || '?').charAt(0).toUpperCase()}</text></svg>`)}`;
              }}
            />
          ) : (
            <span className="vc-user-avatar-fallback">
              {(voiceUser.display_name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      </div>
      <span className="vc-user-name">{voiceUser.display_name}</span>
      {statusIcons.length > 0 && (
        <div className="vc-user-status-icons">
          {voiceUser.muted && (
            <svg className="vc-status-icon muted" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
          {voiceUser.deafened && (
            <svg className="vc-status-icon deafened" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
              <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </div>
      )}
    </div>
  );
});

const VoiceChannel = memo(function VoiceChannel({ channel, teamId }) {
  const { voiceChannelId, voiceUsers, speakingUsers, isMuted, isDeafened, connectionState, isScreenSharing, remoteVideoStreams, joinVoice, leaveVoice, toggleMute, toggleDeafen, startScreenShare, stopScreenShare, retryRemoteAudioPlayback, switchAudioInput, switchAudioOutput } = useVoice();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { inputs, outputs } = useMediaDevices();
  const [openDropdown, setOpenDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const isConnected = voiceChannelId === channel?.id;
  const channelUsers = voiceUsers[channel?.id] || [];

  const sortedUsers = useMemo(() => {
    return [...channelUsers].sort((a, b) => {
      if (a.id === user?.id) return -1;
      if (b.id === user?.id) return 1;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });
  }, [channelUsers, user?.id]);

  const handleJoin = () => {
    if (channel && teamId) {
      joinVoice(channel.id, parseInt(teamId, 10), channel.name);
    }
  };

  return (
    <div className="voice-channel-view">
      <div className="vc-main">
        <div className="vc-header-area">
          <div className="vc-channel-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z"/>
              <path d="M14 9.00304C14 9.00304 16 10.003 16 12.003C16 14.003 14 15.003 14 15.003" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M17 7.00304C17 7.00304 20 9.00304 20 12.003C20 15.003 17 17.003 17 17.003" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="vc-channel-name">{channel?.name || 'Voice Channel'}</h2>
          {isConnected && (
            <div className="vc-connection-badge">
              <div className={`vc-signal-dot ${connectionState}`} />
              <span>Voice Connected</span>
            </div>
          )}
        </div>

        {!isConnected ? (
          <div className="vc-join-area">
            <div className="vc-join-illustration">
              <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                <circle cx="60" cy="60" r="58" stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3"/>
                <circle cx="60" cy="60" r="40" fill="var(--bg-tertiary)"/>
                <path d="M52 45C52 45 55 42 60 42C65 42 68 45 68 45V58C68 58 65 61 60 61C55 61 52 58 52 58V45Z" fill="var(--text-muted)" opacity="0.5"/>
                <rect x="55" y="62" width="10" height="4" rx="2" fill="var(--text-muted)" opacity="0.4"/>
                <path d="M48 52V55C48 61.627 53.373 67 60 67C66.627 67 72 61.627 72 55V52" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
                <circle cx="60" cy="76" r="2" fill="var(--text-muted)" opacity="0.3"/>
                <line x1="60" y1="69" x2="60" y2="74" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.3"/>
              </svg>
            </div>
            {channelUsers.length > 0 && (
              <p className="vc-join-info">
                {channelUsers.length} user{channelUsers.length !== 1 ? 's' : ''} currently in voice
              </p>
            )}
            <button className="vc-join-btn" onClick={handleJoin}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z"/>
              </svg>
              Join Voice
            </button>
          </div>
        ) : (
          <>
            {Object.keys(remoteVideoStreams).length > 0 && (
              <div className="vc-screen-shares">
                {channelUsers
                  .filter(u => remoteVideoStreams[u.id])
                  .map(u => (
                    <ScreenShareVideo
                      key={u.id}
                      stream={remoteVideoStreams[u.id]}
                      displayName={u.display_name}
                    />
                  ))}
              </div>
            )}
            <div className="vc-users-grid">
              {sortedUsers.length === 0 ? (
                <div className="vc-empty">
                  <p>No one else is here yet...</p>
                </div>
              ) : (
                sortedUsers.map(u => (
                  <VoiceUserTile
                    key={u.id}
                    voiceUser={u}
                    isSpeaking={speakingUsers.has(u.id)}
                    isCurrentUser={u.id === user?.id}
                  />
                ))
              )}
            </div>

            {channelUsers.filter(u => u.id !== user?.id).length > 0 && (
              <button
                type="button"
                className="vc-enable-sound-btn"
                onClick={retryRemoteAudioPlayback}
                title="Cliquez si vous n'entendez pas les autres"
              >
                🔊 Activer le son
              </button>
            )}

            <div className="vc-controls" ref={dropdownRef}>
              {/* Microphone — split: icon | chevron for device selection */}
              <div className="vc-ctrl-group-wrap">
                <div className={`vc-ctrl-split ${isMuted ? 'has-active danger' : ''}`}>
                  <button className="vc-ctrl-main" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <MicOff size={22} strokeWidth={2} /> : <Mic size={22} strokeWidth={2} />}
                  </button>
                  <span className="vc-ctrl-divider" />
                  <button className="vc-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'mic' ? null : 'mic')} title="Select microphone" data-open={openDropdown === 'mic'} aria-expanded={openDropdown === 'mic'}>
                    <ChevronDown size={16} strokeWidth={2.5} />
                  </button>
                </div>
                {openDropdown === 'mic' && (
                  <div className="vc-device-popover">
                    {inputs.map((d) => (
                      <button key={d.value} onClick={() => { switchAudioInput(d.value); setOpenDropdown(null); }} data-selected={settings?.input_device === d.value} title={d.label}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Headphones — split: icon | chevron for device selection */}
              <div className="vc-ctrl-group-wrap">
                <div className={`vc-ctrl-split ${isDeafened ? 'has-active danger' : ''}`}>
                  <button className="vc-ctrl-main" onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
                    {isDeafened ? (
                      <HeadphoneOff size={22} strokeWidth={2} />
                    ) : (
                      <Headphones size={22} strokeWidth={2} />
                    )}
                  </button>
                  <span className="vc-ctrl-divider" />
                  <button className="vc-ctrl-dropdown" onClick={() => setOpenDropdown(openDropdown === 'output' ? null : 'output')} title="Select audio output" data-open={openDropdown === 'output'} aria-expanded={openDropdown === 'output'}>
                    <ChevronDown size={16} strokeWidth={2.5} />
                  </button>
                </div>
                {openDropdown === 'output' && (
                  <div className="vc-device-popover">
                    {outputs.map((d) => (
                      <button key={d.value} onClick={() => { switchAudioOutput(d.value); setOpenDropdown(null); }} data-selected={settings?.output_device === d.value} title={d.label}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className={`vc-control-btn ${isScreenSharing ? 'active' : ''}`}
                onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                title={isScreenSharing ? 'Arrêter le partage d\'écran' : 'Partager l\'écran'}
              >
                <Monitor size={22} strokeWidth={2} />
              </button>

              <button
                className="vc-control-btn disconnect"
                onClick={leaveVoice}
                title="Disconnect"
              >
                <PhoneOff size={22} strokeWidth={2} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default VoiceChannel;
