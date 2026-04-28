import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Headphones, HeadphoneOff, Settings, PhoneOff, ChevronUp, Monitor, Video, VideoOff } from 'lucide-react';
import { VoiceStatusBar } from './ChannelList';
import UserPanel from './UserPanel';
import { useVoice } from '../context/VoiceContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import './UserStatusAndSettings.css';

export default function UserStatusAndSettings({ sidebarWidth }) {
  const navigate = useNavigate();
  const { isMuted, isDeafened, toggleMute, toggleDeafen, voiceChannelId, voiceConversationId, isScreenSharing, isCameraOn, startScreenShare, stopScreenShare, startScreenShareDM, stopScreenShareDM, startCamera, stopCamera, leaveVoice, leaveVoiceDM, switchAudioInput, switchAudioOutput } = useVoice();
  const { settings } = useSettings();
  const { inputs, outputs, videoInputs } = useMediaDevices();
  const isInVoice = voiceChannelId || voiceConversationId;

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const hasCamera = videoInputs.some(d => d.value !== 'default' || d.label !== 'Default');

  const [sbWidth, setSbWidth] = useState(72);
  useLayoutEffect(() => {
    const el = document.querySelector('.server-bar');
    if (el) setSbWidth(el.offsetWidth);
  }, [sidebarWidth]);
  const panelWidth = sidebarWidth ? sbWidth + sidebarWidth - 18 : undefined;

  const [openDropdown, setOpenDropdown] = useState(null);
  const [popoverRect, setPopoverRect] = useState(null);
  const micGroupRef = useRef(null);
  const outputGroupRef = useRef(null);
  const dropdownRef = useRef(null);

  useLayoutEffect(() => {
    if (!openDropdown) { setPopoverRect(null); return; }
    const el = openDropdown === 'mic' ? micGroupRef.current : outputGroupRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      setPopoverRect({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 8 });
    }
  }, [openDropdown]);

  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpenDropdown(null);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openDropdown]);

  const handleDisconnect = () => {
    if (voiceChannelId) {
      leaveVoice();
      window.dispatchEvent(new CustomEvent('slide:voice-channel-disconnect'));
    } else {
      leaveVoiceDM();
    }
  };

  if (isFullscreen) return null;

  return createPortal(
    <div className={`user-status-and-settings${isInVoice ? ' usas-in-voice' : ''}`} style={panelWidth ? { width: panelWidth } : undefined}>
      {isInVoice && (
        <div className="usas-voice-zone">
          <VoiceStatusBar />
          <div className="usas-voice-actions">
            <button
              className="usas-disconnect-btn"
              onClick={handleDisconnect}
              title="Disconnect"
            >
              <PhoneOff size={18} />
              <span>Disconnect</span>
            </button>
            <button
              className={`usas-vc-btn${isScreenSharing ? ' active' : ''}`}
              onClick={isScreenSharing
                ? (voiceChannelId ? stopScreenShare : stopScreenShareDM)
                : (voiceChannelId ? startScreenShare : startScreenShareDM)}
              title={isScreenSharing ? 'Stop streaming' : 'Share your screen'}
            >
              <Monitor size={20} strokeWidth={2} />
            </button>
            <button
              className={`usas-vc-btn${isCameraOn ? ' active' : ''}${!hasCamera ? ' disabled' : ''}`}
              onClick={hasCamera ? (isCameraOn ? stopCamera : startCamera) : undefined}
              title={!hasCamera ? 'No camera detected' : isCameraOn ? 'Turn off camera' : 'Turn on camera'}
              disabled={!hasCamera}
            >
              {isCameraOn ? <VideoOff size={20} strokeWidth={2} /> : <Video size={20} strokeWidth={2} />}
            </button>
          </div>
        </div>
      )}

      <div className="usas-bottom-bar">
        <UserPanel />
        <div className="usas-controls" ref={dropdownRef}>
          <div ref={micGroupRef} className="usas-ctrl-group">
            <button
              className={`usas-ctrl-btn${isMuted ? ' active' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              className={`usas-ctrl-arrow${isMuted ? ' active' : ''}${openDropdown === 'mic' ? ' open' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'mic' ? null : 'mic')}
              title="Select microphone"
            >
              <ChevronUp size={12} strokeWidth={2.5} />
            </button>
            {openDropdown === 'mic' && popoverRect && createPortal(
              <div className="usas-device-popover" style={{ left: popoverRect.left, bottom: popoverRect.bottom, transform: 'translateX(-50%)' }}>
                <div className="usas-popover-title">Input Device</div>
                {inputs.map((d) => (
                  <button key={d.value} onClick={() => { switchAudioInput(d.value); setOpenDropdown(null); }} data-selected={settings?.input_device === d.value} title={d.label}>
                    {d.label}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>

          <div ref={outputGroupRef} className="usas-ctrl-group">
            <button
              className={`usas-ctrl-btn${isDeafened ? ' active' : ''}`}
              onClick={toggleDeafen}
              title={isDeafened ? 'Undeafen' : 'Deafen'}
            >
              {isDeafened ? <HeadphoneOff size={20} /> : <Headphones size={20} />}
            </button>
            <button
              className={`usas-ctrl-arrow${isDeafened ? ' active' : ''}${openDropdown === 'output' ? ' open' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'output' ? null : 'output')}
              title="Select audio output"
            >
              <ChevronUp size={12} strokeWidth={2.5} />
            </button>
            {openDropdown === 'output' && popoverRect && createPortal(
              <div className="usas-device-popover" style={{ left: popoverRect.left, bottom: popoverRect.bottom, transform: 'translateX(-50%)' }}>
                <div className="usas-popover-title">Output Device</div>
                {outputs.map((d) => (
                  <button key={d.value} onClick={() => { switchAudioOutput(d.value); setOpenDropdown(null); }} data-selected={settings?.output_device === d.value} title={d.label}>
                    {d.label}
                  </button>
                ))}
              </div>,
              document.body
            )}
          </div>

          <button
            className="usas-ctrl-btn usas-settings-btn"
            onClick={() => navigate('/settings')}
            title="User Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
