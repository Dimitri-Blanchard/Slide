import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query, queryOne } from '../db.js';
import { optimizeImage, presets } from '../utils/imageOptimizer.js';
import { authMiddleware } from '../middleware/auth.js';
import { emitToUsers, emitToTeam, getIO } from '../socket.js';
import { messageRateLimit, messageBurstLimit, uploadRateLimit, validateMessage } from '../middleware/security.js';
import { isCommand, processCommand } from '../commands.js';
import { recordQuestAction } from '../services/quests.js';
import { hasPermission } from './servers.js';

// In-memory slowmode tracker: "channelId:userId" → timestamp of last message
const slowmodeLastSent = new Map();

// Helper to emit team unread update to all team members except sender (exported for webhooks)
export async function emitTeamUnreadUpdate(teamId, senderId, hasMention = false, mentionedUserIds = []) {
  try {
    // Get all team members except the sender
    const members = await query(
      'SELECT user_id FROM team_members WHERE team_id = ? AND user_id != ?',
      [teamId, senderId]
    );
    
    const memberIds = members.map(m => m.user_id);
    if (memberIds.length === 0) return;
    
    // Emit to all members that there's a new unread message in this team
    emitToUsers(memberIds, 'team_unread_update', {
      teamId,
      hasUnread: true
    });
    
    // Emit mention update to specifically mentioned users
    if (hasMention && mentionedUserIds.length > 0) {
      emitToUsers(mentionedUserIds, 'team_mention_update', {
        teamId,
        hasMention: true
      });
    }
  } catch (err) {
    console.error('Error emitting team unread update:', err);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads (same config as direct.js)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    // Get base name without extension and sanitize it
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_\-]/g, '_') // Replace special chars with underscore
      .substring(0, 50); // Limit length
    // Include original name in stored filename: timestamp-random-originalname.ext
    cb(null, `${uniqueSuffix}-${baseName}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip', 'application/x-zip-compressed', 'application/octet-stream',
    'application/x-rar-compressed', 'application/x-rar', 'application/vnd.rar',
    'application/x-7z-compressed', 'application/x-tar', 'application/gzip', 'application/x-gzip',
    'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript', 'application/json',
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 
    'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac',
    'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'
  ];
  
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.tgz'];
  
  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Wrapper to handle multer errors
const handleUpload = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('[Channel Upload] Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Fichier trop volumineux (max 25 Mo)' });
      }
      return res.status(400).json({ error: err.message || 'Erreur upload fichier' });
    }
    next();
  });
};

const router = Router();
router.use(authMiddleware);

const DEFAULT_LIMIT = 50;

// ═══════════════════════════════════════════════════════════
// MESSAGE SEARCH - Search in channels and DMs user has access to
// ═══════════════════════════════════════════════════════════
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json([]);
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const searchPattern = `%${q.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

    // 1. Channel messages (user must be team member)
    const channelResults = await query(
      `SELECT m.id, m.channel_id, m.content, m.type, m.created_at, m.sender_id,
              c.name as channel_name, c.team_id,
              t.name as team_name,
              u.display_name as sender_name, u.avatar_url as sender_avatar
       FROM channel_messages m
       INNER JOIN channels c ON c.id = m.channel_id
       INNER JOIN teams t ON t.id = c.team_id
       INNER JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = ?
       INNER JOIN users u ON u.id = m.sender_id
       LEFT JOIN hidden_messages h ON h.message_id = m.id AND h.message_type = 'channel' AND h.user_id = ?
       WHERE m.type IN ('text', 'reply') AND m.content LIKE ? AND h.id IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [req.user.id, req.user.id, searchPattern, Math.ceil(limit / 2)]
    );

    // 2. Direct messages (user must be participant)
    const dmResults = await query(
      `SELECT m.id, m.conversation_id, m.content, m.type, m.created_at, m.sender_id,
              u.display_name as sender_name, u.avatar_url as sender_avatar
       FROM direct_messages m
       INNER JOIN direct_conversation_participants p ON p.conversation_id = m.conversation_id AND p.user_id = ?
       INNER JOIN users u ON u.id = m.sender_id
       LEFT JOIN hidden_messages h ON h.message_id = m.id AND h.message_type = 'direct' AND h.user_id = ?
       WHERE m.type IN ('text', 'reply') AND m.content LIKE ? AND h.id IS NULL
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [req.user.id, req.user.id, searchPattern, Math.ceil(limit / 2)]
    );

    const formatChannel = (r) => ({
      id: r.id,
      type: 'channel',
      content: r.content,
      created_at: r.created_at,
      channel_id: r.channel_id,
      channel_name: r.channel_name,
      team_id: r.team_id,
      team_name: r.team_name,
      sender: { id: r.sender_id, display_name: r.sender_name, avatar_url: r.sender_avatar },
    });
    const formatDm = (r) => ({
      id: r.id,
      type: 'direct',
      content: r.content,
      created_at: r.created_at,
      conversation_id: r.conversation_id,
      sender: { id: r.sender_id, display_name: r.sender_name, avatar_url: r.sender_avatar },
    });

    const combined = [
      ...channelResults.map(formatChannel),
      ...dmResults.map(formatDm),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit);

    res.json(combined);
  } catch (err) {
    console.error('[Message search]', err);
    res.status(500).json({ error: 'Erreur recherche messages' });
  }
});

