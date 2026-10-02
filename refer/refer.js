/**
 * Coco Germany — Dedicated Affiliate Program Logic (refer.js)
 * Production-ready referral dashboard, dynamic link generation,
 * Cloudflare Worker sync with Firestore fallback, and coin history rendering.
 */

const firebaseConfig = {
  apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
  authDomain: "cocogermany-ba33f.firebaseapp.com",
  projectId: "cocogermany-ba33f",
  storageBucket: "cocogermany-ba33f.firebasestorage.app",
  messagingSenderId: "689122181603",
  appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
};

const WORKER_URL = "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";

let firebaseTools = null;
let currentReferUser = null;

function initIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/**
 * Capture incoming ref parameter if visitor landed directly on refer/index.html
 */
function captureIncomingReferral() {
  try {
    let refCode = null;
    // 1. Check window.location.search (?ref=CODE)
    if (window.location.search) {
      const params = new URLSearchParams(window.location.search);
      refCode = params.get("ref");
    }
    // 2. Check window.location.hash (e.g. #/login?ref=CODE or #/?ref=CODE)
    if (!refCode && window.location.hash) {
      const hash = window.location.hash;
      const qIndex = hash.indexOf("?");
      if (qIndex !== -1) {
        const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
        refCode = hashParams.get("ref");
      }
    }
    // 3. Fallback: regex search in full href in case of non-standard hash query positioning
    if (!refCode && window.location.href) {
      const match = window.location.href.match(/[?&]ref=([a-zA-Z0-9_-]+)/i);
      if (match) {
        refCode = match[1];
      }
    }
    if (refCode) {
      const clean = refCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
      if (clean) {
        localStorage.setItem("coco_referral_code", clean);
      }
    }
  } catch (e) {
    console.warn("Could not capture referral param in refer.js:", e);
  }
}
window.addEventListener("hashchange", captureIncomingReferral);

/**
 * Dynamic import of Firebase SDK modules (modular v10)
 */
async function getFirebaseTools() {
  if (firebaseTools) return firebaseTools;

  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const app = appModule.getApps().length === 0 ? appModule.initializeApp(firebaseConfig) : appModule.getApp();

    firebaseTools = {
      app,
      auth: authModule.getAuth(app),
      authModule,
      db: firestoreModule.getFirestore(app),
      firestoreModule,
    };

    return firebaseTools;
  } catch (err) {
    console.error("Failed to load Firebase tools in refer.js:", err);
    return null;
  }
}

/**
 * Construct dynamic referral link using current deployment host & path pointing to normal login page
 */
function buildReferralLink(referralCode) {
  const origin = window.location.origin;
  // Strip trailing '/refer' or '/refer/index.html' from pathname to find site base
  const cleanBase = window.location.pathname.replace(/\/refer(\/.*)?$/, "");
  return `${origin}${cleanBase}/index.html#/login?ref=${encodeURIComponent(referralCode)}`;
}

/**
 * Copy text with visual checkmark feedback
 */
async function copyToClipboard(text, buttonEl, originalLabel) {
  try {
    await navigator.clipboard.writeText(text);
    if (buttonEl) {
      buttonEl.classList.add("button-copied");
      const labelSpan = buttonEl.querySelector("span");
      const iconEl = buttonEl.querySelector("i, svg");
      if (labelSpan) labelSpan.textContent = "Copied!";
      if (iconEl) iconEl.setAttribute("data-lucide", "check");
      initIcons();

      setTimeout(() => {
        buttonEl.classList.remove("button-copied");
        if (labelSpan) labelSpan.textContent = originalLabel;
        if (iconEl) iconEl.setAttribute("data-lucide", originalLabel.includes("Code") ? "copy" : "link");
        initIcons();
      }, 2000);
    }
  } catch (err) {
    console.warn("Clipboard write failed, using prompt fallback:", err);
    window.prompt("Copy your referral link:", text);
  }
}

/**
 * Native Web Share or fallback
 */
async function handleShareLink(referralLink, referralCode) {
  const shareData = {
    title: "Learn German on Coco Germany",
    text: `Join Coco Germany to prepare for Goethe and telc examinations (A1–B2). Use my invite code: ${referralCode}`,
    url: referralLink,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch (err) {
      if (err.name !== "AbortError") {
        console.warn("navigator.share failed, fallback to copy:", err);
      } else {
        return;
      }
    }
  }

  // Fallback to clipboard copy
  const shareBtn = document.getElementById("share-link-btn");
  copyToClipboard(referralLink, shareBtn, "Share");
}

