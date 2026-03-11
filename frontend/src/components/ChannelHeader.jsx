import React, { memo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './ChannelHeader.css';

const TextChannelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" opacity="0.6">
    <path d="M5.88657 21C5.57547 21 5.3399 20.7189 5.39427 20.4126L6.00001 17H2.59511C2.28449 17 2.04905 16.7198 2.10259 16.4138L2.27759 15.4138C2.31946 15.1746 2.52722 15 2.77011 15H6.35001L7.41001 9H4.00511C3.69449 9 3.45905 8.71977 3.51259 8.41381L3.68759 7.41381C3.72946 7.17456 3.93722 7 4.18011 7H7.76001L8.39677 3.41262C8.43914 3.17391 8.64664 3 8.88907 3H9.87344C10.1845 3 10.4201 3.28107 10.3657 3.58738L9.76001 7H15.76L16.3968 3.41262C16.4391 3.17391 16.6466 3 16.8891 3H17.8734C18.1845 3 18.4201 3.28107 18.3657 3.58738L17.76 7H21.1649C21.4755 7 21.711 7.28023 21.6574 7.58619L21.4824 8.58619C21.4406 8.82544 21.2328 9 20.9899 9H17.41L16.35 15H19.7549C20.0655 15 20.301 15.2802 20.2474 15.5862L20.0724 16.5862C20.0306 16.8254 19.8228 17 19.5799 17H16L15.3632 20.5874C15.3209 20.8261 15.1134 21 14.8709 21H13.8866C13.5755 21 13.3399 20.7189 13.3943 20.4126L14 17H8.00001L7.36325 20.5874C7.32088 20.8261 7.11337 21 6.87094 21H5.88657ZM9.41001 9L8.35001 15H14.35L15.41 9H9.41001Z"/>
  </svg>
);

const VoiceChannelIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6.586 7.00304H3C2.45 7.00304 2 7.45304 2 8.00304V16.003C2 16.553 2.45 17.003 3 17.003H6.586L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.003V4.00304C12 3.59904 11.757 3.23404 11.383 3.07904Z"/>
  </svg>
);

const ChannelHeader = memo(function ChannelHeader({
  channel,
  showMembers,
  onToggleMembers,
  onOpenSearch,
  canManage,
  editingTopic,
  topicDraft,
  onStartEditTopic,
  onSaveTopic,
  onCancelEdit,
  onTopicChange,
  isMobile,
  showMobileBack,
  onToggleMobileChannelList,
  onOpenTopic,
  showInbox,
  onToggleInbox,
}) {
  const { t } = useLanguage();
  const isVoice = channel?.channel_type === 'voice';

  return (
    <header className="channel-header">
      <div className="ch-left">
        {isMobile && showMobileBack && (
          <button
            className="ch-mobile-menu dc-mobile-back"
            onClick={onToggleMobileChannelList}
            aria-label="Back to channels"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
        )}

        <div className="ch-channel">
          <span className="ch-icon">
            {isVoice ? <VoiceChannelIcon /> : <TextChannelIcon />}
          </span>
          <h2 className="ch-name">{channel?.name || 'general'}</h2>
        </div>

        {!isVoice && (
          editingTopic ? (
            <div className="ch-topic-edit">
              <input
                type="text"
                value={topicDraft}
                onChange={e => onTopicChange?.(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onSaveTopic?.();
                  if (e.key === 'Escape') onCancelEdit?.();
                }}
                placeholder="Set a channel topic"
                autoFocus
                maxLength={1024}
              />
              <button className="ch-topic-save" onClick={onSaveTopic}>Save</button>
              <button className="ch-topic-cancel" onClick={onCancelEdit}>Cancel</button>
            </div>
          ) : channel?.topic ? (
            <>
              <div className="ch-divider" />
              <span
                className="ch-topic editable"
                onClick={onOpenTopic || (canManage ? onStartEditTopic : undefined)}
                title="Click to view topic"
              >
                {channel.topic}
              </span>
            </>
          ) : canManage ? (
            <>
              <div className="ch-divider" />
              <span className="ch-topic ch-topic-placeholder" onClick={onStartEditTopic}>
                Click to set a topic
              </span>
            </>
          ) : null
        )}
      </div>

      <div className="ch-actions">
        {onOpenSearch && (
          <button className="ch-search-bar" onClick={onOpenSearch} title="Search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span className="ch-search-placeholder">
              Search {channel?.name ? channel.name : ''}
            </span>
          </button>
        )}
        {onToggleInbox && (
          <button
            className={`ch-btn${showInbox ? ' active' : ''}`}
            onClick={onToggleInbox}
            title="Inbox"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
        )}
        <button
          className={`ch-btn${showMembers ? ' active' : ''}`}
          onClick={onToggleMembers}
          title="Member List"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M14 8.00598C14 10.211 12.206 12.006 10 12.006C7.795 12.006 6 10.211 6 8.00598C6 5.80098 7.795 4.00598 10 4.00598C12.206 4.00598 14 5.80098 14 8.00598ZM2 19.006C2 15.473 5.29 13.006 10 13.006C14.711 13.006 18 15.473 18 19.006V20.006H2V19.006Z"/>
            <path d="M18 17.006V20.006H22V17.006C22 14.473 19.711 13.006 17 13.006C16.114 13.006 15.243 13.206 14.45 13.556C16.562 14.816 18 16.656 18 17.006Z" opacity="0.5"/>
          </svg>
        </button>
      </div>
    </header>
  );
});

export default ChannelHeader;
