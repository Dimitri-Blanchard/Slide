import React, { useState, useEffect, memo, useRef, useCallback, useMemo } from 'react';
import { stickers as stickersApi, media as mediaApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { emojiToAranjaUrl } from '../utils/emojiAranja';
import { emojiToShortcode, shortcodeToEmoji } from '../utils/emojiShortcodes';
import { searchEmojis } from '../utils/emojiSearch';
import './StickerPicker.css';

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

const StickerPicker = memo(function StickerPicker({ isOpen, onClose, onSelect, onEmojiSelect }) {
  const [activeTab, setActiveTab] = useState('emoji'); // 'emoji', 'stickers', 'gifs'
  const [activeEmojiCategory, setActiveEmojiCategory] = useState(1); // Start at Smileys (index 1), 0 is Recent
  const { t } = useLanguage();
  const [isMobileView, setIsMobileView] = useState(false);
  const [showEmojiSearchMobile, setShowEmojiSearchMobile] = useState(false);
  const [showGifSearchMobile, setShowGifSearchMobile] = useState(false);

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
  const [activeGifView, setActiveGifView] = useState(null); // 'favorites' | null (trending/search)
  const [gifScreen, setGifScreen] = useState('categories'); // 'categories' = pick type first | 'gifs' = view/send GIFs

  const panelRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const gifContainerRef = useRef(null);
  const emojiSearchInputRef = useRef(null);
  const gifSearchInputRef = useRef(null);
  
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
    
    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchGifs(value);
    }, 300);
  }, [searchGifs]);
  
  // ═══════════════════════════════════════════════════════════
  // Load content when tab changes or picker opens
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isOpen) return;
    
    if (activeTab === 'stickers') {
      loadStickers();
    } else if (activeTab === 'gifs') {
      setGifFavorites(getGifFavorites());
      setActiveGifView(null);
      setGifScreen('categories');
      loadGifCategories();
      loadTrendingGifs(); // Preload trending so it's ready when user taps "Trending GIFs"
    }
    // Emoji tab uses static EMOJI_CATEGORIES constant, no loading needed
  }, [isOpen, activeTab, loadStickers, loadTrendingGifs, loadGifCategories]);

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
      return;
    }
    setShowEmojiSearchMobile(false);
    setShowGifSearchMobile(false);
  }, [activeTab, gifScreen, isOpen]);

  useEffect(() => {
    if (showEmojiSearchMobile) emojiSearchInputRef.current?.focus();
  }, [showEmojiSearchMobile]);

  useEffect(() => {
    if (showGifSearchMobile) gifSearchInputRef.current?.focus();
  }, [showGifSearchMobile]);
  
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
  
  return (
    <div ref={panelRef} className="sticker-panel">
      {/* Header with tabs */}
      <div className="sticker-panel-header">
        <div className="sticker-panel-tabs">
          <button
            className={`sticker-panel-tab ${activeTab === 'emoji' ? 'active' : ''}`}
            onClick={() => setActiveTab('emoji')}
            title={t('stickers.emojis') || 'Emojis'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
              <line x1="9" y1="9" x2="9.01" y2="9"/>
              <line x1="15" y1="9" x2="15.01" y2="9"/>
            </svg>
            <span className="tab-label">{t('stickers.emojis') || 'Emojis'}</span>
          </button>
          <button
            className={`sticker-panel-tab ${activeTab === 'stickers' ? 'active' : ''}`}
            onClick={() => setActiveTab('stickers')}
            title={t('stickers.stickers') || 'Stickers'}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
            <span className="tab-label">{t('stickers.stickers') || 'Stickers'}</span>
          </button>
          <button
            className={`sticker-panel-tab ${activeTab === 'gifs' ? 'active' : ''}`}
            onClick={() => setActiveTab('gifs')}
            title="GIFs"
          >
            <svg className="gif-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="4" width="20" height="16" rx="3"/>
              <path d="M8 10h2v4H8z"/>
              <path d="M12 10h2v4"/>
              <path d="M17 10h-1v4h1a2 2 0 000-4"/>
            </svg>
            <span className="tab-label">GIFs</span>
          </button>
        </div>
        {isMobileView && (activeTab === 'emoji' || (activeTab === 'gifs' && gifScreen === 'gifs')) && (
          <button
            className={`sticker-panel-search-toggle ${(showEmojiSearchMobile || showGifSearchMobile) ? 'active' : ''}`}
            onClick={() => {
              if (activeTab === 'emoji') {
                setShowGifSearchMobile(false);
                setShowEmojiSearchMobile(v => !v);
              } else if (activeTab === 'gifs' && gifScreen === 'gifs') {
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
          <button className="sticker-panel-close" onClick={onClose} title={t('common.close') || 'Fermer'}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
      
      {/* ═══════════════════════════════════════════════════════════
          STICKERS TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'stickers' && (
        <>
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
              <div className="sticker-panel-packs">
                {stickerPacks.map(pack => (
                  <button
                    key={pack.id}
                    className={`sticker-pack-tab ${activePack === pack.id ? 'active' : ''}`}
                    onClick={() => setActivePack(pack.id)}
                    title={`${pack.name} (${pack.team_name})`}
                  >
                    <div className="sticker-pack-tab-icon">
                      {pack.stickers.length > 0 ? (
                        <img src={pack.stickers[0].image_url} alt={pack.name} />
                      ) : (
                        <span className="sticker-pack-tab-placeholder">
                          {pack.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="sticker-pack-tab-name">{pack.name}</span>
                    <span className="sticker-pack-tab-count">{pack.stickers.length}</span>
                  </button>
                ))}
              </div>
              
              <div className="sticker-panel-content">
                {activeStickerPack && (
                  <>
                    <div className="sticker-pack-info">
                      <div className="sticker-pack-details">
                        <span className="sticker-pack-name">{activeStickerPack.name}</span>
                        <span className="sticker-pack-team">{activeStickerPack.team_name}</span>
                      </div>
                      <button 
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
                          className="sticker-item"
                          onClick={() => handleSelect(sticker, 'sticker')}
                          title={sticker.name}
                        >
                          <img src={sticker.image_url} alt={sticker.name} />
                        </button>
                      ))}
                      {activeStickerPack.stickers.length === 0 && (
                        <div className="sticker-pack-empty">
                          {t('stickers.packEmpty')}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </>
      )}
      
      {/* ═══════════════════════════════════════════════════════════
          EMOJI TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'emoji' && (
        <div className={`emoji-picker-content ${isMobileView && showEmojiSearchMobile ? 'mobile-search-active' : ''}`}>
          {/* Search bar */}
          {(!isMobileView || showEmojiSearchMobile) && (
            <div className={`emoji-search-container ${isMobileView ? 'mobile-search-popout' : ''}`}>
              <div className="emoji-search-wrapper">
                <svg className="emoji-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input
                  ref={emojiSearchInputRef}
                  type="text"
                  className="emoji-search-input"
                  placeholder={t('stickers.searchEmojis') || 'Rechercher un emoji...'}
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                />
                {emojiSearch && (
                  <button
                    className="emoji-search-clear"
                    onClick={() => setEmojiSearch('')}
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

          {/* Search results */}
          {filteredEmojis ? (
            <div className="emoji-grid-container">
              <div className="emoji-category-name">
                {t('common.searchResults') || 'Résultats'} ({filteredEmojis.length})
              </div>
              {filteredEmojis.length > 0 ? (
                <div className="emoji-grid">
                  {filteredEmojis.map((emojiOrShortcode, index) => {
                    const emojiChar = shortcodeToEmoji(emojiOrShortcode);
                    const aranjaUrl = emojiToAranjaUrl(emojiChar);
                    return (
                      <button
                        key={index}
                        className="emoji-item"
                        onClick={() => handleEmojiClick(emojiOrShortcode)}
                      >
                        {aranjaUrl ? (
                          <img src={aranjaUrl} alt={emojiChar} className="emoji-item-img" />
                        ) : (
                          emojiChar
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="emoji-no-results">
                  <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    <path d="m13.5 8.5-5 5"/><path d="m8.5 8.5 5 5"/>
                  </svg>
                  <p>{t('stickers.noEmojisFound') || 'Aucun emoji trouvé'}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Category tabs */}
              <div className="emoji-category-tabs">
                {emojiCategoriesWithRecent.map((cat, index) => {
                  const CatIcon = cat.icon;
                  const iconUrl = typeof CatIcon === 'string' ? emojiToAranjaUrl(CatIcon) : null;
                  return (
                    <button
                      key={cat.name}
                      className={`emoji-category-tab ${activeEmojiCategory === index ? 'active' : ''} ${index === 0 && recentEmojis.length === 0 ? 'disabled' : ''}`}
                      onClick={() => {
                        if (index === 0 && recentEmojis.length === 0) return;
                        setActiveEmojiCategory(index);
                      }}
                      title={cat.name}
                      disabled={index === 0 && recentEmojis.length === 0}
                    >
                      {typeof CatIcon === 'function' ? <CatIcon size={18} /> : iconUrl ? <img src={iconUrl} alt={cat.name} /> : CatIcon}
                    </button>
                  );
                })}
              </div>

              {/* Emoji grid */}
              <div className="emoji-grid-container">
                <div className="emoji-category-name">
                  {emojiCategoriesWithRecent[activeEmojiCategory].name === 'Recent'
                    ? (t('stickers.recentEmojis') || 'Récents')
                    : emojiCategoriesWithRecent[activeEmojiCategory].name
                  }
                </div>
                {emojiCategoriesWithRecent[activeEmojiCategory].emojis.length > 0 ? (
                  <div className="emoji-grid">
                    {emojiCategoriesWithRecent[activeEmojiCategory].emojis.map((emojiOrShortcode, index) => {
                      const emojiChar = shortcodeToEmoji(emojiOrShortcode);
                      const aranjaUrl = emojiToAranjaUrl(emojiChar);
                      return (
                        <button
                          key={index}
                          className="emoji-item"
                          onClick={() => handleEmojiClick(emojiOrShortcode)}
                        >
                          {aranjaUrl ? (
                            <img src={aranjaUrl} alt={emojiChar} className="emoji-item-img" />
                          ) : (
                            emojiChar
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="emoji-no-results">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <p>{t('stickers.noRecentEmojis') || 'Aucun emoji récent'}</p>
                    <small>{t('stickers.useEmojiToAdd') || 'Utilisez des emojis pour les ajouter ici'}</small>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
      
      {/* ═══════════════════════════════════════════════════════════
          GIF TAB
          ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'gifs' && (
        <div className={`gif-picker-content ${isMobileView && showGifSearchMobile ? 'mobile-search-active' : ''}`}>
          {gifScreen === 'categories' ? (
            /* ═══ SCREEN 1: Pick a GIF type (full screen) ═══ */
            <div className="gif-categories-fullscreen">
              <p className="gif-categories-title">{t('stickers.chooseGifType') || 'Choose a type of GIFs'}</p>
              <div className="gif-categories-grid gif-categories-grid-full">
                <button
                  className="gif-category-tile gif-tile-favorites"
                  onClick={() => {
                    setActiveGifView('favorites');
                    setGifSearch('');
                    setGifError(null);
                    setGifs(gifFavorites);
                    setGifNextPos(null);
                    setGifScreen('gifs');
                  }}
                  title={t('stickers.favorites') || 'Favorites'}
                >
                  <span className="gif-tile-icon">★</span>
                  <span className="gif-tile-label">{t('stickers.favorites') || 'Favorites'}</span>
                  {gifFavorites.length > 0 && (
                    <span className="gif-tile-count">{gifFavorites.length}</span>
                  )}
                </button>
                <button
                  className="gif-category-tile gif-tile-trending"
                  onClick={() => {
                    setActiveGifView(null);
                    setGifSearch('');
                    setGifError(null);
                    setGifScreen('gifs');
                    if (gifTrending.length > 0) {
                      setGifs(gifTrending);
                    } else {
                      loadTrendingGifs();
                    }
                  }}
                >
                  {gifTrending[0]?.preview && (
                    <img src={gifTrending[0].preview} alt="" className="gif-tile-bg" />
                  )}
                  <span className="gif-tile-icon gif-trend-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                      <polyline points="17 6 23 6 23 12"/>
                    </svg>
                  </span>
                  <span className="gif-tile-label">{t('stickers.trendingGifs') || 'Trending GIFs'}</span>
                </button>
                {gifCategories.slice(0, 8).map(cat => (
                  <button
                    key={cat.searchterm}
                    className="gif-category-tile gif-tile-category"
                    onClick={() => {
                      setActiveGifView(null);
                      setGifSearch(cat.searchterm);
                      setGifError(null);
                      setGifScreen('gifs');
                      searchGifs(cat.searchterm);
                    }}
                  >
                    {cat.image && <img src={cat.image} alt="" className="gif-tile-bg" />}
                    <span className="gif-tile-label">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ═══ SCREEN 2: View & send GIFs (with Back button) ═══ */
            <>
              <div className="gif-back-row">
                <button
                  type="button"
                  className="gif-back-btn"
                  onClick={() => setGifScreen('categories')}
                  title={t('common.back') || 'Back'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"/>
                  </svg>
                  {t('common.back') || 'Back'}
                </button>
                {!isMobileView && (
                  <div className="gif-search-container gif-search-inline">
                    <div className="gif-search-wrapper">
                      <svg className="gif-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.35-4.35"/>
                      </svg>
                      <input
                        type="text"
                        className="gif-search-input"
                        placeholder={t('stickers.searchGifs') || 'Search GIFs...'}
                        value={gifSearch}
                        onChange={handleGifSearchChange}
                      />
                      {gifSearch && (
                        <button
                          className="gif-search-clear"
                          onClick={() => {
                            setActiveGifView(null);
                            setGifSearch('');
                            setGifError(null);
                            if (gifTrending.length > 0) {
                              setGifs(gifTrending);
                            } else {
                              loadTrendingGifs();
                            }
                          }}
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
              </div>
              {isMobileView && showGifSearchMobile && (
                <div className="gif-search-container gif-search-popout">
                  <div className="gif-search-wrapper">
                    <svg className="gif-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      ref={gifSearchInputRef}
                      type="text"
                      className="gif-search-input"
                      placeholder={t('stickers.searchGifs') || 'Search GIFs...'}
                      value={gifSearch}
                      onChange={handleGifSearchChange}
                    />
                    {gifSearch && (
                      <button
                        className="gif-search-clear"
                        onClick={() => {
                          setActiveGifView(null);
                          setGifSearch('');
                          setGifError(null);
                          if (gifTrending.length > 0) {
                            setGifs(gifTrending);
                          } else {
                            loadTrendingGifs();
                          }
                        }}
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

              <div
                ref={gifContainerRef}
                className="gif-grid-container"
                onScroll={handleGifScroll}
              >
                {loadingGifs && gifs.length === 0 ? (
                  <div className="gif-loading">
                    <div className="gif-loading-spinner" />
                    <span>{t('common.loading') || 'Chargement...'}</span>
                  </div>
                ) : gifs.length === 0 ? (
                  <div className="gif-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <p>{activeGifView === 'favorites' ? (t('stickers.noFavorites') || 'No favorites yet') : (t('stickers.noGifsFound') || 'Aucun GIF trouvé')}</p>
                    {gifError ? (
                      <small className="gif-error-msg">{gifError}</small>
                    ) : activeGifView === 'favorites' ? (
                      <small>{t('stickers.addFavoritesHint') || 'Click the star on any GIF to add it here'}</small>
                    ) : (
                      <small>{t('stickers.tryDifferentSearch') || 'Essayez une autre recherche'}</small>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="gif-masonry">
                      <div className="gif-masonry-column">
                        {gifs.filter((_, i) => i % 2 === 0).map(gif => (
                          <button
                            key={gif.id}
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
                            <div className="gif-item-overlay">
                              <span className="gif-item-title">{gif.title}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="gif-masonry-column">
                        {gifs.filter((_, i) => i % 2 === 1).map(gif => (
                          <button
                            key={gif.id}
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
                            <div className="gif-item-overlay">
                              <span className="gif-item-title">{gif.title}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {loadingGifs && (
                      <div className="gif-loading-more">
                        <div className="gif-loading-spinner small" />
                      </div>
                    )}
                  </>
                )}
              </div>
              {/* Klipy attribution - Required by Klipy API */}
              <div className="tenor-attribution">
                <a href="https://klipy.com" target="_blank" rel="noopener noreferrer" className="tenor-link">
                  <span>Search via Klipy</span>
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default StickerPicker;
