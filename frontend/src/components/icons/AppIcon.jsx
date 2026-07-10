import React from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';
import { HeadphoneOff, Headphones, Mic, MicOff } from 'lucide-react';
import { DISCORD_ICON_NAMES } from './discordIconPaths';
import { DiscordSvgIcon } from './DiscordSvgIcon';
import './AppIcon.css';

const DEFAULT_SIZE = 20;

const LUCIDE_ICONS = {
  mic: Mic,
  micOff: MicOff,
  deafen: Headphones,
  deafenOff: HeadphoneOff,
};

const PHOSPHOR_ICONS = {
  admin: PhosphorIcons.GearSix,
  archive: PhosphorIcons.FolderPlus,
  arrowReply: PhosphorIcons.ArrowBendUpLeft,
  chat: PhosphorIcons.ChatCircleText,
  compass: PhosphorIcons.Compass,
  delete: PhosphorIcons.Trash,
  download: PhosphorIcons.DownloadSimple,
  edit: PhosphorIcons.PencilSimple,
  emoji: PhosphorIcons.Smiley,
  eye: PhosphorIcons.Eye,
  file: PhosphorIcons.File,
  gif: PhosphorIcons.Gif,
  gift: PhosphorIcons.Gift,
  group: PhosphorIcons.UsersFour,
  image: PhosphorIcons.ImageSquare,
  nitro: PhosphorIcons.Sparkle,
  notification: PhosphorIcons.BellSimple,
  paperclip: PhosphorIcons.Paperclip,
  pause: PhosphorIcons.Pause,
  phone: PhosphorIcons.Phone,
  play: PhosphorIcons.Play,
  send: PhosphorIcons.PaperPlaneRight,
  sticker: PhosphorIcons.Sticker,
  user: PhosphorIcons.UserCircle,
};

export function AppIcon({
  name,
  size = DEFAULT_SIZE,
  weight = 'fill',
  className,
  mirrored = false,
  'aria-hidden': ariaHidden = true,
  ...props
}) {
  const LucideIcon = LUCIDE_ICONS[name];
  if (LucideIcon) {
    const strokeWidth = weight === 'bold' ? 2.5 : weight === 'regular' || weight === 'light' ? 1.75 : 2;
    return (
      <span
        {...props}
        className={`app-icon app-icon--lucide${className ? ` ${className}` : ''}`}
        aria-hidden={ariaHidden}
        style={{
          width: size,
          height: size,
          ...(mirrored ? { transform: 'scaleX(-1)' } : null),
          ...props.style,
        }}
      >
        <LucideIcon
          size={size}
          strokeWidth={strokeWidth}
          aria-hidden={ariaHidden}
          className="app-icon-svg"
        />
      </span>
    );
  }

  if (DISCORD_ICON_NAMES.has(name)) {
    return (
      <DiscordSvgIcon
        {...props}
        name={name}
        size={size}
        weight={weight}
        className={className}
        mirrored={mirrored}
        aria-hidden={ariaHidden}
      />
    );
  }

  const Icon = PHOSPHOR_ICONS[name] || PhosphorIcons.Question;

  return (
    <Icon
      {...props}
      size={size}
      weight={weight}
      className={className}
      aria-hidden={ariaHidden}
      style={mirrored ? { transform: 'scaleX(-1)', ...props.style } : props.style}
    />
  );
}

export default AppIcon;
