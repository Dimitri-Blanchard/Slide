import React, { useState, useRef, useEffect, useMemo, memo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Camera, Paperclip } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import { useSounds } from '../context/SoundContext';
import VoiceRecorder from './VoiceRecorder';
import MentionSuggestions from './MentionSuggestions';
import CommandPalette from './CommandPalette';
import TextWithAranjaEmojis from './TextWithAranjaEmojis';
import { getContent, setContent, insertEmoji, getTextBeforeCursor, getCursorOffset, setCursorAtOffset } from '../utils/contentEditableEmoji';
import { parseMessageContent, HAS_MARKDOWN_RE } from '../utils/markdownParser';
import './MessageInput.css';

// Format file size for display (uses browser locale-independent units)
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getAttachmentKind(file) {
  if (!file) return 'file';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';

  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)) return 'video';

  return 'file';
}

const MessageInput = memo(forwardRef(function MessageInput({
  onSend,
  onUpload,
  onTyping,
  placeholder,
  lastOwnMessage,
  onEditLastMessage,
  draftKey,
  replyTo,
  onCancelReply,
  mentionUsers = [],
  onSendSticker,
  onToggleStickerPanel,
  stickerPanelOpen = false,
  isAdmin = false,
  canSend = true,
  maxFileSize = 8 * 1024 * 1024,
  onInputFocus,
}, ref) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [spamCooldownSeconds, setSpamCooldownSeconds] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const [mentionState, setMentionState] = useState(null); // { startPos, query, x, y }
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const typingSentRef = useRef(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftTimeoutRef = useRef(null);
  const { notify } = useNotification();
  const { t } = useLanguage();
  const { playMessageSent } = useSounds();

  // Expose insertText (emoji insertion), focus, and setSelectedFile for parent (e.g. drag-drop)
  useImperativeHandle(ref, () => ({
    insertText: (emoji) => {
      if (!inputRef.current) return;
      insertEmoji(inputRef.current, emoji);
      syncValueFromEditable();
    },
    focus: () => {
      inputRef.current?.focus();
    },
    attachFile: (file) => {
      if (!file) return;
      if (file.size > maxFileSize) {
        notify.error(t('chat.fileTooLarge'));
        return;
      }
      setSelectedFile(file);
    }
  }), [maxFileSize, notify, t]);

  const syncValueFromEditable = useCallback(() => {
    if (inputRef.current) {
      setValue(getContent(inputRef.current));
    }
  }, []);

  // Normalize: replace typed/pasted Unicode emojis with Aranja images (debounced)
  const normalizeEmojisRef = useRef(null);
  useEffect(() => {
    return () => {
      if (normalizeEmojisRef.current) clearTimeout(normalizeEmojisRef.current);
    };
  }, []);

  // Load draft when draftKey changes: read storage first (avoids wrong-channel bleed), then sync DOM when ref exists
  useEffect(() => {
    if (!draftKey) return;
    const savedDraft = localStorage.getItem(`draft_${draftKey}`) ?? '';
    setValue(savedDraft);

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;
    const syncDom = () => {
      if (cancelled) return;
      const el = inputRef.current;
      if (el) {
        setContent(el, savedDraft);
        return;
      }
      if (attempts++ < maxAttempts) requestAnimationFrame(syncDom);
    };
    requestAnimationFrame(syncDom);
    return () => { cancelled = true; };
  }, [draftKey]);

  // Save draft to localStorage (debounced)
  useEffect(() => {
    if (!draftKey) return;
    
    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current);
    }
    
    draftTimeoutRef.current = setTimeout(() => {
      if (value.trim()) {
        localStorage.setItem(`draft_${draftKey}`, value);
      } else {
        localStorage.removeItem(`draft_${draftKey}`);
      }
    }, 500);
    
    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, [value, draftKey]);

  // Clear draft helper
  const clearDraft = useCallback(() => {
    if (draftKey) {
      localStorage.removeItem(`draft_${draftKey}`);
    }
  }, [draftKey]);

  // Live markdown preview: show when value has markdown and not manually dismissed
  const hasMarkdown = useMemo(() => value.trim().length > 0 && HAS_MARKDOWN_RE.test(value), [value]);
  const showMdPreview = hasMarkdown && !previewDismissed;

  // Auto-reset dismiss when input is cleared
  useEffect(() => {
    if (!value.trim()) setPreviewDismissed(false);
  }, [value]);

  // Auto-focus on mount/conversation change — skip on mobile to avoid keyboard popping
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (!isMobile) inputRef.current?.focus();
  }, [placeholder]);

  const fileKind = getAttachmentKind(selectedFile);
  const isImage = fileKind === 'image';
  const isVideo = fileKind === 'video';

  // Generate preview for images and videos
  useEffect(() => {
    if (!selectedFile) {
      setPreview(null);
      return;
    }
    
    if (fileKind === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selectedFile);
      return () => setPreview(null);
    }

    if (fileKind === 'video') {
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl);
      return () => {
        URL.revokeObjectURL(objectUrl);
        setPreview(null);
      };
    } else {
      setPreview(null);
    }
    
    return () => setPreview(null);
  }, [selectedFile, fileKind]);

  // Focus global : si on tape n'importe où et qu'on n'est pas dans un autre input
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorer si on est dans un autre champ de saisie
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      
      // Ignorer les touches de contrôle
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      // Ignorer les touches spéciales
      if (['Escape', 'Tab', 'Enter', 'Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      
      // Focus l'input et laisser la touche s'y inscrire
      inputRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleInput = useCallback(() => {
    const editable = inputRef.current;
    if (!editable) return;
    const newValue = getContent(editable);
    setValue(newValue);
    
    // Check for command trigger (admin only)
    if (isAdmin && newValue.startsWith('/')) {
      const spaceIndex = newValue.indexOf(' ');
      if (spaceIndex === -1) {
        setShowCommandPalette(true);
        setCommandQuery(newValue);
      } else {
        setShowCommandPalette(false);
        setCommandQuery('');
      }
    } else {
      setShowCommandPalette(false);
      setCommandQuery('');
    }
    
    // Check for mention trigger
    const textBeforeCursor = getTextBeforeCursor(editable);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && textAfterAt.length <= 20) {
        const sel = window.getSelection();
        const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
        let x = 0, y = 0;
        if (range) {
          const rects = range.getClientRects();
          if (rects.length > 0) {
            x = rects[0].right;
            y = rects[0].top;
          } else {
            const r = editable.getBoundingClientRect();
            x = r.left + 20;
            y = r.top;
          }
        }
        setMentionState({
          startPos: lastAtIndex,
          query: textAfterAt,
          x,
          y
        });
      } else {
        setMentionState(null);
      }
    } else {
      setMentionState(null);
    }
    
    if (newValue && !typingSentRef.current) {
      typingSentRef.current = true;
      onTyping?.();
      setTimeout(() => { typingSentRef.current = false; }, 2000);
    }
    // Debounced: replace typed/pasted Unicode emojis with Aranja images
    if (normalizeEmojisRef.current) clearTimeout(normalizeEmojisRef.current);
    normalizeEmojisRef.current = setTimeout(() => {
      if (inputRef.current) {
        const content = getContent(inputRef.current);
        const offset = getCursorOffset(inputRef.current);
        setContent(inputRef.current, content);
        setCursorAtOffset(inputRef.current, Math.min(offset, content.length));
        setValue(content);
      }
      normalizeEmojisRef.current = null;
    }, 150);
  }, [onTyping, isAdmin]);

  // Handle mention selection
  const handleMentionSelect = useCallback((mentionName) => {
    if (!mentionState || !inputRef.current) return;
    const beforeMention = value.substring(0, mentionState.startPos);
    const afterMention = value.substring(mentionState.startPos + mentionState.query.length + 1);
    const newValue = `${beforeMention}@${mentionName} ${afterMention}`;
    setContent(inputRef.current, newValue);
    setValue(newValue);
    setMentionState(null);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, [mentionState, value]);

  const handleCloseMentions = useCallback(() => {
    setMentionState(null);
  }, []);

  // Handle command selection from palette
  const handleCommandSelect = useCallback((command) => {
    if (inputRef.current) {
      setContent(inputRef.current, command);
    }
    setValue(command);
    setShowCommandPalette(false);
    setCommandQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // Handle closing command palette
  const handleCloseCommandPalette = useCallback(() => {
    setShowCommandPalette(false);
    setCommandQuery('');
  }, []);

  // Handle paste: images -> file, text -> insert with Aranja emoji conversion
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            if (file.size > maxFileSize) {
              notify.error(t('chat.fileTooLarge'));
              return;
            }
            setSelectedFile(file);
          }
          return;
        }
      }
    }
    // Text paste: insert at cursor and normalize emojis to Aranja
    const text = e.clipboardData?.getData?.('text/plain');
    if (text && inputRef.current) {
      e.preventDefault();
      const content = getContent(inputRef.current);
      const offset = getCursorOffset(inputRef.current);
      const before = content.substring(0, offset);
      const after = content.substring(offset);
      const newContent = before + text + after;
      if (newContent.length > 4000) return;
      setContent(inputRef.current, newContent);
      setCursorAtOffset(inputRef.current, offset + text.length);
      setValue(getContent(inputRef.current));
    }
  }, [notify, t]);

  // Handle arrow up to edit last message + maxLength + Enter to send
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() || selectedFile) {
        e.target.closest('form')?.requestSubmit();
      }
      return;
    }
    if (e.key === 'ArrowUp' && !value.trim() && !selectedFile && lastOwnMessage && onEditLastMessage) {
      if (lastOwnMessage.type === 'text') {
        e.preventDefault();
        onEditLastMessage(lastOwnMessage);
      }
    }
    if (inputRef.current && getContent(inputRef.current).length >= 4000 && !/Backspace|Delete|ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|Tab|Escape/.test(e.key) && e.key !== 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
    }
  }, [value, selectedFile, lastOwnMessage, onEditLastMessage]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size against subscription limit
      if (file.size > maxFileSize) {
        notify.error(t('chat.fileTooLarge'));
        return;
      }
      setSelectedFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }, [notify, t]);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setPreview(null);
  }, []);

  // Live countdown for spam cooldown
  useEffect(() => {
    if (spamCooldownSeconds <= 0) return;
    const tick = setInterval(() => {
      setSpamCooldownSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [spamCooldownSeconds]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (sending || spamCooldownSeconds > 0) return;
    
    const content = value.trim();
    const hasFile = selectedFile && onUpload;
    const hasText = content.length > 0;
    
    if (!hasFile && !hasText) return;

    setSending(true);
    typingSentRef.current = false;
    try {
      if (hasFile) {
        await onUpload(selectedFile, null, hasText ? content : null);
        setSelectedFile(null);
        setPreview(null);
        if (hasText) {
          if (inputRef.current) setContent(inputRef.current, '');
          setValue('');
          clearDraft();
        }
      } else if (hasText) {
        await onSend(content, 'text', replyTo?.id || null);
        if (inputRef.current) setContent(inputRef.current, '');
        setValue('');
        clearDraft();
      }
      if (onCancelReply) onCancelReply();
      playMessageSent();
      // Keep keyboard open: re-focus after send so it stays open until user closes it
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const focusInput = () => inputRef.current?.focus({ preventScroll: isMobile });
      requestAnimationFrame(focusInput);
      if (isMobile) setTimeout(focusInput, 100);
    } catch (err) {
      console.error('Erreur envoi:', err);
      // Spam/rate limit: show explicit spam message + live countdown
      if (err.status === 429 && err.retryAfter != null) {
        const seconds = Math.ceil(Number(err.retryAfter));
        setSpamCooldownSeconds(seconds);
        notify.error(t('chat.spamWarning'));
      } else {
        const msg = err.retryAfter != null
          ? `${err.message} ${t('chat.rateLimitCooldown', { seconds: err.retryAfter })}`
          : (err.message || t('chat.sendError'));
        notify.error(msg);
      }
    } finally {
      setSending(false);
    }
  }, [value, selectedFile, sending, spamCooldownSeconds, onSend, onUpload, notify, replyTo, onCancelReply, clearDraft, playMessageSent, t]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Voice recording handlers
  const startVoiceRecording = useCallback(() => {
    setIsRecording(true);
  }, []);

  const handleVoiceRecordingComplete = useCallback(async (audioFile, voiceDuration) => {
    setIsRecording(false);
    if (onUpload) {
      // Don't wait - fire and forget for optimistic UI
      // The upload will happen in the background
        onUpload(audioFile, voiceDuration).catch((err) => {
        console.error('Erreur upload audio:', err);
        if (err.status === 429 && err.retryAfter != null) {
          setSpamCooldownSeconds(Math.ceil(Number(err.retryAfter)));
          notify.error(t('chat.spamWarning'));
        } else {
          const msg = err.retryAfter != null
            ? `${err.message} ${t('chat.rateLimitCooldown', { seconds: err.retryAfter })}`
            : (err.message || t('chat.voiceError'));
          notify.error(msg);
        }
      });
    }
  }, [onUpload, notify, t]);

  const handleVoiceRecordingCancel = useCallback(() => {
    setIsRecording(false);
  }, []);

  // Sticker panel toggle handler
  const handleToggleStickerPanel = useCallback(() => {
    if (onToggleStickerPanel) {
      onToggleStickerPanel();
    }
  }, [onToggleStickerPanel]);

  // Show locked state if user lacks send permission
  if (!canSend) {
    return (
      <div className="message-input-container">
        <div className="message-input-locked" aria-label="Envoi de messages désactivé">
          <svg className="message-input-locked-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Vous n'avez pas la permission d'envoyer des messages dans ce canal.</span>
        </div>
      </div>
    );
  }

  // Show voice recorder if recording
  if (isRecording) {
    return (
      <div className="message-input-container">
        <VoiceRecorder 
          onRecordingComplete={handleVoiceRecordingComplete}
          onCancel={handleVoiceRecordingCancel}
        />
      </div>
    );
  }

  return (
    <div className="message-input-container">
      {/* Spam cooldown banner */}
      {spamCooldownSeconds > 0 && (
        <div className="message-input-spam-banner" role="alert">
          <span className="message-input-spam-text">{t('chat.spamWarning')}</span>
          <span className="message-input-spam-countdown">
            <svg className="message-input-spam-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            {spamCooldownSeconds}
          </span>
        </div>
      )}
      {/* Reply Preview */}
      {replyTo && (
        <div className="reply-preview">
          <div className="reply-preview-bar" />
          <div className="reply-preview-content">
            <span className="reply-preview-author">{replyTo.sender?.display_name || t('chat.user')}</span>
            <span className="reply-preview-text">
              {replyTo.type === 'text' 
                ? <TextWithAranjaEmojis text={replyTo.content?.length > 100 ? replyTo.content.substring(0, 100) + '...' : replyTo.content} />
                : replyTo.type === 'image' 
                  ? <><Camera size={14} /> {t('chat.image')}</>
                  : <><Paperclip size={14} /> {t('chat.file')}</>
              }
            </span>
          </div>
          <button 
            type="button" 
            className="reply-preview-close" 
            onClick={onCancelReply}
            title={t('chat.cancelReply')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}
      
      {/* File Preview */}
      {selectedFile && (
        <div className={`file-preview ${(isImage || isVideo) ? 'media' : 'file'} ${isVideo ? 'video' : ''}`}>
          {(isImage || isVideo) && preview ? (
            <div className="file-preview-media">
              {isImage ? (
                <img src={preview} alt={t('chat.preview')} className="file-preview-image" />
              ) : (
                <div className="file-preview-video-compact">
                  <div className="file-preview-video-thumb-wrap">
                    <video
                      src={preview}
                      className="file-preview-video-thumb"
                      preload="metadata"
                      muted
                      playsInline
                    />
                    <span className="file-preview-video-play" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                        <path d="M8 5v14l11-7z" fill="currentColor"/>
                      </svg>
                    </span>
                  </div>
                </div>
              )}
              <div className="file-preview-media-meta">
                <span className="file-preview-media-type">{isVideo ? 'Video' : t('chat.image')}</span>
                <span className="file-preview-name">{selectedFile.name}</span>
                <span className="file-preview-size">{formatFileSize(selectedFile.size)}</span>
              </div>
            </div>
          ) : (
            <div className="file-preview-info">
              <span className="file-preview-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                </svg>
              </span>
              <span className="file-preview-name">{selectedFile.name}</span>
              <span className="file-preview-size">{formatFileSize(selectedFile.size)}</span>
            </div>
          )}
          <button 
            type="button" 
            className="file-preview-remove" 
            onClick={handleRemoveFile}
            title={t('chat.removeFile')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      )}
      
      {/* Markdown live preview */}
      {showMdPreview && (
        <div className="md-live-preview">
          <div className="md-live-preview-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span>Aperçu</span>
            <button
              type="button"
              className="md-live-preview-close"
              onClick={() => setPreviewDismissed(true)}
              title="Fermer l'aperçu"
              aria-label="Fermer l'aperçu"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="md-live-preview-body message-content message-content-text">
            {parseMessageContent(value, '', mentionUsers)}
          </div>
        </div>
      )}

      <form className="message-input-wrap" onSubmit={handleSubmit}>
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="message-file-input"
          onChange={handleFileSelect}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp3,.wav,.mp4,.webm"
        />
        
        {/* Attach button */}
        <button 
          type="button" 
          className="message-attach" 
          onClick={openFilePicker}
          disabled={sending || spamCooldownSeconds > 0}
          title={t('chat.attachFile')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
          </svg>
        </button>
        
        <div
          ref={inputRef}
          className="message-input message-input-editable"
          contentEditable={spamCooldownSeconds <= 0}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => {
            const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
            if (isMobile && onInputFocus) {
              requestAnimationFrame(() => {
                setTimeout(() => onInputFocus(), 100);
              });
            }
          }}
          data-placeholder={selectedFile ? (placeholder || t('chat.typeMessage')) : (placeholder || t('chat.typeMessage'))}
        />
        
        {/* Sticker button */}
        {onToggleStickerPanel && (
          <button 
            type="button" 
            className={`message-sticker-btn ${stickerPanelOpen ? 'active' : ''}`}
            onClick={handleToggleStickerPanel}
            disabled={sending || spamCooldownSeconds > 0}
            title={t('chat.stickers')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
              <line x1="9" y1="9" x2="9.01" y2="9"></line>
              <line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
          </button>
        )}
        
        {/* Voice message button */}
        <button 
          type="button" 
          className="message-voice" 
          onClick={startVoiceRecording}
          disabled={sending || spamCooldownSeconds > 0 || !!selectedFile || !!value.trim()}
          title={t('chat.voiceMessage')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        </button>
        
        {(value.trim() || selectedFile) && (
          <button 
            type="submit" 
            className="message-send" 
            disabled={sending || spamCooldownSeconds > 0} 
            title={t('chat.send')}
          >
            {sending ? (
              <span className="send-spinner" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" fill="currentColor"/>
              </svg>
            )}
          </button>
        )}
      </form>
      
      {/* Mention Suggestions */}
      {mentionState && mentionUsers.length > 0 && (
        <MentionSuggestions
          query={mentionState.query}
          users={mentionUsers}
          x={mentionState.x}
          y={mentionState.y}
          onSelect={handleMentionSelect}
          onClose={handleCloseMentions}
        />
      )}
      
      {/* Command Palette for Admins */}
      {showCommandPalette && isAdmin && (
        <CommandPalette
          query={commandQuery}
          onSelect={handleCommandSelect}
          onClose={handleCloseCommandPalette}
          inputRef={inputRef}
        />
      )}
      
    </div>
  );
}));

export default MessageInput;
