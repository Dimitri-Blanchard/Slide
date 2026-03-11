import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AvatarImg } from '../components/Avatar';
import { servers } from '../api';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import './CommunityServersPage.css';

const PRESET_TAGS = [
  'Gaming', 'Art', 'Music', 'Education', 'Science & Tech', 'Sports', 'Fashion',
  'Anime', 'Movies', 'Food', 'Travel', 'Photography', 'Writing', 'Programming',
  'Friends', 'Language', 'Roleplay', 'Support', 'Meta', 'Other'
];

export default function CommunityServersPage() {
  const [serversList, setServersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);
  const [joiningId, setJoiningId] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();

  useEffect(() => {
    servers.getDiscoverable(selectedTag || undefined)
      .then((list) => setServersList(list || []))
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [selectedTag]);

  const allTags = useMemo(() => {
    const seen = new Set();
    (serversList || []).forEach((t) => {
      (t.discovery_tags || []).forEach((tag) => tag && seen.add(tag));
    });
    return [...seen].sort();
  }, [serversList]);

  const filteredServers = useMemo(() => {
    let list = serversList || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q) ||
        (s.discovery_blurb || '').toLowerCase().includes(q) ||
        (s.discovery_tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    return list;
  }, [serversList, searchQuery]);

  const handleJoin = async (team) => {
    setJoiningId(team.id);
    setError('');
    try {
      const result = await servers.joinPublic(team.id);
      const teamId = result.team_id ?? result.team?.id ?? team.id;
      navigate(`/team/${teamId}`);
    } catch (err) {
      setError(err.message || 'Failed to join');
    }
    setJoiningId(null);
  };

  if (!user) {
    return (
      <div className="community-page">
        <div className="community-gate">
          <h1>Explore Communities</h1>
          <p>Sign in to discover and join public servers</p>
          <button className="community-btn primary" onClick={() => navigate('/login')}>Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="community-page">
      {/* Hero */}
      <header className="community-hero">
        <button className="community-back" onClick={() => navigate(-1)} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>
        <div className="community-hero-bg" />
        <div className="community-hero-content">
          <h1>
            <span className="community-hero-title">Discover</span>
            <span className="community-hero-accent"> Communities</span>
          </h1>
          <p>Find servers that match your interests. Gaming, art, study groups, and more.</p>
          <div className="community-search-wrap">
            <svg className="community-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="community-search"
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </header>

      {/* Tags filter */}
      <nav className="community-tags">
        <button
          className={`community-tag ${!selectedTag ? 'active' : ''}`}
          onClick={() => setSelectedTag(null)}
        >
          All
        </button>
        {PRESET_TAGS.map((tag) => (
          <button
            key={tag}
            className={`community-tag ${selectedTag === tag ? 'active' : ''}`}
            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
          >
            {tag}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="community-main">
        {error && <div className="community-error">{error}</div>}
        {loading ? (
          <div className="community-loading">
            <div className="community-spinner" />
            <span>Loading communities...</span>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="community-empty">
            <div className="community-empty-icon">🌐</div>
            <h2>No servers found</h2>
            <p>
              {searchQuery
                ? 'Try a different search or clear filters'
                : 'Enable "Make publicly discoverable" in your server settings to appear here'}
            </p>
          </div>
        ) : (
          <div className="community-grid">
            {filteredServers.map((team) => {
              const isMember = team.is_member;
              const isJoining = joiningId === team.id;
              const tags = team.discovery_tags || [];
              const initial = (team.name || '?').charAt(0).toUpperCase();

              return (
                <article key={team.id} className="community-card">
                  <div className="community-card-banner" style={{ backgroundImage: team.banner_url ? `url(${team.banner_url})` : undefined }}>
                    {!team.banner_url && <div className="community-card-banner-fallback" />}
                  </div>
                  <div className="community-card-body">
                    <div className="community-card-avatar">
                      {team.avatar_url ? (
                        <AvatarImg src={team.avatar_url} alt={team.name} />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <h3 className="community-card-name">{team.name}</h3>
                    <p className="community-card-desc">
                      {team.discovery_blurb || team.description || 'A friendly community.'}
                    </p>
                    {tags.length > 0 && (
                      <div className="community-card-tags">
                        {tags.slice(0, 4).map((tag) => (
                          <span key={tag} className="community-card-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="community-card-footer">
                      <span className="community-card-members">
                        {(team.member_count ?? 0).toLocaleString()} members
                      </span>
                      {isMember ? (
                        <span className="community-card-badge">Your server</span>
                      ) : (
                        <button
                          className="community-card-join"
                          onClick={() => handleJoin(team)}
                          disabled={!!joiningId}
                        >
                          {isJoining ? 'Joining...' : 'Join'}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
