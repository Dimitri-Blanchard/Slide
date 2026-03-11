import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { reports as reportsApi, friends as friendsApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import './ReportModal.css';

const REASONS = [
  { value: 'spam', labelKey: 'report.reasonSpam', label: 'Spam' },
  { value: 'harassment', labelKey: 'report.reasonHarassment', label: 'Harcèlement' },
  { value: 'inappropriate', labelKey: 'report.reasonInappropriate', label: 'Contenu inapproprié' },
  { value: 'impersonation', labelKey: 'report.reasonImpersonation', label: 'Usurpation d\'identité' },
  { value: 'other', labelKey: 'report.reasonOther', label: 'Autre' },
];

export default function ReportModal({ reportedUserId, reportedUsername, messageId, onClose, onBlock }) {
  const { t } = useLanguage();
  const [step, setStep] = useState('form'); // 'form' | 'block' | 'done'
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blockLoading, setBlockLoading] = useState(false);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!reason) {
      setError(t('report.selectReason', 'Veuillez choisir un motif.'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await reportsApi.submit({
        reported_user_id: reportedUserId,
        message_id: messageId || undefined,
        reason,
        details: details.trim() || undefined,
      });
      setStep('block');
    } catch (err) {
      setError(err.message || t('report.error', 'Une erreur est survenue.'));
    } finally {
      setLoading(false);
    }
  }, [reason, details, reportedUserId, messageId, t]);

  const handleBlock = useCallback(async () => {
    setBlockLoading(true);
    try {
      await friendsApi.block(reportedUserId);
      onBlock?.(reportedUserId);
    } catch {
      // Ignore block errors, proceed to close
    } finally {
      setBlockLoading(false);
      onClose();
    }
  }, [reportedUserId, onBlock, onClose]);

  const modal = (
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal" onClick={e => e.stopPropagation()}>
        <button className="report-modal-close" onClick={onClose} aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {step === 'form' && (
          <>
            <div className="report-modal-header">
              <div className="report-modal-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l1.664 1.664M6.457 6.457C8.11 5.536 10.016 5 12 5c4.418 0 8 3.582 8 8s-3.582 8-8 8c-1.984 0-3.89-.536-5.543-1.457M3.055 11.052A8.001 8.001 0 0 0 12 20.945M21 21 3 3"/>
                </svg>
              </div>
              <div>
                <h2 className="report-modal-title">
                  {t('report.title', 'Signaler')} {reportedUsername}
                </h2>
                <p className="report-modal-subtitle">
                  {messageId
                    ? t('report.subtitleMessage', 'Vous signalez un message.')
                    : t('report.subtitleUser', 'Vous signalez cet utilisateur.')}
                </p>
              </div>
            </div>

            <form className="report-modal-form" onSubmit={handleSubmit}>
              <div className="report-modal-field">
                <label className="report-modal-label">{t('report.reasonLabel', 'Motif')}</label>
                <div className="report-modal-reasons">
                  {REASONS.map(r => (
                    <label key={r.value} className={`report-reason-option ${reason === r.value ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="reason"
                        value={r.value}
                        checked={reason === r.value}
                        onChange={() => { setReason(r.value); setError(''); }}
                      />
                      {t(r.labelKey, r.label)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="report-modal-field">
                <label className="report-modal-label">
                  {t('report.detailsLabel', 'Détails (optionnel)')}
                </label>
                <textarea
                  className="report-modal-textarea"
                  placeholder={t('report.detailsPlaceholder', 'Décrivez brièvement le problème...')}
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>

              {error && <p className="report-modal-error">{error}</p>}

              <div className="report-modal-actions">
                <button type="button" className="report-btn-cancel" onClick={onClose}>
                  {t('common.cancel', 'Annuler')}
                </button>
                <button type="submit" className="report-btn-submit" disabled={loading}>
                  {loading ? t('report.submitting', 'Envoi...') : t('report.submit', 'Envoyer le signalement')}
                </button>
              </div>
            </form>
          </>
        )}

        {step === 'block' && (
          <div className="report-modal-block-step">
            <div className="report-modal-success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <h2 className="report-modal-title">{t('report.thankYou', 'Signalement envoyé')}</h2>
            <p className="report-modal-block-text">
              {t('report.blockQuestion', 'Voulez-vous également bloquer')} <strong>{reportedUsername}</strong> ?
            </p>
            <p className="report-modal-block-hint">
              {t('report.blockHint', 'Bloquer cet utilisateur l\'empêchera de vous envoyer des messages.')}
            </p>
            <div className="report-modal-actions">
              <button className="report-btn-cancel" onClick={onClose} disabled={blockLoading}>
                {t('report.noBlock', 'Non, merci')}
              </button>
              <button className="report-btn-block" onClick={handleBlock} disabled={blockLoading}>
                {blockLoading ? t('report.blocking', 'Blocage...') : t('report.yesBlock', 'Bloquer')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
