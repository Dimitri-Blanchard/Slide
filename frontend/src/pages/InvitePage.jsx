import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { XCircle, Clock } from 'lucide-react';
import { AvatarImg } from '../components/Avatar';
import { servers, invalidateCache } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import AuthShell from '../components/AuthShell';
import './InvitePage.css';

export default function InvitePage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [inviteInfo, setInviteInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!code) return;

    setLoading(true);
    setError('');
    setIsExpired(false);

    servers.getInviteInfo(code)
      .then(setInviteInfo)
      .catch(err => {
        const msg = err.message || '';
        setIsExpired(/expir/i.test(msg));
        setError(msg || t('invite.invalid'));
      })
      .finally(() => setLoading(false));
  }, [code, t]);

  const handleJoin = async () => {
    if (!user) {
      navigate(`/login?redirect=/invite/${code}`);
      return;
    }

    setJoining(true);
    setError('');

    try {
      const result = await servers.joinWithInvite(code);
      invalidateCache('/teams');
      localStorage.removeItem('slide_teams_cache');
      navigate(`/team/${result.team_id}`);
    } catch (err) {
      setError(err.message || 'Impossible de rejoindre le serveur');
    }
    setJoining(false);
  };

  if (loading) {
    return (
      <AuthShell>
        <div className="invite-card invite-card--loading">
          <div className="invite-spinner" />
          <p className="invite-loading-text">Vérification de l'invitation…</p>
        </div>
      </AuthShell>
    );
  }

  if (error) {
    return (
      <AuthShell>
        <div className="invite-card invite-card--error">
          <div className="invite-error-icon">
            {isExpired ? <Clock size={48} strokeWidth={1.5} /> : <XCircle size={48} strokeWidth={1.5} />}
          </div>
          <h2 className="invite-error-title">
            {isExpired ? 'Ce lien a expiré' : 'Lien invalide'}
          </h2>
          <p className="invite-error-body">
            {isExpired
              ? 'Ce lien d\'invitation n\'est plus valide. Demande un nouveau lien à quelqu\'un du serveur.'
              : error}
          </p>
          <Link to="/" className="invite-home-btn">Retour à l'accueil</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="invite-card">
        <p className="invite-label">{t('invite.youAreInvited')}</p>

        <div className="server-preview">
          {inviteInfo?.team?.banner_url && (
            <div
              className="server-banner"
              style={{ backgroundImage: `url(${inviteInfo.team.banner_url})` }}
            />
          )}
          <div className="server-icon">
            {inviteInfo?.team?.avatar_url ? (
              <AvatarImg src={inviteInfo.team.avatar_url} alt={inviteInfo.team?.name} />
            ) : (
              <span>{inviteInfo?.team?.name?.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <h1 className="server-name">{inviteInfo?.team?.name}</h1>
          <div className="server-stats">
            <span className="stat">
              <span className="stat-dot stat-dot--online" />
              {inviteInfo?.team?.online_count || 0} {t('invite.online')}
            </span>
            <span className="stat">
              <span className="stat-dot" />
              {inviteInfo?.team?.member_count || 0} {t('invite.members')}
            </span>
          </div>
        </div>

        {inviteInfo?.inviter?.name && (
          <p className="inviter-info">
            Invité par <strong>{inviteInfo.inviter.name}</strong>
          </p>
        )}

        {error && <div className="invite-inline-error">{error}</div>}

        <button
          className="accept-btn"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? 'Connexion…' : user ? t('invite.join') : 'Se connecter pour accepter'}
        </button>

        {!user && (
          <p className="login-hint">
            Pas encore de compte ?{' '}
            <Link to={`/register?redirect=/invite/${code}`}>S'inscrire</Link>
          </p>
        )}
      </div>
    </AuthShell>
  );
}