router.get('/channel/:channelId', async (req, res) => {
  try {
    const channel = await queryOne(
      'SELECT id, team_id, is_private FROM channels WHERE id = ?',
      [req.params.channelId]
    );
    if (!channel) return res.status(404).json({ error: 'Canal non trouvé' });
    
    const teamMember = await queryOne(
      'SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?',
      [channel.team_id, req.user.id]
    );
    if (!teamMember) return res.status(404).json({ error: 'Canal non trouvé' });
    
    if (channel.is_private) {
      const cm = await queryOne(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [req.params.channelId, req.user.id]
      );
      if (!cm) return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const before = req.query.before ? parseInt(req.query.before, 10) : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, 1), 100);
    
    let sql = `
      SELECT m.id, m.channel_id, m.sender_id, m.content, m.type, m.reply_to_id, m.created_at, m.edited_at,
             m.is_webhook, m.webhook_name, m.webhook_avatar,
             u.display_name as sender_name, u.avatar_url as sender_avatar,
             u.equipped_avatar_decoration_id as sender_avatar_decoration_id,
             u.equipped_nameplate_id as sender_nameplate_id
      FROM channel_messages m
      INNER JOIN users u ON u.id = m.sender_id
      LEFT JOIN hidden_messages h ON h.message_id = m.id AND h.message_type = 'channel' AND h.user_id = ?
      WHERE m.channel_id = ? AND h.id IS NULL`;

    const params = [req.user.id, req.params.channelId];

    if (before && !isNaN(before)) {
      sql += ` AND m.id < ?`;
      params.push(before);
    }

    sql += ` ORDER BY m.id DESC LIMIT ${limit}`;

    const messages = await query(sql, params);

    // Batch-load sender role colors (replaces 2 correlated subqueries per row)
    const senderIds = [...new Set(messages.filter(m => !m.is_webhook).map(m => m.sender_id))];
    const roleMap = {};
    if (senderIds.length > 0) {
      const rolePlaceholders = senderIds.map(() => '?').join(',');
      const roleRows = await query(
        `SELECT smr.user_id, sr.color, sr.name
         FROM server_member_roles smr
         INNER JOIN server_roles sr ON sr.id = smr.role_id
         WHERE smr.team_id = ? AND smr.user_id IN (${rolePlaceholders}) AND sr.show_separately = TRUE
         ORDER BY sr.position DESC`,
        [channel.team_id, ...senderIds]
      );
      for (const r of roleRows) {
        if (!roleMap[r.user_id]) roleMap[r.user_id] = { color: r.color, name: r.name };
      }
    }
    for (const m of messages) {
      const role = roleMap[m.sender_id];
      m.sender_role_color = role?.color || null;
      m.sender_role_name = role?.name || null;
    }

    // Batch-load reactions for all fetched messages
    const messageIds = messages.map(m => m.id);
    let reactionsMap = {};
    if (messageIds.length > 0) {
      const reactions = await query(
        `SELECT r.message_id, r.emoji, r.user_id, u.display_name
         FROM message_reactions r
         INNER JOIN users u ON u.id = r.user_id
         WHERE r.message_type = 'channel' AND r.message_id IN (${messageIds.map(() => '?').join(',')})`,
        messageIds
      );
      for (const r of reactions) {
        if (!reactionsMap[r.message_id]) reactionsMap[r.message_id] = {};
        if (!reactionsMap[r.message_id][r.emoji]) {
          reactionsMap[r.message_id][r.emoji] = { emoji: r.emoji, count: 0, users: [], userIds: [] };
        }
        reactionsMap[r.message_id][r.emoji].count++;
        reactionsMap[r.message_id][r.emoji].users.push(r.display_name);
        reactionsMap[r.message_id][r.emoji].userIds.push(r.user_id);
      }
    }

    // Transform and reverse for chronological order
    const result = messages.reverse().map((m) => {
      const baseMessage = {
        id: m.id,
        channel_id: m.channel_id,
        sender_id: m.sender_id,
        content: m.content,
        type: m.type,
        reply_to_id: m.reply_to_id,
        created_at: m.created_at,
        edited_at: m.edited_at,
        is_webhook: !!m.is_webhook,
        sender: m.is_webhook
          ? { id: null, display_name: m.webhook_name, avatar_url: m.webhook_avatar, is_webhook: true }
          : { id: m.sender_id, display_name: m.sender_name, avatar_url: m.sender_avatar,
              role_color: m.sender_role_color || null, role_name: m.sender_role_name || null,
              equipped_avatar_decoration_id: m.sender_avatar_decoration_id || null,
              equipped_nameplate_id: m.sender_nameplate_id || null },
        reactions: reactionsMap[m.id] ? Object.values(reactionsMap[m.id]) : []
      };
      
      // Generate attachment info for file/image messages
      if ((m.type === 'file' || m.type === 'image') && m.content?.startsWith('/uploads/')) {
        // Parse content: "URL||originalname||caption" or "URL||originalname" or just "URL"
        let fileUrl = m.content;
        let originalName = null;
        let caption = null;
        
        if (m.content.includes('||')) {
          const parts = m.content.split('||');
          fileUrl = parts[0];
          originalName = parts[1];
          if (parts[2]) caption = parts[2];
        }
        
        const storedFilename = fileUrl.split('/').pop();
        const ext = storedFilename.split('.').pop()?.toLowerCase() || '';
        
        if (!originalName && storedFilename) {
          const nameWithoutExt = storedFilename.replace(/\.[^.]+$/, '');
          const match = nameWithoutExt.match(/^\d+-\d+-(.+)$/);
          if (match && match[1]) {
            originalName = match[1].replace(/_/g, ' ') + (ext ? `.${ext}` : '');
          }
        }
        
        baseMessage.content = fileUrl;
        baseMessage.attachment = {
          file_name: originalName || storedFilename,
          file_url: fileUrl,
          mime_type: getMimeType(ext)
        };
        if (caption) baseMessage.caption = caption;
      }
      
      return baseMessage;
    });
    
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement messages' });
  }
});

