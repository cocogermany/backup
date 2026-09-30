/**
 * Coco Germany - Membership Page
 * pages/membership.js
 *
 * Database-Driven Membership & Plans View:
 * - Fetches active plans (code, name, daily_practice_credits, weekly_mock_exams,
 *   schreiben_enabled, weekly_schreiben_limit, prices) directly from Supabase 'plans' table.
 * - Does not query, fetch, merge, or reference the 'schreiben_plan_config' table.
 * - Uses static Schreiben feature text per plan tier (Free, Basic, Pro, Personal).
 * - Resolves user country and currency from Firestore userProfiles/{uid} for authenticated
 *   users, falling back to localStorage (coco_user_country/coco_user_currency) for guests,
 *   and defaulting to INR if no currency exists.
 * - Displays plan price directly from plan.prices[userCurrency] without currency conversion.
 *   Shows 'Free' for free tiers and 'Contact us for pricing' if currency price is missing.
 * - Strictly read-only: does not modify database schema or payment logic.
 */

// Plan feature templates aligned with DB limits and inspected Schreiben configuration
const PLAN_TIER_FEATURES = {
  FREE: [
    { text: "Limited writing analystics", enabled: true },
    
  ],
  BASIC: [
    { text: "Grammar feedback — up to 4", enabled: true },
    { text: "Detailed corrections — up to 5", enabled: true },
    { text: "Useful phrases — up to 4", enabled: true },
    { text: "Improved text", enabled: true },
  ],
  PRO: [
    { text: "Full grammar & vocabulary analysis", enabled: true },
    { text: "Comprehensive corrections — up to 10", enabled: true },
    { text: "Extensive exam phrases & connectors", enabled: true },
    { text: "Full rewritten improved text", enabled: true },
    { text: "Tone & register analysis", enabled: true },
    { text: "Recurring error patterns identified", enabled: true },
    { text: "Long-term weakness tracking across submissions", enabled: false },
    { text: "Personalized remedial study plan", enabled: false },
  ],
  ADVANCED: [
    { text: "Full grammar & vocabulary analysis", enabled: true },
    { text: "Comprehensive corrections — up to 15", enabled: true },
    { text: "Extensive exam phrases & connectors", enabled: true },
    { text: "Full rewritten improved text", enabled: true },
    { text: "Tone & register analysis", enabled: true },
    { text: "Recurring error patterns identified", enabled: true },
    { text: "Long-term weakness tracking across submissions", enabled: true },
    { text: "Personalized remedial study plan", enabled: true },
  ],
  PERSONAL: [
    { text: "Deep personalized grammar & vocabulary", enabled: true },
    { text: "Personalized line-by-line corrections", enabled: true },
    { text: "Personalized phrases & vocabulary mastery", enabled: true },
    { text: "Full personalized model rewrite", enabled: true },
    { text: "Tone & register analysis", enabled: true },
    { text: "Recurring error patterns identified", enabled: true },
    { text: "Long-term weakness tracking across submissions", enabled: true },
    { text: "Personalized remedial study plan & focus areas", enabled: true },
    { text: "Human assisted support through whatsapp", enabled: true },
  ],
};

/**
 * Retrieve country and currency from Firestore for logged-in users,
 * with localStorage fallback for guests, defaulting to INR.
 */
