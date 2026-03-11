/**
 * Advanced emoji search: semantic/conceptual matching.
 * "hi", "hey", "yo", "sup" → waving, smiley, etc.
 * Uses emojilib keywords + custom synonym expansion.
 */
import emojilib from 'emojilib';

// ── Synonym expansion: user terms → search targets (keywords/shortcodes) ──
// When user types "yo", we also search for "hi", "hello", "wave", "greeting"
const EMOJI_SYNONYMS = {
  // Greetings / hi
  hi: ['hi', 'hello', 'hey', 'wave', 'greeting', 'goodbye', 'bye', 'yo', 'sup', 'howdy', 'greetings', 'wassup', 'whatsup'],
  whats: ['hi', 'hello', 'hey', 'wave', 'sup', 'yo'],
  wassup: ['hi', 'hello', 'hey', 'wave', 'sup', 'yo'],
  whatsup: ['hi', 'hello', 'hey', 'wave', 'sup', 'yo'],
  hey: ['hi', 'hello', 'hey', 'wave', 'greeting', 'yo', 'sup'],
  yo: ['hi', 'hello', 'hey', 'wave', 'yo', 'sup', 'greeting'],
  sup: ['hi', 'hello', 'hey', 'wave', 'sup', 'yo', 'greeting'],
  hello: ['hi', 'hello', 'wave', 'greeting', 'goodbye'],
  bye: ['bye', 'goodbye', 'wave', 'farewell', 'solong'],
  howdy: ['hi', 'hello', 'wave', 'howdy'],
  greetings: ['hi', 'hello', 'greeting', 'wave'],

  // Love / heart
  love: ['love', 'heart', 'like', 'affection', 'crush', 'valentines', 'kiss', 'adore'],
  heart: ['love', 'heart', 'like', 'affection'],
  like: ['love', 'like', 'heart', 'thumbsup', 'ok'],
  crush: ['love', 'crush', 'heart', 'blush'],
  kiss: ['kiss', 'love', 'heart', 'affection', 'lips'],

  // Happy / joy / laugh
  happy: ['happy', 'joy', 'smile', 'grin', 'laugh', 'glad', 'fun', 'haha', 'lol'],
  joy: ['happy', 'joy', 'smile', 'laugh'],
  smile: ['smile', 'happy', 'grin', 'joy', 'face'],
  laugh: ['laugh', 'lol', 'haha', 'joy', 'happy', 'funny', 'rofl'],
  lol: ['laugh', 'lol', 'haha', 'joy', 'rofl'],
  haha: ['laugh', 'haha', 'joy', 'happy', 'lol'],
  funny: ['funny', 'laugh', 'smile', 'joke'],
  celebrate: ['celebrate', 'party', 'celebration', 'woohoo', 'yay', 'congratulations'],
  party: ['party', 'celebrate', 'celebration', 'woohoo'],
  yay: ['yay', 'happy', 'celebrate', 'party', 'hooray'],

  // Sad / cry
  sad: ['sad', 'cry', 'tears', 'unhappy', 'depressed', 'sorrow', 'weep'],
  cry: ['cry', 'tears', 'sad', 'weep', 'sob'],
  tears: ['cry', 'tears', 'sad', 'weep'],
  unhappy: ['sad', 'unhappy', 'cry', 'frown'],

  // Angry / mad
  angry: ['angry', 'mad', 'furious', 'rage', 'annoyed'],
  mad: ['angry', 'mad', 'furious'],
  rage: ['angry', 'rage', 'furious'],

  // Thinking / hmm
  think: ['think', 'thinking', 'hmm', 'consider', 'idea'],
  hmm: ['think', 'thinking', 'hmm', 'consider'],
  idea: ['idea', 'think', 'light', 'bulb'],

  // Thumbs / ok / yes / no
  yes: ['yes', 'ok', 'thumbsup', 'check', 'correct', 'agree'],
  no: ['no', 'thumbsdown', 'wrong', 'disagree', 'nope'],
  ok: ['ok', 'okay', 'thumbsup', 'good', 'yes'],
  thumbsup: ['thumbsup', 'yes', 'ok', 'good', 'like', 'approve'],
  thumbsdown: ['thumbsdown', 'no', 'bad', 'disapprove'],

  // Fire / hot / cool
  fire: ['fire', 'flame', 'hot', 'burn', 'lit'],
  hot: ['hot', 'fire', 'sun', 'heat'],
  cool: ['cool', 'awesome', 'great', 'sunglasses'],

  // Sleep / tired
  sleep: ['sleep', 'tired', 'rest', 'zzz', 'bed'],
  tired: ['tired', 'sleep', 'exhausted', 'yawn'],

  // Food & drink
  food: ['food', 'eat', 'meal', 'yummy', 'delicious', 'hungry'],
  eat: ['eat', 'food', 'meal', 'yummy', 'nom'],
  hungry: ['hungry', 'food', 'eat'],
  coffee: ['coffee', 'cafe', 'drink', 'morning'],
  drink: ['drink', 'beverage', 'glass', 'toast'],
  pizza: ['pizza', 'food', 'italian'],
  cake: ['cake', 'birthday', 'celebrate', 'sweet'],
  beer: ['beer', 'drink', 'alcohol', 'cheers'],

  // Animals
  dog: ['dog', 'puppy', 'pet', 'woof'],
  cat: ['cat', 'kitten', 'meow', 'pet'],
  bear: ['bear', 'hug', 'love'],
  monkey: ['monkey', 'animal', 'playful'],
  bird: ['bird', 'tweet', 'fly'],
  fish: ['fish', 'swim', 'ocean'],
  unicorn: ['unicorn', 'magic', 'rainbow'],

  // Weather
  sun: ['sun', 'sunny', 'weather', 'hot', 'summer'],
  rain: ['rain', 'rainy', 'weather', 'umbrella'],
  snow: ['snow', 'cold', 'winter', 'weather'],
  cloud: ['cloud', 'weather', 'sky'],
  rainbow: ['rainbow', 'colorful', 'pride', 'hope'],

  // Travel / car / plane
  car: ['car', 'drive', 'vehicle', 'travel'],
  plane: ['plane', 'airplane', 'fly', 'travel', 'flight'],
  travel: ['travel', 'plane', 'car', 'trip', 'vacation'],
  vacation: ['vacation', 'travel', 'beach', 'holiday'],

  // Work / office
  work: ['work', 'office', 'computer', 'laptop', 'busy'],
  computer: ['computer', 'laptop', 'work', 'tech'],
  phone: ['phone', 'call', 'mobile', 'text'],

  // Music
  music: ['music', 'song', 'notes', 'listen', 'spotify'],
  song: ['music', 'song', 'notes'],
  guitar: ['guitar', 'music', 'rock'],

  // Sports
  sport: ['sport', 'soccer', 'football', 'basketball', 'game'],
  soccer: ['soccer', 'football', 'ball', 'sport'],
  football: ['football', 'soccer', 'sport'],
  basketball: ['basketball', 'ball', 'sport'],
  game: ['game', 'play', 'controller', 'gaming'],

  // Money / rich
  money: ['money', 'cash', 'rich', 'dollar', 'wealth'],
  rich: ['rich', 'money', 'wealth'],
  broke: ['broke', 'poor', 'money', 'sad'],

  // Time
  time: ['time', 'clock', 'hour', 'late', 'early'],
  late: ['late', 'time', 'clock', 'running'],
  soon: ['soon', 'time', 'clock'],

  // Magic / sparkle
  magic: ['magic', 'sparkle', 'shiny', 'star', 'wizard'],
  sparkle: ['sparkle', 'star', 'shine', 'magic'],
  star: ['star', 'sparkle', 'shine', 'favorite'],

  // Thank you / please
  thanks: ['thanks', 'thank', 'grateful', 'appreciate', 'namaste', 'bow'],
  thank: ['thanks', 'thank', 'grateful', 'namaste'],
  please: ['please', 'pray', 'hope', 'namaste', 'thanks'],
  sorry: ['sorry', 'apologize', 'sad', 'regret'],
  welcome: ['welcome', 'hi', 'hello', 'thanks'],

  // Good luck / break a leg
  luck: ['luck', 'lucky', 'clover', 'fortune'],
  lucky: ['lucky', 'luck', 'clover', 'fortune'],

  // Birthday
  birthday: ['birthday', 'cake', 'celebrate', 'party', 'age'],
  bday: ['birthday', 'cake', 'celebrate', 'party'],

  // Christmas / holiday
  christmas: ['christmas', 'xmas', 'holiday', 'santa', 'tree', 'gift'],
  xmas: ['christmas', 'xmas', 'holiday', 'santa'],
  santa: ['santa', 'christmas', 'xmas'],

  // Hug / cuddle
  hug: ['hug', 'hugs', 'cuddle', 'love', 'comfort'],
  cuddle: ['hug', 'cuddle', 'love', 'comfort'],

  // Wink / flirt
  wink: ['wink', 'flirt', 'playful', 'secret'],
  flirt: ['wink', 'flirt', 'heart', 'love'],

  // Shrug / idk
  shrug: ['shrug', 'dunno', 'idk', 'whatever', 'dontknow'],
  idk: ['shrug', 'idk', 'dunno', 'whatever'],
  whatever: ['shrug', 'whatever', 'idk'],

  // Cool / awesome / great
  awesome: ['awesome', 'cool', 'great', 'amazing', 'fantastic'],
  great: ['great', 'good', 'awesome', 'amazing'],
  amazing: ['amazing', 'awesome', 'great', 'wow'],
  wow: ['wow', 'amazing', 'surprise', 'impressed'],

  // Sick / ill
  sick: ['sick', 'ill', 'flu', 'cold', 'fever'],
  ill: ['sick', 'ill', 'unwell'],
};

