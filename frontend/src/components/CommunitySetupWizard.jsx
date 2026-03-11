import React, { useState } from 'react';
import './CommunitySetupWizard.css';

const PRESET_TAGS = [
  'Gaming', 'Art', 'Music', 'Education', 'Science & Tech', 'Sports', 'Fashion',
  'Anime', 'Movies', 'Food', 'Travel', 'Photography', 'Writing', 'Programming',
  'Friends', 'Language', 'Roleplay', 'Support', 'Meta', 'Other'
];

export default function CommunitySetupWizard({ team, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [tags, setTags] = useState(team?.discovery_tags || []);
  const [blurb, setBlurb] = useState(team?.discovery_blurb || '');
  const [saving, setSaving] = useState(false);

  const toggleTag = (tag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 5 ? [...prev, tag] : prev
    );
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await onComplete({ discovery_tags: tags, discovery_blurb: blurb.trim() || null });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="csw-overlay" onClick={(e) => e.target === e.currentTarget && onCancel?.()}>
      <div className="csw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="csw-progress">
          <div className={`csw-step ${step >= 1 ? 'done' : ''}`} />
          <div className={`csw-step ${step >= 2 ? 'done' : ''}`} />
          <div className={`csw-step ${step >= 3 ? 'done' : ''}`} />
        </div>

        {step === 1 && (
          <div className="csw-step-content">
            <h2>What's your server about?</h2>
            <p>Pick at least 1 tag (up to 5) so people can find you. Required.</p>
            <div className="csw-tags">
              {PRESET_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`csw-tag ${tags.includes(tag) ? 'selected' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
            <div className="csw-actions">
              <button type="button" className="csw-btn secondary" onClick={onCancel}>Cancel</button>
              <button type="button" className="csw-btn primary" onClick={() => setStep(2)} disabled={tags.length < 1}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="csw-step-content">
            <h2>Describe your community</h2>
            <p>Write a short blurb (at least 20 characters). Required.</p>
            <textarea
              className="csw-blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value.slice(0, 280))}
              placeholder="A friendly place for gamers to chat, share clips, and find teammates..."
              rows={4}
            />
            <span className="csw-char-count">{blurb.length}/280</span>
            <div className="csw-actions">
              <button type="button" className="csw-btn secondary" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="csw-btn primary" onClick={() => setStep(3)} disabled={blurb.trim().length < 20}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="csw-step-content">
            <h2>Ready to go public?</h2>
            <p>Your server will appear in the Explore Communities page. You can turn this off anytime.</p>
            <div className="csw-summary">
              {tags.length > 0 && (
                <div className="csw-summary-tags">
                  {tags.map((t) => (
                    <span key={t} className="csw-summary-tag">{t}</span>
                  ))}
                </div>
              )}
              {blurb && <p className="csw-summary-blurb">"{blurb}"</p>}
            </div>
            <div className="csw-actions">
              <button type="button" className="csw-btn secondary" onClick={() => setStep(2)}>Back</button>
              <button
                type="button"
                className="csw-btn primary"
                onClick={handleComplete}
                disabled={saving}
              >
                {saving ? 'Enabling...' : 'Make discoverable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
