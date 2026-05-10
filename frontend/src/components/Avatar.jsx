import React, { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOnlineUsers } from '../context/SocketContext';
import { getStaticUrl } from '../utils/staticUrl';
import { getStoredOnlineStatus } from '../utils/presenceStorage';
import { getMemoryCachedSrc, getCachedAvatarSrc, revalidateAvatar, subscribeAvatar } from '../utils/avatarCache';
import './Avatar.css';

const DEFAULT_AVATAR = '/avatars/default.png';

function isGifUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return u.includes('.gif') || u.includes('gif');
}
const getFallbackSvg = (initial) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%236366f1"/><text x="32" y="42" font-size="24" fill="white" text-anchor="middle" font-family="sans-serif">${(initial || '?').charAt(0).toUpperCase()}</text></svg>`)}`;

export function hasDefaultAvatar(user) {
  const url = user?.avatar_url;
  if (!url) return true;
  return url.includes('/default/default') || url === '/avatars/default.png' || url.endsWith('/default.png');
}

const STATUS_COLORS = {
  online:    '#23a55a',
  idle:      '#f0b232',
  dnd:       '#f23f43',
  invisible: '#80848e',
  offline:   '#80848e',
};

export function StatusBadgeIcon({ status, size = 10, borderColor = 'var(--bg-secondary)' }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.offline;

  if (status === 'idle') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <mask id="idle-mask">
          <rect width="16" height="16" fill="white" />
          <circle cx="3.5" cy="3.5" r="5" fill="black" />
        </mask>
        <circle cx="8" cy="8" r="8" fill={color} mask="url(#idle-mask)" />
      </svg>
    );
  }
  if (status === 'dnd') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="8" fill={color} />
        <rect x="3.5" y="6.5" width="9" height="3" rx="1.5" fill={borderColor} />
      </svg>
    );
  }
  if (status === 'invisible' || status === 'offline') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="8" fill={color} />
        <circle cx="8" cy="8" r="4" fill={borderColor} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="8" fill={color} />
    </svg>
  );
}

const BADGE_SIZES = { small: 8, medium: 10, large: 12, xlarge: 14 };

function isSkippableAvatarUrl(url) {
  if (!url) return true;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.includes('/default/default') || url.includes('/avatars/default.png') || url.endsWith('/default.png')) return true;
  return false;
}

function useCachedAvatar(avatarPath) {
  const staticUrl = useMemo(() => (avatarPath ? getStaticUrl(avatarPath) : ''), [avatarPath]);
  const skip = isSkippableAvatarUrl(staticUrl);

  const initialSrc = useMemo(() => {
    if (skip) return staticUrl;
    return getMemoryCachedSrc(staticUrl) || staticUrl;
  }, [staticUrl, skip]);

  const [src, setSrc] = useState(initialSrc);

  useEffect(() => {
    if (skip) { setSrc(staticUrl); return; }
    let active = true;

    const memoryCached = getMemoryCachedSrc(staticUrl);
    if (memoryCached) {
      setSrc(memoryCached);
    } else {
      setSrc(staticUrl);
      getCachedAvatarSrc(staticUrl).then(cached => {
        if (active && cached) setSrc(cached);
      });
    }

    revalidateAvatar(staticUrl);
    const unsub = subscribeAvatar(staticUrl, newSrc => { if (active) setSrc(newSrc); });
    return () => { active = false; unsub(); };
  }, [staticUrl, skip]);

  return src;
}

/**
 * Hook that captures the first frame of a GIF to a canvas, used to render a
 * static placeholder so the GIF only animates when wanted.
 *
 * Returns { canvasRef, imgRef, captureStaticFrame } and the consumer is
 * expected to render an <img ref={imgRef}> + <canvas ref={canvasRef}>
 * inside a container of fixed size, then toggle visibility based on
 * `showAnimated`.
 */
function useGifStaticFrame(isGif) {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const captureStaticFrame = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!img || !canvas || !container || !isGif) return;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return;
    const w = container.clientWidth || 48;
    const h = container.clientHeight || 48;
    const dpr = window.devicePixelRatio || 1;
    const drawW = Math.round(w * dpr);
    const drawH = Math.round(h * dpr);
    canvas.width = drawW;
    canvas.height = drawH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const destAspect = w / h;
    const srcAspect = iw / ih;
    let sx, sy, sWidth, sHeight;
    if (srcAspect > destAspect) {
      sHeight = ih;
      sWidth = ih * destAspect;
      sx = (iw - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = iw;
      sHeight = iw / destAspect;
      sx = 0;
      sy = (ih - sHeight) / 2;
    }
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, drawW, drawH);
  }, [isGif]);

  return { imgRef, canvasRef, containerRef, captureStaticFrame };
}

/**
 * Resolves whether a GIF should currently be animated.
 * Rule (consistent across Avatar and AvatarImg):
 *  - `gifAnimate === true`  → always animated (e.g. active server, profile card open)
 *  - any other value        → animated only while the user hovers the element
 *
 * The OR-with-hover means callers can pass a context-derived bool (isActive,
 * isMessageHovered, etc.) WITHOUT losing the local hover affordance.
 */
