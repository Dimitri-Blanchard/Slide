import React from 'react';
import * as PhosphorIcons from '@phosphor-icons/react';

const DEFAULT_SIZE = 20;

const ICONS = {
  admin: PhosphorIcons.GearSix,
  archive: PhosphorIcons.FolderPlus,
  arrowReply: PhosphorIcons.ArrowBendUpLeft,
  bell: PhosphorIcons.Bell,
  bellOff: PhosphorIcons.BellSlash,
  camera: PhosphorIcons.VideoCamera,
  cameraOff: PhosphorIcons.VideoCameraSlash,
  caretDown: PhosphorIcons.CaretDown,
  caretUp: PhosphorIcons.CaretUp,
  channelAnnouncement: PhosphorIcons.MegaphoneSimple,
  channelForum: PhosphorIcons.ChatsCircle,
  channelText: PhosphorIcons.Hash,
  channelVoice: PhosphorIcons.SpeakerHigh,
  chat: PhosphorIcons.ChatCircleText,
  check: PhosphorIcons.Check,
  close: PhosphorIcons.X,
  compass: PhosphorIcons.Compass,
  copy: PhosphorIcons.Copy,
  deafen: PhosphorIcons.Headphones,
  deafenOff: PhosphorIcons.Headphones,
  delete: PhosphorIcons.Trash,
  download: PhosphorIcons.DownloadSimple,
  edit: PhosphorIcons.PencilSimple,
  emoji: PhosphorIcons.Smiley,
  eye: PhosphorIcons.Eye,
  file: PhosphorIcons.File,
  friends: PhosphorIcons.UsersThree,
  gif: PhosphorIcons.Gif,
  gift: PhosphorIcons.Gift,
  home: PhosphorIcons.House,
  image: PhosphorIcons.ImageSquare,
  link: PhosphorIcons.Link,
  lock: PhosphorIcons.LockSimple,
  mic: PhosphorIcons.Microphone,
  micOff: PhosphorIcons.MicrophoneSlash,
  more: PhosphorIcons.DotsThreeVertical,
  nitro: PhosphorIcons.Sparkle,
  notification: PhosphorIcons.BellSimple,
  paperclip: PhosphorIcons.Paperclip,
  pause: PhosphorIcons.Pause,
  phone: PhosphorIcons.Phone,
  phoneOff: PhosphorIcons.PhoneDisconnect,
  play: PhosphorIcons.Play,
  plus: PhosphorIcons.Plus,
  quests: PhosphorIcons.CompassRose,
  screenShare: PhosphorIcons.Monitor,
  search: PhosphorIcons.MagnifyingGlass,
  security: PhosphorIcons.ShieldCheck,
  send: PhosphorIcons.PaperPlaneRight,
  settings: PhosphorIcons.GearSix,
  signOut: PhosphorIcons.SignOut,
  sticker: PhosphorIcons.Sticker,
  user: PhosphorIcons.UserCircle,
  userPlus: PhosphorIcons.UserPlus,
};

function SlashedIcon({
  Icon,
  size,
  weight,
  className,
  ariaHidden,
  mirrored,
  style,
  ...props
}) {
  return (
    <span
      {...props}
      className={className}
      aria-hidden={ariaHidden}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...(mirrored ? { transform: 'scaleX(-1)' } : null),
        ...style,
      }}
    >
      <Icon size={size} weight={weight} />
      <svg
        aria-hidden="true"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <line
          x1="48"
          y1="44"
          x2="212"
          y2="224"
          stroke="var(--bg-primary, #1e1f22)"
          strokeWidth={weight === 'bold' ? 34 : 26}
          strokeLinecap="round"
        />
        <line
          x1="48"
          y1="44"
          x2="212"
          y2="224"
          stroke="currentColor"
          strokeWidth={weight === 'bold' ? 24 : 16}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function AppIcon({
  name,
  size = DEFAULT_SIZE,
  weight = 'fill',
  className,
  mirrored = false,
  'aria-hidden': ariaHidden = true,
  ...props
}) {
  if (name === 'deafenOff') {
    return (
      <SlashedIcon
        {...props}
        Icon={PhosphorIcons.Headphones}
        size={size}
        weight={weight}
        className={className}
        ariaHidden={ariaHidden}
        mirrored={mirrored}
      />
    );
  }

  const Icon = ICONS[name] || PhosphorIcons.Question;

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
