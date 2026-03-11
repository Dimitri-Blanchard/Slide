import React, { memo } from 'react';
import { processTextWithAranjaEmojis } from '../utils/emojiAranja';

/** Renders text with Unicode emojis replaced by Aranja PNG images. */
const TextWithAranjaEmojis = memo(function TextWithAranjaEmojis({ text }) {
  if (!text) return null;
  const processed = processTextWithAranjaEmojis(text);
  return (
    <>
      {processed.map((p, i) =>
        typeof p === 'string' ? p : <img key={i} src={p.url} alt={p.alt} className="message-inline-emoji" />
      )}
    </>
  );
});

export default TextWithAranjaEmojis;
