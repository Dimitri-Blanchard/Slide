-- Migration: Add sticker packs feature
-- Run this on your existing database

-- ═══════════════════════════════════════════════════════════
-- 1. Update message type enum to include 'sticker'
-- ═══════════════════════════════════════════════════════════

-- For channel_messages
ALTER TABLE channel_messages 
MODIFY COLUMN type ENUM('text', 'file', 'image', 'reply', 'sticker') DEFAULT 'text';

-- For direct_messages
ALTER TABLE direct_messages 
MODIFY COLUMN type ENUM('text', 'file', 'image', 'reply', 'sticker') DEFAULT 'text';

-- ═══════════════════════════════════════════════════════════
-- 2. Create sticker pack tables
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

-- Done!
SELECT 'Sticker packs migration completed successfully!' as status;
