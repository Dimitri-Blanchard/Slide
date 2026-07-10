import { Navigate, useLocation } from 'react-router-dom';
import { legacyTeamPathToChannels } from '../utils/appRoutes';

/** Redirect old /team/:id/... bookmarks to /channels/:id/... */
export default function LegacyTeamRedirect() {
  const { pathname, search, hash } = useLocation();
  const target = legacyTeamPathToChannels(pathname);
  if (!target) return <Navigate to="/channels/@me" replace />;
  return <Navigate to={`${target}${search}${hash}`} replace />;
}
