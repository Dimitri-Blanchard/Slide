import React, { memo, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { AvatarImg } from './Avatar';
import { getGroupAvatarParticipants } from '../utils/groupAvatarParticipants';
import './GroupAvatar.css';

const SIZE_MAP = {
  small: 24,
  medium: 32,
  large: 40,
  server: 45,
};

const GroupAvatar = memo(function GroupAvatar({
  participants,
  size = 'medium',
  onContextMenu,
  className = '',
  style,
}) {
  const { user } = useAuth();
  const avatars = useMemo(
    () => getGroupAvatarParticipants(participants, user?.id),
    [participants, user?.id],
  );
  const px = SIZE_MAP[size] || SIZE_MAP.medium;
  const count = Math.min(avatars.length, 2);

  return (
    <div
      className={`group-avatar-stack ${className}`.trim()}
      style={{ width: px, height: px, ...style }}
      onContextMenu={onContextMenu}
    >
      {avatars.map((u, i) => (
        <div key={u.id} className={`group-avatar-item group-avatar-pos-${i}-of-${count || 1}`}>
          {u.avatar_url ? (
            <AvatarImg src={u.avatar_url} alt="" />
          ) : (
            <span className="group-avatar-fallback">
              {(u.display_name || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
});

export default GroupAvatar;
