/**
 * Coco Germany — Standalone Checkout Controller (checkout.js)
 *
 * Implements the complete frontend checkout flow & state machine:
 * - Dynamic purchase context resolution (Membership / Product / Course / Service).
 * - Firebase Auth & User Profile detection.
 * - Dynamic payment methods rendered from authoritative CheckoutService / Worker.
 * - Multi-state rendering: Loading, Ready, Unavailable, Pending, Success, Failed, Cancelled.
 * - Return-state handling for gateway redirects.
 */

(function () {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
    authDomain: "cocogermany-ba33f.firebaseapp.com",
    projectId: "cocogermany-ba33f",
    storageBucket: "cocogermany-ba33f.firebasestorage.app",
    messagingSenderId: "689122181603",
    appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
  };

  let currentUser = null;
  let userProfile = null;
  let currentSession = null;
  let selectedMethodId = null;

  /**
   * Helper to refresh Lucide icons
   */
  function renderIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  /**
   * Safe HTML string builder
   */
  function html(strings, ...values) {
    return strings.reduce((res, str, i) => res + str + (values[i] ?? ""), "");
  }

  /**
   * Dynamic import of Firebase SDK modules (modular v10)
   */
  async function getFirebaseTools() {
    try {
      const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
      const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
      const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

      const app = appModule.getApps().length === 0 ? appModule.initializeApp(firebaseConfig) : appModule.getApp();

      return {
        app,
        auth: authModule.getAuth(app),
        authModule,
        db: firestoreModule.getFirestore(app),
        firestoreModule,
      };
    } catch (err) {
      console.warn("Checkout: Could not load Firebase tools:", err);
      return null;
    }
  }

  /**
   * Fetch Firestore user profile for country/currency context
   */
  async function fetchUserProfile(uid, tools) {
    if (!uid || !tools || !tools.db || !tools.firestoreModule) return null;
    try {
      const docRef = tools.firestoreModule.doc(tools.db, "userProfiles", uid);
      const snap = await tools.firestoreModule.getDoc(docRef);
      if (snap.exists()) {
        return snap.data();
      }
    } catch (err) {
      console.warn("Checkout: Could not fetch Firestore user profile:", err);
    }
    return null;
  }

  /**
   * 1. RENDER LOADING STATE SKELETON
   */
  function renderLoadingState() {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    mount.innerHTML = html`
      <div class="checkout-grid skeleton-pulse">
        <div class="checkout-main">
          <div class="checkout-card" style="min-height: 120px;">
            <div class="skeleton-box" style="height: 18px; width: 30%; margin-bottom: 14px;"></div>
            <div class="skeleton-box" style="height: 48px; width: 100%;"></div>
          </div>
          <div class="checkout-card" style="min-height: 260px;">
            <div class="skeleton-box" style="height: 18px; width: 40%; margin-bottom: 20px;"></div>
            <div class="skeleton-box" style="height: 64px; width: 100%; margin-bottom: 12px;"></div>
            <div class="skeleton-box" style="height: 64px; width: 100%;"></div>
          </div>
        </div>
        <div class="checkout-sidebar">
          <div class="order-summary-card" style="min-height: 380px;">
            <div class="skeleton-box" style="height: 20px; width: 50%; margin-bottom: 24px;"></div>
            <div class="skeleton-box" style="height: 80px; width: 100%; margin-bottom: 20px;"></div>
            <div class="skeleton-box" style="height: 44px; width: 100%;"></div>
          </div>
        </div>
      </div>
    `;
    renderIcons();
  }

  /**
   * 2. RENDER READY STATE (Full Dynamic Checkout Form)
   */
  function renderReadyState(session) {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    currentSession = session;
    const item = session.item;
    const pricing = session.pricing;
    const customer = session.customer;
    const methods = session.available_payment_methods || [];

    // Pre-select first or popular method
    if (!selectedMethodId && methods.length > 0) {
      const popular = methods.find((m) => m.popular);
      selectedMethodId = popular ? popular.id : methods[0].id;
    }

    // Determine type display text
    const typeLabels = {
      membership: "Membership Tier",
      product: "Digital Material",
      course: "Exam Preparation Course",
      service: "Learning Service",
    };
    const typeLabel = typeLabels[item.type] || "Learning Purchase";

    const userEmail = customer.email || (currentUser && currentUser.email) || "Guest Learner";
    const userCountry = customer.country || "Global";
    const userCurrency = pricing.currency || "INR";
    const cadenceLabel = item.period || (item.type === "membership" ? "/month" : "");

    // Breadcrumb title
    const breadcrumbLabel = item.name || "Item Checkout";

    mount.innerHTML = html`
      <!-- Breadcrumb -->
      <nav class="breadcrumb-nav" aria-label="Breadcrumb">
        <a href="../index.html"><i data-lucide="home"></i> Home</a>
        <i data-lucide="chevron-right"></i>
        <a href="../index.html#/membership">Membership & Plans</a>
        <i data-lucide="chevron-right"></i>
        <span class="active-crumb">${breadcrumbLabel}</span>
      </nav>

      <div class="checkout-grid">
        <!-- Left: Customer Details & Dynamic Payment Methods -->
        <main class="checkout-main">
          <!-- Step 1: Customer Account & Regional Context -->
          <section class="checkout-card" aria-labelledby="step-customer-heading">
            <div class="checkout-card-header">
              <span class="checkout-step-label"><i data-lucide="user-check"></i> Step 1 of 2</span>
              <h2 class="checkout-card-title" id="step-customer-heading">Learner Account & Billing Region</h2>
              <p class="checkout-card-subtitle">Your purchases and practice quotas will be instantly attached to this profile.</p>
            </div>

            <div class="customer-profile-strip">
              <div class="customer-info-wrap">
                <div class="customer-avatar" aria-hidden="true">${userEmail.charAt(0).toUpperCase()}</div>
                <div class="customer-details">
                  <span class="customer-email">${userEmail}</span>
                  <span class="customer-status-note">
                    <i data-lucide="shield-check"></i>
                    ${currentUser ? "Verified Coco Germany Account" : "Guest Checkout"}
                  </span>
                </div>
              </div>

              <div class="customer-context-chips">
                <span class="context-chip" title="Billing Country Context">
                  <i data-lucide="map-pin"></i> Region: ${userCountry}
                </span>
                <span class="context-chip" title="Transaction Currency">
                  <i data-lucide="banknote"></i> Currency: ${userCurrency}
                </span>
              </div>
            </div>
          </section>

          <!-- Step 2: Dynamic Payment Methods (Worker Authoritative) -->
          <section class="checkout-card" aria-labelledby="step-payment-heading">
            <div class="checkout-card-header">
              <span class="checkout-step-label"><i data-lucide="credit-card"></i> Step 2 of 2</span>
              <h2 class="checkout-card-title" id="step-payment-heading">Select Payment Method</h2>
              <p class="checkout-card-subtitle">Available payment options are dynamically verified for your region and currency.</p>
            </div>

            ${methods.length === 0
              ? html`
                  <div class="method-guidance-box" style="border-color: var(--rose);">
                    <i data-lucide="alert-circle" style="color: var(--rose);"></i>
                    <span>No active payment methods are currently available for this currency. Please contact Coco Germany coordinator support.</span>
                  </div>
                `
              : html`
                  <div class="payment-methods-grid" role="radiogroup" aria-label="Available payment methods">
                    ${methods
                      .map((method) => {
                        const isSelected = method.id === selectedMethodId;
                        return html`
                          <div
                            class="payment-method-tile ${isSelected ? "is-selected" : ""}"
                            role="radio"
                            tabindex="0"
                            aria-checked="${isSelected ? "true" : "false"}"
                            data-method-id="${method.id}"
                          >
                            <div class="method-left">
                              <div class="method-radio-circle" aria-hidden="true">
                                <div class="method-radio-dot"></div>
                              </div>
                              <div class="method-icon-wrap" aria-hidden="true">
                                <i data-lucide="${method.icon || "credit-card"}"></i>
                              </div>
                              <div class="method-text-wrap">
                                <span class="method-title">${method.name}</span>
                                <span class="method-desc">${method.description}</span>
                              </div>
                            </div>
                            <div class="method-right">
                              ${method.badge
                                ? html`<span class="method-badge ${method.popular ? "badge-popular" : ""}">${method.badge}</span>`
                                : ""}
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>

                  <div class="method-guidance-box">
                    <i data-lucide="lock"></i>
                    <span>
                      Transactions are securely processed with 256-bit SSL encryption. Payment authorization will execute via the official secure gateway.
                    </span>
                  </div>
                `}
          </section>

          <!-- Reassurance Grid -->
          <div class="checkout-reassurance-grid">
            <div class="reassurance-mini-card">
              <div class="reassurance-mini-icon"><i data-lucide="zap"></i></div>
              <div class="reassurance-mini-text">
                <h4>Instant Activation</h4>
                <p>Credits and mock exams are activated immediately after payment.</p>
              </div>
            </div>
            <div class="reassurance-mini-card">
              <div class="reassurance-mini-icon"><i data-lucide="award"></i></div>
              <div class="reassurance-mini-text">
                <h4>Official CEFR Standard</h4>
                <p>Authentic Goethe-Zertifikat and telc exam preparation materials.</p>
              </div>
            </div>
            <div class="reassurance-mini-card">
              <div class="reassurance-mini-icon"><i data-lucide="file-text"></i></div>
              <div class="reassurance-mini-text">
                <h4>Digital Tax Invoice</h4>
                <p>A receipt and confirmation are sent directly to your email.</p>
              </div>
            </div>
          </div>

          <!-- Developer / Manual Simulator Strip (Temporary helper for testing states) -->
          <div class="checkout-dev-simulator" aria-label="Testing state switch">
            <span><strong>Testing Controls:</strong> Preview any payment return state:</span>
            <div class="sim-buttons">
              <button class="sim-btn" type="button" data-sim="success">Simulate Success</button>
              <button class="sim-btn" type="button" data-sim="pending">Simulate Pending</button>
              <button class="sim-btn" type="button" data-sim="failed">Simulate Failure</button>
              <button class="sim-btn" type="button" data-sim="cancelled">Simulate Cancel</button>
            </div>
          </div>
        </main>

        <!-- Right: Sticky Order Summary -->
        <aside class="checkout-sidebar" aria-label="Order summary">
          <div class="order-summary-card">
            <div class="order-summary-header">
              <h3>Order Summary</h3>
              <span class="summary-type-tag">${typeLabel}</span>
            </div>

            <div class="summary-item-block">
              <h4 class="summary-item-title">${item.name}</h4>
              <p class="summary-item-desc">${item.description}</p>

              ${Array.isArray(item.features) && item.features.length > 0
                ? html`
                    <ul class="summary-features-list">
                      ${item.features
                        .slice(0, 5)
                        .map(
                          (feat) => html`
                            <li class="summary-feature-item">
                              <i data-lucide="check-circle-2"></i>
                              <span>${feat}</span>
                            </li>
                          `
                        )
                        .join("")}
                    </ul>
                  `
                : ""}
            </div>

            <!-- Pricing Breakdown -->
            <div class="summary-pricing-table">
              <div class="pricing-row">
                <span>Plan / Item Price</span>
                <span>${pricing.formatted_subtotal}</span>
              </div>
              <div class="pricing-row">
                <span>Tax & Platform Fee</span>
                <span>Included</span>
              </div>
              <div class="pricing-row row-total">
                <span>Total Due</span>
                <div>
                  <span class="price-total-val">${pricing.formatted_total}</span>
                  <span class="pricing-cadence-label">${cadenceLabel}</span>
                </div>
              </div>
            </div>

            <!-- Action Button -->
            <button
              class="checkout-submit-btn"
              id="checkout-submit-button"
              type="button"
              ${methods.length === 0 ? "disabled" : ""}
            >
              <i data-lucide="shield-check"></i>
              <span>Complete Purchase &bull; ${pricing.formatted_total}</span>
            </button>

            <div class="summary-guarantee-note">
              <i data-lucide="lock"></i>
              <span>Encrypted 256-Bit SSL Checkout</span>
            </div>

            <p class="summary-fineprint">
              By placing this order, you agree to Coco Germany's
              <a href="../account/terms.html" target="_blank">Terms of Service</a> and
              <a href="../account/privacy.html" target="_blank">Privacy Policy</a>.
              Subscriptions can be cancelled anytime from your account settings.
            </p>
          </div>
        </aside>
      </div>
    `;

    renderIcons();
    attachReadyStateHandlers();
  }

  /**
   * 3. RENDER UNAVAILABLE STATE SCREEN
   */
  function renderUnavailableState(message, reason) {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    mount.innerHTML = html`
      <div class="state-screen-wrap">
        <div class="state-card">
          <div class="state-icon-large state-icon-unavailable">
            <i data-lucide="shield-alert"></i>
          </div>
          <h2 class="state-title">Checkout Unavailable</h2>
          <p class="state-desc">
            ${message || "The requested plan or learning resource could not be loaded for checkout."}
          </p>

          ${reason ? html`<div class="state-meta-box"><span>Details: <strong>${reason}</strong></span></div>` : ""}

          <div class="state-actions-wrap">
            <a class="btn-primary" href="../index.html#/membership">
              <i data-lucide="crown"></i> Browse Membership Plans
            </a>
            <a class="btn-secondary" href="../index.html#/resources">
              <i data-lucide="book-open"></i> Explore Resources
            </a>
          </div>
        </div>
      </div>
    `;
    renderIcons();
  }

  /**
   * 4. RENDER SUCCESS STATE SCREEN
   */
  function renderSuccessState(orderId, itemContext) {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    // Clear saved cart context after confirmed success
    window.CheckoutService.clearPurchaseContext();

    const orderRef = orderId || `CG-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const itemName = (itemContext && itemContext.item_name) || "Coco Germany Membership";
    const dateFormatted = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

    mount.innerHTML = html`
      <div class="state-screen-wrap">
        <div class="state-card">
          <div class="state-icon-large state-icon-success">
            <i data-lucide="check-circle-2"></i>
          </div>
          <h2 class="state-title">Purchase Successful!</h2>
          <p class="state-desc">
            Thank you for learning with Coco Germany. Your order has been confirmed and your access is active immediately.
          </p>

          <div class="state-meta-box">
            <div class="state-meta-row">
              <span>Order Reference</span>
              <strong>${orderRef}</strong>
            </div>
            <div class="state-meta-row">
              <span>Item / Tier</span>
              <strong>${itemName}</strong>
            </div>
            <div class="state-meta-row">
              <span>Status</span>
              <strong style="color: var(--emerald);">&#10003; Active & Confirmed</strong>
            </div>
            <div class="state-meta-row">
              <span>Date & Time</span>
              <span>${dateFormatted}</span>
            </div>
          </div>

          <div class="state-actions-wrap">
            <a class="btn-primary" href="../practice/index.html">
              <i data-lucide="pen-tool"></i> Open Practice App
            </a>
            <a class="btn-secondary" href="../account/index.html">
              <i data-lucide="user"></i> Go to My Account
            </a>
          </div>
        </div>
      </div>
    `;
    renderIcons();
  }

  /**
   * 5. RENDER PENDING STATE SCREEN
   */
  function renderPendingState(orderId) {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    const orderRef = orderId || `CG-2026-${Math.floor(100000 + Math.random() * 900000)}`;

    mount.innerHTML = html`
      <div class="state-screen-wrap">
        <div class="state-card">
          <div class="state-icon-large state-icon-pending">
            <i data-lucide="hourglass"></i>
          </div>
          <h2 class="state-title">Payment Verification Pending</h2>
          <p class="state-desc">
            Your transaction is currently being processed by your bank or payment provider. Confirmation usually completes within 1&ndash;2 minutes.
          </p>

          <div class="state-meta-box">
            <div class="state-meta-row">
              <span>Order Reference</span>
              <strong>${orderRef}</strong>
            </div>
            <div class="state-meta-row">
              <span>Status</span>
              <strong style="color: var(--amber);">Awaiting Gateway Confirmation</strong>
            </div>
          </div>

          <div class="state-actions-wrap">
            <button class="btn-primary" type="button" id="btn-refresh-status">
              <i data-lucide="refresh-cw"></i> Refresh Status
            </button>
            <a class="btn-secondary" href="../account/orders.html">
              <i data-lucide="file-text"></i> View Order History
            </a>
          </div>
        </div>
      </div>
    `;
    renderIcons();

    const refreshBtn = document.getElementById("btn-refresh-status");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<i data-lucide="loader-2"></i> Checking...`;
        renderIcons();
        const verification = await window.CheckoutService.verifyPaymentSession(orderRef);
        if (verification && verification.status === "confirmed") {
          renderSuccessState(orderRef);
        } else {
          setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = `<i data-lucide="refresh-cw"></i> Refresh Status`;
            renderIcons();
          }, 1000);
        }
      });
    }
  }

  /**
   * 6. RENDER FAILURE STATE SCREEN
   */
  function renderFailureState(orderId, reason) {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    mount.innerHTML = html`
      <div class="state-screen-wrap">
        <div class="state-card">
          <div class="state-icon-large state-icon-failure">
            <i data-lucide="alert-octagon"></i>
          </div>
          <h2 class="state-title">Payment Not Completed</h2>
          <p class="state-desc">
            ${reason || "The transaction was declined by your bank or the payment authorization timed out. No funds were captured."}
          </p>

          <div class="state-actions-wrap">
            <button class="btn-primary" type="button" id="btn-retry-checkout">
              <i data-lucide="rotate-ccw"></i> Try Again / Choose Other Method
            </button>
            <a class="btn-secondary" href="https://wa.me/917907211108?text=Hello%20Coco%20Germany,%20I%20had%20an%20issue%20with%20checkout" target="_blank" rel="noopener">
              <i data-lucide="message-circle"></i> Contact Support
            </a>
          </div>
        </div>
      </div>
    `;
    renderIcons();

    const retryBtn = document.getElementById("btn-retry-checkout");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        // Strip error query params and reload clean checkout flow
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        initCheckout();
      });
    }
  }

  /**
   * 7. RENDER CANCELLED STATE SCREEN
   */
  function renderCancelledState() {
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    mount.innerHTML = html`
      <div class="state-screen-wrap">
        <div class="state-card">
          <div class="state-icon-large state-icon-cancelled">
            <i data-lucide="undo-2"></i>
          </div>
          <h2 class="state-title">Checkout Cancelled</h2>
          <p class="state-desc">
            You cancelled the checkout session before completing authorization. Your account has not been charged.
          </p>

          <div class="state-actions-wrap">
            <button class="btn-primary" type="button" id="btn-resume-checkout">
              <i data-lucide="arrow-right"></i> Resume Checkout
            </button>
            <a class="btn-secondary" href="../index.html#/membership">
              <i data-lucide="arrow-left"></i> Return to Membership Plans
            </a>
          </div>
        </div>
      </div>
    `;
    renderIcons();

    const resumeBtn = document.getElementById("btn-resume-checkout");
    if (resumeBtn) {
      resumeBtn.addEventListener("click", () => {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        initCheckout();
      });
    }
  }

  /**
   * Attach interaction handlers to ready-state checkout UI
   */
  function attachReadyStateHandlers() {
    // 1. Payment method selection
    document.querySelectorAll(".payment-method-tile").forEach((tile) => {
      const selectTile = () => {
        document.querySelectorAll(".payment-method-tile").forEach((t) => {
          t.classList.remove("is-selected");
          t.setAttribute("aria-checked", "false");
        });
        tile.classList.add("is-selected");
        tile.setAttribute("aria-checked", "true");
        selectedMethodId = tile.getAttribute("data-method-id");

        const submitBtn = document.getElementById("checkout-submit-button");
        if (submitBtn) submitBtn.disabled = false;
      };

      tile.addEventListener("click", selectTile);
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTile();
        }
      });
    });

    // 2. Submit Button: Proceed to secure payment
    const submitBtn = document.getElementById("checkout-submit-button");
    if (submitBtn) {
      submitBtn.addEventListener("click", async () => {
        if (!selectedMethodId || !currentSession) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i data-lucide="loader-2"></i> Initializing Gateway Session...`;
        renderIcons();

        // --------------------------------------------------------------------
        // FUTURE WORKER DISPATCH POINT:
        // In this phase, Worker and payment gateways (Razorpay/Stripe/PayPal)
        // are built separately. We simulate immediate transition or success
        // return state without hardcoded provider dependencies.
        // --------------------------------------------------------------------
        setTimeout(() => {
          renderSuccessState(currentSession.order_id, currentSession.item);
        }, 800);
      });
    }

    // 3. Testing simulator buttons
    document.querySelectorAll("[data-sim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-sim");
        const orderId = currentSession ? currentSession.order_id : "CG-2026-TEST";
        if (target === "success") renderSuccessState(orderId, currentSession ? currentSession.item : null);
        else if (target === "pending") renderPendingState(orderId);
        else if (target === "failed") renderFailureState(orderId, "Simulated card authorization decline.");
        else if (target === "cancelled") renderCancelledState();
      });
    });
  }

  /**
   * MAIN INITIALIZATION LOGIC
   */
  async function initCheckout() {
    renderLoadingState();

    // 1. Check for payment gateway return status first (?status=success, etc.)
    const returnState = window.CheckoutService.checkReturnState();
    if (returnState.isReturn) {
      if (returnState.status === "success") {
        renderSuccessState(returnState.order_id);
        return;
      }
      if (returnState.status === "pending") {
        renderPendingState(returnState.order_id);
        return;
      }
      if (returnState.status === "failed") {
        renderFailureState(returnState.order_id, returnState.reason);
        return;
      }
      if (returnState.status === "cancelled") {
        renderCancelledState();
        return;
      }
    }

    // 2. Load Firebase tools to determine active user & profile currency/country
    const tools = await getFirebaseTools();
    if (tools && tools.auth) {
      tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
        currentUser = user;
        if (user && user.uid) {
          userProfile = await fetchUserProfile(user.uid, tools);
        }
        await loadSessionWithContext();
      });
    } else {
      await loadSessionWithContext();
    }
  }

  /**
   * Resolve purchase context and initiate session with CheckoutService
   */
  async function loadSessionWithContext() {
    const rawContext = window.CheckoutService.parsePurchaseContext();

    // Enrich with Firestore userProfile values if missing
    if (userProfile) {
      if (!rawContext.currency && userProfile.currency) rawContext.currency = userProfile.currency;
      if (!rawContext.country && userProfile.country) rawContext.country = userProfile.country;
    }

    const customerInfo = {
      uid: (currentUser && currentUser.uid) || "",
      email: (currentUser && currentUser.email) || "",
      displayName: (currentUser && currentUser.displayName) || "",
    };

    try {
      const session = await window.CheckoutService.initiateCheckoutSession(rawContext, customerInfo);

      if (session.status === "unavailable" || !session.success) {
        renderUnavailableState(session.message, session.error);
      } else {
        renderReadyState(session);
      }
    } catch (err) {
      console.error("Checkout: Error initiating session:", err);
      renderUnavailableState("Failed to connect to checkout service. Please try again shortly.", err.message);
    }
  }

  // Auto-run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCheckout);
  } else {
    initCheckout();
  }
})();
