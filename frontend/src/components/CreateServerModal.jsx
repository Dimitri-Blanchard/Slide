import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { teams as teamsApi, servers, channels as channelsApi } from '../api';
import { useLanguage } from '../context/LanguageContext';
import './CreateServerModal.css';

const TEMPLATES = {
  default: {
    categories: [
      { name: 'INFORMATION', channels: [
        { name: 'welcome', type: 'text' },
        { name: 'rules', type: 'text' },
        { name: 'announcements', type: 'announcement' },
      ]},
      { name: 'GENERAL', channels: [
        { name: 'general', type: 'text' },
        { name: 'off-topic', type: 'text' },
        { name: 'media', type: 'text' },
      ]},
      { name: 'VOICE', channels: [
        { name: 'General', type: 'voice' },
        { name: 'Music', type: 'voice' },
      ]},
    ],
    roles: [
      { name: 'Admin', color: '#e74c3c', perm_administrator: true },
      { name: 'Moderator', color: '#f39c12', perm_manage_messages: true, perm_kick_members: true, perm_ban_members: true },
      { name: 'Member', color: '#2ecc71' },
    ],
  },
  gaming: {
    categories: [
      { name: 'INFO', channels: [
        { name: 'rules', type: 'text' },
        { name: 'announcements', type: 'announcement' },
        { name: 'roles', type: 'text' },
      ]},
      { name: 'CHAT', channels: [
        { name: 'general', type: 'text' },
        { name: 'looking-for-group', type: 'text' },
        { name: 'clips-and-highlights', type: 'text' },
        { name: 'memes', type: 'text' },
      ]},
      { name: 'GAME CHANNELS', channels: [
        { name: 'valorant', type: 'text' },
        { name: 'league-of-legends', type: 'text' },
        { name: 'minecraft', type: 'text' },
        { name: 'fortnite', type: 'text' },
      ]},
      { name: 'VOICE', channels: [
        { name: 'Lobby', type: 'voice' },
        { name: 'Gaming 1', type: 'voice' },
        { name: 'Gaming 2', type: 'voice' },
        { name: 'AFK', type: 'voice' },
      ]},
    ],
    roles: [
      { name: 'Admin', color: '#e74c3c', perm_administrator: true },
      { name: 'Moderator', color: '#e67e22', perm_manage_messages: true, perm_kick_members: true },
      { name: 'VIP', color: '#f1c40f', show_separately: true },
      { name: 'Gamer', color: '#9b59b6' },
    ],
  },
  community: {
    categories: [
      { name: 'WELCOME', channels: [
        { name: 'welcome', type: 'text' },
        { name: 'rules', type: 'text' },
        { name: 'introductions', type: 'text' },
        { name: 'announcements', type: 'announcement' },
      ]},
      { name: 'COMMUNITY', channels: [
        { name: 'general', type: 'text' },
        { name: 'events', type: 'text' },
        { name: 'suggestions', type: 'forum' },
        { name: 'polls', type: 'text' },
      ]},
      { name: 'CREATIVE', channels: [
        { name: 'art', type: 'text' },
        { name: 'music', type: 'text' },
        { name: 'showcase', type: 'text' },
      ]},
      { name: 'VOICE', channels: [
        { name: 'Lounge', type: 'voice' },
        { name: 'Events', type: 'voice' },
        { name: 'Music', type: 'voice' },
        { name: 'Stage', type: 'voice' },
      ]},
    ],
    roles: [
      { name: 'Admin', color: '#e74c3c', perm_administrator: true },
      { name: 'Moderator', color: '#3498db', perm_manage_messages: true, perm_kick_members: true, perm_ban_members: true },
      { name: 'Contributor', color: '#2ecc71', show_separately: true },
      { name: 'Member', color: '#95a5a6' },
    ],
  },
  study: {
    categories: [
      { name: 'INFO', channels: [
        { name: 'welcome', type: 'text' },
        { name: 'resources', type: 'text' },
        { name: 'announcements', type: 'announcement' },
      ]},
      { name: 'STUDY', channels: [
        { name: 'general', type: 'text' },
        { name: 'homework-help', type: 'text' },
        { name: 'study-tips', type: 'text' },
        { name: 'questions', type: 'forum' },
      ]},
      { name: 'SUBJECTS', channels: [
        { name: 'math', type: 'text' },
        { name: 'science', type: 'text' },
        { name: 'programming', type: 'text' },
        { name: 'languages', type: 'text' },
      ]},
      { name: 'VOICE', channels: [
        { name: 'Study Room 1', type: 'voice' },
        { name: 'Study Room 2', type: 'voice' },
        { name: 'Discussion', type: 'voice' },
      ]},
    ],
    roles: [
      { name: 'Teacher', color: '#e74c3c', perm_administrator: true },
      { name: 'Tutor', color: '#3498db', perm_manage_messages: true },
      { name: 'Student', color: '#2ecc71' },
    ],
  },
};

const TEMPLATE_LIST = [
  { id: 'empty', name: 'Create my own', desc: 'Start with an empty server and add your own channels', icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
  )},
  { id: 'gaming', name: 'Gaming', desc: 'Optimized for gaming communities with game channels and voice lobbies', icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4 2c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2-3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>
  )},
  { id: 'community', name: 'Community', desc: 'Great for large communities with forums, events, and creative spaces', icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
  )},
  { id: 'study', name: 'Study Group', desc: 'Perfect for study groups with subject channels and study rooms', icon: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z"/></svg>
  )},
];

