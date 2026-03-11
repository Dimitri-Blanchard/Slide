import React, { useRef, useCallback } from 'react';
import './MfaCodeInput.css';

const LENGTH = 6;

export default function MfaCodeInput({
  value = '',
  onChange,
  id,
  autoFocus = false,
  disabled = false,
  hasError = false,
  'aria-invalid': ariaInvalid,
}) {
  const digits = (value.replace(/\D/g, '').slice(0, LENGTH) + ''.padEnd(LENGTH, ' ')).slice(0, LENGTH).split('');
  const inputRefs = useRef([]);

  const focusIndex = useCallback((idx) => {
    inputRefs.current[idx]?.focus();
  }, []);

  const handleKeyDown = useCallback((e, idx) => {
    if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      focusIndex(idx - 1);
    } else if (e.key === 'ArrowRight' && idx < LENGTH - 1) {
      e.preventDefault();
      focusIndex(idx + 1);
    } else if (e.key === 'Backspace') {
      const hasDigit = digits[idx] && digits[idx] !== ' ';
      if (hasDigit) {
        e.preventDefault();
        const newDigits = [...digits];
        newDigits[idx] = ' ';
        onChange?.(newDigits.join('').replace(/\s/g, ''));
      } else if (idx > 0) {
        e.preventDefault();
        const newVal = digits.slice(0, idx - 1).join('').replace(/\s/g, '');
        onChange?.(newVal);
        focusIndex(idx - 1);
      }
    }
  }, [digits, onChange, focusIndex]);

  const handleInput = useCallback((e, idx) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 1) {
      const pasted = (raw + digits.join('').replace(/\s/g, '')).slice(0, LENGTH);
      onChange?.(pasted);
      const next = Math.min(idx + pasted.length, LENGTH - 1);
      setTimeout(() => focusIndex(next), 0);
      return;
    }
    const digit = raw.slice(-1) || '';
    const newDigits = [...digits];
    newDigits[idx] = digit;
    const newVal = newDigits.join('').replace(/\s/g, '');
    onChange?.(newVal);
    if (digit && idx < LENGTH - 1) {
      setTimeout(() => focusIndex(idx + 1), 0);
    }
  }, [digits, onChange, focusIndex]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const pasted = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, LENGTH) ?? '';
    if (!pasted) return;
    onChange?.(pasted);
    focusIndex(Math.min(pasted.length, LENGTH) - 1);
  }, [onChange, focusIndex]);

  return (
    <div
      className={`mfa-code-input-wrap ${hasError ? 'mfa-code-input-wrap--error' : ''} ${disabled ? 'mfa-code-input-wrap--disabled' : ''}`}
      role="group"
      aria-label="Verification code"
    >
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={(el) => { inputRefs.current[idx] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? 'one-time-code' : 'off'}
          maxLength={idx === 0 ? 6 : 1}
          value={d === ' ' ? '' : d}
          onChange={(e) => handleInput(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          onPaste={handlePaste}
          disabled={disabled}
          autoFocus={autoFocus && idx === 0}
          className="mfa-code-digit"
          aria-invalid={ariaInvalid ?? hasError}
          aria-label={`Digit ${idx + 1}`}
          data-digit-index={idx}
          id={idx === 0 ? id : undefined}
        />
      ))}
    </div>
  );
}
