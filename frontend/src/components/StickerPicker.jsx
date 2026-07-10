import React, { useState, useEffect, memo, useRef, useCallback, useMemo } from 'react';
import { stickers as stickersApi, media as mediaApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { emojiToAranjaUrl } from '../utils/emojiAranja';
import { emojiToShortcode, shortcodeToEmoji } from '../utils/emojiShortcodes';
import { searchEmojis } from '../utils/emojiSearch';
import './StickerPicker.css';
import './StickerPicker.discord.css';

// Storage key for recent emojis
const RECENT_EMOJIS_KEY = 'slide_recent_emojis';
const MAX_RECENT_EMOJIS = 32;

// Storage key for GIF favorites (user's own favorites)
const GIF_FAVORITES_KEY = 'slide_gif_favorites';
const MAX_GIF_FAVORITES = 50;

const getGifFavorites = () => {
  try {
    const raw = localStorage.getItem(GIF_FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveGifFavorites = (list) => {
  try {
    localStorage.setItem(GIF_FAVORITES_KEY, JSON.stringify(list.slice(0, MAX_GIF_FAVORITES)));
  } catch {
    // Ignore storage errors
  }
};

const addGifFavorite = (gif) => {
  const list = getGifFavorites();
  if (list.some(f => String(f.id) === String(gif.id))) return list;
  const item = {
    id: gif.id,
    title: gif.title || '',
    preview: gif.preview || gif.url,
    url: gif.url || gif.image_url,
    image_url: gif.url || gif.image_url,
    width: gif.width,
    height: gif.height
  };
  const next = [item, ...list];
  saveGifFavorites(next);
  return next;
};

const removeGifFavorite = (gifId) => {
  const list = getGifFavorites().filter(f => String(f.id) !== String(gifId));
  saveGifFavorites(list);
  return list;
};

const isGifFavorite = (gifId) => getGifFavorites().some(f => f.id === gifId);

// Emoji categories - use simple char codes for tab icons (avoids Electron rendering issues)
const EMOJI_CATEGORIES = [
  { name: 'Recent', icon: '\u231A', emojis: [] },
  {
    name: 'Smileys',
    icon: '\uD83D\uDE00',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫',
      '🤔', '🤐', '🤨', '😐', '😑', '😶', '😶‍🌫️', '😏', '😒', '🙄',
      '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕',
      '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '😵‍💫', '🤯', '🤠',
      '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮',
      '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢',
      '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤',
      '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹',
      '👺', '👻', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻',
      '😼', '😽', '🙀', '😿', '😾'
    ]
  },
  { name: 'Gestures', icon: '\uD83D\uDC4B',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉',
      '👆', '🖕', '👇', '☝️', '🫵', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅',
      '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠',
      '🫀', '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸',
      '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓',
      '👴', '👵', '🙍', '🙎', '🙅', '🙆', '💁', '🙋', '🧏', '🙇',
      '🤦', '🤷', '👮', '🕵️', '💂', '🥷', '👷', '🫅', '🤴', '👸'
    ]
  },
  { name: 'Hearts', icon: '\u2764\uFE0F',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '❤️‍🔥',
      '❤️‍🩹', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '♥️', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '💮', '🏵️',
      '🌼', '🌻', '🌷', '🪷', '🪻', '💒', '💑', '👩‍❤️‍👨', '👨‍❤️‍👨', '👩‍❤️‍👩',
      '💏', '👩‍❤️‍💋‍👨', '👨‍❤️‍💋‍👨', '👩‍❤️‍💋‍👩', '🫂', '💋', '😘', '😍', '🥰', '😻'
    ]
  },
  { name: 'Animals', icon: '\uD83D\uDC36',
    emojis: [
      '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈',
      '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌',
      '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏',
      '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛',
      '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🦇',
      '🐻', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾',
      '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅',
      '🦆', '🦢', '🦉', '🦤', '🪶', '🦩', '🦚', '🦜', '🐸', '🐊',
      '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬',
      '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🪸', '🐌', '🦋',
      '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🕸️', '🦂',
      '🦟', '🪰', '🪱', '🦠'
    ]
  },
  { name: 'Food', icon: '\uD83C\uDF54',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑',
      '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅',
      '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳',
      '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🦴', '🌭', '🍔',
      '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗',
      '🥘', '🫕', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪',
      '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧',
      '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫',
      '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🫗', '🍼', '🫖',
      '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷',
      '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'
    ]
  },
  { name: 'Travel', icon: '\u2708\uFE0F',
    emojis: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐',
      '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵',
      '🏍️', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🛞', '🚡', '🚠',
      '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆',
      '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺', '🛰️', '🚀',
      '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓',
      '🪝', '⛽', '🚧', '🚦', '🚥', '🛑', '🚏', '🗺️', '🗿', '🗽',
      '🗼', '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️',
      '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🛖', '🏠',
      '🏡', '🏘️', '🏚️', '🏗️', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥',
      '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍',
      '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑', '🏞️', '🌅', '🌄',
      '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁'
    ]
  },
  { name: 'Activities', icon: '\u26BD',
    emojis: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱',
      '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳',
      '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷',
      '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤸', '🤺', '⛹️',
      '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚴',
      '🚵', '🎮', '🕹️', '🎲', '🧩', '♟️', '🎯', '🎳', '🎰', '🧸',
      '🪅', '🪆', '🎨', '🎭', '🎪', '🎤', '🎧', '🎼', '🎹', '🥁',
      '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎬', '🏆', '🥇',
      '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹'
    ]
  },
  { name: 'Objects', icon: '\uD83D\uDCA1',
    emojis: [
      '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽',
      '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️',
      '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭',
      '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🪫', '🔌',
      '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶',
      '💷', '🪙', '💰', '💳', '🪪', '💎', '⚖️', '🪜', '🧰', '🪛',
      '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚', '🔩', '⚙️', '🪤', '🧱',
      '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️',
      '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '🪬', '💈',
      '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '🩻', '🩼', '💊', '💉',
      '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻',
      '🚽', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴',
      '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆'
    ]
  },
  { name: 'Symbols', icon: '\u2728',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '✨', '⭐',
      '🌟', '💫', '✴️', '🔥', '💥', '⚡', '☀️', '🌈', '☁️', '❄️',
      '💧', '🌊', '🎵', '🎶', '🔔', '🔕', '📣', '📢', '💬', '💭',
      '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🎉', '🎊',
      '🎁', '🎗️', '🏆', '🥇', '🥈', '🥉', '⚠️', '🚫', '❌', '⭕',
      '✅', '☑️', '✔️', '❓', '❔', '❕', '❗', '〽️', '⚕️', '♻️',
      '⚜️', '🔱', '📛', '🔰', '⭕', '✅', '☑️', '✔️', '➕', '➖',
      '➗', '✖️', '💯', '💢', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣',
      '⚫', '⚪', '🟤', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠',
      '🔘', '🔳', '🔲', '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️',
      '🏴‍☠️', '🇫🇷', '🇺🇸', '🇬🇧', '🇩🇪', '🇪🇸', '🇮🇹', '🇯🇵', '🇨🇳', '🇰🇷'
    ]
  },
  { name: 'Flags', icon: '\uD83C\uDFF3\uFE0F',
    emojis: [
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇫', '🇦🇱',
      '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺',
      '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯',
      '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮',
      '🇨🇻', '🇰🇭', '🇨🇲', '🇨🇦', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇴', '🇰🇲',
      '🇨🇩', '🇨🇬', '🇨🇷', '🇭🇷', '🇨🇺', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲',
      '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇸🇿', '🇪🇹', '🇪🇺',
      '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭', '🇬🇷', '🇬🇹',
      '🇬🇳', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺', '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷',
      '🇮🇶', '🇮🇪', '🇮🇱', '🇮🇹', '🇯🇲', '🇯🇵', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇼',
      '🇱🇧', '🇱🇾', '🇱🇹', '🇱🇺', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇽', '🇲🇦',
      '🇳🇱', '🇳🇿', '🇳🇬', '🇳🇴', '🇵🇰', '🇵🇪', '🇵🇭', '🇵🇱', '🇵🇹', '🇶🇦',
      '🇷🇴', '🇷🇺', '🇸🇦', '🇸🇳', '🇷🇸', '🇸🇬', '🇸🇰', '🇸🇮', '🇿🇦', '🇰🇷',
      '🇪🇸', '🇱🇰', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇭', '🇹🇳', '🇹🇷', '🇺🇦',
      '🇦🇪', '🇬🇧', '🇺🇸', '🇺🇾', '🇻🇪', '🇻🇳', '🇾🇪', '🇿🇲', '🇿🇼'
    ]
  }
];

