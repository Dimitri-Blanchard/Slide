import React, { lazy } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import ServerBar from '../components/ServerBar';
import TeamChat from '../components/TeamChat';
import DirectChat from '../components/DirectChat';
import MobileBottomNav from '../components/MobileBottomNav';
import MobileMessagesView from '../components/MobileMessagesView';
import MobileNotificationsView from '../components/MobileNotificationsView';
import MobileYouView from '../components/MobileYouView';
import CreateServerModal from '../components/CreateServerModal';
import SearchModal from '../components/SearchModal';
import VoiceFullscreenOverlay from '../components/VoiceFullscreenOverlay';
import ServerErrorBoundary from '../components/ServerErrorBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import Settings from '../pages/Settings';
import NotFound from '../pages/NotFound';

const CommunityServersPage = lazy(() => import('../pages/CommunityServersPage'));

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
}) {
  const navigate = useNavigate();
  const isCommunityPage = pathname === '/community';
  const inSpecificRoute = !!(params.teamId || params.conversationId || isCommunityPage);
  const contentTab = params.isSettings ? 'profile' : mobileTab;
  const activeTab = params.conversationId || params.teamId ? 'home'
    : params.isSettings ? 'profile'
    : mobileTab;

  const dmUnreadTotal = (Array.isArray(conversations) ? conversations : []).reduce((n, c) => n + (c.unread_count || 0), 0);
  const serverUnreadTotal = (Array.isArray(teams) ? teams : []).reduce((n, t) => n + (t.unread_count || 0), 0);

  const handleMobileTabChange = (tab) => {
    setMobileTab(tab);
    if (inSpecificRoute) {
      navigate('/channels/@me');
    }
  };

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

      <div className={`mobile-content ${!isCommunityPage ? 'mobile-split-layout' : ''}`}>
        {!isCommunityPage && !(params.conversationId || (params.teamId && params.channelId)) && (
          <aside className="mobile-server-bar">
            <ServerBar
              teams={teams}
              currentTeamId={params.teamId}
              currentConversationId={params.conversationId}
              lastDmConversationId={lastDmConversationId}
              onTeamsChange={handleTeamsChange}
              onLeaveServer={onLeaveServer}
              isMobile={true}
            />
          </aside>
        )}
        <div className="mobile-content-main">
          {!inSpecificRoute ? (
            contentTab === 'home' ? (
              <ErrorBoundary fallback={<div className="mobile-messages-view" style={{ padding: '1rem', color: 'var(--text-muted)' }}>Messages unavailable</div>}>
                <MobileMessagesView
                  conversations={conversations}
                  currentConversationId={params.conversationId}
                  loading={loading}
                  onOpenSearch={() => setShowSearch(true)}
                />
              </ErrorBoundary>
            ) : contentTab === 'notifications' ? (
              <MobileNotificationsView />
            ) : contentTab === 'profile' ? (
              <MobileYouView onOpenSettings={() => navigate('/settings')} />
            ) : null
          ) : (
            <main className="app-main">
              <div className="content-phase-in">
                <Routes>
                  <Route path="/community" element={<CommunityServersPage />} />
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
                    path="/channels/@me/:conversationId"
                    element={(
                      <DirectChat
                        conversationId={params.conversationId}
                        onConversationsChange={setConversations}
                        conversations={conversations}
                        isMobile={true}
                      />
                    )}
                  />
                  <Route path="/" element={<Navigate to="/channels/@me" replace />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </main>
          )}
        </div>
      </div>

      <VoiceFullscreenOverlay isMobile={true} conversations={conversations} />

      {!(params.channelId || params.conversationId) && (
        <MobileBottomNav
          activeTab={activeTab}
          onTabChange={handleMobileTabChange}
          unreadCounts={{
            home: dmUnreadTotal + serverUnreadTotal,
            notifications: (inboxItems || []).length,
          }}
          userAvatar={user?.avatar_url}
        />
      )}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={conversations}
        teams={teams}
      />

      {params.isSettings && <Settings />}

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
