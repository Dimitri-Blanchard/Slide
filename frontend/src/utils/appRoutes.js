/** Client routes for servers (/channels/:serverId/:channelId) and DMs (/channels/@me/...). */

export function serverPath(teamId) {
  return `/channels/${teamId}`;
}

export function serverChannelPath(teamId, channelId) {
  return `/channels/${teamId}/${channelId}`;
}

export function serverSettingsPath(teamId) {
  return `/channels/${teamId}/settings`;
}

export function serverChannelSettingsPath(teamId, channelId) {
  return `/channels/${teamId}/${channelId}/settings`;
}

export function dmPath(conversationId) {
  return conversationId ? `/channels/@me/${conversationId}` : '/channels/@me';
}

/** Parse server/channel ids from pathname (excludes @me DMs). */
export function parseServerRouteParams(pathname) {
  if (!pathname || pathname.startsWith('/channels/@me')) {
    return { teamId: null, channelId: null };
  }
  const teamMatch = pathname.match(/^\/channels\/(\d+)/);
  if (!teamMatch) return { teamId: null, channelId: null };
  const teamId = teamMatch[1];
  const channelSettingsMatch = pathname.match(/^\/channels\/\d+\/(\d+)\/settings/);
  const channelMatch = pathname.match(/^\/channels\/\d+\/(\d+)(?:\/|$|\?)/);
  const channelId = channelSettingsMatch?.[1] || channelMatch?.[1] || null;
  return { teamId, channelId };
}

/** Map legacy /team/... URLs to /channels/... */
export function legacyTeamPathToChannels(pathname) {
  if (!pathname) return null;
  const channelSettings = pathname.match(/^\/team\/(\d+)\/channel\/(\d+)\/settings(.*)$/);
  if (channelSettings) {
    return `/channels/${channelSettings[1]}/${channelSettings[2]}/settings${channelSettings[3] || ''}`;
  }
  const channel = pathname.match(/^\/team\/(\d+)\/channel\/(\d+)(.*)$/);
  if (channel) {
    return `/channels/${channel[1]}/${channel[2]}${channel[3] || ''}`;
  }
  const settings = pathname.match(/^\/team\/(\d+)\/settings(.*)$/);
  if (settings) {
    return `/channels/${settings[1]}/settings${settings[2] || ''}`;
  }
  const team = pathname.match(/^\/team\/(\d+)(.*)$/);
  if (team) {
    return `/channels/${team[1]}${team[2] || ''}`;
  }
  return null;
}
