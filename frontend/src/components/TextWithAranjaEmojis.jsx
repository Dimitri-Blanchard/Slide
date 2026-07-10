import React, { memo } from 'react';
import { processTextWithAranjaEmojis } from '../utils/emojiAranja';
import { aranjaEmojiStyle } from '../utils/inlineAranjaEmoji';

/** Renders text with Unicode emojis / shortcodes as Aranja PNG images (same as picker). */
const TextWithAranjaEmojis = memo(function TextWithAranjaEmojis({ text }) {
  if (!text) return null;
  const processed = processTextWithAranjaEmojis(text);
  return (
    <>
      {processed.map((p, i) =>
        typeof p === 'string'
          ? p
          : (
            <span
              key={i}
              className="message-inline-emoji"
              role="img"
              aria-label={p.alt}
              style={aranjaEmojiStyle(p.url)}
            >
              {p.alt}
            </span>
          )
      )}
    </>
  );
});

export default TextWithAranjaEmojis;
