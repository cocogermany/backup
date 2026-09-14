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

async function initAccountAuth() {
  const tools = await getFirebaseTools();
  if (!tools) return;

  tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
    currentAccountUser = user;
    updateUserHeader(user);

    if (!user) {
      handleUnauthenticatedState();
      return;
    }

    await loadAccountProfile(user);

    // Page-specific initializers
    initProfileForm(user);
    initOrdersList(user);
    initPurchasedList(user);
    initIcons();
  });
}

function updateUserHeader(user) {
  const avatarEl = document.getElementById("account-avatar");
  const emailEl = document.getElementById("account-user-email");
  const adminBtn = document.getElementById("account-admin-btn");
  const logoutBtn = document.getElementById("account-logout-btn");

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
  } else {
    if (avatarEl) avatarEl.textContent = "?";
    if (emailEl) emailEl.textContent = "Guest";
    if (adminBtn) adminBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
}

function handleUnauthenticatedState() {
  const contentArea = document.getElementById("account-content-view");
  if (!contentArea) return;

  const returnUrl = window.location.href;
  localStorage.setItem("loginRedirect", returnUrl);

  contentArea.innerHTML = `
    <div class="auth-notice-card">
      <i data-lucide="lock"></i>
      <h2>Sign in to view your account</h2>
      <p>Log in with your email or Google account to view your preferences, orders, and study materials.</p>
      <div style="display: flex; gap: 12px; margin-top: 8px;">
        <a class="button-primary" href="../index.html#/login"><i data-lucide="log-in"></i> Log In</a>
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
