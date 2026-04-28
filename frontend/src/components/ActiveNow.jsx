import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { friends as friendsApi, direct as directApi } from '../api';
import { useOnlineUsers } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import Avatar, { AvatarImg } from './Avatar';
import './ActiveNow.css';

const AN_DEFAULT_W = 340;
const AN_MIN_W = 200;
const AN_MAX_W = 480;
const AN_STORAGE_KEY = 'active-now-panel-width';

export default function ActiveNow() {
  const [activeFriends, setActiveFriends] = useState([]);
  const { onlineUsers, isUserOnline } = useOnlineUsers();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [width, setWidth] = useState(() => {
    try { const v = parseInt(localStorage.getItem(AN_STORAGE_KEY), 10); return v >= AN_MIN_W && v <= AN_MAX_W ? v : AN_DEFAULT_W; }
    catch { return AN_DEFAULT_W; }
  });
  const widthRef = useRef(width);
  widthRef.current = width;

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widthRef.current;
    const onMove = (ev) => {
      const next = Math.min(AN_MAX_W, Math.max(AN_MIN_W, startW + (startX - ev.clientX)));
      setWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      try { localStorage.setItem(AN_STORAGE_KEY, String(widthRef.current)); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

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
    <aside className="active-now-panel" style={{ width, minWidth: width }}>
      <div className="active-now-resize-handle" onMouseDown={handleResizeStart} />
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
