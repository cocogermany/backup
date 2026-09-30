/**
 * Coco Germany — Standalone Checkout Service Layer (checkout-service.js)
 *
 * Thin client interface for the Cloudflare Worker:
 * - Parses and normalizes incoming purchase context (URL parameters, hash, sessionStorage).
 * - Delegates all critical business decisions to the authoritative Cloudflare Worker:
 *   product validation, actual prices, currencies, country eligibility,
 *   available payment methods, and payment order verification.
 * - Zero hardcoded prices, payment methods, fake order IDs, or client-side payment logic.
 * - Zero secrets or provider credentials in the frontend.
 */

(function (window) {
  "use strict";

  // Authoritative Cloudflare Worker Endpoint
  const DEFAULT_WORKER_URL = "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";
  const WORKER_URL =
    (typeof window !== "undefined" && (window.COCO_WORKER_URL || localStorage.getItem("coco_worker_url"))) ||
    DEFAULT_WORKER_URL;

  const STORAGE_KEY = "coco_checkout_context";

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
    if (amount === null || amount === undefined || amount === "") return "—";
    const num = Number(amount);
    if (!Number.isFinite(num)) return `${currency} ${amount}`;
    try {
      const noFraction = ["INR", "JPY", "HUF", "TWD", "KRW", "UGX"].includes(currency);
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "INR",
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
    const period = getParam("period") || context.period || (type === "membership" ? "/month" : "");

    let metadata = context.metadata || {};
    const rawMeta = getParam("metadata");
    if (rawMeta) {
      try {
        metadata = { ...metadata, ...JSON.parse(decodeURIComponent(rawMeta)) };
      } catch {
        metadata.raw = rawMeta;
      }
    }

    const mergedContext = {
      purchase_type: String(type).toLowerCase().trim(),
      item_id: String(id).trim(),
      item_name: String(name).trim(),
      quantity: Number.isNaN(quantity) || quantity < 1 ? 1 : quantity,
      country: country,
      currency: currency || "INR",
      displayed_price: price !== "" && !Number.isNaN(Number(price)) ? Number(price) : null,
      period: period,
      metadata: metadata,
    };

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
   * Check if current page load is a return from a payment gateway redirect
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

    if (["success", "pending", "failed", "cancelled", "cancel"].includes(statusParam) || orderId || sessionId) {
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
   * Thin Worker Client: Initiate Checkout Session
   *
   * Calls the Cloudflare Worker to validate the purchase context and obtain
   * authoritative price, currency, eligibility, order/session ID, and available payment methods.
   */
  async function initiateCheckoutSession(purchaseContext, customerInfo) {
    if (!purchaseContext || !purchaseContext.item_id) {
      return {
        success: false,
        status: "unavailable",
        error: "Missing item identifier",
        message: "No item or membership plan was specified for checkout.",
      };
    }

    try {
      const res = await fetch(`${WORKER_URL}/api/checkout/initiate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          purchase_context: purchaseContext,
          customer: customerInfo,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return {
          success: false,
          status: "unavailable",
          error: data?.error || `HTTP ${res.status}`,
          message: data?.message || "Payment service declined this checkout request. Please try again or contact support.",
        };
      }

      return data;
    } catch (err) {
      console.error("CheckoutService: Error initiating session with Worker:", err);
      return {
        success: false,
        status: "unavailable",
        error: err.name || "NetworkError",
        message: "Could not reach the payment server. Please verify your connection and try again.",
      };
    }
  }

  /**
   * Thin Worker Client: Process Payment
   *
   * Calls the Cloudflare Worker with selected method to authorize payment
   * and receive instructions (redirect URL, provider action, or final status).
   */
  async function processPayment(session, selectedMethodId, customer) {
    if (!session) {
      throw new Error("No active checkout session to process.");
    }

    const payload = {
      session_id: session.session_id,
      order_id: session.order_id,
      method_id: selectedMethodId,
      customer: customer || session.customer,
      return_url: window.location.origin + window.location.pathname,
    };

    const res = await fetch(`${WORKER_URL}/api/checkout/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(data?.message || data?.error || `Payment processing failed with status ${res.status}`);
    }

    return data;
  }

  /**
   * Thin Worker Client: Verify Payment Session
   *
   * Calls the Cloudflare Worker to verify the authoritative status of an order/session.
   * Never assumes payment is successful on the client side.
   */
  async function verifyPaymentSession(orderId, sessionId) {
    if (!orderId && !sessionId) {
      return {
        verified: false,
        status: "failed",
        message: "Missing order reference to verify.",
      };
    }

    try {
      const params = new URLSearchParams();
      if (orderId) params.set("order_id", orderId);
      if (sessionId) params.set("session_id", sessionId);

      const res = await fetch(`${WORKER_URL}/api/checkout/verify?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        return {
          verified: false,
          status: "failed",
          order_id: orderId,
          session_id: sessionId,
          message: data?.message || data?.error || "Could not verify payment status with the server.",
        };
      }

      return data;
    } catch (err) {
      console.error("CheckoutService: Error verifying payment session:", err);
      return {
        verified: false,
        status: "failed",
        order_id: orderId,
        session_id: sessionId,
        message: "Network error occurred while verifying payment with the server.",
      };
    }
  }

  // Export module globally
  window.CheckoutService = {
    parsePurchaseContext,
    savePurchaseContext,
    clearPurchaseContext,
    checkReturnState,
    initiateCheckoutSession,
    processPayment,
    verifyPaymentSession,
    formatCurrency,
    getCurrencySymbol,
  };
})(window);
