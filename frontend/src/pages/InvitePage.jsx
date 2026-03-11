import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { AvatarImg } from '../components/Avatar';
import { servers, invalidateCache } from '../api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
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

  useEffect(() => {
    if (!code) return;
    
    setLoading(true);
    setError('');
    
    servers.getInviteInfo(code)
      .then(setInviteInfo)
      .catch(err => setError(err.message || 'Invitation invalide ou expirée'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!user) {
      // Redirect to login with return URL
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
      <div className="invite-page">
        <div className="invite-card loading">
          <div className="loading-spinner" />
          <p>Vérification de l'invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="invite-page">
        <div className="invite-card error">
          <div className="error-icon"><XCircle size={48} strokeWidth={1.5} /></div>
          <h2>Invitation invalide</h2>
          <p>{error}</p>
          <Link to="/" className="back-link">Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page">
      <div className="invite-card">
        <p className="invite-label">Vous avez été invité à rejoindre</p>
        
        <div className="server-preview">
          {/* Banner */}
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
              <span className="stat-dot online" />
              {inviteInfo?.team?.online_count || 0} En ligne
            </span>
            <span className="stat">
              <span className="stat-dot" />
              {inviteInfo?.team?.member_count || 0} Membre{(inviteInfo?.team?.member_count || 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {inviteInfo?.inviter?.name && (
          <p className="inviter-info">
            Invité par <strong>{inviteInfo.inviter.name}</strong>
          </p>
        )}

        <button 
          className="accept-btn"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? 'Connexion...' : user ? 'Accepter l\'invitation' : 'Se connecter pour accepter'}
        </button>

        {!user && (
          <p className="login-hint">
            Pas encore de compte ? <Link to={`/register?redirect=/invite/${code}`}>S'inscrire</Link>
          </p>
        )}
        <div className="invite-footer-links">
          <Link to="/privacy">{t('legal.privacyLink')}</Link>
          <span className="invite-footer-sep">·</span>
          <Link to="/terms">{t('legal.termsLink')}</Link>
        </div>
      </div>
    </div>
  );
}
