import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { auth } from '../api';
import './Auth.css';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg(t('auth.verifyEmailNoToken'));
      return;
    }
    auth.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setErrorMsg(err.message || t('auth.verifyEmailExpired'));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="Slide" className="auth-logo" />

          {status === 'loading' && (
            <>
              <h2>{t('auth.verifyEmailLoading')}</h2>
              <p>{t('auth.verifyEmailWait')}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <h2>{t('auth.verifyEmailSuccess')}</h2>
              <p>{t('auth.verifyEmailSuccessDesc')}</p>
            </>
          )}

          {status === 'error' && (
            <>
              <h2>{t('auth.verifyEmailInvalid')}</h2>
              <p>{errorMsg}</p>
            </>
          )}
        </div>

        <div className="auth-switch" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link to="/">{t('auth.backToApp')}</Link>
        </div>
      </div>
    </div>
  );
}
