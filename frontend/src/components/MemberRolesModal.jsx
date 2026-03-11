import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { servers } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import Avatar from './Avatar';
import './MemberRolesModal.css';

export default function MemberRolesModal({ isOpen, onClose, team, member }) {
  const [roles, setRoles] = useState([]);
  const [memberRoles, setMemberRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();
  const { notify } = useNotification();

  const loadData = useCallback(async () => {
    if (!team || !member) return;
    
    setLoading(true);
    try {
      const [allRoles, userRoles] = await Promise.all([
        servers.getRoles(team.id),
        servers.getMemberRoles(team.id, member.user_id || member.id),
      ]);
      setRoles(allRoles || []);
      setMemberRoles(userRoles?.map(r => r.id) || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [team, member]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const toggleRole = async (roleId) => {
    const hasRole = memberRoles.includes(roleId);
    setSaving(true);
    
    try {
      if (hasRole) {
        await servers.removeMemberRole(team.id, member.user_id || member.id, roleId);
        setMemberRoles(memberRoles.filter(id => id !== roleId));
      } else {
        await servers.addMemberRole(team.id, member.user_id || member.id, roleId);
        setMemberRoles([...memberRoles, roleId]);
      }
    } catch (err) {
      console.error(err);
      notify.error(err.message || 'Erreur lors de la modification du rôle');
    }
    setSaving(false);
  };

  if (!isOpen || !member) return null;

  const modal = (
    <div className="member-roles-overlay" onClick={onClose}>
      <div className="member-roles-modal" onClick={(e) => e.stopPropagation()}>
        <div className="member-roles-header">
          <Avatar user={member} size="medium" />
          <div className="member-info">
            <h3>{member.display_name}</h3>
            {member.username && <span className="member-username">@{member.username}</span>}
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <h4>Rôles</h4>
        
        {loading ? (
          <div className="roles-loading">Chargement...</div>
        ) : (
          <div className="roles-checklist">
            {roles.filter(r => !r.is_default).map(role => (
              <label key={role.id} className="role-checkbox">
                <input
                  type="checkbox"
                  checked={memberRoles.includes(role.id)}
                  onChange={() => toggleRole(role.id)}
                  disabled={saving}
                />
                <span 
                  className="role-badge"
                  style={{ 
                    backgroundColor: role.color ? `${role.color}20` : 'var(--bg-modifier)',
                    borderColor: role.color || 'var(--border-color)'
                  }}
                >
                  <span className="role-dot" style={{ backgroundColor: role.color }} />
                  {role.name}
                </span>
              </label>
            ))}
            
            {roles.filter(r => !r.is_default).length === 0 && (
              <p className="no-roles">Aucun rôle disponible</p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// Inline role badge component for display
export function RoleBadge({ role }) {
  return (
    <span 
      className="role-badge-inline"
      style={{ 
        backgroundColor: role.color ? `${role.color}20` : 'var(--bg-modifier)',
        color: role.color || 'var(--text-secondary)'
      }}
    >
      <span className="role-dot-small" style={{ backgroundColor: role.color }} />
      {role.name}
    </span>
  );
}
