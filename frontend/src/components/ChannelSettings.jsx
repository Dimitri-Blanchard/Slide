import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { AvatarImg } from './Avatar';
import AppIcon from './icons/AppIcon';
import { webhooks as webhooksApi, channelOverrides, servers, teams, BACKEND_ORIGIN } from '../api';
import { getStaticUrl } from '../utils/staticUrl';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useNativeBackHandler } from '../hooks/useNativeBackHandler';
import ConfirmModal from './ConfirmModal';
import './ChannelSettings.css';
import '../pages/Settings.css';

const CHANNEL_TYPE_META = {
  text: { label: 'Text', icon: 'channelText', desc: 'Send messages, images, and files' },
  voice: { label: 'Voice', icon: 'channelVoice', desc: 'Hang out with voice, video, and screen share' },
  announcement: { label: 'Announcement', icon: 'channelAnnouncement', desc: 'Important updates for your community' },
  forum: { label: 'Forum', icon: 'channelForum', desc: 'Organized discussions with threads' },
  stage: { label: 'Stage', icon: 'check', desc: 'Live audio events for large audiences' },
};

const SLOWMODE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5 seconds' },
  { value: 10, label: '10 seconds' },
  { value: 15, label: '15 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 21600, label: '6 hours' },
];

const ChannelIcon = ({ type, size = 18 }) => {
  const meta = CHANNEL_TYPE_META[type] || CHANNEL_TYPE_META.text;
  return <AppIcon name={meta.icon} size={size} />;
};

const channelSyncKey = (channel) => {
  if (!channel) return '';
  return [
    channel.id,
    channel.name,
    channel.category_id,
    channel.topic,
    channel.description,
    channel.is_private,
    channel.slowmode_seconds,
    channel.nsfw,
    channel.updated_at,
  ].join('|');
};

