import React from 'react';
import { DISCORD_ICON_DEFS } from './discordIconPaths';
import './AppIcon.css';

export function DiscordSvgIcon({
  name,
  size = 20,
  weight = 'fill',
  className = '',
  mirrored = false,
  'aria-hidden': ariaHidden = true,
  style,
  ...props
}) {
  const def = DISCORD_ICON_DEFS[name];
  if (!def) return null;

  const isRegular = weight === 'regular' || weight === 'light';

  return (
    <span
      {...props}
      className={`app-icon app-icon--discord${className ? ` ${className}` : ''}`}
      aria-hidden={ariaHidden}
      style={{
        width: size,
        height: size,
        ...(mirrored ? { transform: 'scaleX(-1)' } : null),
        ...(isRegular ? { opacity: 0.88 } : null),
        ...style,
      }}
    >
      <svg
        viewBox={def.viewBox || '0 0 24 24'}
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
        className="app-icon-svg"
      >
        {def.paths.map((entry) => {
          const path = typeof entry === 'string' ? { d: entry } : entry;
          return (
            <path
              key={path.d.slice(0, 48)}
              d={path.d}
              fillRule={path.fillRule}
              clipRule={path.clipRule}
            />
          );
        })}
        {def.strokes?.map((stroke) => (
          <line
            key={`${stroke.x1}-${stroke.y1}-${stroke.x2}-${stroke.y2}`}
            x1={stroke.x1}
            y1={stroke.y1}
            x2={stroke.x2}
            y2={stroke.y2}
            stroke="currentColor"
            strokeWidth={stroke.width ?? 2.5}
            strokeLinecap="round"
            fill="none"
          />
        ))}
      </svg>
    </span>
  );
}

export default DiscordSvgIcon;
