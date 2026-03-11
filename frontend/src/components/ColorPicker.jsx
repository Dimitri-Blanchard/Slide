import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import './ColorPicker.css';

/**
 * Friendly in-app color picker. Replaces the native OS color dialog
 * (e.g. Windows "Couleurs") with a simple, modern picker.
 * Popover is rendered via portal to avoid parent overflow clipping.
 */
export default function ColorPicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [popoverRect, setPopoverRect] = useState(null);
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    if (open && wrapRef.current) {
      const rect = wrapRef.current.getBoundingClientRect();
      setPopoverRect({ top: rect.bottom + 8, left: rect.left });
    } else {
      setPopoverRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const normalizeToHex = (raw) => {
    const input = String(raw || '').trim();
    if (!input) return '#000000';
    if (input.startsWith('#')) {
      if (input.length === 4 || input.length === 7) return input;
      return '#000000';
    }
    const match = input.match(/rgba?\(([^)]+)\)/i);
    if (!match) return '#000000';
    const content = match[1].replace(/\s*\/\s*[^, ]+$/, '');
    const parts = content.includes(',') ? content.split(',') : content.split(/\s+/);
    if (parts.length < 3) return '#000000';
    const toChannel = (part) => {
      const token = String(part || '').trim();
      if (token.endsWith('%')) {
        const pct = Number(token.slice(0, -1));
        return Math.max(0, Math.min(255, Math.round((pct / 100) * 255)));
      }
      const n = Number(token);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(255, Math.round(n)));
    };
    const r = toChannel(parts[0]).toString(16).padStart(2, '0');
    const g = toChannel(parts[1]).toString(16).padStart(2, '0');
    const b = toChannel(parts[2]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  };

  const hex = normalizeToHex(value);

  const popover = open && popoverRect && (
    <div
      ref={popoverRef}
      className="color-picker-popover color-picker-popover-portal"
      style={{ top: popoverRect.top, left: popoverRect.left }}
    >
      <HexColorPicker color={hex} onChange={onChange} className="color-picker-picker" />
      <div className="color-picker-hex-row">
        <span className="color-picker-hex-label">#</span>
        <HexColorInput
          color={hex}
          onChange={onChange}
          prefixed
          className="color-picker-hex-input"
        />
      </div>
    </div>
  );

  return (
    <>
      <div className={`color-picker-wrap ${className}`} ref={wrapRef}>
        <button
          type="button"
          className="color-picker-swatch"
          style={{ background: hex }}
          onClick={() => setOpen(!open)}
          title="Choose color"
          aria-label="Choose color"
          aria-expanded={open}
        />
      </div>
      {popover && createPortal(popover, document.body)}
    </>
  );
}
