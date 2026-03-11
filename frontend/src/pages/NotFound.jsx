import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './NotFound.css';

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="nf-page">
      <div className="nf-card">
        <Link to="/" className="nf-logo">
          <img src="/logo.png" alt="Slide" className="nf-logo-img" />
          <span>Slide</span>
        </Link>
        <h1 className="nf-title">Page not found</h1>
        <p className="nf-desc">
          This page doesn't exist or has been moved.
        </p>
        <div className="nf-actions">
          <Link to="/" className="nf-btn-primary">Back to home</Link>
          {!user && (
            <Link to="/login" className="nf-btn-ghost">Sign in</Link>
          )}
          {user && (
            <Link to="/channels/@me" className="nf-btn-ghost">Go to messages</Link>
          )}
        </div>
      </div>
    </div>
  );
}