function useGifAnimateState(isGif, gifAnimate) {
  const [isHovered, setIsHovered] = useState(false);
  const onMouseEnter = useCallback(() => { if (isGif) setIsHovered(true); }, [isGif]);
  const onMouseLeave = useCallback(() => { if (isGif) setIsHovered(false); }, [isGif]);
  const showAnimated = gifAnimate === true || isHovered;
  return { showAnimated, onMouseEnter, onMouseLeave };
}

const Avatar = memo(function Avatar({
  user,
  size = 'medium',
  className = '',
  showPresence = false,
  gifAnimate,
}) {
  const name = user?.display_name || '?';
  const { user: currentUser } = useAuth();
  const { isUserOnline } = useOnlineUsers();

  const presenceStatus = useMemo(() => {
    if (!user?.id) return 'offline';
    if (user.id === currentUser?.id) {
      return getStoredOnlineStatus(currentUser?.id);
    }
    return isUserOnline(user.id) ? 'online' : 'offline';
  }, [user?.id, currentUser?.id, isUserOnline]);

  const avatarUrl = useMemo(() => {
    if (!hasDefaultAvatar(user)) {
      return user.avatar_url;
    }
    return DEFAULT_AVATAR;
  }, [user?.avatar_url]);
  const isDefault = hasDefaultAvatar(user);

  const handleError = useCallback((e) => {
    e.target.onerror = null;
    e.target.src = e.target.src?.includes(DEFAULT_AVATAR) ? getFallbackSvg(name) : getStaticUrl(DEFAULT_AVATAR);
  }, [name]);

  const imgSrc = useCachedAvatar(avatarUrl);
  const isGif = isGifUrl(avatarUrl);

  const { imgRef, canvasRef, containerRef, captureStaticFrame } = useGifStaticFrame(isGif);
  const { showAnimated, onMouseEnter, onMouseLeave } = useGifAnimateState(isGif, gifAnimate);

  return (
    <div
      ref={containerRef}
      className={`avatar avatar-${size} ${isGif ? 'avatar-has-gif' : ''} ${isDefault ? 'avatar-default' : ''} ${className}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {isGif ? (
        <>
          <img
            ref={imgRef}
            src={imgSrc}
            alt={name}
            onError={handleError}
            onLoad={captureStaticFrame}
            loading="eager"
            draggable={false}
            className={`avatar-gif-layer ${showAnimated ? 'avatar-gif-visible' : 'avatar-gif-hidden'}`}
          />
          <canvas
            ref={canvasRef}
            className={`avatar-gif-layer avatar-gif-static ${showAnimated ? 'avatar-gif-hidden' : 'avatar-gif-visible'}`}
            aria-hidden
          />
        </>
      ) : (
        <img
          ref={imgRef}
          src={imgSrc}
          alt={name}
          onError={handleError}
          loading="eager"
          draggable={false}
        />
      )}
      {showPresence && (
        <div className="avatar-presence-badge">
          <StatusBadgeIcon
            status={presenceStatus}
            size={BADGE_SIZES[size] || 10}
            borderColor="var(--avatar-status-ring, var(--bg-secondary))"
          />
        </div>
      )}
      {user?.equipped_avatar_decoration_id && (
        <div className={`avatar-decoration avatar-decoration-${user.equipped_avatar_decoration_id}`} aria-hidden />
      )}
    </div>
  );
});

/**
 * Drop-in <img>-style avatar for places where the full Avatar component
 * doesn't fit (server icons, modal headers, action sheets…). Same
 * static-frame-on-rest, animate-when-context-active behaviour as Avatar.
 *
 * Props:
 *   src         - avatar URL (string, may be a GIF)
 *   alt         - accessible name
 *   className   - extra classes added to the wrapper
 *   gifAnimate  - true: always animate. Otherwise: animate only on hover.
 *   ...rest     - forwarded to the wrapper <span>
 */
export const AvatarImg = memo(function AvatarImg({
  src,
  alt = '',
  className = '',
  gifAnimate,
  ...rest
}) {
  const cachedSrc = useCachedAvatar(src);
  const isGif = isGifUrl(src);

  const { imgRef, canvasRef, containerRef, captureStaticFrame } = useGifStaticFrame(isGif);
  const { showAnimated, onMouseEnter, onMouseLeave } = useGifAnimateState(isGif, gifAnimate);

  if (!cachedSrc) return null;

  // Non-GIF fast path — render plain <img> with the same wrapper class so
  // existing CSS (object-fit / sizing) keeps working.
  if (!isGif) {
    return (
      <img
        src={cachedSrc}
        alt={alt}
        loading="eager"
        draggable={false}
        className={`avatar-img-gif ${className}`.trim()}
        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        {...rest}
      />
    );
  }

  return (
    <span
      ref={containerRef}
      className={`avatar-img-wrap ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...rest}
    >
      <img
        ref={imgRef}
        src={cachedSrc}
        alt={alt}
        loading="eager"
        draggable={false}
        onLoad={captureStaticFrame}
        className={`avatar-img-gif avatar-gif-layer ${showAnimated ? 'avatar-gif-visible' : 'avatar-gif-hidden'}`}
      />
      <canvas
        ref={canvasRef}
        className={`avatar-gif-layer avatar-gif-static ${showAnimated ? 'avatar-gif-hidden' : 'avatar-gif-visible'}`}
        aria-hidden
      />
    </span>
  );
});

export default Avatar;
