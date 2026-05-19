import React, { useRef, useCallback, useEffect, useState } from 'react';
import './MfaCodeInput.css';

const LENGTH = 6;
const POP_MS = 280;

export default function MfaCodeInput({
  value = '',
  onChange,
  labelId,
  autoFocus = false,
  disabled = false,
  hasError = false,
  'aria-invalid': ariaInvalid,
}) {
  const inputRef = useRef(null);
  const hadErrorRef = useRef(false);
  const prevCodeRef = useRef('');
  const [popIndex, setPopIndex] = useState(-1);
  const code = value.replace(/\D/g, '').slice(0, LENGTH);
  const activeIndex = Math.min(code.length, LENGTH - 1);

  const focusInput = useCallback(() => {
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = code.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      /* iOS / some WebViews */
    }
  }, [disabled, code.length]);

  const applyCode = useCallback((next) => {
    const normalized = String(next ?? '').replace(/\D/g, '').slice(0, LENGTH);
    onChange?.(normalized);
    return normalized;
  }, [onChange]);

  useEffect(() => {
    const prev = prevCodeRef.current;
    prevCodeRef.current = code;
    if (code.length === prev.length + 1 && code.startsWith(prev)) {
      setPopIndex(code.length - 1);
      const t = window.setTimeout(() => setPopIndex(-1), POP_MS);
      return () => window.clearTimeout(t);
    }
    setPopIndex(-1);
  }, [code]);

  const handleCellClick = useCallback((idx, e) => {
    e.stopPropagation();
    if (disabled) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const pos = Math.min(idx, code.length);
    try {
      el.setSelectionRange(pos, pos);
    } catch {
      /* iOS / some WebViews */
    }
  }, [disabled, code.length]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const id = requestAnimationFrame(() => focusInput());
    return () => cancelAnimationFrame(id);
  }, [autoFocus, disabled, focusInput]);

  useEffect(() => {
    if (disabled || code.length > 0) return;
    const id = requestAnimationFrame(() => focusInput());
    return () => cancelAnimationFrame(id);
  }, [code, disabled, focusInput]);

  useEffect(() => {
    if (hasError && !hadErrorRef.current && !disabled) {
      const id = requestAnimationFrame(() => focusInput());
      hadErrorRef.current = true;
      return () => cancelAnimationFrame(id);
    }
    if (!hasError) hadErrorRef.current = false;
  }, [hasError, disabled, focusInput]);

  const handleChange = useCallback((e) => {
    applyCode(e.target.value);
  }, [applyCode]);

  const handlePaste = useCallback((e) => {
    const pasted = e.clipboardData?.getData('text') ?? '';
    if (!pasted.replace(/\D/g, '')) return;
    e.preventDefault();
    applyCode(pasted);
    requestAnimationFrame(() => focusInput());
  }, [applyCode, focusInput]);

  return (
    <div
      className={`mfa-code-input-wrap ${hasError ? 'mfa-code-input-wrap--error' : ''} ${disabled ? 'mfa-code-input-wrap--disabled' : ''}`}
      role="group"
      {...(labelId ? { 'aria-labelledby': labelId } : { 'aria-label': 'Verification code' })}
      onClick={focusInput}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="done"
        maxLength={LENGTH}
        value={code}
        onChange={handleChange}
        onPaste={handlePaste}
        disabled={disabled}
        className="mfa-code-autofill-input"
        aria-invalid={ariaInvalid ?? hasError}
        aria-label="Verification code"
      />
      <div className="mfa-code-cells" aria-hidden>
        {Array.from({ length: LENGTH }, (_, idx) => {
          const char = code[idx] ?? '';
          const isActive = idx === activeIndex;
          return (
            <div
              key={idx}
              className={[
                'mfa-code-digit',
                char ? 'mfa-code-digit--filled' : '',
                isActive ? 'mfa-code-digit--active' : '',
                popIndex === idx ? 'mfa-code-digit--pop' : '',
              ].filter(Boolean).join(' ')}
              onClick={(e) => handleCellClick(idx, e)}
            >
              {char}
            </div>
          );
        })}
      </div>
    </div>
  );
}
