-- Base de données Slide - Messagerie type Teams
-- MySQL port 2222, user root, mdp root

CREATE DATABASE IF NOT EXISTS slide CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE slide;

-- Utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500) DEFAULT NULL,
  status_message VARCHAR(255) DEFAULT NULL,
  legal_accepted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- Présence (en ligne / hors ligne / absent)
CREATE TABLE IF NOT EXISTS user_presence (
  user_id INT PRIMARY KEY,
  status ENUM('online', 'offline', 'away', 'busy', 'dnd') DEFAULT 'offline',
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Équipes (workspaces)
CREATE TABLE IF NOT EXISTS CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BIGINT UNSIGNED UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  avatar_url VARCHAR(500) DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_created_by (created_by)
) ENGINE=InnoDB;

-- Membres des équipes
CREATE TABLE IF NOT EXISTS team_members (
  team_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('owner', 'admin', 'member') DEFAULT 'member',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, user_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_teams (user_id)
) ENGINE=InnoDB;

-- Ordre personnalisé des serveurs par utilisateur (sidebar)
CREATE TABLE IF NOT EXISTS user_team_order (
  user_id INT NOT NULL,
  team_id INT NOT NULL,
  position INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, team_id),
  UNIQUE KEY uniq_user_position (user_id, position),
  INDEX idx_user_position (user_id, position),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Canaux (publics ou privés) dans une équipe
CREATE TABLE IF NOT EXISTS channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BIGINT UNSIGNED UNIQUE,
  team_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_private BOOLEAN DEFAULT FALSE,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  channel_type ENUM('text', 'voice', 'announcement', 'stage', 'forum') DEFAULT 'text',
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_channel_name (team_id, name, channel_type),
  INDEX idx_team_channels (team_id)
) ENGINE=InnoDB;

-- Membres des canaux privés
CREATE TABLE IF NOT EXISTS channel_members (
  channel_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Conversations directes (DM)
CREATE TABLE IF NOT EXISTS direct_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  public_id BIGINT UNSIGNED UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Participants des conversations directes (2 pour 1-1, plus pour groupe)
CREATE TABLE IF NOT EXISTS direct_conversation_participants (
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_dms (user_id)
) ENGINE=InnoDB;

-- Messages des canaux
CREATE TABLE IF NOT EXISTS channel_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  type ENUM('text', 'file', 'image', 'reply', 'sticker') DEFAULT 'text',
  reply_to_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES channel_messages(id) ON DELETE SET NULL,
  INDEX idx_channel_messages (channel_id, created_at)
) ENGINE=InnoDB;

-- Messages des conversations directes
CREATE TABLE IF NOT EXISTS direct_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  type ENUM('text', 'file', 'image', 'reply', 'sticker') DEFAULT 'text',
  reply_to_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (conversation_id) REFERENCES direct_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to_id) REFERENCES direct_messages(id) ON DELETE SET NULL,
  INDEX idx_conv_messages (conversation_id, created_at)
) ENGINE=InnoDB;

-- Pièces jointes (canaux)
CREATE TABLE IF NOT EXISTS channel_message_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size INT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT 'application/octet-stream',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Pièces jointes (DM)
CREATE TABLE IF NOT EXISTS direct_message_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  file_size INT DEFAULT 0,
  mime_type VARCHAR(100) DEFAULT 'application/octet-stream',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES direct_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Réactions (optionnel, pour canaux)
CREATE TABLE IF NOT EXISTS channel_message_reactions (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  emoji VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES channel_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ═══════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES (add after initial schema)
-- ═══════════════════════════════════════════════════════════

-- Index for faster message lookups by sender
ALTER TABLE channel_messages ADD INDEX idx_channel_messages_sender (sender_id);
ALTER TABLE direct_messages ADD INDEX idx_direct_messages_sender (sender_id);

-- Index for faster channel member lookups
ALTER TABLE channel_members ADD INDEX idx_channel_members_user (user_id);

-- Index for cursor-based pagination (ORDER BY id DESC)
ALTER TABLE channel_messages ADD INDEX idx_channel_messages_id_desc (channel_id, id DESC);
ALTER TABLE direct_messages ADD INDEX idx_direct_messages_id_desc (conversation_id, id DESC);

-- Index for direct conversation participants lookup
ALTER TABLE direct_conversation_participants ADD INDEX idx_direct_participants_conv (conversation_id);

-- Index for presence lookups
ALTER TABLE user_presence ADD INDEX idx_user_presence_status (status);

-- Invitations équipe (optionnel)
CREATE TABLE IF NOT EXISTS team_invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(64) UNIQUE NOT NULL,
  invited_by INT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_token (token)
) ENGINE=InnoDB;

-- ═══════════════════════════════════════════════════════════
-- STICKER PACKS (packs de stickers liés aux équipes/groupes)
-- ═══════════════════════════════════════════════════════════

-- Packs de stickers (liés à une équipe)
CREATE TABLE IF NOT EXISTS sticker_packs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  cover_url VARCHAR(500) DEFAULT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team_packs (team_id),
  INDEX idx_pack_creator (created_by)
) ENGINE=InnoDB;

-- Stickers individuels dans un pack
CREATE TABLE IF NOT EXISTS stickers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pack_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pack_id) REFERENCES sticker_packs(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pack_stickers (pack_id)
) ENGINE=InnoDB;