export default function CreateServerModal({ isOpen, onClose, onServerCreated, initialTemplate, onBackToHub, exiting }) {
  const [step, setStep] = useState(initialTemplate ? 2 : 1);
  const [serverName, setServerName] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState(initialTemplate || 'empty');
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const navigate = useNavigate();
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen) {
      setStep(initialTemplate ? 2 : 1);
      setTemplate(initialTemplate || 'empty');
    }
  }, [isOpen, initialTemplate]);

  const handleClose = () => {
    if (creating) return;
    setStep(1);
    setServerName('');
    setDescription('');
    setTemplate('empty');
    setProgress('');
    setProgressPercent(0);
    onClose();
  };

  const handleCreate = async () => {
    if (!serverName.trim()) return;

    setCreating(true);
    setProgress('Creating server...');
    setProgressPercent(10);

    try {
      const team = await teamsApi.create(serverName.trim(), description);
      setProgressPercent(25);

      const setup = TEMPLATES[template];
      if (setup) {
        const totalItems = (setup.categories?.length || 0) +
          setup.categories?.reduce((sum, cat) => sum + cat.channels.length, 0) +
          (setup.roles?.length || 0);
        let completedItems = 0;

        const updateProgress = (msg) => {
          completedItems++;
          setProgress(msg);
          setProgressPercent(25 + (completedItems / totalItems) * 65);
        };

        if (setup.categories) {
          for (const cat of setup.categories) {
            const category = await servers.createCategory(team.id, cat.name);
            updateProgress(`Creating category: ${cat.name}...`);

            for (let i = 0; i < cat.channels.length; i++) {
              const ch = cat.channels[i];
              await channelsApi.create(team.id, {
                name: ch.name,
                channel_type: ch.type,
                channelType: ch.type,
                category_id: category.id,
                categoryId: category.id,
                position: i,
              });
              updateProgress(`Creating channel: #${ch.name}...`);
            }
          }
        }

        if (setup.roles) {
          for (const role of setup.roles) {
            await servers.createRole(team.id, role);
            updateProgress(`Creating role: ${role.name}...`);
          }
        }
      }

      setProgress('Done!');
      setProgressPercent(100);

      setTimeout(() => {
        onServerCreated?.(team);
        handleClose();
        navigate(`/team/${team.id}`);
      }, 400);

    } catch (err) {
      console.error(err);
      setProgress(`Error: ${err.message}`);
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div className={`csm-overlay ${exiting ? 'csm-exiting' : ''}`} onClick={exiting ? undefined : handleClose}>
      <div className={`csm-modal ${exiting ? 'csm-exiting' : ''}`} onClick={(e) => e.stopPropagation()}>
        {step === 1 && (
          <>
            <div className="csm-header">
              <h2>Create a Server</h2>
              <p>Your server is where you and your friends hang out. Create yours and start talking.</p>
            </div>

            <div className="csm-templates">
              {TEMPLATE_LIST.map(tmpl => (
                <button
                  key={tmpl.id}
                  className={`csm-template ${template === tmpl.id ? 'selected' : ''}`}
                  onClick={() => setTemplate(tmpl.id)}
                >
                  <span className="csm-template-icon">{tmpl.icon}</span>
                  <div className="csm-template-info">
                    <span className="csm-template-name">{tmpl.name}</span>
                    <span className="csm-template-desc">{tmpl.desc}</span>
                  </div>
                  <div className="csm-template-radio">
                    <div className="csm-template-radio-inner" />
                  </div>
                </button>
              ))}
            </div>

            <div className="csm-actions">
              <button className="csm-btn-cancel" onClick={handleClose}>Cancel</button>
              <button className="csm-btn-next" onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="csm-header">
              <h2>Customize your server</h2>
              <p>Give your server a personality with a name and description. You can always change this later.</p>
            </div>

            <div className="csm-form">
              <div className="csm-icon-upload">
                <div className="csm-icon-preview">
                  <span>{serverName.charAt(0).toUpperCase() || '?'}</span>
                </div>
              </div>

              <div className="csm-field">
                <label>Server Name</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="My Awesome Server"
                  autoFocus
                  maxLength={100}
                />
              </div>

              <div className="csm-field">
                <label>Description <span className="csm-optional">Optional</span></label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is your server about?"
                  rows={3}
                  maxLength={500}
                />
              </div>

              <p className="csm-tos-note">
                By creating a server, you agree to Slide's Community Guidelines.
              </p>
            </div>

            {creating && (
              <div className="csm-progress">
                <div className="csm-progress-bar">
                  <div className="csm-progress-fill" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="csm-progress-text">{progress}</span>
              </div>
            )}

            <div className="csm-actions">
              <button
                className="csm-btn-back"
                onClick={() => {
                  if (onBackToHub && initialTemplate) {
                    onBackToHub();
                  } else {
                    setStep(1);
                  }
                }}
                disabled={creating}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                Back
              </button>
              <button
                className="csm-btn-create"
                onClick={handleCreate}
                disabled={!serverName.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
