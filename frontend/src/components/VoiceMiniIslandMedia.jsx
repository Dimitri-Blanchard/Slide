import React, { memo, useRef, useEffect } from 'react';
import { AvatarImg } from './Avatar';

const IslandPreviewVideo = memo(function IslandPreviewVideo({ stream, muted = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => {});
    }
  }, [stream]);
  if (!stream) return null;
  return (
    <video
      ref={ref}
      className="voice-mini-island-video"
      autoPlay
      playsInline
      muted={muted}
    />
  );
});

export default IslandPreviewVideo;
export { IslandPreviewVideo };
