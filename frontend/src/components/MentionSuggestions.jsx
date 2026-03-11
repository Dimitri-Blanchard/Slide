import React, { memo, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, Hash } from 'lucide-react';
import Avatar from './Avatar';
import { useLanguage } from '../context/LanguageContext';
import './MentionSuggestions.css';

const MentionSuggestions = memo(function MentionSuggestions({
  query,
  users = [],
  x,
  y,
  onSelect,
  onClose,
  showSpecial = true
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);
  const { t } = useLanguage();
  
  // Filter users based on query
  const filteredUsers = users.filter(u => 
    u.display_name?.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);
  
  // Build suggestions list
  const suggestions = [];
  
  if (showSpecial) {
    if ('everyone'.includes(query.toLowerCase())) {
      suggestions.push({ type: 'special', id: 'everyone', name: 'everyone', description: t('mentions.notifyEveryone') });
    }
    if ('channel'.includes(query.toLowerCase())) {
      suggestions.push({ type: 'special', id: 'channel', name: 'channel', description: t('mentions.notifyChannel') });
    }
  }
  
  filteredUsers.forEach(u => {
    suggestions.push({ type: 'user', id: u.id, name: u.display_name, user: u });
  });
  
  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (suggestions.length === 0) return;
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % suggestions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex].name);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [suggestions, selectedIndex, onSelect, onClose]);
  
  // Scroll selected item into view
  useEffect(() => {
    const selectedEl = containerRef.current?.querySelector('.mention-suggestion.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);
  
  if (suggestions.length === 0) return null;
  
  // Position adjustment
  const style = {
    left: Math.min(x, window.innerWidth - 280),
    bottom: window.innerHeight - y + 10,
  };
  
  return createPortal(
    <div className="mention-suggestions" ref={containerRef} style={style}>
      {suggestions.map((suggestion, index) => (
        <div
          key={`${suggestion.type}-${suggestion.id}`}
          className={`mention-suggestion ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion.name)}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          {suggestion.type === 'special' ? (
            <>
              <div className="mention-special-icon">
                {suggestion.id === 'everyone' ? <Users size={18} /> : <Hash size={18} />}
              </div>
              <div className="mention-info">
                <span className="mention-name">@{suggestion.name}</span>
                <span className="mention-description">{suggestion.description}</span>
              </div>
            </>
          ) : (
            <>
              <Avatar user={suggestion.user} size="small" />
              <div className="mention-info">
                <span className="mention-name">{suggestion.name}</span>
              </div>
            </>
          )}
        </div>
      ))}
    </div>,
    document.body
  );
});

export default MentionSuggestions;
