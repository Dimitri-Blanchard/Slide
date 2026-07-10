-- ═══════════════════════════════════════════════════════════
-- Migration: Add performance indexes
-- Run this on existing databases to improve query performance
-- ═══════════════════════════════════════════════════════════

USE slide;

-- Index for faster message lookups by sender
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'channel_messages'
    AND INDEX_NAME = 'idx_channel_messages_sender'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE channel_messages ADD INDEX idx_channel_messages_sender (sender_id)',
  'SELECT ''Index idx_channel_messages_sender already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'direct_messages'
    AND INDEX_NAME = 'idx_direct_messages_sender'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE direct_messages ADD INDEX idx_direct_messages_sender (sender_id)',
  'SELECT ''Index idx_direct_messages_sender already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for faster channel member lookups
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'channel_members'
    AND INDEX_NAME = 'idx_channel_members_user'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE channel_members ADD INDEX idx_channel_members_user (user_id)',
  'SELECT ''Index idx_channel_members_user already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for cursor-based pagination (ORDER BY id DESC)
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'channel_messages'
    AND INDEX_NAME = 'idx_channel_messages_id_desc'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE channel_messages ADD INDEX idx_channel_messages_id_desc (channel_id, id DESC)',
  'SELECT ''Index idx_channel_messages_id_desc already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'direct_messages'
    AND INDEX_NAME = 'idx_direct_messages_id_desc'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE direct_messages ADD INDEX idx_direct_messages_id_desc (conversation_id, id DESC)',
  'SELECT ''Index idx_direct_messages_id_desc already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for direct conversation participants lookup
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'direct_conversation_participants'
    AND INDEX_NAME = 'idx_direct_participants_conv'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE direct_conversation_participants ADD INDEX idx_direct_participants_conv (conversation_id)',
  'SELECT ''Index idx_direct_participants_conv already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for presence lookups
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'user_presence'
    AND INDEX_NAME = 'idx_user_presence_status'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE user_presence ADD INDEX idx_user_presence_status (status)',
  'SELECT ''Index idx_user_presence_status already exists'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Verify indexes were created
SELECT 
  TABLE_NAME, 
  INDEX_NAME, 
  COLUMN_NAME 
FROM 
  INFORMATION_SCHEMA.STATISTICS 
WHERE 
  TABLE_SCHEMA = 'slide'
ORDER BY 
  TABLE_NAME, INDEX_NAME;
