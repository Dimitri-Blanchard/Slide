import { useEffect, useState } from 'react';
import { getAvatarBlendColor } from '../utils/avatarBlendColor';

export function useAvatarBlendColor(avatarPath) {
  const [color, setColor] = useState('#2b2d31');

  useEffect(() => {
    let cancelled = false;
    getAvatarBlendColor(avatarPath).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  return color;
}
