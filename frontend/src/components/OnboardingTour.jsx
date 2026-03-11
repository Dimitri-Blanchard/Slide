import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { auth as authApi } from '../api';
import {
  Lock,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Users,
  MessageCircle,
  UserPlus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import './OnboardingTour.css';

const STORAGE_KEY = 'slide_onboarding_seen';

export function hasSeenOnboarding(user) {
  // Server flag takes priority
  if (user?.onboarding_seen) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setOnboardingSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore
  }
}

const STEPS = [
  {
    id: 'security',
    icon: Lock,
    iconClass: 'tour-icon-security',
    target: null,
  },
  {
    id: 'servers',
    icon: Users,
    iconClass: 'tour-icon-servers',
    target: '[data-tour-id="tour-servers"]',
  },
  {
    id: 'dms',
    icon: MessageCircle,
    iconClass: 'tour-icon-dms',
    target: '[data-tour-id="tour-dms"]',
  },
  {
    id: 'friends',
    icon: UserPlus,
    iconClass: 'tour-icon-friends',
    target: '[data-tour-id="tour-friends"]',
  },
  {
    id: 'shortcuts',
    icon: Search,
    iconClass: 'tour-icon-shortcuts',
    target: '[data-tour-id="tour-search"]',
  },
  {
    id: 'done',
    icon: Sparkles,
    iconClass: 'tour-icon-done',
    target: null,
  },
];

export default function OnboardingTour({ onClose }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  const currentStep = STEPS[step];
  const Icon = currentStep.icon;
  const total = STEPS.length;
  const isFirst = step === 0;
  const isLast = step === total - 1;
  const targetSelector = currentStep.target;

  const [rectState, setRectState] = useState(null);

  const viewport = {
    width: Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0),
    height: Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0),
  };

  useEffect(() => {
    if (!targetSelector) {
      setRectState(null);
      return;
    }
    const el = getVisibleTargetElement(targetSelector);
    if (!el) {
      setRectState(null);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    const updateRect = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        setRectState(null);
        return;
      }
      setRectState({
        top: Math.max(0, r.top),
        left: Math.max(0, r.left),
        width: Math.max(0, Math.min(r.width, window.innerWidth - Math.max(0, r.left))),
        height: Math.max(0, Math.min(r.height, window.innerHeight - Math.max(0, r.top))),
      });
    };
    updateRect();

    const ro = new ResizeObserver(updateRect);
    ro.observe(el);
    window.addEventListener('scroll', updateRect, true);
    window.addEventListener('resize', updateRect);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', updateRect, true);
      window.removeEventListener('resize', updateRect);
    };
  }, [targetSelector, step]);

  const markSeen = () => {
    setOnboardingSeen();
    if (user) authApi.setFlags({ onboarding_seen: true }).catch(() => {});
  };

  const handleNext = () => {
    if (isLast) {
      markSeen();
      onClose?.();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirst) setStep((s) => s - 1);
  };

  const handleSkip = () => {
    markSeen();
    onClose?.();
  };

  const handleBackdropClick = () => {
    handleNext();
  };

  // Step 1: Security
  const renderSecurityContent = () => (
    <>
      <div className={`tour-step-icon ${currentStep.iconClass}`}>
        <Icon size={48} strokeWidth={1.5} />
      </div>
      <h2 id="tour-title" className="tour-step-title">{t('onboarding.headline')}</h2>
      <p className="tour-step-desc">{t('onboarding.subtext')}</p>
      <ul className="tour-step-bullets">
        <li><CheckCircle size={18} /><span>{t('onboarding.bulletE2EE')}</span></li>
        <li><CheckCircle size={18} /><span>{t('onboarding.bulletZeroLogs')}</span></li>
        <li><CheckCircle size={18} /><span>{t('onboarding.bulletAudited')}</span></li>
        <li><CheckCircle size={18} /><span>{t('onboarding.bulletNitro')}</span></li>
      </ul>
    </>
  );

  // Steps with highlight
  const renderStepContent = () => (
    <>
      <div className={`tour-step-icon ${currentStep.iconClass}`}>
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <h2 id="tour-title" className="tour-step-title">{t(`onboarding.tour.${currentStep.id}.title`)}</h2>
      <p className="tour-step-desc">{t(`onboarding.tour.${currentStep.id}.desc`)}</p>
    </>
  );

  const renderContent = () =>
    currentStep.id === 'security' ? renderSecurityContent() : renderStepContent();

  const hasHighlight = !!targetSelector && !!rectState;
  const tooltipPosition = hasHighlight
    ? getTooltipPosition(rectState, viewport)
    : { type: 'center', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  const content = (
    <div className="tour-root" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Backdrop panels - create spotlight cutout */}
      {hasHighlight && rectState && (
        <>
          <div
            className="tour-backdrop tour-backdrop-top"
            style={{ height: Math.max(0, rectState.top) }}
            onClick={handleBackdropClick}
          />
          <div
            className="tour-backdrop tour-backdrop-bottom"
            style={{
              top: rectState.top + rectState.height,
              height: Math.max(0, viewport.height - (rectState.top + rectState.height)),
            }}
            onClick={handleBackdropClick}
          />
          <div
            className="tour-backdrop tour-backdrop-left"
            style={{
              top: rectState.top,
              left: 0,
              width: rectState.left,
              height: rectState.height,
            }}
            onClick={handleBackdropClick}
          />
          <div
            className="tour-backdrop tour-backdrop-right"
            style={{
              top: rectState.top,
              left: rectState.left + rectState.width,
              width: Math.max(0, viewport.width - (rectState.left + rectState.width)),
              height: rectState.height,
            }}
            onClick={handleBackdropClick}
          />
          {/* Highlight ring around element */}
          <div
            className="tour-spotlight-ring"
            style={{
              top: rectState.top - 4,
              left: rectState.left - 4,
              width: rectState.width + 8,
              height: rectState.height + 8,
            }}
          />
        </>
      )}

      {/* Non-highlight steps: dim full screen */}
      {!hasHighlight && (
        <div className="tour-backdrop tour-backdrop-full" onClick={handleBackdropClick} />
      )}

      {/* Tooltip card */}
      <div
        className={`tour-tooltip ${hasHighlight ? 'tour-tooltip-floating' : 'tour-tooltip-centered'}`}
        style={
          hasHighlight
            ? {
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: tooltipPosition.transform,
                maxWidth: tooltipPosition.maxWidth,
              }
            : {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: 420,
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="tour-skip-btn"
          onClick={handleSkip}
          aria-label={t('onboarding.skip')}
        >
          <X size={18} />
          {t('onboarding.skip')}
        </button>

        <div className="tour-tooltip-content">{renderContent()}</div>

        <div className="tour-footer">
          <div className="tour-dots">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`tour-dot ${i === step ? 'active' : ''}`}
                onClick={() => setStep(i)}
                aria-label={t('onboarding.step', { current: i + 1, total })}
              />
            ))}
          </div>
          <div className="tour-actions">
            {!isFirst && (
              <button type="button" className="tour-btn tour-btn-prev" onClick={handlePrev}>
                <ChevronLeft size={18} />
                {t('common.previous')}
              </button>
            )}
            <button type="button" className="tour-btn tour-btn-next" onClick={handleNext}>
              {isLast ? t('onboarding.finish') : t('common.next')}
              {!isLast && <ChevronRight size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(content, document.body);
}

