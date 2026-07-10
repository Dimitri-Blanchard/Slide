function participantSortName(participant) {
  return (participant?.display_name || participant?.username || '').toLowerCase();
}

/** First N group members for avatar stacks — excludes current user, alphabetical by display name. */
export function getGroupAvatarParticipants(participants, currentUserId, limit = 2) {
  if (!Array.isArray(participants) || participants.length === 0) return [];

  return participants
    .filter((p) => p?.id != null && String(p.id) !== String(currentUserId))
    .sort((a, b) => participantSortName(a).localeCompare(participantSortName(b)))
    .slice(0, limit);
}
