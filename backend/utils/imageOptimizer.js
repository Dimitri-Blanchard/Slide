/**
 * Image optimization utility: resize + compression
 * Uses sharp for JPEG, PNG, WebP, GIF, BMP. Skips SVG (vector).
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const OPTIMIZABLE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
const SKIP_TYPES = ['image/svg+xml']; // Vector, no pixel optimization

/**
 * Optimize an image: resize to max dimensions and compress.
 * @param {string} inputPath - Full path to the uploaded file
 * @param {object} options - { maxWidth, maxHeight, quality, outputFormat }
 * @returns {Promise<{ path: string, filename: string, size: number, mimetype: string }>}
 *   path: full path to final file
 *   filename: basename for URL (e.g. "123-photo.webp")
 *   size: file size in bytes
 *   mimetype: final mime type
 */
export async function optimizeImage(inputPath, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 85,
    outputFormat = 'webp',
  } = options;

  const stats = fs.statSync(inputPath);
  const ext = path.extname(inputPath).toLowerCase();
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, ext);
  const mimetype = getMimetypeFromExt(ext);
  const originalFilename = path.basename(inputPath);

  if (SKIP_TYPES.includes(mimetype) || !OPTIMIZABLE_TYPES.includes(mimetype)) {
    return { path: inputPath, filename: originalFilename, size: stats.size, mimetype };
  }

  try {
    const isAnimated = mimetype === 'image/gif';
    const meta = await sharp(inputPath, { animated: isAnimated }).metadata();
    const w = meta.width || 0;
    // sharp's metadata() returns the *stacked* height for animated images
    // (height of frame × number of frames). The previous code used
    //    meta.height || (meta.height / meta.pages)
    // which always picked the stacked value because meta.height is truthy.
    // That made a 500×500 GIF with 30 frames look like 500×15000, then the
    // 1920px max resize crushed it to ~64×1920. Compute per-frame height
    // explicitly when animated.
    const totalH = meta.height || 0;
    const h = (isAnimated && meta.pages && meta.pages > 1)
      ? Math.round(totalH / meta.pages)
      : totalH;

    if (!w || !h) {
      return { path: inputPath, filename: originalFilename, size: stats.size, mimetype };
    }

    const needsResize = w > maxWidth || h > maxHeight;
    const scale = Math.min(maxWidth / w, maxHeight / h, 1);
    const newW = needsResize ? Math.round(w * scale) : w;
    const newH = needsResize ? Math.round(h * scale) : h;

    // Keep animated GIFs as GIF up to 8 MB (was 2 MB — too aggressive, normal
    // chat GIFs end up converted to WebP and lose obvious quality). Above 8 MB
    // we still fall back to animated WebP to keep payloads reasonable.
    const keepGif = isAnimated && meta.pages && meta.pages > 1 && stats.size < 8 * 1024 * 1024;

    const outExt = (keepGif || outputFormat === 'preserve') ? ext : '.webp';
    const outMime = outExt === '.webp' ? 'image/webp' : mimetype;
    // Use temp path when output would overwrite input (keepGif) to only replace if smaller
    const outputPath = (keepGif && outExt === ext)
      ? path.join(dir, `${base}-opt${ext}`)
      : path.join(dir, `${base}${outExt}`);

    let pipeline = sharp(inputPath, { animated: isAnimated });

    if (needsResize) {
      pipeline = pipeline.resize(newW, newH, { fit: 'inside', withoutEnlargement: true });
    }

    if (keepGif) {
      await pipeline.gif({ effort: 6 }).toFile(outputPath);
      // Replace original only if smaller
      const optStats = fs.statSync(outputPath);
      if (optStats.size < stats.size) {
        fs.unlinkSync(inputPath);
        fs.renameSync(outputPath, inputPath);
        return { path: inputPath, filename: originalFilename, size: optStats.size, mimetype };
      }
      fs.unlinkSync(outputPath);
      return { path: inputPath, filename: originalFilename, size: stats.size, mimetype };
    } else if (outExt === '.webp') {
      await pipeline
        .webp({ quality: Math.min(quality, 90), effort: 6 })
        .toFile(outputPath);
    } else if (outExt === '.jpg' || outExt === '.jpeg') {
      await pipeline
        .jpeg({ quality: Math.min(quality, 92), mozjpeg: true })
        .toFile(outputPath);
    } else if (outExt === '.png') {
      await pipeline
        .png({ quality: Math.min(quality, 90), compressionLevel: 6 })
        .toFile(outputPath);
    } else {
      await pipeline.webp({ quality, effort: 6 }).toFile(outputPath);
    }

    const newStats = fs.statSync(outputPath);
    const outFilename = path.basename(outputPath);

    // Use optimized file if format changed (we wrote to new path) or if smaller
    if (outputPath !== inputPath) {
      if (newStats.size < stats.size) {
        try {
          fs.unlinkSync(inputPath);
        } catch (e) {}
        return { path: outputPath, filename: outFilename, size: newStats.size, mimetype: outMime };
      }
      fs.unlinkSync(outputPath);
    } else {
      // Same path (in-place): we resized/compressed in place
      return { path: outputPath, filename: outFilename, size: newStats.size, mimetype: outMime };
    }
    return { path: inputPath, filename: originalFilename, size: stats.size, mimetype };
  } catch (err) {
    console.error('[ImageOptimizer]', err.message);
    return { path: inputPath, filename: originalFilename, size: stats.size, mimetype };
  }
}

function getMimetypeFromExt(ext) {
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Presets for different use cases
 */
export const presets = {
  /** Messages (channels, DMs): max 1920px, WebP 85% */
  message: { maxWidth: 1920, maxHeight: 1920, quality: 85, outputFormat: 'webp' },
  /** Avatar: usually handled separately with crop; use for pre-process if needed */
  avatar: { maxWidth: 512, maxHeight: 512, quality: 90, outputFormat: 'webp' },
  /** Banner: wide format (e.g. 1920x1080) */
  banner: { maxWidth: 1920, maxHeight: 1080, quality: 85, outputFormat: 'webp' },
  /** Sticker: small square */
  sticker: { maxWidth: 256, maxHeight: 256, quality: 90, outputFormat: 'webp' },
  /** Sticker pack cover */
  stickerCover: { maxWidth: 256, maxHeight: 256, quality: 90, outputFormat: 'webp' },
};
