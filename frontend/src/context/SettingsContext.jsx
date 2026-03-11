import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { settings as settingsApi } from '../api';
import { getToken } from '../utils/tokenStorage';
import { useLanguage } from './LanguageContext';

const SettingsContext = createContext(null);
const MONO_DARK_ACCENT = 'rgb(224, 228, 234)';

// Default settings values
const DEFAULT_SETTINGS = {
  // Privacy
  allow_dm_from_servers: true,
  filter_dm_content: true,
  show_activity_status: true,
  allow_friend_requests: true,
  show_online_status: true,
  show_spotify_listening: true,
  
  // Notifications
  enable_notifications: true,
  notification_sound: true,
  desktop_notifications: true,
  message_previews: true,
  mention_notifications: true,
  dm_notifications: true,
  
  // Appearance
  theme: 'auto',
  accent_color: MONO_DARK_ACCENT,
  message_display: 'cozy',
  font_size: 16,
  chat_spacing: 0,
  show_avatars: true,
  animate_emoji: true,
  show_embeds: true,
  profile_style: 'popup', // 'popup' = anchored near click, 'card' = centered modal (image style)
  
  // Accessibility
  reduce_motion: false,
  motion_signature: 'pure', // pure | cinematic | minimal
  high_contrast: false,
  saturation: 100,
  link_underline: false,
  role_colors: true,
  
  // Voice
  input_device: 'default',
  output_device: 'default',
  video_device: 'default',
  input_volume: 100,
  output_volume: 100,
  input_sensitivity: 50,
  echo_cancellation: true,
  noise_suppression: true,
  auto_gain_control: true,
  
  // Advanced
  developer_mode: false,
  hardware_acceleration: true,
  debug_mode: false,
  
  // Language
  language: 'fr',
  
  // Keybinds
  keybinds: {
    toggleMute: 'Ctrl + Shift + M',
    toggleDeafen: 'Ctrl + Shift + D',
    pushToTalk: '',
    search: 'Ctrl + K',
    markAsRead: 'Escape',
  },
};

// Notification sound - Web Audio API, routes to selected output device
let notificationCtx = null;
function playNotificationSound(opts = {}) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!notificationCtx) notificationCtx = new Ctx();
    const ctx = notificationCtx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const volume = (opts.outputVolume ?? 100) / 100;
    const outputDevice = opts.outputDevice;
    const useDevice = outputDevice && outputDevice !== 'default';

    let destination = ctx.destination;
    let routedAudio = null;
    if (useDevice && ctx.createMediaStreamDestination) {
      const dest = ctx.createMediaStreamDestination();
      destination = dest;
      const audio = new Audio();
      audio.autoplay = true;
      audio.volume = volume;
      audio.srcObject = dest.stream;
      if (audio.setSinkId) {
        audio.setSinkId(outputDevice).catch(() => {});
      }
      audio.play().catch(() => {});
      routedAudio = audio;
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(destination);
    gain.gain.setValueAtTime(0.2 * volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc1.frequency.value = 880;
    osc2.frequency.value = 1109;
    osc1.type = osc2.type = 'sine';
    osc1.start(ctx.currentTime);
    osc2.start(ctx.currentTime + 0.08);
    osc1.stop(ctx.currentTime + 0.2);
    osc2.stop(ctx.currentTime + 0.2);

    if (routedAudio) {
      setTimeout(() => {
        routedAudio.srcObject = null;
        routedAudio.pause();
      }, 250);
    }
  } catch (_) {}
}

function normalizeAccentColor(rawColor, fallbackColor = 'rgb(79, 110, 247)') {
  if (typeof document === 'undefined') return fallbackColor;
  const candidate = typeof rawColor === 'string' ? rawColor.trim() : '';
  if (!candidate) return fallbackColor;

  // Let the browser validate and normalize any CSS color format.
  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = candidate;
  if (!probe.style.color) return fallbackColor;

  document.documentElement.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();
  return computed || fallbackColor;
}

function extractRgbChannels(color) {
  const match = String(color).match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return ['224', '228', '234'];
  return [match[0], match[1], match[2]];
}

