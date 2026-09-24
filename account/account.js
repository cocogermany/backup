/**
 * CocoGermany — Dedicated Account Hub Logic (account.js)
 * Isolated authentication, Firestore profile syncing, orders rendering, and navigation.
 */

const firebaseConfig = {
  apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
  authDomain: "cocogermany-ba33f.firebaseapp.com",
  projectId: "cocogermany-ba33f",
  storageBucket: "cocogermany-ba33f.firebasestorage.app",
  messagingSenderId: "689122181603",
  appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
};

const adminEmail = "cocogermany.ytd@gmail.com";

const examFormatOptions = [
  ["goethe", "Goethe"],
  ["telc", "TELC"],
];

const germanLevelOptions = ["A1", "A2", "B1", "B2"];

const countryOptions = [
  "India",
  "Australia",
  "United Kingdom",
  "Canada",
  "United States",
  "Germany",
  "Austria",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Czech Republic",
  "Denmark",
  "Hong Kong",
  "Hungary",
  "Israel",
  "Japan",
  "Mexico",
  "Taiwan",
  "New Zealand",
  "Norway",
  "Philippines",
  "Poland",
  "Russia",
  "Singapore",
  "Sweden",
  "Switzerland",
  "Thailand",
  "Other",
];

const currencyOptions = [
  ["INR", "INR (Indian Rupee)"],
  ["AUD", "Australian Dollar (AUD)"],
  ["GBP", "British Pound (GBP)"],
  ["CAD", "Canadian Dollar (CAD)"],
  ["CZK", "Czech Koruna (CZK)"],
  ["DKK", "Danish Krone (DKK)"],
  ["EUR", "Euro (EUR)"],
  ["HKD", "Hong Kong Dollar (HKD)"],
  ["HUF", "Hungarian Forint (HUF)"],
  ["ILS", "Israeli New Shekel (ILS)"],
  ["JPY", "Japanese Yen (JPY)"],
  ["MXN", "Mexican Peso (MXN)"],
  ["TWD", "New Taiwan Dollar (TWD)"],
  ["NZD", "New Zealand Dollar (NZD)"],
  ["NOK", "Norwegian Krone (NOK)"],
  ["PHP", "Philippine Peso (PHP)"],
  ["PLN", "Polish Zloty (PLN)"],
  ["RUB", "Russian Rouble (RUB)"],
  ["SGD", "Singapore Dollar (SGD)"],
  ["SEK", "Swedish Krona (SEK)"],
  ["CHF", "Swiss Franc (CHF)"],
  ["THB", "Thai Baht (THB)"],
  ["USD", "USD (US Dollar)"],
  ["Other", "Other"],
];

let firebaseTools = null;
let currentAccountUser = null;
let currentAccountProfile = null;
let authResolved = false;
let authReadyResolve;
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve;
});

