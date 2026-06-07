import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import LandingBackdrop from '../components/landing/LandingBackdrop';
import SwitzerlandFlag from '../components/landing/SwitzerlandFlag';
import HeroAppPreview from '../components/landing/HeroAppPreview';
import SlideLogo from '../components/SlideLogo';
import SmartDownloadButton from '../components/landing/SmartDownloadButton';
import { AndroidIcon, LinuxIcon, WindowsIcon } from '../components/landing/PlatformIcons';
import useDownloadLinks from '../hooks/useDownloadLinks';
import './LandingPage.css';

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Is Slide free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Slide is free to use. Core features at no cost - optional upgrades when you need more. No credit card required to get started.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is Slide?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Slide is a privacy-first messaging app for everyone — gaming squads, communities, friends, and work. Real-time chat, voice channels, servers, DMs, and presence. Get in while access is still open.',
      },
    },
    {
      '@type': 'Question',
      name: 'What makes Slide different?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Voice channels, servers, DMs, and presence — with privacy at the core. We don't sell your data, mine it for ads, or track you.",
      },
    },
    {
      '@type': 'Question',
      name: 'Is my data private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yes. Privacy is at the core of Slide. We don't sell your data, use it for targeted ads, or track you.",
      },
    },
    {
      '@type': 'Question',
      name: 'What platforms does Slide support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Slide is available for Windows 10/11 (64-bit), Android (APK), Linux (AppImage), and Web.',
      },
    },
  ],
};

const features = [
  {
    title: 'Real-time chat',
    desc: 'Messages land instantly. Typing indicators, read receipts, and reactions keep everyone aligned.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Servers & channels',
    desc: 'Squads, clans, or communities — text and voice channels, public or private, your rules.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Voice channels',
    desc: 'Drop into voice with one click. Crystal-clear calls without juggling another app.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    title: 'Direct messages',
    desc: '1-on-1 or group DMs. Find anyone by username and keep side conversations private.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: 'Presence & profiles',
    desc: 'See who is online, set your status, and express yourself with avatars and banners.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: 'Privacy first',
    desc: 'No ad profiling. No data resale. Your conversations stay yours — not a product to sell.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

const steps = [
  {
    n: '01',
    title: 'Get Slide',
    desc: 'Download for your platform or open in the browser. Free, no credit card.',
  },
  {
    n: '02',
    title: 'Create your space',
    desc: 'Create a server, invite your squad or community, and set up channels in minutes.',
  },
  {
    n: '03',
    title: 'Talk & build',
    desc: 'Chat and voice in real time — ranked nights, study groups, or late-night hangs.',
  },
];

const pillars = [
  { title: 'For everyone', desc: 'Gaming, communities, friends, or work — servers and channels that fit how you actually talk.' },
  { title: 'Privacy by default', desc: 'No tracking for ads. No selling your data. Transparent controls.' },
  { title: 'Always in sync', desc: 'Real-time messaging powered by a modern stack — fast on desktop and mobile.' },
];

const faqs = [
  { q: 'Is Slide free?', a: 'Yes. Core features are free. Optional upgrades when you need more — no credit card to start.' },
  { q: 'What is Slide?', a: 'A privacy-first messaging app for everyone: chat, voice, servers, DMs, and presence — in one place.' },
  { q: 'What makes Slide different?', a: "Full-featured collaboration without compromising privacy. We don't profile you for ads." },
  { q: 'Is my data private?', a: 'Yes. Strong defaults, clear policies, and no selling of conversation data.' },
  { q: 'What platforms does Slide support?', a: 'Windows 10/11, Android APK, Linux AppImage, and Web.' },
];

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function DownloadIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'download', label: 'Download' },
  { id: 'faq', label: 'FAQ' },
];

