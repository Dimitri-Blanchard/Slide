import React from 'react';

/**
 * Immersive auth scene: diagonal night-blue space, square pixel field, blurred abstract shapes.
 * @param {'register' | 'login'} variant — register = full scene; login = same language, toned down
 */
export default function AuthBackdrop({ variant = 'register' }) {
  const subtle = variant === 'login';

  return (
    <div
      className={`auth-backdrop${subtle ? ' auth-backdrop--login' : ''}`}
      aria-hidden="true"
    >
      <div className="auth-backdrop__beam" />
      <div className="auth-backdrop__glow auth-backdrop__glow--deep" />
      <div className="auth-backdrop__glow auth-backdrop__glow--lift" />
      <div className="auth-backdrop__float auth-backdrop__float--a" />
      <div className="auth-backdrop__float auth-backdrop__float--b" />
      {!subtle && <div className="auth-backdrop__float auth-backdrop__float--c" />}
      <div className="auth-backdrop__pixels auth-backdrop__pixels--fine" />
      {!subtle && <div className="auth-backdrop__pixels auth-backdrop__pixels--coarse" />}
    </div>
  );
}