const defaultTabTemplates = {
  orders: `
    <div class="account-section-header">
      <h2>Order History</h2>
      <p>Review the fulfillment status of your workbook and mock exam orders.</p>
    </div>
    <div id="account-orders-container">
      <div class="account-empty-state">
        <i data-lucide="loader"></i>
        <p>Loading your orders...</p>
      </div>
    </div>
  `,
  purchased: `
    <div class="account-section-header">
      <h2>Purchased Resources</h2>
      <p>Access your unlocked digital workbooks, practice papers, and answer keys.</p>
    </div>
    <div id="account-purchased-container">
      <div class="account-empty-state">
        <i data-lucide="loader"></i>
        <p>Loading your materials...</p>
      </div>
    </div>
  `,
  billing: `
    <div class="account-section-header">
      <h2>Billing &amp; Subscriptions</h2>
      <p>Manage membership tiers, preferred billing currency, and payment history.</p>
    </div>
    <div class="doc-prose">
      <h3>Current Membership &amp; Account Status</h3>
      <p>
        Your account is currently active on the standard customer tier. If you have purchased interactive practice packs, exam kits, or digital workbooks, your invoices, payment receipts, and order fulfillment records are stored under <a href="orders.html" style="color: var(--brand); font-weight: 600;">My Orders</a>.
      </p>
      <div class="account-empty-state" style="margin: 24px 0;">
        <i data-lucide="crown"></i>
        <h3>Explore Premium Membership</h3>
        <p>Unlock unlimited Goethe &amp; telc mock exams, automated grammar evaluation, and full access to our digital publishing library.</p>
        <a class="button-primary" href="../index.html#/membership">
          <i data-lucide="sparkles"></i> View Membership Plans
        </a>
      </div>

      <h3>Accepted Payment Methods</h3>
      <p>
        Coco Germany supports both domestic Indian and international payment methods to ensure seamless access for learners worldwide:
      </p>
      <ul>
        <li><strong>Domestic Payments (India):</strong> Processed via verified UPI transfers (Google Pay, PhonePe, Paytm, BHIM) and authorized Indian banking channels.</li>
        <li><strong>International Payments:</strong> Processed securely via Stripe supporting major international debit and credit cards (Visa, Mastercard, American Express) with automated currency conversion.</li>
      </ul>

      <h3>Payment Security &amp; Data Processing</h3>
      <p>
        Your financial security is our highest priority. All transactions are processed directly by our external PCI-DSS compliant payment providers (Stripe and verified UPI banking gateways) through 256-bit encrypted TLS connections. <strong>Coco Germany does not collect, handle, or store full credit/debit card numbers, CVVs, UPI PINs, or banking passwords directly on its servers.</strong>
      </p>

      <h3>Payment Confirmation &amp; Order Statuses</h3>
      <p>
        When you submit a checkout request, the order status progresses through the following stages:
      </p>
      <ul>
        <li><strong>Pending / Payment Requested:</strong> Your purchase order is recorded and waiting for processor or manual desk verification.</li>
        <li><strong>Paid / Completed:</strong> Payment has been successfully verified. Digital downloads, model answers, and exam credits are immediately accessible under <a href="purchased.html" style="color: var(--brand); font-weight: 600;">Purchased Resources</a>.</li>
        <li><strong>Cancelled:</strong> Order was cancelled by user request, unfulfilled due to payment timeout, or refunded.</li>
      </ul>

      <h3>Invoices &amp; Transaction Receipts</h3>
      <p>
        An itemized payment confirmation and digital receipt are delivered automatically to your registered account email address upon verified completion of your order. You can also view historical order IDs and payment dates in the <a href="orders.html" style="color: var(--brand); font-weight: 600;">My Orders</a> tab.
      </p>

      <h3>Failed, Declined, or Interrupted Payments</h3>
      <p>
        If your payment attempt fails or your card is declined, please check with your issuing bank to ensure international/online transactions are enabled. If funds are deducted from your account but your order remains in "Pending" status beyond standard verification time, please do not initiate a duplicate payment. Instead, reach out to our billing desk with your bank transaction reference ID.
      </p>

      <h3>Refunds &amp; Cancellations</h3>
      <p>
        Because Coco Germany educational products are digital goods delivered or unlocked electronically, purchases are non-refundable once accessed. In cases of accidental duplicate charges or verified technical errors where delivery could not be completed, refunds are processed back to the original payment source. For full legal terms, please review the <a href="terms.html" style="color: var(--brand); font-weight: 600;">Refund &amp; Cancellation Terms</a>.
      </p>

      <h3>Billing Support &amp; Direct Assistance</h3>
      <p>
        For invoice receipts, currency queries, or payment inquiries:
      </p>
      <ul>
        <li><strong>Email:</strong> <code>cocogermany.ytd@gmail.com</code></li>
        <li><strong>WhatsApp Desk:</strong> <code>+91 7907211108</code> (Mon–Sat, 09:00–18:00 IST)</li>
      </ul>
    </div>
  `,
  help: `
    <div class="account-section-header">
      <h2>Help &amp; Customer Support</h2>
      <p>Find answers to frequent inquiries, purchase workflows, or contact the Coco Germany team.</p>
    </div>
    <div class="doc-prose">
      <h3>Payments &amp; Purchases Help</h3>

      <h4>How do I purchase a workbook or mock exam pack?</h4>
      <p>
        Browse our catalog on the <a href="../index.html#/resources" style="color: var(--brand); font-weight: 600;">Resources page</a> or <a href="../practice/index.html#mock-exams" style="color: var(--brand); font-weight: 600;">Mock Exam library</a> and click <strong>Buy Now</strong> or <strong>Checkout</strong>. You will be prompted to confirm your order details and choose your preferred payment method (verified UPI for Indian payments, or Stripe for international cards).
      </p>

      <h4>What happens after successful payment?</h4>
      <p>
        Upon completing payment, your order reference is recorded under <a href="orders.html" style="color: var(--brand); font-weight: 600;">My Orders</a>. Once verified by the payment gateway or our desk, the status updates to <strong>Paid</strong> and the materials unlock automatically.
      </p>

      <h4>Where do my purchased resources appear?</h4>
      <p>
        All unlocked digital PDF workbooks, practice papers, audio links, and answer keys are accessible under <a href="purchased.html" style="color: var(--brand); font-weight: 600;">Purchased Resources</a> whenever you are logged in.
      </p>

      <h4>What if payment succeeded but access is not immediately active?</h4>
      <p>
        Standard verification typically completes within <strong>2 to 6 hours</strong> for manual verification orders and immediately for direct gateway checkouts. If your payment was deducted but access remains pending after 6 hours, please email your transaction reference or UPI UTR to <code>cocogermany.ytd@gmail.com</code> and our desk will activate access immediately.
      </p>

      <h4>How do I handle a failed or debited transaction?</h4>
      <p>
        If funds were debited from your account but the page showed a payment timeout or failure, your bank or payment provider will usually reverse the charge automatically within 3 to 5 business days. If not reversed, send us a screenshot of the debit with your registered email and Order ID.
      </p>

      <h4>How do I request order assistance or report a problem?</h4>
      <p>
        When writing to our support desk, please provide:
      </p>
      <ul>
        <li>Your registered account email address.</li>
        <li>The Order ID (from your <a href="orders.html" style="color: var(--brand); font-weight: 600;">My Orders</a> list).</li>
        <li>The payment provider transaction reference or UPI UTR number.</li>
      </ul>

      <h4>What is the refund and cancellation guidance?</h4>
      <p>
        Because study materials and practice tests are digital goods delivered electronically, purchases are non-refundable once unlocked. Duplicate charges or confirmed fulfillment errors are refunded in full. Review our complete <a href="terms.html" style="color: var(--brand); font-weight: 600;">Terms &amp; Refund Policy</a> for details.
      </p>

      <h3>General Platform FAQs</h3>

      <h4>How do I receive my purchased digital PDF workbooks?</h4>
      <p>
        Digital workbooks are unlocked automatically under <a href="purchased.html" style="color: var(--brand); font-weight: 600;">Purchased Resources</a> and a digital copy is delivered to your registered email address upon verification.
      </p>

      <h4>How does the Practice App synchronize my target German level?</h4>
      <p>
        When you update your Exam Format (Goethe or telc) and CEFR Level (A1–B2) in <a href="index.html" style="color: var(--brand); font-weight: 600;">Profile Settings</a>, your target curriculum is automatically synchronized with the interactive Practice App and your learning analytics.
      </p>

      <h4>Need direct assistance with an order?</h4>
      <p>
        For order modifications, invoice receipts, or technical questions:
      </p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:cocogermany.ytd@gmail.com" style="color: var(--brand);">cocogermany.ytd@gmail.com</a></li>
        <li><strong>WhatsApp Desk:</strong> <a href="https://wa.me/917907211108" target="_blank" rel="noopener" style="color: var(--brand);">+91 7907211108</a></li>
        <li><strong>Contact Page:</strong> <a href="../index.html#/contact" style="color: var(--brand);">Coco Germany Contact Form</a></li>
      </ul>
    </div>
  `,
  terms: `
    <div class="account-section-header">
      <h2>Terms &amp; Conditions</h2>
      <p>Last updated: September 2026 • Platform usage &amp; digital publication agreements.</p>
    </div>
    <div class="doc-prose">
      <div class="doc-terms-nav" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; padding: 12px 14px; background: var(--surface-subtle); border-radius: var(--radius-md); font-size: 12.5px; font-weight: 600; color: var(--muted);">
        <span>Terms of Use</span> •
        <span>Purchases &amp; Payments</span> •
        <span>Digital Delivery</span> •
        <span>Refund &amp; Cancellation</span> •
        <span>Intellectual Property</span> •
        <span>User Responsibilities</span> •
        <span>Third-Party Services</span> •
        <span>Account Termination</span> •
        <span>Changes to Terms</span> •
        <span>Contact</span>
      </div>

      <h3>1. Terms of Use</h3>
      <p>
        Welcome to Coco Germany. By creating an account, accessing our website, or purchasing learning materials, you agree to comply with and be bound by these Terms &amp; Conditions. Coco Germany provides German-language educational resources, CEFR A1–B2 curriculum materials, interactive practice drills, Goethe &amp; telc mock exam simulations, automated and guided writing (<em>Schreiben</em>) evaluation tools, self-paced courses, and digital study publications.
      </p>
      <p>
        All exam preparation kits, practice questions, and study guides are developed for independent educational purposes. Unless explicitly stated otherwise, Coco Germany is an independent educational provider and is not affiliated with, endorsed by, or sponsored by Goethe-Institut e.V. or telc gGmbH.
      </p>
      <p>
        Coco Germany grants you a limited, non-exclusive, non-transferable, revocable license to access the platform and its resources solely for your personal, non-commercial German learning, in accordance with these Terms. Platform availability and features are provided on an "as is" and "as available" basis with reasonable service limitations.
      </p>

      <h3>2. User Responsibilities &amp; Account Security</h3>
      <p>
        To access certain features, mock exams, or purchased resources, you must register an account. You agree to:
      </p>
      <ul>
        <li>Provide accurate, current, and complete registration information (such as your valid email address and learning preferences).</li>
        <li>Maintain the confidentiality and security of your login credentials and authentication tokens.</li>
        <li>Promptly notify Coco Germany if you suspect any unauthorized access or security breach involving your account.</li>
        <li>Accept full responsibility for all activities, submissions, and purchases that occur under your account credentials.</li>
      </ul>

      <h3>3. Purchases &amp; Payments</h3>
      <p>
        When you purchase digital workbooks, mock exam packs, writing evaluations, or membership plans on Coco Germany:
      </p>
      <ul>
        <li><strong>Pricing &amp; Taxes:</strong> All prices are displayed in your selected or local currency (including INR, EUR, USD, etc.) and represent the stated price at checkout. Any applicable transaction taxes or local statutory levies are itemized prior to final payment confirmation.</li>
        <li><strong>Payment Processing:</strong> Domestic transactions in India are processed through verified Indian payment channels (including verified UPI transfer and authorized Indian payment processing). International transactions are processed securely through Stripe.</li>
        <li><strong>No Credential Storage:</strong> Payment details (such as credit/debit card numbers, CVVs, UPI PINs, or banking passwords) are processed directly by our external payment providers through encrypted gateways. Coco Germany does not collect, process, or store sensitive card credentials on its own servers.</li>
        <li><strong>Order Confirmation:</strong> An order confirmation and transaction summary are generated upon submission. Fulfillment and access activation occur once payment verification is successfully completed by the payment processor or our desk.</li>
        <li><strong>Failed, Reversed, or Disputed Payments:</strong> If a payment fails, is reversed by your financial institution, or is flagged for suspected dispute/fraud, access to the corresponding digital materials will be suspended until verified payment is re-established.</li>
      </ul>

      <h3>4. Digital Delivery</h3>
      <p>
        All educational products offered by Coco Germany are digital goods. Upon successful payment verification:
      </p>
      <ul>
        <li>Digital PDF workbooks, model answer keys, and study guides are unlocked automatically under your registered account in <a href="purchased.html" style="color: var(--brand); font-weight: 600;">Purchased Resources</a> and/or delivered to your verified account email address.</li>
        <li>Interactive mock exams, practice sets, and writing evaluations are immediately credited to your account profile for use in the Practice App.</li>
        <li>Standard verification and fulfillment typically occur within 2 to 6 hours for manual verification workflows, and instantly for automated gateway checkouts.</li>
      </ul>

      <h3>5. Refund &amp; Cancellation Policy</h3>
      <p>
        Because Coco Germany provides electronically delivered digital goods, downloadable PDF publications, and immediately accessible interactive practice evaluations, the following rules apply:
      </p>
      <ul>
        <li><strong>Digital Products:</strong> Once a digital workbook, practice paper, or exam preparation file has been unlocked in your account or delivered electronically, sales are generally non-refundable and non-cancellable, as the digital content has been irrevocably delivered.</li>
        <li><strong>Duplicate Charges &amp; Technical Errors:</strong> If you experience a duplicate payment for the same order due to a technical glitch, or if your payment succeeded but the digital materials cannot be made accessible despite editorial support, you are entitled to a full refund upon verification.</li>
        <li><strong>Writing (Schreiben) Evaluations:</strong> Evaluation credits that have already been submitted, processed, or reviewed by automated or editorial evaluators are non-refundable.</li>
        <li><strong>Refund Requests:</strong> To request assistance with a billing discrepancy or duplicate payment, write to <code>cocogermany.ytd@gmail.com</code> within 7 days of the transaction with your Order ID and payment receipt reference. Valid refunds are credited back to the original payment method via the respective payment processor.</li>
      </ul>

      <h3>6. Intellectual Property &amp; Content Licensing</h3>
      <p>
        All content published by Coco Germany—including PDF textbooks, exam simulations, exercise datasets, writing prompts, audio recordings, visual graphics, trademarks, logos, and proprietary software code—is the intellectual property of Coco Germany and protected by international copyright laws.
      </p>
      <p>
        Your purchase grants you a single-user, non-transferable personal license. You may not resell, sub-license, publicly share, redistribute, photocopy for commercial groups, upload to public cloud drives, or exploit any Coco Germany material without prior written authorization from our editorial desk.
      </p>

      <h3>7. Third-Party Services</h3>
      <p>
        Coco Germany integrates trusted third-party technology providers to operate its platform, including Google Firebase (identity authentication &amp; database), Supabase (relational data &amp; analytics), Cloudflare (content delivery &amp; media hosting), and payment gateways (Stripe &amp; verified Indian UPI processors). Your interaction with third-party payment gateways is subject to their respective terms and privacy policies. Coco Germany is not liable for service interruptions caused by independent third-party networks.
      </p>

      <h3>8. Account Suspension &amp; Termination</h3>
      <p>
        Coco Germany reserves the right to suspend or terminate your account access without prior notice if you violate these Terms, engage in fraudulent payment disputes, distribute copyrighted materials unlawfully, or attempt to compromise platform security or other users' privacy.
      </p>

      <h3>9. Changes to Terms</h3>
      <p>
        We may update these Terms &amp; Conditions periodically to reflect educational curriculum additions, technology updates, or regulatory requirements. Material revisions will be posted on this page with an updated "Last updated" date. Continued use of the platform after modifications constitutes agreement to the updated Terms.
      </p>

      <h3>10. Governing Law &amp; Jurisdiction</h3>
      <p>
        These Terms &amp; Conditions and any transactions conducted on Coco Germany shall be governed by and construed in accordance with the laws of [JURISDICTION / GOVERNING LAW - e.g., Laws of India], without regard to conflict of law principles. Any legal disputes arising out of or in connection with the platform shall be subject to the exclusive jurisdiction of the competent courts in [CITY / STATE / COUNTRY - e.g., Bengaluru, Karnataka, India].
      </p>

      <h3>11. Contact &amp; Support</h3>
      <p>
        If you have questions regarding these Terms &amp; Conditions, order fulfillment, or billing inquiries, please contact our team:
      </p>
      <ul>
        <li><strong>Entity:</strong> Coco Germany ([BUSINESS LEGAL NAME - e.g., Coco Germany Educational Services])</li>
        <li><strong>Email:</strong> <a href="mailto:cocogermany.ytd@gmail.com" style="color: var(--brand);">cocogermany.ytd@gmail.com</a></li>
        <li><strong>WhatsApp Support:</strong> <a href="https://wa.me/917907211108" target="_blank" rel="noopener" style="color: var(--brand);">+91 7907211108</a></li>
        <li><strong>Contact Page:</strong> <a href="../index.html#/contact" style="color: var(--brand);">Coco Germany Contact Hub</a></li>
      </ul>
    </div>
  `,
  privacy: `
    <div class="account-section-header">
      <h2>Privacy Policy</h2>
      <p>Last updated: September 2026 • How we collect, safeguard, and process your data.</p>
    </div>
    <div class="doc-prose">
      <div class="doc-terms-nav" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; padding: 12px 14px; background: var(--surface-subtle); border-radius: var(--radius-md); font-size: 12.5px; font-weight: 600; color: var(--muted);">
        <span>Information We Collect</span> •
        <span>Payment Data</span> •
        <span>How We Use Data</span> •
        <span>Technologies &amp; Providers</span> •
        <span>Cookies &amp; Storage</span> •
        <span>Security &amp; Retention</span> •
        <span>Your Rights</span> •
        <span>Contact</span>
      </div>

      <h3>1. Information We Collect</h3>
      <p>
        When you create an account, complete exercises, or purchase study resources on Coco Germany, we collect only the information necessary to provide our educational services:
      </p>
      <ul>
        <li><strong>Account &amp; Identity:</strong> Email address, display name (if provided via Google Sign-In or profile settings), and secure authentication user identifiers (UID) generated by Google Firebase Authentication.</li>
        <li><strong>Learning Preferences:</strong> Your selected German exam format (Goethe or telc), target CEFR level (A1, A2, B1, B2), country of study, and preferred display currency.</li>
        <li><strong>Practice &amp; Academic Progress:</strong> Interactive drill answers, mock exam scores, section completion statuses, Hören/Lesen/Grammatik test results, and German writing (<em>Schreiben</em>) text submissions and AI/editorial evaluation feedback.</li>
        <li><strong>Orders &amp; Fulfillment History:</strong> Records of purchased workbooks, digital resource IDs, payment status flags, fulfillment timestamps, and order reference numbers.</li>
      </ul>

      <h3>2. Payment Information Handling</h3>
      <p>
        Payment processing is conducted entirely through external, secure payment gateways (Stripe for international card processing and verified UPI banking channels for India). <strong>Coco Germany does not collect, process, or store credit or debit card numbers, card verification codes (CVV), banking passwords, or UPI PINs on its servers.</strong> All transaction data is handled in accordance with the payment providers' rigorous privacy and security standards.
      </p>

      <h3>3. How We Use Your Information</h3>
      <p>
        We use your information strictly for legitimate educational, operational, and customer support purposes:
      </p>
      <ul>
        <li>Authenticating your account login and maintaining session security across visits.</li>
        <li>Granting access to unlocked workbooks, exam kits, and interactive tools in your Customer Hub.</li>
        <li>Synchronizing your curriculum, exam timers, and difficulty levels across the Practice App.</li>
        <li>Processing writing submissions and delivering accurate grammatical and lexical evaluation reports.</li>
        <li>Transmitting order confirmation notices, digital delivery links, and customer support communications.</li>
        <li>Detecting and preventing fraudulent transactions, automated abuse, or unauthorized account sharing.</li>
      </ul>

      <h3>4. Technologies &amp; Third-Party Processors</h3>
      <p>
        To ensure speed, reliability, and security, Coco Germany relies on established enterprise infrastructure:
      </p>
      <ul>
        <li><strong>Google Firebase:</strong> User authentication, secure token verification, and customer profile storage in Google Cloud datacenters.</li>
        <li><strong>Supabase:</strong> Cloud-hosted relational database used to record practice attempts, learning analytics, and Schreiben submission data.</li>
        <li><strong>Cloudflare Workers &amp; R2:</strong> Edge computing routing, DDoS mitigation, and secure asset delivery for digital audio recordings and study guides.</li>
        <li><strong>Payment Gateways (Stripe &amp; UPI Processors):</strong> Encrypted transaction processing and invoice generation.</li>
      </ul>
      <p>
        These third-party processors receive only the data strictly necessary to execute their respective functions and are contractually prohibited from selling or sharing your personal information.
      </p>

      <h3>5. Cookies, Local Storage &amp; Session Data</h3>
      <p>
        Coco Germany uses modern browser technologies, including local storage and first-party session tokens, exclusively to keep you logged in, save your active learning preferences, and cache local mock exam timers for uninterrupted study. We do not use third-party behavioral advertising trackers, data brokers, or marketing surveillance tools.
      </p>

      <h3>6. Data Security Measures</h3>
      <p>
        We implement industry-standard technical and operational safeguards to protect your personal information. All network communication occurs over encrypted Transport Layer Security (TLS 1.3 / HTTPS), database access is restricted by strict role-based access controls, and sensitive operations require authenticated identity tokens. While we take every reasonable measure to protect your data, no internet transmission is 100% immune from external risks.
      </p>

      <h3>7. Data Retention &amp; International Transfers</h3>
      <p>
        Your account details, learning history, and purchase records are retained for as long as your account remains active. As our infrastructure utilizes globally distributed cloud services (Firebase, Supabase, Cloudflare), your information may be processed in secure facilities located outside your country of residence, subject to international data protection safeguards.
      </p>

      <h3>8. Your Rights &amp; Data Control</h3>
      <p>
        Under applicable data protection laws (including GDPR and consumer privacy standards), you maintain the right to:
      </p>
      <ul>
        <li>Access the personal data and learning records associated with your account.</li>
        <li>Update or correct your profile preferences directly within the <a href="index.html" style="color: var(--brand); font-weight: 600;">Profile Settings</a> view.</li>
        <li>Request the complete deletion of your account and associated database records at any time.</li>
      </ul>
      <p>
        To submit a data access or deletion request, please email our privacy desk at <code>cocogermany.ytd@gmail.com</code> from your registered account address. We process verification and fulfillment within 30 days.
      </p>

      <h3>9. Children's Privacy</h3>
      <p>
        Coco Germany is designed as a language-learning resource for independent learners, exam candidates, and university applicants. We do not knowingly collect personal information from children without verified parental or legal guardian consent where required by local laws.
      </p>

      <h3>10. Changes to This Privacy Policy</h3>
      <p>
        We reserve the right to revise this Privacy Policy to reflect platform improvements or statutory obligations. Any updates will be published on this page with a revised effective date.
      </p>

      <h3>11. Contact Privacy Desk</h3>
      <p>
        For privacy-related questions or data inquiries:
      </p>
      <ul>
        <li><strong>Email:</strong> <a href="mailto:cocogermany.ytd@gmail.com" style="color: var(--brand);">cocogermany.ytd@gmail.com</a></li>
        <li><strong>Editorial Desk:</strong> Coco Germany Educational Publishing</li>
        <li><strong>Direct Support:</strong> <a href="../index.html#/contact" style="color: var(--brand);">Contact Page</a></li>
      </ul>
    </div>
  `,
  index: `
    <div class="account-section-header">
      <h2>Profile &amp; Learning Preferences</h2>
      <p>Customize your target exam format, current CEFR level, country, and preferred currency.</p>
    </div>
    <form class="profile-form" id="account-profile-form">
      <label class="field">
        Exam Format
        <select name="format" required>
          <option value="">Select exam format</option>
        </select>
      </label>
      <label class="field">
        Current German Level
        <select name="level" required>
          <option value="">Select level</option>
        </select>
      </label>
      <label class="field">
        Country
        <select name="country" required>
          <option value="">Select country</option>
        </select>
      </label>
      <label class="field">
        Currency
        <select name="currency" required>
          <option value="">Select currency</option>
        </select>
      </label>
      <div class="form-actions-row">
        <button class="button-primary" type="submit">
          <i data-lucide="save"></i> Save preferences
        </button>
        <p id="profile-message" aria-live="polite"></p>
      </div>
    </form>
  `
};

