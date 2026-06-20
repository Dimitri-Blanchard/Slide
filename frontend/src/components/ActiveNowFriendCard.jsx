import React, { memo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useOnlineUsers } from '../context/SocketContext';
import { useSpotifyNowPlaying } from '../hooks/useSpotifyNowPlaying';
import { canShowProfileActivities } from '../utils/profileActivities';
import Avatar from './Avatar';

const SPOTIFY_ICON_PATH =
  'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z';

const ActiveNowFriendCard = memo(function ActiveNowFriendCard({ friend, onClick }) {
  const { t } = useLanguage();
  const { isUserOnline } = useOnlineUsers();
  const activitiesVisible = canShowProfileActivities({
    isOwnProfile: false,
    userId: friend.id,
    isUserOnline,
  });
  const spotifyEnabled =
    activitiesVisible && !!(friend.spotify_connected || friend.spotify_now_playing);
  const { track } = useSpotifyNowPlaying({
    userId: friend.id,
    initialTrack: friend.spotify_now_playing,
    enabled: spotifyEnabled,
  });

  const displayName = friend.display_name || friend.username || t('chat.user');
  const hasMusic = !!track;
  const subtitle = hasMusic
    ? t('profile.listeningToSpotify')
    : (friend.status_message || t('friends.online'));

  return (
    <button
      type="button"
      className="fans-card"
      onClick={onClick}
      title={hasMusic && track.name ? `${displayName} — ${track.name}` : displayName}
    >
      <div className="fans-card-avatar-wrap">
        <Avatar user={friend} size="small" showPresence />
      </div>

      <div className="fans-card-meta">
        <span className="fans-card-name">{displayName}</span>
        <span className="fans-card-subtitle">{subtitle}</span>
      </div>

      {hasMusic && (
        <div className="fans-card-app" aria-hidden="true">
          {track.album_art ? (
            <img src={track.album_art} alt="" className="fans-card-app-img" />
          ) : (
            <div className="fans-card-app-fallback">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d={SPOTIFY_ICON_PATH} />
              </svg>
            </div>
          )}
        </div>
      )}
    </button>
  );
});

export default ActiveNowFriendCard;
