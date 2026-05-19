import React from 'react';

export function WindowsIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.45L10.5 4.35V11.5H3V5.45ZM11 4.1L21 2.35V11H11V4.1ZM3 12.55H10.5V19.65L3 18.55V12.55ZM11 19.9V13H21V21.65L11 19.9Z" />
    </svg>
  );
}

export function LinuxIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.5 2C9.46 2 7 4.24 7 7.1c0 1.27.55 2.41 1.42 3.2-.9.5-1.52 1.45-1.52 2.55 0 1.6 1.3 2.9 2.9 2.9.47 0 .91-.12 1.3-.32.55 1.72 2.16 3.02 4.1 3.17l.8 2.4h1.6l.8-2.4c1.94-.15 3.55-1.45 4.1-3.17.39.2.83.32 1.3.32 1.6 0 2.9-1.3 2.9-2.9 0-1.1-.62-2.05-1.52-2.55.87-.79 1.42-1.93 1.42-3.2C18 4.24 15.54 2 12.5 2zm0 1.5c2.35 0 4.25 1.75 4.25 3.9 0 .85-.32 1.63-.85 2.25l-.35.4.45.3c.72.48 1.2 1.28 1.2 2.2 0 1.45-1.2 2.65-2.65 2.65-.55 0-1.06-.17-1.48-.46l-.62-.4-.35.7c-.55 1.1-1.68 1.86-3 1.96l-.95.06-.35 1.04h-.7l-.35-1.04-.95-.06c-1.32-.1-2.45-.86-3-1.96l-.35-.7-.62.4c-.42.29-.93.46-1.48.46-1.45 0-2.65-1.2-2.65-2.65 0-.92.48-1.72 1.2-2.2l.45-.3-.35-.4a3.7 3.7 0 0 1-.85-2.25c0-2.15 1.9-3.9 4.25-3.9zM10.2 14.5c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm4.6 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z" />
    </svg>
  );
}

export function AndroidIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C4.18 11.06 2 14.5 2 18.5h20c0-4-2.18-7.44-5.4-9.02zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

const PLATFORM_ICONS = {
  windows: WindowsIcon,
  android: AndroidIcon,
  linux: LinuxIcon,
};

export function PlatformIcon({ platform, className = '' }) {
  const Icon = PLATFORM_ICONS[platform] ?? WindowsIcon;
  return <Icon className={className} />;
}