function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

async function getFirebaseTools() {
  if (firebaseTools) return firebaseTools;

  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const app = appModule.getApps().length === 0 ? appModule.initializeApp(firebaseConfig) : appModule.getApp();

    firebaseTools = {
      auth: authModule.getAuth(app),
      db: firestoreModule.getFirestore(app),
      authModule,
      firestoreModule,
    };

    return firebaseTools;
  } catch (error) {
    console.error("Failed to initialize Firebase in Account hub:", error);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  initIcons();
  highlightActiveNavTab();
  initProfileForm(currentAccountUser);
  initMobileTabModal();
  await initAccountAuth();
});

function highlightActiveNavTab() {
  if (window.innerWidth <= 1024) {
    document.querySelectorAll(".account-tab").forEach((tab) => tab.classList.remove("active"));
    return;
  }
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".account-tab").forEach((tab) => {
    const href = tab.getAttribute("href") || "";
    const isCurrent = href === currentPath || (currentPath === "" && href === "index.html");
    tab.classList.toggle("active", isCurrent);
  });
}

function initMobileTabModal() {
  let modal = document.getElementById("account-tab-modal");
  let modalBody = document.getElementById("account-modal-body");
  let modalTitle = document.getElementById("account-modal-title");
  let modalIcon = document.getElementById("account-modal-icon");
  const inlineView = document.getElementById("account-content-view");
  let inlinePlaceholder = document.getElementById("account-inline-placeholder");

  // Create modal element if not present in markup
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "account-modal-overlay";
    modal.id = "account-tab-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="account-modal-card">
        <div class="account-modal-header">
          <div class="account-modal-title-wrap">
            <span class="account-modal-icon" id="account-modal-icon"><i data-lucide="settings-2"></i></span>
            <h2 class="account-modal-title" id="account-modal-title">Details</h2>
          </div>
          <button class="account-modal-close-btn" id="account-modal-close-btn" type="button" aria-label="Close modal">
            <i data-lucide="x"></i>
            <span>Close</span>
          </button>
        </div>
        <div class="account-modal-body" id="account-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modalBody = document.getElementById("account-modal-body");
    modalTitle = document.getElementById("account-modal-title");
    modalIcon = document.getElementById("account-modal-icon");
  }

  if (!inlinePlaceholder && inlineView) {
    inlinePlaceholder = document.createElement("div");
    inlinePlaceholder.id = "account-inline-placeholder";
    inlinePlaceholder.style.display = "none";
    inlineView.before(inlinePlaceholder);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("account-modal-open");

    // If inlineView was moved into modal, restore it back to original placeholder position
    if (inlineView && inlinePlaceholder && inlineView.parentElement === modalBody) {
      inlineView.classList.remove("in-modal");
      inlinePlaceholder.after(inlineView);
    }

    // Restore active tab to current page's tab
    highlightActiveNavTab();
  }

  async function openTabInModal(tabEl) {
    if (!tabEl || !modal || !modalBody) return;
    const href = (tabEl.getAttribute("href") || "").split("/").pop() || "index.html";
    const tabName = tabEl.textContent.trim();
    const iconEl = tabEl.querySelector("i, svg");
    const iconName = iconEl ? (iconEl.getAttribute("data-lucide") || "folder") : "folder";

    // Update modal title & icon
    if (modalTitle) modalTitle.textContent = tabName;
    if (modalIcon) {
      modalIcon.innerHTML = `<i data-lucide="${iconName}"></i>`;
    }

    // Restore inlineView if it was in the modal
    if (inlineView && inlinePlaceholder && inlineView.parentElement === modalBody) {
      inlineView.classList.remove("in-modal");
      inlinePlaceholder.after(inlineView);
    }
    modalBody.innerHTML = "";

    // Highlight clicked tab
    document.querySelectorAll(".account-tab").forEach((t) => t.classList.toggle("active", t === tabEl));

    // Open modal
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("account-modal-open");

    // The protected tabs that require authentication
    const protectedPages = ["orders.html", "purchased.html", "billing.html"];
    const isProtected = protectedPages.includes(href);

    if (isProtected) {
      if (!authResolved) {
        modalBody.innerHTML = `
          <div class="account-empty-state" style="padding: 48px 16px;">
            <i data-lucide="loader"></i>
            <p>Checking login status...</p>
          </div>
        `;
        initIcons();
        await authReadyPromise;
      }

      if (!currentAccountUser) {
        modalBody.innerHTML = `
          <div class="auth-notice-card">
            <div class="auth-notice-icon-circle">
              <i data-lucide="lock"></i>
            </div>
            <h2>You are not logged in</h2>
            <p>Please log in with your email or Google account to access your ${tabName.toLowerCase()}.</p>
            <div class="auth-notice-actions">
              <a class="button-primary" href="../index.html#/login" onclick="localStorage.setItem('loginRedirect', window.location.href);"><i data-lucide="log-in"></i> Log In</a>
              <a class="button-secondary" href="../index.html"><i data-lucide="home"></i> Return Home</a>
            </div>
          </div>
        `;
        initIcons();
        return;
      }
    }

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const isCurrentPage = href === currentPage || (currentPage === "" && href === "index.html");

    if (isCurrentPage && inlineView) {
      inlineView.classList.add("in-modal");
      modalBody.appendChild(inlineView);
    } else {
      const tmplKey = href.replace(".html", "").toLowerCase();
      const tmpl = document.getElementById(`tmpl-${tmplKey}`);
      if (tmpl) {
        modalBody.appendChild(tmpl.content.cloneNode(true));
      } else if (defaultTabTemplates[tmplKey]) {
        modalBody.innerHTML = defaultTabTemplates[tmplKey];
      } else if (inlineView && href === "index.html") {
        inlineView.classList.add("in-modal");
        modalBody.appendChild(inlineView);
      } else {
        modalBody.innerHTML = `
          <div class="account-empty-state">
            <i data-lucide="${iconName}"></i>
            <h3>${tabName}</h3>
            <p>View detailed information and manage your preferences.</p>
          </div>
        `;
      }
    }

    // Refresh icons inside modal
    initIcons();

    // Trigger dynamic data initializers
    if (href === "index.html") {
      initProfileForm(currentAccountUser);
    } else if (currentAccountUser) {
      if (href === "orders.html") {
        initOrdersList(currentAccountUser);
      } else if (href === "purchased.html") {
        initPurchasedList(currentAccountUser);
      }
    }
  }

  window.openTabInModalInstance = openTabInModal;

  // Bind clicks on sub-navigation tabs (Smartphone & Tablet only)
  document.querySelectorAll(".account-tab").forEach((tab) => {
    tab.addEventListener("click", (e) => {
      // ONLY intercept on smartphone and tablet viewports (<= 1024px)
      if (window.innerWidth <= 1024) {
        e.preventDefault();
        openTabInModal(tab);
      }
      // On desktop/PC (> 1024px), DO NOT preventDefault - let normal browser navigation occur!
    });
  });

  // Bind close buttons and dismissal triggers
  document.addEventListener("click", (e) => {
    if (e.target.closest("#account-modal-close-btn")) {
      closeModal();
    } else if (e.target === modal) {
      closeModal();
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.classList.contains("active")) {
      closeModal();
    }
  });

  // Window resize handler: if resized to desktop, close modal and restore inline view
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1024) {
      if (modal && modal.classList.contains("active")) {
        closeModal();
      }
      if (inlineView && inlinePlaceholder && inlineView.parentElement !== inlinePlaceholder.parentElement) {
        inlineView.classList.remove("in-modal");
        inlinePlaceholder.after(inlineView);
      }
    }
  });
}

