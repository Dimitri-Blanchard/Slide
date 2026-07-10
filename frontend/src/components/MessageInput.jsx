import React, { useState, useRef, useEffect, memo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useNotification } from '../context/NotificationContext';
import { useLanguage } from '../context/LanguageContext';
import VoiceRecorder from './VoiceRecorder';
import MentionSuggestions from './MentionSuggestions';
import CommandPalette from './CommandPalette';
import TextWithAranjaEmojis from './TextWithAranjaEmojis';
import AppIcon from './icons/AppIcon';
import StickerPicker from './StickerPicker';
import { getContent, setContent, refreshComposer, insertEmoji, insertPlainTextAtCursor, getTextBeforeCursor, getCursorOffset, setCursorAtOffset, isMutatingComposer, handleEmojiAwareCopy } from '../utils/contentEditableEmoji';
import { RATE_LIMIT_EVENT } from '../utils/rateLimitRetry';
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
  onMediaSelect,
  onEmojiSelect,
  isAdmin = false,
  canSend = true,
  maxFileSize = 8 * 1024 * 1024,
  onInputFocus,
  isSendBackpressured = false,
}, ref) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [showSpamModal, setShowSpamModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mentionState, setMentionState] = useState(null); // { startPos, query, x, y }
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [mediaPickerTab, setMediaPickerTab] = useState(null);
  const typingSentRef = useRef(false);
  const inputRef = useRef(null);
  const composerRef = useRef(null);
  const pickerAnchorRef = useRef(null);
  const fileInputRef = useRef(null);
  const draftTimeoutRef = useRef(null);
  const { notify } = useNotification();
  const { t } = useLanguage();

  // Expose insertText (emoji insertion), focus, and setSelectedFile for parent (e.g. drag-drop)
  useImperativeHandle(ref, () => ({
    insertText: (emoji) => {
      if (!inputRef.current) return;
      insertEmoji(inputRef.current, emoji);
      syncValueFromEditable();
    },
    insertPlainText: (text) => {
      if (!inputRef.current) return;
      insertPlainTextAtCursor(inputRef.current, text);
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
      setValue(refreshComposer(inputRef.current));
    }
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
      // Ignorer si on est dans un autre champ de saisie (composer, édition inline, etc.)
      const active = document.activeElement;
      const tag = active?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (active?.isContentEditable) return;
      
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
    if (isMutatingComposer()) return;
    const editable = inputRef.current;
    if (!editable) return;

    requestAnimationFrame(() => {
      if (isMutatingComposer() || !inputRef.current) return;
      const el = inputRef.current;
      const newValue = refreshComposer(el);
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
    const textBeforeCursor = getTextBeforeCursor(el);
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
            const r = el.getBoundingClientRect();
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
    });
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
      setValue(newContent);
    }
  }, [notify, t]);

  const closeSpamModal = useCallback(() => {
    setShowSpamModal(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const handleRateLimit = () => setShowSpamModal(true);
    window.addEventListener(RATE_LIMIT_EVENT, handleRateLimit);
    return () => window.removeEventListener(RATE_LIMIT_EVENT, handleRateLimit);
  }, []);

  useEffect(() => {
    if (isSendBackpressured) setShowSpamModal(true);
  }, [isSendBackpressured]);

  // Handle arrow up to edit last message + maxLength + Enter to send
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showSpamModal) {
        closeSpamModal();
        return;
      }
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
  }, [value, selectedFile, showSpamModal, closeSpamModal, lastOwnMessage, onEditLastMessage]);

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

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (showSpamModal) return;
    if (isSendBackpressured) {
      setShowSpamModal(true);
      return;
    }
    if (sending) return;
    
    const content = value.trim();
    const hasFile = selectedFile && onUpload;
    const hasText = content.length > 0;
    
    if (!hasFile && !hasText) return;

    typingSentRef.current = false;
    try {
      if (hasFile) {
        setSending(true);
        await onUpload(selectedFile, null, hasText ? content : null);
        setSelectedFile(null);
        setPreview(null);
        if (hasText) {
          if (inputRef.current) setContent(inputRef.current, '');
          setValue('');
          clearDraft();
        }
      } else if (hasText) {
        Promise.resolve().then(() => onSend(content, 'text', replyTo?.id || null)).catch((err) => {
          console.error('Erreur envoi:', err);
          if (err.status === 429) {
            setShowSpamModal(true);
          } else {
            const msg = err.retryAfter != null
              ? `${err.message} ${t('chat.rateLimitCooldown', { seconds: err.retryAfter })}`
              : (err.message || t('chat.sendError'));
            notify.error(msg);
          }
        });
        if (inputRef.current) setContent(inputRef.current, '');
        setValue('');
        clearDraft();
      }
      if (onCancelReply) onCancelReply();
      // Keep keyboard open: re-focus after send so it stays open until user closes it
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
      const focusInput = () => inputRef.current?.focus({ preventScroll: isMobile });
      requestAnimationFrame(focusInput);
      if (isMobile) setTimeout(focusInput, 100);
    } catch (err) {
      console.error('Erreur envoi:', err);
      if (err.status === 429) {
        setShowSpamModal(true);
      } else {
        const msg = err.retryAfter != null
          ? `${err.message} ${t('chat.rateLimitCooldown', { seconds: err.retryAfter })}`
          : (err.message || t('chat.sendError'));
        notify.error(msg);
      }
    } finally {
      setSending(false);
    }
  }, [value, selectedFile, sending, showSpamModal, isSendBackpressured, onSend, onUpload, notify, replyTo, onCancelReply, clearDraft, t]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const hasComposerContent = !!(value.trim() || selectedFile);

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
        if (err.status === 429) {
          setShowSpamModal(true);
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

  const toggleMediaPicker = useCallback((tab) => {
    setMediaPickerTab((prev) => (prev === tab ? null : tab));
  }, []);

  const closeMediaPicker = useCallback(() => {
    setMediaPickerTab(null);
  }, []);

  const handleMediaPickerSelect = useCallback((item) => {
    onMediaSelect?.(item);
    closeMediaPicker();
  }, [onMediaSelect, closeMediaPicker]);

  const handleMediaPickerEmoji = useCallback((emoji) => {
    onEmojiSelect?.(emoji);
  }, [onEmojiSelect]);

  const showMediaPicker = Boolean(onMediaSelect && mediaPickerTab);

  // Show locked state if user lacks send permission
  if (!canSend) {
    return (
      <div className="message-input-container">
        <div className="message-input-locked" aria-label="Envoi de messages désactivé">
          <AppIcon name="lock" size={16} className="message-input-locked-icon" />
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
    <div className="message-input-container" ref={composerRef}>
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
                  ? <><AppIcon name="image" size={14} /> {t('chat.image')}</>
                  : <><AppIcon name="paperclip" size={14} /> {t('chat.file')}</>
              }
            </span>
          </div>
          <button 
            type="button" 
            className="reply-preview-close" 
            onClick={onCancelReply}
            title={t('chat.cancelReply')}
          >
            <AppIcon name="close" size={16} weight="bold" />
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
                      <AppIcon name="play" size={11} />
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
                <AppIcon name="file" size={18} />
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
            <AppIcon name="close" size={14} weight="bold" />
          </button>
        </div>
      )}
      <div className="message-composer">
        <form className="message-input-wrap" onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            className="message-file-input"
            onChange={handleFileSelect}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt,.mp3,.wav,.mp4,.webm"
          />

          <button
            type="button"
            className="message-plus-btn"
            onClick={openFilePicker}
            disabled={sending}
            title={t('chat.attachFile')}
          >
            <AppIcon name="plus" size={20} weight="bold" />
          </button>

          <div
            ref={inputRef}
            className="message-input message-input-editable"
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCopy={(e) => handleEmojiAwareCopy(e, e.currentTarget)}
            onFocus={() => {
              const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
              if (isMobile && onInputFocus) {
                requestAnimationFrame(() => {
                  setTimeout(() => onInputFocus(), 100);
                });
              }
            }}
            data-placeholder={placeholder || t('chat.typeMessage')}
          />

          <div className="message-picker-anchor" ref={pickerAnchorRef}>
            <div className="message-input-actions">
              {onMediaSelect && (
                <>
                  <button
                    type="button"
                    className={`message-action-btn message-action-gif ${mediaPickerTab === 'gifs' ? 'active' : ''}`}
                    onClick={() => toggleMediaPicker('gifs')}
                    disabled={sending}
                    title="GIFs"
                  >
                    <span className="message-gif-badge">GIF</span>
                  </button>
                  <button
                    type="button"
                    className={`message-action-btn message-action-sticker ${mediaPickerTab === 'stickers' ? 'active' : ''}`}
                    onClick={() => toggleMediaPicker('stickers')}
                    disabled={sending}
                    title={t('chat.stickers')}
                  >
                    <AppIcon name="sticker" size={20} />
                  </button>
                  <button
                    type="button"
                    className={`message-action-btn message-action-emoji ${mediaPickerTab === 'emoji' ? 'active' : ''}`}
                    onClick={() => toggleMediaPicker('emoji')}
                    disabled={sending}
                    title={t('stickers.emojis') || 'Emoji'}
                  >
                    <AppIcon name="emoji" size={20} />
                  </button>
                </>
              )}

              {hasComposerContent ? (
                <button
                  type="submit"
                  className={`message-action-btn message-send ${hasComposerContent ? 'has-content' : ''}`}
                  disabled={sending || showSpamModal}
                  title={t('chat.send')}
                >
                  {sending ? (
                    <span className="send-spinner" />
                  ) : (
                    <AppIcon name="send" size={20} weight="fill" />
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="message-action-btn"
                  onClick={startVoiceRecording}
                  disabled={sending || !!selectedFile}
                  title={t('chat.voiceMessage')}
                >
                  <AppIcon name="mic" size={20} />
                </button>
              )}
            </div>

            {showMediaPicker && (
              <StickerPicker
                isOpen={showMediaPicker}
                initialTab={mediaPickerTab}
                anchorRef={pickerAnchorRef}
                onClose={closeMediaPicker}
                onSelect={handleMediaPickerSelect}
                onEmojiSelect={handleMediaPickerEmoji}
                onTabChange={setMediaPickerTab}
                variant="popover"
              />
            )}
          </div>
        </form>
      </div>

      {showSpamModal && (
        <div className="spam-modal-backdrop" role="presentation" onMouseDown={closeSpamModal}>
          <div
            className="spam-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="spam-modal-title"
            aria-describedby="spam-modal-description"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                closeSpamModal();
              }
            }}
          >
            <button
              type="button"
              className="spam-modal-close"
              onClick={closeSpamModal}
              aria-label="Close"
            >
              <AppIcon name="close" size={24} weight="bold" />
            </button>
            <h2 id="spam-modal-title">WOAH THERE, WAY TOO SPICY</h2>
            <p id="spam-modal-description">You're sending messages too quickly!</p>
            <button type="button" className="spam-modal-button" onClick={closeSpamModal} autoFocus>
              Enter the chill zone
            </button>
          </div>
        </div>
      )}
      
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
