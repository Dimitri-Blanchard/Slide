import React, { memo } from 'react';
import { getStaticUrl } from '../utils/staticUrl';
import { isGifUrl, useGifStaticFrame, useGifAnimateState } from './Avatar';
import './ServerBanner.css';

/**
 * Server banner — static image or GIF that animates only while hovered.
 * Pass gifAnimate={true} to keep a GIF playing (e.g. active server in tooltip).
 */
const ServerBanner = memo(function ServerBanner({
  bannerUrl,
  className = '',
  gifAnimate = false,
  alt = '',
}) {
  if (!bannerUrl) return null;

  const src = getStaticUrl(bannerUrl);
  const isGif = isGifUrl(bannerUrl);
  const { imgRef, canvasRef, containerRef, captureStaticFrame } = useGifStaticFrame(isGif);
  const { showAnimated, onMouseEnter, onMouseLeave } = useGifAnimateState(isGif, gifAnimate);

  if (!isGif) {
    return (
      <div
        className={`server-banner server-banner--static ${className}`.trim()}
        style={{ backgroundImage: `url(${src})` }}
        role="img"
        aria-label={alt}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className={`server-banner server-banner--gif ${className}`.trim()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="img"
      aria-label={alt}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={captureStaticFrame}
        className={`server-banner-img avatar-gif-layer ${showAnimated ? 'avatar-gif-visible' : 'avatar-gif-hidden'}`}
      />
      <canvas
        ref={canvasRef}
        className={`server-banner-canvas avatar-gif-layer avatar-gif-static ${showAnimated ? 'avatar-gif-hidden' : 'avatar-gif-visible'}`}
        aria-hidden
      />
    </div>
  );
});

export default ServerBanner;