async function initAccountAuth() {
  const tools = await getFirebaseTools();
  if (!tools) {
    authResolved = true;
    if (authReadyResolve) authReadyResolve(null);
    updateUserHeader(null);
    updateAccountNavAuth(null);
    handleUnauthenticatedState();
    return;
  }

  tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
    currentAccountUser = user;
    authResolved = true;
    if (authReadyResolve) authReadyResolve(user);

    updateUserHeader(user);
    updateAccountNavAuth(user);

    if (!user) {
      handleUnauthenticatedState();
      refreshModalIfActive();
      return;
    }

    await loadAccountProfile(user);

    // Page-specific initializers
    initProfileForm(user);
    initOrdersList(user);
    initPurchasedList(user);
    initIcons();
    refreshModalIfActive();
  });
}

function refreshModalIfActive() {
  const modal = document.getElementById("account-tab-modal");
  if (modal && modal.classList.contains("active")) {
    const activeTab = document.querySelector(".account-tab.active");
    if (activeTab && window.openTabInModalInstance) {
      window.openTabInModalInstance(activeTab);
    }
  }
}

function updateAccountNavAuth(user) {
  const isAuth = !!user;
  const labelText = isAuth ? "Account" : "Login";
  const iconName = isAuth ? "user" : "log-in";
  const targetHref = isAuth ? "index.html" : "../index.html#/login";

  // Desktop navigation Account/Login link
  document.querySelectorAll(".desktop-nav a").forEach((link) => {
    const text = link.textContent.trim().toLowerCase();
    if (text === "account" || text === "login" || link.hasAttribute("data-nav-account")) {
      link.setAttribute("href", targetHref);
      link.innerHTML = `<i data-lucide="${iconName}"></i>${labelText}`;
    }
  });

  // Mobile bottom navigation Account/Login link
  document.querySelectorAll(".bottom-nav a").forEach((link) => {
    const text = link.textContent.trim().toLowerCase();
    if (text === "account" || text === "login" || link.hasAttribute("data-nav-account")) {
      link.setAttribute("href", targetHref);
      link.innerHTML = `<i data-lucide="${iconName}"></i><span>${labelText}</span>`;
    }
  });

  initIcons();
}

