import React, { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ServerBar from '../components/ServerBar';
import TeamChat from '../components/TeamChat';
import DirectChat from '../components/DirectChat';
import LocalPrivateChat from '../components/LocalPrivateChat';
import FriendsPage from '../components/FriendsPage';
import MobileBottomNav from '../components/MobileBottomNav';
import MobileMessagesView from '../components/MobileMessagesView';
import MobileNotificationsView from '../components/MobileNotificationsView';
import MobileYouView from '../components/MobileYouView';
import CreateServerModal from '../components/CreateServerModal';
import SearchModal from '../components/SearchModal';
import VoiceFullscreenOverlay from '../components/VoiceFullscreenOverlay';
import ServerErrorBoundary from '../components/ServerErrorBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import NotFound from '../pages/NotFound';
import { isMobileFullPageRoute } from './appPaths';
import { useSettingsUi } from '../context/SettingsUiContext';

import '../pages/SecurityDashboard.css';
import '../pages/NitroPage.css';
import '../pages/QuestsPage.css';

const CommunityServersPage = lazy(() => import('../pages/CommunityServersPage'));
const SecurityDashboard = lazy(() => import('../pages/SecurityDashboard'));
const NitroPage = lazy(() => import('../pages/NitroPage'));
const QuestsPage = lazy(() => import('../pages/QuestsPage'));

function MobileRouteFallback() {
  return (
    <div className="slide-loading-screen" role="status" aria-live="polite" aria-label="Loading">
      <div className="slide-spinner" aria-hidden />
    </div>
  );
}

export default function MobileAppLayoutShell({
  pathname,
  params,
  scene,
  isOnline,
  queuedCount,
  processing,
  teams,
  conversations,
  setConversations,
  loading,
  user,
  lastDmConversationId,
  handleTeamsChange,
  onLeaveServer,
  mobileTab,
  setMobileTab,
  showSearch,
  setShowSearch,
  showCreateServer,
  setShowCreateServer,
  setTeams,
  inboxItems,
  pendingFriendsCount = 0,
}) {
  const navigate = useNavigate();
  const { openSettings } = useSettingsUi();

  useEffect(() => {
    const onVoiceDisconnect = (event) => {
      const teamId = event?.detail?.teamId;
      if (teamId == null || teamId === '') return;
      if (isMobileFullPageRoute(pathname)) return;
      navigate(`/team/${teamId}`, { replace: true });
    };
    window.addEventListener('slide:voice-channel-disconnect', onVoiceDisconnect);
    return () => window.removeEventListener('slide:voice-channel-disconnect', onVoiceDisconnect);
  }, [pathname, navigate]);

  const serverConversations = Array.isArray(conversations)
    ? conversations.filter((conversation) => !conversation?.is_local_private)
    : [];
  const isCommunityPage = pathname === '/community';
  const isFullPageRoute = isMobileFullPageRoute(pathname);
  const inChatRoute = !!(params.teamId || params.conversationId || params.localPrivateUserId || isCommunityPage);
  const showTabShell = !inChatRoute && !isFullPageRoute;
  const contentTab = params.isSettings ? 'profile' : mobileTab;
  const activeTab = params.conversationId || params.localPrivateUserId || params.teamId ? 'home'
    : params.isSettings ? 'profile'
    : mobileTab;

  const dmUnreadTotal = (Array.isArray(conversations) ? conversations : []).reduce((n, c) => n + (c.unread_count || 0), 0);
  const serverUnreadTotal = (Array.isArray(teams) ? teams : []).reduce((n, t) => n + (t.unread_count || 0), 0);

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab);
    if (inChatRoute || isFullPageRoute) {
      navigate('/channels/@me');
    }
  };

  const hideBottomNav = params.isSettings
    || isFullPageRoute
    || !!(params.channelId || params.conversationId || params.localPrivateUserId);

  const showServerBar = !isCommunityPage
    && !isFullPageRoute
    && !(params.conversationId || params.localPrivateUserId || (params.teamId && params.channelId));

  return (
    <div className={`mobile-app-layout scene-${scene}`}>
      {!isOnline && (
        <div className="offline-banner" role="alert">
          <span className="offline-banner-icon">⚠</span>
          <span>
            Pas de connexion.
            {queuedCount > 0
              ? ` ${queuedCount} message${queuedCount > 1 ? 's' : ''} en attente.`
              : ''}
            {processing && ' Envoi en cours…'}
          </span>
        </div>
      )}

      <div className={`mobile-content ${showServerBar ? 'mobile-split-layout' : ''}`}>
        {showServerBar && (
          <aside className="mobile-server-bar">
            <ServerBar
              teams={teams}
              conversations={Array.isArray(conversations)
                ? conversations.filter((conversation) => !conversation?.is_local_private)
                : []}
              currentTeamId={params.teamId}
              currentConversationId={params.conversationId}
              currentLocalPrivateUserId={params.localPrivateUserId}
              lastDmConversationId={lastDmConversationId}
              onTeamsChange={handleTeamsChange}
              onLeaveServer={onLeaveServer}
              isMobile={true}
              pendingFriendsCount={pendingFriendsCount}
            />
          </aside>
        )}
        <div className="mobile-content-main">
          {showTabShell ? (
            contentTab === 'home' ? (
              <ErrorBoundary fallback={<div className="mobile-messages-view" style={{ padding: '1rem', color: 'var(--text-muted)' }}>Messages unavailable</div>}>
                <MobileMessagesView
                  conversations={conversations}
                  currentConversationId={params.conversationId}
                  currentLocalPrivateUserId={params.localPrivateUserId}
                  loading={loading}
                  onOpenSearch={() => setShowSearch(true)}
                  pendingFriendsCount={pendingFriendsCount}
                />
              </ErrorBoundary>
            ) : contentTab === 'notifications' ? (
              <MobileNotificationsView />
            ) : contentTab === 'profile' ? (
              <MobileYouView
                onOpenSettings={() => openSettings()}
                pendingFriendsCount={pendingFriendsCount}
              />
            ) : null
          ) : (
            <main className={`app-main ${isFullPageRoute ? 'mobile-full-page-route' : ''}`}>
              <div className="content-phase-in">
                <Suspense fallback={<MobileRouteFallback />}>
                  <Routes>
                    <Route path="/community" element={<CommunityServersPage />} />
                    <Route path="/friends" element={<FriendsPage mobileStandalone />} />
                    <Route path="/security" element={<SecurityDashboard mobileStandalone />} />
                    <Route path="/nitro" element={<NitroPage />} />
                    <Route path="/quests" element={<QuestsPage />} />
                    <Route path="/settings/*" element={null} />
                    <Route
                      path="/team/:teamId/*"
                      element={
                        <ServerErrorBoundary>
                          <TeamChat
                            teamId={params.teamId}
                            initialChannelId={params.channelId}
                            isMobile={true}
                            onLeaveServer={onLeaveServer}
                            onOpenSearch={() => setShowSearch(true)}
                          />
                        </ServerErrorBoundary>
                      }
                    />
                    <Route
                      path="/channels/@me/private-local/:peerUserId"
                      element={(
                        <LocalPrivateChat
                          peerUserId={params.localPrivateUserId}
                          isMobile={true}
                        />
                      )}
                    />
                    <Route
                      path="/channels/@me/:conversationId"
                      element={(
                        <DirectChat
                          conversationId={params.conversationId}
                          onConversationsChange={setConversations}
                          conversations={serverConversations}
                          isMobile={true}
                        />
                      )}
                    />
                    <Route path="/" element={<Navigate to="/channels/@me" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </div>
            </main>
          )}
        </div>
      </div>

      <VoiceFullscreenOverlay isMobile={true} conversations={serverConversations} />

      {!hideBottomNav && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleMobileTabChange}
          unreadCounts={{
            home: dmUnreadTotal + serverUnreadTotal,
            notifications: (inboxItems || []).length,
            profile: pendingFriendsCount,
          }}
          userAvatar={user?.avatar_url}
        />
      )}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={serverConversations}
        teams={teams}
      />

      <CreateServerModal
        isOpen={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        onServerCreated={(newTeam) => {
          setTeams((prev) => [...prev, { ...newTeam, unread_count: 0, mention_count: 0, has_unread: false }]);
          setShowCreateServer(false);
          navigate(`/team/${newTeam.id}`);
        }}
      />
    </div>
  );
}
