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
      <h3>Current Membership Status</h3>
      <p>
        Your account is currently active on the standard customer tier. If you have subscribed to interactive practice packs or individual workbooks, your invoices and fulfillment records are stored under <a href="orders.html" style="color: var(--brand); font-weight: 600;">My Orders</a>.
      </p>
      <div class="account-empty-state" style="margin: 28px 0;">
        <i data-lucide="crown"></i>
        <h3>Explore Premium Membership</h3>
        <p>Unlock unlimited Goethe &amp; telc mock exams, automated grammar evaluation, and full access to our digital publishing library.</p>
        <a class="button-primary" href="../index.html#/membership">
          <i data-lucide="sparkles"></i> View Membership Plans
        </a>
      </div>
      <h3>Payment Methods &amp; Invoicing</h3>
      <p>
        Payments for digital study guides and mock preparation kits are processed securely via Stripe or verified UPI transfer with invoice confirmation delivered to your registered email address.
      </p>
    </div>
  `,
  help: `
    <div class="account-section-header">
      <h2>Help &amp; Customer Support</h2>
      <p>Find answers to frequent inquiries or contact the Coco Germany team.</p>
    </div>
    <div class="doc-prose">
      <h3>Frequently Asked Questions</h3>
      <h4>How do I receive my purchased digital PDF workbooks?</h4>
      <p>
        Digital books and practice papers are unlocked automatically under <a href="purchased.html" style="color: var(--brand); font-weight: 600;">Purchased Resources</a> once manual payment verification is confirmed by our editorial desk (typically within 2 to 6 hours).
      </p>
      <h4>How does the Practice App synchronize my target German level?</h4>
      <p>
        When you update your Exam Format (Goethe or telc) and CEFR Level (A1–B2) in <a href="index.html" style="color: var(--brand); font-weight: 600;">Profile Settings</a>, your target curriculum is automatically synchronized with the interactive Practice App and your learning analytics.
      </p>
      <h4>Need direct assistance with an order?</h4>
      <p>
        For order modifications, invoice receipts, or technical questions, please visit our <a href="../index.html#/contact" style="color: var(--brand); font-weight: 600;">Contact Page</a> or write directly to our editorial team at <code>cocogermany.ytd@gmail.com</code>.
      </p>
    </div>
  `,
  terms: `
    <div class="account-section-header">
      <h2>Terms &amp; Conditions</h2>
      <p>Last updated: September 2026 • Platform usage &amp; digital publication agreements.</p>
    </div>
    <div class="doc-prose">
      <h3>1. Educational Scope &amp; Usage</h3>
      <p>
        Coco Germany provides educational software, practice simulations, and digital study publications. All exam-preparation kits and mock tests are engineered for independent study and are not officially endorsed by Goethe-Institut e.V. or telc gGmbH unless explicitly noted.
      </p>
      <h3>2. Digital Products &amp; Intellectual Property</h3>
      <p>
        All PDF workbooks, curated exercise frames, audio recordings, and editorial analyses are protected by international copyright laws. When you purchase or download materials from Coco Germany, you receive a single-user personal license for your individual study. Reproduction, resale, or unauthorized redistribution is strictly prohibited.
      </p>
      <h3>3. Account Security</h3>
      <p>
        You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your registered account.
      </p>
    </div>
  `,
  privacy: `
    <div class="account-section-header">
      <h2>Privacy Policy</h2>
      <p>Last updated: September 2026 • How we collect, safeguard, and process your data.</p>
    </div>
    <div class="doc-prose">
      <h3>1. Data We Collect</h3>
      <p>
        We collect your email address upon registration and your selected learning preferences (target German exam format, CEFR level, country, and preferred currency). We use this information strictly to customize your interactive practice exercises, mock exam timers, and order fulfillments.
      </p>
      <h3>2. Storage &amp; Security</h3>
      <p>
        Your account data is stored in enterprise-grade Google Firebase Firestore and Supabase databases utilizing end-to-end transport layer security (TLS 1.3). We never sell your personal data or email address to third parties or marketing brokers.
      </p>
      <h3>3. Your Rights Under GDPR</h3>
      <p>
        As a learner, you maintain the right to access your stored profile information, request corrections, or request complete deletion of your customer record at any time by contacting <code>cocogermany.ytd@gmail.com</code>.
      </p>
    </div>
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
  initMobileTabModal();
  await initAccountAuth();
});