function updateUserHeader(user) {
  const avatarEl = document.getElementById("account-avatar");
  const emailEl = document.getElementById("account-user-email");
  const adminBtn = document.getElementById("account-admin-btn");
  const logoutBtn = document.getElementById("account-logout-btn");
  let loginBtn = document.getElementById("account-login-btn");

  if (!loginBtn && logoutBtn && logoutBtn.parentElement) {
    loginBtn = document.createElement("a");
    loginBtn.id = "account-login-btn";
    loginBtn.className = "button-primary";
    loginBtn.href = "../index.html#/login";
    loginBtn.onclick = () => localStorage.setItem("loginRedirect", window.location.href);
    loginBtn.innerHTML = '<i data-lucide="log-in"></i> Log In';
    logoutBtn.parentElement.insertBefore(loginBtn, logoutBtn);
  }

  if (user) {
    const email = user.email || "Customer";
    const initial = email.charAt(0).toUpperCase();
    if (avatarEl) avatarEl.textContent = initial;
    if (emailEl) emailEl.textContent = email;

    if (adminBtn) {
      adminBtn.style.display = user.email === adminEmail ? "inline-flex" : "none";
    }

    if (logoutBtn) {
      logoutBtn.style.display = "inline-flex";
      logoutBtn.addEventListener("click", handleLogout);
    }

    if (loginBtn) {
      loginBtn.style.display = "none";
    }
  } else {
    if (avatarEl) avatarEl.textContent = "?";
    if (emailEl) emailEl.textContent = "Not logged in";
    if (adminBtn) adminBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (loginBtn) loginBtn.style.display = "inline-flex";
  }

  initIcons();
}

