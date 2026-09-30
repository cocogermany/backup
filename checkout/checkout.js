/**
 * Coco Germany — Standalone Checkout Controller (checkout.js)
 *
 * Implements the decoupled, two-stage checkout flow & state machine:
 * 1. READY_TO_PAY:
 *    - Immediately displays the purchase context & order summary on page load.
 *    - Absolutely NO Worker or payment provider calls on page load.
 *    - Presents primary "Continue to Payment" action.
 * 2. LOADING_PAYMENT_OPTIONS:
 *    - Triggered ONLY when user explicitly clicks "Continue to Payment".
 *    - Sends purchase context to the authoritative Worker.
 * 3. PAYMENT_METHOD_SELECTION:
 *    - Renders dynamic payment methods returned by the authoritative Worker.
 *    - Provider-agnostic (no hardcoded Razorpay, PayPal, QR, etc. in UI).
 * 4. PAYMENT_PROCESSING:
 *    - Dispatches payment authorization with selected method.
 * 5. PENDING / SUCCESSFUL / FAILED / CANCELLED / UNAVAILABLE:
 *    - Dedicated return and completion state screens.
 */

(function () {
  "use strict";

  const CHECKOUT_STATES = {
    READY_TO_PAY: "ready_to_pay",
    LOADING_PAYMENT_OPTIONS: "loading_payment_options",
    PAYMENT_METHOD_SELECTION: "payment_method_selection",
    PAYMENT_PROCESSING: "payment_processing",
    PENDING: "pending",
    SUCCESSFUL: "successful",
    FAILED: "failed",
    CANCELLED: "cancelled",
    UNAVAILABLE: "unavailable",
  };

  const firebaseConfig = {
    apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
    authDomain: "cocogermany-ba33f.firebaseapp.com",
    projectId: "cocogermany-ba33f",
    storageBucket: "cocogermany-ba33f.firebasestorage.app",
    messagingSenderId: "689122181603",
    appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
  };

  // State variables
  let currentState = CHECKOUT_STATES.READY_TO_PAY;
  let activePurchaseContext = null;
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
   * Resolve user profile details for account strip
   */
  function getUserAccountInfo() {
    const email = (currentUser && currentUser.email) || "Guest Learner";
    const isVerified = Boolean(currentUser && currentUser.uid);
    const country =
      activePurchaseContext?.country ||
      userProfile?.country ||
      localStorage.getItem("coco_user_country") ||
      "Global";
    const currency =
      activePurchaseContext?.currency ||
      userProfile?.currency ||
      localStorage.getItem("coco_user_currency") ||
      "INR";

    return { email, isVerified, country, currency };
  }

  /**
   * Resolve type display label
   */
  function getTypeLabel(type) {
    const typeLabels = {
      membership: "Membership Tier",
      product: "Digital Material",
      course: "Exam Preparation Course",
      service: "Learning Service",
    };
    return typeLabels[type] || "Learning Purchase";
  }

  /**
   * 1. RENDER REVIEW STATE (READY_TO_PAY)
   *
   * Displays the incoming purchase context and order summary immediately.
   * DOES NOT call the payment Worker or fetch payment methods.
   * Presents a clear "Continue to Payment" button.
   */
  function renderReadyToPayState(context) {
    currentState = CHECKOUT_STATES.READY_TO_PAY;
    activePurchaseContext = context;
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    const account = getUserAccountInfo();
    const typeLabel = getTypeLabel(context.purchase_type);
    const itemName = context.item_name || `${context.item_id} Plan`;
    const cadenceLabel = context.period || (context.purchase_type === "membership" ? "/month" : "");

    // Resolve displayed price
    let rawPrice = context.displayed_price;
    if (rawPrice === null || rawPrice === undefined) {
      rawPrice = window.CheckoutService.getDefaultPrice(context.item_id, account.currency);
    }
    const formattedPrice = window.CheckoutService.formatCurrency(rawPrice, account.currency);

    // Get item description and features for order summary
    const itemDesc = window.CheckoutService.getItemDescription(context.item_id, context.purchase_type);
    const itemFeatures = window.CheckoutService.getItemFeatures(context.item_id);

    mount.innerHTML = html`
      <!-- Breadcrumb Navigation -->
      <nav class="breadcrumb-nav" aria-label="Breadcrumb">
        <a href="../index.html"><i data-lucide="home"></i> Home</a>
        <i data-lucide="chevron-right"></i>
        <a href="../index.html#/membership">Membership & Plans</a>
        <i data-lucide="chevron-right"></i>
        <span class="active-crumb">${itemName}</span>
      </nav>

      <div class="checkout-grid">
        <!-- Main Column: Account Details & Step 2 Prompt -->
        <main class="checkout-main">
          <!-- Step 1: Customer Account & Regional Context -->
          <section class="checkout-card" id="step-customer-card" aria-labelledby="step-customer-heading">
            <div class="checkout-card-header">
              <span class="checkout-step-label"><i data-lucide="user-check"></i> Step 1 of 2</span>
              <h2 class="checkout-card-title" id="step-customer-heading">Learner Account &amp; Billing Region</h2>
              <p class="checkout-card-subtitle">Your purchases and practice quotas will be attached to this profile.</p>
            </div>

            <div class="customer-profile-strip" id="customer-profile-strip">
              <div class="customer-info-wrap">
                <div class="customer-avatar" aria-hidden="true">${account.email.charAt(0).toUpperCase()}</div>
                <div class="customer-details">
                  <span class="customer-email">${account.email}</span>
                  <span class="customer-status-note">
                    <i data-lucide="${account.isVerified ? "shield-check" : "user"}"></i>
                    ${account.isVerified ? "Verified Coco Germany Account" : "Guest Learner Checkout"}
                  </span>
                </div>
              </div>

              <div class="customer-context-chips">
                <span class="context-chip" title="Billing Country Context" id="chip-country">
                  <i data-lucide="map-pin"></i> Region: ${account.country}
                </span>
                <span class="context-chip" title="Transaction Currency" id="chip-currency">
                  <i data-lucide="banknote"></i> Currency: ${account.currency}
                </span>
              </div>
            </div>
          </section>

          <!-- Step 2: Payment Container (Pre-Payment / Continue to Payment) -->
          <section class="checkout-card" id="step-payment-card" aria-labelledby="step-payment-heading">
            <div class="checkout-card-header">
              <span class="checkout-step-label"><i data-lucide="credit-card"></i> Step 2 of 2</span>
              <h2 class="checkout-card-title" id="step-payment-heading">Payment Options</h2>
              <p class="checkout-card-subtitle">
                Confirm your order summary and continue to securely retrieve payment methods for your region.
              </p>
            </div>

            <!-- Dynamic Payment Area: Pre-Payment Prompt -->
            <div id="payment-options-mount">
              <div class="pre-payment-prompt">
                <div class="prompt-content">
                  <div class="prompt-icon" aria-hidden="true">
                    <i data-lucide="shield-check"></i>
                  </div>
                  <div class="prompt-text">
                    <h4>Ready to configure payment</h4>
                    <p>
                      Click <strong>Continue to Payment</strong> to verify plan availability and securely retrieve available payment options (cards, UPI, net banking, or international wire) for your currency (<strong>${account.currency}</strong>).
                    </p>
                  </div>
                </div>

                <div class="pre-payment-actions">
                  <button class="continue-to-payment-btn" id="btn-continue-main" type="button">
                    <span>Continue to Payment</span>
                    <i data-lucide="arrow-right"></i>
                  </button>
                </div>
              </div>

              <div class="method-guidance-box" style="margin-top: 16px;">
                <i data-lucide="lock"></i>
                <span>
                  No payment methods or worker calls are executed until you continue. All transactions are protected by 256-bit SSL encryption.
                </span>
              </div>
            </div>
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
                <p>An official receipt and confirmation are sent directly to your email.</p>
              </div>
            </div>
          </div>

          <!-- Developer / Manual State Simulator Strip -->
          <div class="checkout-dev-simulator" aria-label="Testing state switch">
            <span><strong>Testing Controls:</strong> Preview any checkout state:</span>
            <div class="sim-buttons">
              <button class="sim-btn" type="button" data-sim="ready">Reset (Ready to Pay)</button>
              <button class="sim-btn" type="button" data-sim="loading">Loading Options</button>
              <button class="sim-btn" type="button" data-sim="methods">Payment Methods</button>
              <button class="sim-btn" type="button" data-sim="processing">Processing</button>
              <button class="sim-btn" type="button" data-sim="success">Success</button>
              <button class="sim-btn" type="button" data-sim="pending">Pending</button>
              <button class="sim-btn" type="button" data-sim="failed">Failure</button>
              <button class="sim-btn" type="button" data-sim="cancelled">Cancel</button>
            </div>
          </div>
        </main>

        <!-- Right Column: Sticky Order Summary -->
        <aside class="checkout-sidebar" aria-label="Order summary">
          <div class="order-summary-card">
            <div class="order-summary-header">
              <h3>Order Summary</h3>
              <span class="summary-type-tag">${typeLabel}</span>
            </div>

            <div class="summary-item-block">
              <h4 class="summary-item-title">${itemName}</h4>
              <p class="summary-item-desc">${itemDesc}</p>

              ${Array.isArray(itemFeatures) && itemFeatures.length > 0
                ? html`
                    <ul class="summary-features-list">
                      ${itemFeatures
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
                <span id="summary-subtotal-val">${formattedPrice}</span>
              </div>
              <div class="pricing-row">
                <span>Tax &amp; Platform Fee</span>
                <span>Included</span>
              </div>
              <div class="pricing-row row-total">
                <span>Total Due</span>
                <div>
                  <span class="price-total-val" id="summary-total-val">${formattedPrice}</span>
                  <span class="pricing-cadence-label">${cadenceLabel}</span>
                </div>
              </div>
            </div>

            <!-- Action Button: Initial Stage -> Continue to Payment -->
            <button
              class="checkout-submit-btn"
              id="btn-summary-action"
              type="button"
            >
              <i data-lucide="lock"></i>
              <span>Continue to Payment &bull; ${formattedPrice}</span>
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
    attachReadyToPayHandlers();
  }

  /**
   * Attach interaction handlers for the Ready-to-Pay state
   */
  function attachReadyToPayHandlers() {
    // 1. Primary "Continue to Payment" action (from Step 2 card)
    const btnMain = document.getElementById("btn-continue-main");
    if (btnMain) {
      btnMain.addEventListener("click", () => {
        handleContinueToPayment();
      });
    }

    // 2. Summary "Continue to Payment" action (from sidebar)
    const btnSummary = document.getElementById("btn-summary-action");
    if (btnSummary) {
      btnSummary.addEventListener("click", () => {
        if (currentState === CHECKOUT_STATES.READY_TO_PAY) {
          handleContinueToPayment();
        } else if (currentState === CHECKOUT_STATES.PAYMENT_METHOD_SELECTION) {
          handleProcessPayment();
        }
      });
    }

    // 3. Testing simulator controls
    attachSimulatorHandlers();
  }

  /**
   * 2. STATE TRANSITION: CONTINUE TO PAYMENT
   *
   * Only called when user explicitly clicks "Continue to Payment".
   * 1. Displays loading state in payment options area.
   * 2. Calls Worker (authoritative).
   * 3. Renders dynamic payment methods on success.
   */
  async function handleContinueToPayment() {
    if (currentState === CHECKOUT_STATES.LOADING_PAYMENT_OPTIONS) return;
    currentState = CHECKOUT_STATES.LOADING_PAYMENT_OPTIONS;

    const paymentMount = document.getElementById("payment-options-mount");
    const summaryBtn = document.getElementById("btn-summary-action");
    const mainBtn = document.getElementById("btn-continue-main");

    // Show loading spinners on buttons
    if (mainBtn) {
      mainBtn.disabled = true;
      mainBtn.innerHTML = html`
        <i data-lucide="loader-2" class="spin"></i>
        <span>Connecting to Payment Gateway...</span>
      `;
    }
    if (summaryBtn) {
      summaryBtn.disabled = true;
      summaryBtn.innerHTML = html`
        <i data-lucide="loader-2" class="spin"></i>
        <span>Verifying Payment Options...</span>
      `;
    }

    // Show clean loading card in Step 2 area
    if (paymentMount) {
      paymentMount.innerHTML = html`
        <div class="payment-loading-card">
          <div class="payment-loading-spinner" aria-hidden="true">
            <i data-lucide="loader-2" class="spin"></i>
          </div>
          <h4>Verifying Available Payment Options...</h4>
          <p>
            Contacting the payment engine to validate item eligibility, regional tax rates, and available payment methods for
            <strong>${activePurchaseContext.currency || "INR"}</strong>.
          </p>
        </div>
      `;
    }
    renderIcons();

    // Send purchase context and learner information to authoritative Worker
    const customerInfo = {
      uid: (currentUser && currentUser.uid) || "",
      email: (currentUser && currentUser.email) || "",
      displayName: (currentUser && currentUser.displayName) || "",
    };

    try {
      const session = await window.CheckoutService.initiateCheckoutSession(activePurchaseContext, customerInfo);

      if (!session || !session.success || session.status === "unavailable") {
        renderUnavailableState(
          session?.message || "Payment options are currently unavailable for this item.",
          session?.error || "Worker validation declined the purchase request."
        );
        return;
      }

      // Transition to Payment Method Selection with authoritative Worker session
      renderPaymentMethodSelection(session);
    } catch (err) {
      console.error("Checkout: Error initiating payment session:", err);
      renderUnavailableState(
        "Could not connect to the payment service. Please try again shortly.",
        err?.message || "Network error"
      );
    }
  }

  /**
   * 3. RENDER PAYMENT METHOD SELECTION STATE
   *
   * Renders whatever payment methods the Worker returns.
   * Completely provider-agnostic.
   */
  function renderPaymentMethodSelection(session) {
    currentState = CHECKOUT_STATES.PAYMENT_METHOD_SELECTION;
    currentSession = session;
    const methods = session.available_payment_methods || [];
    const paymentMount = document.getElementById("payment-options-mount");
    const summaryBtn = document.getElementById("btn-summary-action");

    // Pre-select first or popular method
    if (!selectedMethodId && methods.length > 0) {
      const popular = methods.find((m) => m.popular);
      selectedMethodId = popular ? popular.id : methods[0].id;
    }

    // Update Step 2 header
    const stepHeading = document.getElementById("step-payment-heading");
    if (stepHeading) {
      stepHeading.textContent = "Select Payment Method";
    }

    // Update Order Summary with authoritative Worker values
    if (session.pricing) {
      const subtotalEl = document.getElementById("summary-subtotal-val");
      const totalEl = document.getElementById("summary-total-val");
      if (subtotalEl) subtotalEl.textContent = session.pricing.formatted_subtotal;
      if (totalEl) totalEl.textContent = session.pricing.formatted_total;
    }

    // Render dynamic payment methods
    if (paymentMount) {
      if (methods.length === 0) {
        paymentMount.innerHTML = html`
          <div class="method-guidance-box" style="border-color: var(--rose);">
            <i data-lucide="alert-circle" style="color: var(--rose);"></i>
            <span>No payment methods are currently configured for this currency. Please contact Coco Germany support.</span>
          </div>
        `;
      } else {
        paymentMount.innerHTML = html`
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
              Transactions are securely processed with 256-bit SSL encryption. Authorization executes via the official provider gateway.
            </span>
          </div>
        `;
      }
    }

    // Update Summary CTA button to final payment action
    if (summaryBtn) {
      summaryBtn.disabled = methods.length === 0;
      summaryBtn.innerHTML = html`
        <i data-lucide="shield-check"></i>
        <span>Complete Purchase &bull; ${session.pricing.formatted_total}</span>
      `;
    }

    renderIcons();
    attachMethodSelectionHandlers();
  }

  /**
   * Attach interaction handlers for payment method selection
   */
  function attachMethodSelectionHandlers() {
    document.querySelectorAll(".payment-method-tile").forEach((tile) => {
      const selectTile = () => {
        document.querySelectorAll(".payment-method-tile").forEach((t) => {
          t.classList.remove("is-selected");
          t.setAttribute("aria-checked", "false");
        });
        tile.classList.add("is-selected");
        tile.setAttribute("aria-checked", "true");
        selectedMethodId = tile.getAttribute("data-method-id");

        const summaryBtn = document.getElementById("btn-summary-action");
        if (summaryBtn) summaryBtn.disabled = false;
      };

      tile.addEventListener("click", selectTile);
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectTile();
        }
      });
    });
  }

  /**
   * 4. STATE TRANSITION: PROCESS PAYMENT
   *
   * User clicks "Complete Purchase".
   * Shows processing state and communicates with Worker / payment gateway.
   */
  async function handleProcessPayment() {
    if (!selectedMethodId || !currentSession) return;
    currentState = CHECKOUT_STATES.PAYMENT_PROCESSING;

    const summaryBtn = document.getElementById("btn-summary-action");
    const paymentMount = document.getElementById("payment-options-mount");

    if (summaryBtn) {
      summaryBtn.disabled = true;
      summaryBtn.innerHTML = html`
        <i data-lucide="loader-2" class="spin"></i>
        <span>Authorizing Payment...</span>
      `;
    }

    if (paymentMount) {
      const methodName =
        currentSession.available_payment_methods?.find((m) => m.id === selectedMethodId)?.name || "selected method";
      paymentMount.innerHTML = html`
        <div class="payment-processing-card">
          <div class="payment-processing-spinner" aria-hidden="true">
            <i data-lucide="loader-2" class="spin"></i>
          </div>
          <h4>Authorizing Payment with ${methodName}...</h4>
          <p>
            Securely transmitting transaction tokens to the payment provider. Please do not close, refresh, or navigate away from this window.
          </p>
        </div>
      `;
    }
    renderIcons();

    try {
      const paymentResult = await window.CheckoutService.processPayment(currentSession, selectedMethodId);

      if (paymentResult.status === "confirmed") {
        renderSuccessState(paymentResult.order_id, currentSession.item);
      } else if (paymentResult.status === "pending") {
        renderPendingState(paymentResult.order_id);
      } else {
        renderFailureState(
          paymentResult.order_id,
          paymentResult.message || "Payment authorization was declined by your bank or payment provider."
        );
      }
    } catch (err) {
      console.error("Checkout: Payment processing error:", err);
      renderFailureState(
        currentSession?.order_id,
        err?.message || "An unexpected error occurred during payment processing."
      );
    }
  }

  /**
   * 5. RENDER UNAVAILABLE STATE SCREEN
   */
  function renderUnavailableState(message, reason) {
    currentState = CHECKOUT_STATES.UNAVAILABLE;
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
   * 6. RENDER SUCCESS STATE SCREEN
   */
  function renderSuccessState(orderId, itemContext) {
    currentState = CHECKOUT_STATES.SUCCESSFUL;
    const mount = document.getElementById("checkout-mount");
    if (!mount) return;

    // Clear saved cart context after confirmed success
    window.CheckoutService.clearPurchaseContext();

    const orderRef = orderId || `CG-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const itemName =
      (itemContext && itemContext.name) ||
      (itemContext && itemContext.item_name) ||
      (activePurchaseContext && activePurchaseContext.item_name) ||
      "Coco Germany Membership";
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
              <strong style="color: var(--emerald);">&#10003; Active &amp; Confirmed</strong>
            </div>
            <div class="state-meta-row">
              <span>Date &amp; Time</span>
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
   * 7. RENDER PENDING STATE SCREEN
   */
  function renderPendingState(orderId) {
    currentState = CHECKOUT_STATES.PENDING;
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
        refreshBtn.innerHTML = html`<i data-lucide="loader-2" class="spin"></i> Checking...`;
        renderIcons();
        const verification = await window.CheckoutService.verifyPaymentSession(orderRef);
        if (verification && verification.status === "confirmed") {
          renderSuccessState(orderRef, currentSession ? currentSession.item : null);
        } else {
          setTimeout(() => {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = html`<i data-lucide="refresh-cw"></i> Refresh Status`;
            renderIcons();
          }, 1000);
        }
      });
    }
  }

  /**
   * 8. RENDER FAILURE STATE SCREEN
   */
  function renderFailureState(orderId, reason) {
    currentState = CHECKOUT_STATES.FAILED;
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
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        initCheckout();
      });
    }
  }

  /**
   * 9. RENDER CANCELLED STATE SCREEN
   */
  function renderCancelledState() {
    currentState = CHECKOUT_STATES.CANCELLED;
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
   * Testing simulator buttons handler (for interactive validation)
   */
  function attachSimulatorHandlers() {
    document.querySelectorAll("[data-sim]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-sim");
        const orderId = currentSession ? currentSession.order_id : "CG-2026-TEST";

        if (target === "ready") {
          renderReadyToPayState(activePurchaseContext);
        } else if (target === "loading") {
          handleContinueToPayment();
        } else if (target === "methods") {
          // Immediately simulate resolved methods
          const dummySession = {
            success: true,
            status: "ready",
            order_id: orderId,
            session_id: "cs_test_sim",
            pricing: {
              formatted_subtotal: window.CheckoutService.formatCurrency(activePurchaseContext?.displayed_price || 199, activePurchaseContext?.currency || "INR"),
              formatted_total: window.CheckoutService.formatCurrency(activePurchaseContext?.displayed_price || 199, activePurchaseContext?.currency || "INR"),
            },
            available_payment_methods: [
              { id: "upi", name: "UPI / QR Code", description: "Google Pay, PhonePe, Paytm & BHIM", icon: "smartphone", badge: "Instant", popular: true },
              { id: "cards", name: "Credit or Debit Card", description: "Visa, Mastercard, RuPay & Maestro", icon: "credit-card", badge: "Secure" },
              { id: "netbanking", name: "Net Banking", description: "All major Indian & international banks", icon: "landmark" },
            ],
          };
          renderPaymentMethodSelection(dummySession);
        } else if (target === "processing") {
          selectedMethodId = selectedMethodId || "cards";
          currentSession = currentSession || {
            order_id: orderId,
            available_payment_methods: [{ id: "cards", name: "Credit or Debit Card" }],
          };
          handleProcessPayment();
        } else if (target === "success") {
          renderSuccessState(orderId, currentSession ? currentSession.item : null);
        } else if (target === "pending") {
          renderPendingState(orderId);
        } else if (target === "failed") {
          renderFailureState(orderId, "Simulated card authorization decline.");
        } else if (target === "cancelled") {
          renderCancelledState();
        }
      });
    });
  }

  /**
   * MAIN INITIALIZATION LOGIC
   *
   * Immediate order summary rendering:
   * - Checks for return parameters first.
   * - Parses incoming purchase context.
   * - Immediately displays READY_TO_PAY state.
   * - Asynchronously enriches user profile when auth resolves.
   * - DOES NOT CALL THE PAYMENT WORKER.
   */
  async function initCheckout() {
    // 1. Check for payment gateway return status (?status=success, pending, failed, cancelled)
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

    // 2. Parse purchase context dynamically from URL / hash / sessionStorage
    const purchaseContext = window.CheckoutService.parsePurchaseContext();

    // 3. Validation: Verify that an item or plan was provided
    if (!purchaseContext || !purchaseContext.item_id) {
      renderUnavailableState(
        "No item or membership plan was specified for checkout.",
        "Please select a membership plan or study resource from the site to proceed."
      );
      return;
    }

    // Free plan bypass validation
    if (purchaseContext.item_id.toUpperCase() === "FREE") {
      renderUnavailableState(
        "The Free Learner tier does not require checkout.",
        "The Free tier is automatically active for all registered Coco Germany accounts."
      );
      return;
    }

    // 4. Render READY_TO_PAY immediately!
    // No worker calls. Order summary is visible at once.
    renderReadyToPayState(purchaseContext);

    // 5. Asynchronously detect Firebase user session to enrich profile context
    getFirebaseTools()
      .then((tools) => {
        if (!tools || !tools.auth) return;
        tools.authModule.onAuthStateChanged(tools.auth, async (user) => {
          currentUser = user;
          if (user && user.uid) {
            userProfile = await fetchUserProfile(user.uid, tools);
          }

          // Dynamically enrich profile strip if still in Ready-to-Pay state
          if (currentState === CHECKOUT_STATES.READY_TO_PAY) {
            const acc = getUserAccountInfo();
            const emailEl = document.querySelector(".customer-email");
            const avatarEl = document.querySelector(".customer-avatar");
            const noteEl = document.querySelector(".customer-status-note");
            const countryEl = document.getElementById("chip-country");
            const currencyEl = document.getElementById("chip-currency");

            if (emailEl) emailEl.textContent = acc.email;
            if (avatarEl) avatarEl.textContent = acc.email.charAt(0).toUpperCase();
            if (noteEl) {
              noteEl.innerHTML = html`
                <i data-lucide="${acc.isVerified ? "shield-check" : "user"}"></i>
                ${acc.isVerified ? "Verified Coco Germany Account" : "Guest Learner Checkout"}
              `;
            }
            if (countryEl) {
              countryEl.innerHTML = html`<i data-lucide="map-pin"></i> Region: ${acc.country}`;
            }
            if (currencyEl) {
              currencyEl.innerHTML = html`<i data-lucide="banknote"></i> Currency: ${acc.currency}`;
            }
            renderIcons();
          }
        });
      })
      .catch((err) => {
        console.warn("Checkout: Non-critical Firebase init notice:", err);
      });
  }

  // Auto-run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCheckout);
  } else {
    initCheckout();
  }
})();