/**
 * Generate fallback referral code if user doesn't have one and worker is offline
 */
function generateFallbackCode() {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "COCO";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Fetch referral data from Cloudflare Worker with seamless Firestore fallback
 */
async function fetchReferralDashboardData(user) {
  if (!user) return null;

  try {
    const idToken = await user.getIdToken(true);
    const res = await fetch(`${WORKER_URL}/referral/dashboard`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        return data;
      }
    }
  } catch (err) {
    console.warn("Worker referral dashboard request failed, falling back to Firestore:", err);
  }

  // Graceful client-side fallback via Firebase SDK
  const tools = await getFirebaseTools();
  if (!tools) return null;

  try {
    // 1. Get or generate user referral code in userProfiles
    const profileRef = tools.firestoreModule.doc(tools.db, "userProfiles", user.uid);
    const profileSnap = await tools.firestoreModule.getDoc(profileRef);
    let referralCode = "";

    if (profileSnap.exists() && profileSnap.data().referralCode) {
      referralCode = profileSnap.data().referralCode;
    } else {
      referralCode = generateFallbackCode();
      await tools.firestoreModule.setDoc(
        profileRef,
        {
          referralCode,
          referralCreatedAt: tools.firestoreModule.serverTimestamp(),
          updatedAt: tools.firestoreModule.serverTimestamp(),
        },
        { merge: true }
      );
    }

    // 2. Get wallet
    let wallet = { coinBalance: 0, totalEarned: 0, totalSpent: 0, transactions: [] };
    try {
      const walletRef = tools.firestoreModule.doc(tools.db, "referralWallets", user.uid);
      const walletSnap = await tools.firestoreModule.getDoc(walletRef);
      if (walletSnap.exists()) {
        wallet = { ...wallet, ...walletSnap.data() };
      }
    } catch (e) {
      console.warn("Could not read wallet directly:", e);
    }

    // 3. Count total referrals
    let totalReferrals = 0;
    try {
      const referralsQuery = tools.firestoreModule.query(
        tools.firestoreModule.collection(tools.db, "referrals"),
        tools.firestoreModule.where("referrerUid", "==", user.uid)
      );
      const referralsSnap = await tools.firestoreModule.getDocs(referralsQuery);
      totalReferrals = referralsSnap.docs.length;
    } catch (e) {
      console.warn("Could not query referrals directly:", e);
    }

    const transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
    const successfulPurchases = transactions.filter((tx) => tx && tx.type === "referral_reward").length;

    return {
      success: true,
      referralCode,
      referralLink: buildReferralLink(referralCode),
      stats: {
        totalReferrals,
        successfulPurchases,
        coinBalance: wallet.coinBalance || 0,
        totalEarned: wallet.totalEarned || 0,
        totalSpent: wallet.totalSpent || 0,
      },
      transactions,
    };
  } catch (fallbackErr) {
    console.error("Firestore fallback failed:", fallbackErr);
    return null;
  }
}

/**
 * Format transaction row
 */
function renderTransactionRow(tx) {
  const isReward = tx.type === "referral_reward";
  const isReversal = tx.type === "reversal";
  const coinsNum = Number(tx.coins) || 0;

  const sign = coinsNum > 0 ? "+" : "";
  const coinsFormatted = `${sign}${coinsNum.toLocaleString()} coins`;
  const pillClass = isReward ? "positive" : isReversal ? "negative" : "neutral";
  const iconName = isReward ? "trending-up" : isReversal ? "rotate-ccw" : "credit-card";

  // Natural human description conforming to prompt requirements
  let title = "Referral purchase";
  if (isReversal) {
    title = "Reversal for cancelled order";
  } else if (tx.description) {
    title = tx.description;
  }

  let subtitleParts = [];
  if (tx.orderId) {
    subtitleParts.push(`Order #${tx.orderId}`);
  }
  if (tx.purchaseAmount && tx.purchaseCurrency) {
    subtitleParts.push(`${tx.purchaseCurrency} ${tx.purchaseAmount}`);
  }
  const subtitle = subtitleParts.join(" • ");

  const dateStr = tx.createdAt
    ? new Date(tx.createdAt).toLocaleDateString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Recent";

  return `
    <div class="transaction-row">
      <div class="transaction-left">
        <div class="tx-icon-pill ${pillClass}">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="tx-meta">
          <div class="tx-title">${title}</div>
          ${subtitle ? `<div class="tx-subtitle">${subtitle}</div>` : ""}
        </div>
      </div>
      <div class="transaction-right">
        <div class="tx-amount ${pillClass}">${coinsFormatted}</div>
        <div class="tx-date">${dateStr}</div>
      </div>
    </div>
  `;
}