function handleUnauthenticatedState() {
  const currentPath = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const protectedPages = ["orders.html", "purchased.html", "billing.html"];

  if (!protectedPages.includes(currentPath)) {
    return;
  }

  const contentArea = document.getElementById("account-content-view");
  if (!contentArea) return;

  const returnUrl = window.location.href;
  localStorage.setItem("loginRedirect", returnUrl);

  contentArea.innerHTML = `
    <div class="auth-notice-card">
      <div class="auth-notice-icon-circle">
        <i data-lucide="lock"></i>
      </div>
      <h2>You are not logged in</h2>
      <p>Please log in with your email or Google account to access your account preferences, orders, and study materials.</p>
      <div class="auth-notice-actions">
        <a class="button-primary" href="../index.html#/login" onclick="localStorage.setItem('loginRedirect', window.location.href);"><i data-lucide="log-in"></i> Log In</a>
        <a class="button-secondary" href="../index.html"><i data-lucide="home"></i> Return Home</a>
      </div>
    </div>
  `;
  initIcons();
}

async function handleLogout() {
  const tools = await getFirebaseTools();
  if (tools) {
    await tools.authModule.signOut(tools.auth);
    window.location.href = "../index.html";
  }
}

async function loadAccountProfile(user) {
  const tools = await getFirebaseTools();
  if (!tools || !user) return;

  try {
    const profileRef = tools.firestoreModule.doc(tools.db, "userProfiles", user.uid);
    const snapshot = await tools.firestoreModule.getDoc(profileRef);

    if (snapshot.exists()) {
      currentAccountProfile = { uid: user.uid, email: user.email, ...snapshot.data() };
    } else {
      currentAccountProfile = {
        uid: user.uid,
        email: user.email,
        format: localStorage.getItem("coco_practice_format") || "goethe",
        level: localStorage.getItem("coco_practice_level") || "A1",
        country: localStorage.getItem("coco_user_country") || "",
        currency: localStorage.getItem("coco_user_currency") || "INR",
      };
    }
  } catch (error) {
    console.error("Failed to load user profile:", error);
  }
}