// Normalize: lowercase, collapse spaces, remove punctuation for matching
function normalize(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Get expanded search terms for a query
function getSearchTerms(query) {
  const q = normalize(query);
  if (!q) return [];
  const terms = new Set([q]);
  // Add synonyms for each word
  const words = q.split(/\s+/);
  for (const word of words) {
    const key = Object.keys(EMOJI_SYNONYMS).find(k => k === word || word.startsWith(k));
    if (key && EMOJI_SYNONYMS[key]) {
      EMOJI_SYNONYMS[key].forEach(t => terms.add(t));
    }
  }
  // Also check if whole query is a synonym key
  if (EMOJI_SYNONYMS[q]) {
    EMOJI_SYNONYMS[q].forEach(t => terms.add(t));
  }
  return [...terms];
}

// Build index: emoji char -> { name, keywords } from emojilib
let _emojiIndex = null;
function getEmojiIndex() {
  if (_emojiIndex) return _emojiIndex;
  const lib = emojilib?.lib || {};
  _emojiIndex = Object.entries(lib).map(([name, data]) => ({
    name,
    char: data?.char || '',
    keywords: (data?.keywords || []).map(k => String(k).toLowerCase()),
  })).filter(e => e.char);
  return _emojiIndex;
}

/**
 * Search emojis by semantic/conceptual query.
 * @param {string} query - User search (e.g. "hi", "hey", "yo", "love", "sad")
 * @param {Set<string>|string[]} [allowedEmojis] - Optional set of emoji chars to filter results. If omitted, returns all matches from emojilib.
 * @returns {string[]} Array of emoji characters (Unicode)
 */
export function searchEmojis(query, allowedEmojis = null) {
  const q = normalize(query);
  if (!q) return [];

  const terms = getSearchTerms(query);
  const index = getEmojiIndex();
  const seen = new Set();
  const results = [];

  const allowedSet = allowedEmojis
    ? (allowedEmojis instanceof Set ? allowedEmojis : new Set(allowedEmojis))
    : null;

  for (const entry of index) {
    if (!entry.char) continue;
    if (allowedSet && !allowedSet.has(entry.char)) continue;

    const nameLower = entry.name.toLowerCase();
    const keywordSet = new Set(entry.keywords);

    for (const term of terms) {
      // Match shortcode name (e.g. "wave" matches "wave")
      if (nameLower.includes(term) || term.includes(nameLower)) {
        if (!seen.has(entry.char)) {
          seen.add(entry.char);
          results.push(entry.char);
        }
        break;
      }
      // Match keywords
      if (keywordSet.has(term) || [...keywordSet].some(k => k.includes(term) || term.includes(k))) {
        if (!seen.has(entry.char)) {
          seen.add(entry.char);
          results.push(entry.char);
        }
        break;
      }
    }
  }

  return results;
}