async function getUserCountryAndCurrency() {
  let country = "";
  let currency = "";

  // 1. If user is authenticated, query Firestore userProfiles/{uid}
  if (typeof currentUser !== "undefined" && currentUser && currentUser.uid) {
    try {
      if (typeof getFirebaseTools === "function") {
        const tools = await getFirebaseTools();
        if (tools && tools.firestoreModule && tools.db) {
          const profileRef = tools.firestoreModule.doc(tools.db, "userProfiles", currentUser.uid);
          const snap = await tools.firestoreModule.getDoc(profileRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.country) country = String(data.country).trim();
            if (data.currency) currency = String(data.currency).trim();
          }
        }
      }
    } catch (err) {
      console.warn("Membership: Error loading user profile from Firestore:", err);
    }

    if (!currency && typeof currentUserProfile !== "undefined" && currentUserProfile?.currency) {
      currency = String(currentUserProfile.currency).trim();
    }
    if (!country && typeof currentUserProfile !== "undefined" && currentUserProfile?.country) {
      country = String(currentUserProfile.country).trim();
    }
  }

  // 2. For guests or if profile values are missing, read from localStorage
  if (!country) {
    country = localStorage.getItem("coco_user_country") || "";
  }
  if (!currency) {
    currency = localStorage.getItem("coco_user_currency") || "";
  }

  // 3. Fall back to INR if no currency exists or if currency is "Other"
  if (!currency || currency === "Other") {
    currency = "INR";
  }

  return { country, currency };
}

/**
 * Fetch database plans, active user tier, and currency from Supabase plans & Firestore.
 */
async function fetchMembershipData() {
  let plans = [];
  let userPlanCode = null;
  let userCredits = null;

  // Retrieve user currency and country
  const { country: userCountry, currency: userCurrency } = await getUserCountryAndCurrency();

  try {
    const supabase = window.SupabaseService && typeof window.SupabaseService.getSupabaseClient === "function"
      ? await window.SupabaseService.getSupabaseClient()
      : null;

    if (supabase) {
      // 1. Fetch active plans with prices and limits from Supabase plans table ONLY
      const { data: plansData, error: plansErr } = await supabase
        .from("plans")
        .select("code, name, daily_practice_credits, weekly_mock_exams, schreiben_enabled, weekly_schreiben_limit, prices")
        .order("daily_practice_credits", { ascending: true });

      if (!plansErr && Array.isArray(plansData) && plansData.length > 0) {
        plans = plansData;
      }

      // 2. If user is authenticated, read their active plan from learning_users table
      if (typeof currentUser !== "undefined" && currentUser && currentUser.uid) {
        const { data: userData, error: userErr } = await supabase
          .from("learning_users")
          .select("membership, credits_remaining, current_level, format")
          .eq("uid", currentUser.uid)
          .maybeSingle();

        if (!userErr && userData) {
          userPlanCode = (userData.membership || "FREE").toUpperCase().trim();
          userCredits = typeof userData.credits_remaining === "number" ? userData.credits_remaining : null;
        } else {
          userPlanCode = "FREE";
        }
      }
    }
  } catch (e) {
    console.warn("Membership: Error loading database plans:", e);
  }

  return { plans, userPlanCode, userCredits, userCurrency, userCountry };
}

/**
 * Format currency price using browser Intl.NumberFormat without rate conversions.
 */
function formatCurrencyPrice(amount, currency) {
  try {
    const locale = typeof currencyLocale === "function" ? currencyLocale(currency) : "en-US";
    const noFraction = ["INR", "JPY", "HUF", "TWD", "KRW", "UGX"].includes(currency);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      maximumFractionDigits: noFraction ? 0 : 2,
    }).format(amount);
  } catch (e) {
    return `${currency} ${amount}`;
  }
}

/**
 * Render price row using plan.prices[userCurrency].
 * Free plans always display 'Free'. Missing prices display 'Contact us for pricing'.
 */
