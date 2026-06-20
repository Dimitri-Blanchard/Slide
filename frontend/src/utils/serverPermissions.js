const isEnabled = (v) => v === true || v === 1 || v === '1' || v === 'true';

/**
 * Whether the user may open server settings (manage_server permission).
 * Mirrors backend hasPermission(userId, teamId, 'manage_server').
 */
export function canManageServer({
  userId,
  team,
  memberRole,
  roles = [],
  memberRoleIds = [],
}) {
  if (!userId || !team) return false;
  if (team.can_manage_server === true) return true;

  const role = memberRole || team?.role;
  if (role === 'owner') return true;
  if (String(team?.created_by) === String(userId)) return true;
  if (role === 'admin') return true;

  const ids = Array.isArray(memberRoleIds) ? memberRoleIds : [];
  if (!ids.length || !Array.isArray(roles) || !roles.length) return false;

  const hasRole = (roleId) => ids.some((id) => String(id) === String(roleId));
  return roles.some(
    (r) => r && hasRole(r.id) && (isEnabled(r.perm_administrator) || isEnabled(r.perm_manage_server))
  );
}
