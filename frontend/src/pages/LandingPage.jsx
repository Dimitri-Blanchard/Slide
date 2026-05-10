import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { DOWNLOAD_BASE, getLatestDownloadArtifacts } from '../api';
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
        text: 'Slide is a team messaging app that brings everything together: real-time chat, voice channels, organized servers, direct messages, and presence indicators. Privacy-first. Built with Electron, React, and Socket.io.',
      },
    },
    {
      '@type': 'Question',
      name: 'What makes Slide different?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "You get the features you need - voice channels, servers, DMs, and presence. What sets us apart is privacy: we don't sell your data, mine it for ads, or track you. Your conversations stay yours.",
      },
    },
    {
      '@type': 'Question',
      name: 'Is my data private?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Yes. Privacy is at the core of Slide. We don't sell your data, use it for targeted ads, or track you. Your conversations stay yours.",
      },
    },
    {
      '@type': 'Question',
      name: 'What platforms does Slide support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Slide is available for Windows 10/11 (64-bit), Android (APK), and Web.',
      },
    },
  ],
};

const features = [
  {
    title: 'Real-time chat',
    desc: 'Messages sync instantly. Typing indicators, read status, and presence - stay in the loop.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Teams & channels',
    desc: 'Create servers, organize channels, and invite your team. Public and private - you decide.',
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
    desc: 'Jump into voice channels with one click. Talk, share, and record - no extra setup.',
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
    desc: 'One-on-one or group DMs. Add friends by username and keep conversations private.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: 'Presence & activity',
    desc: "See who's online, set your status, and customize your profile with avatars and banners.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: 'Privacy first',
    desc: "Your conversations stay yours. We don't sell your data, mine it for ads, or track you.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

const faqs = [
  { q: 'Is Slide free?', a: 'Yes. Slide is free to use. Core features at no cost - optional upgrades when you need more. No credit card required.' },
  { q: 'What is Slide?', a: 'Slide is a team messaging app with real-time chat, voice channels, servers, direct messages, and presence indicators.' },
  { q: 'What makes Slide different?', a: "Privacy first: we don't sell your data, track you for ads, or profile your conversations." },
  { q: 'Is my data private?', a: 'Yes. Privacy is at the core of Slide, with strong defaults and transparent controls.' },
  { q: 'What platforms does Slide support?', a: 'Slide supports Windows 10/11, Android APK, and Web.' },
];

function DownloadIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C4.18 11.06 2 14.5 2 18.5h20c0-4-2.18-7.44-5.4-9.02zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function Header() {
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <header className="header">
      <nav className="nav">
        <a href="#" className="logo" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="logo-text">Slide</span>
        </a>
        <ul className="nav-links">
          <li><a href="#features" onClick={scrollTo('features')}>Features</a></li>
          <li><a href="#download" onClick={scrollTo('download')}>Download</a></li>
          <li><a href="#faq" onClick={scrollTo('faq')}>FAQ</a></li>
          <li><a href="#about" onClick={scrollTo('about')}>About</a></li>
        </ul>
        <div className="nav-actions">
          <Link to="/login" className="btn btn-secondary nav-web-btn">
            <GlobeIcon />
            Open in Web
          </Link>
          <a href="#download" className="btn btn-primary nav-cta" onClick={scrollTo('download')}>
            Get Slide - Free
          </a>
        </div>
      </nav>
    </header>
  );
}

function Hero() {
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="hero">
      <div className="hero-content">
        <motion.div className="hero-badge" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          Free - Privacy-first - Cross-platform
        </motion.div>
        <h1 className="hero-title">
          <motion.span className="hero-title-line" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
            Messaging
          </motion.span>
          <motion.span className="hero-title-line accent" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}>
            that flows.
          </motion.span>
        </h1>
        <motion.p className="hero-subtitle" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
          Teams, channels, voice, and direct messages - all in one place. Real-time collaboration designed for how you work.
        </motion.p>
        <div className="hero-cta">
          <motion.a href="#download" className="btn btn-primary btn-lg hero-download-btn" onClick={scrollTo('download')} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}>
            <DownloadIcon />
            Download Free
          </motion.a>
          <p className="hero-hint">Windows, Android and Web - Latest: v1.0.0</p>
          <a href="#features" className="hero-secondary-cta" onClick={scrollTo('features')}>See features</a>
        </div>
      </div>
      <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }}>
        <div className="hero-mockup">
          <div className="mockup-header">
            <span className="mockup-header-icon" aria-hidden>#</span>
            <span className="mockup-title">general</span>
          </div>
          <div className="mockup-chat">
            <div className="mockup-msg mockup-msg-them">
              <div className="mockup-avatar" />
              <div className="mockup-body">
                <div className="mockup-header-row">
                  <span className="mockup-sender">Alex</span>
                  <time className="mockup-time">Today at 2:34 PM</time>
                </div>
                <div className="mockup-content">Hey team, ready for the call?</div>
              </div>
            </div>
            <div className="mockup-msg mockup-msg-you">
              <div className="mockup-avatar" />
              <div className="mockup-body">
                <div className="mockup-header-row">
                  <span className="mockup-sender">You</span>
                  <time className="mockup-time">Today at 2:35 PM</time>
                </div>
                <div className="mockup-content">On my way! 🚀</div>
              </div>
            </div>
            <div className="mockup-typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-text">Taylor is typing...</span>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="features" className="features">
      <div className="section-header">
        <h2 className="section-title">Everything you need</h2>
        <p className="section-subtitle">A complete messaging experience for teams and friends</p>
      </div>
      <motion.div ref={ref} className="features-grid" initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }}>
        {features.map((f) => (
          <motion.article key={f.title} className="feature-card" variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}>
            <div className="feature-icon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </motion.article>
        ))}
      </motion.div>
    </section>
  );
}

