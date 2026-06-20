/**
 * Discord-style app URLs using public snowflake IDs (not internal DB ids).
 *
 * DM:      /channels/@me/:conversationPublicId
 * Server:  /channels/:teamPublicId/:channelPublicId
 * Server home (no channel): /channels/:teamPublicId
 */

const NUMERIC_ID = /^\d+$/;

/** Route segment id: snowflake public_id or legacy internal id. */
export function isRouteId(value) {
  return value != null && NUMERIC_ID.test(String(value));
}

export function conversationRouteId(conversation) {
  if (!conversation) return null;
  return String(conversation.public_id ?? conversation.conversation_id ?? conversation.id ?? '');
}

export function teamRouteId(team) {
  if (!team) return null;
  return String(team.public_id ?? team.id ?? '');
}

export function channelRouteId(channel) {
  if (!channel) return null;
  return String(channel.public_id ?? channel.id ?? '');
}

export function dmPath(conversation) {
  const id = conversationRouteId(conversation);
  return id ? `/channels/@me/${id}` : '/channels/@me';
}

export function serverPath(team) {
  const id = teamRouteId(team);
  return id ? `/channels/${id}` : '/channels/@me';
}

export function serverChannelPath(team, channel) {
  const teamId = teamRouteId(typeof team === 'object' ? team : { id: team });
  const channelId = channelRouteId(typeof channel === 'object' ? channel : { id: channel });
  if (!teamId || !channelId) return serverPath(team);
  return `/channels/${teamId}/${channelId}`;
}

export function serverSettingsPath(team) {
  const id = teamRouteId(team);
  return id ? `/channels/${id}/settings` : '/channels/@me';
}

export function channelSettingsPath(team, channel) {
  const teamId = teamRouteId(team);
  const channelId = channelRouteId(channel);
  if (!teamId || !channelId) return serverSettingsPath(team);
  return `/channels/${teamId}/${channelId}/settings`;
}

export function findTeamByRouteId(teams, routeId) {
  if (!routeId || !Array.isArray(teams)) return null;
  const key = String(routeId);
  return teams.find((t) => String(t.public_id) === key || String(t.id) === key) ?? null;
}

export function findChannelByRouteId(channels, routeId) {
  if (!routeId || !Array.isArray(channels)) return null;
  const key = String(routeId);
  return channels.find((c) => String(c.public_id) === key || String(c.id) === key) ?? null;
}

export function findConversationByRouteId(conversations, routeId) {
  if (!routeId || !Array.isArray(conversations)) return null;
  const key = String(routeId);
  return conversations.find(
    (c) => String(c.public_id) === key || String(c.conversation_id) === key || String(c.id) === key,
  ) ?? null;
}

export function resolveTeamInternalId(teams, routeId) {
  const team = findTeamByRouteId(teams, routeId);
  return team?.id ?? null;
}

export function resolveChannelInternalId(channels, routeId) {
  const channel = findChannelByRouteId(channels, routeId);
  return channel?.id ?? null;
}

export function resolveConversationInternalId(conversations, routeId) {
  const conv = findConversationByRouteId(conversations, routeId);
  return conv?.conversation_id ?? conv?.id ?? null;
}

/** Parse pathname into route segments (supports legacy /team/ paths). */
export function parseAppRoute(pathname) {
  const path = pathname || '';

  const localPrivate = path.match(/\/channels\/@me\/private-local\/([^/]+)/);
  if (localPrivate) {
    return {
      kind: 'localPrivate',
      peerUserId: decodeURIComponent(localPrivate[1]),
    };
  }

  const dm = path.match(/\/channels\/@me\/(\d+)/);
  if (dm) {
    return { kind: 'dm', conversationPublicId: dm[1] };
  }

  const channelSettings = path.match(/\/channels\/(\d+)\/(\d+)\/settings/);
  if (channelSettings) {
    return {
      kind: 'channelSettings',
      teamPublicId: channelSettings[1],
      channelPublicId: channelSettings[2],
    };
  }

  const serverSettings = path.match(/\/channels\/(\d+)\/settings/);
  if (serverSettings) {
    return { kind: 'serverSettings', teamPublicId: serverSettings[1] };
  }

  const serverChannel = path.match(/\/channels\/(\d+)\/(\d+)/);
  if (serverChannel) {
    return {
      kind: 'serverChannel',
      teamPublicId: serverChannel[1],
      channelPublicId: serverChannel[2],
    };
  }

  const server = path.match(/\/channels\/(\d+)\/?$/);
  if (server) {
    return { kind: 'server', teamPublicId: server[1] };
  }

  // Legacy /team/… URLs (bookmarks)
  const legacyChannelSettings = path.match(/\/team\/(\d+)\/channel\/(\d+)\/settings/);
  if (legacyChannelSettings) {
    return {
      kind: 'channelSettings',
      teamPublicId: legacyChannelSettings[1],
      channelPublicId: legacyChannelSettings[2],
      legacy: true,
    };
  }

  const legacyServerSettings = path.match(/\/team\/(\d+)\/settings/);
  if (legacyServerSettings) {
    return { kind: 'serverSettings', teamPublicId: legacyServerSettings[1], legacy: true };
  }

  const legacyChannel = path.match(/\/team\/(\d+)\/channel\/(\d+)/);
  if (legacyChannel) {
    return {
      kind: 'serverChannel',
      teamPublicId: legacyChannel[1],
      channelPublicId: legacyChannel[2],
      legacy: true,
    };
  }

  const legacyServer = path.match(/\/team\/(\d+)\/?$/);
  if (legacyServer) {
    return { kind: 'server', teamPublicId: legacyServer[1], legacy: true };
  }

  return { kind: 'other' };
}

/** Canonical Discord-style path for current route (without /docs prefix). */
export function canonicalPathForRoute(route, { teams = [], conversations = [] } = {}) {
  if (!route || route.kind === 'other' || route.kind === 'localPrivate') return null;

  if (route.kind === 'dm') {
    const conv = findConversationByRouteId(conversations, route.conversationPublicId);
    return conv ? dmPath(conv) : `/channels/@me/${route.conversationPublicId}`;
  }

  const team = findTeamByRouteId(teams, route.teamPublicId);
  if (!team) return null;

  if (route.kind === 'server') return serverPath(team);
  if (route.kind === 'serverSettings') return serverSettingsPath(team);

  if (route.kind === 'serverChannel' || route.kind === 'channelSettings') {
    // Channel may not be loaded yet — use route ids when they look like snowflakes
    const routeChannelId = route.channelPublicId;
    const channel = { public_id: routeChannelId, id: routeChannelId };
    if (route.kind === 'channelSettings') return channelSettingsPath(team, channel);
    return serverChannelPath(team, channel);
  }

  return null;
}

export function isLegacyInternalRouteId(routeId) {
  if (!isRouteId(routeId)) return false;
  const n = BigInt(routeId);
  // Internal auto-increment ids stay small; snowflakes are much larger.
  return n < BigInt(1_000_000_000_000);
}