// Helper function to get MIME type from extension
function getMimeType(ext) {
  const mimeTypes = {
    // Images
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 
    'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp', 'svg': 'image/svg+xml',
    // Documents
    'pdf': 'application/pdf', 'doc': 'application/msword', 
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Archives
    'zip': 'application/zip', 'rar': 'application/x-rar-compressed', 
    '7z': 'application/x-7z-compressed', 'tar': 'application/x-tar', 'gz': 'application/gzip',
    // Text
    'txt': 'text/plain', 'csv': 'text/csv', 'json': 'application/json',
    // Audio
    'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 
    'webm': 'audio/webm', 'm4a': 'audio/x-m4a', 'aac': 'audio/aac',
    // Video
    'mp4': 'video/mp4', 'avi': 'video/x-msvideo', 'mov': 'video/quicktime'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Helper to parse mentions from content (exported for webhooks)
export function parseMentions(content) {
  const mentions = [];
  // Match @username, @everyone, @channel
  const mentionRegex = /@(\w+)/g;
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    const name = match[1].toLowerCase();
    if (name === 'everyone') {
      mentions.push({ type: 'everyone', userId: null });
    } else if (name === 'channel') {
      mentions.push({ type: 'channel', userId: null });
    } else {
      // Will be resolved to user ID later
      mentions.push({ type: 'user', username: match[1] });
    }
  }
  return mentions;
}

router.post('/channel/:channelId', messageBurstLimit, messageRateLimit, validateMessage, async (req, res) => {
  try {
    const sourceSocketId = req.headers['x-socket-id'] ? String(req.headers['x-socket-id']) : null;
    const channel = await queryOne(
      'SELECT id, team_id, is_private, slowmode_seconds FROM channels WHERE id = ?',
      [req.params.channelId]
    );
    if (!channel) return res.status(404).json({ error: 'Canal non trouvé' });
    const teamMember = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [channel.team_id, req.user.id]
    );
    if (!teamMember) return res.status(404).json({ error: 'Canal non trouvé' });
    if (channel.is_private) {
      const cm = await queryOne(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [req.params.channelId, req.user.id]
      );
      if (!cm) return res.status(403).json({ error: 'Accès refusé' });
    }

    // ── Channel permission overrides: check send_messages ──────────────────
    // Owners/admins are exempt from channel-level restrictions
    if (!['owner', 'admin'].includes(teamMember.role)) {
      const userOverride = await queryOne(
        `SELECT deny_permissions FROM channel_permission_overrides
         WHERE channel_id = ? AND target_type = 'user' AND target_id = ?`,
        [req.params.channelId, req.user.id]
      );
      if (userOverride?.deny_permissions) {
        const raw = userOverride.deny_permissions;
        let denied = [];
        if (Array.isArray(raw)) denied = raw;
        else { try { denied = JSON.parse(raw) || []; } catch { denied = []; } }
        if (denied.includes('send_messages')) {
          return res.status(403).json({ error: 'Vous ne pouvez pas envoyer de messages ici' });
        }
      }
      // Check role-level overrides
      const userRoles = await query(
        `SELECT smr.role_id FROM server_member_roles smr WHERE smr.team_id = ? AND smr.user_id = ?`,
        [channel.team_id, req.user.id]
      );
      if (userRoles.length > 0) {
        const roleIds = userRoles.map(r => r.role_id);
        const placeholders = roleIds.map(() => '?').join(',');
        const roleOverride = await queryOne(
          `SELECT deny_permissions FROM channel_permission_overrides
           WHERE channel_id = ? AND target_type = 'role' AND target_id IN (${placeholders})
           AND JSON_CONTAINS(deny_permissions, '"send_messages"')
           LIMIT 1`,
          [req.params.channelId, ...roleIds]
        );
        if (roleOverride) {
          return res.status(403).json({ error: 'Vous ne pouvez pas envoyer de messages ici' });
        }
      }
    }

    const { content, type, replyToId } = req.body;

    // ── Slowmode enforcement (skip for slash commands) ──────────────────────
    const slowSecs = channel.slowmode_seconds || 0;
    const slowmodeKey = `${req.params.channelId}:${req.user.id}`;
    if (slowSecs > 0 && !['owner', 'admin'].includes(teamMember.role) && !isCommand(content)) {
      const lastSent = slowmodeLastSent.get(slowmodeKey) || 0;
      const elapsed = (Date.now() - lastSent) / 1000;
      if (elapsed < slowSecs) {
        const retryAfter = Math.ceil(slowSecs - elapsed);
        return res.status(429).json({ error: 'Slowmode actif', retryAfter });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // SLASH COMMANDS: Check if message is a command
    // ═══════════════════════════════════════════════════════════
    if (isCommand(content)) {
      const commandResult = await processCommand(content, req.user, { 
        teamId: channel.team_id,
        channelId: parseInt(req.params.channelId, 10)
      });
      
      if (commandResult) {
        // Send command response only to the executor (not broadcast)
        const io = getIO();
        if (io) {
          io.to(`user:${req.user.id}`).emit('command_response', {
            channelId: parseInt(req.params.channelId, 10),
            ...commandResult
          });
        }
        
        // Return command result without saving as a message
        return res.json({
          isCommand: true,
          ...commandResult
        });
      }
    }
    
    // Update slowmode tracker now that we're definitely inserting a message
    if (slowSecs > 0 && !['owner', 'admin'].includes(teamMember.role)) {
      slowmodeLastSent.set(slowmodeKey, Date.now());
    }

    // Content already validated by middleware
    const result = await query(
      'INSERT INTO channel_messages (channel_id, sender_id, content, type, reply_to_id) VALUES (?, ?, ?, ?, ?)',
      [
        req.params.channelId,
        req.user.id,
        content.trim(),
        type || 'text',
        replyToId || null,
      ]
    );
    
    // Fetch the inserted message and sender role immediately so we can broadcast
    // before the (potentially slow) mention-resolution queries run.
    const [msg, senderTopRole] = await Promise.all([
      queryOne(
        'SELECT id, channel_id, sender_id, content, type, reply_to_id, created_at FROM channel_messages WHERE id = ?',
        [result.insertId]
      ),
      queryOne(
        `SELECT sr.color, sr.name FROM server_roles sr
         INNER JOIN server_member_roles smr ON smr.role_id = sr.id
         WHERE smr.user_id = ? AND smr.team_id = ? AND sr.show_separately = TRUE
         ORDER BY sr.position DESC LIMIT 1`,
        [req.user.id, channel.team_id]
      ),
    ]);

    const sender = {
      id: req.user.id,
      display_name: req.user.display_name,
      avatar_url: req.user.avatar_url,
      role_color: senderTopRole?.color || null,
      role_name: senderTopRole?.name || null,
    };

    // Broadcast immediately — before mention processing so recipients see the message right away
    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit('channel_message', {
        channelId: parseInt(req.params.channelId, 10),
        message: { ...msg, sender },
        sourceSocketId,
      });
    }

    // Parse and store mentions (runs after broadcast so it doesn't delay delivery)
    const mentions = parseMentions(content);
    const mentionedUserIds = [];
    let hasMention = false;

    for (const mention of mentions) {
      if (mention.type === 'user' && mention.username) {
        const mentionedUser = await queryOne(
          'SELECT id FROM users WHERE LOWER(display_name) = LOWER(?) OR LOWER(username) = LOWER(?)',
          [mention.username, mention.username]
        );
        if (mentionedUser) {
          await query(
            'INSERT INTO message_mentions (message_type, message_id, mentioned_user_id, mention_type) VALUES (?, ?, ?, ?)',
            ['channel', result.insertId, mentionedUser.id, 'user']
          );
          mentionedUserIds.push(mentionedUser.id);
          hasMention = true;
          if (io) {
            io.to(`user:${mentionedUser.id}`).emit('user_mentioned', {
              channelId: parseInt(req.params.channelId, 10),
              messageId: result.insertId,
              mentionedBy: req.user.display_name,
            });
          }
        }
      } else if (mention.type === 'everyone' || mention.type === 'channel') {
        await query(
          'INSERT INTO message_mentions (message_type, message_id, mentioned_user_id, mention_type) VALUES (?, ?, ?, ?)',
          ['channel', result.insertId, null, mention.type]
        );
        hasMention = true;
        const teamMembers = await query(
          'SELECT user_id FROM team_members WHERE team_id = ? AND user_id != ?',
          [channel.team_id, req.user.id]
        );
        mentionedUserIds.push(...teamMembers.map(m => m.user_id));
      }
    }

    // Emit team unread update to all team members (for server badges)
    await emitTeamUnreadUpdate(channel.team_id, req.user.id, hasMention, mentionedUserIds);
    
    // Quest progress: send_message (daily) and send_message_weekly
    recordQuestAction(req.user.id, 'send_message').catch(() => {});
    recordQuestAction(req.user.id, 'send_message_weekly').catch(() => {});
    recordQuestAction(req.user.id, 'server_activities').catch(() => {});

    res.status(201).json({ ...msg, sender });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur envoi message' });
  }
});

// ═══════════════════════════════════════════════════════════
// Upload file/image to channel
// ═══════════════════════════════════════════════════════════
router.post('/channel/:channelId/upload', messageBurstLimit, uploadRateLimit, handleUpload, async (req, res) => {
  try {
    const sourceSocketId = req.headers['x-socket-id'] ? String(req.headers['x-socket-id']) : null;
    const channelId = parseInt(req.params.channelId, 10);
    
    // Verify channel access
    const channel = await queryOne(
      'SELECT id, team_id, is_private FROM channels WHERE id = ?',
      [channelId]
    );
    if (!channel) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Canal non trouvé' });
    }
    
    const teamMember = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [channel.team_id, req.user.id]
    );
    if (!teamMember) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Canal non trouvé' });
    }

    if (channel.is_private) {
      const cm = await queryOne(
        'SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?',
        [channelId, req.user.id]
      );
      if (!cm) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    // Check attach_files channel permission override (owners/admins exempt)
    if (!['owner', 'admin'].includes(teamMember.role)) {
      const parsePerms = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v;
        try { return JSON.parse(v); } catch { return []; }
      };
      const userOv = await queryOne(
        `SELECT deny_permissions FROM channel_permission_overrides
         WHERE channel_id = ? AND target_type = 'user' AND target_id = ?`,
        [channelId, req.user.id]
      );
      if (userOv) {
        const denied = parsePerms(userOv.deny_permissions);
        if (denied.includes('send_messages') || denied.includes('attach_files')) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(403).json({ error: 'Vous ne pouvez pas envoyer de fichiers ici' });
        }
      }
      const userRoles = await query(
        'SELECT role_id FROM server_member_roles WHERE team_id = ? AND user_id = ?',
        [channel.team_id, req.user.id]
      );
      if (userRoles.length > 0) {
        const roleIds = userRoles.map(r => r.role_id);
        const placeholders = roleIds.map(() => '?').join(',');
        const roleOv = await queryOne(
          `SELECT 1 FROM channel_permission_overrides
           WHERE channel_id = ? AND target_type = 'role' AND target_id IN (${placeholders})
           AND (JSON_CONTAINS(deny_permissions, '"send_messages"') OR JSON_CONTAINS(deny_permissions, '"attach_files"'))
           LIMIT 1`,
          [channelId, ...roleIds]
        );
        if (roleOv) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(403).json({ error: 'Vous ne pouvez pas envoyer de fichiers ici' });
        }
      }
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Subscription-based file size limit
    const FREE_LIMIT  = 8  * 1024 * 1024; // 8 MB
    const NITRO_LIMIT = 25 * 1024 * 1024; // 25 MB
    const sizeLimit = req.user.has_nitro ? NITRO_LIMIT : FREE_LIMIT;
    if (req.file.size > sizeLimit) {
      fs.unlinkSync(req.file.path);
      const limitMb = req.user.has_nitro ? '25' : '8';
      return res.status(413).json({
        error: `Fichier trop volumineux. Limite : ${limitMb} Mo${req.user.has_nitro ? '' : ' (upgrade vers Nitro pour 25 Mo)'}`,
        limitMb: parseInt(limitMb, 10),
        hasNitro: !!req.user.has_nitro,
      });
    }

    let file = req.file;
    const caption = req.body.caption?.trim() || null;
    const isImage = file.mimetype.startsWith('image/');
    const messageType = isImage ? 'image' : 'file';

    // Optimize images (resize + compression)
    if (isImage) {
      try {
        const optimized = await optimizeImage(file.path, presets.message);
        file = { ...file, path: optimized.path, filename: optimized.filename, size: optimized.size, mimetype: optimized.mimetype };
      } catch (e) {
        console.error('[Upload] Image optimization error:', e.message);
      }
    }
    const fileUrl = `/uploads/${file.filename}`;
    
    // Store URL, original filename, and optional caption separated by ||
    const contentParts = [fileUrl, file.originalname];
    if (caption) contentParts.push(caption);
    const contentWithFilename = contentParts.join('||');
    
    const result = await query(
      'INSERT INTO channel_messages (channel_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
      [channelId, req.user.id, contentWithFilename, messageType]
    );
    
    const msg = await queryOne(
      'SELECT id, channel_id, sender_id, content, type, reply_to_id, created_at FROM channel_messages WHERE id = ?',
      [result.insertId]
    );
    
    const sender = {
      id: req.user.id,
      display_name: req.user.display_name,
      avatar_url: req.user.avatar_url,
    };
    
    const fullMessage = {
      ...msg,
      content: fileUrl,
      sender,
      attachment: {
        file_name: file.originalname,
        file_url: fileUrl,
        file_size: file.size,
        mime_type: file.mimetype,
      },
      caption,
    };
    
    // Emit to channel (wrap in { channelId, message } format expected by frontend)
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('channel_message', {
        channelId,
        message: fullMessage,
        sourceSocketId,
      });
    }
    
    // Emit team unread update to all team members (for server badges)
    await emitTeamUnreadUpdate(channel.team_id, req.user.id, false, []);
    
    recordQuestAction(req.user.id, 'send_message').catch(() => {});
    recordQuestAction(req.user.id, 'send_message_weekly').catch(() => {});
    recordQuestAction(req.user.id, 'server_activities').catch(() => {});

    res.status(201).json(fullMessage);
  } catch (err) {
    console.error('Erreur upload channel:', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Erreur upload fichier' });
  }
});

