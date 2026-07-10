import React, { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ServerBar from '../components/ServerBar';
import Sidebar from '../components/Sidebar';
import TeamChat from '../components/TeamChat';
import DirectChat from '../components/DirectChat';
import LocalPrivateChat from '../components/LocalPrivateChat';
import FriendsPage from '../components/FriendsPage';
import SearchModal from '../components/SearchModal';
import DmCallFloatingPanel from '../components/DmCallFloatingPanel';
import ServerErrorBoundary from '../components/ServerErrorBoundary';
import ErrorBoundary from '../components/ErrorBoundary';
import UserStatusAndSettings from '../components/UserStatusAndSettings';
import NotFound from '../pages/NotFound';
import LegacyTeamRedirect from './LegacyTeamRedirect';

import '../pages/SecurityDashboard.css';
import '../pages/NitroPage.css';
import '../pages/QuestsPage.css';

const NitroPage = lazy(() => import('../pages/NitroPage'));
const QuestsPage = lazy(() => import('../pages/QuestsPage'));
const SecurityDashboard = lazy(() => import('../pages/SecurityDashboard'));
const CommunityServersPage = lazy(() => import('../pages/CommunityServersPage'));

export default function DesktopAppLayoutShell({
  params,
  scene,
  isMobile,
  mobileNavOpen,
  setMobileNavOpen,
  handleOverlayTouchStart,
  handleOverlayTouchMove,
  isOnline,
  queuedCount,
  processing,
  teams,
  user,
  conversations,
  setConversations,
  lastDmConversationId,
  handleTeamsChange,
  onLeaveServer,
  showSidebar,
  sidebarWidth,
  handleSidebarResizeStart,
  refreshConversations,
  addConversation,
  removeConversationLocal,
  restoreConversationLocal,
  loading,
  conversationsLoaded,
  setShowSearch,
  showSearch,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
  pendingFriendsCount = 0,
}) {
  const allConversations = Array.isArray(conversations) ? conversations : [];
  const dmConversations = allConversations.filter((conversation) => !conversation?.is_local_private);

  return (
    <div className={`app-layout scene-${scene} ${mobileNavOpen ? 'mobile-nav-open' : ''}`}>
      {!isOnline && (
        <div className="offline-banner" role="alert">
          <span className="offline-banner-icon">⚠</span>
          <span>
            Pas de connexion.
            {queuedCount > 0
              ? ` ${queuedCount} message${queuedCount > 1 ? 's' : ''} en attente — envoi dès la reconnexion.`
              : ' Les messages seront mis en file et envoyés à la reconnexion.'}
            {processing && ' Envoi en cours…'}
          </span>
        </div>
      )}
      {isMobile && mobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setMobileNavOpen(false)}
          onTouchStart={handleOverlayTouchStart}
          onTouchMove={handleOverlayTouchMove}
        />
      )}
      <ServerBar
        teams={teams}
        conversations={allConversations}
        currentTeamId={params.teamId}
        currentConversationId={params.conversationId}
        currentLocalPrivateUserId={params.localPrivateUserId}
        lastDmConversationId={lastDmConversationId}
        onTeamsChange={handleTeamsChange}
        onLeaveServer={onLeaveServer}
        pendingFriendsCount={pendingFriendsCount}
      />
      <UserStatusAndSettings sidebarWidth={sidebarWidth} />
      {showSidebar && (
        <ErrorBoundary fallback={<aside className="sidebar" style={{ padding: '1rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>DMs unavailable</aside>}>
          <Sidebar
            user={user}
            conversations={conversations}
            currentConversationId={params.conversationId}
            currentLocalPrivateUserId={params.localPrivateUserId}
            onRefreshConversations={refreshConversations}
            onAddConversation={addConversation}
            onRemoveConversation={removeConversationLocal}
            onRestoreConversation={restoreConversationLocal}
            loading={loading}
            conversationsLoaded={conversationsLoaded}
            onOpenSearch={() => setShowSearch(true)}
            width={sidebarWidth}
            onResizeStart={handleSidebarResizeStart}
            pendingFriendsCount={pendingFriendsCount}
          />
        </ErrorBoundary>
      )}
      <main className="app-main">
        {isMobile && (
          <div
            className="mobile-edge-swipe-zone"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          />
        )}
        <div className="content-phase-in">
          <Routes>
            <Route
              path="/channels/@me/private-local/:peerUserId"
              element={(
                <LocalPrivateChat
                  peerUserId={params.localPrivateUserId}
                  isMobile={isMobile}
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
                />
              )}
            />
            <Route path="/channels/@me" element={<FriendsPage />} />
            <Route
              path="/channels/:teamId/*"
              element={(
                <ServerErrorBoundary>
                  <TeamChat
                    teamId={params.teamId}
                    initialChannelId={params.channelId}
                    isMobile={isMobile}
                    onLeaveServer={onLeaveServer}
                    onOpenSearch={() => setShowSearch(true)}
                    sidebarWidth={sidebarWidth}
                    onSidebarResizeStart={handleSidebarResizeStart}
                  />
                </ServerErrorBoundary>
              )}
            />
            <Route path="/team/:teamId/*" element={<LegacyTeamRedirect />} />
            <Route path="/community" element={<CommunityServersPage />} />
            <Route path="/nitro" element={<NitroPage />} />
            <Route path="/security" element={<SecurityDashboard />} />
            <Route path="/quests" element={<QuestsPage />} />
            <Route path="/friends" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/home" element={<Navigate to="/channels/@me" replace />} />
            <Route path="/profile/*" element={<Navigate to="/channels/@me" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </main>
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversations={dmConversations}
        teams={teams}
      />

      <DmCallFloatingPanel conversations={dmConversations} isMobile={isMobile} />
    </div>
  );
}
