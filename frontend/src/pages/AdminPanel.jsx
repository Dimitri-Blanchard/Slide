import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, Home, Megaphone, ChevronLeft, CircleDot, MessageCircle, Hash, Hammer, Target, RefreshCw, Zap, Trash2, Flag, Activity, AlertTriangle, CheckCircle, XCircle, Server } from 'lucide-react';
import { api, reports as reportsApi } from '../api';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';
import ConfirmModal from '../components/ConfirmModal';
import './AdminPanel.css';

// Admin API functions
const admin = {
  getStats: () => api('/admin/stats'),
  getUsers: (params) => {
    const q = new URLSearchParams(params).toString();
    return api(`/admin/users${q ? `?${q}` : ''}`);
  },
  updateReportStatus: (id, status) =>
    api(`/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getUser: (userId) => api(`/admin/users/${userId}`),
  banUser: (userId, reason, duration) =>
    api(`/admin/users/${userId}/ban`, { method: 'POST', body: JSON.stringify({ reason, duration }) }),
  unbanUser: (userId) =>
    api(`/admin/users/${userId}/unban`, { method: 'POST' }),
  updateUserRole: (userId, role) =>
    api(`/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  setNitro: (userId, hasNitro) =>
    api(`/admin/users/${userId}/nitro`, { method: 'PATCH', body: JSON.stringify({ hasNitro }) }),
  deleteUser: (userId) =>
    api(`/admin/users/${userId}`, { method: 'DELETE' }),
  getTeams: () => api('/admin/teams'),
  deleteTeam: (teamId) =>
    api(`/admin/teams/${teamId}`, { method: 'DELETE' }),
  broadcast: (message, type) =>
    api('/admin/broadcast', { method: 'POST', body: JSON.stringify({ message, type }) }),
  getOnlineUsers: () => api('/admin/online'),
  resetQuests: () =>
    api('/admin/quests/reset', { method: 'POST' }),
  getNitroWaitlist: () => api('/admin/nitro-waitlist'),
  removeNitroWaitlist: (id) =>
    api(`/admin/nitro-waitlist/${id}`, { method: 'DELETE' }),
  getHealth: () => api('/admin/health'),
  getHealthLogs: (limit = 50) => api(`/admin/health/logs?limit=${limit}`),
};

// Stats Card component
function StatCard({ label, value, icon: Icon }) {
  const isComponent = typeof Icon === 'function' || (Icon && typeof Icon === 'object' && Icon.$$typeof);
  return (
    <div className="stat-card">
      <span className="stat-icon">{isComponent ? <Icon size={24} /> : Icon}</span>
      <div className="stat-info">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

const REPORT_REASONS_FR = {
  spam: 'Spam', harassment: 'Harcèlement', inappropriate: 'Inapproprié',
  impersonation: 'Usurpation', other: 'Autre',
};

function reportBadgeClass(pending) {
  if (pending === 0) return '';
  if (pending <= 2) return 'reports-low';
  if (pending <= 5) return 'reports-mid';
  return 'reports-high';
}

// Expanded user detail panel
function UserDetailPanel({ userId, onClose, onUserUpdated, onUserDeleted }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState('');
  const [showBanInput, setShowBanInput] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    admin.getUser(userId).then(d => { setDetail(d); setLoading(false); }).catch(() => setLoading(false));
  }, [userId]);

  const doAction = async (fn) => {
    setActionLoading(true);
    try { await fn(); } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  if (loading) return <div className="user-detail-loading">Chargement...</div>;
  if (!detail) return <div className="user-detail-loading">Introuvable</div>;

  const { stats, reports, reportsSummary, teams } = detail;
  const isBanned = !!detail.banned_at;

  return (
    <div className="user-detail-panel">
      <div className="user-detail-header">
        <Avatar user={detail} size="large" />
        <div className="user-detail-identity">
          <div className="user-detail-name">
            {detail.display_name}
            {detail.role === 'admin' && <span className="admin-badge">Admin</span>}
            {detail.has_nitro && <span className="nitro-badge">Nitro</span>}
            {isBanned && <span className="banned-badge">Banni</span>}
          </div>
          <div className="user-detail-sub">@{detail.username} · {detail.email}</div>
          <div className="user-detail-sub">
            Inscrit le {new Date(detail.created_at).toLocaleDateString('fr-FR')} ·
            Vu {detail.last_seen ? new Date(detail.last_seen).toLocaleString('fr-FR') : 'jamais'}
          </div>
        </div>
        <button className="user-detail-close" onClick={onClose}>✕</button>
      </div>

      {/* Stats row */}
      <div className="user-detail-stats">
        <div className="user-stat"><span>{stats?.channelMessages ?? '—'}</span><small>Messages</small></div>
        <div className="user-stat"><span>{stats?.directMessages ?? '—'}</span><small>DMs</small></div>
        <div className="user-stat"><span>{stats?.messagesThisWeek ?? '—'}</span><small>Cette semaine</small></div>
        <div className="user-stat"><span>{stats?.teamsCount ?? '—'}</span><small>Serveurs</small></div>
        <div className={`user-stat ${reportBadgeClass(reportsSummary?.pending)}`}>
          <span>{reportsSummary?.pending ?? 0}</span><small>Signalements</small>
        </div>
      </div>

      {/* Reports section */}
      {reports && reports.length > 0 && (
        <div className="user-detail-reports">
          <div className="user-detail-section-title">
            Signalements ({reportsSummary.total} total, {reportsSummary.pending} en attente)
          </div>
          {reportsSummary.byReason?.length > 0 && (
            <div className="user-reports-breakdown">
              {reportsSummary.byReason.map(r => (
                <span key={r.reason} className="user-report-reason-pill">
                  {REPORT_REASONS_FR[r.reason] || r.reason}: <strong>{r.count}</strong>
                </span>
              ))}
            </div>
          )}
          <div className="user-reports-list">
            {reports.map(r => (
              <div key={r.id} className={`user-report-row status-${r.status}`}>
                <span className={`user-report-reason ${r.reason}`}>{REPORT_REASONS_FR[r.reason] || r.reason}</span>
                <span className="user-report-by">par @{r.reporter_username}</span>
                {r.details && <span className="user-report-details">"{r.details}"</span>}
                <span className="user-report-date">{new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
                <span className={`user-report-status ${r.status}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Servers */}
      {teams && teams.length > 0 && (
        <div className="user-detail-teams">
          <div className="user-detail-section-title">Serveurs ({teams.length})</div>
          <div className="user-teams-list">
            {teams.map(t => (
              <span key={t.id} className="user-team-pill">{t.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="user-detail-actions">
        {isBanned ? (
          <button className="action-btn unban" disabled={actionLoading}
            onClick={() => doAction(async () => {
              await admin.unbanUser(detail.id);
              onUserUpdated({ ...detail, banned_at: null });
              setDetail(d => ({ ...d, banned_at: null }));
            })}>Débannir</button>
        ) : showBanInput ? (
          <div className="ban-reason-row">
            <input className="ban-reason-input" placeholder="Motif du bannissement..." value={banReason}
              onChange={e => setBanReason(e.target.value)} autoFocus />
            <button className="action-btn ban" disabled={actionLoading}
              onClick={() => doAction(async () => {
                await admin.banUser(detail.id, banReason || 'Violation des règles');
                const ts = new Date().toISOString();
                onUserUpdated({ ...detail, banned_at: ts });
                setDetail(d => ({ ...d, banned_at: ts }));
                setShowBanInput(false);
              })}>Confirmer</button>
            <button className="action-btn" onClick={() => setShowBanInput(false)}>Annuler</button>
          </div>
        ) : (
          <button className="action-btn ban" onClick={() => setShowBanInput(true)}>Bannir</button>
        )}

        {detail.role === 'admin' ? (
          <button className="action-btn demote" disabled={actionLoading}
            onClick={() => doAction(async () => {
              await admin.updateUserRole(detail.id, 'user');
              onUserUpdated({ ...detail, role: 'user' });
              setDetail(d => ({ ...d, role: 'user' }));
            })}>Rétrograder</button>
        ) : (
          <button className="action-btn promote" disabled={actionLoading}
            onClick={() => doAction(async () => {
              await admin.updateUserRole(detail.id, 'admin');
              onUserUpdated({ ...detail, role: 'admin' });
              setDetail(d => ({ ...d, role: 'admin' }));
            })}>Promouvoir Admin</button>
        )}

        <button className={`action-btn ${detail.has_nitro ? 'nitro-on' : 'nitro-off'}`} disabled={actionLoading}
          onClick={() => doAction(async () => {
            const v = !detail.has_nitro;
            await admin.setNitro(detail.id, v);
            onUserUpdated({ ...detail, has_nitro: v });
            setDetail(d => ({ ...d, has_nitro: v }));
          })}>{detail.has_nitro ? 'Retirer Nitro' : 'Accorder Nitro'}</button>

        {confirmDelete ? (
          <>
            <button className="action-btn delete" disabled={actionLoading}
              onClick={() => doAction(async () => {
                await admin.deleteUser(detail.id);
                onUserDeleted(detail.id);
                onClose();
              })}>Confirmer suppression</button>
            <button className="action-btn" onClick={() => setConfirmDelete(false)}>Annuler</button>
          </>
        ) : (
          <button className="action-btn delete" onClick={() => setConfirmDelete(true)}>Supprimer</button>
        )}
      </div>
    </div>
  );
}

// Users Tab
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [expandedId, setExpandedId] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, sort };
      if (search) params.search = search;
      if (filter !== 'all') params.filter = filter;
      const data = await admin.getUsers(params);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      setPagination(data?.pagination || null);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [search, filter, sort, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { setPage(1); }, [search, filter, sort]);

  const updateUser = useCallback((updated) => {
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...u, ...updated } : u));
  }, []);

  const deleteUser = useCallback((id) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  return (
    <div className="admin-tab">
      <div className="admin-tab-header">
        <input type="text" placeholder="Rechercher..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="admin-search" />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="admin-filter">
          <option value="all">Tous</option>
          <option value="reported">⚠ Signalés</option>
          <option value="banned">Bannis</option>
          <option value="admin">Admins</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="admin-filter">
          <option value="recent">Récents</option>
          <option value="reports">+ Signalés</option>
        </select>
      </div>

      {loading ? (
        <div className="admin-loading">Chargement...</div>
      ) : (
        <div className="admin-users-list">
          {users.map(user => {
            const isExpanded = expandedId === user.id;
            const pendingReports = Number(user.pending_reports) || 0;
            const totalReports = Number(user.total_reports) || 0;
            const badgeClass = reportBadgeClass(pendingReports);

            return (
              <div key={user.id} className={`admin-user-item ${user.banned_at ? 'banned' : ''} ${isExpanded ? 'expanded' : ''}`}>
                <div className="admin-user-row" onClick={() => setExpandedId(isExpanded ? null : user.id)}
                  style={{ cursor: 'pointer' }}>
                  <Avatar user={user} size="medium" />
                  <div className="admin-user-info">
                    <span className="admin-user-name">
                      {user.display_name}
                      {user.role === 'admin' && <span className="admin-badge">Admin</span>}
                      {user.has_nitro && <span className="nitro-badge">Nitro</span>}
                      {user.banned_at && <span className="banned-badge">Banni</span>}
                      {totalReports > 0 && (
                        <span className={`report-count-badge ${badgeClass}`} title={`${pendingReports} en attente / ${totalReports} total`}>
                          ⚑ {pendingReports > 0 ? pendingReports : totalReports}
                        </span>
                      )}
                    </span>
                    <span className="admin-user-email">{user.email}</span>
                    <span className="admin-user-meta">
                      @{user.username} · {new Date(user.created_at).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <span className="user-expand-chevron">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <UserDetailPanel
                    userId={user.id}
                    onClose={() => setExpandedId(null)}
                    onUserUpdated={updateUser}
                    onUserDeleted={deleteUser}
                  />
                )}
              </div>
            );
          })}
          {users.length === 0 && <div className="admin-empty">Aucun utilisateur trouvé.</div>}
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
          <span>Page {page} / {pagination.totalPages}</span>
          <button disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}

// Teams Tab
function TeamsTab() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState({ open: false, team: null });

  useEffect(() => {
    admin.getTeams()
      .then(data => setTeams(Array.isArray(data?.teams) ? data.teams : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async () => {
    if (!confirmModal.team) return;
    try {
      await admin.deleteTeam(confirmModal.team.id);
      setTeams(teams.filter(t => t.id !== confirmModal.team.id));
    } catch (err) {
      console.error(err);
    }
    setConfirmModal({ open: false, team: null });
  };

  if (loading) {
    return <div className="admin-loading">Chargement...</div>;
  }

  return (
    <div className="admin-tab">
      <div className="admin-teams-list">
        {teams.map(team => (
          <div key={team.id} className="admin-team-item">
            <div className="admin-team-icon">
              {team.name?.charAt(0).toUpperCase()}
            </div>
            <div className="admin-team-info">
              <span className="admin-team-name">{team.name}</span>
              <span className="admin-team-meta">
                {team.member_count || 0} membres • Créé le {new Date(team.created_at).toLocaleDateString()}
              </span>
            </div>
            <button 
              onClick={() => setConfirmModal({ open: true, team })}
              className="action-btn delete"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

      <ConfirmModal
        isOpen={confirmModal.open}
        title="Supprimer le serveur"
        message={`Êtes-vous sûr de vouloir supprimer "${confirmModal.team?.name}" ? Cette action est irréversible.`}
        confirmText="Supprimer"
        cancelText="Annuler"
        type="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmModal({ open: false, team: null })}
      />
    </div>
  );
}

// Quests Tab
function QuestsTab() {
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetClick = () => setShowResetConfirm(true);

  const handleConfirmReset = async () => {
    setShowResetConfirm(false);
    setResetting(true);
    setResult(null);
    try {
      const data = await admin.resetQuests();
      setResult({ success: true, deleted: data.deleted });
      setTimeout(() => setResult(null), 5000);
    } catch (err) {
      setResult({ success: false, error: err?.message });
    }
    setResetting(false);
  };

  return (
    <div className="admin-tab">
      <h3>Quests</h3>
      <p className="admin-hint">Reset all quest progress for every user. Progress and claimed rewards will be cleared.</p>
      <button
        onClick={handleResetClick}
        disabled={resetting}
        className="action-btn delete"
        style={{ marginTop: 8 }}
      >
        {resetting ? 'Resetting...' : 'Reset Quests for Everyone'}
      </button>
      {result && (
        <p style={{ marginTop: 12, color: result.success ? 'var(--success)' : 'var(--danger)' }}>
          {result.success ? `✓ Reset complete. ${result.deleted ?? 0} progress entries deleted.` : result.error}
        </p>
      )}
      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Quests"
        message="Reset quest progress for ALL users? This cannot be undone."
        confirmText="Reset"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleConfirmReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

// Nitro Waitlist Tab
function NitroWaitlistTab() {
  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, subscriber: null });

  const loadWaitlist = useCallback(async () => {
    setLoading(true);
    try {
      const data = await admin.getNitroWaitlist();
      setSubscribers(Array.isArray(data?.subscribers) ? data.subscribers : []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadWaitlist();
  }, [loadWaitlist]);

  const handleRemove = async () => {
    if (!confirmModal.subscriber) return;
    setRemoving(confirmModal.subscriber.id);
    try {
      await admin.removeNitroWaitlist(confirmModal.subscriber.id);
      setSubscribers(prev => prev.filter(s => s.id !== confirmModal.subscriber.id));
    } catch (err) {
      console.error(err);
    }
    setRemoving(null);
    setConfirmModal({ open: false, subscriber: null });
  };

  return (
    <div className="admin-tab">
      <div className="admin-tab-header" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={20} />
          Nitro waitlist
        </h3>
        <p className="admin-hint" style={{ margin: '8px 0 0' }}>
          {subscribers.length} {subscribers.length === 1 ? 'subscriber' : 'subscribers'}
        </p>
      </div>

      {loading ? (
        <div className="admin-loading">Chargement...</div>
      ) : subscribers.length === 0 ? (
        <p className="admin-hint">Aucun inscrit sur la liste Nitro pour le moment.</p>
      ) : (
        <div className="admin-waitlist-list">
          {subscribers.map(sub => (
            <div key={sub.id} className="admin-waitlist-item">
              <div className="admin-waitlist-info">
                <span className="admin-waitlist-email">{sub.email}</span>
                <span className="admin-waitlist-meta">
                  {sub.display_name ? `${sub.display_name} (@${sub.username || '-'})` : 'Guest'}
                  {' • '}
                  {new Date(sub.created_at).toLocaleString()}
                </span>
              </div>
              <button
                onClick={() => setConfirmModal({ open: true, subscriber: sub })}
                className="action-btn delete"
                title="Retirer de la liste"
                disabled={removing === sub.id}
              >
                <Trash2 size={14} />
                {removing === sub.id ? '...' : 'Retirer'}
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.open}
        title="Retirer de la liste Nitro"
        message={`Retirer ${confirmModal.subscriber?.email} de la liste d'attente Nitro ?`}
        confirmText="Retirer"
        cancelText="Annuler"
        type="danger"
        onConfirm={handleRemove}
        onCancel={() => setConfirmModal({ open: false, subscriber: null })}
      />
    </div>
  );
}

// Broadcast Tab
function BroadcastTab() {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('info');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleBroadcast = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await admin.broadcast(message.trim(), type);
      setSent(true);
      setMessage('');
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error(err);
    }
    setSending(false);
  };

  return (
    <div className="admin-tab">
      <h3>Annonce système</h3>
      <p className="admin-hint">Envoyer une notification à tous les utilisateurs connectés.</p>
      
      <div className="broadcast-form">
        <div className="form-group">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="info">Information</option>
            <option value="warning">Avertissement</option>
            <option value="error">Urgent</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Votre message..."
            rows={4}
          />
        </div>

        <button 
          onClick={handleBroadcast} 
          disabled={sending || !message.trim()}
          className={`broadcast-btn ${sent ? 'sent' : ''}`}
        >
          {sent ? '✓ Envoyé !' : sending ? 'Envoi...' : 'Envoyer l\'annonce'}
        </button>
      </div>
    </div>
  );
}

// Health Tab
function HealthTab() {
  const [health, setHealth] = useState(null);
  const [logs, setLogs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedAlert, setExpandedAlert] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  const loadHealth = useCallback(async () => {
    try {
      const data = await admin.getHealth();
      setHealth(data);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to load health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await admin.getHealthLogs(100);
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to load logs:', err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000);
    return () => clearInterval(interval);
  }, [loadHealth]);

  useEffect(() => {
    if (showLogs && logs === null) loadLogs();
  }, [showLogs, logs, loadLogs]);

  const statusIcon = (ok) => ok
    ? <CheckCircle size={16} className="health-status-ok" />
    : <XCircle size={16} className="health-status-err" />;

  if (loading) return <div className="admin-loading">Chargement des métriques...</div>;
  if (!health) return <div className="admin-empty">Impossible de récupérer les métriques.</div>;

  const { process: proc, database, stats } = health;

  return (
    <div className="admin-tab">
      <div className="admin-tab-header">
        <h3>Santé du serveur</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastRefresh && (
            <span className="health-last-refresh">
              Mis à jour {lastRefresh.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <button className="admin-refresh-btn" onClick={loadHealth}>
            <RefreshCw size={14} /> Actualiser
          </button>
        </div>
      </div>

      {/* Status overview */}
      <div className="health-status-banner" data-ok={health.ok}>
        {health.ok ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
        <span>{health.ok ? 'Tous les systèmes opérationnels' : 'Problèmes détectés'}</span>
        <span className="health-status-ts">{new Date(health.timestamp).toLocaleString('fr-FR')}</span>
      </div>

      {/* Metric cards */}
      <div className="health-cards">
        <div className="health-card">
          <div className="health-card-label">Uptime</div>
          <div className="health-card-value">{proc?.uptimeHuman || '—'}</div>
          <div className="health-card-sub">{Math.round(proc?.uptimeSeconds / 3600 * 10) / 10}h au total</div>
        </div>
        <div className="health-card">
          <div className="health-card-label">Base de données</div>
          <div className="health-card-value health-db-status">
            {statusIcon(database?.isHealthy)}
            {database?.isHealthy ? 'Opérationnelle' : 'Erreur'}
          </div>
          <div className="health-card-sub">Erreurs : {database?.metrics?.errors || 0}</div>
        </div>
        <div className="health-card">
          <div className="health-card-label">Mémoire Heap</div>
          <div className="health-card-value">{proc?.heapUsedMB} MB</div>
          <div className="health-card-sub">/ {proc?.heapTotalMB} MB alloués</div>
        </div>
        <div className="health-card">
          <div className="health-card-label">RAM (RSS)</div>
          <div className="health-card-value">{proc?.rssMB} MB</div>
          <div className="health-card-sub">Processus Node.js</div>
        </div>
        <div className="health-card">
          <div className="health-card-label">Signalements en attente</div>
          <div className={`health-card-value ${stats?.pendingReports > 0 ? 'health-warn' : ''}`}>
            {stats?.pendingReports || 0}
          </div>
          <div className="health-card-sub">À examiner</div>
        </div>
        {database?.metrics && (
          <div className="health-card">
            <div className="health-card-label">Requêtes DB</div>
            <div className="health-card-value">{database.metrics.totalQueries || 0}</div>
            <div className="health-card-sub">Lentes : {database.metrics.slowQueries || 0}</div>
          </div>
        )}
      </div>

      {/* Error logs section */}
      <div className="health-logs-section">
        <button
          className="health-logs-toggle"
          onClick={() => setShowLogs(v => !v)}
        >
          <Server size={15} />
          {showLogs ? 'Masquer les logs' : 'Afficher les logs d\'erreur'}
          {logsLoading && ' (chargement...)'}
        </button>

        {showLogs && (
          <div className="health-logs-list">
            {logsLoading ? (
              <div className="admin-loading">Chargement...</div>
            ) : !logs || logs.length === 0 ? (
              <div className="admin-empty">Aucune erreur récente. ✓</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className={`health-log-entry ${expandedAlert === log.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedAlert(expandedAlert === log.id ? null : log.id)}
                >
                  <div className="health-log-header">
                    <span className="health-log-time">
                      {new Date(log.timestamp).toLocaleTimeString('fr-FR')}
                    </span>
                    <span className="health-log-context">{log.context}</span>
                    <span className="health-log-msg">{log.message}</span>
                    {log.statusCode && (
                      <span className={`health-log-code ${log.statusCode >= 500 ? 'err' : 'warn'}`}>
                        {log.statusCode}
                      </span>
                    )}
                  </div>
                  {expandedAlert === log.id && log.stack && (
                    <pre className="health-log-stack">{log.stack}</pre>
                  )}
                </div>
              ))
            )}
            {logs && logs.length > 0 && (
              <button className="health-logs-reload" onClick={loadLogs}>
                <RefreshCw size={13} /> Recharger
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Reports Tab
const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harcèlement',
  inappropriate: 'Inapproprié',
  impersonation: 'Usurpation',
  other: 'Autre',
};

function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await reportsApi.list({ status: statusFilter, page, limit: 20 });
      setReports(data.reports || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  const handleStatus = async (id, status) => {
    try {
      await reportsApi.updateStatus(id, status);
      setReports(prev => prev.filter(r => r.id !== id));
      setTotal(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="admin-tab">
      <div className="admin-tab-header">
        <h3>Signalements</h3>
        <span className="admin-badge">{total}</span>
      </div>
      <div className="reports-filter-bar">
        {['pending', 'reviewed', 'dismissed', 'all'].map(s => (
          <button
            key={s}
            className={`reports-filter-btn ${statusFilter === s ? 'active' : ''}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {s === 'pending' ? 'En attente' : s === 'reviewed' ? 'Examinés' : s === 'dismissed' ? 'Rejetés' : 'Tous'}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="admin-loading">Chargement...</div>
      ) : reports.length === 0 ? (
        <div className="admin-empty">Aucun signalement{statusFilter !== 'all' ? ` (${statusFilter})` : ''}.</div>
      ) : (
        <div className="reports-list">
          {reports.map(r => (
            <div key={r.id} className="report-card">
              <div className="report-card-meta">
                <span className="report-reason-badge">{REASON_LABELS[r.reason] || r.reason}</span>
                <span className="report-card-time">{new Date(r.created_at).toLocaleString('fr-FR')}</span>
              </div>
              <div className="report-card-users">
                <span>Signalé par <strong>{r.reporter_username}</strong></span>
                <span> à </span>
                <span><strong>{r.reported_username}</strong></span>
                {r.message_id && <span className="report-card-msgid"> (msg #{r.message_id})</span>}
              </div>
              {r.details && <p className="report-card-details">{r.details}</p>}
              {r.status === 'pending' && (
                <div className="report-card-actions">
                  <button className="report-action-btn reviewed" onClick={() => handleStatus(r.id, 'reviewed')}>
                    Marquer examiné
                  </button>
                  <button className="report-action-btn dismissed" onClick={() => handleStatus(r.id, 'dismissed')}>
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {total > 20 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
          <span>Page {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>Suivant</button>
        </div>
      )}
    </div>
  );
}

// Main Admin Panel
export default function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const refreshStats = useCallback(async () => {
    setRefreshing(true);
    try {
      const [raw, online] = await Promise.all([admin.getStats(), admin.getOnlineUsers()]);
      if (raw) {
        const n = (v) => Number(v) || 0;
        setStats({
          totalUsers: n(raw.users?.total),
          totalTeams: n(raw.content?.teams),
          totalMessages: n(raw.content?.channelMessages) + n(raw.content?.directMessages),
          totalChannels: n(raw.content?.channels),
          bannedUsers: n(raw.users?.banned),
          messagesToday: n(raw.content?.messagesToday),
          newUsersWeek: n(raw.users?.newThisWeek),
          admins: n(raw.users?.admins),
        });
      }
      setOnlineCount(online?.length || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/channels/@me');
      return;
    }

    refreshStats();

    const interval = setInterval(refreshStats, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, [user, navigate, refreshStats]);

  if (!user || user.role !== 'admin') {
    return null;
  }

  const tabs = [
    { id: 'stats', label: 'Statistiques', icon: BarChart3 },
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'teams', label: 'Serveurs', icon: Home },
    { id: 'nitro-waitlist', label: 'Nitro', icon: Zap },
    { id: 'quests', label: 'Quests', icon: Target },
    { id: 'broadcast', label: 'Annonce', icon: Megaphone },
    { id: 'reports', label: 'Signalements', icon: Flag },
    { id: 'health', label: 'Santé', icon: Activity },
  ];

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <h1>Administration</h1>
        <button onClick={() => navigate('/channels/@me')} className="back-btn">
          <ChevronLeft size={18} /> Retour
        </button>
      </header>

      <nav className="admin-nav">
        {tabs.map(tab => {
          const NavIcon = tab.icon;
          return (
            <button
              key={tab.id}
              className={`admin-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="nav-icon"><NavIcon size={20} /></span>
              <span className="nav-label">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="admin-content">
        {activeTab === 'stats' && stats && (
          <div className="stats-section">
            <div className="stats-refresh-row">
              <button
                type="button"
                className="admin-refresh-btn"
                onClick={refreshStats}
                disabled={refreshing}
                title="Actualiser les statistiques"
              >
                <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
                {refreshing ? 'Actualisation...' : 'Actualiser'}
              </button>
            </div>
            <div className="stats-grid">
            <StatCard label="Utilisateurs" value={stats.totalUsers ?? 0} icon={Users} />
            <StatCard label="En ligne" value={onlineCount} icon={CircleDot} />
            <StatCard label="Serveurs" value={stats.totalTeams ?? 0} icon={Home} />
            <StatCard label="Messages" value={stats.totalMessages ?? 0} icon={MessageCircle} />
            <StatCard label="Canaux" value={stats.totalChannels ?? 0} icon={Hash} />
            <StatCard label="Bannis" value={stats.bannedUsers ?? 0} icon={Hammer} />
            <StatCard label="Messages aujourd'hui" value={stats.messagesToday ?? 0} icon={MessageCircle} />
            <StatCard label="Nouveaux (7j)" value={stats.newUsersWeek ?? 0} icon={Users} />
            </div>
          </div>
        )}

        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'teams' && <TeamsTab />}
        {activeTab === 'nitro-waitlist' && <NitroWaitlistTab />}
        {activeTab === 'quests' && <QuestsTab />}
        {activeTab === 'broadcast' && <BroadcastTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'health' && <HealthTab />}
      </main>
    </div>
  );
}
