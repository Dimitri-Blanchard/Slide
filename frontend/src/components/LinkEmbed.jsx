import React, { memo, useMemo } from 'react';
import './LinkEmbed.css';

// Whitelist des domaines avec embeds stylisés (iframe natif)
const EMBED_WHITELIST = {
  spotify: {
    domains: ['open.spotify.com', 'spotify.com'],
    buildEmbed: (url) => {
      // open.spotify.com/track/xxx, /album/xxx, /playlist/xxx, /artist/xxx
      const m = url.match(/(?:open\.)?spotify\.com\/(track|album|playlist|artist|episode|show)\/([a-zA-Z0-9]+)/i);
      if (!m) return null;
      return `https://open.spotify.com/embed/${m[1]}/${m[2]}`;
    },
    type: 'spotify',
    height: 152,
  },
  youtube: {
    domains: ['youtube.com', 'youtu.be', 'www.youtube.com'],
    buildEmbed: (url) => {
      let vid = null;
      if (url.includes('youtu.be/')) {
        vid = url.split('youtu.be/')[1]?.split(/[?&#]/)[0];
      } else {
        const match = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|$)/);
        vid = match?.[1];
      }
      return vid ? `https://www.youtube.com/embed/${vid}` : null;
    },
    type: 'youtube',
    height: 315,
  },
  soundcloud: {
    domains: ['soundcloud.com'],
    buildEmbed: (url) => {
      if (!url.includes('soundcloud.com')) return null;
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&color=%235b8def`;
    },
    type: 'soundcloud',
    height: 166,
  },
  vimeo: {
    domains: ['vimeo.com'],
    buildEmbed: (url) => {
      const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      return m ? `https://player.vimeo.com/video/${m[1]}` : null;
    },
    type: 'vimeo',
    height: 281,
  },
};

const PLAIN_URL_RE = /https?:\/\/[^\s<>'"]+/g;

function extractEmbeddableUrls(text) {
  if (!text) return [];
  const imageExt = /\.(jpg|jpeg|png|gif|webp|svg)(?:\?|$)/i;
  const inviteRe = /\/invite\/[A-Za-z0-9]{6,20}/;
  const urls = [];
  let m;
  PLAIN_URL_RE.lastIndex = 0;
  while ((m = PLAIN_URL_RE.exec(text)) !== null) {
    const url = m[0];
    if (imageExt.test(url) || inviteRe.test(url)) continue;
    urls.push(url);
  }
  return [...new Set(urls)];
}

export function getEmbeddableUrls(text) {
  return extractEmbeddableUrls(text);
}

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getWhitelistMatch(url) {
  const domain = getDomain(url);
  for (const [, config] of Object.entries(EMBED_WHITELIST)) {
    if (config.domains.some(d => domain === d || domain.endsWith('.' + d))) {
      const embedUrl = config.buildEmbed?.(url);
      if (embedUrl) return { ...config, embedUrl };
    }
  }
  return null;
}

const LinkEmbed = memo(function LinkEmbed({ url }) {
  const { embedType, embedUrl, height, domain, isWhitelist } = useMemo(() => {
    const match = getWhitelistMatch(url);
    const d = getDomain(url);
    if (match) {
      return {
        embedType: match.type,
        embedUrl: match.embedUrl,
        height: match.height,
        domain: d,
        isWhitelist: true,
      };
    }
    return { embedType: null, embedUrl: null, domain: d, isWhitelist: false };
  }, [url]);

  if (!url) return null;

  // Embed whitelist (Spotify, YouTube, etc.) — iframe stylisé
  if (isWhitelist && embedUrl) {
    return (
      <div className={`link-embed link-embed--${embedType}`} onClick={e => e.stopPropagation()}>
        <iframe
          src={embedUrl}
          width="100%"
          height={height || 152}
          frameBorder="0"
          allowFullScreen
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={domain}
        />
        <a href={url} target="_blank" rel="noopener noreferrer" className="link-embed__url">
          {url}
        </a>
      </div>
    );
  }

  // Embed par défaut — carte simple avec domaine
  const displayUrl = url.replace(/^https?:\/\//, '');
  const truncatedUrl = displayUrl.length > 60 ? displayUrl.slice(0, 60) + '…' : displayUrl;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="link-embed link-embed--default"
      onClick={e => e.stopPropagation()}
    >
      <div className="link-embed-default__icon">
        {domain && (
          <img
            src={`https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`}
            alt=""
            width={20}
            height={20}
          />
        )}
      </div>
      <div className="link-embed-default__content">
        <span className="link-embed-default__domain">{domain || 'Link'}</span>
        <span className="link-embed-default__url">{truncatedUrl}</span>
      </div>
      <svg className="link-embed-default__arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 17L17 7M17 7h-6M17 7v6" />
      </svg>
    </a>
  );
});

export default LinkEmbed;