// Edit a channel message (allowed for sender only, no time limit)
router.patch('/channel/:channelId/:messageId', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    
    const message = await queryOne(
      'SELECT id, sender_id, type, content, is_webhook FROM channel_messages WHERE id = ? AND channel_id = ?',
      [messageId, channelId]
    );
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });
    if (message.is_webhook) {
      return res.status(403).json({ error: 'Les messages webhook ne peuvent pas être modifiés' });
    }
    if (message.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que vos propres messages' });
    }
    
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Contenu requis' });
    
    let newContent = content.trim();
    if (message.type === 'image' || message.type === 'file') {
      // Update caption only; keep URL and filename
      const parts = (message.content || '').split('||');
      const fileUrl = parts[0] || message.content || '';
      const originalName = parts[1] || fileUrl.split('/').pop() || 'file';
      const originalCaption = (parts[2] || '').trim();
      if (originalCaption === newContent) {
        // No change - return existing message without marking as edited
        const existing = await queryOne(
          'SELECT id, channel_id, sender_id, content, type, reply_to_id, created_at, edited_at FROM channel_messages WHERE id = ?',
          [messageId]
        );
        let resp = existing;
        if ((existing.type === 'image' || existing.type === 'file') && existing.content?.includes('||')) {
          const p = existing.content.split('||');
          resp = { ...existing, content: p[0], caption: p[2] || null, attachment: { file_url: p[0], file_name: p[1] || p[0].split('/').pop(), mime_type: getMimeType((p[1] || p[0]).split('.').pop()?.toLowerCase() || '') } };
        }
        return res.json(resp);
      }
      newContent = [fileUrl, originalName, newContent].join('||');
    } else if ((message.content || '').trim() === newContent) {
      // No change for text - return existing message without marking as edited
      const existing = await queryOne(
        'SELECT id, channel_id, sender_id, content, type, reply_to_id, created_at, edited_at FROM channel_messages WHERE id = ?',
        [messageId]
      );
      return res.json(existing);
    }
    
    await query('UPDATE channel_messages SET content = ?, edited_at = NOW() WHERE id = ?', [newContent, messageId]);
    
    const updatedMsg = await queryOne(
      'SELECT id, channel_id, sender_id, content, type, reply_to_id, created_at, edited_at FROM channel_messages WHERE id = ?',
      [messageId]
    );
    
    // Build response with parsed content/caption for image/file
    let responseMsg = updatedMsg;
    if ((updatedMsg.type === 'image' || updatedMsg.type === 'file') && updatedMsg.content?.includes('||')) {
      const parts = updatedMsg.content.split('||');
      responseMsg = {
        ...updatedMsg,
        content: parts[0],
        caption: parts[2] || null,
        attachment: {
          file_url: parts[0],
          file_name: parts[1] || parts[0].split('/').pop(),
          mime_type: getMimeType((parts[1] || parts[0]).split('.').pop()?.toLowerCase() || '')
        }
      };
    }
    
    // Emit message_edited to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('message_edited', {
        channelId,
        message: responseMsg
      });
    }
    
    res.json(responseMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur modification message' });
  }
});

