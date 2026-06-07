import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsUi } from '../context/SettingsUiContext';
import { VoiceStatusBar } from './ChannelList';
import UserPanel from './UserPanel';
import AppIcon from './icons/AppIcon';
import { useVoice } from '../context/VoiceContext';
import { useSettings } from '../context/SettingsContext';
import { useMediaDevices } from '../hooks/useMediaDevices';
import './UserStatusAndSettings.css';

export default function UserStatusAndSettings({ sidebarWidth }) {
  const { openSettings } = useSettingsUi();
  const { isMuted, isDeafened, toggleMute, toggleDeafen, voiceChannelId, voiceConversationId, voiceLeaveAnim, switchAudioInput, switchAudioOutput } = useVoice();
  const { settings } = useSettings();
  const { inputs, outputs } = useMediaDevices();
  const isInVoice = voiceChannelId || voiceConversationId || voiceLeaveAnim;

  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
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

  if (isFullscreen) return null;

  return createPortal(
    <div className={`user-status-and-settings${isInVoice ? ' usas-in-voice' : ''}`} style={panelWidth ? { width: panelWidth } : undefined}>
      <div className="usas-island-main">
      {isInVoice && (
        <div className="usas-voice-zone">
          <VoiceStatusBar />
        </div>
      )}

      <div className="usas-bar-stack">
        <div className="usas-status-drawer-host" />
        <div className="usas-bottom-bar">
        <UserPanel />
        <div className="usas-controls" ref={dropdownRef}>
          <div ref={micGroupRef} className="usas-ctrl-group">
            <button
              className={`usas-ctrl-btn${isMuted ? ' active' : ''}`}
              data-voice-mute-trigger
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              <AppIcon name={isMuted ? 'micOff' : 'mic'} size={20} />
            </button>
            <button
              className={`usas-ctrl-arrow${isMuted ? ' active' : ''}${openDropdown === 'mic' ? ' open' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'mic' ? null : 'mic')}
              title="Select microphone"
            >
              <AppIcon name="caretUp" size={12} weight="bold" />
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
              <AppIcon name={isDeafened ? 'deafenOff' : 'deafen'} size={20} />
            </button>
            <button
              className={`usas-ctrl-arrow${isDeafened ? ' active' : ''}${openDropdown === 'output' ? ' open' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'output' ? null : 'output')}
              title="Select audio output"
            >
              <AppIcon name="caretUp" size={12} weight="bold" />
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
            onClick={() => openSettings()}
            title="User Settings"
          >
            <AppIcon name="settings" size={20} />
          </button>
        </div>
        </div>
      </div>
      </div>
      <div className="usas-account-wing-host" />
    </div>,
    document.body
  );
}