function getVisibleTargetElement(selector) {
  const nodes = Array.from(document.querySelectorAll(selector));
  for (const node of nodes) {
    const style = window.getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    const isVisible = style.display !== 'none'
      && style.visibility !== 'hidden'
      && parseFloat(style.opacity || '1') > 0
      && rect.width > 0
      && rect.height > 0;
    if (isVisible) return node;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTooltipPosition(rect, viewport) {
  const padding = 16;
  const tooltipWidth = 320;
  const tooltipHeight = 220;
  const arrowSize = 10;

  const spaceBelow = window.innerHeight - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = window.innerWidth - (rect.left + rect.width);
  const spaceLeft = rect.left;

  if (spaceBelow >= tooltipHeight + padding) {
    const desiredLeft = rect.left + rect.width / 2;
    return {
      top: rect.top + rect.height + padding + arrowSize,
      left: clamp(desiredLeft, padding + tooltipWidth / 2, viewport.width - padding - tooltipWidth / 2),
      transform: 'translateX(-50%)',
      maxWidth: 360,
    };
  }
  if (spaceAbove >= tooltipHeight + padding) {
    const desiredLeft = rect.left + rect.width / 2;
    return {
      top: rect.top - padding - arrowSize - tooltipHeight,
      left: clamp(desiredLeft, padding + tooltipWidth / 2, viewport.width - padding - tooltipWidth / 2),
      transform: 'translateX(-50%)',
      maxWidth: 360,
    };
  }
  if (spaceRight >= tooltipWidth + padding) {
    const desiredTop = rect.top + rect.height / 2;
    return {
      top: clamp(desiredTop, padding + tooltipHeight / 2, viewport.height - padding - tooltipHeight / 2),
      left: rect.left + rect.width + padding + arrowSize,
      transform: 'translateY(-50%)',
      maxWidth: 320,
    };
  }
  if (spaceLeft >= tooltipWidth + padding) {
    const desiredTop = rect.top + rect.height / 2;
    return {
      top: clamp(desiredTop, padding + tooltipHeight / 2, viewport.height - padding - tooltipHeight / 2),
      left: rect.left - padding - arrowSize,
      transform: 'translate(-100%, -50%)',
      maxWidth: 320,
    };
  }
  return {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: 360,
  };
}