// Delete a channel message (sender can always delete their own; manage_messages allows deleting others)
router.delete('/channel/:channelId/:messageId', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);

    const message = await queryOne(
      'SELECT cm.id, cm.sender_id, c.team_id FROM channel_messages cm INNER JOIN channels c ON c.id = cm.channel_id WHERE cm.id = ? AND cm.channel_id = ?',
      [messageId, channelId]
    );
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });

    if (message.sender_id !== req.user.id) {
      // Allow if owner/admin or if the user has perm_manage_messages
      const teamMember = await queryOne(
        'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
        [message.team_id, req.user.id]
      );
      const isPrivileged = teamMember && ['owner', 'admin'].includes(teamMember.role);
      const canManage = isPrivileged || await hasPermission(req.user.id, message.team_id, 'manage_messages');
      if (!canManage) {
        return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres messages' });
      }
    }
    
    await query('DELETE FROM channel_messages WHERE id = ?', [messageId]);
    
    // Emit message_deleted to all users in the channel
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('message_deleted', {
        channelId,
        messageId
      });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur suppression message' });
  }
});

// Hide a channel message for current user only (delete for me) - own messages only
router.post('/channel/:channelId/:messageId/hide', async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    const channelId = parseInt(req.params.channelId, 10);
    
    const msg = await queryOne(
      'SELECT sender_id FROM channel_messages WHERE id = ? AND channel_id = ?',
      [messageId, channelId]
    );
    if (!msg) return res.status(404).json({ error: 'Message non trouvé' });
    if (msg.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Vous ne pouvez masquer que vos propres messages' });
    }
    
    await query(
      'INSERT IGNORE INTO hidden_messages (user_id, message_type, message_id) VALUES (?, ?, ?)',
      [req.user.id, 'channel', messageId]
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur masquage message' });
  }
});

