import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import '../pages/Settings.css';

const VARIANTS = {
  profile: {
    aspectW: 40,
    aspectH: 14,
    outputWidth: 960,
    cropAreaClass: '',
    titleKey: 'profile.bannerCropTitle',
    titleFallback: 'Frame your banner',
    hintKey: 'profile.bannerCropHint',
    hintFallback: 'Drag to position and zoom. Only the framed area will be saved.',
    gifNoteKey: 'profile.bannerCropGifNote',
    gifNoteFallback: 'GIF: framing is applied on the server when you save your profile.',
    applyKey: 'profile.bannerCropApply',
    applyFallback: 'Apply',
  },
  server: {
    aspectW: 16,
    aspectH: 9,
    outputWidth: 960,
    cropAreaClass: 'banner-crop-area--server',
    titleKey: 'server.bannerCropTitle',
    titleFallback: 'Frame your server banner',
    hintKey: 'server.bannerCropHint',
    hintFallback: 'Drag to position and zoom. This is how the banner will appear in the channel list.',
    gifNoteKey: 'server.bannerCropGifNote',
    gifNoteFallback: 'GIF: framing is applied on the server when you upload.',
    applyKey: 'profile.bannerCropApply',
    applyFallback: 'Apply',
  },
};

export default function BannerCropModal({ file, onConfirm, onCancel, variant = 'profile' }) {
  const { t } = useLanguage();
  const config = VARIANTS[variant] || VARIANTS.profile;
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [areaSize, setAreaSize] = useState({ w: 400, h: 140 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  const imgUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl]);

  const isGif = file.type === 'image/gif';

  const readAreaSize = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { w: 400, h: Math.round(400 * config.aspectH / config.aspectW) };
    const w = el.clientWidth;
    const h = el.clientHeight;
    return w > 0 && h > 0 ? { w, h } : { w: 400, h: Math.round(400 * config.aspectH / config.aspectW) };
  }, [config.aspectH, config.aspectW]);

  const handleLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    requestAnimationFrame(() => {
      const { w: vw, h: vh } = readAreaSize();
      setAreaSize({ w: vw, h: vh });
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      const fillZoom = Math.max(vw / natW, vh / natH);
      setMinZoom(fillZoom);
      setZoom(fillZoom);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
    });
  }, [readAreaSize]);

  const handlePointerDown = useCallback((e) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    offsetStart.current = { ...offset };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [offset]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging.current) return;
    setOffset({
      x: offsetStart.current.x + (e.clientX - dragStart.current.x),
      y: offsetStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => Math.max(minZoom, Math.min(6, z - e.deltaY * 0.001)));
  }, [minZoom]);

  const getBannerCropParams = useCallback(() => {
    const img = imgRef.current;
    if (!img) return null;
    const { w: PREVIEW_W, h: PREVIEW_H } = readAreaSize();
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const dispW = natW * zoom;
    const dispH = natH * zoom;
    const imgLeft = (PREVIEW_W - dispW) / 2 + offset.x;
    const imgTop = (PREVIEW_H - dispH) / 2 + offset.y;
    const interLeft = Math.max(0, -imgLeft);
    const interTop = Math.max(0, -imgTop);
    const interRight = Math.min(dispW, PREVIEW_W - imgLeft);
    const interBottom = Math.min(dispH, PREVIEW_H - imgTop);
    const interW = interRight - interLeft;
    const interH = interBottom - interTop;
    if (interW < 1 || interH < 1) return null;
    const natX = (interLeft / dispW) * natW;
    const natY = (interTop / dispH) * natH;
    const natCropW = (interW / dispW) * natW;
    const natCropH = (interH / dispH) * natH;
    return {
      x: natX,
      y: natY,
      width: natCropW,
      height: natCropH,
      sourceWidth: natW,
      sourceHeight: natH,
    };
  }, [zoom, offset, readAreaSize]);

  const handleConfirm = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const crop = getBannerCropParams();
    if (!crop) return;
    const { w: vw, h: vh } = readAreaSize();

    if (isGif) {
      onConfirm({ file, cropParams: crop });
      return;
    }

    const outW = config.outputWidth;
    const outH = Math.max(1, Math.round((outW * vh) / vw));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, outW, outH);
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm({ blob });
      },
      'image/webp',
      0.88
    );
  }, [file, isGif, getBannerCropParams, readAreaSize, onConfirm, config.outputWidth]);

  const tx = (key, fallback) => {
    const v = t(key);
    return v === key ? fallback : v;
  };

  return (
    <div className="banner-crop-overlay" onClick={onCancel}>
      <div className="avatar-crop-modal banner-crop-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{tx(config.titleKey, config.titleFallback)}</h3>
        <p className="banner-crop-hint">{tx(config.hintKey, config.hintFallback)}</p>
        {isGif && (
          <p className="avatar-crop-gif-note">{tx(config.gifNoteKey, config.gifNoteFallback)}</p>
        )}
        <div
          ref={containerRef}
          className={`banner-crop-area ${config.cropAreaClass}`.trim()}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
        >
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            className="avatar-crop-img"
            draggable={false}
            onLoad={handleLoad}
            style={
              loaded && imgRef.current
                ? {
                    width: imgRef.current.naturalWidth * zoom,
                    height: imgRef.current.naturalHeight * zoom,
                    left: (areaSize.w - imgRef.current.naturalWidth * zoom) / 2 + offset.x,
                    top: (areaSize.h - imgRef.current.naturalHeight * zoom) / 2 + offset.y,
                  }
                : { opacity: 0 }
            }
          />
        </div>

        <div className={`avatar-crop-zoom banner-crop-zoom ${config.cropAreaClass ? 'banner-crop-zoom--server' : ''}`.trim()}>
          <span style={{ fontSize: '0.75rem' }}>−</span>
          <input
            type="range"
            min={minZoom}
            max="6"
            step="0.01"
            value={Math.max(minZoom, Math.min(6, zoom))}
            onChange={(e) => setZoom(Math.max(minZoom, Math.min(6, parseFloat(e.target.value))))}
          />
          <span style={{ fontSize: '0.75rem' }}>+</span>
        </div>

        <div className="avatar-crop-actions">
          <button type="button" className="btn-cancel" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-confirm" onClick={handleConfirm}>
            {tx(config.applyKey, config.applyFallback)}
          </button>
        </div>
      </div>
    </div>
  );
}
