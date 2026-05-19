import React from 'react';

/**
 * Immersive auth scene: diagonal night-blue space, square pixel field, blurred abstract shapes.
 * Inspired by the quality bar of top social apps — original geometry, no third-party art.
 */
export default function AuthBackdrop() {
  return (
    <div className="auth-backdrop" aria-hidden="true">
      <div className="auth-backdrop__beam" />
      <div className="auth-backdrop__glow auth-backdrop__glow--deep" />
      <div className="auth-backdrop__glow auth-backdrop__glow--lift" />
      <div className="auth-backdrop__float auth-backdrop__float--a" />
      <div className="auth-backdrop__float auth-backdrop__float--b" />
      <div className="auth-backdrop__float auth-backdrop__float--c" />
      <div className="auth-backdrop__pixels auth-backdrop__pixels--fine" />
      <div className="auth-backdrop__pixels auth-backdrop__pixels--coarse" />
    </div>
  );
}