// Mass delete channel messages for everyone (sender only, max 100)
router.post('/channel/:channelId/mass-delete', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const { messageIds } = req.body;
    
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'Liste de messages requise' });
    }
    if (messageIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 messages à la fois' });
    }
    
    // Verify all messages belong to the sender
    const placeholders = messageIds.map(() => '?').join(',');
    const messages = await query(
      `SELECT id, sender_id FROM channel_messages WHERE id IN (${placeholders}) AND channel_id = ?`,
      [...messageIds, channelId]
    );
    
    const ownMessages = messages.filter(m => m.sender_id === req.user.id);
    if (ownMessages.length === 0) {
      return res.status(400).json({ error: 'Aucun message à supprimer' });
    }
    
    const ownIds = ownMessages.map(m => m.id);
    const ownPlaceholders = ownIds.map(() => '?').join(',');
    
    await query(`DELETE FROM channel_messages WHERE id IN (${ownPlaceholders})`, ownIds);
    
    // Emit deletion for each message
    const io = getIO();
    if (io) {
      ownIds.forEach(id => {
        io.to(`channel:${channelId}`).emit('message_deleted', { channelId, messageId: id });
      });
    }
    
    res.json({ ok: true, deleted: ownIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur suppression messages' });
  }
});

// Mass hide channel messages for current user only (max 100) - own messages only
router.post('/channel/:channelId/mass-hide', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const { messageIds } = req.body;
    
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ error: 'Liste de messages requise' });
    }
    if (messageIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 messages à la fois' });
    }
    
    const placeholders = messageIds.map(() => '?').join(',');
    const ownMessages = await query(
      `SELECT id FROM channel_messages WHERE id IN (${placeholders}) AND channel_id = ? AND sender_id = ?`,
      [...messageIds, channelId, req.user.id]
    );
    const ownIds = ownMessages.map(m => m.id);
    
    for (const msgId of ownIds) {
      await query('INSERT IGNORE INTO hidden_messages (user_id, message_type, message_id) VALUES (?, ?, ?)', [req.user.id, 'channel', msgId]);
    }
    
    res.json({ ok: true, hidden: ownIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur masquage messages' });
  }
});

