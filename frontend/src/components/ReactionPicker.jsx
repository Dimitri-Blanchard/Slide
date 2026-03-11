import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getRecentEmojis, saveRecentEmoji } from './StickerPicker';
import { emojiToShortcode, shortcodeToEmoji } from '../utils/emojiShortcodes';
import { emojiToAranjaUrl } from '../utils/emojiAranja';
import { searchEmojis } from '../utils/emojiSearch';
import './ReactionPicker.css';

const EMOJI_CATEGORIES = [
  {
    id: 'recent', name: 'Récents', icon: '🕐', emojis: []
  },
  {
    id: 'smileys', name: 'Smileys', icon: '😀',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😋','😛','😜','🤪','😝','🤗','🤭','🤫','🤔','🤨','😐','😏','😒','🙄',
      '😬','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵',
      '🤯','🤠','🥳','😎','🤓','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧',
      '😨','😰','😥','😢','😭','😱','😖','😣','😞','😤','😡','😠','🤬','💀','☠️','💩',
      '🤡','👻','👽','🤖','😺','😸','😹','😻','😼','😽'
    ]
  },
  {
    id: 'people', name: 'Gestes', icon: '👋',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏',
      '✍️','💅','💪','🦾','👂','🦻','👃','👀','👁️','👅','👄','💋','👶','🧒','👦','👧',
      '🧑','👨','👩','🧓','👴','👵','🙍','🙎','🙅','🙆','🙋','🙇','🤦','🤷'
    ]
  },
  {
    id: 'hearts', name: 'Symboles', icon: '❤️',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','❤️‍🔥','❤️‍🩹','💔','❣️','💕','💞','💓',
      '💗','💖','💘','💝','💟','♥️','✨','⭐','🌟','💫','🔥','💥','⚡','☀️','🌈','❄️',
      '💧','🌊','🎵','🎶','🔔','📣','💬','💭','🎉','🎊','🎁','🏆','🥇','🥈','🥉',
      '⚠️','🚫','❌','⭕','✅','❓','❔','❗','💯','💢'
    ]
  },
  {
    id: 'nature', name: 'Nature', icon: '🐶',
    emojis: [
      '🐶','🐕','🐺','🦊','🦝','🐱','🐈','🦁','🐯','🐴','🦄','🐮','🐷','🐗','🐏','🐑',
      '🐪','🦒','🐘','🦏','🐭','🐹','🐰','🐿️','🦔','🦇','🐻','🐻‍❄️','🐨','🐼','🦃','🐔',
      '🐣','🐤','🐦','🐧','🕊️','🦅','🦆','🦉','🐸','🐊','🐢','🦎','🐍','🐲','🐉','🐳',
      '🐋','🐬','🐟','🐠','🦈','🐙','🦋','🐛','🐜','🐝','🐞','🌸','🌺','🌻','🌷','🌹',
      '🥀','🪷','💐','🌿','☘️','🍀','🌵','🌴','🌳','🌲'
    ]
  },
  {
    id: 'food', name: 'Nourriture', icon: '🍔',
    emojis: [
      '🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍑','🥭','🍍','🥥','🍅','🥑','🥦','🌶️',
      '🌽','🥕','🥔','🍞','🥐','🥯','🧀','🥚','🍳','🥞','🥓','🍔','🍟','🍕','🌮','🌯',
      '🍝','🍜','🍣','🍱','🍦','🍰','🎂','🍩','🍪','🍿','☕','🍵','🥤','🍺','🍻','🥂','🍷'
    ]
  },
  {
    id: 'flags', name: 'Drapeaux', icon: '🏳️',
    emojis: [
      '🏳️','🏴','🏁','🚩','🏳️‍🌈','🏳️‍⚧️','🇫🇷','🇺🇸','🇬🇧','🇩🇪','🇪🇸','🇮🇹','🇵🇹','🇧🇷',
      '🇨🇦','🇲🇽','🇯🇵','🇰🇷','🇨🇳','🇷🇺','🇮🇳','🇦🇺','🇧🇪','🇨🇭','🇳🇱','🇸🇪','🇳🇴','🇩🇰',
      '🇫🇮','🇵🇱','🇦🇹','🇮🇪','🇬🇷','🇹🇷','🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇻🇪','🇪🇬','🇿🇦',
      '🇳🇬','🇰🇪','🇲🇦','🇹🇳','🇸🇦','🇦🇪','🇮🇱','🇹🇭','🇻🇳','🇮🇩','🇵🇭','🇲🇾','🇸🇬'
    ]
  }
];

const ALL_EMOJIS_FLAT = EMOJI_CATEGORIES.slice(1).flatMap(c => c.emojis);

