import React, { useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useNotification } from '../context/NotificationContext';
import './FileDropOverlay.css';

export default function FileDropOverlay({
  uploadTarget,
  canWrite,
  maxFileSize = 8 * 1024 * 1024,
  onDrop,
  onUploadDirect,
  children,
}) {
  const { t } = useLanguage();
  const { notify } = useNotification();
  const [isDragOver, setIsDragOver] = useState(false);
  const [dragShift, setDragShift] = useState(false);

  const isFileDrag = useCallback((e) => {
    return e.dataTransfer?.types?.includes('Files');
  }, []);

  const hasFolder = useCallback((e) => {
    const items = e.dataTransfer?.items;
    if (!items) return false;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry?.isDirectory) return true;
    }
    return false;
  }, []);

  const handleDragEnter = useCallback((e) => {
    if (!canWrite || !isFileDrag(e) || hasFolder(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    setDragShift(e.shiftKey);
  }, [canWrite, isFileDrag, hasFolder]);

  const handleDragOver = useCallback((e) => {
    if (!canWrite || !isFileDrag(e) || hasFolder(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragShift(e.shiftKey);
  }, [canWrite, isFileDrag, hasFolder]);

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    setIsDragOver(false);
    if (!canWrite || !e.dataTransfer?.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    if (hasFolder(e)) {
      notify.error(t('chat.folderNotSupported'));
      return;
    }
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.size === 0) {
      notify.error(t('chat.folderNotSupported'));
      return;
    }
    if (file.size > maxFileSize) {
      notify.error(t('chat.fileTooLarge'));
      return;
    }
    if (e.shiftKey && onUploadDirect) {
      onUploadDirect(file);
    } else if (onDrop) {
      onDrop(file);
    }
  }, [canWrite, hasFolder, maxFileSize, onDrop, onUploadDirect, notify, t]);

  return (
    <div
      className="file-drop-zone"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragOver && canWrite && (
        <div className="file-drop-overlay">
          <div className="file-drop-content">
            <div className="file-drop-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <p className="file-drop-title">{t('chat.dropToSend')} {uploadTarget}</p>
            <span className="file-drop-hint">{t('chat.uploadHoldShift')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
