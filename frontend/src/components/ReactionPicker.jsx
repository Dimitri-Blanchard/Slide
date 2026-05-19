import React, { memo, useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getRecentEmojis, saveRecentEmoji } from './StickerPicker';
import { emojiToShortcode, shortcodeToEmoji } from '../utils/emojiShortcodes';
import { emojiToAranjaUrl } from '../utils/emojiAranja';
import { searchEmojis } from '../utils/emojiSearch';
import { useLanguage } from '../context/LanguageContext';
import { getReactionTooltipBoundary, measureReactionTooltip } from '../utils/reactionTooltipPosition';
import './ReactionPicker.css';

const TOOLTIP_SHOW_DELAY_MS = 350;
const TOOLTIP_HIDE_DELAY_MS = 80;

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

const MAX_TOOLTIP_NAMES = 3;

function joinDisplayNames(names, language) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) {
    return language === 'fr' ? `${names[0]} et ${names[1]}` : `${names[0]} and ${names[1]}`;
  }
  const last = names[names.length - 1];
  const rest = names.slice(0, -1).join(', ');
  return language === 'fr' ? `${rest} et ${last}` : `${rest}, and ${last}`;
}

const ReactionHoverTooltip = memo(function ReactionHoverTooltip({
  anchorRef,
  open,
  emojiShortcode,
  emojiChar,
  aranjaUrl,
  users,
  totalCount,
  onViewOthers,
  onPointerEnter,
  onPointerLeave,
}) {
  const { t, language } = useLanguage();
  const tooltipRef = useRef(null);
  const [coords, setCoords] = useState(null);

  const names = (users || []).filter(Boolean);
  const total = Math.max(totalCount ?? names.length, names.length);
  const namesToShow = names.slice(0, MAX_TOOLTIP_NAMES);
  const othersCount = Math.max(0, total - namesToShow.length);
  const displayShortcode = emojiShortcode?.startsWith(':') ? emojiShortcode : `:${emojiShortcode || 'emoji'}:`;

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    setCoords(measureReactionTooltip(anchor, tooltip));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updatePosition();
  }, [open, updatePosition, emojiShortcode, users, totalCount, language]);

  useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const boundary = getReactionTooltipBoundary(anchor);
    const scrollRoot = boundary?.classList?.contains('message-list')
      ? boundary
      : anchor?.closest('.message-list') || boundary;

    const onReflow = () => requestAnimationFrame(updatePosition);
    window.addEventListener('resize', onReflow);
    scrollRoot?.addEventListener('scroll', onReflow, { passive: true });
    window.addEventListener('scroll', onReflow, { passive: true, capture: true });

    return () => {
      window.removeEventListener('resize', onReflow);
      scrollRoot?.removeEventListener('scroll', onReflow);
      window.removeEventListener('scroll', onReflow, { capture: true });
    };
  }, [open, anchorRef, updatePosition]);

  const handleOthersClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    onViewOthers?.();
  }, [onViewOthers]);

  if (!open) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className={`reaction-tooltip reaction-tooltip--positioned${coords ? ' reaction-tooltip--visible' : ''}`}
      role="tooltip"
      style={{
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        maxWidth: coords?.maxWidth,
      }}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <div className="reaction-tooltip-emoji-wrap" aria-hidden="true">
        {aranjaUrl ? (
          <img src={aranjaUrl} alt="" className="reaction-tooltip-emoji-lg" />
        ) : (
          <span className="reaction-tooltip-emoji-lg">{emojiChar}</span>
        )}
      </div>
      <div className="reaction-tooltip-content">
        <span className="reaction-tooltip-shortcode">{displayShortcode}</span>{' '}
        <span className="reaction-tooltip-label">{t('chat.reactionTooltipReactedBy')}</span>{' '}
        {namesToShow.length > 0 ? (
          <>
            <span className="reaction-tooltip-names">{joinDisplayNames(namesToShow, language)}</span>
            {othersCount > 0 && (
              <>
                {', '}
                <button
                  type="button"
                  className="reaction-tooltip-others"
                  onClick={handleOthersClick}
                  disabled={!onViewOthers}
                >
                  {othersCount === 1
                    ? t('chat.reactionTooltipAndOneOther')
                    : t('chat.reactionTooltipAndOthers', { count: othersCount })}
                </button>
              </>
            )}
          </>
        ) : othersCount > 0 ? (
          <button
            type="button"
            className="reaction-tooltip-others"
            onClick={handleOthersClick}
            disabled={!onViewOthers}
          >
            {othersCount === 1
              ? t('chat.reactionTooltipAndOneOther')
              : t('chat.reactionTooltipAndOthers', { count: othersCount })}
          </button>
        ) : (
          <span className="reaction-tooltip-names">—</span>
        )}
      </div>
    </div>,
    document.body,
  );
});

const MessageReactionButton = memo(function MessageReactionButton({
  reaction,
  hasReacted,
  onToggleReaction,
  onViewAllReactions,
}) {
  const btnRef = useRef(null);
  const showTimerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const emojiChar = shortcodeToEmoji(reaction.emoji);
  const emojiShortcode = emojiToShortcode(reaction.emoji);
  const aranjaUrl = emojiToAranjaUrl(emojiChar);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleShow = useCallback(() => {
    clearHideTimer();
    clearShowTimer();
    showTimerRef.current = setTimeout(() => setTooltipOpen(true), TOOLTIP_SHOW_DELAY_MS);
  }, [clearHideTimer, clearShowTimer]);

  const scheduleHide = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setTooltipOpen(false), TOOLTIP_HIDE_DELAY_MS);
  }, [clearShowTimer, clearHideTimer]);

  useEffect(() => () => {
    clearShowTimer();
    clearHideTimer();
  }, [clearShowTimer, clearHideTimer]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`message-reaction ${hasReacted ? 'reacted' : ''}`}
        onClick={() => onToggleReaction(reaction.emoji, hasReacted)}
        onMouseEnter={scheduleShow}
        onMouseLeave={scheduleHide}
        onFocus={scheduleShow}
        onBlur={scheduleHide}
      >
        <span className="reaction-emoji">
          {aranjaUrl ? <img src={aranjaUrl} alt={emojiChar} /> : emojiChar}
        </span>
        <span className="reaction-count">{reaction.count}</span>
      </button>
      <ReactionHoverTooltip
        anchorRef={btnRef}
        open={tooltipOpen}
        emojiShortcode={emojiShortcode}
        emojiChar={emojiChar}
        aranjaUrl={aranjaUrl}
        users={reaction.users}
        totalCount={reaction.count}
        onViewOthers={onViewAllReactions}
        onPointerEnter={scheduleShow}
        onPointerLeave={scheduleHide}
      />
    </>
  );
});

export const MessageReactions = memo(function MessageReactions({
  reactions = [],
  currentUserId,
  onToggleReaction,
  onViewAllReactions,
}) {
  const list = Array.isArray(reactions) ? reactions : [];
  if (list.length === 0) return null;

  return (
    <div className="message-reactions">
      {list.filter(Boolean).map((r) => (
        <MessageReactionButton
          key={r.emoji}
          reaction={r}
          hasReacted={r?.userIds?.includes(currentUserId)}
          onToggleReaction={onToggleReaction}
          onViewAllReactions={onViewAllReactions}
        />
      ))}
    </div>
  );
});

export default ReactionPicker;
