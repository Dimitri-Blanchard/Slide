import React, { lazy, Suspense, useCallback, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ServerBar from '../components/ServerBar';
import TeamChat from '../components/TeamChat';
import DirectChat from '../components/DirectChat';
import LocalPrivateChat from '../components/LocalPrivateChat';
import FriendsPage from '../components/FriendsPage';
import MobileIslandNav from '../components/MobileIslandNav';
import MobileMessagesView from '../components/MobileMessagesView';
import MobileNotificationsView from '../components/MobileNotificationsView';
import MobileYouView from '../components/MobileYouView';
import MobileServerDrawer from '../components/MobileServerDrawer';
import MobileHomeSwipeNav from '../components/MobileHomeSwipeNav';
import CreateServerModal from '../components/CreateServerModal';
import SearchModal from '../components/SearchModal';
import VoiceFullscreenOverlay from '../components/VoiceFullscreenOverlay';
import ServerErrorBoundary from '../components/ServerErrorBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import NotFound from '../pages/NotFound';
import { isMobileFullPageRoute } from './appPaths';
import { useSettingsUi } from '../context/SettingsUiContext';
import { useVoice } from '../context/VoiceContext';

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
  onRemoveConversation,
  onRestoreConversation,
}) {
  const navigate = useNavigate();
  const { openSettings } = useSettingsUi();
  const { voiceChannelId, voiceConversationId, voiceLeaveAnim, voiceViewMinimized } = useVoice();
  const isInVoice = !!(voiceChannelId || voiceConversationId || voiceLeaveAnim);
  const fullscreenVoiceActive = isInVoice && !voiceViewMinimized;

  useEffect(() => {
    const onVoiceDisconnect = (event) => {
      const teamId = event?.detail?.teamId;
      if (teamId == null || teamId === '') return;
      if (isMobileFullPageRoute(pathname)) return;
      const team = teams?.find((t) => String(t.id) === String(teamId));
      navigate(serverPath(team || { id: teamId }), { replace: true });
    };
    window.addEventListener('slide:voice-channel-disconnect', onVoiceDisconnect);
    return () => window.removeEventListener('slide:voice-channel-disconnect', onVoiceDisconnect);
  }, [pathname, navigate, teams]);

  const allConversations = Array.isArray(conversations) ? conversations : [];
  const dmConversations = allConversations.filter((conversation) => !conversation?.is_local_private);
  const isCommunityPage = pathname === '/community';
  const isFullPageRoute = isMobileFullPageRoute(pathname);
  const inChatRoute = !!(params.teamId || params.conversationId || params.localPrivateUserId || isCommunityPage);
  const showTabShell = !inChatRoute && !isFullPageRoute;
  const contentTab = params.isSettings ? 'profile' : mobileTab;
  const activeTab = params.conversationId || params.localPrivateUserId || params.teamId ? 'home'
    : params.isSettings ? 'profile'
    : mobileTab;

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab);
    if (inChatRoute || isFullPageRoute) {
      navigate('/channels/@me', { state: { mobileTab: tab } });
    }
  };

  const isNotificationsActive = activeTab === 'notifications';
  const handleMobileNotificationsFromSidebar = useCallback(() => {
    const nextTab = isNotificationsActive ? 'home' : 'notifications';
    setMobileTab(nextTab);
    navigate('/channels/@me', { state: { mobileTab: nextTab } });
  }, [isNotificationsActive, navigate, setMobileTab]);

  const teamChatMobileProps = {
    notificationCount: (inboxItems || []).length,
    isNotificationsActive,
    onMobileNotificationsClick: handleMobileNotificationsFromSidebar,
    pendingFriendsCount,
  };

  const showServerBar = !isCommunityPage
    && !isFullPageRoute
    && !(params.conversationId || params.localPrivateUserId || (params.teamId && params.channelId));

  const hideBottomNav = params.isSettings
    || isFullPageRoute
    || !!(params.channelId || params.conversationId || params.localPrivateUserId)
    || fullscreenVoiceActive
    || (showServerBar && params.teamId && !params.channelId);

  const handleHomeLogoClick = useCallback(() => {
    setMobileTab('home');
  }, [setMobileTab]);

  const serverBarProps = {
    teams,
    conversations: allConversations,
    currentTeamId: params.teamId,
    currentConversationId: params.conversationId,
    currentLocalPrivateUserId: params.localPrivateUserId,
    lastDmConversationId,
    onTeamsChange: handleTeamsChange,
    onLeaveServer,
    isMobile: true,
    pendingFriendsCount,
    onHomeClick: handleHomeLogoClick,
  };

  const handleSwipeToDms = useCallback(() => {
    navigate('/channels/@me');
  }, [navigate]);

  const handleSwipeToServer = useCallback((teamInternalId) => {
    const team = teams?.find((t) => String(t.id) === String(teamInternalId));
    navigate(serverPath(team || { id: teamInternalId }));
  }, [navigate, teams]);

  const drawerCloseSignal = pathname;

  const enableHomeNavSwipe = showServerBar
    && !params.conversationId
    && !params.localPrivateUserId
    && !params.channelId
    && (params.teamId || (showTabShell && mobileTab === 'home'));

  const dmsPageContent = (
    <ErrorBoundary fallback={<div className="mobile-messages-view" style={{ padding: '1rem', color: 'var(--text-muted)' }}>Messages unavailable</div>}>
      <MobileMessagesView
        conversations={conversations}
        currentConversationId={params.conversationId}
        currentLocalPrivateUserId={params.localPrivateUserId}
        loading={loading}
        onOpenSearch={() => setShowSearch(true)}
        onRemoveConversation={onRemoveConversation}
        onRestoreConversation={onRestoreConversation}
      />
    </ErrorBoundary>
  );

  const renderServerPage = useCallback((teamId) => (
    <main className="app-main">
      <div className="content-phase-in">
        <ServerErrorBoundary>
          <TeamChat
            teamId={teamId}
            initialChannelPublicId={null}
            isMobile={true}
            inHomePager={true}
            onLeaveServer={onLeaveServer}
            onOpenSearch={() => setShowSearch(true)}
            {...teamChatMobileProps}
          />
        </ServerErrorBoundary>
      </div>
    </main>
  ), [onLeaveServer, setShowSearch, teamChatMobileProps]);

  const homePagerActive = enableHomeNavSwipe && !params.teamId && (teams?.length ?? 0) >= 1;
  const pagerOwnsDmsHome = homePagerActive && showTabShell && contentTab === 'home';
  const showTeamRouteDirect = showServerBar && !!params.teamId;

  const mainContent = (
    <>
      {showTabShell ? (
        pagerOwnsDmsHome ? null
        : contentTab === 'home' ? dmsPageContent
        : contentTab === 'notifications' ? (
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
                  path="/channels/:teamPublicId/:channelPublicId/*"
                  element={(
                    <ServerErrorBoundary>
                      <TeamChat
                        teamId={params.teamId}
                        initialChannelPublicId={params.channelPublicId}
                        isMobile={true}
                        onLeaveServer={onLeaveServer}
                        onOpenSearch={() => setShowSearch(true)}
                        {...teamChatMobileProps}
                      />
                    </ServerErrorBoundary>
                  )}
                />
                <Route
                  path="/channels/:teamPublicId/*"
                  element={(
                    <ServerErrorBoundary>
                      <TeamChat
                        teamId={params.teamId}
                        initialChannelPublicId={null}
                        isMobile={true}
                        onLeaveServer={onLeaveServer}
                        onOpenSearch={() => setShowSearch(true)}
                        {...teamChatMobileProps}
                      />
                    </ServerErrorBoundary>
                  )}
                />
                <Route
                  path="/team/:teamId/*"
                  element={(
                    <ServerErrorBoundary>
                      <TeamChat
                        teamId={params.teamId}
                        initialChannelPublicId={params.channelPublicId}
                        isMobile={true}
                        onLeaveServer={onLeaveServer}
                        onOpenSearch={() => setShowSearch(true)}
                        {...teamChatMobileProps}
                      />
                    </ServerErrorBoundary>
                  )}
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
                      conversations={dmConversations}
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
    </>
  );

  return (
    <div className={`mobile-app-layout scene-${scene}${!hideBottomNav ? ' has-island-nav' : ''}${fullscreenVoiceActive ? ' voice-call-fullscreen' : ''}`}>
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

      <div className={`mobile-content ${showServerBar ? 'mobile-split-layout' : 'mobile-drawer-layout'}`}>
        {showServerBar ? (
          <>
            <aside className="mobile-server-bar">
              <ServerBar {...serverBarProps} />
            </aside>
            {showTeamRouteDirect ? (
              <div className="mobile-content-main">
                {mainContent}
              </div>
            ) : (
              <MobileHomeSwipeNav
                enabled={homePagerActive}
                currentTeamId={params.teamId}
                teams={teams}
                onNavigateToDms={handleSwipeToDms}
                onNavigateToServer={handleSwipeToServer}
                dmsContent={dmsPageContent}
                renderServerPage={renderServerPage}
              >
                <div className="mobile-content-main">
                  {mainContent}
                </div>
              </MobileHomeSwipeNav>
            )}
          </>
        ) : (
          <MobileServerDrawer
            enabled
            closeSignal={drawerCloseSignal}
            drawer={<ServerBar {...serverBarProps} />}
          >
            <div className="mobile-content-main">
              {mainContent}
            </div>
          </MobileServerDrawer>
        )}
      </div>

      <VoiceFullscreenOverlay isMobile={true} conversations={dmConversations} />

      {!hideBottomNav && (
        <MobileIslandNav
          activeTab={activeTab}
          onTabChange={handleMobileTabChange}
          notificationCount={(inboxItems || []).length}
          pendingFriendsCount={pendingFriendsCount}
        />
      )}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={dmConversations}
        teams={teams}
      />

      <CreateServerModal
        isOpen={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        onServerCreated={(newTeam) => {
          setTeams((prev) => [...prev, { ...newTeam, unread_count: 0, mention_count: 0, has_unread: false }]);
          setShowCreateServer(false);
          navigate(serverPath(newTeam));
        }}
      />
    </div>
  );
}
