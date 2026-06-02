import React from 'react';

function BrandIcon({ src, className = '' }) {
  return (
    <img
      src={src}
      alt=""
      className={`platform-brand-icon ${className}`.trim()}
      aria-hidden
      draggable={false}
    />
  );
}

export function WindowsIcon({ className = '' }) {
  return <BrandIcon src="/assets/windows.svg" className={className} />;
}

export function LinuxIcon({ className = '' }) {
  return <BrandIcon src="/assets/linux.svg" className={className} />;
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
