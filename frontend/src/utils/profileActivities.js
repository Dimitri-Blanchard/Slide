/**
 * Whether profile activities (Spotify, etc.) should be visible to the current viewer.
 * Offline users' activities are hidden from everyone except themselves.
 */
export function canShowProfileActivities({ isOwnProfile, userId, isUserOnline }) {
  if (isOwnProfile) return true;
  if (userId == null || userId === '') return false;
  return isUserOnline(userId);
}