/**
 * Populate Affiliate Program UI with fetched data
 */
function populateDashboard(data) {
  const { referralCode, stats, transactions } = data;
  const referralLink = buildReferralLink(referralCode);

  // 1. Referral Code & Link
  const codeText = document.getElementById("referral-code-text");
  const linkInput = document.getElementById("referral-link-input");
  if (codeText) codeText.textContent = referralCode;
  if (linkInput) linkInput.value = referralLink;

  // 2. Stat boxes
  const balanceEl = document.getElementById("stat-coin-balance");
  const referralsEl = document.getElementById("stat-total-referrals");
  const purchasesEl = document.getElementById("stat-successful-purchases");
  const earnedEl = document.getElementById("stat-total-earned");
  const spentEl = document.getElementById("stat-total-spent");

  if (balanceEl) balanceEl.textContent = Number(stats.coinBalance || 0).toLocaleString();
  if (referralsEl) referralsEl.textContent = Number(stats.totalReferrals || 0).toLocaleString();
  if (purchasesEl) purchasesEl.textContent = Number(stats.successfulPurchases || 0).toLocaleString();
  if (earnedEl) earnedEl.textContent = Number(stats.totalEarned || 0).toLocaleString();
  if (spentEl) spentEl.textContent = Number(stats.totalSpent || 0).toLocaleString();

  // 3. Transactions History
  const historyContainer = document.getElementById("transaction-history-container");
  if (historyContainer) {
    if (!transactions || transactions.length === 0) {
      historyContainer.innerHTML = `
        <div class="empty-state">
          <i data-lucide="clock"></i>
          <h3>No Referral Activity Yet</h3>
          <p>Share your personal invite link above. When a referred learner purchases study materials or mock exams, your earned Coco Coins and reward transactions will appear here.</p>
        </div>
      `;
    } else {
      historyContainer.innerHTML = transactions.map(renderTransactionRow).join("");
    }
  }

  // 4. Bind action buttons
  const copyCodeBtn = document.getElementById("copy-code-btn");
  if (copyCodeBtn) {
    copyCodeBtn.onclick = () => copyToClipboard(referralCode, copyCodeBtn, "Copy Code");
  }

  const copyLinkBtn = document.getElementById("copy-link-btn");
  if (copyLinkBtn) {
    copyLinkBtn.onclick = () => copyToClipboard(referralLink, copyLinkBtn, "Copy Link");
  }

  const shareLinkBtn = document.getElementById("share-link-btn");
  if (shareLinkBtn) {
    shareLinkBtn.onclick = () => handleShareLink(referralLink, referralCode);
  }

  initIcons();
}

/**
 * Main initialization on DOMContentLoaded
 */
async function initReferralPage() {
  captureIncomingReferral();
  initIcons();

  const loadingState = document.getElementById("refer-loading-state");
  const authRequired = document.getElementById("refer-auth-required");
  const dashboardContent = document.getElementById("refer-dashboard-content");
  const loginBtn = document.getElementById("refer-login-btn");

  if (loginBtn) {
    loginBtn.addEventListener("click", () => {
      localStorage.setItem("loginRedirect", "refer/index.html");
    });
  }

  const tools = await getFirebaseTools();
  if (!tools) {
    if (loadingState) loadingState.innerHTML = `<p class="error">Unable to connect to authentication service. Please refresh the page.</p>`;
    return;
  }

  tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
    currentReferUser = user;

    if (!user) {
      if (loadingState) loadingState.style.display = "none";
      if (authRequired) authRequired.style.display = "block";
      if (dashboardContent) dashboardContent.style.display = "none";
      initIcons();
      return;
    }

    // User is authenticated
    if (authRequired) authRequired.style.display = "none";

    const data = await fetchReferralDashboardData(user);
    if (loadingState) loadingState.style.display = "none";

    if (data) {
      if (dashboardContent) dashboardContent.style.display = "block";
      populateDashboard(data);
    } else {
      if (loadingState) {
        loadingState.style.display = "block";
        loadingState.innerHTML = `
          <div class="empty-state">
            <i data-lucide="alert-circle"></i>
            <h3>Could Not Load Dashboard</h3>
            <p>We encountered a temporary issue loading your referral records. Please refresh the page or check back shortly.</p>
          </div>
        `;
        initIcons();
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", initReferralPage);
