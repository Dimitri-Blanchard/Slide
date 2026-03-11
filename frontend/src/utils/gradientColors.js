/**
 * Gradient color harmony — ensures two colors ALWAYS produce a visually pleasing gradient.
 * Extensive calculations: HSL conversion, hue distance, saturation balance, luminance contrast,
 * chromatic adaptation, and harmonic adjustments. Any color pair is adjusted to match.
 */

function clampRgb(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 128;
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Parse CSS color (hex/rgb/rgba) to { r, g, b } 0-255 */
function colorToRgb(input) {
  const raw = String(input || '').trim();
  if (!raw) return { r: 128, g: 128, b: 128 };

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (raw.startsWith('#')) {
    let hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((ch) => ch + ch).join('');
    }
    if (hex.length === 8) {
      hex = hex.slice(0, 6); // Ignore alpha.
    }
    if (hex.length === 6 && /^[0-9a-fA-F]{6}$/.test(hex)) {
      const n = parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
  }

  // rgb()/rgba() with comma or space syntax.
  const rgbMatch = raw.match(/^rgba?\((.+)\)$/i);
  if (rgbMatch) {
    const content = rgbMatch[1].replace(/\s*\/\s*[^, ]+$/, '');
    const parts = content.includes(',') ? content.split(',') : content.split(/\s+/);
    if (parts.length >= 3) {
      const toChannel = (part) => {
        const token = String(part || '').trim();
        if (token.endsWith('%')) {
          const pct = Number(token.slice(0, -1));
          return clampRgb((pct / 100) * 255);
        }
        return clampRgb(token);
      };
      return {
        r: toChannel(parts[0]),
        g: toChannel(parts[1]),
        b: toChannel(parts[2]),
      };
    }
  }

  return { r: 128, g: 128, b: 128 };
}

/** RGB 0-255 to HSL: h 0-360, s 0-100, l 0-100 */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) h = s = 0;
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** HSL to RGB to hex */
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  h /= 360; s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  let r, g, b;
  if (s === 0) r = g = b = l;
  else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  const toHex = (x) => Math.round(Math.max(0, Math.min(255, x * 255))).toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/** Shortest hue distance (0–180 degrees) */
function hueDistance(h1, h2) {
  let d = Math.abs(h1 - h2);
  if (d > 180) d = 360 - d;
  return d;
}

/** Ensure minimum luminance contrast — gradient must be clearly visible */
function ensureLuminanceContrast(hsl1, hsl2, minDiff = 18) {
  let { h: h1, s: s1, l: l1 } = hsl1;
  let { h: h2, s: s2, l: l2 } = hsl2;
  let diff = Math.abs(l1 - l2);

  if (diff >= minDiff) return [hsl1, hsl2];

  const mid = (l1 + l2) / 2;
  const half = minDiff / 2;
  if (l1 <= l2) {
    l1 = Math.max(0, Math.min(100, mid - half));
    l2 = Math.max(0, Math.min(100, mid + half));
  } else {
    l2 = Math.max(0, Math.min(100, mid - half));
    l1 = Math.max(0, Math.min(100, mid + half));
  }
  return [{ h: h1, s: s1, l: l1 }, { h: h2, s: s2, l: l2 }];
}

/** Reduce saturation when both high — avoids garish clashing */
function balanceSaturation(hsl1, hsl2, maxBothSat = 76) {
  let { s: s1 } = hsl1, { s: s2 } = hsl2;
  if (s1 > maxBothSat && s2 > maxBothSat) {
    const factor = maxBothSat / Math.max(s1, s2);
    return [
      { ...hsl1, s: Math.round(s1 * factor) },
      { ...hsl2, s: Math.round(s2 * factor) },
    ];
  }
  return [hsl1, hsl2];
}

/** When hues clash (far + both saturated), move toward analogous for smooth blend */
function harmonizeHue(hsl1, hsl2, clashThreshold = 95) {
  const dist = hueDistance(hsl1.h, hsl2.h);
  const satScore = (hsl1.s / 100) * (hsl2.s / 100);
  if (dist <= clashThreshold || satScore < 0.25) return [hsl1, hsl2];

  // Blend h2 toward h1 — analogous harmony
  const blend = Math.min(0.55, 0.3 + (dist - clashThreshold) / 200);
  let h2 = hsl2.h;
  let dh = hsl1.h - h2;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  h2 = (h2 + dh * blend + 360) % 360;
  return [hsl1, { ...hsl2, h: h2 }];
}

/** Prevent both colors too dark or too light — gradient needs range */
function clampExtremes(hsl1, hsl2) {
  let [a, b] = [hsl1, hsl2];
  const minL = 10, maxL = 100; /* allow full white — contrast via black text */

  if (a.l < minL && b.l < minL) {
    const boost = 18 - Math.min(a.l, b.l);
    a = { ...a, l: Math.min(32, a.l + boost * 0.7) };
    b = { ...b, l: Math.min(32, b.l + boost * 0.6) };
  } else if (a.l > maxL && b.l > maxL) {
    const reduce = Math.max(a.l, b.l) - 86;
    a = { ...a, l: Math.max(76, a.l - reduce * 0.6) };
    b = { ...b, l: Math.max(76, b.l - reduce * 0.7) };
  }
  a = { ...a, l: Math.max(minL, Math.min(maxL, a.l)) };
  b = { ...b, l: Math.max(minL, Math.min(maxL, b.l)) };
  return [a, b];
}

