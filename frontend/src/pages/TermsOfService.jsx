import React from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../components/AuthShell';
import './Legal.css';

export default function TermsOfService() {
  return (
    <AuthShell
      variant="legal"
      legalTitle="Slide — Terms of Service"
    >
      <div className="legal-page legal-page--in-shell">
        <article className="legal-document">
        <div className="legal-document-header">
          <h1>Terms of Service</h1>
          <p className="legal-updated">Last updated: February 25, 2025</p>
        </div>

        <nav className="legal-toc" aria-label="Table of contents">
          <h3>Contents</h3>
          <ul>
            <li><a href="#acceptance">1. Acceptance of Terms</a></li>
            <li><a href="#eligibility">2. Eligibility</a></li>
            <li><a href="#account">3. Your Account</a></li>
            <li><a href="#acceptable-use">4. Acceptable Use</a></li>
            <li><a href="#user-content">5. User Content and Conduct</a></li>
            <li><a href="#dmca">6. DMCA and Copyright</a></li>
            <li><a href="#intellectual-property">7. Intellectual Property</a></li>
            <li><a href="#subscriptions">8. Slide Nitro and Paid Features</a></li>
            <li><a href="#termination">9. Termination</a></li>
            <li><a href="#disclaimers">10. Disclaimers</a></li>
            <li><a href="#limitation">11. Limitation of Liability</a></li>
            <li><a href="#indemnification">12. Indemnification</a></li>
            <li><a href="#arbitration">13. Dispute Resolution and Arbitration</a></li>
            <li><a href="#governing-law">14. Governing Law and Venue</a></li>
            <li><a href="#export">15. Export and Sanctions Compliance</a></li>
            <li><a href="#force-majeure">16. Force Majeure</a></li>
            <li><a href="#general">17. General Provisions</a></li>
            <li><a href="#contact">18. Contact Us</a></li>
          </ul>
        </nav>

        <div className="legal-content">
          <section id="acceptance">
            <h2>1. Acceptance of Terms</h2>
            <p>
              Welcome to Slide. These Terms of Service ("Terms") constitute a legally binding agreement between you ("you" or "User") and Slide ("we," "us," or "our") governing your access to and use of the Slide messaging platform, including our website, applications, APIs, and all related services (the "Services").
            </p>
            <p>
              By creating an account, accessing, or using the Services, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <Link to="/privacy">Privacy Policy</Link>, which is incorporated by reference. If you are using the Services on behalf of an organization, you represent that you have authority to bind that organization and that the organization agrees to these Terms.
            </p>
            <p>
              We may modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our website and, where appropriate, through in-app notice, email, or other reasonable means. Material changes will be effective no sooner than 30 days after notice unless required by law. Your continued use of the Services after the effective date constitutes acceptance of the revised Terms. If you do not agree to the modified Terms, you must stop using the Services and may close your account.
            </p>
            <p>
              <strong>ARBITRATION NOTICE:</strong> Except for certain types of disputes described in Section 13, you agree that disputes between you and Slide will be resolved by binding, individual arbitration, and you waive your right to participate in a class action lawsuit or class-wide arbitration. Please read Section 13 carefully.
            </p>
          </section>

          <section id="eligibility">
            <h2>2. Eligibility</h2>
            <p>
              You must be at least 13 years of age (or the minimum age required in your jurisdiction to consent to the use of online services, whichever is higher) to use Slide. In some jurisdictions, the minimum age may be 14, 15, or 16. You are responsible for complying with the laws of your jurisdiction.
            </p>
            <p>
              If you are under 18 years of age (or the age of majority in your jurisdiction), you represent that you have your parent or legal guardian's permission to use the Services and that they have reviewed and agreed to these Terms on your behalf. We may require verification of parental consent.
            </p>
            <p>
              You must not be prohibited from using the Services under applicable law. You represent and warrant that: (a) you are not located in, incorporated in, or a resident of a country subject to comprehensive embargo or designated as a "terrorist supporting" country by the United States or other applicable government; (b) you are not on any list of prohibited or restricted parties (e.g., OFAC, EU, UN sanctions lists); (c) you will not use the Services to facilitate transactions with sanctioned entities; and (d) your use of the Services complies with all applicable export control and sanctions laws.
            </p>
            <p>
              The Services are not available in all jurisdictions. We reserve the right to restrict access from any location at our discretion. By using the Services from outside our primary service regions, you are responsible for compliance with local laws.
            </p>
          </section>

          <section id="account">
            <h2>3. Your Account</h2>
            <h3>3.1 Account Creation</h3>
            <p>
              To use certain features, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate. You may not use a false name, impersonate another person, or create an account for anyone other than yourself without permission. You may not create multiple accounts for abusive purposes.
            </p>
            <h3>3.2 Account Security</h3>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials (including password and two-factor authentication credentials) and for all activities that occur under your account. You must notify us immediately of any unauthorized access or use. We recommend and strongly encourage enabling two-factor authentication (2FA) for additional security. We are not liable for any loss or damage arising from unauthorized use of your account due to your failure to maintain security.
            </p>
            <h3>3.3 Account Responsibility</h3>
            <p>
              You are solely responsible for your account and any content, activity, or conduct associated with it. You will not hold us liable for any loss or damage arising from the use of your account by any person. You may not sell, transfer, or assign your account or any rights therein.
            </p>
          </section>

          <section id="acceptable-use">
            <h2>4. Acceptable Use</h2>
            <p>
              You agree to use the Services only for lawful purposes and in accordance with these Terms and all applicable laws, rules, and regulations. You must not:
            </p>
            <ul>
              <li>Use the Services for any illegal purpose or in violation of any applicable local, national, or international law or regulation</li>
              <li>Harass, bully, threaten, intimidate, stalk, defame, or abuse other users, or promote violence against individuals or groups based on race, ethnicity, religion, gender, sexual orientation, disability, or other protected characteristics</li>
              <li>Impersonate any person or entity, misrepresent your affiliation, or use a false identity</li>
              <li>Spam, send unsolicited messages, engage in mass distribution of content, or use the Services for commercial solicitation without consent</li>
              <li>Upload, transmit, or distribute malware, viruses, worms, Trojan horses, ransomware, or other harmful or malicious code</li>
              <li>Attempt to gain unauthorized access to the Services, other accounts, our systems, or any network or systems connected to the Services</li>
              <li>Interfere with, disrupt, or create undue burden on the integrity or performance of the Services or any third-party systems</li>
              <li>Reverse engineer, decompile, disassemble, or attempt to derive the source code of the Services (except to the extent expressly permitted by applicable law that cannot be waived by contract)</li>
              <li>Scrape, harvest, crawl, or collect user data, content, or information through automated means (bots, scripts, etc.) without our prior written permission</li>
              <li>Use the Services to distribute child sexual abuse material (CSAM), child sexual exploitation material, terrorism-related content, or content that promotes or glorifies violence</li>
              <li>Distribute content that infringes any third party's intellectual property, privacy, or other rights</li>
              <li>Engage in phishing, social engineering, or other fraud</li>
              <li>Circumvent or attempt to circumvent any access controls, security measures, or usage limitations</li>
              <li>Use the Services to develop or distribute competing products or services</li>
              <li>Exploit the Services for purposes other than their intended use</li>
            </ul>
            <p>
              We reserve the right to investigate violations, remove content, suspend or terminate accounts, report to law enforcement, and take any other action we deem appropriate. We may cooperate with law enforcement in investigations. We do not have an obligation to monitor content but may do so at our discretion. You acknowledge that we may report illegal activity to authorities.
            </p>
          </section>

          <section id="user-content">
            <h2>5. User Content and Conduct</h2>
            <h3>5.1 Your Content</h3>
            <p>
              You retain ownership of the content you create, upload, or transmit through the Services ("User Content"). By submitting User Content, you grant Slide a worldwide, non-exclusive, royalty-free, sublicensable, transferable license to host, store, cache, transmit, display, perform, reproduce, modify, adapt, and process your User Content as necessary to provide, operate, improve, and promote the Services. This includes the right to copy and store your content on our servers (encrypted in the case of messages and files) and to display it to intended recipients. The license survives termination to the extent we need it to fulfill our legal obligations (e.g., retain backup copies during retention periods).
            </p>
            <h3>5.2 Content Standards</h3>
            <p>
              You represent and warrant that: (a) you own or have the necessary rights to your User Content and to grant the license above; (b) your User Content does not infringe any third party's intellectual property, privacy, publicity, or other rights; and (c) your User Content complies with these Terms and all applicable laws. You must not upload content that violates our Acceptable Use policy or that is illegal, harmful, threatening, abusive, harassing, defamatory, obscene, or otherwise objectionable.
            </p>
            <h3>5.3 Server and Channel Ownership</h3>
            <p>
              If you create a server or channel, you are responsible for its moderation and for ensuring that content and conduct within it comply with these Terms. Server owners may establish additional community guidelines, but such guidelines may not conflict with these Terms. We are not responsible for content within user-created servers but may enforce these Terms where we become aware of violations.
            </p>
            <h3>5.4 No Backup Guarantee</h3>
            <p>
              You are responsible for maintaining backup copies of any User Content that is important to you. We do not guarantee the availability, integrity, or retention of User Content. Data loss may occur due to technical failures, user error, or other causes. We are not liable for any loss of User Content.
            </p>
          </section>

          <section id="dmca">
            <h2>6. DMCA and Copyright</h2>
            <h3>6.1 Copyright Policy</h3>
            <p>
              We respect the intellectual property rights of others and expect users to do the same. We will respond to notices of alleged copyright infringement that comply with the Digital Millennium Copyright Act (DMCA) and other applicable laws.
            </p>
            <h3>6.2 DMCA Takedown Notice</h3>
            <p>
              If you believe that content on the Services infringes your copyright, you may submit a valid DMCA takedown notice to our designated agent. A valid notice must include:
            </p>
            <ul>
              <li>Your physical or electronic signature</li>
              <li>Identification of the copyrighted work you claim has been infringed</li>
              <li>Identification of the allegedly infringing material and information reasonably sufficient to permit us to locate it (e.g., URL, channel/server name)</li>
              <li>Your contact information (address, telephone number, email)</li>
              <li>A statement that you have a good faith belief that use of the material is not authorized by the copyright owner, its agent, or the law</li>
              <li>A statement, under penalty of perjury, that the information in the notice is accurate and that you are authorized to act on behalf of the copyright owner</li>
            </ul>
            <p>
              Send DMCA notices to: dmca@slide.app (or the address provided in your region). We may forward the notice to the user who posted the content and may publish redacted versions. Filing a false notice may result in liability for damages under 17 U.S.C. § 512(f).
            </p>
            <h3>6.3 Counter-Notification</h3>
            <p>
              If you believe your content was removed in error, you may submit a counter-notification. A valid counter-notification must include:
            </p>
            <ul>
              <li>Your physical or electronic signature</li>
              <li>Identification of the material that was removed and its location before removal</li>
              <li>A statement, under penalty of perjury, that you have a good faith belief the material was removed as a result of mistake or misidentification</li>
              <li>Your name, address, telephone number, and consent to jurisdiction of the federal court in your district (or if outside the U.S., any judicial district in which we may be found), and that you will accept service of process from the person who submitted the original notice</li>
            </ul>
            <p>
              We may restore the content within 10–14 business days unless the original complainant files a court action. We reserve the right to deny repeat infringers access to the Services.
            </p>
          </section>

          <section id="intellectual-property">
            <h2>7. Intellectual Property</h2>
            <p>
              The Services, including but not limited to the Slide name, logo, trademarks, design, features, functionality, software, text, graphics, and the selection and arrangement thereof, are owned by Slide, its licensors, or our affiliates and are protected by copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>
            <p>
              You may not use our trademarks, logos, or branding without our prior written consent. You may not copy, modify, distribute, sell, or create derivative works of the Services or any part thereof except as expressly permitted by these Terms or applicable law.
            </p>
            <p>
              We grant you a limited, non-exclusive, non-transferable, revocable, non-sublicensable license to access and use the Services for your personal or internal business use, subject to these Terms. This license terminates automatically upon any breach of these Terms or upon termination of your access.
            </p>
          </section>

          <section id="subscriptions">
            <h2>8. Slide Nitro and Paid Features</h2>
            <p>
              Slide may offer paid features, including Slide Nitro, which provides enhanced capabilities such as larger file uploads, custom emojis, profile enhancements, and other benefits. Paid features are subject to the pricing, billing terms, and any additional terms disclosed at the time of purchase.
            </p>
            <p>
              Subscriptions may be billed on a recurring basis (e.g., monthly or annually) until cancelled. You may cancel at any time through your account settings. Cancellation will take effect at the end of the current billing period. No refunds will be provided for partial periods. Refunds may be available in accordance with our refund policy and applicable law (e.g., 14-day right of withdrawal in the EU for distance contracts).
            </p>
            <p>
              We may change the pricing, features, or availability of paid features with reasonable notice. Price increases will not apply to the current billing period. We may discontinue paid features with 30 days' notice and pro-rata refund for any prepaid period where required by law.
            </p>
            <p>
              All fees are in the currency displayed at checkout. You are responsible for any taxes (e.g., VAT, sales tax) unless we are required to collect them. Failure to pay may result in suspension or termination of paid features.
            </p>
          </section>

          <section id="termination">
            <h2>9. Termination</h2>
            <h3>9.1 By You</h3>
            <p>
              You may close your account at any time through your account settings. Upon closure, your right to use the Services ceases immediately. We will process account deletion in accordance with our Privacy Policy.
            </p>
            <h3>9.2 By Us</h3>
            <p>
              We may suspend or terminate your account, or your access to the Services (in whole or in part), at any time for any reason, with or without notice, including but not limited to: (a) violation of these Terms; (b) fraudulent, abusive, or illegal activity; (c) extended periods of inactivity; (d) request by law enforcement or government authority; (e) discontinuation or material modification of the Services; or (f) to protect the safety, rights, or property of Slide, our users, or the public. We will endeavour to provide advance notice where practicable, except where immediate action is necessary.
            </p>
            <h3>9.3 Effect of Termination</h3>
            <p>
              Upon termination, your license to use the Services ends immediately. We may delete your account and User Content in accordance with our data retention practices. The following sections survive termination: 5.1 (license for retained content), 6 (DMCA), 7 (Intellectual Property), 10 (Disclaimers), 11 (Limitation of Liability), 12 (Indemnification), 13 (Arbitration), 14 (Governing Law), and 17 (General Provisions).
            </p>
          </section>

          <section id="disclaimers">
            <h2>10. Disclaimers</h2>
            <p>
              <strong>THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.</strong> To the maximum extent permitted by applicable law, we disclaim all warranties, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, and any warranties arising from course of dealing, usage, or trade practice.
            </p>
            <p>
              We do not warrant that the Services will be uninterrupted, timely, secure, error-free, or free of viruses or other harmful components. We do not warrant the accuracy, completeness, or usefulness of any information on the Services. We are not responsible for the conduct of users, third parties, or any content transmitted through the Services. You use the Services at your own risk. We do not guarantee that the Services will meet your requirements or that any errors will be corrected.
            </p>
            <p>
              Some jurisdictions do not allow the exclusion of certain warranties. In such jurisdictions, our liability will be limited to the maximum extent permitted by law, and the above exclusions may not apply to you.
            </p>
          </section>

          <section id="limitation">
            <h2>11. Limitation of Liability</h2>
            <p>
              <strong>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:</strong>
            </p>
            <ul>
              <li><strong>EXCLUSION OF DAMAGES:</strong> IN NO EVENT SHALL SLIDE, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, OR SERVICE PROVIDERS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE, DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICES, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.</li>
              <li><strong>CAP ON LIABILITY:</strong> OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).</li>
              <li><strong>MULTIPLE CLAIMS:</strong> The foregoing limitations apply regardless of the theory of liability (contract, tort, negligence, strict liability, or otherwise) and even if a remedy fails of its essential purpose. In no event shall our liability exceed the limits stated above for all claims in the aggregate.</li>
            </ul>
            <p>
              Some jurisdictions do not allow the exclusion or limitation of incidental or consequential damages. In such jurisdictions, our liability will be limited to the maximum extent permitted by law. The limitations in this section will apply even if any remedy fails of its essential purpose.
            </p>
          </section>

          <section id="indemnification">
            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless Slide, its affiliates, and their respective officers, directors, employees, agents, licensors, and service providers from and against any and all claims, demands, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees, court costs, and expert fees) arising out of or related to: (a) your use of the Services; (b) your User Content; (c) your violation of these Terms; (d) your violation of any third-party rights, including intellectual property or privacy rights; (e) your violation of any applicable law or regulation; (f) any claim that your User Content caused damage to a third party; or (g) any dispute between you and another user.
            </p>
            <p>
              We reserve the right to assume the exclusive defense and control of any matter subject to indemnification by you, at your expense. You will cooperate fully in the defense of any claim. You will not settle any claim that affects us without our prior written consent.
            </p>
          </section>

          <section id="arbitration">
            <h2>13. Dispute Resolution and Arbitration</h2>
            <h3>13.1 Informal Resolution</h3>
            <p>
              Before filing a formal dispute, you agree to contact us at legal@slide.app and attempt to resolve the dispute informally. We will attempt to resolve the dispute within 30 days. If we cannot resolve it, either party may proceed to arbitration or small claims court as set forth below.
            </p>
            <h3>13.2 Agreement to Arbitrate</h3>
            <p>
              Except for (a) disputes that qualify for small claims court, (b) injunctive or other equitable relief for intellectual property infringement, or (c) where prohibited by law, you and Slide agree that any dispute arising out of or relating to these Terms or the Services shall be resolved exclusively by binding, individual arbitration administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules, or JAMS under its Streamlined Arbitration Rules, as applicable. The arbitrator's decision will be final and binding, and judgment may be entered in any court of competent jurisdiction.
            </p>
            <h3>13.3 Class Action Waiver</h3>
            <p>
              <strong>YOU AND SLIDE AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING.</strong> The arbitrator may not consolidate more than one person's claims and may not preside over any form of representative or class proceeding. If this waiver is found unenforceable, the entire arbitration agreement may be void.
            </p>
            <h3>13.4 Jury Trial Waiver</h3>
            <p>
              <strong>YOU AND SLIDE WAIVE ANY RIGHT TO A JURY TRIAL</strong> for any dispute within the scope of this arbitration agreement. If the class action waiver or jury trial waiver is found unenforceable, the dispute shall be resolved in court and both parties waive the right to a jury trial to the extent permitted by law.
            </p>
            <h3>13.5 Exceptions</h3>
            <p>
              Nothing in this section prevents you from bringing an individual action in small claims court if your claim qualifies, or from reporting issues to a government agency. Disputes regarding the scope or enforceability of this arbitration agreement shall be decided by a court, not an arbitrator.
            </p>
            <h3>13.6 Opt-Out</h3>
            <p>
              You may opt out of this arbitration agreement by sending written notice to legal@slide.app within 30 days of first accepting these Terms. Your notice must include your name, address, and a clear statement that you opt out of arbitration. If you opt out, the arbitration and class action waiver provisions will not apply to you, but the rest of these Terms will.
            </p>
            <h3>13.7 EEA/UK Users</h3>
            <p>
              If you are in the European Economic Area or United Kingdom, nothing in this section limits your right to bring a claim in the courts of your country of residence. You may also pursue claims through the EU Online Dispute Resolution platform.
            </p>
          </section>

          <section id="governing-law">
            <h2>14. Governing Law and Venue</h2>
            <p>
              These Terms and any dispute arising therefrom shall be governed by and construed in accordance with the laws of the State of Delaware, United States, without regard to its conflict of law principles. The United Nations Convention on Contracts for the International Sale of Goods does not apply.
            </p>
            <p>
              Except where arbitration applies or where prohibited by law, any legal action or proceeding arising under these Terms shall be brought exclusively in the federal or state courts located in Delaware, and you consent to the personal jurisdiction and venue of such courts. If you are in the EEA/UK, you may also bring claims in the courts of your country of residence.
            </p>
            <p>
              You waive any right to assert that such courts are an inconvenient forum. Any claim or cause of action arising under these Terms must be brought within one (1) year after the claim or cause of action arose, or it shall be forever barred.
            </p>
          </section>

          <section id="export">
            <h2>15. Export and Sanctions Compliance</h2>
            <p>
              The Services may be subject to export control and sanctions laws of the United States and other jurisdictions. You agree that you will not use, export, re-export, or transfer the Services or any technical data received through the Services in violation of any applicable law, including the U.S. Export Administration Regulations (EAR), International Traffic in Arms Regulations (ITAR), and economic sanctions administered by the Office of Foreign Assets Control (OFAC).
            </p>
            <p>
              You represent that you are not (a) located in, incorporated in, or a resident of a sanctioned country; (b) on any U.S. or other government list of prohibited or restricted parties; or (c) using the Services on behalf of such a person or entity. You will not use the Services for any purpose prohibited by export or sanctions law.
            </p>
          </section>

          <section id="force-majeure">
            <h2>16. Force Majeure</h2>
            <p>
              Neither party shall be liable for any failure or delay in performing its obligations under these Terms (other than payment obligations) where such failure or delay results from circumstances beyond its reasonable control, including but not limited to: acts of God, natural disasters, war, terrorism, civil unrest, pandemic, epidemic, government actions or embargoes, strikes or labor disputes, failure of third-party infrastructure (including internet or telecommunications), power outages, cyberattacks, or other events that could not have been reasonably foreseen or prevented. The affected party shall use commercially reasonable efforts to mitigate the effect of such circumstances and shall notify the other party promptly. If a force majeure event continues for more than 30 days, either party may terminate these Terms upon written notice.
            </p>
          </section>

          <section id="general">
            <h2>17. General Provisions</h2>
            <p>
              <strong>Entire Agreement:</strong> These Terms, together with the Privacy Policy and any additional terms you agree to when using specific features (e.g., Nitro, API), constitute the entire agreement between you and Slide regarding the Services and supersede all prior agreements and understandings.
            </p>
            <p>
              <strong>Severability:</strong> If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, such invalidity, illegality, or unenforceability shall not affect any other provision, and these Terms shall be construed as if such provision had never been included to the extent of such invalidity.
            </p>
            <p>
              <strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms will not constitute a waiver of such right or provision. Any waiver must be in writing and signed by us. No waiver of any breach shall constitute a waiver of any subsequent breach.
            </p>
            <p>
              <strong>Assignment:</strong> You may not assign or transfer these Terms or your rights hereunder without our prior written consent. Any attempted assignment in violation hereof shall be null and void. We may assign these Terms, in whole or in part, without restriction, including in connection with a merger, acquisition, or sale of assets.
            </p>
            <p>
              <strong>No Third-Party Beneficiaries:</strong> These Terms do not create any third-party beneficiary rights except as expressly stated.
            </p>
            <p>
              <strong>Waiver of Unknown Claims:</strong> You waive any applicable statutory or common-law provisions that would otherwise limit the scope of the release of unknown claims (e.g., California Civil Code § 1542).
            </p>
            <p>
              <strong>Interpretation:</strong> Headings are for convenience only and do not affect interpretation. "Including" means "including without limitation." "Or" is not exclusive. Singular includes plural and vice versa.
            </p>
          </section>

          <section id="contact">
            <h2>18. Contact Us</h2>
            <p>
              For questions about these Terms of Service, to report violations, or for legal notices:
            </p>
            <ul>
              <li><strong>Through the app:</strong> Settings / Support</li>
              <li><strong>Email:</strong> legal@slide.app (or the support email provided in your region)</li>
              <li><strong>DMCA agent:</strong> dmca@slide.app</li>
              <li><strong>Mail:</strong> Slide, [Legal Address], Attn: Legal</li>
            </ul>
          </section>
        </div>

        <footer className="legal-footer">
          <div className="legal-footer-links">
            <Link to="/privacy">Privacy Policy</Link>
            <span className="legal-footer-sep">·</span>
            <span className="legal-footer-current">Terms of Service</span>
          </div>
          <Link to="/" className="legal-back-link">Back to Home</Link>
        </footer>
      </article>
      </div>
    </AuthShell>
  );
}