// ═══════════════════════════════════════════════════════════
// REACTIONS - Add/remove emoji reactions to channel messages
// ═══════════════════════════════════════════════════════════

// Get reactions for a message
router.get('/channel/:channelId/:messageId/reactions', async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    
    const reactions = await query(
      `SELECT r.emoji, r.user_id, u.display_name
       FROM message_reactions r
       INNER JOIN users u ON u.id = r.user_id
       WHERE r.message_type = 'channel' AND r.message_id = ?`,
      [messageId]
    );
    
    // Group by emoji
    const grouped = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { emoji: r.emoji, count: 0, users: [], userIds: [] };
      }
      grouped[r.emoji].count++;
      grouped[r.emoji].users.push(r.display_name);
      grouped[r.emoji].userIds.push(r.user_id);
    }
    
    res.json(Object.values(grouped));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement réactions' });
  }
});

// Add a reaction
router.post('/channel/:channelId/:messageId/reactions', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    const { emoji } = req.body;
    
    if (!emoji || typeof emoji !== 'string' || emoji.length > 32) {
      return res.status(400).json({ error: 'Emoji invalide' });
    }
    
    // Verify message exists and get team_id for permission check
    const message = await queryOne(
      `SELECT cm.id, c.team_id FROM channel_messages cm
       JOIN channels c ON c.id = cm.channel_id
       WHERE cm.id = ? AND cm.channel_id = ?`,
      [messageId, channelId]
    );
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });

    // Check add_reactions channel permission override (owners/admins exempt)
    const reactMember = await queryOne(
      'SELECT role FROM team_members WHERE team_id = ? AND user_id = ?',
      [message.team_id, req.user.id]
    );
    if (reactMember && !['owner', 'admin'].includes(reactMember.role)) {
      const userOv = await queryOne(
        `SELECT deny_permissions FROM channel_permission_overrides
         WHERE channel_id = ? AND target_type = 'user' AND target_id = ?`,
        [channelId, req.user.id]
      );
      if (userOv?.deny_permissions) {
        const raw = userOv.deny_permissions;
        let denied = [];
        if (Array.isArray(raw)) denied = raw;
        else { try { denied = JSON.parse(raw) || []; } catch { denied = []; } }
        if (denied.includes('add_reactions')) {
          return res.status(403).json({ error: 'Vous ne pouvez pas réagir ici' });
        }
      }
      const userRoles = await query(
        'SELECT role_id FROM server_member_roles WHERE team_id = ? AND user_id = ?',
        [message.team_id, req.user.id]
      );
      if (userRoles.length > 0) {
        const rIds = userRoles.map(r => r.role_id);
        const ph = rIds.map(() => '?').join(',');
        const roleOv = await queryOne(
          `SELECT 1 FROM channel_permission_overrides
           WHERE channel_id = ? AND target_type = 'role' AND target_id IN (${ph})
           AND JSON_CONTAINS(deny_permissions, '"add_reactions"') LIMIT 1`,
          [channelId, ...rIds]
        );
        if (roleOv) return res.status(403).json({ error: 'Vous ne pouvez pas réagir ici' });
      }
    }

    const insResult = await query(
      'INSERT IGNORE INTO message_reactions (message_type, message_id, user_id, emoji) VALUES (?, ?, ?, ?)',
      ['channel', messageId, req.user.id, emoji]
    );
    if (insResult?.affectedRows > 0) {
      recordQuestAction(req.user.id, 'add_reaction').catch(() => {});
      recordQuestAction(req.user.id, 'server_activities').catch(() => {});
    }
    
    // Emit to channel
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('reaction_added', {
        channelId,
        messageId,
        emoji,
        userId: req.user.id,
        displayName: req.user.display_name
      });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur ajout réaction' });
  }
});