function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('landing-nav-open', menuOpen);
    return () => document.body.classList.remove('landing-nav-open');
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const goTo = (id) => (e) => {
    e.preventDefault();
    closeMenu();
    scrollToId(id);
  };

  return (
    <header
      className={`header${scrolled ? ' header--scrolled' : ''}${menuOpen ? ' header--menu-open' : ''}`}
    >
      <nav className="nav" aria-label="Main">
        <a
          href="#"
          className="logo"
          onClick={(e) => {
            e.preventDefault();
            closeMenu();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <SlideLogo alt="" width={32} height={32} className="logo-img" />
          <span className="logo-text">Slide</span>
        </a>

        <ul className="nav-links nav-links--desktop">
          {NAV_ITEMS.map(({ id, label }) => (
            <li key={id}>
              <a href={`#${id}`} onClick={goTo(id)}>
                {label}
              </a>
            </li>
          ))}
        </ul>

        <div className="nav-actions">
          <Link to="/app" className="btn btn-ghost nav-web-btn">
            <GlobeIcon />
            <span className="nav-web-label">Open in Web</span>
          </Link>
          <a href="#download" className="btn btn-primary nav-cta" onClick={goTo('download')}>
            Get Slide
          </a>
          <button
            type="button"
            className={`nav-burger${menuOpen ? ' nav-burger--open' : ''}`}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className="nav-burger-line" />
            <span className="nav-burger-line" />
            <span className="nav-burger-line" />
          </button>
        </div>
      </nav>

      {typeof document !== 'undefined'
        && createPortal(
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                className="nav-mobile-root"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.button
                  type="button"
                  className="nav-mobile-backdrop"
                  aria-label="Close menu"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={closeMenu}
                />
                <motion.div
                  id="landing-mobile-nav"
                  className="nav-mobile-panel"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 34, stiffness: 320 }}
                >
                  <motion.div
                    className="nav-mobile-panel-glow"
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  />

                  <motion.div
                    className="nav-mobile-panel-head"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.3 }}
                  >
                    <a
                      href="#"
                      className="nav-mobile-brand"
                      onClick={(e) => {
                        e.preventDefault();
                        closeMenu();
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    >
                      <SlideLogo alt="" width={36} height={36} className="nav-mobile-brand-logo" />
                      <span className="nav-mobile-brand-text">
                        <span className="nav-mobile-brand-name">Slide</span>
                        <span className="nav-mobile-brand-tag">Privacy-first messaging</span>
                      </span>
                    </a>
                    <button
                      type="button"
                      className="nav-mobile-close"
                      aria-label="Close menu"
                      onClick={closeMenu}
                    >
                      <span className="nav-burger-line" />
                      <span className="nav-burger-line" />
                    </button>
                  </motion.div>

                  <motion.p
                    className="nav-mobile-eyebrow"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.08, duration: 0.25 }}
                  >
                    Explore
                  </motion.p>

                  <ul className="nav-mobile-links">
                    {NAV_ITEMS.map(({ id, label }, i) => (
                      <motion.li
                        key={id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <a href={`#${id}`} className="nav-mobile-link" onClick={goTo(id)}>
                          <span className="nav-mobile-link-label">{label}</span>
                          <span className="nav-mobile-link-arrow" aria-hidden>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                          </span>
                        </a>
                      </motion.li>
                    ))}
                  </ul>

                  <motion.div
                    className="nav-mobile-actions"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28, duration: 0.32 }}
                  >
                    <p className="nav-mobile-actions-label">Get started</p>
                    <a href="#download" className="btn btn-primary btn-lg nav-mobile-btn" onClick={goTo('download')}>
                      Get Slide
                    </a>
                    <Link to="/app" className="btn btn-secondary btn-lg nav-mobile-btn" onClick={closeMenu}>
                      <GlobeIcon />
                      Open in Web
                    </Link>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </header>
  );
}

function Hero({ downloadLinks }) {
  return (
    <section className="hero landing-section">
      <div className="hero-inner">
        <div className="hero-content">
          <h1 className="hero-title">
            <motion.span
              className="hero-title-line"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
            >
              Secure messaging
            </motion.span>
            <motion.span
              className="hero-title-line"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.14 }}
            >
              for everyone.
            </motion.span>
            <motion.span
              className="hero-title-line accent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              Get in early.
            </motion.span>
          </h1>
          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.26 }}
          >
            Squads, gaming nights, friend groups, or work — chat and voice in one place, with privacy
            that won&apos;t stay this accessible forever. Join now while it&apos;s still open.
          </motion.p>
          <motion.div
            className="hero-cta"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.34 }}
          >
            <div className="hero-cta-row">
              <SmartDownloadButton downloadLinks={downloadLinks} />
              <Link to="/register" className="btn btn-secondary btn-lg hero-register-btn">
                Create account
              </Link>
            </div>
            <div className="hero-platforms" aria-label="Available platforms">
              <span className="hero-platform-pill"><WindowsIcon className="hero-platform-icon" /> Windows</span>
              <span className="hero-platform-pill"><AndroidIcon className="hero-platform-icon" /> Android</span>
              <span className="hero-platform-pill"><LinuxIcon className="hero-platform-icon" /> Linux</span>
              <span className="hero-platform-pill"><GlobeIcon /> Web</span>
            </div>
            <a
              href="#features"
              className="hero-secondary-cta"
              onClick={(e) => {
                e.preventDefault();
                scrollToId('features');
              }}
            >
              Explore features →
            </a>
          </motion.div>
        </div>
        <div className="hero-visual">
          <HeroAppPreview />
        </div>
      </div>
    </section>
  );
}