function renderPlanPrice(plan, userCurrency) {
  const code = (plan.code || "").toUpperCase().trim();
  const isFree = code === "FREE";

  if (isFree) {
    return `<div class="membership-card-price-row"><span class="membership-card-price">Free</span><span class="membership-card-cadence">/forever</span></div>`;
  }

  // Parse prices object from database plan record
  let prices = {};
  if (typeof plan.prices === "object" && plan.prices !== null) {
    prices = plan.prices;
  } else if (typeof plan.prices === "string") {
    try {
      prices = JSON.parse(plan.prices);
    } catch {
      prices = {};
    }
  }

  const curr = (userCurrency || "INR").trim();
  let rawPrice = undefined;
  if (prices[curr] !== undefined && prices[curr] !== null) {
    rawPrice = prices[curr];
  } else if (prices[curr.toUpperCase()] !== undefined && prices[curr.toUpperCase()] !== null) {
    rawPrice = prices[curr.toUpperCase()];
  } else if (prices[curr.toLowerCase()] !== undefined && prices[curr.toLowerCase()] !== null) {
    rawPrice = prices[curr.toLowerCase()];
  }

  // Missing price in user's currency -> clear fallback
  if (rawPrice === undefined || rawPrice === null || rawPrice === "") {
    return `
      <div class="membership-card-price-row">
        <span class="membership-card-price" style="font-size: clamp(16px, 1.8vw, 20px); letter-spacing: -0.01em;">Contact us for pricing</span>
      </div>
    `;
  }

  const num = typeof rawPrice === "number" ? rawPrice : Number(rawPrice);
  if (num === 0) {
    return `<div class="membership-card-price-row"><span class="membership-card-price">Free</span><span class="membership-card-cadence">/forever</span></div>`;
  }

  if (Number.isFinite(num)) {
    const formatted = formatCurrencyPrice(num, curr);
    return `
      <div class="membership-card-price-row">
        <span class="membership-card-price">${formatted}</span><span class="membership-card-cadence">/month</span>
      </div>
    `;
  }

  return `
    <div class="membership-card-price-row">
      <span class="membership-card-price">${rawPrice}</span><span class="membership-card-cadence">/month</span>
    </div>
  `;
}

/**
 * Generate plan features dynamically from database plan limits & tiered capabilities
 */
function generatePlanFeatures(plan) {
  const features = [];
  const code = (plan.code || "").toUpperCase().trim();

  // 1. Daily practice credits from plans table
  const credits = plan.daily_practice_credits;
  if (typeof credits === "number" && credits >= 100) {
    features.push({
      text: "Unlimited practice sessions",
      enabled: true,
    });
  } else if (typeof credits === "number" && credits > 0) {
    features.push({
      text: `<strong>${credits}</strong> practice credits daily`,
      enabled: true,
    });
  } else {
    features.push({
      text: "Interactive practice exercises",
      enabled: true,
    });
  }

  // 2. Full mock exams from plans table
  const exams = plan.weekly_mock_exams;
  if (typeof exams === "number" && exams >= 50) {
    features.push({
      text: "Unlimited full Goethe & telc mock exams",
      enabled: true,
    });
  } else if (typeof exams === "number" && exams > 0) {
    features.push({
      text: `<strong>${exams}</strong> full mock exam${exams > 1 ? "s" : ""} / week`,
      enabled: true,
    });
  } else {
    features.push({
      text: "Full mock exams",
      enabled: false,
      icon: "x",
    });
  }

  // 3. Weekly writing submission quota from plans table
  const limit = plan.weekly_schreiben_limit;
  if (!plan.schreiben_enabled) {
    features.push({
      text: "Writing evaluations",
      enabled: false,
      icon: "x",
    });
  } else if (typeof limit === "number" && limit >= 50) {
    features.push({
      text: "Unlimited writing evaluations",
      enabled: true,
    });
  } else if (typeof limit === "number" && limit > 0) {
    features.push({
      text: `<strong>${limit}</strong> writing evaluation${limit > 1 ? "s" : ""} / week`,
      enabled: true,
    });
  } else {
    features.push({
      text: "Writing evaluations",
      enabled: false,
      icon: "x",
    });
  }

  // 4. Tiered capabilities (Limited -> Detailed -> Full -> Personalized)
  const tierItems = PLAN_TIER_FEATURES[code] || PLAN_TIER_FEATURES.FREE;
  tierItems.forEach((item) => {
    features.push({
      text: item.text,
      enabled: Boolean(item.enabled),
      icon: item.enabled ? "check" : (item.icon || "x"),
    });
  });

  // 5. Curated study exercises
  features.push({
    text: "Curated reading, listening & grammar sets",
    enabled: true,
  });

  return features;
}

