import React from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import './Legal.css';

export default function PrivacyPolicy() {
  return (
    <AuthShell
      variant="legal"
      legalTitle="Slide — Privacy Policy"
    >
      <div className="legal-page legal-page--in-shell">
        <article className="legal-document">
        <div className="legal-document-header">
          <h1>Privacy Policy</h1>
          <p className="legal-updated">Last updated: February 27, 2026</p>
        </div>

        <nav className="legal-toc" aria-label="Table of contents">
          <h3>Contents</h3>
          <ul>
            <li><a href="#introduction">1. Introduction</a></li>
            <li><a href="#definitions">2. Definitions</a></li>
            <li><a href="#information-we-collect">3. Information We Collect</a></li>
            <li><a href="#end-to-end-encryption">4. Data in Transit and at Rest</a></li>
            <li><a href="#legal-basis">5. Legal Basis for Processing (GDPR)</a></li>
            <li><a href="#how-we-use">6. How We Use Your Information</a></li>
            <li><a href="#data-sharing">7. Data Sharing and Disclosure</a></li>
            <li><a href="#data-retention">8. Data Retention and Deletion</a></li>
            <li><a href="#cookies">9. Cookies and Similar Technologies</a></li>
            <li><a href="#data-security">10. Data Security</a></li>
            <li><a href="#breach">11. Data Breach Notification</a></li>
            <li><a href="#your-rights">12. Your Privacy Rights</a></li>
            <li><a href="#gdpr-rights">13. European Economic Area (EEA) & UK Rights</a></li>
            <li><a href="#ccpa-rights">14. California Privacy Rights (CCPA/CPRA)</a></li>
            <li><a href="#other-us-states">15. Other U.S. State Privacy Rights</a></li>
            <li><a href="#international">16. International Transfers</a></li>
            <li><a href="#automated">17. Automated Decision-Making and Profiling</a></li>
            <li><a href="#sensitive">18. Sensitive Personal Information</a></li>
            <li><a href="#third-parties">19. Third-Party Links and Services</a></li>
            <li><a href="#do-not-track">20. Do Not Track</a></li>
            <li><a href="#children">21. Children's Privacy</a></li>
            <li><a href="#changes">22. Changes to This Policy</a></li>
            <li><a href="#contact">23. Contact Us</a></li>
          </ul>
        </nav>

        <div className="legal-content">
          <section id="introduction">
            <h2>1. Introduction</h2>
            <p>
              Slide ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, retain, and safeguard your information when you use our messaging platform, including our website, mobile applications, desktop applications, APIs, and any related services (collectively, the "Services").
            </p>
            <p>
              Slide is built around a core principle: privacy by design. We do not collect IP addresses, location data, or device fingerprints. We do not track your movements or profile your behavior. Your identity on Slide is defined only by your account — not by who or where you are in the physical world.
            </p>
            <p>
              By using Slide, you consent to the practices described in this policy. If you do not agree with this policy, please do not use our Services. If you are providing consent on behalf of an organization, you represent that you have authority to bind that organization.
            </p>
            <p>
              We respect and comply with the RGPD (Règlement Général sur la Protection des Données / General Data Protection Regulation) and all applicable data protection laws. This policy applies to all users globally. Certain jurisdictions may have additional rights or requirements as described in the sections below. In the event of a conflict between this general policy and jurisdiction-specific requirements, the more protective provisions shall apply to the extent permitted by law.
            </p>
          </section>

          <section id="definitions">
            <h2>2. Definitions</h2>
            <p>
              <strong>"Personal Data" or "Personal Information"</strong> means any information relating to an identified or identifiable natural person. An identifiable person is one who can be identified, directly or indirectly, by reference to an identifier such as a name, identification number, location data, online identifier, or one or more factors specific to physical, physiological, genetic, mental, economic, cultural, or social identity.
            </p>
            <p>
              <strong>"Processing"</strong> means any operation or set of operations performed on personal data (collection, storage, use, disclosure, erasure, etc.).
            </p>
            <p>
              <strong>"Controller"</strong> means the entity that determines the purposes and means of processing. Slide is the controller for personal data processed in connection with the Services.
            </p>
            <p>
              <strong>"Processor"</strong> means an entity that processes personal data on behalf of the controller. Our infrastructure and payment providers act as processors.
            </p>
          </section>

          <section id="information-we-collect">
            <h2>3. Information We Collect</h2>
            <h3>3.1 Information You Provide Directly</h3>
            <p>When you create an account or use our Services, we collect:</p>
            <ul>
              <li><strong>Account information:</strong> Email address, display name, username, password (stored in hashed form using industry-standard algorithms), and optionally a profile picture and bio.</li>
              <li><strong>Payment information:</strong> For Slide Nitro or paid features, we collect billing name, billing address, and payment method details. Payment card numbers are processed by our payment processor and are not stored by us.</li>
              <li><strong>Communications:</strong> When you contact support, report issues, or provide feedback, we collect the content of your communications and any attachments.</li>
              <li><strong>Verification information:</strong> We may collect information to verify your identity or age when required (e.g., government-issued ID in limited circumstances).</li>
            </ul>
            <h3>3.2 Information Collected Automatically</h3>
            <p>
              <strong>Account and usage metadata:</strong> Login timestamps, presence status (online/offline/away), server and channel membership, role assignments, and basic feature usage. This is necessary to operate the Services.
            </p>
            <p>
              <strong>Device session records:</strong> When you log in, we record a device identifier and a friendly device name (e.g. "Windows PC", "Android") so you can review and revoke active sessions. We do <strong>not</strong> store your IP address, geographic location, or User-Agent string.
            </p>
            <p>
              <strong>Log data:</strong> We retain limited server logs (e.g., request timestamps, error codes) for security and debugging. We do not log message content or identifiable connection metadata.
            </p>
            <h3>3.3 Information We Do NOT Collect</h3>
            <p>We do <strong>not</strong> collect or store:</p>
            <ul>
              <li>Your IP address (never stored, not even in anonymized or partial form)</li>
              <li>Geographic location or geolocation data</li>
              <li>Raw User-Agent strings or device fingerprints</li>
              <li>Browser type, OS version beyond what generates a friendly label</li>
              <li>Behavioral tracking, analytics profiles, or ad-targeting data</li>
            </ul>
            <p>
              We do not sell your personal information. We do not share your personal information for cross-context behavioral advertising. We do not use your personal information for purposes materially different from those disclosed at collection without providing notice and, where required, obtaining consent.
            </p>
          </section>

          <section id="end-to-end-encryption">
            <h2>4. Data in Transit and at Rest</h2>
            <p>
              All communication between your device and our servers is protected by TLS encryption in transit. Passwords are never stored in plain text — we use Argon2id (a password-hashing competition winner) with per-user salts so that even if our database were compromised, your password could not be recovered.
            </p>
            <p>
              Messages and files are stored server-side to enable multi-device sync and history. Slide does not currently implement end-to-end encryption for message content. Access to stored messages is restricted to the participants of each conversation and the server administrators of the team in which they occur.
            </p>
            <p>
              We may introduce additional encryption options in the future. Any changes that affect the confidentiality of your data will be communicated in advance.
            </p>
          </section>

          <section id="legal-basis">
            <h2>5. Legal Basis for Processing (GDPR)</h2>
            <p>
              If you are in the European Economic Area (EEA) or United Kingdom, we process your personal data on the following legal bases:
            </p>
            <ul>
              <li><strong>Contract performance:</strong> To provide the Services you have requested (e.g., account creation, message delivery, Nitro features).</li>
              <li><strong>Legitimate interests:</strong> To operate, secure, and improve the Services; prevent fraud and abuse; debug and fix issues; enforce our terms. We balance our interests against your rights and only process where necessary.</li>
              <li><strong>Legal obligation:</strong> To comply with applicable laws (e.g., tax, anti-money laundering, response to lawful requests).</li>
              <li><strong>Consent:</strong> Where we have asked for and you have given explicit consent (e.g., optional marketing, certain cookies). You may withdraw consent at any time without affecting the lawfulness of processing based on consent before withdrawal.</li>
              <li><strong>Vital interests:</strong> In rare circumstances, to protect your vital interests or those of another person (e.g., emergency response).</li>
            </ul>
            <p>
              Where we rely on consent, you have the right to withdraw it at any time. Where we rely on legitimate interests, you have the right to object (see Section 13). Where processing is required by law, we may not be able to accommodate requests to restrict or delete such data.
            </p>
          </section>

          <section id="how-we-use">
            <h2>6. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve the Services, including new features and functionality</li>
              <li>Authenticate your identity and secure your account against unauthorized access</li>
              <li>Deliver messages, calls, notifications, and files to intended recipients</li>
              <li>Display server and channel information, member lists, presence status, and user profiles</li>
              <li>Process transactions related to Slide Nitro or other paid features</li>
              <li>Send you important service updates, security notices, and transactional communications</li>
              <li>Respond to your support requests, feedback, and data subject requests</li>
              <li>Detect, prevent, and address fraud, abuse, spam, security incidents, and violations of our Terms</li>
              <li>Comply with legal obligations, lawful government requests, and regulatory requirements</li>
              <li>Exercise or defend our legal rights</li>
              <li>Analyze aggregated, anonymized, or de-identified data to improve the product and user experience</li>
              <li>Conduct internal research and development</li>
            </ul>
            <p>
              We will not use your personal information for purposes materially different from those disclosed without providing notice and, where required by law, obtaining your consent.
            </p>
          </section>

          <section id="data-sharing">
            <h2>7. Data Sharing and Disclosure</h2>
            <p>
              We do not sell your personal information. We do not share your personal information for cross-context behavioral advertising. We may share your information only in the following circumstances:
            </p>
            <ul>
              <li><strong>With other users:</strong> Your display name, username, profile picture, presence status, and server/channel membership are visible to other users as you interact. Message content is shared only with intended recipients and is encrypted.</li>
              <li><strong>Service providers (processors):</strong> We engage third parties to host infrastructure, process payments, provide analytics, deliver support, and perform other services. These providers are contractually bound to protect your data, use it only for the services they provide to us, and comply with applicable data protection laws. We maintain a list of key sub-processors; contact us for details.</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by applicable law, regulation, legal process, or governmental or regulatory request, including to meet national security or law enforcement requirements. We will notify you where legally permitted and will challenge requests we believe are overly broad or unlawful where appropriate.</li>
              <li><strong>Safety and rights:</strong> We may share information to protect the rights, property, or safety of Slide, our users, or the public; to enforce our Terms; or to investigate potential violations.</li>
              <li><strong>Corporate transactions:</strong> In the event of a merger, acquisition, reorganization, bankruptcy, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change and any choices you may have.</li>
            </ul>
          </section>

          <section id="data-retention">
            <h2>8. Data Retention and Deletion</h2>
            <p>
              We retain your personal information only for as long as necessary to fulfill the purposes for which it was collected, including to satisfy legal, regulatory, accounting, or reporting requirements.
            </p>
            <h3>8.1 Retention Periods</h3>
            <ul>
              <li><strong>Account data:</strong> Retained while your account is active. Deleted within 30 days of account closure, except where longer retention is required by law.</li>
              <li><strong>Encrypted message content and files:</strong> Stored until you or the recipient deletes them, or upon account closure. We cannot access content; deletion removes it from our servers.</li>
              <li><strong>Transaction and payment records:</strong> Retained for 7 years for tax, accounting, and legal compliance (or as required by applicable law).</li>
              <li><strong>Security and abuse logs:</strong> Retained for up to 90 days for security purposes, unless a longer period is required for investigation or legal proceedings.</li>
              <li><strong>Support communications:</strong> Retained for up to 3 years after resolution, unless longer retention is required.</li>
              <li><strong>Backups:</strong> Deleted data may persist in backups for up to 90 days before permanent deletion.</li>
            </ul>
            <h3>8.2 Account Deletion</h3>
            <p>
              When you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required or permitted to retain it by law. Note that we cannot delete copies of messages or files retained by other users or on their devices.
            </p>
          </section>

          <section id="cookies">
            <h2>9. Cookies and Similar Technologies</h2>
            <p>
              We use cookies, local storage, and similar technologies to maintain your session, remember your preferences, improve security, and analyze how our Services are used.
            </p>
            <ul>
              <li><strong>Essential:</strong> Required for authentication, security, and core functionality. Cannot be disabled without impairing the Services.</li>
              <li><strong>Preference:</strong> Remember your settings (theme, language, notifications). Can be disabled in browser or app settings.</li>
              <li><strong>Security:</strong> Help detect and prevent abuse, fraud, and unauthorized access.</li>
              <li><strong>Analytics:</strong> We may use first-party analytics to understand usage patterns. We do not use third-party advertising cookies or cross-site tracking.</li>
            </ul>
            <p>
              You can manage cookies through your browser settings. Disabling certain cookies may affect functionality. We do not respond to Do Not Track (DNT) signals in a legally binding manner; see Section 20.
            </p>
          </section>

          <section id="data-security">
            <h2>10. Data Security</h2>
            <p>
              We implement technical and organizational measures designed to protect your personal data against unauthorized access, alteration, disclosure, or destruction. These include:
            </p>
            <ul>
              <li>Encryption in transit (TLS 1.3) and at rest where applicable</li>
              <li>Access controls and authentication (including 2FA support)</li>
              <li>Regular security assessments and penetration testing</li>
              <li>Employee training and confidentiality obligations</li>
              <li>Incident response and breach notification procedures</li>
              <li>Data minimization and purpose limitation</li>
            </ul>
            <p>
              No method of transmission over the Internet or electronic storage is 100% secure. While we strive to protect your data, we cannot guarantee absolute security. You are responsible for keeping your password secure and for enabling two-factor authentication.
            </p>
          </section>

          <section id="breach">
            <h2>11. Data Breach Notification</h2>
            <p>
              In the event of a personal data breach that is likely to result in a high risk to your rights and freedoms, we will notify the relevant supervisory authority without undue delay and, where feasible, within 72 hours. We will also notify affected users without undue delay where the breach is likely to result in high risk to them.
            </p>
            <p>
              Where required by law (e.g., GDPR, state breach notification laws), we will provide notice in accordance with applicable requirements. Notices may be sent by email, in-app notification, or other reasonable means.
            </p>
          </section>

          <section id="your-rights">
            <h2>12. Your Privacy Rights</h2>
            <p>
              Depending on your location, you may have the following rights (subject to applicable limitations):
            </p>
            <ul>
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Rectification:</strong> Correct inaccurate or incomplete data.</li>
              <li><strong>Erasure:</strong> Request deletion of your personal data ("right to be forgotten").</li>
              <li><strong>Restriction:</strong> Request that we limit how we process your data in certain circumstances.</li>
              <li><strong>Portability:</strong> Receive your data in a structured, commonly used, machine-readable format.</li>
              <li><strong>Objection:</strong> Object to processing based on legitimate interests or for direct marketing.</li>
              <li><strong>Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time.</li>
              <li><strong>Non-discrimination:</strong> Not be discriminated against for exercising your privacy rights (where applicable).</li>
            </ul>
            <p>
              To exercise these rights, contact us through the app (Settings / Support) or at the contact information below. We will respond within the timeframes required by applicable law (e.g., 30 days under CCPA, 1 month under GDPR, subject to extensions where permitted). We may need to verify your identity before processing requests.
            </p>
          </section>

          <section id="gdpr-rights">
            <h2>13. European Economic Area (EEA) & UK Rights</h2>
            <p>
              If you are in the EEA or UK, you have the rights described in Section 12, plus:
            </p>
            <ul>
              <li><strong>Right to lodge a complaint:</strong> You may lodge a complaint with your local data protection supervisory authority. In the UK, this is the Information Commissioner's Office (ICO). In the EU, you can find your authority at <a href="https://edpb.europa.eu/about-edpb/about-edpb/members_en" target="_blank" rel="noopener noreferrer">edpb.europa.eu</a>.</li>
              <li><strong>Right to object to processing:</strong> You may object to processing based on legitimate interests. We will stop processing unless we demonstrate compelling legitimate grounds that override your interests, or for the establishment, exercise, or defense of legal claims.</li>
              <li><strong>Data Protection Officer:</strong> For EEA/UK data protection matters, contact our Data Protection Officer at dpo@slide.app or the address in Section 23.</li>
            </ul>
            <p>
              Our legal basis for processing is described in Section 5. We will only transfer your data outside the EEA/UK with appropriate safeguards (Section 16).
            </p>
          </section>

          <section id="ccpa-rights">
            <h2>14. California Privacy Rights (CCPA/CPRA)</h2>
            <p>
              If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
            </p>
            <ul>
              <li><strong>Right to know:</strong> Request disclosure of the categories and specific pieces of personal information we have collected about you, the categories of sources, purposes, and third parties with whom we share it.</li>
              <li><strong>Right to delete:</strong> Request deletion of your personal information, subject to certain exceptions (e.g., completing transactions, detecting security incidents, complying with legal obligations).</li>
              <li><strong>Right to correct:</strong> Request correction of inaccurate personal information.</li>
              <li><strong>Right to limit use of sensitive personal information:</strong> We do not use sensitive personal information (as defined by CPRA) for purposes beyond what is necessary to provide the Services, except as permitted by law.</li>
              <li><strong>Right to opt-out of sale/sharing:</strong> We do not sell personal information. We do not share personal information for cross-context behavioral advertising. If our practices change, we will provide an opt-out mechanism.</li>
              <li><strong>Right to non-discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
            </ul>
            <p>
              To exercise these rights, use the methods in Section 23 or visit our Privacy Request page (if available). We will verify your identity before processing. You may designate an authorized agent to make requests on your behalf; we will require proof of authorization.
            </p>
            <p>
              We have collected the following categories of personal information in the past 12 months: identifiers (e.g., name, email, username, device ID); commercial information (e.g., purchase history); and internet activity (e.g., login timestamps, feature usage). We do not collect IP addresses, geolocation data, biometric data, or health information. We do not use your data for behavioral advertising or profiling.
            </p>
          </section>

          <section id="other-us-states">
            <h2>15. Other U.S. State Privacy Rights</h2>
            <p>
              Residents of Virginia, Colorado, Connecticut, Utah, Texas, Oregon, and other states with comprehensive privacy laws may have additional rights, including:
            </p>
            <ul>
              <li>Right to access, correct, delete, and port personal data</li>
              <li>Right to opt out of sale, targeted advertising, and profiling</li>
              <li>Right to opt in before we process sensitive data for certain purposes</li>
              <li>Right to appeal our response to a request</li>
            </ul>
            <p>
              To exercise these rights, contact us using the information in Section 23. Nevada residents may opt out of the sale of certain covered information; we do not currently sell such information, but you may submit a request to dpo@slide.app.
            </p>
          </section>

          <section id="international">
            <h2>16. International Transfers</h2>
            <p>
              Your information may be processed in countries other than your own, including the United States and members of the European Economic Area. Data protection laws in these countries may differ from those in your residence.
            </p>
            <p>
              When we transfer personal data from the EEA, UK, or Switzerland to other countries, we ensure appropriate safeguards are in place, including:
            </p>
            <ul>
              <li>Standard Contractual Clauses (SCCs) approved by the European Commission</li>
              <li>UK International Data Transfer Agreement or Addendum</li>
              <li>Where applicable, adequacy decisions or other mechanisms recognized by relevant authorities</li>
            </ul>
            <p>
              You may request a copy of the safeguards we use for your data transfers by contacting us.
            </p>
          </section>

          <section id="automated">
            <h2>17. Automated Decision-Making and Profiling</h2>
            <p>
              We do not use your personal information for automated decision-making that produces legal effects or similarly significantly affects you. We do not engage in profiling for such purposes.
            </p>
            <p>
              We may use automated systems to detect spam, abuse, and security threats. Such processing does not produce legal or similarly significant effects and is necessary for the performance of our Services.
            </p>
          </section>

          <section id="sensitive">
            <h2>18. Sensitive Personal Information</h2>
            <p>
              We do not knowingly collect sensitive personal information (e.g., racial or ethnic origin, political opinions, religious beliefs, health, biometric data, sexual orientation) except where necessary to provide the Services (e.g., if you voluntarily include such information in your profile or messages). We do not use sensitive information for purposes beyond providing the Services, unless required by law or with your explicit consent.
            </p>
          </section>

          <section id="third-parties">
            <h2>19. Third-Party Links and Services</h2>
            <p>
              The Services may contain links to third-party websites or integrate with third-party services. We are not responsible for the privacy practices of third parties. We encourage you to read their privacy policies before providing any information.
            </p>
          </section>

          <section id="do-not-track">
            <h2>20. Do Not Track</h2>
            <p>
              Some browsers offer a "Do Not Track" (DNT) signal. There is no universal standard for how websites should respond to DNT. We do not currently respond to DNT signals in a legally binding manner. We do not track you across third-party websites for advertising purposes.
            </p>
          </section>

          <section id="children">
            <h2>21. Children's Privacy</h2>
            <p>
              The Services are not intended for users under 13 years of age (or the minimum age in your jurisdiction, if higher, such as 16 in certain EEA countries). We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with personal information without your consent, please contact us immediately. We will delete such information promptly.
            </p>
            <p>
              If we learn that we have inadvertently collected personal information from a child, we will take steps to delete it as soon as reasonably practicable.
            </p>
          </section>

          <section id="changes">
            <h2>22. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of material changes by:
            </p>
            <ul>
              <li>Posting the updated policy on our website</li>
              <li>Updating the "Last updated" date</li>
              <li>Providing in-app notice or email where appropriate</li>
              <li>Obtaining consent where required by law for material changes</li>
            </ul>
            <p>
              Your continued use of the Services after the effective date of changes constitutes acceptance of the revised policy, except where further consent is required by law. We encourage you to review this policy periodically.
            </p>
          </section>

          <section id="contact">
            <h2>23. Contact Us</h2>
            <p>
              For questions about this Privacy Policy, to exercise your privacy rights, or for data protection inquiries:
            </p>
            <ul>
              <li><strong>Through the app:</strong> Settings / Support</li>
              <li><strong>Email:</strong> privacy@slide.app (or the support email provided in your region)</li>
              <li><strong>Data Protection Officer (EEA/UK):</strong> dpo@slide.app</li>
              <li><strong>Mail:</strong> Slide, [Legal Address], Attn: Privacy</li>
            </ul>
            <p>
              We will respond to legitimate requests within the timeframes required by applicable law. If you are not satisfied with our response, you may lodge a complaint with your local data protection authority (see Section 13 for EEA/UK).
            </p>
          </section>
        </div>

        <footer className="legal-footer">
          <div className="legal-footer-links">
            <span className="legal-footer-current">Privacy Policy</span>
            <span className="legal-footer-sep">·</span>
            <Link to="/terms">Terms of Service</Link>
          </div>
          <Link to="/" className="legal-back-link">Back to Home</Link>
        </footer>
      </article>
      </div>
    </AuthShell>
  );
}