function TrustBar() {
  return (
    <section className="trust-bar landing-section landing-section--tight">
      <div className="trust-stats">
        <div className="trust-stat-block">
          <strong>10,000+</strong>
          <span>downloads</span>
        </div>
        <div className="trust-stat-block">
          <strong>Real-time</strong>
          <span>messaging</span>
        </div>
        <div className="trust-stat-block">
          <strong>4</strong>
          <span>platforms</span>
        </div>
      </div>
      <div className="trust-badges">
        <span className="trust-badge">Free to start</span>
        <span className="trust-badge">No credit card</span>
        <span className="trust-badge">Privacy-first</span>
        <span className="trust-badge">Open alpha</span>
      </div>
    </section>
  );
}

function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="features" className="features landing-section">
      <div className="section-header">
        <span className="section-eyebrow">Features</span>
        <h2 className="section-title">Built for how you actually talk</h2>
        <p className="section-subtitle">
          Whether you raid, grind ranked, or run a community — real-time tools without selling your data.
        </p>
      </div>
      <motion.div
        ref={ref}
        className="features-grid"
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
      >
        {features.map((f) => (
          <motion.article
            key={f.title}
            className="feature-card"
            variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
          >
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section id="how" className="how landing-section">
      <div className="section-header">
        <span className="section-eyebrow">How it works</span>
        <h2 className="section-title">Up and running in minutes</h2>
        <p className="section-subtitle">No complex setup. Download, invite, and start talking.</p>
      </div>
      <motion.ol
        ref={ref}
        className="how-steps"
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
      >
        {steps.map((s) => (
          <motion.li
            key={s.n}
            className="how-step"
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          >
            <span className="how-step-num">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  );
}

function Download({ downloadLinks }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const platforms = [
    { id: 'windows', name: 'Windows', desc: 'Windows 10/11 · 64-bit', href: downloadLinks.windows, label: 'Download for Windows', Icon: WindowsIcon, available: true },
    { id: 'android', name: 'Android', desc: 'APK · 64-bit', href: downloadLinks.android, label: 'Download for Android', Icon: AndroidIcon, available: true },
    { id: 'linux', name: 'Linux', desc: 'AppImage · 64-bit', href: downloadLinks.linux, label: 'Download for Linux', Icon: LinuxIcon, available: Boolean(downloadLinks.linux) },
  ];

  const trackDownload = (platform) => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'download', { platform });
    }
  };

  return (
    <section id="download" className="download">
      <div className="download-inner landing-section">
      <div className="section-header">
        <span className="section-eyebrow download-badge">Latest alpha</span>
        <h2 className="section-title">Download Slide</h2>
        <p className="section-subtitle">Pick your platform — install in one click, no account required</p>
      </div>
      <motion.div
        ref={ref}
        className="download-cards"
        initial="hidden"
        animate={isInView ? 'visible' : 'hidden'}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
      >
        {platforms.map((p) => (
          <motion.div
            key={p.id}
            id={p.id === 'linux' ? 'download-linux' : undefined}
            className={`download-card download-card--${p.id}${p.available ? '' : ' download-card--soon'}`}
            variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}
          >
            <div className="download-card-icon" aria-hidden>
              <p.Icon />
            </div>
            <h3>{p.name}</h3>
            <p className="download-card-desc">{p.desc}</p>
            {p.available ? (
              <a
                href={p.href}
                className="btn btn-primary download-btn"
                rel="noopener noreferrer"
                onClick={() => trackDownload(p.id)}
              >
                <DownloadIcon />
                {p.label}
              </a>
            ) : (
              <button type="button" className="btn btn-primary download-btn download-btn--soon" disabled>
                {p.label}
              </button>
            )}
          </motion.div>
        ))}
      </motion.div>
      <p className="download-web-hint">
        Prefer the browser? <Link to="/app">Open Slide in Web</Link> — no install needed.
      </p>
      </div>
    </section>
  );
}

