import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { users, messages as messagesApi } from '../api';
import Avatar from './Avatar';
import ProfileCard from './ProfileCard';
import { usePrefetchOnHover } from '../context/PrefetchContext';
import { useLanguage } from '../context/LanguageContext';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './SearchModal.css';

export default function SearchModal({ isOpen, onClose, conversations, teams }) {
  const enterInstant = useModalEnterAnimation('search-modal', isOpen);
  const { onMouseEnter, onMouseLeave } = usePrefetchOnHover();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ users: [], conversations: [], teams: [], messages: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [profileCardState, setProfileCardState] = useState({ userId: null, anchorEl: null });
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  
  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      setQuery('');
      setResults({ users: [], conversations: [], teams: [], messages: [] });
      setSelectedIndex(0);
    }
  }, [isOpen]);
  
  // Search logic
  useEffect(() => {
    if (!query.trim()) {
      setResults({ users: [], conversations: [], teams: [], messages: [] });
      return;
    }
    
    const searchTerm = query.toLowerCase();
    
    // Search local data first
    const matchedConversations = (conversations || []).filter(c => {
      const participant = c.participants?.[0];
      const name = participant?.display_name || '';
      return name.toLowerCase().includes(searchTerm);
    }).slice(0, 5);
    
    const matchedTeams = (teams || []).filter(t => {
      return t.name?.toLowerCase().includes(searchTerm);
    }).slice(0, 5);
    
    setResults(prev => ({
      ...prev,
      conversations: matchedConversations,
      teams: matchedTeams,
    }));
    
    // Search users + messages from API (debounced when query >= 2 chars)
    if (query.length >= 2) {
      setLoading(true);
      Promise.all([
        users.search(query),
        messagesApi.search(query, 10),
      ])
        .then(([usersData, messagesData]) => {
          setResults(prev => ({
            ...prev,
            users: (usersData || []).slice(0, 5),
            messages: (messagesData || []).slice(0, 10),
          }));
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    } else {
      setResults(prev => ({ ...prev, users: [], messages: [] }));
    }
  }, [query, conversations, teams]);
  
  // All results combined for keyboard navigation
  const allResults = [
    ...results.messages.map(m => ({ type: 'message', data: m })),
    ...results.conversations.map(c => ({ type: 'conversation', data: c })),
    ...results.teams.map(t => ({ type: 'team', data: t })),
    ...results.users.map(u => ({ type: 'user', data: u })),
  ];
  
  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, allResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      e.preventDefault();
      handleSelect(allResults[selectedIndex]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }, [allResults, selectedIndex, onClose]);
  
  const handleSelect = useCallback(async (item) => {
    if (item.type === 'conversation') {
      onClose();
      navigate(`/channels/@me/${item.data.conversation_id}`);
    } else if (item.type === 'team') {
      onClose();
      navigate(`/team/${item.data.id}`);
    } else if (item.type === 'user') {
      setProfileCardState({ userId: item.data.id, anchorEl: item._anchorEl || null });
    } else if (item.type === 'message') {
      const m = item.data;
      onClose();
      if (m.type === 'channel') {
        navigate(`/team/${m.team_id}/channel/${m.channel_id}`, { state: { highlightMessageId: m.id } });
      } else {
        navigate(`/channels/@me/${m.conversation_id}`, { state: { highlightMessageId: m.id } });
      }
    }
  }, [navigate, onClose]);
  
  if (!isOpen) return null;
  
  const modal = (
    <div className={`search-modal-overlay${enterInstant ? ' modal-enter-instant' : ''}`} onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()}>
        <div className="search-modal-header">
          <svg className="search-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('search.placeholder')}
            className="search-modal-input"
          />
          <kbd className="search-modal-kbd">ESC</kbd>
        </div>
        
        {query.trim() && (
          <div className="search-modal-results">
            {loading && (
              <div className="search-modal-skeleton">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="search-result-skeleton">
                    <div className="search-result-skeleton-avatar" />
                    <div className="search-result-skeleton-content">
                      <div className="search-result-skeleton-line" />
                      <div className="search-result-skeleton-line short" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {!loading && allResults.length === 0 && (
              <div className="search-modal-empty">{t('search.noResults')}</div>
            )}
            
            {results.messages.length > 0 && (
              <div className="search-results-section">
                <div className="search-results-title">{t('search.messages')}</div>
                {results.messages.map((msg, i) => {
                  const globalIndex = i;
                  const preview = (msg.content || '').substring(0, 60) + ((msg.content || '').length > 60 ? '…' : '');
                  const ctx = msg.type === 'channel' ? `#${msg.channel_name} · ${msg.team_name}` : t('search.directMessage');
                  return (
                    <button
                      key={`${msg.type}-${msg.id}`}
                      className={`search-result-item search-result-message ${selectedIndex === globalIndex ? 'selected' : ''}`}
                      onClick={() => handleSelect({ type: 'message', data: msg })}
                    >
                      <Avatar user={msg.sender} size="small" />
                      <div className="search-result-message-content">
                        <span className="search-result-message-preview">{preview}</span>
                        <span className="search-result-message-context">{ctx}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            
            {results.conversations.length > 0 && (
              <div className="search-results-section">
                <div className="search-results-title">{t('search.conversations')}</div>
                {results.conversations.map((conv, i) => {
                  const globalIndex = results.messages.length + i;
                  const participant = conv.participants?.[0];
                  return (
                    <button
                      key={conv.conversation_id}
                      className={`search-result-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                      onClick={() => handleSelect({ type: 'conversation', data: conv })}
                      onMouseEnter={participant?.id ? () => onMouseEnter(participant.id, participant) : undefined}
                      onMouseLeave={participant ? onMouseLeave : undefined}
                    >
                      <Avatar user={participant} size="small" />
                      <span className="search-result-name">{participant?.display_name || t('chat.user')}</span>
                    </button>
                  );
                })}
              </div>
            )}
            
            {results.teams.length > 0 && (
              <div className="search-results-section">
                <div className="search-results-title">{t('search.teams')}</div>
                {results.teams.map((team, i) => {
                  const globalIndex = results.messages.length + results.conversations.length + i;
                  return (
                    <button
                      key={team.id}
                      className={`search-result-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                      onClick={() => handleSelect({ type: 'team', data: team })}
                    >
                      <div className="search-result-team-icon">
                        {team.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="search-result-name">{team.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
            
            {results.users.length > 0 && (
              <div className="search-results-section">
                <div className="search-results-title">{t('search.users')}</div>
                {results.users.map((user, i) => {
                  const globalIndex = results.messages.length + results.conversations.length + results.teams.length + i;
                  return (
                    <button
                      key={user.id}
                      className={`search-result-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                      onClick={(e) => handleSelect({ type: 'user', data: user, _anchorEl: e.currentTarget })}
                      onMouseEnter={() => onMouseEnter(user.id, user)}
                      onMouseLeave={onMouseLeave}
                    >
                      <Avatar user={user} size="small" />
                      <span className="search-result-name">{user.display_name || user.email}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        
        {!query.trim() && (
          <div className="search-modal-tips">
            <div className="search-modal-tip">
              <kbd>↑↓</kbd>
              <span>{t('search.navigate')}</span>
            </div>
            <div className="search-modal-tip">
              <kbd>↵</kbd>
              <span>{t('search.select')}</span>
            </div>
            <div className="search-modal-tip">
              <kbd>ESC</kbd>
              <span>{t('common.close')}</span>
            </div>
          </div>
        )}
      </div>
      
      <ProfileCard
        userId={profileCardState.userId}
        isOpen={!!profileCardState.userId}
        onClose={() => {
          setProfileCardState({ userId: null, anchorEl: null });
          onClose();
        }}
        anchorEl={profileCardState.anchorEl}
        position="right"
      />
    </div>
  );

  return createPortal(modal, document.body);
}
