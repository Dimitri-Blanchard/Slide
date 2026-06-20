/** Discord-style app routes: public snowflake IDs in URLs, internal ints for APIs. */

function encodeRouteId(id) {
  if (id == null || id === '') return '';
  return encodeURIComponent(String(id));
}

export function conversationRouteId(conv) {
  if (!conv) return '';
  return String(conv.public_id ?? conv.conversation_id ?? conv.id ?? '');
}

export function teamRouteId(team) {
  if (!team) return '';
  return String(team.public_id ?? team.id ?? '');
}

export function channelRouteId(channel) {
  if (!channel) return '';
  return String(channel.public_id ?? channel.id ?? '');
}

export function dmPath(conversation) {
  const id = conversationRouteId(conversation);
  return id ? `/channels/@me/${encodeRouteId(id)}` : '/channels/@me';
}

export function serverPath(team) {
  const id = teamRouteId(team);
  return id ? `/channels/${encodeRouteId(id)}` : '/channels/@me';
}

export function serverChannelPath(team, channel) {
  const chId = channelRouteId(channel);
  return chId ? `${serverPath(team)}/${encodeRouteId(chId)}` : serverPath(team);
}

export function serverSettingsPath(team) {
  return `${serverPath(team)}/settings`;
}

export function channelSettingsPath(team, channel) {
  return `${serverChannelPath(team, channel)}/settings`;
}

export function resolveTeamInternalId(teams, routeId) {
  if (routeId == null || routeId === '' || !Array.isArray(teams)) return null;
  const s = String(routeId);
  const byPublic = teams.find((t) => t && String(t.public_id) === s);
  if (byPublic) return byPublic.id;
  const byInternal = teams.find((t) => t && String(t.id) === s);
  return byInternal?.id ?? null;
}

export function resolveConversationInternalId(conversations, routeId) {
  if (routeId == null || routeId === '' || !Array.isArray(conversations)) return null;
  const s = String(routeId);
  const byPublic = conversations.find((c) => c && String(c.public_id) === s);
  if (byPublic) return byPublic.conversation_id ?? byPublic.id;
  const byInternal = conversations.find(
    (c) => c && (String(c.conversation_id) === s || String(c.id) === s),
  );
  return byInternal?.conversation_id ?? byInternal?.id ?? null;
}

export function resolveChannelInternalId(channels, routeId) {
  if (routeId == null || routeId === '' || !Array.isArray(channels)) return null;
  const s = String(routeId);
  const byPublic = channels.find((c) => c && String(c.public_id) === s);
  if (byPublic) return byPublic.id;
  const byInternal = channels.find((c) => c && String(c.id) === s);
  return byInternal?.id ?? null;
}

export function findChannelByRouteId(channels, routeId) {
  if (routeId == null || routeId === '' || !Array.isArray(channels)) return null;
  const s = String(routeId);
  return channels.find((c) => c && (String(c.public_id) === s || String(c.id) === s)) ?? null;
}

export function parseAppRoute(pathname) {
  const path = (pathname || '').replace(/\/+$/, '') || '/';

  let m = path.match(/^\/channels\/@me\/private-local\/([^/]+)$/);
  if (m) {
    return { kind: 'localPrivate', peerUserId: decodeURIComponent(m[1]) };
  }

  m = path.match(/^\/channels\/@me\/([^/]+)$/);
  if (m) {
    return { kind: 'dm', conversationPublicId: decodeURIComponent(m[1]) };
  }

  if (path === '/channels/@me') {
    return { kind: 'dmHome' };
  }

  m = path.match(/^\/channels\/([^/]+)\/([^/]+)\/settings$/);
  if (m && m[1] !== '@me') {
    return {
      kind: 'channelSettings',
      teamPublicId: decodeURIComponent(m[1]),
      channelPublicId: decodeURIComponent(m[2]),
    };
  }

  m = path.match(/^\/channels\/([^/]+)\/settings$/);
  if (m && m[1] !== '@me') {
    return { kind: 'serverSettings', teamPublicId: decodeURIComponent(m[1]) };
  }

  m = path.match(/^\/channels\/([^/]+)\/([^/]+)$/);
  if (m && m[1] !== '@me') {
    return {
      kind: 'serverChannel',
      teamPublicId: decodeURIComponent(m[1]),
      channelPublicId: decodeURIComponent(m[2]),
    };
  }

  m = path.match(/^\/channels\/([^/]+)$/);
  if (m && m[1] !== '@me') {
    return { kind: 'server', teamPublicId: decodeURIComponent(m[1]) };
  }

  m = path.match(/^\/team\/(\d+)\/channel\/(\d+)\/settings$/);
  if (m) {
    return {
      kind: 'channelSettings',
      legacy: true,
      teamPublicId: m[1],
      channelPublicId: m[2],
    };
  }

  m = path.match(/^\/team\/(\d+)\/channel\/(\d+)$/);
  if (m) {
    return {
      kind: 'serverChannel',
      legacy: true,
      teamPublicId: m[1],
      channelPublicId: m[2],
    };
  }

  m = path.match(/^\/team\/(\d+)\/settings$/);
  if (m) {
    return { kind: 'serverSettings', legacy: true, teamPublicId: m[1] };
  }

  m = path.match(/^\/team\/(\d+)$/);
  if (m) {
    return { kind: 'server', legacy: true, teamPublicId: m[1] };
  }

  m = path.match(/^\/team\/(\d+)\/(.+)$/);
  if (m) {
    const rest = m[2];
    const chMatch = rest.match(/^channel\/(\d+)(?:\/(.*))?$/);
    if (chMatch) {
      if (chMatch[2] === 'settings') {
        return {
          kind: 'channelSettings',
          legacy: true,
          teamPublicId: m[1],
          channelPublicId: chMatch[1],
        };
      }
      return {
        kind: 'serverChannel',
        legacy: true,
        teamPublicId: m[1],
        channelPublicId: chMatch[1],
      };
    }
    if (rest === 'settings') {
      return { kind: 'serverSettings', legacy: true, teamPublicId: m[1] };
    }
    return { kind: 'server', legacy: true, teamPublicId: m[1], subpath: rest };
  }

  return { kind: 'other' };
}

export function canonicalPathForRoute(route, { teams = [], conversations = [] } = {}) {
  if (!route || route.kind === 'other' || route.kind === 'localPrivate' || route.kind === 'dmHome') {
    return null;
  }

  if (route.kind === 'dm') {
    const conv = conversations.find(
      (c) => String(c.public_id) === String(route.conversationPublicId)
        || String(c.conversation_id) === String(route.conversationPublicId)
        || String(c.id) === String(route.conversationPublicId),
    );
    if (!conv?.public_id) return null;
    const canonical = dmPath(conv);
    if (canonical.endsWith(`/${encodeRouteId(route.conversationPublicId)}`)) return null;
    return canonical;
  }

  const teamInternal = resolveTeamInternalId(teams, route.teamPublicId);
  if (teamInternal == null) return null;
  const team = teams.find((t) => String(t.id) === String(teamInternal));
  if (!team?.public_id) return null;

  const teamLegacy = String(route.teamPublicId) !== String(team.public_id);

  if (route.kind === 'serverSettings') {
    return teamLegacy ? serverSettingsPath(team) : null;
  }

  if (route.kind === 'server' && !route.subpath) {
    return teamLegacy ? serverPath(team) : null;
  }

  if (route.legacy && route.kind === 'server') {
    return serverPath(team);
  }

  // Channel legacy IDs are canonicalized in TeamChat once channels are loaded.
  return null;
}