/**
 * Generate plan subtitle dynamically from database plan values
 */
function getPlanSubtitle(plan) {
  const code = (plan.code || "").toUpperCase().trim();
  if (code === "FREE") {
    return "Essential daily practice sessions and foundational German exam preparation.";
  }
  const parts = [];
  if (plan.weekly_mock_exams && plan.weekly_mock_exams > 0) {
    parts.push(plan.weekly_mock_exams >= 50 ? "full mock exams" : `${plan.weekly_mock_exams} weekly mock exams`);
  }
  if (plan.schreiben_enabled) {
    parts.push(plan.weekly_schreiben_limit > 0 && plan.weekly_schreiben_limit < 50 ? `${plan.weekly_schreiben_limit} weekly writing evaluations` : "examiner writing evaluations");
  }
  if (parts.length > 0) {
    return `Comprehensive Goethe & telc preparation with ${parts.join(" and ")}.`;
  }
  return "Comprehensive Goethe & telc preparation with structured exam practice.";
}

/**
 * Render individual plan card dynamically from database record
 */
function renderPlanCard(plan, userPlanCode, isLoggedIn, userCurrency, allPlans) {
  const code = (plan.code || "").toUpperCase().trim();
  const name = plan.name || (code === "FREE" ? "Free Learner" : `${code} Member`);
  const isCurrentPlan = isLoggedIn && userPlanCode === code;
  const isFree = code === "FREE";

  // Recommend PRO, or the first paid plan if PRO is not present
  const isFeatured = !isFree && (code === "PRO" || (allPlans && !allPlans.some((p) => (p.code || "").toUpperCase() === "PRO") && plan === allPlans.find((p) => (p.code || "").toUpperCase() !== "FREE")));

  const subtitle = getPlanSubtitle(plan);
  const priceDisplay = renderPlanPrice(plan, userCurrency);
  const features = generatePlanFeatures(plan);

  // Status tag at top of card
  let tagMarkup = "";
  if (isCurrentPlan) {
    tagMarkup = `<span class="membership-tag tag-current">${icon("check", { style: "width:12px;height:12px;" })} Current Plan</span>`;
  } else if (isFeatured) {
    tagMarkup = `<span class="membership-tag">${icon("sparkles", { style: "width:12px;height:12px;" })} Recommended</span>`;
  }

  // Action button logic
  let actionButton = "";
  let actionNote = "";

  if (!isLoggedIn) {
    actionButton = `
      <a class="button ${isFree ? "button-light" : ""}" href="#/login" data-membership-login>
        ${icon("log-in")} Log in to continue
      </a>
    `;
    actionNote = isFree ? "Get started with free daily credits" : "Log in to view upgrade options";
  } else if (isCurrentPlan) {
    actionButton = `
      <button class="button button-light membership-button-current" type="button" disabled>
        ${icon("check-circle-2")} Your Active Plan
      </button>
    `;
    actionNote = "Your daily credits and exam quota are active";
  } else if (isFree && userPlanCode !== "FREE") {
    actionButton = `
      <button class="button button-light membership-button-current" type="button" disabled>
        Standard Tier
      </button>
    `;
    actionNote = "Included with every Coco Germany account";
  } else {
    // Logged-in user looking at a paid upgrade
    actionButton = `
      <a class="button" href="https://wa.me/917907211108?text=Hello%20Coco%20Germany,%20I%20would%20like%20to%20upgrade%20my%20membership%20to%20${encodeURIComponent(name)}" target="_blank" rel="noopener">
        ${icon("sparkles")} Upgrade to ${name}
      </a>
    `;
    actionNote = "Direct coordinator support & activation";
  }

  return html`
    <div class="membership-card ${isCurrentPlan ? "is-current" : ""} ${isFeatured ? "is-featured" : ""}">
      ${tagMarkup}
      <div class="membership-card-header">
        <h2 class="membership-card-title">${name}</h2>
        <p class="membership-card-subtitle">${subtitle}</p>
        ${priceDisplay}
      </div>

      <ul class="membership-features">
        ${features
          .map(
            (feat) => html`
              <li class="membership-feature-item ${feat.enabled ? "" : "item-disabled"}">
                <span class="membership-feature-icon ${feat.enabled ? "" : "icon-disabled"}">
                  ${icon(feat.enabled ? "check" : (feat.icon || "x"))}
                </span>
                <span class="membership-feature-text">${feat.text}</span>
              </li>
            `
          )
          .join("")}
      </ul>

      <div class="membership-card-action">
        ${actionButton}
        ${actionNote ? `<p class="membership-action-note">${actionNote}</p>` : ""}
      </div>
    </div>
  `;
}