const ReactionPicker = memo(function ReactionPicker({ x, y, onSelect, onClose }) {
  const pickerRef = useRef(null);
  const searchRef = useRef(null);
  const gridRef = useRef(null);
  const [activeCategory, setActiveCategory] = useState('smileys');
  const [search, setSearch] = useState('');

  const recentEmojis = useMemo(() => getRecentEmojis().slice(0, 24), []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) onClose();
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const handleSelect = useCallback((emojiChar) => {
    const shortcode = emojiToShortcode(emojiChar);
    saveRecentEmoji(shortcode);
    onSelect(shortcode);
    onClose();
  }, [onSelect, onClose]);

  const categories = useMemo(() => {
    const cats = EMOJI_CATEGORIES.map(c => ({ ...c }));
    cats[0] = { ...cats[0], emojis: recentEmojis };
    return cats;
  }, [recentEmojis]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) return null;
    const allowedSet = new Set(ALL_EMOJIS_FLAT);
    const semanticResults = searchEmojis(search, allowedSet);
    const q = search.toLowerCase().trim();
    const categoryMatches = ALL_EMOJIS_FLAT.filter(e => {
      const cat = EMOJI_CATEGORIES.find(c => c.emojis.includes(e));
      return cat && cat.name.toLowerCase().includes(q);
    });
    const seen = new Set(semanticResults);
    const merged = [...semanticResults];
    for (const emoji of categoryMatches) {
      if (!seen.has(emoji)) {
        seen.add(emoji);
        merged.push(emoji);
      }
    }
    return merged;
  }, [search]);

  const handleCategoryClick = useCallback((catId) => {
    setSearch('');
    setActiveCategory(catId);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, []);

  const activeCat = categories.find(c => c.id === activeCategory) || categories[1];
  const displayEmojis = filteredEmojis || (activeCategory === 'recent' ? recentEmojis : activeCat.emojis);
  const hasRecent = recentEmojis.length > 0;

  const style = {
    left: Math.min(Math.max(10, x - 160), window.innerWidth - 340),
    top: Math.max(10, Math.min(y - 200, window.innerHeight - 420)),
  };

  return createPortal(
    <div className="reaction-picker" ref={pickerRef} style={style}>
      <div className="reaction-picker-search">
        <svg className="reaction-picker-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={searchRef}
          className="reaction-picker-search-input"
          type="text"
          placeholder="Rechercher un emoji..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="reaction-picker-category-tabs">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`reaction-picker-tab ${activeCategory === cat.id ? 'active' : ''} ${cat.id === 'recent' && !hasRecent ? 'disabled' : ''}`}
            onClick={() => { if (cat.id === 'recent' && !hasRecent) return; handleCategoryClick(cat.id); }}
            title={cat.name}
            disabled={cat.id === 'recent' && !hasRecent}
          >
            {(() => {
              const iconUrl = emojiToAranjaUrl(cat.icon);
              return iconUrl ? <img src={iconUrl} alt={cat.name} /> : cat.icon;
            })()}
          </button>
        ))}
      </div>

      <div className="reaction-picker-grid-container" ref={gridRef}>
        {!filteredEmojis && (
          <div className="reaction-picker-category-label">{activeCat.name}</div>
        )}
        {filteredEmojis && (
          <div className="reaction-picker-category-label">
            {filteredEmojis.length > 0 ? `Résultats (${filteredEmojis.length})` : 'Aucun résultat'}
          </div>
        )}
        {displayEmojis.length > 0 ? (
          <div className="reaction-picker-grid">
            {displayEmojis.map((emojiOrShortcode, idx) => {
              const emojiChar = shortcodeToEmoji(emojiOrShortcode);
              const aranjaUrl = emojiToAranjaUrl(emojiChar);
              return (
                <button
                  key={`${emojiOrShortcode}-${idx}`}
                  className="reaction-picker-emoji"
                  onClick={() => handleSelect(emojiOrShortcode)}
                  title={emojiChar}
                >
                  {aranjaUrl ? (
                    <img src={aranjaUrl} alt={emojiChar} />
                  ) : (
                    emojiChar
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="reaction-picker-empty">
            {activeCategory === 'recent' ? 'Aucun emoji récent' : 'Aucun résultat'}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

// Format reaction tooltip text (without emoji - emoji rendered separately as img)
function formatReactionTooltipText(r) {
  const users = r?.users || [];
  if (!users.length) return 'Réaction';
  const maxShown = 3;
  if (users.length <= maxShown) {
    return `${users.join(', ')} ont réagi avec`;
  }
  const shown = users.slice(0, maxShown).join(', ');
  const others = users.length - maxShown;
  return `${shown} et ${others} autre${others > 1 ? 's' : ''} ont réagi avec`;
}

export const MessageReactions = memo(function MessageReactions({
  reactions = [],
  currentUserId,
  onToggleReaction
}) {
  const list = Array.isArray(reactions) ? reactions : [];
  if (list.length === 0) return null;

  return (
    <div className="message-reactions">
      {list.filter(Boolean).map((r) => {
        const hasReacted = r?.userIds?.includes(currentUserId);
        const emojiChar = shortcodeToEmoji(r.emoji);
        const aranjaUrl = emojiToAranjaUrl(emojiChar);
        return (
          <button
            key={r.emoji}
            className={`message-reaction ${hasReacted ? 'reacted' : ''}`}
            onClick={() => onToggleReaction(r.emoji, hasReacted)}
          >
            <span className="reaction-emoji">
              {aranjaUrl ? <img src={aranjaUrl} alt={emojiChar} /> : emojiChar}
            </span>
            <span className="reaction-count">{r.count}</span>
            <span className="reaction-tooltip">
              {formatReactionTooltipText(r)}{' '}
              {aranjaUrl ? <img src={aranjaUrl} alt={emojiChar} className="reaction-tooltip-emoji" /> : emojiChar}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default ReactionPicker;