// Remove a reaction
router.delete('/channel/:channelId/:messageId/reactions/:emoji', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);
    const emoji = decodeURIComponent(req.params.emoji);

    const requestedUserId = req.query.userId != null ? parseInt(req.query.userId, 10) : req.user.id;
    if (!Number.isInteger(requestedUserId) || requestedUserId <= 0) {
      return res.status(400).json({ error: 'userId invalide' });
    }

    // By default users can only remove their own reactions.
    // Removing someone else's reaction requires moderation rights.
    if (requestedUserId !== req.user.id) {
      const membership = await queryOne(
        `SELECT tm.role, c.team_id
         FROM channels c
         LEFT JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = ?
         WHERE c.id = ?`,
        [req.user.id, channelId]
      );
      if (!membership?.role) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
      const isPrivileged = ['owner', 'admin'].includes(membership.role);
      const canManage = isPrivileged || await hasPermission(req.user.id, membership.team_id, 'manage_messages');
      if (!canManage) {
        return res.status(403).json({ error: 'Permissions insuffisantes' });
      }
    }

    const delResult = await query(
      'DELETE FROM message_reactions WHERE message_type = ? AND message_id = ? AND user_id = ? AND emoji = ?',
      ['channel', messageId, requestedUserId, emoji]
    );

    if (delResult?.affectedRows > 0) {
      // Emit to channel
      const io = getIO();
      if (io) {
        io.to(`channel:${channelId}`).emit('reaction_removed', {
          channelId,
          messageId,
          emoji,
          userId: requestedUserId
        });
      }
    }

    res.json({ ok: true, removed: delResult?.affectedRows || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur suppression réaction' });
  }
});

// ═══════════════════════════════════════════════════════════
// PINNED MESSAGES - Pin/unpin messages in a channel
// ═══════════════════════════════════════════════════════════

// Get pinned messages for a channel
router.get('/channel/:channelId/pinned', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    
    const pinnedMessages = await query(
      `SELECT m.id, m.channel_id, m.sender_id, m.content, m.type, m.created_at,
              u.display_name as sender_name, u.avatar_url as sender_avatar,
              p.pinned_at, p.pinned_by,
              pu.display_name as pinned_by_name
       FROM pinned_messages p
       INNER JOIN channel_messages m ON m.id = p.message_id
       INNER JOIN users u ON u.id = m.sender_id
       INNER JOIN users pu ON pu.id = p.pinned_by
       WHERE p.message_type = 'channel' AND p.context_id = ?
       ORDER BY p.pinned_at DESC`,
      [channelId]
    );
    
    const result = pinnedMessages.map(m => ({
      id: m.id,
      channel_id: m.channel_id,
      sender_id: m.sender_id,
      content: m.content,
      type: m.type,
      created_at: m.created_at,
      pinned_at: m.pinned_at,
      pinned_by: m.pinned_by,
      pinned_by_name: m.pinned_by_name,
      sender: {
        id: m.sender_id,
        display_name: m.sender_name,
        avatar_url: m.sender_avatar
      }
    }));
    
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur chargement messages épinglés' });
  }
});

// Pin a message
router.post('/channel/:channelId/:messageId/pin', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);

    // Verify message exists AND requester is a team member
    const message = await queryOne(
      `SELECT cm.id FROM channel_messages cm
       JOIN channels c ON c.id = cm.channel_id
       JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = ?
       WHERE cm.id = ? AND cm.channel_id = ?`,
      [req.user.id, messageId, channelId]
    );
    if (!message) return res.status(404).json({ error: 'Message non trouvé' });

    // INSERT IGNORE avoids TOCTOU race and duplicate-key errors
    const result = await query(
      'INSERT IGNORE INTO pinned_messages (message_type, message_id, context_id, pinned_by) VALUES (?, ?, ?, ?)',
      ['channel', messageId, channelId, req.user.id]
    );
    if (!result?.affectedRows) return res.status(400).json({ error: 'Message déjà épinglé' });
    
    // Emit to channel
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('message_pinned', {
        channelId,
        messageId,
        pinnedBy: req.user.id,
        pinnedByName: req.user.display_name
      });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur épinglage message' });
  }
});

// Unpin a message
router.delete('/channel/:channelId/:messageId/pin', async (req, res) => {
  try {
    const channelId = parseInt(req.params.channelId, 10);
    const messageId = parseInt(req.params.messageId, 10);

    // Verify requester is a team member before allowing unpin
    const membership = await queryOne(
      `SELECT 1 FROM channels c
       JOIN team_members tm ON tm.team_id = c.team_id AND tm.user_id = ?
       WHERE c.id = ?`,
      [req.user.id, channelId]
    );
    if (!membership) return res.status(403).json({ error: 'Accès refusé' });

    await query(
      'DELETE FROM pinned_messages WHERE message_type = ? AND message_id = ?',
      ['channel', messageId]
    );
    
    // Emit to channel
    const io = getIO();
    if (io) {
      io.to(`channel:${channelId}`).emit('message_unpinned', {
        channelId,
        messageId
      });
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur désépinglage message' });
  }
});

export default router;