function highlightActiveNavTab() {
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

    // The 4 protected tabs that require authentication
    const protectedPages = ["index.html", "orders.html", "purchased.html", "billing.html"];
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

    // Trigger dynamic data initializers if user is authenticated
    if (currentAccountUser) {
      if (href === "orders.html") {
        initOrdersList(currentAccountUser);
      } else if (href === "purchased.html") {
        initPurchasedList(currentAccountUser);
      } else if (href === "index.html") {
        initProfileForm(currentAccountUser);
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
  const protectedPages = ["index.html", "orders.html", "purchased.html", "billing.html", ""];

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
        country: "",
        currency: "INR",
      };
    }
  } catch (error) {
    console.error("Failed to load user profile:", error);
  }
}

function initProfileForm(user) {
  const form = document.getElementById("account-profile-form");
  if (!form || !user) return;

  // Populate options
  const formatSelect = form.querySelector("[name='format']");
  const levelSelect = form.querySelector("[name='level']");
  const countrySelect = form.querySelector("[name='country']");
  const currencySelect = form.querySelector("[name='currency']");

  const currentFormat = (currentAccountProfile?.format || "goethe").toLowerCase();
  const currentLevel = (currentAccountProfile?.level || currentAccountProfile?.current_level || "A1").toUpperCase();
  const currentCountry = currentAccountProfile?.country || "";
  const currentCurrency = currentAccountProfile?.currency || "INR";

  if (formatSelect) {
    formatSelect.innerHTML = `<option value="">Select exam format</option>` +
      examFormatOptions.map(([val, label]) => `<option value="${val}" ${val.toLowerCase() === currentFormat ? "selected" : ""}>${label}</option>`).join("");
  }

  if (levelSelect) {
    levelSelect.innerHTML = `<option value="">Select level</option>` +
      germanLevelOptions.map((lvl) => `<option value="${lvl}" ${lvl.toUpperCase() === currentLevel ? "selected" : ""}>${lvl}</option>`).join("");
  }

  if (countrySelect) {
    countrySelect.innerHTML = `<option value="">Select country</option>` +
      countryOptions.map((c) => `<option value="${c}" ${c === currentCountry ? "selected" : ""}>${c}</option>`).join("");
  }

  if (currencySelect) {
    currencySelect.innerHTML = `<option value="">Select currency</option>` +
      currencyOptions.map(([val, label]) => `<option value="${val}" ${val === currentCurrency ? "selected" : ""}>${label}</option>`).join("");
  }

  // Handle submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("profile-message");
    const data = new FormData(form);
    const country = String(data.get("country") || "").trim();
    const currency = String(data.get("currency") || "").trim();
    const format = String(data.get("format") || "goethe").toLowerCase().trim();
    const level = String(data.get("level") || "A1").toUpperCase().trim();

    if (!country || !currency || !format || !level) {
      if (msg) {
        msg.className = "error";
        msg.textContent = "Please complete all fields (Format, Level, Country, Currency).";
      }
      return;
    }

    const tools = await getFirebaseTools();
    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) submitBtn.disabled = true;

    try {
      // 1. Save to Firestore
      await tools.firestoreModule.setDoc(
        tools.firestoreModule.doc(tools.db, "userProfiles", user.uid),
        {
          uid: user.uid,
          email: user.email || "",
          country,
          currency,
          format,
          level,
          updatedAt: tools.firestoreModule.serverTimestamp(),
        },
        { merge: true }
      );

      currentAccountProfile = {
        ...(currentAccountProfile || {}),
        uid: user.uid,
        email: user.email || "",
        country,
        currency,
        format,
        level,
        current_level: level,
      };

      // 2. Sync local state
      localStorage.setItem("coco_practice_level", level);
      localStorage.setItem("coco_practice_format", format.toLowerCase());
      localStorage.setItem("coco_last_target_update", Date.now().toString());

      if (window.CocoStateSync && typeof window.CocoStateSync.notifyTargetChanged === "function") {
        window.CocoStateSync.notifyTargetChanged(level, format);
      }

      // 3. Notify Cloudflare Worker
      const timezone = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
      const idToken = await user.getIdToken(true);
      await fetch("https://cocogermany-r2-worker.cocogermany-ytd.workers.dev/learning/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`,
        },
        body: JSON.stringify({ level, format, timezone }),
      }).catch((err) => console.warn("Worker onboarding ping warning:", err));

      if (msg) {
        msg.className = "success";
        msg.textContent = "Preferences saved successfully.";
        setTimeout(() => {
          if (msg) msg.style.display = "none";
        }, 3500);
      }
    } catch (err) {
      console.error(err);
      if (msg) {
        msg.className = "error";
        msg.textContent = "Failed to save preferences. Please try again.";
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
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
