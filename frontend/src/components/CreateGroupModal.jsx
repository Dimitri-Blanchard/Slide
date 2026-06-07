import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { direct as directApi, users as usersApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import Avatar from './Avatar';
import AppIcon from './icons/AppIcon';
import { useModalEnterAnimation } from '../hooks/useModalEnterAnimation';
import './CreateGroupModal.css';

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated, currentUser, initialSelected = [] }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const searchTimeout = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSearch('');
      setResults([]);
      setSelected(Array.isArray(initialSelected) ? initialSelected.filter(Boolean) : []);
      setGroupName('');
      setCreating(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialSelected]);

  const handleSearch = useCallback((q) => {
    setSearch(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.length < 2) { setResults([]); return; }
    searchTimeout.current = setTimeout(() => {
      setSearching(true);
      usersApi.search(q)
        .then(users => {
          setResults(users.filter(u => u.id !== currentUser?.id && !selected.some(s => s.id === u.id)));
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, [currentUser?.id, selected]);

  const toggleUser = useCallback((user) => {
    setSelected(prev => {
      if (prev.some(u => u.id === user.id)) {
        return prev.filter(u => u.id !== user.id);
      }
      if (prev.length >= 9) return prev;
      return [...prev, user];
    });
    setSearch('');
    setResults([]);
    inputRef.current?.focus();
  }, []);

  const removeSelected = useCallback((userId) => {
    setSelected(prev => prev.filter(u => u.id !== userId));
  }, []);

  const handleCreate = useCallback(async () => {
    if (selected.length < 2) return;
    setCreating(true);
    try {
      const userIds = selected.map(u => u.id);
      const name = groupName.trim() || undefined;
      const conv = await directApi.createGroup(userIds, name);
      onGroupCreated?.(conv);
      onClose();
    } catch (err) {
      console.error('Error creating group:', err);
    } finally {
      setCreating(false);
    }
  }, [selected, groupName, onGroupCreated, onClose]);

  const enterInstant = useModalEnterAnimation('create-group-modal', isOpen);

  if (!isOpen) return null;

  const defaultGroupName = selected.map(u => u.display_name).join(', ');

  const modal = (
    <div className={`cg-overlay${enterInstant ? ' modal-enter-instant' : ''}`} onClick={onClose}>
      <div className="cg-modal" onClick={e => e.stopPropagation()}>
        <button className="cg-close" onClick={onClose} aria-label={t('common.close')}>
          <AppIcon name="close" size={20} />
        </button>

        <div className="cg-header">
          <h2>{t('groupModal.title')}</h2>
          <p className="cg-subtitle">
            {step === 1 ? t('groupModal.subtitle') : t('groupModal.nameSubtitle')}
          </p>
        </div>

        {step === 1 && (
          <>
            <div className="cg-search-area">
              <div className="cg-selected-tags">
                {selected.map(u => (
                  <span key={u.id} className="cg-tag">
                    <span className="cg-tag-name">{u.display_name}</span>
                    <button type="button" onClick={() => removeSelected(u.id)} aria-label={t('common.close')}>
                      <AppIcon name="close" size={12} weight="bold" />
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder={selected.length === 0 ? t('groupModal.searchPlaceholder') : t('groupModal.searchPlaceholderMore')}
                  className="cg-search-input"
                />
              </div>
            </div>

            <div className="cg-results">
              {searching && (
                <div className="cg-loading">
                  <span className="cg-spinner" />
                  {t('groupModal.searching')}
                </div>
              )}
              {!searching && results.map(user => {
                const isSelected = selected.some(u => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    className={`cg-user-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleUser(user)}
                  >
                    <Avatar user={user} size="small" showPresence />
                    <div className="cg-user-info">
                      <span className="cg-user-name">{user.display_name}</span>
                      {user.username && <span className="cg-user-tag">@{user.username}</span>}
                    </div>
                    <div className={`cg-checkbox ${isSelected ? 'checked' : ''}`}>
                      {isSelected && <AppIcon name="check" size={12} weight="bold" />}
                    </div>
                  </button>
                );
              })}
              {search.length >= 2 && !searching && results.length === 0 && (
                <div className="cg-no-results">{t('groupModal.noResults')}</div>
              )}
            </div>

            <div className="cg-footer">
              <span className="cg-count">
                {t('groupModal.membersSelected', { count: selected.length })}
              </span>
              <button
                type="button"
                className="cg-primary-btn"
                disabled={selected.length < 2}
                onClick={() => setStep(2)}
              >
                {t('groupModal.next')}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="cg-name-step">
              <div className="cg-group-preview">
                <div className="cg-group-avatar-stack">
                  {selected.slice(0, 3).map((u, i) => (
                    <div key={u.id} className="cg-stack-avatar" style={{ zIndex: 3 - i }}>
                      <Avatar user={u} size="small" />
                    </div>
                  ))}
                  {selected.length > 3 && (
                    <div className="cg-stack-more">+{selected.length - 3}</div>
                  )}
                </div>
              </div>

              <label className="cg-label" htmlFor="cg-group-name">
                {t('groupModal.groupName')}
                <span className="cg-label-optional">{t('groupModal.groupNameOptional')}</span>
              </label>
              <input
                id="cg-group-name"
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder={defaultGroupName}
                className="cg-name-input"
                maxLength={100}
                autoFocus
              />

              <div className="cg-members-preview">
                <span className="cg-label">{t('groupModal.members', { count: selected.length + 1 })}</span>
                <div className="cg-members-list">
                  <div className="cg-member-row">
                    <Avatar user={currentUser} size="tiny" />
                    <span>{currentUser?.display_name} <em>({t('groupModal.you')})</em></span>
                  </div>
                  {selected.map(u => (
                    <div key={u.id} className="cg-member-row">
                      <Avatar user={u} size="tiny" />
                      <span>{u.display_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="cg-footer">
              <button type="button" className="cg-back-btn" onClick={() => setStep(1)}>
                {t('groupModal.back')}
              </button>
              <button
                type="button"
                className="cg-primary-btn"
                disabled={creating}
                onClick={handleCreate}
              >
                {creating ? t('groupModal.creating') : t('groupModal.create')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
