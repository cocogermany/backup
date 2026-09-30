/**
 * Coco Germany — Standalone Checkout Service Layer (checkout-service.js)
 *
 * Enforces clean separation between Frontend UI and Backend Payment Engine:
 * - Parses and normalizes incoming purchase context (URL params, hash, sessionStorage).
 * - Detects payment return states (completion, pending, cancellation, failure).
 * - Abstracted Worker / Payment Provider client interface.
 * - IMPORTANT: The frontend NEVER makes critical payment decisions.
 *   The future Cloudflare Worker is the single source of truth for:
 *   product validation, actual prices, currencies, country eligibility,
 *   available payment methods, and payment order verification.
 */

(function (window) {
  "use strict";

  // Production Worker Endpoint Configuration (isolated for future connection)
  const WORKER_URL = "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";
  const STORAGE_KEY = "coco_checkout_context";
  const RETURN_STORAGE_KEY = "coco_last_checkout_order";

  /**
   * Currency symbol helper
   */
  function getCurrencySymbol(currency) {
    const symbols = {
      INR: "₹",
      EUR: "€",
      USD: "$",
      GBP: "£",
      CHF: "CHF ",
      AED: "AED ",
      BGN: "BGN ",
      CNY: "¥",
      CZK: "Kč ",
      DKK: "kr ",
      HKD: "HK$ ",
      HUF: "Ft ",
      ILS: "₪",
      JPY: "¥",
      MXN: "MX$ ",
      MYR: "RM ",
      NOK: "kr ",
      NZD: "NZ$ ",
      PHP: "₱",
      PLN: "zł ",
      RON: "lei ",
      RUB: "₽",
      SEK: "kr ",
      SGD: "S$ ",
      THB: "฿",
      TRY: "₺",
      TWD: "NT$ ",
      UGX: "USh ",
      ZAR: "R ",
    };
    return symbols[currency] || `${currency} `;
  }

  /**
   * Format currency price cleanly using Intl.NumberFormat
   */
  function formatCurrency(amount, currency) {
    const num = Number(amount);
    if (!Number.isFinite(num)) return `${currency} ${amount}`;
    try {
      const noFraction = ["INR", "JPY", "HUF", "TWD", "KRW", "UGX"].includes(currency);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        maximumFractionDigits: noFraction ? 0 : 2,
      }).format(num);
    } catch {
      const sym = getCurrencySymbol(currency);
      return `${sym}${num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    }
  }

  /**
   * Parse purchase context dynamically from URL query params, hash params, or sessionStorage
   */
  function parsePurchaseContext() {
    let context = {};

    // 1. Read from sessionStorage first as baseline
    try {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed === "object" && parsed !== null) {
          context = { ...parsed };
        }
      }
    } catch (e) {
      console.warn("CheckoutService: Could not read sessionStorage context:", e);
    }

    // 2. Read URL search params (window.location.search takes precedence)
    const urlParams = new URLSearchParams(window.location.search);

    // 3. Fallback to hash search params (e.g. #/checkout?type=... or #?type=...)
    let hashParams = new URLSearchParams();
    if (window.location.hash) {
      const qIndex = window.location.hash.indexOf("?");
      if (qIndex !== -1) {
        hashParams = new URLSearchParams(window.location.hash.slice(qIndex + 1));
      }
    }

    const getParam = (key) => urlParams.get(key) || hashParams.get(key);

    const type = getParam("type") || getParam("purchase_type") || context.purchase_type || "membership";
    const id = getParam("id") || getParam("item_id") || getParam("plan") || context.item_id || "";
    const name = getParam("name") || getParam("item_name") || context.item_name || "";
    const quantity = parseInt(getParam("qty") || getParam("quantity") || context.quantity || "1", 10);
    const currency = (getParam("currency") || context.currency || localStorage.getItem("coco_user_currency") || "INR").toUpperCase().trim();
    const country = (getParam("country") || context.country || localStorage.getItem("coco_user_country") || "").trim();
    const price = getParam("price") || getParam("displayed_price") || context.displayed_price || "";
    const period = getParam("period") || context.period || (type === "membership" ? "/month" : "one-time");

    let metadata = context.metadata || {};
    const rawMeta = getParam("metadata");
    if (rawMeta) {
      try {
        metadata = { ...metadata, ...JSON.parse(decodeURIComponent(rawMeta)) };
      } catch {
        metadata.raw = rawMeta;
      }
    }

    // Construct unified purchase context
    const mergedContext = {
      purchase_type: type.toLowerCase().trim(),
      item_id: id.trim(),
      item_name: name.trim(),
      quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
      country: country,
      currency: currency || "INR",
      displayed_price: price !== "" ? Number(price) : null,
      period: period,
      metadata: metadata,
    };

    // Cache merged result for resilience during page reloads or return flows
    if (mergedContext.item_id) {
      savePurchaseContext(mergedContext);
    }

    return mergedContext;
  }

  /**
   * Save current purchase context to sessionStorage
   */
  function savePurchaseContext(context) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context));
    } catch (e) {
      console.warn("CheckoutService: Could not save purchase context to sessionStorage:", e);
    }
  }

  /**
   * Clear purchase context from sessionStorage (e.g. after successful order)
   */
  function clearPurchaseContext() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  /**
   * Check if current page load is a return from a payment gateway or completed session
   * Supported query indicators:
   * ?status=success|pending|failed|cancelled
   * ?order_id=... or ?session_id=...
   */
  function checkReturnState() {
    const urlParams = new URLSearchParams(window.location.search);
    let hashParams = new URLSearchParams();
    if (window.location.hash) {
      const qIndex = window.location.hash.indexOf("?");
      if (qIndex !== -1) {
        hashParams = new URLSearchParams(window.location.hash.slice(qIndex + 1));
      }
    }

    const getParam = (k) => urlParams.get(k) || hashParams.get(k);

    const statusParam = (getParam("status") || getParam("payment_status") || "").toLowerCase().trim();
    const orderId = getParam("order_id") || getParam("orderId") || getParam("id") || "";
    const sessionId = getParam("session_id") || getParam("sessionId") || "";
    const reason = getParam("reason") || getParam("error") || getParam("msg") || "";

    if (["success", "pending", "failed", "cancelled", "cancel"].includes(statusParam) || (orderId && statusParam)) {
      const normalizedStatus = statusParam === "cancel" ? "cancelled" : statusParam;
      return {
        isReturn: true,
        status: normalizedStatus,
        order_id: orderId,
        session_id: sessionId,
        reason: reason,
      };
    }

    return { isReturn: false };
  }

  /**
   * Abstracted Worker / API Client: Initiate Checkout Session
   *
   * The future Worker endpoint will validate:
   * 1. Product/plan existence & active status in DB
   * 2. Authoritative price in user currency
   * 3. Country eligibility & taxation rules
   * 4. Available payment methods (Razorpay, Stripe, PayPal, UPI, etc.)
   * 5. User eligibility (no duplicate active subscription)
   *
   * The frontend treats Worker responses as strictly authoritative.
   */
  async function initiateCheckoutSession(purchaseContext, customerInfo) {
    // ------------------------------------------------------------------------
    // FUTURE WORKER INTEGRATION POINT:
    // When the Cloudflare Worker checkout route is deployed, uncomment:
    //
    // const res = await fetch(`${WORKER_URL}/api/checkout/initiate`, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     purchase_context: purchaseContext,
    //     customer: customerInfo,
    //   }),
    // });
    // if (!res.ok) throw new Error("Worker checkout session initiation failed");
    // return await res.json();
    // ------------------------------------------------------------------------

    // For now: Clean, robust client-side validation & dynamic response architecture
    // This allows full UI development, styling, and state verification without provider ties.
    return new Promise((resolve) => {
      setTimeout(() => {
        // Validation: Must have a valid item ID
        if (!purchaseContext || !purchaseContext.item_id) {
          resolve({
            success: false,
            status: "unavailable",
            error: "No item or membership plan was specified for checkout.",
            message: "Please select a plan or learning material from the site to continue.",
          });
          return;
        }

        const curr = purchaseContext.currency || "INR";
        const isIndia = (purchaseContext.country || "").toUpperCase() === "IN" || curr === "INR";
        const rawAmount = purchaseContext.displayed_price !== null && purchaseContext.displayed_price !== undefined
          ? Number(purchaseContext.displayed_price)
          : getDefaultPrice(purchaseContext.item_id, curr);

        // If price could not be resolved or plan is contact-only
        if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
          if (rawAmount === 0 && purchaseContext.item_id.toUpperCase() === "FREE") {
            resolve({
              success: false,
              status: "unavailable",
              error: "Free Plan does not require checkout.",
              message: "The Free Learner tier is included automatically with every Coco Germany account.",
            });
            return;
          }
          resolve({
            success: false,
            status: "unavailable",
            error: "Price unavailable in selected currency.",
            message: `Pricing for '${purchaseContext.item_name || purchaseContext.item_id}' in ${curr} is not configured yet. Please contact support.`,
          });
          return;
        }

        const generatedOrderId = `CG-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        const sessionId = `cs_live_${Math.random().toString(36).substring(2, 15)}`;

        // Dynamic Payment Methods generated based on regional & currency authority
        const availableMethods = isIndia
          ? [
              {
                id: "upi",
                name: "UPI / QR Code",
                description: "Google Pay, PhonePe, Paytm, BHIM & any UPI App",
                icon: "smartphone",
                badge: "Instant & Zero Fee",
                popular: true,
              },
              {
                id: "cards",
                name: "Credit or Debit Card",
                description: "Visa, Mastercard, RuPay & Maestro",
                icon: "credit-card",
                badge: "Secure 256-Bit",
              },
              {
                id: "netbanking",
                name: "Net Banking",
                description: "All major Indian banks (SBI, HDFC, ICICI, Axis & more)",
                icon: "landmark",
              },
            ]
          : [
              {
                id: "international_card",
                name: "Credit / Debit Card",
                description: "Visa, Mastercard, American Express, UnionPay",
                icon: "credit-card",
                badge: "Instant Activation",
                popular: true,
              },
              {
                id: "paypal",
                name: "PayPal",
                description: "Pay securely via your PayPal account or linked cards",
                icon: "globe",
                badge: "Global",
              },
              {
                id: "bank_transfer",
                name: "EU SEPA / International Wire",
                description: "Direct bank transfer with official VAT invoice",
                icon: "landmark",
              },
            ];

        // Authoritative Session Object returned to the UI
        resolve({
          success: true,
          status: "ready",
          session_id: sessionId,
          order_id: generatedOrderId,
          customer: {
            email: customerInfo?.email || "",
            country: purchaseContext.country || (isIndia ? "IN" : "Global"),
            currency: curr,
          },
          item: {
            type: purchaseContext.purchase_type || "membership",
            id: purchaseContext.item_id,
            name: purchaseContext.item_name || `${purchaseContext.item_id} Plan`,
            quantity: purchaseContext.quantity || 1,
            unit_price: rawAmount,
            formatted_price: formatCurrency(rawAmount, curr),
            period: purchaseContext.period || "/month",
            description: getItemDescription(purchaseContext.item_id, purchaseContext.purchase_type),
            features: getItemFeatures(purchaseContext.item_id),
          },
          pricing: {
            currency: curr,
            subtotal: rawAmount,
            formatted_subtotal: formatCurrency(rawAmount, curr),
            tax: 0,
            formatted_tax: formatCurrency(0, curr),
            total: rawAmount,
            formatted_total: formatCurrency(rawAmount, curr),
          },
          available_payment_methods: availableMethods,
          metadata: purchaseContext.metadata || {},
        });
      }, 350); // Simulates fast authoritative API handshake
    });
  }

  /**
   * Helper fallback pricing for known items when not provided in context
   */
  function getDefaultPrice(itemId, currency) {
    const code = (itemId || "").toUpperCase().trim();
    const defaults = {
      BASIC: { INR: 99, EUR: 2.8, USD: 3.15, GBP: 2.4 },
      PRO: { INR: 199, EUR: 3.75, USD: 4.2, GBP: 3.2 },
      PERSONAL: { INR: 999, EUR: 11.25, USD: 12.5, GBP: 9.6 },
    };
    if (defaults[code] && defaults[code][currency] !== undefined) {
      return defaults[code][currency];
    }
    return 199;
  }

  /**
   * Helper description generator for common items
   */
  function getItemDescription(itemId, type) {
    const code = (itemId || "").toUpperCase().trim();
    if (type === "membership") {
      if (code === "PRO") return "Full Goethe & telc examination preparation with 10 daily credits and 4 weekly mock tests.";
      if (code === "BASIC") return "Expanded practice credits with 2 weekly mock exams and detailed writing feedback.";
      if (code === "PERSONAL") return "Deep personalized writing analysis, custom remedial study plan, and 20 weekly exams.";
      return "Structured German examination preparation resource with verified editorial sets.";
    }
    return "Editorially verified German study materials designed for Goethe & telc examinations.";
  }

  /**
   * Helper features list for order summary
   */
  function getItemFeatures(itemId) {
    const code = (itemId || "").toUpperCase().trim();
    if (code === "PRO") {
      return [
        "10 daily practice credits",
        "4 full Goethe & telc mock exams / week",
        "5 writing evaluations / week",
        "Full grammar & vocabulary analysis",
        "Comprehensive corrections — up to 10 points",
        "Long-term weakness tracking across submissions",
      ];
    }
    if (code === "BASIC") {
      return [
        "5 daily practice credits",
        "2 full Goethe & telc mock exams / week",
        "2 writing evaluations / week",
        "Grammar feedback — up to 4 points",
        "Detailed corrections — up to 5 points",
        "Tone & register analysis",
      ];
    }
    if (code === "PERSONAL") {
      return [
        "50 daily practice credits",
        "20 full Goethe & telc mock exams / week",
        "20 writing evaluations / week",
        "Deep personalized grammar & vocabulary",
        "Personalized line-by-line rewrite",
        "Personalized remedial study plan & focus areas",
      ];
    }
    return [
      "Curated Lesen, Hören & Grammatik sets",
      "CEFR-standard scoring rubrics",
      "Instant activation upon payment completion",
    ];
  }

  /**
   * Abstracted Worker / API Client: Verify Order Status
   */
  async function verifyPaymentSession(orderId, sessionId) {
    // ------------------------------------------------------------------------
    // FUTURE WORKER INTEGRATION POINT:
    // const res = await fetch(`${WORKER_URL}/api/checkout/verify?order_id=${encodeURIComponent(orderId)}`);
    // return await res.json();
    // ------------------------------------------------------------------------

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          verified: true,
          order_id: orderId || `CG-2026-${Math.floor(100000 + Math.random() * 900000)}`,
          status: "confirmed",
          timestamp: new Date().toISOString(),
        });
      }, 400);
    });
  }

  // Export module globally
  window.CheckoutService = {
    parsePurchaseContext,
    savePurchaseContext,
    clearPurchaseContext,
    checkReturnState,
    initiateCheckoutSession,
    verifyPaymentSession,
    formatCurrency,
    getCurrencySymbol,
  };
})(window);
