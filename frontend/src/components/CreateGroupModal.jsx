import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { direct as directApi, users as usersApi } from '../api';
import Avatar from './Avatar';
import './CreateGroupModal.css';

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated, currentUser }) {
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
      setSelected([]);
      setGroupName('');
      setCreating(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

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

  if (!isOpen) return null;

  const modal = (
    <div className="cg-overlay" onClick={onClose}>
      <div className="cg-modal" onClick={e => e.stopPropagation()}>
        <div className="cg-header">
          <h2>Create Group</h2>
          <p className="cg-subtitle">Select friends to add to your group</p>
          <button className="cg-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
            </svg>
          </button>
        </div>

        {step === 1 && (
          <>
            <div className="cg-search-area">
              <div className="cg-selected-tags">
                {selected.map(u => (
                  <span key={u.id} className="cg-tag">
                    {u.display_name}
                    <button onClick={() => removeSelected(u.id)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
                      </svg>
                    </button>
                  </span>
                ))}
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder={selected.length === 0 ? "Search for friends..." : "Add more..."}
                  className="cg-search-input"
                />
              </div>
            </div>

            <div className="cg-results">
              {searching && <div className="cg-loading">Searching...</div>}
              {results.map(user => (
                <button
                  key={user.id}
                  className={`cg-user-item ${selected.some(u => u.id === user.id) ? 'selected' : ''}`}
                  onClick={() => toggleUser(user)}
                >
                  <Avatar user={user} size="small" showPresence />
                  <div className="cg-user-info">
                    <span className="cg-user-name">{user.display_name}</span>
                    {user.username && <span className="cg-user-tag">@{user.username}</span>}
                  </div>
                  <div className={`cg-checkbox ${selected.some(u => u.id === user.id) ? 'checked' : ''}`}>
                    {selected.some(u => u.id === user.id) && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))}
              {search.length >= 2 && !searching && results.length === 0 && (
                <div className="cg-no-results">No users found</div>
              )}
            </div>

            <div className="cg-footer">
              <span className="cg-count">{selected.length}/9 members selected</span>
              <button
                className="cg-next-btn"
                disabled={selected.length < 2}
                onClick={() => setStep(2)}
              >
                Next
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

              <label className="cg-label">Group Name (optional)</label>
              <input
                type="text"
                value={groupName}
                onChange={e => setGroupName(e.target.value)}
                placeholder={selected.map(u => u.display_name).join(', ')}
                className="cg-name-input"
                maxLength={100}
                autoFocus
              />

              <div className="cg-members-preview">
                <span className="cg-label">Members ({selected.length + 1})</span>
                <div className="cg-members-list">
                  <div className="cg-member-row">
                    <Avatar user={currentUser} size="tiny" />
                    <span>{currentUser?.display_name} (you)</span>
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
              <button className="cg-back-btn" onClick={() => setStep(1)}>Back</button>
              <button
                className="cg-create-btn"
                disabled={creating}
                onClick={handleCreate}
              >
                {creating ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