// Get recent emojis from localStorage
export const getRecentEmojis = () => {
  try {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save recent emoji to localStorage
export const saveRecentEmoji = (emoji) => {
  try {
    const recent = getRecentEmojis().filter(e => e !== emoji);
    recent.unshift(emoji);
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT_EMOJIS)));
  } catch {
    // Ignore storage errors
  }
};

const PickerSectionHeader = ({ children, count }) => (
  <div className="picker-section-header">
    <span className="picker-section-title">{children}</span>
    {count != null && <span className="picker-section-count">{count}</span>}
  </div>
);

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const StickerPicker = memo(function StickerPicker({
  isOpen,
  onClose,
  onSelect,
  onEmojiSelect,
  initialTab = 'emoji',
  anchorRef = null,
  variant = 'popover',
  onTabChange,
}) {
  const isPopover = variant === 'popover';
  const [activeTab, setActiveTab] = useState(initialTab);
  const setPickerTab = useCallback((tab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  }, [onTabChange]);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(1); // Start at Smileys (index 1), 0 is Recent
  const { t } = useLanguage();
  const [isMobileView, setIsMobileView] = useState(false);
  const [showEmojiSearchMobile, setShowEmojiSearchMobile] = useState(false);
  const [showGifSearchMobile, setShowGifSearchMobile] = useState(false);
  const [hoveredEmoji, setHoveredEmoji] = useState(null);
  const [hoveredSticker, setHoveredSticker] = useState(null);

  // Recent emojis state
  const [recentEmojis, setRecentEmojis] = useState(() => getRecentEmojis());

  // Emoji search state
  const [emojiSearch, setEmojiSearch] = useState('');

  // Build emoji categories with recent emojis
  const emojiCategoriesWithRecent = useMemo(() => {
    const cats = [...EMOJI_CATEGORIES];
    cats[0] = { ...cats[0], emojis: recentEmojis };
    return cats;
  }, [recentEmojis]);

  // Filtered emojis based on search (semantic: "hi", "hey", "yo" → waving, smiley, etc.)
  const filteredEmojis = useMemo(() => {
    if (!emojiSearch.trim()) return null;

    const allEmojis = EMOJI_CATEGORIES.flatMap(cat => cat.emojis);
    const allowedSet = new Set(allEmojis);

    // Advanced semantic search: synonyms + emojilib keywords
    const semanticResults = searchEmojis(emojiSearch, allowedSet);

    // Also match by category name (e.g. "smileys", "hearts")
    const searchLower = emojiSearch.toLowerCase();
    const categoryMatches = allEmojis.filter(emoji => {
      const cat = EMOJI_CATEGORIES.find(c => c.emojis.includes(emoji));
      return cat && cat.name.toLowerCase().includes(searchLower);
    });

    // Merge and dedupe, prefer semantic results first
    const seen = new Set(semanticResults);
    const merged = [...semanticResults];
    for (const emoji of categoryMatches) {
      if (!seen.has(emoji)) {
        seen.add(emoji);
        merged.push(emoji);
      }
    }
    return merged;
  }, [emojiSearch]);

  // Handle emoji click - passes shortcode for easier app management
  const handleEmojiClick = useCallback((emojiChar) => {
    const shortcode = emojiToShortcode(emojiChar);
    saveRecentEmoji(shortcode);
    setRecentEmojis(getRecentEmojis());
    if (onEmojiSelect) {
      onEmojiSelect(shortcode);
    }
  }, [onEmojiSelect]);

  const scrollToEmojiCategory = useCallback((index) => {
    setActiveEmojiCategory(index);
    const section = emojiSectionRefs.current[index];
    const container = emojiMainRef.current;
    if (section && container) {
      container.scrollTo({
        top: section.offsetTop - 8,
        behavior: 'smooth',
      });
    }
  }, []);

  const renderEmojiButton = useCallback((emojiOrShortcode, index) => {
    const emojiChar = shortcodeToEmoji(emojiOrShortcode);
    const aranjaUrl = emojiToAranjaUrl(emojiChar);
    const shortcode = emojiToShortcode(emojiOrShortcode);
    return (
      <button
        key={`${shortcode}-${index}`}
        type="button"
        className="emoji-item"
        onClick={() => handleEmojiClick(emojiOrShortcode)}
        onMouseEnter={() => setHoveredEmoji({ char: emojiChar, shortcode, aranjaUrl })}
        onMouseLeave={() => setHoveredEmoji(null)}
        onFocus={() => setHoveredEmoji({ char: emojiChar, shortcode, aranjaUrl })}
        onBlur={() => setHoveredEmoji(null)}
      >
        {aranjaUrl ? (
          <img src={aranjaUrl} alt={emojiChar} className="emoji-item-img" />
        ) : (
          emojiChar
        )}
      </button>
    );
  }, [handleEmojiClick]);

  // Stickers state
  const [stickerPacks, setStickerPacks] = useState([]);
  const [loadingStickers, setLoadingStickers] = useState(true);
  const [activePack, setActivePack] = useState(null);
  const [hidingPack, setHidingPack] = useState(false);

  // Emojis state
  const [emojis, setEmojis] = useState([]);
  const [emojiCategories, setEmojiCategories] = useState([]);
  const [loadingEmojis, setLoadingEmojis] = useState(true);

  // GIFs state
  const [gifs, setGifs] = useState([]);
  const [gifSearch, setGifSearch] = useState('');
  const [loadingGifs, setLoadingGifs] = useState(false);
  const [gifNextPos, setGifNextPos] = useState(null);
  const [gifCategories, setGifCategories] = useState([]);
  const [gifTrending, setGifTrending] = useState([]); // Store trending separately
  const [gifError, setGifError] = useState(null); // API error message
  const [gifFavorites, setGifFavorites] = useState(() => getGifFavorites());
  const [activeGifView, setActiveGifView] = useState(null); // 'favorites' | searchterm
  const [gifScreen, setGifScreen] = useState('categories'); // 'categories' | 'browse'

  const panelRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const gifContainerRef = useRef(null);
  const emojiMainRef = useRef(null);
  const emojiSearchInputRef = useRef(null);
  const gifSearchInputRef = useRef(null);
  const emojiSectionRefs = useRef([]);
  
  // ═══════════════════════════════════════════════════════════
  // Load Stickers
  // ═══════════════════════════════════════════════════════════
  const loadStickers = useCallback(() => {
    setLoadingStickers(true);
    stickersApi.getAll()
      .then((packs) => {
        setStickerPacks(packs);
        if (packs.length > 0 && !packs.find(p => p.id === activePack)) {
          setActivePack(packs[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingStickers(false));
  }, [activePack]);
  
  // Hide a sticker pack
  const handleHidePack = async (packId, e) => {
    e.stopPropagation();
    if (hidingPack) return;
    setHidingPack(true);
    try {
      await stickersApi.hidePack(packId);
      setStickerPacks(prev => {
        const newPacks = prev.filter(p => p.id !== packId);
        if (activePack === packId && newPacks.length > 0) {
          setActivePack(newPacks[0].id);
        }
        return newPacks;
      });
    } catch (err) {
      console.error('Error hiding pack:', err);
    } finally {
      setHidingPack(false);
    }
  };
  
  // ═══════════════════════════════════════════════════════════
  // Load Emojis from public folder
  // ═══════════════════════════════════════════════════════════
  const loadEmojis = useCallback(async () => {
    setLoadingEmojis(true);
    try {
      // Try to load from backend first
      const data = await mediaApi.getEmojis();
      setEmojiCategories(data.categories || []);
      setEmojis(data.emojis || []);
    } catch (err) {
      console.error('Error loading emojis from API:', err);
      // Fallback: scan the public/assets/emojis folder via import.meta.glob
      // For Vite, we can use dynamic import
      try {
        // Try to load emoji manifest or use static list
        const emojiModules = import.meta.glob('/assets/emojis/*.{png,gif,jpg,webp}', { eager: true, query: '?url', import: 'default' });
        const loadedEmojis = Object.entries(emojiModules).map(([path, url]) => {
          const filename = path.split('/').pop();
          const name = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
          return { id: name, name, url, category: 'custom' };
        });
        setEmojis(loadedEmojis);
        if (loadedEmojis.length > 0) {
          setEmojiCategories([{ name: 'custom', label: '⭐ Custom' }]);
        }
      } catch (e) {
        console.error('Failed to load emojis:', e);
        setEmojis([]);
      }
    } finally {
      setLoadingEmojis(false);
    }
  }, []);
  
  // ═══════════════════════════════════════════════════════════
  // Load GIFs (Tenor)
  // ═══════════════════════════════════════════════════════════
  const loadTrendingGifs = useCallback(async (reset = true) => {
    if (reset) {
      setLoadingGifs(true);
      setGifs([]);
      setGifError(null);
    }
    try {
      const data = await mediaApi.trendingGifs(30);
      const newGifs = data.gifs || [];
      const apiError = data.error || null;
      if (reset) {
        setGifs(newGifs);
        setGifTrending(newGifs);
        setGifError(apiError);
      } else {
        setGifs(prev => [...prev, ...newGifs]);
      }
      setGifNextPos(data.next);
    } catch (err) {
      console.error('Error loading trending GIFs:', err);
      if (reset) {
        setGifs([]);
        setGifError(err.message || 'Failed to load GIFs');
      }
    } finally {
      setLoadingGifs(false);
    }
  }, []);

  const searchGifs = useCallback(async (query, reset = true) => {
    if (!query.trim()) {
      // Show cached trending if available
      if (gifTrending.length > 0) {
        setGifs(gifTrending);
        setGifError(null);
        return;
      }
      loadTrendingGifs();
      return;
    }
    if (reset) {
      setLoadingGifs(true);
      setGifs([]);
      setGifError(null);
    }
    try {
      const data = await mediaApi.searchGifs(query, 30);
      const newGifs = data.gifs || [];
      if (reset) {
        setGifs(newGifs);
        setGifError(data.error || null);
      } else {
        setGifs(prev => [...prev, ...newGifs]);
      }
      setGifNextPos(data.next);
    } catch (err) {
      console.error('Error searching GIFs:', err);
      if (reset) setGifError(err.message || 'Failed to search GIFs');
    } finally {
      setLoadingGifs(false);
    }
  }, [loadTrendingGifs, gifTrending]);

  const loadMoreGifs = useCallback(async () => {
    if (!gifNextPos || loadingGifs) return;
    setLoadingGifs(true);
    try {
      const data = gifSearch.trim()
        ? await mediaApi.searchGifs(gifSearch, 30, gifNextPos)
        : await mediaApi.trendingGifs(30, gifNextPos);
      setGifs(prev => [...prev, ...(data.gifs || [])]);
      setGifNextPos(data.next);
    } catch (err) {
      console.error('Error loading more GIFs:', err);
    } finally {
      setLoadingGifs(false);
    }
  }, [gifNextPos, loadingGifs, gifSearch]);

  const loadGifCategories = useCallback(async () => {
    try {
      const data = await mediaApi.gifCategories();
      setGifCategories(data.categories || []);
    } catch (err) {
      console.error('Error loading GIF categories:', err);
    }
  }, []);

  const openGifBrowse = useCallback((view) => {
    setGifError(null);
    setGifScreen('browse');
    if (view === 'favorites') {
      setActiveGifView('favorites');
      setGifSearch('');
      setGifs(gifFavorites);
      setGifNextPos(null);
      return;
    }
    setActiveGifView(view);
    setGifSearch(view);
    searchGifs(view);
  }, [gifFavorites, searchGifs]);

  const showGifCategoryHome = useCallback(() => {
    setGifScreen('categories');
    setGifSearch('');
    setGifError(null);
    setGifs([]);
    setGifNextPos(null);
    setActiveGifView(null);
  }, []);

  // Toggle GIF favorite
  const toggleGifFavorite = useCallback((gif, e) => {
    e.stopPropagation();
    e.preventDefault();
    const favs = getGifFavorites();
    const isFav = favs.some(f => String(f.id) === String(gif.id));
    const next = isFav ? removeGifFavorite(gif.id) : addGifFavorite(gif);
    setGifFavorites(next);
    if (activeGifView === 'favorites') {
      setGifs(next);
    }
  }, [activeGifView]);

  // Infinite scroll for GIFs
  const handleGifScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 200 && !loadingGifs && gifNextPos) {
      loadMoreGifs();
    }
  }, [loadingGifs, gifNextPos, loadMoreGifs]);
  
  // Handle GIF search input
  const handleGifSearchChange = useCallback((e) => {
    const value = e.target.value;
    setGifSearch(value);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!value.trim()) {
      showGifCategoryHome();
      return;
    }

    setGifScreen('browse');
    setActiveGifView(value.trim());
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(value);
    }, 300);
  }, [searchGifs, showGifCategoryHome]);
  
  // ═══════════════════════════════════════════════════════════
  // Load content when tab changes or picker opens
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen) return;
    
    if (activeTab === 'stickers') {
      loadStickers();
    } else if (activeTab === 'gifs') {
      setGifFavorites(getGifFavorites());
      setGifScreen('categories');
      setActiveGifView(null);
      setGifSearch('');
      setGifs([]);
      setGifError(null);
      loadGifCategories();
    }
    // Emoji tab uses static EMOJI_CATEGORIES constant, no loading needed
  }, [isOpen, activeTab, loadStickers, loadGifCategories]);

  // Detect phone layout and keep UI behavior in sync
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobileView(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setShowEmojiSearchMobile(false);
      setShowGifSearchMobile(false);
      setHoveredEmoji(null);
      setHoveredSticker(null);
      return;
    }
    setShowEmojiSearchMobile(false);
    setShowGifSearchMobile(false);
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (showEmojiSearchMobile) emojiSearchInputRef.current?.focus();
  }, [showEmojiSearchMobile]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      if (activeTab === 'emoji') emojiSearchInputRef.current?.focus();
      else if (activeTab === 'gifs') gifSearchInputRef.current?.focus();
    });
  }, [isOpen, activeTab]);

  // Highlight sidebar category while scrolling emoji sections
  useEffect(() => {
    if (!isOpen || activeTab !== 'emoji' || filteredEmojis) return undefined;
    const container = emojiMainRef.current;
    if (!container) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (!visible[0]) return;
        const index = Number(visible[0].target.id.replace('emoji-section-', ''));
        if (!Number.isNaN(index)) setActiveEmojiCategory(index);
      },
      { root: container, threshold: [0.1, 0.35, 0.6], rootMargin: '-8% 0px -55% 0px' }
    );

    emojiSectionRefs.current.forEach((section) => {
      if (section) observer.observe(section);
    });

    return () => observer.disconnect();
  }, [isOpen, activeTab, filteredEmojis, emojiCategoriesWithRecent]);
  
  useEffect(() => {
    if (isOpen && initialTab) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Close on outside click (popover mode)
  useEffect(() => {
    if (!isOpen || !isPopover) return undefined;

    const handlePointerDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen, isPopover, onClose, anchorRef]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  // Cleanup
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);
  
  if (!isOpen) return null;
  
  const activeStickerPack = stickerPacks.find(p => p.id === activePack);
  
  // ═══════════════════════════════════════════════════════════
  // Handle selection
  // ═══════════════════════════════════════════════════════════
  const handleSelect = (item, type) => {
    onSelect({ ...item, type });
  };
  
  const showEmojiSearch = isPopover || !isMobileView || showEmojiSearchMobile;
  const showGifSearch = isPopover || !isMobileView || showGifSearchMobile;

  return (
    <div ref={panelRef} className={`sticker-panel ${isPopover ? 'sticker-panel-popover' : ''}`}>
      {!isPopover && (
        <div className="sticker-panel-header">
          <div className="sticker-panel-tabs">
            <button
              type="button"
              className={`sticker-panel-tab ${activeTab === 'gifs' ? 'active' : ''}`}
              onClick={() => setPickerTab('gifs')}
            >
              GIFs
            </button>
            <button
              type="button"
              className={`sticker-panel-tab ${activeTab === 'stickers' ? 'active' : ''}`}
              onClick={() => setPickerTab('stickers')}
            >
              {t('stickers.stickers') || 'Stickers'}
            </button>
            <button
              type="button"
              className={`sticker-panel-tab ${activeTab === 'emoji' ? 'active' : ''}`}
              onClick={() => setPickerTab('emoji')}
            >
              {t('stickers.emojis') || 'Emoji'}
            </button>
          </div>
          {isMobileView && (activeTab === 'emoji' || activeTab === 'gifs') && (
            <button
              type="button"
              className={`sticker-panel-search-toggle ${(showEmojiSearchMobile || showGifSearchMobile) ? 'active' : ''}`}
              onClick={() => {
                if (activeTab === 'emoji') {
                  setShowGifSearchMobile(false);
                  setShowEmojiSearchMobile(v => !v);
                } else if (activeTab === 'gifs') {
                  setShowEmojiSearchMobile(false);
                  setShowGifSearchMobile(v => !v);
                }
              }}
              title={t('common.search') || 'Search'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>
          )}
          {!isMobileView && (
            <button type="button" className="sticker-panel-close" onClick={onClose} title={t('common.close') || 'Close'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          EMOJI TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'emoji' && (
        <div className={`picker-tab-content emoji-picker-content ${isMobileView && showEmojiSearchMobile ? 'mobile-search-active' : ''}`}>
          {showEmojiSearch && (
            <div className={`picker-search-row ${isMobileView ? 'mobile-search-popout' : ''}`}>
              <div className="picker-search-wrapper">
                <svg className="picker-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={emojiSearchInputRef}
                  type="text"
                  className="picker-search-input"
                  placeholder={t('stickers.searchEmojis') || 'Find the perfect emoji'}
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                />
                {emojiSearch && (
                  <button type="button" className="picker-search-clear" onClick={() => setEmojiSearch('')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="picker-body">
            {!filteredEmojis && (
              <div className="picker-sidebar" role="tablist" aria-label="Emoji categories">
                {emojiCategoriesWithRecent.map((cat, index) => {
                  const CatIcon = cat.icon;
                  const iconUrl = typeof CatIcon === 'string' ? emojiToAranjaUrl(CatIcon) : null;
                  const isDisabled = index === 0 && recentEmojis.length === 0;
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      role="tab"
                      aria-selected={activeEmojiCategory === index}
                      className={`picker-sidebar-btn ${activeEmojiCategory === index ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                      onClick={() => {
                        if (isDisabled) return;
                        scrollToEmojiCategory(index);
                      }}
                      title={cat.name === 'Recent' ? (t('stickers.recentEmojis') || 'Frequently Used') : cat.name}
                      disabled={isDisabled}
                    >
                      {index === 0 ? (
                        <ClockIcon />
                      ) : typeof CatIcon === 'function' ? (
                        <CatIcon size={18} />
                      ) : iconUrl ? (
                        <img src={iconUrl} alt="" />
                      ) : (
                        CatIcon
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="picker-main emoji-grid-container" ref={emojiMainRef}>
              {filteredEmojis ? (
                <>
                  <PickerSectionHeader count={filteredEmojis.length}>
                    {t('common.searchResults') || 'Search Results'}
                  </PickerSectionHeader>
                  {filteredEmojis.length > 0 ? (
                    <div className="emoji-grid">
                      {filteredEmojis.map((emojiOrShortcode, index) => renderEmojiButton(emojiOrShortcode, index))}
                    </div>
                  ) : (
                    <div className="emoji-no-results">
                      <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        <path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/>
                      </svg>
                      <p>{t('stickers.noEmojisFound') || 'No emojis found'}</p>
                    </div>
                  )}
                </>
              ) : (
                emojiCategoriesWithRecent.map((cat, index) => {
                  if (index === 0 && recentEmojis.length === 0) return null;
                  const sectionTitle = cat.name === 'Recent'
                    ? (t('stickers.recentEmojis') || 'Frequently Used')
                    : cat.name;
                  return (
                    <section
                      key={cat.name}
                      id={`emoji-section-${index}`}
                      className="picker-section"
                      ref={(el) => { emojiSectionRefs.current[index] = el; }}
                    >
                      <PickerSectionHeader>{sectionTitle}</PickerSectionHeader>
                      {cat.emojis.length > 0 ? (
                        <div className="emoji-grid">
                          {cat.emojis.map((emojiOrShortcode, emojiIndex) => renderEmojiButton(emojiOrShortcode, emojiIndex))}
                        </div>
                      ) : (
                        <div className="emoji-no-results compact">
                          <p>{t('stickers.noRecentEmojis') || 'No recent emojis'}</p>
                          <small>{t('stickers.useEmojiToAdd') || 'Use emojis to add them here'}</small>
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          STICKERS TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'stickers' && (
        <div className="picker-tab-content stickers-picker-content">
          {loadingStickers ? (
            <div className="sticker-panel-loading">
              <span className="sticker-panel-spinner" />
              <span>{t('common.loading')}</span>
            </div>
          ) : stickerPacks.length === 0 ? (
            <div className="sticker-panel-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/>
                <path d="M15 3v6h6"/>
              </svg>
              <p>{t('stickers.noStickers')}</p>
              <span>{t('stickers.joinGroup')}</span>
            </div>
          ) : (
            <>
              <div className="picker-body">
                <div className="picker-sidebar picker-sidebar-stickers" role="tablist" aria-label="Sticker packs">
                  {stickerPacks.map(pack => (
                    <button
                      key={pack.id}
                      type="button"
                      role="tab"
                      aria-selected={activePack === pack.id}
                      className={`picker-sidebar-btn picker-sidebar-pack ${activePack === pack.id ? 'active' : ''}`}
                      onClick={() => setActivePack(pack.id)}
                      title={pack.name}
                    >
                      {pack.stickers.length > 0 ? (
                        <img src={pack.stickers[0].image_url} alt="" />
                      ) : (
                        <span className="picker-sidebar-pack-placeholder">{pack.name.charAt(0).toUpperCase()}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="picker-main sticker-panel-content">
                  {activeStickerPack && (
                    <>
                      <div className="picker-section-header sticker-pack-header">
                        <div className="sticker-pack-header-text">
                          <span className="sticker-pack-name">{activeStickerPack.name}</span>
                          <span className="sticker-pack-team">{activeStickerPack.team_name}</span>
                        </div>
                        <button
                          type="button"
                          className="sticker-pack-remove"
                          onClick={(e) => handleHidePack(activeStickerPack.id, e)}
                          disabled={hidingPack}
                          title={t('stickers.removePack')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      </div>
                      <div className="sticker-panel-grid">
                        {activeStickerPack.stickers.map(sticker => (
                          <button
                            key={sticker.id}
                            type="button"
                            className="sticker-item"
                            onClick={() => handleSelect(sticker, 'sticker')}
                            onMouseEnter={() => setHoveredSticker({ name: sticker.name, url: sticker.image_url })}
                            onMouseLeave={() => setHoveredSticker(null)}
                            onFocus={() => setHoveredSticker({ name: sticker.name, url: sticker.image_url })}
                            onBlur={() => setHoveredSticker(null)}
                            title={sticker.name}
                          >
                            <img src={sticker.image_url} alt={sticker.name} />
                          </button>
                        ))}
                        {activeStickerPack.stickers.length === 0 && (
                          <div className="sticker-pack-empty">{t('stickers.packEmpty')}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          GIF TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'gifs' && (
        <div className={`picker-tab-content gif-picker-content ${isMobileView && showGifSearchMobile ? 'mobile-search-active' : ''}`}>
          {showGifSearch && (
            <div className={`picker-search-row gif-picker-search-row ${isMobileView ? 'mobile-search-popout' : ''}`}>
              {gifScreen === 'browse' && !gifSearch && (
                <button
                  type="button"
                  className="gif-picker-back"
                  onClick={showGifCategoryHome}
                  title={t('common.back') || 'Back'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                </button>
              )}
              <div className="picker-search-wrapper">
                <svg className="picker-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={gifSearchInputRef}
                  type="text"
                  className="picker-search-input"
                  placeholder={t('stickers.searchGifs') || 'Find the perfect GIF'}
                  value={gifSearch}
                  onChange={handleGifSearchChange}
                />
                {gifSearch && (
                  <button
                    type="button"
                    className="picker-search-clear"
                    onClick={showGifCategoryHome}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {gifScreen === 'categories' && !gifSearch.trim() ? (
            <div className="gif-categories-fullscreen">
              <div className="gif-categories-grid gif-categories-grid-full">
                <button
                  type="button"
                  className="gif-category-tile gif-tile-favorites"
                  onClick={() => openGifBrowse('favorites')}
                  title={t('stickers.favorites') || 'Favorites'}
                >
                  <span className="gif-tile-icon">★</span>
                  <span className="gif-tile-label">{t('stickers.favorites') || 'Favorites'}</span>
                  {gifFavorites.length > 0 && (
                    <span className="gif-tile-count">{gifFavorites.length}</span>
                  )}
                </button>
                {gifCategories.map(cat => (
                  <button
                    key={cat.searchterm}
                    type="button"
                    className="gif-category-tile gif-tile-category"
                    onClick={() => openGifBrowse(cat.searchterm)}
                    title={cat.name}
                  >
                    {cat.image && <img src={cat.image} alt="" className="gif-tile-bg" loading="lazy" />}
                    <span className="gif-tile-label">{cat.name}</span>
                  </button>
                ))}
              </div>
              <a href="https://klipy.com" target="_blank" rel="noopener noreferrer" className="picker-gif-credit">
                Klipy
              </a>
            </div>
          ) : (
            <div
              ref={gifContainerRef}
              className="picker-main gif-grid-container gif-browse-main"
              onScroll={handleGifScroll}
            >
              {loadingGifs && gifs.length === 0 ? (
                <div className="gif-loading">
                  <div className="gif-loading-spinner" />
                  <span>{t('common.loading') || 'Loading...'}</span>
                </div>
              ) : gifs.length === 0 ? (
                <div className="gif-empty">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <p>{activeGifView === 'favorites' ? (t('stickers.noFavorites') || 'No favorites yet') : (t('stickers.noGifsFound') || 'No GIFs found')}</p>
                  {gifError ? (
                    <small className="gif-error-msg">{gifError}</small>
                  ) : activeGifView === 'favorites' ? (
                    <small>{t('stickers.addFavoritesHint') || 'Click the star on any GIF to add it here'}</small>
                  ) : (
                    <small>{t('stickers.tryDifferentSearch') || 'Try a different search'}</small>
                  )}
                </div>
              ) : (
                <>
                  <div className="gif-masonry">
                    <div className="gif-masonry-column">
                      {gifs.filter((_, i) => i % 2 === 0).map(gif => (
                        <button
                          key={gif.id}
                          type="button"
                          className="gif-item"
                          onClick={() => handleSelect({ ...gif, image_url: gif.url || gif.image_url }, 'gif')}
                          title={gif.title}
                        >
                          <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" />
                          <button
                            type="button"
                            className={`gif-item-fav ${gifFavorites.some(f => String(f.id) === String(gif.id)) ? 'active' : ''}`}
                            onClick={(e) => toggleGifFavorite(gif, e)}
                            title={gifFavorites.some(f => String(f.id) === String(gif.id)) ? (t('stickers.removeFavorite') || 'Remove from favorites') : (t('stickers.addFavorite') || 'Add to favorites')}
                          >
                            ★
                          </button>
                        </button>
                      ))}
                    </div>
                    <div className="gif-masonry-column">
                      {gifs.filter((_, i) => i % 2 === 1).map(gif => (
                        <button
                          key={gif.id}
                          type="button"
                          className="gif-item"
                          onClick={() => handleSelect({ ...gif, image_url: gif.url || gif.image_url }, 'gif')}
                          title={gif.title}
                        >
                          <img src={gif.preview || gif.url} alt={gif.title} loading="lazy" />
                          <button
                            type="button"
                            className={`gif-item-fav ${gifFavorites.some(f => String(f.id) === String(gif.id)) ? 'active' : ''}`}
                            onClick={(e) => toggleGifFavorite(gif, e)}
                            title={gifFavorites.some(f => String(f.id) === String(gif.id)) ? (t('stickers.removeFavorite') || 'Remove from favorites') : (t('stickers.addFavorite') || 'Add to favorites')}
                          >
                            ★
                          </button>
                        </button>
                      ))}
                    </div>
                  </div>
                  {loadingGifs && (
                    <div className="gif-loading-more">
                      <div className="gif-loading-spinner small" />
                    </div>
                  )}
                  <a href="https://klipy.com" target="_blank" rel="noopener noreferrer" className="picker-gif-credit">
                    Klipy
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default StickerPicker;