function TrustBar() {
  return (
    <section className="trust-bar">
      <div className="trust-stats">
        <span className="trust-stat"><strong>10,000+</strong> downloads</span>
        <span className="trust-dot" aria-hidden>•</span>
        <span className="trust-stat">Cross-platform</span>
        <span className="trust-dot" aria-hidden>•</span>
        <span className="trust-stat">Active development</span>
      </div>
      <div className="trust-badges">
        <span className="trust-badge">Free to start</span>
        <span className="trust-badge">No credit card</span>
        <span className="trust-badge">Privacy-first</span>
      </div>
    </section>
  );
}

function Download() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [downloadLinks, setDownloadLinks] = useState({
    windows: `${DOWNLOAD_BASE}/download/Slide_Alpha_v0.0.1.rar`,
    android: `${DOWNLOAD_BASE}/download/Slide_Alpha_v0.0.1.apk`,
  });

  useEffect(() => {
    let cancelled = false;
    getLatestDownloadArtifacts()
      .then((data) => {
        if (cancelled || !data) return;

        const resolveUrl = (entry, fallback) => {
          if (!entry?.url) return fallback;
          if (entry.url.startsWith('http://') || entry.url.startsWith('https://')) return entry.url;
          return `${DOWNLOAD_BASE}${entry.url}`;
        };

        setDownloadLinks((prev) => ({
          windows: resolveUrl(data.windows, prev.windows),
          android: resolveUrl(data.android, prev.android),
        }));
      })
      .catch(() => {
        // Fallback keeps static filenames when endpoint is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const platforms = [
    { id: 'windows', name: 'Windows', desc: 'Windows 10/11 (64-bit)', href: downloadLinks.windows, label: 'Download for Windows', iconImg: '/assets/windows-icon.png' },
    { id: 'android', name: 'Android', desc: 'APK · 64-bit', href: downloadLinks.android, label: 'Download for Android', Icon: AndroidIcon },
  ];

  const trackDownload = (platform) => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'download', { platform });
    }
  };

  return (
    <section id="download" className="download">
      <div className="download-bg" />
      <div className="section-header">
        <span className="download-badge">Latest alpha build</span>
        <h2 className="section-title">Download Slide</h2>
        <p className="section-subtitle">Choose your platform — free, no account required</p>
      </div>
      <motion.div ref={ref} className="download-cards" initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}>
        {platforms.map((p) => (
          <motion.div key={p.id} className={`download-card download-card--${p.id}`} variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } }}>
            <div className="download-card-icon" aria-hidden>
              {p.iconImg ? (
                <img src={p.iconImg} alt="" className="download-card-icon-img" />
              ) : (
                <p.Icon />
              )}
            </div>
              <h3>{p.name}</h3>
              <p className="download-card-desc">{p.desc}</p>
              <a href={p.href} className="btn btn-primary download-btn" rel="noopener noreferrer" onClick={() => trackDownload(p.id)}>
                <DownloadIcon />
                {p.label}
              </a>
            </motion.div>
        ))}
      </motion.div>
      <p className="download-web-hint">
        Prefer the browser? <Link to="/login">Open Slide in Web</Link> — no install needed.
      </p>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="about">
      <h2 className="section-title">Built for connection</h2>
      <p className="about-text">
        Slide is a modern messaging app for teams and communities. Free to use, built with privacy at its core.
        Real-time chat, voice channels, organized servers, and direct messages - designed to be simple and powerful.
      </p>
      <div className="about-meta">
        <span>Slide v1.0.0</span>
        <span>·</span>
        <span>Electron - React - Socket.io</span>
      </div>
    </section>
  );
}

