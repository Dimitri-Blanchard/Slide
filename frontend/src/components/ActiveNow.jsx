import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { friends as friendsApi, direct as directApi } from '../api';
import { useOnlineUsers } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import Avatar, { AvatarImg } from './Avatar';
import './ActiveNow.css';

export default function ActiveNow() {
  const [activeFriends, setActiveFriends] = useState([]);
  const { onlineUsers, isUserOnline } = useOnlineUsers();
  const { t } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    friendsApi.online()
      .then(data => setActiveFriends(data || []))
      .catch(() => setActiveFriends([]));
  }, [onlineUsers]);

  const handleClick = async (friend) => {
    try {
      const conv = await directApi.createConversation(friend.id);
      navigate(`/channels/@me/${conv.conversation_id}`);
    } catch { /* ignore */ }
  };

  return (
    <aside className="active-now-panel">
      <h2 className="active-now-title">{t('activeNow.title')}</h2>
      {activeFriends.length === 0 ? (
        <div className="active-now-empty">
          <p className="active-now-empty-title">{t('activeNow.empty')}</p>
          <p className="active-now-empty-desc">{t('activeNow.emptyDesc')}</p>
        </div>
      ) : (
        <div className="active-now-list">
          {activeFriends.map(friend => (
            <div key={friend.id} className="active-now-card" onClick={() => handleClick(friend)}>
              <div className="active-now-avatar">
                <Avatar user={friend} size="medium" showPresence />
              </div>
              <div className="active-now-info">
                <span className="active-now-name">{friend.display_name}</span>
                {friend.status_message && (
                  <span className="active-now-activity">
                    {friend.status_message}
                  </span>
                )}
                {friend.activity && (
                  <div className="active-now-game">
                    {friend.activity_icon && <AvatarImg src={friend.activity_icon} alt="" className="active-now-game-icon" />}
                    <div className="active-now-game-info">
                      <span className="active-now-game-name">{friend.activity}</span>
                      {friend.activity_detail && <span className="active-now-game-detail">{friend.activity_detail}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