function populateProfileFormFields(form) {
  if (!form) return;
  const formatSelect = form.querySelector("[name='format']");
  const levelSelect = form.querySelector("[name='level']");
  const countrySelect = form.querySelector("[name='country']");
  const currencySelect = form.querySelector("[name='currency']");

  const currentFormat = (
    currentAccountProfile?.format ||
    localStorage.getItem("coco_practice_format") ||
    "goethe"
  ).toLowerCase();

  const currentLevel = (
    currentAccountProfile?.level ||
    currentAccountProfile?.current_level ||
    localStorage.getItem("coco_practice_level") ||
    "A1"
  ).toUpperCase();

  const currentCountry =
    currentAccountProfile?.country ||
    localStorage.getItem("coco_user_country") ||
    "";

  const currentCurrency =
    currentAccountProfile?.currency ||
    localStorage.getItem("coco_user_currency") ||
    "INR";

  if (formatSelect) {
    formatSelect.innerHTML =
      `<option value="">Select exam format</option>` +
      examFormatOptions
        .map(
          ([val, label]) =>
            `<option value="${val}" ${val.toLowerCase() === currentFormat ? "selected" : ""}>${label}</option>`
        )
        .join("");
  }

  if (levelSelect) {
    levelSelect.innerHTML =
      `<option value="">Select level</option>` +
      germanLevelOptions
        .map(
          (lvl) =>
            `<option value="${lvl}" ${lvl.toUpperCase() === currentLevel ? "selected" : ""}>${lvl}</option>`
        )
        .join("");
  }

  if (countrySelect) {
    countrySelect.innerHTML =
      `<option value="">Select country</option>` +
      countryOptions
        .map(
          (c) =>
            `<option value="${c}" ${c === currentCountry ? "selected" : ""}>${c}</option>`
        )
        .join("");
  }

  if (currencySelect) {
    currencySelect.innerHTML =
      `<option value="">Select currency</option>` +
      currencyOptions
        .map(
          ([val, label]) =>
            `<option value="${val}" ${val === currentCurrency ? "selected" : ""}>${label}</option>`
        )
        .join("");
  }
}

