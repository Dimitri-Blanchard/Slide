import React from 'react';

/** Ambient depth behind the landing page — original gradients, no assets. */
export default function LandingBackdrop() {
  return (
    <div className="landing-backdrop" aria-hidden="true">
      <div className="landing-backdrop__orb landing-backdrop__orb--a" />
      <div className="landing-backdrop__orb landing-backdrop__orb--b" />
      <div className="landing-backdrop__grid" />
    </div>
  );
}