// ═══════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════
const OverviewTab = ({ channel, categories, onSave, onDirtyChange, isMobileFullscreen = false, tx }) => {
  const [name, setName] = useState(channel?.name || '');
  const [categoryId, setCategoryId] = useState(channel?.category_id ? String(channel.category_id) : '');
  const [topic, setTopic] = useState(channel?.topic || '');
  const [description, setDescription] = useState(channel?.description || '');
  const [isPrivate, setIsPrivate] = useState(channel?.is_private || false);
  const [slowmode, setSlowmode] = useState(channel?.slowmode_seconds || 0);
  const [nsfw, setNsfw] = useState(channel?.nsfw || false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const { notify } = useNotification();
  const type = channel?.channel_type || 'text';
  const typeMeta = CHANNEL_TYPE_META[type] || CHANNEL_TYPE_META.text;
  const syncKey = channelSyncKey(channel);
  const supportsTopic = type === 'text' || type === 'announcement';
  const supportsSlowmode = type === 'text' || type === 'announcement';
  const supportsNsfw = type === 'text' || type === 'announcement' || type === 'forum';
  const displayPrefix = type === 'voice' ? '' : '#';

  useEffect(() => {
    if (!channel) return;
    setName(channel.name || '');
    setCategoryId(channel.category_id ? String(channel.category_id) : '');
    setTopic(channel.topic || '');
    setDescription(channel.description || '');
    setIsPrivate(channel.is_private || false);
    setSlowmode(channel.slowmode_seconds || 0);
    setNsfw(channel.nsfw || false);
  }, [syncKey]);

  const hasChanges =
    name !== (channel?.name || '') ||
    categoryId !== (channel?.category_id ? String(channel.category_id) : '') ||
    topic !== (channel?.topic || '') ||
    description !== (channel?.description || '') ||
    isPrivate !== (channel?.is_private || false) ||
    slowmode !== (channel?.slowmode_seconds || 0) ||
    nsfw !== (channel?.nsfw || false);

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        channel_type: type,
        channelType: type,
        category_id: categoryId || null,
        categoryId: categoryId || null,
        topic: supportsTopic ? topic : undefined,
        description: description.trim() || null,
        is_private: isPrivate,
        isPrivate,
        slowmode_seconds: supportsSlowmode ? Number(slowmode) : undefined,
        slowmodeSeconds: supportsSlowmode ? Number(slowmode) : undefined,
        nsfw: supportsNsfw ? nsfw : undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  const copyChannelId = () => {
    navigator.clipboard?.writeText(String(channel.id))
      .then(() => {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
        notify.success(tx('channelSettings.idCopied', 'Channel ID copied'));
      })
      .catch(() => notify.error(tx('channelSettings.copyFailed', 'Failed to copy')));
  };

  const createdLabel = channel?.created_at
    ? new Date(channel.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const saveBar = (hasChanges || saved) ? (
    <div className={`chs-save-bar chs-save-bar--floating${hasChanges ? ' chs-save-bar--visible' : ''}${isMobileFullscreen ? ' chs-save-bar--mobile' : ''}`}>
      <span className="chs-save-note">
        {hasChanges ? tx('channelSettings.unsavedNote', 'You have unsaved changes') : saved ? tx('channelSettings.savedNote', 'Changes saved!') : ''}
      </span>
      <button
        type="button"
        className="chs-btn-save"
        onClick={handleSave}
        disabled={!hasChanges || saving}
      >
        {saving ? tx('channelSettings.saving', 'Saving...') : saved ? tx('channelSettings.saved', 'Saved!') : tx('channelSettings.saveChanges', 'Save Changes')}
      </button>
    </div>
  ) : null;

  const privateToggle = (
    <div className="chs-toggle-row">
      <div className="chs-toggle-info">
        <AppIcon name="lock" size={18} />
        <div>
          <div className="chs-toggle-label">{tx('channelSettings.privateChannel', 'Private Channel')}</div>
          <div className="chs-toggle-desc">{tx('channelSettings.privateDesc', 'Only selected members and roles can view this channel')}</div>
        </div>
      </div>
      <button className={`chs-toggle ${isPrivate ? 'on' : ''}`} onClick={() => setIsPrivate((v) => !v)} type="button" aria-pressed={isPrivate}>
        <div className="chs-toggle-knob" />
      </button>
    </div>
  );

  const nsfwToggle = supportsNsfw ? (
    <div className="chs-toggle-row">
      <div className="chs-toggle-info">
        <span className="chs-age-badge">18+</span>
        <div>
          <div className="chs-toggle-label">{tx('channelSettings.ageRestricted', 'Age-Restricted Channel')}</div>
          <div className="chs-toggle-desc">{tx('channelSettings.ageRestrictedDesc', 'Users must confirm they are 18+ to view this channel')}</div>
        </div>
      </div>
      <button className={`chs-toggle ${nsfw ? 'on' : ''}`} onClick={() => setNsfw((v) => !v)} type="button" aria-pressed={nsfw}>
        <div className="chs-toggle-knob" />
      </button>
    </div>
  ) : null;

  const slowmodeField = supportsSlowmode ? (
    <div className="chs-field">
      <label>{tx('channelSettings.slowmode', 'Slowmode')}</label>
      <p className="chs-field-desc">{tx('channelSettings.slowmodeDesc', 'Limit how often members can send messages in this channel.')}</p>
      <select value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))}>
        {SLOWMODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ) : null;

  const metadataSection = (
    <section className="chs-section">
      <h3 className="chs-section-title">{tx('channelSettings.about', 'About')}</h3>
      <div className="chs-section-body chs-section-body--meta">
        <div className="chs-meta-row">
          <span className="chs-meta-label">{tx('channelSettings.channelType', 'Channel type')}</span>
          <span className="chs-type-badge">
            <ChannelIcon type={type} size={14} />
            {typeMeta.label}
          </span>
        </div>
        <div className="chs-meta-row">
          <span className="chs-meta-label">{tx('channelSettings.channelId', 'Channel ID')}</span>
          <div className="chs-meta-value-row">
            <code className="chs-meta-code">{channel.id}</code>
            <button type="button" className="chs-copy-id-btn" onClick={copyChannelId}>
              {copiedId ? tx('channelSettings.copied', 'Copied') : tx('channelSettings.copy', 'Copy')}
            </button>
          </div>
        </div>
        {createdLabel && (
          <div className="chs-meta-row">
            <span className="chs-meta-label">{tx('channelSettings.created', 'Created')}</span>
            <span className="chs-meta-value">{createdLabel}</span>
          </div>
        )}
      </div>
    </section>
  );

  if (isMobileFullscreen) {
    return (
      <div className="chs-tab-content chs-tab-content--mobile">
        <div className="chs-mobile-hero">
          <div className="chs-mobile-hero-icon">
            <ChannelIcon type={type} size={26} />
          </div>
          <div className="chs-mobile-hero-info">
            <span className="chs-mobile-hero-name">{displayPrefix}{channel?.name}</span>
            <span className="chs-mobile-hero-type">{typeMeta.label} {tx('channelSettings.channel', 'channel')}</span>
          </div>
        </div>

        <section className="settings-mobile-group chs-mobile-section">
          <h2 className="settings-mobile-group-label">{tx('channelSettings.details', 'Details')}</h2>
          <div className="settings-mobile-group-card chs-mobile-fields-card">
            <div className="chs-mobile-field">
              <label className="chs-mobile-field-label">{tx('channelSettings.channelName', 'Channel name')}</label>
              <div className="chs-name-input-wrap chs-name-input-wrap--mobile">
                <span className="chs-name-prefix"><ChannelIcon type={type} /></span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="channel-name"
                  maxLength={100}
                />
              </div>
            </div>
            {categories?.length > 0 && (
              <div className="chs-mobile-field">
                <label className="chs-mobile-field-label">{tx('channelSettings.category', 'Category')}</label>
                <select className="chs-mobile-input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{tx('channelSettings.noCategory', 'No category')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}
            {supportsTopic && (
              <div className="chs-mobile-field">
                <label className="chs-mobile-field-label">{tx('channelSettings.topic', 'Topic')} <span className="chs-optional">{tx('channelSettings.optional', 'Optional')}</span></label>
                <input
                  type="text"
                  className="chs-mobile-input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={tx('channelSettings.topicPlaceholder', 'What is this channel about?')}
                  maxLength={1024}
                />
                <p className="chs-hint">{topic.length}/1024</p>
              </div>
            )}
            <div className="chs-mobile-field">
              <label className="chs-mobile-field-label">{tx('channelSettings.description', 'Description')} <span className="chs-optional">{tx('channelSettings.optional', 'Optional')}</span></label>
              <textarea
                className="chs-mobile-input chs-mobile-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tx('channelSettings.descriptionPlaceholder', 'Shown in the channel header')}
                maxLength={500}
                rows={3}
              />
              <p className="chs-hint">{description.length}/500</p>
            </div>
          </div>
        </section>

        <section className="settings-mobile-group chs-mobile-section">
          <h2 className="settings-mobile-group-label">{tx('channelSettings.privacy', 'Privacy & Safety')}</h2>
          <div className="settings-mobile-group-card chs-mobile-toggles-card">
            {privateToggle}
            {nsfwToggle}
          </div>
        </section>

        {supportsSlowmode && (
          <section className="settings-mobile-group chs-mobile-section">
            <h2 className="settings-mobile-group-label">{tx('channelSettings.messaging', 'Messaging')}</h2>
            <div className="settings-mobile-group-card chs-mobile-fields-card">
              <div className="chs-mobile-field chs-mobile-field--plain">
                <p className="chs-mobile-field-help">{tx('channelSettings.slowmodeDesc', 'Limit how often members can send messages in this channel.')}</p>
                <select className="chs-mobile-input" value={slowmode} onChange={(e) => setSlowmode(Number(e.target.value))}>
                  {SLOWMODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>
        )}

        {type === 'voice' && (
          <section className="settings-mobile-group chs-mobile-section">
            <h2 className="settings-mobile-group-label">{tx('channelSettings.voice', 'Voice')}</h2>
            <div className="settings-mobile-group-card chs-info-card">
              <p>{tx('channelSettings.voiceInfo', 'Members can join this channel to talk, share video, and screen share. Use permissions to control who can connect and speak.')}</p>
            </div>
          </section>
        )}

        <section className="settings-mobile-group chs-mobile-section">
          <h2 className="settings-mobile-group-label">{tx('channelSettings.about', 'About')}</h2>
          <div className="settings-mobile-group-card chs-mobile-fields-card">
            <div className="chs-mobile-field chs-mobile-field--plain">
              <div className="chs-meta-row">
                <span className="chs-meta-label">{tx('channelSettings.channelId', 'Channel ID')}</span>
                <button type="button" className="chs-copy-id-btn" onClick={copyChannelId}>
                  {copiedId ? tx('channelSettings.copied', 'Copied') : String(channel.id)}
                </button>
              </div>
            </div>
          </div>
        </section>

        {saveBar}
      </div>
    );
  }

  return (
    <div className="chs-tab-content">
      <div className="chs-overview-hero">
        <div className="chs-overview-hero-icon">
          <ChannelIcon type={type} size={32} />
        </div>
        <div className="chs-overview-hero-text">
          <h2 className="chs-tab-title">{displayPrefix}{channel?.name}</h2>
          <p className="chs-tab-desc">{typeMeta.desc}</p>
          <span className="chs-type-badge chs-type-badge--lg">
            <ChannelIcon type={type} size={14} />
            {typeMeta.label}
          </span>
        </div>
      </div>

      <section className="chs-section">
        <h3 className="chs-section-title">{tx('channelSettings.details', 'Details')}</h3>
        <div className="chs-section-body">
          <div className="chs-field">
            <label>{tx('channelSettings.channelName', 'Channel Name')}</label>
            <div className="chs-name-input-wrap">
              <span className="chs-name-prefix"><ChannelIcon type={type} /></span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="channel-name"
                maxLength={100}
              />
            </div>
          </div>

          {categories?.length > 0 && (
            <div className="chs-field">
              <label>{tx('channelSettings.category', 'Category')}</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{tx('channelSettings.noCategory', 'No Category')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>{cat.name}</option>
                ))}
              </select>
            </div>
          )}

          {supportsTopic && (
            <div className="chs-field">
              <label>{tx('channelSettings.topic', 'Topic')} <span className="chs-optional">{tx('channelSettings.optional', 'Optional')}</span></label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={tx('channelSettings.topicPlaceholderLong', 'Let everyone know what this channel is about')}
                maxLength={1024}
              />
              <p className="chs-hint">{topic.length}/1024</p>
            </div>
          )}

          <div className="chs-field">
            <label>{tx('channelSettings.description', 'Description')} <span className="chs-optional">{tx('channelSettings.optional', 'Optional')}</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tx('channelSettings.descriptionPlaceholder', 'Shown in the channel header')}
              rows={3}
              maxLength={500}
            />
            <span className="chs-field-counter">{description.length}/500</span>
          </div>
        </div>
      </section>

      <section className="chs-section">
        <h3 className="chs-section-title">{tx('channelSettings.privacy', 'Privacy & Safety')}</h3>
        <div className="chs-section-body chs-section-body--toggles">
          {privateToggle}
          {nsfwToggle}
        </div>
      </section>

      {supportsSlowmode && (
        <section className="chs-section">
          <h3 className="chs-section-title">{tx('channelSettings.messaging', 'Messaging')}</h3>
          <div className="chs-section-body">
            {slowmodeField}
          </div>
        </section>
      )}

      {type === 'voice' && (
        <section className="chs-section">
          <h3 className="chs-section-title">{tx('channelSettings.voice', 'Voice')}</h3>
          <div className="chs-section-body chs-info-card">
            <AppIcon name="channelVoice" size={20} />
            <p>{tx('channelSettings.voiceInfo', 'Members can join this channel to talk, share video, and screen share. Use permissions to control who can connect and speak.')}</p>
          </div>
        </section>
      )}

      {metadataSection}
      {saveBar}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// WEBHOOKS TAB
// ═══════════════════════════════════════════════════════════

const WebhooksTab = ({ channel, teamId, isMobileFullscreen = false }) => {
  const [webhookList, setWebhookList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAvatarFile, setNewAvatarFile] = useState(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(null);
  const { notify } = useNotification();

  useEffect(() => {
    webhooksApi.list(teamId, channel.id)
      .then(data => setWebhookList(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId, channel.id]);

  const getWebhookUrl = (wh) => {
    return `${BACKEND_ORIGIN}/api/webhooks/execute/${wh.token}`;
  };

  const copyUrl = (wh) => {
    navigator.clipboard?.writeText(getWebhookUrl(wh))
      .then(() => { setCopiedId(wh.id); setTimeout(() => setCopiedId(null), 2000); })
      .catch(() => {});
  };

  const handleNewAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewAvatarFile(file);
    setNewAvatarPreview(URL.createObjectURL(file));
  };

  const handleEditAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditAvatarFile(file);
    setEditAvatarPreview(URL.createObjectURL(file));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const wh = await webhooksApi.create(teamId, { name: newName.trim(), channelId: channel.id, avatarUrl: null });
      let finalWh = wh;
      if (newAvatarFile) {
        try {
          const { avatar_url } = await webhooksApi.uploadAvatar(teamId, wh.id, newAvatarFile);
          finalWh = { ...wh, avatar_url };
        } catch {
          // non-fatal — webhook created, avatar just didn't upload
        }
      }
      setWebhookList(prev => [finalWh, ...prev]);
      setNewName('');
      setNewAvatarFile(null);
      setNewAvatarPreview(null);
      setShowForm(false);
      notify.success('Webhook created');
    } catch (err) {
      notify.error(err.message || 'Failed to create webhook');
    }
    setCreating(false);
  };

  const startEdit = (wh) => {
    setEditingId(wh.id);
    setEditName(wh.name || '');
    setEditAvatarFile(null);
    setEditAvatarPreview(wh.avatar_url ? getStaticUrl(wh.avatar_url) : null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditAvatarFile(null);
    setEditAvatarPreview(null);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    try {
      const updated = await webhooksApi.update(teamId, editingId, { name: editName.trim() });
      let finalUpdated = updated;
      if (editAvatarFile) {
        const { avatar_url } = await webhooksApi.uploadAvatar(teamId, editingId, editAvatarFile);
        finalUpdated = { ...updated, avatar_url };
      }
      setWebhookList(prev => prev.map(w => w.id === editingId ? { ...w, ...finalUpdated } : w));
      cancelEdit();
      notify.success('Webhook updated');
    } catch (err) {
      notify.error(err.message || 'Failed to update webhook');
    }
  };

  const handleDelete = async (wh) => {
    setConfirmDelete(wh);
  };

  const confirmDeleteWebhook = async () => {
    const wh = confirmDelete;
    if (!wh) return;
    setConfirmDelete(null);
    try {
      await webhooksApi.delete(teamId, wh.id);
      setWebhookList(prev => prev.filter(w => w.id !== wh.id));
      notify.success('Webhook deleted');
    } catch (err) {
      notify.error(err.message || 'Failed to delete');
    }
  };

  const handleRegenerate = async (wh) => {
    setConfirmRegenerate(wh);
  };

  const confirmRegenerateWebhook = async () => {
    const wh = confirmRegenerate;
    if (!wh) return;
    setConfirmRegenerate(null);
    try {
      const { token } = await webhooksApi.regenerateToken(teamId, wh.id);
      setWebhookList(prev => prev.map(w => w.id === wh.id ? { ...w, token } : w));
      notify.success('Token regenerated — copy the new URL');
    } catch (err) {
      notify.error(err.message || 'Failed to regenerate');
    }
  };

  return (
    <div className={`chs-tab-content${isMobileFullscreen ? ' chs-tab-content--mobile' : ''}`}>
      <div className="chs-wh-header">
        <div>
          <h2 className="chs-tab-title">Integrations</h2>
          <p className="chs-tab-desc">
            Webhooks let external services post to <strong>#{channel.name}</strong> via API endpoints.
          </p>
        </div>
        {!showForm && (
          <button className="chs-wh-new-btn" onClick={() => setShowForm(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New Webhook
          </button>
        )}
      </div>

      {showForm && (
        <form className="chs-wh-form" onSubmit={handleCreate}>
          <h3 className="chs-wh-form-title">Create Webhook</h3>
          <div className="chs-wh-form-fields">
            <div className="chs-field">
              <label>Name <span className="chs-field-req">*</span></label>
              <input
                type="text"
                value={newName}
                maxLength={80}
                placeholder="e.g. GitHub Notifications"
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="chs-field">
              <label>Avatar <span className="chs-field-hint">optional · PNG, JPG or WebP · max 4 MB</span></label>
              <div className="chs-wh-avatar-upload">
                {newAvatarPreview && (
                  <img className="chs-wh-avatar-preview" src={newAvatarPreview} alt="" />
                )}
                <label className="chs-wh-avatar-file-btn">
                  {newAvatarPreview ? 'Change image' : 'Choose file'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleNewAvatarChange}
                    style={{ display: 'none' }}
                  />
                </label>
                {newAvatarPreview && (
                  <button type="button" className="chs-wh-avatar-remove" onClick={() => { setNewAvatarFile(null); setNewAvatarPreview(null); }}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="chs-form-actions">
            <button type="button" className="chs-btn-ghost" onClick={() => { setShowForm(false); setNewName(''); setNewAvatarFile(null); setNewAvatarPreview(null); }}>
              Cancel
            </button>
            <button type="submit" className="chs-btn-save" disabled={creating || !newName.trim()}>
              {creating ? 'Creating...' : 'Create Webhook'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="chs-wh-loading">
          <div className="chs-wh-spinner" />
          Loading webhooks...
        </div>
      ) : webhookList.length === 0 ? (
        <div className="chs-wh-empty">
          <div className="chs-wh-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <p>No webhooks yet</p>
          <span>Connect external services like GitHub, Zapier or your own app</span>
          {!showForm && (
            <button className="chs-btn-save" onClick={() => setShowForm(true)}>Create your first webhook</button>
          )}
        </div>
      ) : (
        <div className="chs-wh-list">
          {webhookList.map(wh => (
            <div key={wh.id} className="chs-wh-card">
              {editingId === wh.id ? (
                <form className="chs-wh-edit-form" onSubmit={handleUpdate}>
                  <div className="chs-wh-edit-fields">
                    <div className="chs-field">
                      <label>Name</label>
                      <input
                        type="text"
                        value={editName}
                        maxLength={80}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="chs-field">
                      <label>Avatar <span className="chs-field-hint">PNG, JPG or WebP · max 4 MB</span></label>
                      <div className="chs-wh-avatar-upload">
                        {editAvatarPreview && (
                          <img className="chs-wh-avatar-preview" src={editAvatarPreview} alt="" />
                        )}
                        <label className="chs-wh-avatar-file-btn">
                          {editAvatarPreview ? 'Change image' : 'Choose file'}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleEditAvatarChange}
                            style={{ display: 'none' }}
                          />
                        </label>
                        {editAvatarPreview && (
                          <button type="button" className="chs-wh-avatar-remove" onClick={() => { setEditAvatarFile(null); setEditAvatarPreview(null); }}>
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="chs-form-actions">
                    <button type="button" className="chs-btn-ghost" onClick={cancelEdit}>Cancel</button>
                    <button type="submit" className="chs-btn-save">Save Changes</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="chs-wh-card-top">
                    <div className="chs-wh-avatar">
                      {wh.avatar_url
                        ? <AvatarImg src={wh.avatar_url} alt="" />
                        : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
                        )
                      }
                    </div>
                    <div className="chs-wh-card-info">
                      <span className="chs-wh-name">{wh.name}</span>
                      <span className="chs-wh-meta">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{opacity:0.5}}><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                        {wh.creator_name}
                        <span className="chs-wh-dot" />
                        {new Date(wh.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="chs-wh-card-actions">
                      <button className="chs-icon-btn" onClick={() => startEdit(wh)} title="Edit" type="button">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                      </button>
                      <button className="chs-icon-btn" onClick={() => handleRegenerate(wh)} title="Regenerate token" type="button">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                      </button>
                      <button className="chs-icon-btn danger" onClick={() => handleDelete(wh)} title="Delete" type="button">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="chs-wh-url-row">
                    <span className="chs-wh-url-label">Webhook URL</span>
                    <div className="chs-wh-url-box">
                      <input
                        type="text"
                        className="chs-wh-url-input"
                        value={getWebhookUrl(wh)}
                        readOnly
                        onFocus={e => e.target.select()}
                      />
                      <button
                        className={`chs-wh-copy-btn ${copiedId === wh.id ? 'copied' : ''}`}
                        onClick={() => copyUrl(wh)}
                        title="Copy webhook URL"
                        type="button"
                      >
                        {copiedId === wh.id ? (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        ) : (
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        )}
                        {copiedId === wh.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Webhook"
        message={`Delete webhook "${confirmDelete?.name}"? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmDeleteWebhook}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        isOpen={!!confirmRegenerate}
        title="Regenerate Token"
        message="Regenerate this webhook token? The old URL will stop working immediately."
        confirmText="Regenerate"
        cancelText="Cancel"
        type="danger"
        onConfirm={confirmRegenerateWebhook}
        onCancel={() => setConfirmRegenerate(null)}
      />
    </div>
  );
};
// ═══════════════════════════════════════════════════════════
const PERM_SECTIONS = [
  {
    title: 'General',
    key: 'general',
    perms: [
      { key: 'view_channel', label: 'View Channel', desc: 'Allow or deny seeing this channel in the channel list' },
    ],
  },
  {
    title: 'Text Channel',
    key: 'text',
    textOnly: true,
    perms: [
      { key: 'send_messages',       label: 'Send Messages',           desc: 'Allow or deny posting messages' },
      { key: 'attach_files',        label: 'Attach Files',            desc: 'Allow or deny attaching images and files' },
      { key: 'embed_links',         label: 'Embed Links',             desc: 'Allow or deny auto-embedding URLs as previews' },
      { key: 'add_reactions',       label: 'Add Reactions',           desc: 'Allow or deny adding emoji reactions to messages' },
      { key: 'read_message_history',label: 'Read Message History',    desc: 'Allow or deny reading messages sent before joining' },
      { key: 'mention_everyone',    label: 'Mention @everyone / @here', desc: 'Allow or deny pinging all members at once' },
      { key: 'manage_messages',     label: 'Manage Messages',         desc: 'Allow or deny deleting and pinning others\' messages' },
    ],
  },
  {
    title: 'Voice Channel',
    key: 'voice',
    voiceOnly: true,
    perms: [
      { key: 'connect',         label: 'Connect',         desc: 'Allow or deny joining this voice channel' },
      { key: 'speak',           label: 'Speak',           desc: 'Allow or deny speaking in this voice channel' },
      { key: 'mute_members',    label: 'Mute Members',    desc: 'Allow or deny server-muting other members' },
      { key: 'deafen_members',  label: 'Deafen Members',  desc: 'Allow or deny server-deafening other members' },
    ],
  },
];

// Flat list of all permission keys (used by overrideToMap/mapToOverride)
const ALL_PERMS = PERM_SECTIONS.flatMap(s => s.perms);

function PermRow({ value, onChange }) {
  return (
    <div className="chs-perm-row">
      <div className="chs-perm-btns">
        <button
          type="button"
          className={`chs-perm-btn deny ${value === 'deny' ? 'active' : ''}`}
          onClick={() => onChange(value === 'deny' ? null : 'deny')}
          title="Deny"
        >
          {/* X icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <button
          type="button"
          className={`chs-perm-btn neutral ${value == null ? 'active' : ''}`}
          onClick={() => onChange(null)}
          title="Inherit (neutral)"
        >
          {/* Slash / inherit icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button
          type="button"
          className={`chs-perm-btn allow ${value === 'allow' ? 'active' : ''}`}
          onClick={() => onChange(value === 'allow' ? null : 'allow')}
          title="Allow"
        >
          {/* Check icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

// Convert allow/deny arrays from the DB into a flat {perm: 'allow'|'deny'|null} map
function overrideToMap(override) {
  const parsePerms = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return []; }
    }
    return [];
  };
  const allow = parsePerms(override?.allow_permissions);
  const deny  = parsePerms(override?.deny_permissions);
  const map = {};
  ALL_PERMS.forEach(p => {
    if (allow.includes(p.key)) map[p.key] = 'allow';
    else if (deny.includes(p.key)) map[p.key] = 'deny';
    else map[p.key] = null;
  });
  return map;
}

// Convert {perm: 'allow'|'deny'|null} map back into allow/deny arrays
function mapToOverride(map) {
  const allow = [], deny = [];
  Object.entries(map).forEach(([k, v]) => {
    if (v === 'allow') allow.push(k);
    else if (v === 'deny') deny.push(k);
  });
  return { allow, deny };
}

const PermissionsTab = ({ channel, teamId, isMobileFullscreen = false, tx }) => {
  const channelType = channel?.channel_type || 'text';
  const isVoice = channelType === 'voice';
  const visibleSections = PERM_SECTIONS.filter(s =>
    (!s.textOnly || !isVoice) && (!s.voiceOnly || isVoice)
  );
  const [overrides, setOverrides] = useState([]);
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(null); // `${target_type}:${target_id}`
  const [permMap, setPermMap] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addType, setAddType] = useState(null); // 'role' | 'user' | null
  const [search, setSearch] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { notify } = useNotification();
  const keyOf = useCallback((ov) => `${ov.target_type}:${ov.target_id}`, []);

  const load = useCallback(async () => {
    try {
      const [ovs, rls, mbs] = await Promise.all([
        channelOverrides.list(channel.id),
        servers.getRoles(teamId),
        teams.members(teamId),
      ]);
      setOverrides(ovs || []);
      setRoles(rls || []);
      setMembers(mbs || []);
    } catch (err) {
      notify.error('Failed to load permissions');
    }
    setLoading(false);
  }, [channel.id, teamId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // When user selects a different override in the list
  const selectOverride = (ov) => {
    setSelectedKey(keyOf(ov));
    setPermMap(overrideToMap(ov));
    setDirty(false);
    setAddType(null);
  };

  const handlePermChange = (key, value) => {
    setPermMap(prev => {
      const next = { ...prev, [key]: value };
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    const ov = overrides.find(o => keyOf(o) === selectedKey);
    if (!ov) {
      notify.error('Select a role or member override first');
      return;
    }
    const { allow, deny } = mapToOverride(permMap);
    setSaving(true);
    try {
      const updated = await channelOverrides.upsert(channel.id, {
        targetType: ov.target_type,
        targetId: ov.target_id,
        allow,
        deny,
      });
      setOverrides(prev => prev.map(o => (keyOf(o) === selectedKey ? updated : o)));
      setSelectedKey(keyOf(updated));
      setDirty(false);
      notify.success('Permissions saved');
    } catch (err) {
      notify.error(err.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    const ov = overrides.find(o => keyOf(o) === selectedKey);
    if (!ov) return;
    setConfirmRemove(true);
  };

  const confirmRemoveOverride = async () => {
    const ov = overrides.find(o => keyOf(o) === selectedKey);
    if (!ov) return;
    setConfirmRemove(false);
    try {
      await channelOverrides.remove(channel.id, ov.target_type, ov.target_id);
      setOverrides(prev => prev.filter(o => keyOf(o) !== selectedKey));
      setSelectedKey(null);
      setPermMap({});
      setDirty(false);
      notify.success('Override removed');
    } catch (err) {
      notify.error(err.message || 'Failed to remove');
    }
  };

  const handleAdd = async (targetType, targetId) => {
    try {
      const added = await channelOverrides.upsert(channel.id, {
        targetType, targetId, allow: [], deny: [],
      });
      // Might return existing override updated, refresh list
      const refreshed = await channelOverrides.list(channel.id);
      setOverrides(refreshed);
      const match = refreshed.find(o => o.target_type === targetType && o.target_id === targetId);
      if (match) selectOverride(match);
      setAddType(null);
      setSearch('');
    } catch (err) {
      notify.error(err.message || 'Failed to add');
    }
  };

  // Items that could be added (not already having an override)
  const existingKeys = new Set(overrides.map(o => `${o.target_type}:${o.target_id}`));
  const addableRoles = roles.filter(r => !existingKeys.has(`role:${r.id}`));
  const addableMembers = members.filter(m => !existingKeys.has(`user:${m.id}`));

  const filteredAddable = addType === 'role'
    ? addableRoles.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()))
    : addableMembers.filter(m => (m.display_name || m.username || '').toLowerCase().includes(search.toLowerCase()));

  const selectedOv = overrides.find(o => keyOf(o) === selectedKey);

  if (loading) return <div className="chs-tab-content"><div className="chs-empty">Loading permissions...</div></div>;

  return (
    <div className={`chs-tab-content${isMobileFullscreen ? ' chs-tab-content--mobile chs-tab-content--mobile-perms' : ''}`}>
      <h2 className="chs-tab-title">{tx('channelSettings.permissions', 'Permissions')}</h2>
      <p className="chs-tab-desc chs-mobile-intro">
        {tx('channelSettings.permissionsIntro', 'Control who can view or interact in')} <strong>#{channel.name}</strong>.
        {tx('channelSettings.permissionsAdminNote', ' Owners and admins always have full access.')}
      </p>

      <div className="chs-perm-legend">
        <span className="chs-perm-legend-item deny">
          <span className="chs-perm-legend-dot" />
          {tx('channelSettings.permDeny', 'Deny')}
        </span>
        <span className="chs-perm-legend-item neutral">
          <span className="chs-perm-legend-dot" />
          {tx('channelSettings.permInherit', 'Inherit')}
        </span>
        <span className="chs-perm-legend-item allow">
          <span className="chs-perm-legend-dot" />
          {tx('channelSettings.permAllow', 'Allow')}
        </span>
      </div>

      <div className="chs-perms-layout">
        {/* Left: override list */}
        <div className="chs-perms-sidebar">
          <div className="chs-perms-sidebar-header">
            <span>Roles &amp; Members</span>
            <div className="chs-perms-add-btns">
              <button
                type="button"
                className={`chs-perm-add-btn ${addType === 'role' ? 'active' : ''}`}
                onClick={() => { setAddType(t => t === 'role' ? null : 'role'); setSearch(''); }}
                title="Add role override"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                Role
              </button>
              <button
                type="button"
                className={`chs-perm-add-btn ${addType === 'user' ? 'active' : ''}`}
                onClick={() => { setAddType(t => t === 'user' ? null : 'user'); setSearch(''); }}
                title="Add member override"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                Member
              </button>
            </div>
          </div>

          {addType && (
            <div className="chs-perms-add-panel">
              <input
                type="text"
                className="chs-perms-search"
                placeholder={`Search ${addType === 'role' ? 'roles' : 'members'}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              <div className="chs-perms-add-list">
                {filteredAddable.length === 0 ? (
                  <div className="chs-perms-add-empty">
                    {search ? 'No results' : 'All already added'}
                  </div>
                ) : filteredAddable.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="chs-perms-add-item"
                    onClick={() => handleAdd(addType, item.id)}
                  >
                    {addType === 'role' ? (
                      <span className="chs-role-dot" style={{ background: item.color || 'var(--text-muted)' }} />
                    ) : (
                      item.avatar_url
                        ? <AvatarImg src={item.avatar_url} className="chs-member-avatar" alt="" />
                        : <span className="chs-member-avatar-fallback">{(item.display_name || item.username || '?')[0].toUpperCase()}</span>
                    )}
                    <span>{addType === 'role' ? item.name : (item.display_name || item.username)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {overrides.length === 0 && !addType ? (
            <div className="chs-perms-empty">No overrides yet. Add a role or member above.</div>
          ) : overrides.map(ov => (
            <button
              key={keyOf(ov)}
              type="button"
              className={`chs-perms-item ${selectedKey === keyOf(ov) ? 'active' : ''}`}
              onClick={() => selectOverride(ov)}
            >
              {ov.target_type === 'role' ? (
                <span className="chs-role-dot" style={{ background: ov.target_meta || 'var(--text-muted)' }} />
              ) : (
                ov.target_meta
                  ? <AvatarImg src={ov.target_meta} className="chs-member-avatar" alt="" />
                  : <span className="chs-member-avatar-fallback">{(ov.target_name || '?')[0].toUpperCase()}</span>
              )}
              <span className="chs-perms-item-name">{ov.target_name || `${ov.target_type} #${ov.target_id}`}</span>
              <span className="chs-perms-item-type">{ov.target_type}</span>
            </button>
          ))}
        </div>

        {/* Right: permission editor */}
        <div className="chs-perms-editor">
          {!selectedOv ? (
            <div className="chs-perms-editor-empty">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor" opacity="0.3"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
              <p>Select a role or member to edit permissions</p>
            </div>
          ) : (
            <>
              <div className="chs-perms-editor-header">
                <div className="chs-perms-editor-title">
                  {selectedOv.target_type === 'role' ? (
                    <span className="chs-role-dot lg" style={{ background: selectedOv.target_meta || 'var(--text-muted)' }} />
                  ) : (
                    selectedOv.target_meta
                      ? <AvatarImg src={selectedOv.target_meta} className="chs-member-avatar lg" alt="" />
                      : <span className="chs-member-avatar-fallback lg">{(selectedOv.target_name || '?')[0].toUpperCase()}</span>
                  )}
                  <strong>{selectedOv.target_name}</strong>
                  <span className="chs-badge">{selectedOv.target_type}</span>
                </div>
              </div>

              {visibleSections.map(section => (
                <div key={section.key} className="chs-perms-section">
                  <div className="chs-perms-section-title">{section.title}</div>
                  {section.perms.map(p => (
                    <div key={p.key} className="chs-perm-item">
                      <div>
                        <div className="chs-perm-name">{p.label}</div>
                        <div className="chs-perm-desc">{p.desc}</div>
                      </div>
                      <PermRow
                        value={permMap[p.key] ?? null}
                        onChange={(v) => handlePermChange(p.key, v)}
                      />
                    </div>
                  ))}
                </div>
              ))}

              <div className="chs-perms-actions">
                <span className="chs-perms-save-note">{dirty ? 'Unsaved permission changes' : 'All changes saved'}</span>
                <button
                  type="button"
                  className="chs-btn-danger"
                  onClick={handleDelete}
                >
                  Remove Override
                </button>
                <button
                  type="button"
                  className="chs-btn-save"
                  onClick={handleSave}
                  disabled={saving || !dirty}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmRemove}
        title={tx('channelSettings.removeOverride', 'Remove Override')}
        message={tx('channelSettings.removeOverrideConfirm', `Remove permission override for "${selectedOv?.target_name}"?`)}
        confirmText={tx('channelSettings.remove', 'Remove')}
        cancelText={tx('common.cancel', 'Cancel')}
        type="danger"
        onConfirm={confirmRemoveOverride}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// DELETE CHANNEL TAB
// ═══════════════════════════════════════════════════════════
const DeleteChannelTab = ({ channel, onDelete, onClose, tx }) => {
  const [confirmName, setConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { notify } = useNotification();
  const type = channel?.channel_type || 'text';
  const displayName = type === 'voice' ? channel?.name : `#${channel?.name || ''}`;
  const nameMatches = confirmName.trim() === (channel?.name || '');

  const handleDelete = async () => {
    if (!nameMatches || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(channel.id);
      onClose?.();
    } catch (err) {
      notify.error(err?.message || 'Failed to delete channel');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="chs-tab-content">
      <h2 className="chs-tab-title chs-tab-title--danger">{tx('channelSettings.deleteChannel', 'Delete Channel')}</h2>
      <p className="chs-tab-desc">
        {tx('channelSettings.deleteWarning', 'This action is')} <strong>{tx('channelSettings.irreversible', 'irreversible')}</strong>.
        {tx('channelSettings.deleteDesc', ' All messages in this channel will be permanently deleted.')}
      </p>
      <div className="chs-danger-zone">
        <div className="chs-field">
          <label>
            {tx('channelSettings.typeToConfirm', 'Type')} <strong>{displayName}</strong> {tx('channelSettings.toConfirm', 'to confirm:')}
          </label>
          <input
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={channel?.name}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          className="chs-btn-danger chs-btn-danger--solid"
          disabled={!nameMatches || deleting}
          onClick={handleDelete}
        >
          {deleting ? tx('channelSettings.deleting', 'Deleting...') : tx('channelSettings.deleteChannel', 'Delete Channel')}
        </button>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN CHANNEL SETTINGS COMPONENT
// ═══════════════════════════════════════════════════════════
export default function ChannelSettings({
  channel,
  teamId,
  categories,
  isOpen,
  onClose,
  onSave,
  onDelete,
  presentation = 'overlay',
}) {
  const isFullscreen = presentation === 'fullscreen';
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [mobileView, setMobileView] = useState('hub');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const { t } = useLanguage();

  const tx = useCallback((key, fallback) => {
    const value = t(key);
    return value === key ? fallback : value;
  }, [t]);

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && activeTab === 'overview') {
      setShowUnsavedConfirm(true);
      return;
    }
    onClose();
  }, [hasUnsavedChanges, activeTab, onClose]);

  useEffect(() => {
    if (!isOpen || isFullscreen) return;
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isFullscreen, handleClose]);

  useEffect(() => {
    if (!isOpen || !isFullscreen) return undefined;
    document.body.classList.add('settings-open');
    return () => document.body.classList.remove('settings-open');
  }, [isOpen, isFullscreen]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('overview');
      setHasUnsavedChanges(false);
    }
  }, [isOpen, channel?.id]);

  useEffect(() => {
    if (activeTab !== 'overview') {
      setHasUnsavedChanges(false);
    }
  }, [activeTab]);

  const type = channel?.channel_type || 'text';
  const channelDisplayName = type === 'voice' ? channel?.name : `#${channel?.name || ''}`;

  const tabIcons = useMemo(() => ({
    overview: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.57 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>,
    permissions: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>,
    webhooks: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
    delete: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>,
  }), []);

  const tabs = useMemo(() => [
    {
      id: 'overview',
      label: tx('channelSettings.overview', 'Overview'),
      desc: tx('channelSettings.overviewDesc', 'Name, topic, category, and slowmode'),
      icon: tabIcons.overview,
    },
    {
      id: 'permissions',
      label: tx('channelSettings.permissions', 'Permissions'),
      desc: tx('channelSettings.permissionsDesc', 'Who can view, post, or connect'),
      icon: tabIcons.permissions,
    },
    ...(type === 'text' || type === 'announcement' ? [{
      id: 'webhooks',
      label: tx('channelSettings.integrations', 'Integrations'),
      desc: tx('channelSettings.integrationsDesc', 'Webhooks & API endpoints for external apps'),
      icon: tabIcons.webhooks,
    }] : []),
    ...(onDelete ? [{
      id: 'delete',
      label: tx('channelSettings.deleteChannel', 'Delete Channel'),
      desc: tx('channelSettings.deleteChannelDesc', 'Permanently remove this channel'),
      icon: tabIcons.delete,
      danger: true,
    }] : []),
  ], [type, tabIcons, tx, onDelete]);

  const isMobileHub = isFullscreen && mobileView === 'hub';
  const isMobileSection = isFullscreen && mobileView === 'section';
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label
    || tx('channelSettings.title', 'Channel Settings');

  useEffect(() => {
    if (!isFullscreen || !isOpen) return;
    const section = searchParams.get('section');
    if (section && tabs.some((tab) => tab.id === section)) {
      setActiveTab(section);
      setMobileView('section');
      return;
    }
    setMobileView('hub');
  }, [isFullscreen, isOpen, searchParams, tabs]);

  const navigateToTab = useCallback((tabId) => {
    setActiveTab(tabId);
    if (!isFullscreen) return;
    setMobileView('section');
    const next = new URLSearchParams(searchParams);
    next.set('section', tabId);
    setSearchParams(next, { replace: true });
  }, [isFullscreen, searchParams, setSearchParams]);

  const backToMobileHub = useCallback(() => {
    if (hasUnsavedChanges && activeTab === 'overview') {
      setShowUnsavedConfirm(true);
      return;
    }
    setMobileView('hub');
    const next = new URLSearchParams(searchParams);
    next.delete('section');
    setSearchParams(next, { replace: true });
  }, [hasUnsavedChanges, activeTab, searchParams, setSearchParams]);

  useNativeBackHandler(isFullscreen && isOpen, () => {
    if (isFullscreen && mobileView === 'section') {
      backToMobileHub();
      return true;
    }
    handleClose();
    return true;
  }, 120);

  if (!isOpen || !channel) return null;

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <OverviewTab
            channel={channel}
            categories={categories}
            onSave={onSave}
            onDirtyChange={setHasUnsavedChanges}
            isMobileFullscreen={isMobileSection}
            tx={tx}
          />
        );
      case 'permissions':
        return <PermissionsTab channel={channel} teamId={teamId} isMobileFullscreen={isMobileSection} tx={tx} />;
      case 'webhooks':
        return <WebhooksTab channel={channel} teamId={teamId} isMobileFullscreen={isMobileSection} />;
      case 'delete':
        return <DeleteChannelTab channel={channel} onDelete={onDelete} onClose={onClose} tx={tx} />;
      default: return null;
    }
  };

  const unsavedConfirmModal = (
    <ConfirmModal
      isOpen={showUnsavedConfirm}
      title={tx('channelSettings.unsavedChangesTitle', 'Unsaved Changes')}
      message={tx('channelSettings.unsavedChangesMessage', 'You have unsaved changes. Are you sure you want to leave? Your changes will be lost.')}
      confirmText={tx('channelSettings.discardChanges', 'Discard')}
      cancelText={tx('channelSettings.keepEditing', 'Keep Editing')}
      type="danger"
      onConfirm={() => {
        setShowUnsavedConfirm(false);
        setHasUnsavedChanges(false);
        if (isMobileSection) {
          setMobileView('hub');
          const next = new URLSearchParams(searchParams);
          next.delete('section');
          setSearchParams(next, { replace: true });
          return;
        }
        onClose();
      }}
      onCancel={() => setShowUnsavedConfirm(false)}
    />
  );

  if (isFullscreen) {
    const mobileShell = (
      <div
        className={[
          'settings-page',
          'settings-page--fullscreen',
          'chs-page--fullscreen',
          isMobileHub ? 'settings-page--mobile-hub' : '',
          isMobileSection ? 'settings-page--mobile-section' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="settings-modal-container">
          {isMobileHub ? (
            <>
              <header className="settings-mobile-header">
                <button
                  type="button"
                  className="settings-mobile-header-btn"
                  onClick={handleClose}
                  aria-label={tx('common.close', 'Close')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
                <h1 className="settings-mobile-header-title">{tx('channelSettings.title', 'Channel Settings')}</h1>
                <span className="settings-mobile-header-spacer" aria-hidden />
              </header>

              <div className="settings-mobile-hub-body">
                <button
                  type="button"
                  className="settings-mobile-profile-card"
                  onClick={() => navigateToTab('overview')}
                >
                  <div className="settings-mobile-profile-avatar chs-mobile-channel-avatar">
                    <ChannelIcon type={type} size={26} />
                  </div>
                  <div className="settings-mobile-profile-info">
                    <span className="settings-mobile-profile-name">{channelDisplayName}</span>
                    <span className="settings-mobile-profile-tag">{(CHANNEL_TYPE_META[type] || CHANNEL_TYPE_META.text).label}</span>
                  </div>
                  <svg className="settings-mobile-row-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                  </svg>
                </button>

                {tabs.filter((tab) => tab.id !== 'overview').length > 0 && (
                  <section className="settings-mobile-group">
                    <h2 className="settings-mobile-group-label">{tx('channelSettings.options', 'Options')}</h2>
                    <div className="settings-mobile-group-card">
                      {tabs.filter((tab) => tab.id !== 'overview').map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`settings-mobile-row${tab.danger ? ' settings-mobile-row--danger' : ''}`}
                          onClick={() => navigateToTab(tab.id)}
                        >
                          <span className={`settings-mobile-row-icon${tab.danger ? ' settings-mobile-row-icon--danger' : ''}`}>
                            {tab.icon}
                          </span>
                          <span className="settings-mobile-row-text">
                            <span className="settings-mobile-row-label">{tab.label}</span>
                            {tab.desc && <span className="settings-mobile-row-desc">{tab.desc}</span>}
                          </span>
                          <svg className="settings-mobile-row-chevron" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </>
          ) : (
            <>
              <header className="settings-mobile-header">
                <button
                  type="button"
                  className="settings-mobile-header-btn"
                  onClick={backToMobileHub}
                  aria-label={tx('common.back', 'Back')}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>
                <h1 className="settings-mobile-header-title">{activeTabLabel}</h1>
                <span className="settings-mobile-header-spacer" aria-hidden />
              </header>
              <main className="settings-content chs-content--mobile">
                <div className="settings-content-wrapper chs-content-wrapper--mobile">
                  {renderTab()}
                </div>
              </main>
            </>
          )}
        </div>
        {unsavedConfirmModal}
      </div>
    );

    return createPortal(mobileShell, document.body);
  }

  return (
    <div className="chs-overlay">
      <div className="chs-layout">
        {/* Left nav */}
        <div className="chs-nav">
          <div className="chs-nav-scroll">
            <div className="chs-nav-group">
              <h3 className="chs-nav-group-title">
                <ChannelIcon type={type} size={14} />
                <span className="chs-nav-channel-name">{channel.name}</span>
              </h3>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`chs-nav-item ${activeTab === tab.id ? 'active' : ''}${tab.danger ? ' danger' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  title={tab.desc}
                >
                  <span className="chs-nav-icon">{tab.icon}</span>
                  <span className="chs-nav-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="chs-content">
          {renderTab()}
        </div>

        {/* Close button */}
        <div className="chs-close-area">
          <button className="chs-close-btn" onClick={handleClose} title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
          <span className="chs-close-hint">ESC</span>
        </div>
      </div>

      {unsavedConfirmModal}
    </div>
  );
}