/** Ensure top color (first) is slightly lighter for natural vertical gradient feel */
function preferTopLighter(hsl1, hsl2, bias = 4) {
  if (hsl1.l >= hsl2.l) return [hsl1, hsl2];
  const diff = hsl2.l - hsl1.l;
  if (diff < bias) {
    const shift = (bias - diff) / 2;
    return [
      { ...hsl1, l: Math.min(98, hsl1.l + shift) },
      { ...hsl2, l: Math.max(2, hsl2.l - shift) },
    ];
  }
  return [hsl1, hsl2];
}

/** Reduce chroma when one is very saturated and the other muted — balance */
function balanceChroma(hsl1, hsl2) {
  const [s1, s2] = [hsl1.s, hsl2.s];
  const ratio = Math.max(s1, s2) / (Math.min(s1, s2) || 1);
  if (ratio > 2.5 && Math.max(s1, s2) > 70) {
    const higher = s1 >= s2 ? 1 : 2;
    const target = Math.min(72, (s1 + s2) / 2 + 10);
    if (higher === 1) return [{ ...hsl1, s: Math.min(s1, target) }, hsl2];
    return [hsl1, { ...hsl2, s: Math.min(s2, target) }];
  }
  return [hsl1, hsl2];
}

/** Lighten a color (for interior gradient) */
export function lightenHex(hex, amount = 0.18) {
  const { r, g, b } = colorToRgb(hex);
  const blend = (c) => Math.round(Math.min(255, c + (255 - c) * amount));
  return '#' + [r, g, b].map(blend).map((c) => c.toString(16).padStart(2, '0')).join('');
}

/**
 * Adjust two hex colors so they ALWAYS produce a harmonious gradient.
 * Applies: clamp extremes, saturation balance, chroma balance, hue harmonization,
 * luminance contrast, and top-lighter bias. Returns [adjustedColor1, adjustedColor2].
 */
export function harmonizeGradientColors(hex1, hex2) {
  const rgb1 = colorToRgb(hex1), rgb2 = colorToRgb(hex2);
  let hsl1 = rgbToHsl(rgb1.r, rgb1.g, rgb1.b);
  let hsl2 = rgbToHsl(rgb2.r, rgb2.g, rgb2.b);

  let [a, b] = [hsl1, hsl2];

  // 1. Clamp extreme luminances
  [a, b] = clampExtremes(a, b);

  // 2. Balance saturation when both too high
  [a, b] = balanceSaturation(a, b);

  // 3. Balance chroma when one very saturated, one muted
  [a, b] = balanceChroma(a, b);

  // 4. Harmonize hue when clashing
  [a, b] = harmonizeHue(a, b);

  // 5. Ensure minimum luminance contrast
  [a, b] = ensureLuminanceContrast(a, b, 16);

  // 6. Slight bias: top (first) a bit lighter for natural gradient
  [a, b] = preferTopLighter(a, b, 3);

  return [hslToHex(a.h, a.s, a.l), hslToHex(b.h, b.s, b.l)];
}

/** Relative luminance (WCAG) 0–1 */
function relativeLuminance(r, g, b) {
  const toLin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/**
 * True if gradient is light (needs black/dark text for readability).
 * Threshold lowered: text goes black whenever background is too white/light.
 */
export function isLightGradient(hex1, hex2) {
  const [c1, c2] = harmonizeGradientColors(hex1, hex2);
  const l1 = relativeLuminance(...Object.values(colorToRgb(lightenHex(c1))));
  const l2 = relativeLuminance(...Object.values(colorToRgb(lightenHex(c2))));
  const avg = (l1 + l2) / 2;
  const maxL = Math.max(l1, l2);
  return avg > 0.38 || maxL > 0.55;
}

/** Normalize hex for comparison (lowercase, with #) */
function normalizeHex(hex) {
  const h = String(hex || '').replace(/^#/, '').trim().toLowerCase();
  if (h.length === 3) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return h ? '#' + h.padStart(6, '0').slice(-6) : '';
}

/**
 * True when banner colors match a known pair where the gray overlay band is undesired.
 * Example: #ffffff (1st) + #1500ff (2nd) — user prefers no gray rectangle.
 */
export function areMatchingBannerColors(hex1, hex2) {
  const a = normalizeHex(hex1);
  const b = normalizeHex(hex2);
  const pairs = [
    ['#ffffff', '#1500ff'],
    ['#1500ff', '#ffffff'],
  ];
  return pairs.some(([x, y]) => (a === x && b === y));
}

/**
 * True if gradient spans very dark to very light (black/white etc.).
 * Needs dark overlay + light text — can't use single text color.
 */
export function isHighContrastGradient(hex1, hex2) {
  const [c1, c2] = harmonizeGradientColors(hex1, hex2);
  const l1 = relativeLuminance(...Object.values(colorToRgb(c1)));
  const l2 = relativeLuminance(...Object.values(colorToRgb(c2)));
  const minL = Math.min(l1, l2), maxL = Math.max(l1, l2);
  return minL < 0.25 && maxL > 0.75;
}