function isLegacyBlueAccent(color) {
  const [r, g, b] = extractRgbChannels(normalizeAccentColor(color)).map(Number);
  // Blue accents (Discord-style)
  if ((r === 88 && g === 101 && b === 242) || (r === 79 && g === 110 && b === 247) || (r === 77 && g === 102 && b === 220)) return true;
  // Cyan accents — convert to white (Grok/X.ai style)
  if (r < 80 && g > 180 && b > 200) return true; // cyan/teal range
  return false;
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [notificationPermission, setNotificationPermission] = useState('default');
  const settingsInitialized = useRef(false);
  const keybindHandlers = useRef(new Map());
  
  // Get language context to sync language setting
  const languageContext = useLanguage();
  const { changeLanguage, language: contextLanguage } = languageContext || {};

  const resetToDefaults = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    settingsInitialized.current = true;
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async () => {
    if (!getToken()) {
      resetToDefaults();
      return;
    }

    setLoading(true);
    try {
      const data = await settingsApi.get();
      // Migrate old blue accent defaults to the new monochrome dark baseline.
      if (isLegacyBlueAccent(data.accent_color)) {
        data.accent_color = MONO_DARK_ACCENT;
      }
      setSettings(prev => ({ ...prev, ...data }));
      settingsInitialized.current = true;
    } catch (err) {
      console.error('Error loading settings:', err);
      resetToDefaults();
    } finally {
      setLoading(false);
    }
  }, [resetToDefaults]);
  
  // ═══════════════════════════════════════════════════════════
  // LOAD SETTINGS FROM API
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Keep settings synced with the active account after login/logout/switch
  useEffect(() => {
    const handleAuthChanged = () => {
      loadSettings();
    };
    window.addEventListener('slide:auth-changed', handleAuthChanged);
    return () => window.removeEventListener('slide:auth-changed', handleAuthChanged);
  }, [loadSettings]);
  
  // ═══════════════════════════════════════════════════════════
  // SYNC LANGUAGE WITH LANGUAGE CONTEXT
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    // Sync language setting with LanguageContext
    if (settings.language && changeLanguage && settings.language !== contextLanguage) {
      changeLanguage(settings.language);
    }
  }, [settings.language, changeLanguage, contextLanguage]);
  
  // ═══════════════════════════════════════════════════════════
  // APPLY THEME (dark/light/auto)
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const applyTheme = () => {
      let effectiveTheme = settings.theme;
      
      if (settings.theme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        effectiveTheme = prefersDark ? 'dark' : 'light';
      }
      
      document.documentElement.setAttribute('data-theme', effectiveTheme);
      try { localStorage.setItem('slide_theme_cache', effectiveTheme); } catch (_) {}
    };

    applyTheme();
    
    if (settings.theme === 'auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [settings.theme]);
  
  // ═══════════════════════════════════════════════════════════
  // APPLY ACCENT COLOR
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const root = document.documentElement;
    const themeAccent = window.getComputedStyle(root).getPropertyValue('--accent').trim() || 'rgb(79, 110, 247)';
    const appliedTheme = root.getAttribute('data-theme') || 'light';
    const requestedAccent = normalizeAccentColor(settings.accent_color, themeAccent);
    const color = appliedTheme === 'dark' && isLegacyBlueAccent(requestedAccent)
      ? MONO_DARK_ACCENT
      : requestedAccent;
    const [r, g, b] = extractRgbChannels(color);
    // Luminance (0–255): determines whether text on the accent should be dark or white
    const luminance = 0.2126 * +r + 0.7152 * +g + 0.0722 * +b;
    const accentText = luminance > 160 ? '#111318' : '#ffffff';
    const accentTextMuted = luminance > 160 ? 'rgba(17,19,24,0.72)' : 'rgba(255,255,255,0.72)';
    root.style.setProperty('--accent', color);
    root.style.setProperty('--accent-text', accentText);
    root.style.setProperty('--accent-text-muted', accentTextMuted);
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.5)`);
    root.style.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, 0.2)`);
    root.style.setProperty('--accent-muted', `rgba(${r}, ${g}, ${b}, 0.08)`);
    root.style.setProperty('--accent-hover', `rgb(${Math.max(0, +r - 18)}, ${Math.max(0, +g - 18)}, ${Math.min(255, +b + 2)})`);
    root.style.setProperty('--accent-bright', `rgb(${Math.min(255, +r + 20)}, ${Math.min(255, +g + 20)}, ${Math.min(255, +b + 8)})`);
  }, [settings.accent_color]);
  
  // ═══════════════════════════════════════════════════════════
  // APPLY FONT SIZE AND CHAT SPACING
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--chat-font-size', `${settings.font_size}px`);
    root.style.setProperty('--chat-spacing', `${settings.chat_spacing}px`);
    root.style.setProperty('--message-display', settings.message_display);
  }, [settings.font_size, settings.chat_spacing, settings.message_display]);
  
  // ═══════════════════════════════════════════════════════════
  // APPLY ACCESSIBILITY SETTINGS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const root = document.documentElement;
    
    // Reduce motion
    if (settings.reduce_motion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }

    // Global motion signature controls transition rhythm across the app.
    const motionProfile = settings.reduce_motion ? 'minimal' : (settings.motion_signature || 'pure');
    if (motionProfile === 'cinematic') {
      root.style.setProperty('--motion-speed-multiplier', '1.2');
      root.style.setProperty('--motion-ease', 'cubic-bezier(0.22, 1, 0.36, 1)');
    } else if (motionProfile === 'minimal') {
      root.style.setProperty('--motion-speed-multiplier', '0.65');
      root.style.setProperty('--motion-ease', 'linear');
    } else {
      root.style.setProperty('--motion-speed-multiplier', '1');
      root.style.setProperty('--motion-ease', 'cubic-bezier(0.25, 0.1, 0.25, 1)');
    }
    
    // High contrast
    if (settings.high_contrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
    
    // Saturation
    root.style.setProperty('--saturation', `${settings.saturation}%`);
    
    // Link underline
    if (settings.link_underline) {
      root.classList.add('link-underline');
    } else {
      root.classList.remove('link-underline');
    }
    
    // Role colors
    if (settings.role_colors) {
      root.classList.add('role-colors');
    } else {
      root.classList.remove('role-colors');
    }
  }, [settings.reduce_motion, settings.motion_signature, settings.high_contrast, settings.saturation, settings.link_underline, settings.role_colors]);
  
  // ═══════════════════════════════════════════════════════════
  // REQUEST NOTIFICATION PERMISSION
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (settings.desktop_notifications && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
      
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      }
    }
  }, [settings.desktop_notifications]);
  
  // ═══════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const parseKeybind = (keybind) => {
      if (!keybind) return null;
      const parts = keybind.toLowerCase().split('+').map(p => p.trim());
      return {
        ctrl: parts.includes('ctrl'),
        shift: parts.includes('shift'),
        alt: parts.includes('alt'),
        key: parts.find(p => !['ctrl', 'shift', 'alt'].includes(p)) || '',
      };
    };
    
    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input - let the component handle Escape (e.g. cancel edit)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      
      const keybinds = settings.keybinds || {};
      
      for (const [action, keybind] of Object.entries(keybinds)) {
        const parsed = parseKeybind(keybind);
        if (!parsed || !parsed.key) continue;
        
        const keyMatch = e.key.toLowerCase() === parsed.key || 
                        e.code.toLowerCase() === parsed.key ||
                        e.code.toLowerCase() === `key${parsed.key}`;
        
        if (keyMatch &&
            e.ctrlKey === parsed.ctrl &&
            e.shiftKey === parsed.shift &&
            e.altKey === parsed.alt) {
          e.preventDefault();
          
          // Execute registered handler
          const handler = keybindHandlers.current.get(action);
          if (handler) {
            handler();
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.keybinds]);
  
  // ═══════════════════════════════════════════════════════════
  // UPDATE SETTING
  // ═══════════════════════════════════════════════════════════
  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  }, []);
  
  const updateSettings = useCallback((newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // REGISTER KEYBIND HANDLER
  // ═══════════════════════════════════════════════════════════
  const registerKeybindHandler = useCallback((action, handler) => {
    keybindHandlers.current.set(action, handler);
    return () => keybindHandlers.current.delete(action);
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // SEND DESKTOP NOTIFICATION
  // ═══════════════════════════════════════════════════════════
  const sendNotification = useCallback((title, options = {}) => {
    if (!settings.enable_notifications) return;
    
    // Play sound if enabled - use selected output device
    if (settings.notification_sound) {
      playNotificationSound({
        outputDevice: settings.output_device,
        outputVolume: settings.output_volume ?? 100,
      });
    }
    
    // Show desktop notification if enabled and permitted
    if (settings.desktop_notifications && 
        'Notification' in window && 
        Notification.permission === 'granted') {
      
      const notifOptions = {
        icon: '/logo.png',
        badge: '/logo.png',
        ...options,
      };
      
      // Remove body if message_previews is disabled (except for calls - always show caller)
      if (!settings.message_previews && !options.isCall) {
        notifOptions.body = 'Nouveau message';
      }
      
      try {
        const notification = new Notification(title, notifOptions);
        notification.onclick = () => {
          window.focus();
          notification.close();
          if (options.onClick) options.onClick();
        };
        
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);
        
        return notification;
      } catch (err) {
        console.error('Error showing notification:', err);
      }
    }
  }, [settings.enable_notifications, settings.notification_sound, settings.desktop_notifications, settings.message_previews]);
  
  // ═══════════════════════════════════════════════════════════
  // CHECK IF SHOULD NOTIFY FOR MESSAGE TYPE
  // ═══════════════════════════════════════════════════════════
  const shouldNotify = useCallback((type, isMention = false) => {
    if (!settings.enable_notifications) return false;
    
    if (type === 'dm' && !settings.dm_notifications) return false;
    if (isMention && !settings.mention_notifications) return false;
    
    return true;
  }, [settings.enable_notifications, settings.dm_notifications, settings.mention_notifications]);
  
  const value = useMemo(() => ({
    settings,
    loading,
    updateSetting,
    updateSettings,
    sendNotification,
    shouldNotify,
    registerKeybindHandler,
    notificationPermission,
    isDarkTheme: settings.theme === 'dark' || (settings.theme === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches),
    isCompactMode: settings.message_display === 'compact',
    showAvatars: settings.show_avatars,
    animateEmoji: settings.animate_emoji,
    showEmbeds: settings.show_embeds,
    profileStyle: settings.profile_style || 'popup',
    developerMode: settings.developer_mode,
    debugMode: settings.debug_mode,
  }), [settings, loading, updateSetting, updateSettings, sendNotification, shouldNotify, registerKeybindHandler, notificationPermission]);
  
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;