function FAQ() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [open, setOpen] = useState(null);

  return (
    <section id="faq" className="faq">
      <div className="section-header">
        <h2 className="section-title">Frequently asked questions</h2>
      </div>
      <motion.div ref={ref} className="faq-list" initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}>
        {faqs.map((faq, i) => {
          const isOpen = open === i;
          return (
            <motion.div key={faq.q} className={`faq-item ${isOpen ? 'faq-item-open' : ''}`}>
              <button type="button" className="faq-question" onClick={() => setOpen((prev) => (prev === i ? null : i))} aria-expanded={isOpen}>
                {faq.q}
                <motion.span className="faq-icon" animate={{ rotate: isOpen ? 45 : 0 }}>+</motion.span>
              </button>
              <motion.div className="faq-answer-wrapper" initial={false} animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}>
                <p className="faq-answer">{faq.a}</p>
              </motion.div>
            </motion.div>
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
      <motion.div className="principles-inner" initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}>
        <h2 className="principles-title">Independent by design</h2>
        <p className="principles-text">
          We believe communication should be free from mandated access. No backdoors, no authority over your conversations.
        </p>
        <div className="principles-badges">
          <span className="principles-badge">No backdoors</span>
          <span className="principles-badge">No mandated access</span>
          <span className="principles-badge">User-first</span>
        </div>
      </motion.div>
    </section>
  );
}

function StickyCTA() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className={`sticky-cta ${visible ? 'visible' : ''}`} aria-hidden={!visible}>
      <span className="sticky-cta-text">Ready to get started?</span>
      <a href="#download" className="btn btn-primary sticky-cta-btn" onClick={(e) => {
        e.preventDefault();
        document.getElementById('download')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}>
        Download Slide Free
      </a>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <Link to="/" className="logo logo-small">
          <span className="logo-text">Slide</span>
        </Link>
        <div className="footer-links">
          <Link to="/privacy">Privacy Policy</Link>
          <span className="footer-sep">·</span>
          <Link to="/terms">Terms of Service</Link>
        </div>
        <p className="footer-copy">© 2025 Slide. Messaging reimagined.</p>
      </div>
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
    track('.sticky-cta-btn', 'cta_click', { cta_location: 'sticky_bar' });
  }, []);
}

export default function LandingPage() {
  useConversionTracking();

  return (
    <div className="landing-page" data-theme="dark">
      <div className="noise-overlay" aria-hidden />
      <Header />
      <main>
        <Hero />
        <TrustBar />
        <Features />
        <Download />
        <About />
        <FAQ />
        <Principles />
      </main>
      <StickyCTA />
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_SCHEMA) }} />
    </div>
  );
}