function About() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section id="about" className="about landing-section">
      <motion.div
        ref={ref}
        className="about-grid"
        initial={{ opacity: 0, y: 24 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <div className="about-intro">
          <span className="section-eyebrow">About Slide</span>
          <h2 className="section-title about-title">Built for connection,<br />not surveillance</h2>
          <p className="about-text">
            Slide is messaging built for real life — gaming nights, communities, friends, and work.
            We believe great communication software should respect you — your time, your data, and your attention.
          </p>
          <p className="about-location">
            <SwitzerlandFlag className="about-location-flag" size={20} />
            Based in Switzerland
          </p>
          <p className="about-legal-note">
            No company registration or formal legal filings are in place yet — Slide is an independent
            project in active development.
          </p>
          <div className="about-meta">
            <span>Slide v1.0.0</span>
            <span aria-hidden>·</span>
            <span>Electron · React · Socket.io</span>
          </div>
        </div>
        <ul className="about-pillars">
          {pillars.map((p) => (
            <li key={p.title} className="about-pillar">
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}

function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="faq landing-section">
      <div className="section-header">
        <span className="section-eyebrow">FAQ</span>
        <h2 className="section-title">Questions & answers</h2>
      </div>
      <motion.div
        ref={ref}
        className="faq-list"
        initial={{ opacity: 0, y: 24 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
      >
        {faqs.map((faq, i) => {
          const isOpen = open === i;
          return (
            <div key={faq.q} className={`faq-item${isOpen ? ' faq-item-open' : ''}`}>
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpen((prev) => (prev === i ? null : i))}
                aria-expanded={isOpen}
              >
                {faq.q}
                <motion.span className="faq-icon" animate={{ rotate: isOpen ? 45 : 0 }} aria-hidden>
                  +
                </motion.span>
              </button>
              <motion.div
                className="faq-answer-wrapper"
                initial={false}
                animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
              >
                <p className="faq-answer">{faq.a}</p>
              </motion.div>
            </div>
          );
        })}
      </motion.div>
    </section>
  );
}

function Principles() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section className="principles" ref={ref}>
      <motion.div
        className="principles-inner landing-section"
        initial={{ opacity: 0, y: 24 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
      >
        <span className="section-eyebrow">Our principles</span>
        <h2 className="principles-title">Independent by design</h2>
        <p className="principles-text">
          Communication should be free from mandated access. No authority over your conversations —
          just tools that work for you.
        </p>
        <div className="principles-badges">
          <span className="principles-badge">No mandated access</span>
          <span className="principles-badge">User-first</span>
          <span className="principles-badge">Transparent</span>
        </div>
      </motion.div>
    </section>
  );
}

function FinalCTA({ downloadLinks }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <section className="final-cta landing-section" ref={ref}>
      <motion.div
        className="final-cta-inner"
        initial={{ opacity: 0, y: 20 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5 }}
      >
        <h2 className="final-cta-title">Ready to get in early?</h2>
        <p className="final-cta-sub">
          The window for open, private messaging won&apos;t last. Claim your spot before access gets scarce.
        </p>
        <div className="final-cta-actions">
          <SmartDownloadButton downloadLinks={downloadLinks} className="btn btn-primary btn-lg hero-download-btn" />
          <Link to="/register" className="btn btn-secondary btn-lg">Sign up free</Link>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  const link = (id, label) => (
    <a
      href={`#${id}`}
      onClick={(e) => {
        e.preventDefault();
        scrollToId(id);
      }}
    >
      {label}
    </a>
  );

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="logo logo-small">
            <SlideLogo alt="" width={28} height={28} className="logo-img" />
            <span className="logo-text">Slide</span>
          </Link>
          <p className="footer-tagline">Messaging reimagined.</p>
          <p className="footer-location">
            <SwitzerlandFlag className="footer-location-flag" size={16} />
            Based in Switzerland
          </p>
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Product</span>
          {link('features', 'Features')}
          {link('how', 'How it works')}
          {link('download', 'Download')}
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Legal</span>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
        <div className="footer-col">
          <span className="footer-col-title">Account</span>
          <Link to="/login">Sign in</Link>
          <Link to="/register">Register</Link>
        </div>
      </div>
      <p className="footer-legal-note">
        No legal entity or commercial registration has been filed yet. Policies and disclosures will be
        updated as the project matures.
      </p>
      <p className="footer-copy">Â© {new Date().getFullYear()} Slide. All rights reserved.</p>
    </footer>
  );
}

function useConversionTracking() {
  useEffect(() => {
    const track = (selector, event, params) => {
      document.querySelectorAll(selector).forEach((el) => {
        el.addEventListener('click', () => {
          if (typeof window.gtag === 'function') window.gtag('event', event, params);
        });
      });
    };
    track('.hero-download-btn', 'cta_click', { cta_location: 'hero_download' });
    track('.nav-cta', 'cta_click', { cta_location: 'nav' });
    track('.hero-register-btn', 'cta_click', { cta_location: 'hero_register' });
  }, []);
}

export default function LandingPage() {
  useConversionTracking();
  const downloadLinks = useDownloadLinks();

  return (
    <div className="landing-page" data-theme="dark">
      <LandingBackdrop />
      <div className="noise-overlay" aria-hidden />
      <Header />
      <main>
        <Hero downloadLinks={downloadLinks} />
        <TrustBar />
        <Features />
        <HowItWorks />
        <Download downloadLinks={downloadLinks} />
        <About />
        <FAQ />
        <Principles />
        <FinalCTA downloadLinks={downloadLinks} />
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
    </div>
  );
}