function initProfileForm(user) {
  const forms = document.querySelectorAll("#account-profile-form");
  if (!forms.length) return;

  forms.forEach((form) => {
    populateProfileFormFields(form);

    if (form.dataset.initialized === "true") {
      return;
    }
    form.dataset.initialized = "true";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = form.querySelector("#profile-message") || document.getElementById("profile-message");
      const data = new FormData(form);
      const country = String(data.get("country") || "").trim();
      const currency = String(data.get("currency") || "").trim();
      const format = String(data.get("format") || "goethe").toLowerCase().trim();
      const level = String(data.get("level") || "A1").toUpperCase().trim();

      if (!country || !currency || !format || !level) {
        if (msg) {
          msg.className = "error";
          msg.textContent = "Please complete all fields (Format, Level, Country, Currency).";
          msg.style.display = "inline-flex";
        }
        return;
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      try {
        // 1. Sync local storage & state for all users (guests & authenticated)
        localStorage.setItem("coco_practice_level", level);
        localStorage.setItem("coco_practice_format", format.toLowerCase());
        localStorage.setItem("coco_user_country", country);
        localStorage.setItem("coco_user_currency", currency);
        localStorage.setItem("coco_last_target_update", Date.now().toString());

        if (window.CocoStateSync && typeof window.CocoStateSync.notifyTargetChanged === "function") {
          window.CocoStateSync.notifyTargetChanged(level, format);
        }

        currentAccountProfile = {
          ...(currentAccountProfile || {}),
          uid: currentAccountUser?.uid || null,
          email: currentAccountUser?.email || "",
          country,
          currency,
          format,
          level,
          current_level: level,
        };

        // 2. If user is authenticated, save to Firestore & ping Worker
        if (currentAccountUser) {
          const tools = await getFirebaseTools();
          if (tools) {
            await tools.firestoreModule.setDoc(
              tools.firestoreModule.doc(tools.db, "userProfiles", currentAccountUser.uid),
              {
                uid: currentAccountUser.uid,
                email: currentAccountUser.email || "",
                country,
                currency,
                format,
                level,
                updatedAt: tools.firestoreModule.serverTimestamp(),
              },
              { merge: true }
            );

            try {
              const timezone =
                typeof Intl !== "undefined" && Intl.DateTimeFormat
                  ? Intl.DateTimeFormat().resolvedOptions().timeZone
                  : "UTC";
              const idToken = await currentAccountUser.getIdToken(true);
              await fetch(
                "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev/learning/onboarding",
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({ level, format, timezone }),
                }
              ).catch((err) => console.warn("Worker onboarding ping warning:", err));
            } catch (pingErr) {
              console.warn("Onboarding ping failed:", pingErr);
            }
          }
        }

        if (msg) {
          msg.className = "success";
          msg.textContent = "Preferences saved successfully.";
          msg.style.display = "inline-flex";
          setTimeout(() => {
            if (msg) msg.style.display = "none";
          }, 3500);
        }
      } catch (err) {
        console.error("Failed to save profile preferences:", err);
        if (msg) {
          msg.className = "error";
          msg.textContent = "Failed to save preferences. Please try again.";
          msg.style.display = "inline-flex";
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

async function initOrdersList(user) {
  const container = document.getElementById("account-orders-container");
  if (!container || !user) return;

  const tools = await getFirebaseTools();
  if (!tools) return;

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "orders"));
    const orders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((order) => user.email === adminEmail || order.userId === user.uid || order.email === user.email);

    if (!orders.length) {
      container.innerHTML = `
        <div class="account-empty-state">
          <i data-lucide="shopping-bag"></i>
          <h3>No Orders Yet</h3>
          <p>You haven't submitted any study material orders yet. Browse our curated workbooks and mock exam packages.</p>
          <a class="button-primary" href="../index.html#/resources/study-materials">
            <i data-lucide="book-open"></i> Browse Study Materials
          </a>
        </div>
      `;
      initIcons();
      return;
    }

    container.innerHTML = `
      <div class="order-list">
        ${orders
          .map((order) => {
            const statusClass = (order.status || "pending").toLowerCase();
            const title = order.resourceTitle || order.productName || "German Study Material";
            const dateStr = order.createdAt ? new Date(order.createdAt.seconds ? order.createdAt.seconds * 1000 : order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Recent";
            return `
              <div class="order-card">
                <div class="order-info">
                  <h4 class="order-title">${title}</h4>
                  <div class="order-meta">
                    <span><i data-lucide="hash"></i> ${order.id}</span>
                    <span><i data-lucide="calendar"></i> ${dateStr}</span>
                    ${order.amount ? `<span><i data-lucide="credit-card"></i> ${order.amount}</span>` : ""}
                  </div>
                </div>
                <div class="order-badges-group">
                  <span class="status-pill ${statusClass}">${order.status || "Pending"}</span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
    initIcons();
  } catch (error) {
    console.error("Failed to load orders:", error);
    container.innerHTML = `<p class="error">Failed to load orders. Please refresh.</p>`;
  }
}

async function initPurchasedList(user) {
  const container = document.getElementById("account-purchased-container");
  if (!container || !user) return;

  const tools = await getFirebaseTools();
  if (!tools) return;

  try {
    const snapshot = await tools.firestoreModule.getDocs(tools.firestoreModule.collection(tools.db, "orders"));
    const completedOrders = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((order) => (user.email === adminEmail || order.userId === user.uid || order.email === user.email) && order.status === "Completed");

    if (!completedOrders.length) {
      container.innerHTML = `
        <div class="account-empty-state">
          <i data-lucide="folder-x"></i>
          <h3>No Purchased Resources Yet</h3>
          <p>Once your orders are verified and marked Completed, your unlocked downloadable materials and practice materials will appear here.</p>
          <a class="button-primary" href="../index.html#/resources/study-materials">
            <i data-lucide="book-open"></i> Browse Resources
          </a>
        </div>
      `;
      initIcons();
      return;
    }

    container.innerHTML = `
      <div class="order-list">
        ${completedOrders
          .map((order) => {
            const title = order.resourceTitle || order.productName || "German Study Material";
            return `
              <div class="order-card">
                <div class="order-info">
                  <h4 class="order-title">${title}</h4>
                  <div class="order-meta">
                    <span><i data-lucide="check-circle-2"></i> Fulfilled &amp; Verified</span>
                    <span><i data-lucide="hash"></i> ${order.id}</span>
                  </div>
                </div>
                <div class="order-badges-group">
                  <span class="status-pill completed">Active</span>
                  <a class="button-secondary" style="padding: 6px 14px; font-size: 12px;" href="../index.html#/resources/study-materials">
                    <i data-lucide="external-link"></i> View Material
                  </a>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
    initIcons();
  } catch (error) {
    console.error("Failed to load purchased resources:", error);
    container.innerHTML = `<p class="error">Failed to load resources. Please refresh.</p>`;
  }
}