/**
 * Main render function called by the router at #/membership
 */
async function renderMembership() {
  const container = document.getElementById("app");
  if (!container) return;

  // 1. Render immediate skeleton loading view
  container.innerHTML = html`
    <section class="section membership-page">
      <div class="membership-hero">
        <p class="eyebrow">${icon("crown")} Membership & Plans</p>
        <h1>Choose the right way to learn German</h1>
        <p class="lead">Structured, editorial study resources and daily interactive exam practice designed for calm, continuous progress.</p>
      </div>

      <div class="membership-skeleton-grid">
        <div class="membership-skeleton-card">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line price"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
        <div class="membership-skeleton-card">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line short"></div>
          <div class="skeleton-line price"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    </section>
  `;
  renderIcons();

  // 2. Fetch read-only data from Supabase & user currency from Firestore/localStorage
  const { plans, userPlanCode, userCredits, userCurrency } = await fetchMembershipData();

  // 3. Handle Empty State if database plans could not be retrieved
  if (!plans || plans.length === 0) {
    container.innerHTML = html`
      <section class="section membership-page">
        <div class="membership-hero">
          <p class="eyebrow">${icon("crown")} Membership & Plans</p>
          <h1>Choose the right way to learn German</h1>
          <p class="lead">Structured, editorial study resources and daily interactive exam practice designed for calm, continuous progress.</p>
        </div>

        <div class="card membership-state-wrap">
          <div class="membership-state-icon">${icon("shield-alert")}</div>
          <h2>Plan Information Temporarily Unavailable</h2>
          <p>We are currently updating our learning plans. Please check back shortly or reach out to our team for details.</p>
          <div class="actions" style="justify-content: center;">
            <a class="button" href="#/practice">${icon("pen-tool")} Practice Hub</a>
            <a class="button-light" href="#/contact">${icon("message-circle")} Contact Support</a>
          </div>
        </div>
      </section>
    `;
    renderIcons();
    return;
  }

  // 4. Render Main Membership Page with Dynamic Plans
  const isLoggedIn = Boolean(typeof currentUser !== "undefined" && currentUser);
  const normalizedUserPlan = (userPlanCode || "FREE").toUpperCase();

  const userStatusBadge = isLoggedIn
    ? html`
        <div class="membership-user-status" role="status">
          <span class="membership-status-dot" aria-hidden="true"></span>
          <span class="membership-status-text">
            <span>Logged in as <strong>${currentUser.email}</strong></span>
            <span class="membership-status-divider" aria-hidden="true">&bull;</span>
            <span>Current tier: <strong>${normalizedUserPlan}</strong></span>
            ${userCredits !== null ? html`<span class="membership-status-divider" aria-hidden="true">&bull;</span><span><strong>${userCredits}</strong> credits left today</span>` : ""}
            <span class="membership-status-divider" aria-hidden="true">&bull;</span>
            <span>Currency: <strong>${userCurrency}</strong></span>
          </span>
        </div>
      `
    : "";

  container.innerHTML = html`
    <section class="section membership-page">
      <!-- 1. Hero Section -->
      <div class="membership-hero">
        <p class="eyebrow">${icon("crown")} Membership & Plans</p>
        <h1>Choose the right way to learn German</h1>
        <p class="lead">
          Master Goethe-Zertifikat and telc examinations with clarity. Practice reading, listening, grammar, and writing with structured, editorially verified materials.
        </p>
        ${userStatusBadge}
      </div>

      <!-- 2. Dynamic Plan Cards from Supabase -->
      <div class="membership-grid">
        ${plans.map((plan) => renderPlanCard(plan, normalizedUserPlan, isLoggedIn, userCurrency, plans)).join("")}
      </div>

      <!-- 3. Learning Architecture & Reassurance -->
      <div class="membership-reassurance">
        <div class="membership-reassurance-header">
          <h2>${icon("sparkles", { style: "color:var(--gold); vertical-align:middle; margin-right:6px;" })} Built for Serious German Learners</h2>
          <p>Coco Germany materials follow strict CEFR (A1&ndash;B2) editorial standards with zero clutter.</p>
        </div>
        <div class="membership-reassurance-grid">
          <div class="membership-reassurance-item">
            <div class="membership-reassurance-icon">${icon("calendar")}</div>
            <div>
              <h3>Daily Midnight Resets</h3>
              <p>Practice credits reset automatically every 24 hours based on your local timezone.</p>
            </div>
          </div>
          <div class="membership-reassurance-item">
            <div class="membership-reassurance-icon">${icon("award")}</div>
            <div>
              <h3>Authentic Exam Formats</h3>
              <p>Full mock exams modeled after official Goethe-Institut and telc test structures.</p>
            </div>
          </div>
          <div class="membership-reassurance-item">
            <div class="membership-reassurance-icon">${icon("check-circle-2")}</div>
            <div>
              <h3>Advanced Examiner Scoring</h3>
              <p>Schreiben tasks evaluate grammar, Leitpunkte task fulfillment, and CEFR-appropriate vocabulary.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Frequently Asked Questions -->
      <div class="membership-faq-section">
        <div class="membership-faq-header">
          <h2>Frequently Asked Questions</h2>
          <p>Everything you need to know about Coco Germany practice plans and credits.</p>
        </div>
        <div class="membership-faq-list">
          <div class="membership-faq-item">
            <div class="membership-faq-question">${icon("help-circle")} How do daily practice credits work?</div>
            <p class="membership-faq-answer">
              Each practice session in the Practice App consumes credits. Your quota refreshes daily at midnight in your local timezone, so you can maintain a consistent learning habit without pressure.
            </p>
          </div>
          <div class="membership-faq-item">
            <div class="membership-faq-question">${icon("help-circle")} How does the Advanced Writing evaluation work?</div>
            <p class="membership-faq-answer">
              When you submit a written letter or essay, our evaluation engine analyzes your submission against official Goethe and telc rubrics. You receive detailed feedback on structure, grammar accuracy, connector usage, and vocabulary range.
            </p>
          </div>
          <div class="membership-faq-item">
            <div class="membership-faq-question">${icon("help-circle")} Can I upgrade or change my plan anytime?</div>
            <p class="membership-faq-answer">
              Yes. All your saved mock exam attempts, study history, and performance accuracy records remain safely preserved in your account across all plans.
            </p>
          </div>
        </div>
      </div>
    </section>
  `;

  renderIcons();
  attachMembershipHandlers();
}

/**
 * Attach interaction handlers for the membership page
 */
function attachMembershipHandlers() {
  document.querySelectorAll("[data-membership-login]").forEach((link) => {
    link.addEventListener("click", () => {
      localStorage.setItem("loginRedirect", "#/membership");
    });
  });
}

// Expose globally for the router in app.js
if (typeof window !== "undefined") {
  window.renderMembership = renderMembership;
}
