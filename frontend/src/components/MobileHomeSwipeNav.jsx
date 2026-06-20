import React, { useCallback, useMemo } from 'react';
import { hapticSelection } from '../utils/nativeHaptics';
import { useHomePager } from '../hooks/useHomePager';
import './MobileHomeSwipeNav.css';

export default function MobileHomeSwipeNav({
  enabled = true,
  currentTeamId,
  teams = [],
  onNavigateToDms,
  onNavigateToServer,
  dmsContent,
  renderServerPage,
  children,
}) {
  const teamIds = useMemo(
    () => (teams || []).map((team) => String(team.id)),
    [teams],
  );
  const pageCount = 1 + teamIds.length;
  const currentIndex = useMemo(() => {
    if (!currentTeamId) return 0;
    const index = teamIds.indexOf(String(currentTeamId));
    return index >= 0 ? index + 1 : 0;
  }, [currentTeamId, teamIds]);

  const handlePageChange = useCallback((nextIndex) => {
    hapticSelection();
    if (nextIndex <= 0) {
      onNavigateToDms?.();
      return;
    }
    const teamId = teamIds[nextIndex - 1];
    if (teamId) onNavigateToServer?.(teamId);
  }, [teamIds, onNavigateToDms, onNavigateToServer]);

  const pager = useHomePager({
    enabled: enabled && pageCount > 1,
    pageCount,
    currentIndex,
    onPageChange: handlePageChange,
  });

  const teamListed = !currentTeamId || teamIds.includes(String(currentTeamId));
  const pagerReady = enabled && pageCount > 1 && teamListed;

  const visiblePages = useMemo(() => {
    const pages = new Set([currentIndex]);
    if (currentIndex > 0) pages.add(currentIndex - 1);
    if (currentIndex < pageCount - 1) pages.add(currentIndex + 1);
    return pages;
  }, [currentIndex, pageCount]);

  const renderPage = useCallback((pageIndex) => {
    if (pageIndex === 0) return dmsContent;
    const teamId = teamIds[pageIndex - 1];
    return teamId ? renderServerPage?.(teamId) : null;
  }, [dmsContent, renderServerPage, teamIds]);

  if (!pagerReady) {
    const staticPage = currentTeamId
      ? renderServerPage?.(currentTeamId)
      : (enabled ? dmsContent : null);
    return (
      <div className="mobile-home-swipe-nav mobile-home-swipe-nav--static">
        {staticPage ?? children}
      </div>
    );
  }

  const { hostRef, width, trackX, isDragging, isAnimating } = pager;
  const trackWidth = width * pageCount;

  return (
    <div
      ref={hostRef}
      className={[
        'mobile-home-swipe-nav',
        'mobile-home-pager',
        isDragging ? 'is-pager-dragging' : '',
        isAnimating ? 'is-pager-animating' : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        className="mobile-home-pager-track"
        style={{
          width: trackWidth > 0 ? trackWidth : `${pageCount * 100}%`,
          transform: trackWidth > 0
            ? `translate3d(${trackX}px, 0, 0)`
            : `translate3d(-${(currentIndex * 100) / pageCount}%, 0, 0)`,
        }}
      >
        {Array.from({ length: pageCount }, (_, pageIndex) => {
          const isActive = pageIndex === currentIndex;
          const shouldRender = visiblePages.has(pageIndex);

          return (
            <div
              key={pageIndex === 0 ? 'dms' : `team-${teamIds[pageIndex - 1]}`}
              className={`mobile-home-pager-page${isActive ? ' is-active' : ''}`}
              style={{ width: width > 0 ? width : `${100 / pageCount}%` }}
              aria-hidden={!isActive && !isDragging}
            >
              <div className="mobile-content-main mobile-home-pager-page-inner">
                {shouldRender ? renderPage(pageIndex) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
