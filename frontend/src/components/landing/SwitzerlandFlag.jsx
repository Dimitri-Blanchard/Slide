import React from 'react';

/** Swiss flag (proportions simplified for inline UI). */
export default function SwitzerlandFlag({ className = '', size = 18 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
    >
      <rect width="32" height="32" rx="3" fill="#E3000F" />
      <rect x="13" y="5" width="6" height="22" fill="#fff" />
      <rect x="5" y="13" width="22" height="6" fill="#fff" />
    </svg>
  );
}
