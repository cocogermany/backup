/**
 * Coco Germany - Membership Page
 * pages/membership.js
 *
 * Strictly Read-Only:
 * - Fetches plans dynamically from Supabase 'plans' table.
 * - Detects logged-in user's membership from 'learning_users' table.
 * - Never modifies, inserts, or updates any database records.
 * - Converts database limits into clear human-friendly text.
 */

async function fetchMembershipData() {
  let plans = [];
  let userPlanCode = null;
  let userCredits = null;

  try {
    const supabase = window.SupabaseService && typeof window.SupabaseService.getSupabaseClient === "function"
      ? await window.SupabaseService.getSupabaseClient()
      : null;

    if (supabase) {
      // 1. Strictly Read-Only query for active plans from Supabase plans table
      const { data: plansData, error: plansErr } = await supabase
        .from("plans")
        .select("code, name, daily_practice_credits, weekly_mock_exams, schreiben_enabled, weekly_schreiben_limit")
        .order("daily_practice_credits", { ascending: true });

      if (!plansErr && Array.isArray(plansData) && plansData.length > 0) {
        plans = plansData;
      }

      // 2. If user is authenticated, read their active plan from learning_users table (Strictly Read-Only)
      if (currentUser && currentUser.uid) {
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

  return { plans, userPlanCode, userCredits };
}

/**
 * Format plan limits into natural, human-friendly German study descriptions
 */
function formatPracticeCredits(credits) {
  if (typeof credits !== "number" || credits <= 0) {
    return "Unlimited daily practice exercises";
  }
  if (credits >= 100) {
    return "Unlimited interactive practice sessions";
  }
  return `<strong>${credits}</strong> interactive practice credits daily`;
}

function formatMockExams(exams) {
  if (typeof exams !== "number" || exams <= 0) {
    return "Mock exams not included";
  }
  if (exams >= 50) {
    return "Unlimited full Goethe & telc mock exams";
  }
  return `<strong>${exams}</strong> full Goethe & telc mock exam${exams > 1 ? "s" : ""} per week`;
}

function formatSchreibenFeature(enabled, limit) {
  if (!enabled) {
    return {
      text: "AI Schreiben (Writing) evaluation locked",
      enabled: false,
    };
  }
  if (typeof limit === "number" && limit > 0) {
    return {
      text: `<strong>${limit}</strong> AI writing submission${limit > 1 ? "s" : ""} & examiner evaluations / week`,
      enabled: true,
    };
  }
  return {
    text: "Unlimited AI writing evaluations with detailed scoring",
    enabled: true,
  };
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

  // 2. Fetch read-only data from Supabase
  const { plans, userPlanCode, userCredits } = await fetchMembershipData();

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
  const isLoggedIn = Boolean(currentUser);
  const normalizedUserPlan = (userPlanCode || "FREE").toUpperCase();

  const userStatusBadge = isLoggedIn
    ? html`
        <div class="membership-user-status">
          <span class="membership-status-dot"></span>
          <span>Logged in as <strong>${currentUser.email}</strong> &bull; Current tier: <strong>${normalizedUserPlan}</strong></span>
          ${userCredits !== null ? ` &bull; <span>${userCredits} credits remaining today</span>` : ""}
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
        ${plans.map((plan) => renderPlanCard(plan, normalizedUserPlan, isLoggedIn)).join("")}
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
              <h3>AI Examiner Scoring</h3>
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
            <div class="membership-faq-question">${icon("help-circle")} How does the AI Schreiben evaluation work?</div>
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
 * Render individual plan card dynamically from database record
 */
function renderPlanCard(plan, userPlanCode, isLoggedIn) {
  const code = (plan.code || "").toUpperCase().trim();
  const name = plan.name || (code === "FREE" ? "Free Learner" : `${code} Member`);
  const isCurrentPlan = isLoggedIn && userPlanCode === code;
  const isFree = code === "FREE";
  const isFeatured = !isFree;

  const creditsDesc = formatPracticeCredits(plan.daily_practice_credits);
  const mockExamsDesc = formatMockExams(plan.weekly_mock_exams);
  const schreibenInfo = formatSchreibenFeature(plan.schreiben_enabled, plan.weekly_schreiben_limit);

  // Status tag at top of card
  let tagMarkup = "";
  if (isCurrentPlan) {
    tagMarkup = `<span class="membership-tag tag-current">${icon("check", { style: "width:12px;height:12px;" })} Current Plan</span>`;
  } else if (isFeatured) {
    tagMarkup = `<span class="membership-tag">${icon("sparkles", { style: "width:12px;height:12px;" })} Recommended</span>`;
  }

  // Action Button logic (Read-only, no database mutations)
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
    // Logged-in Free user looking at Paid plan
    actionButton = `
      <a class="button" href="https://wa.me/917907211108?text=Hello%20Coco%20Germany,%20I%20would%20like%20to%20upgrade%20my%20membership%20to%20${encodeURIComponent(name)}" target="_blank" rel="noopener">
        ${icon("sparkles")} Upgrade to ${name}
      </a>
    `;
    actionNote = "Direct coordinator support & activation";
  }

  // Pricing display: Strictly do NOT invent prices. Free is Free. For paid, clear plan label.
  const priceDisplay = isFree
    ? `<div class="membership-card-price-row"><span class="membership-card-price">Free</span><span class="membership-card-cadence">Forever</span></div>`
    : `<div class="membership-card-price-row"><span class="membership-card-price">Pro Tier</span><span class="membership-card-cadence">Comprehensive Study Access</span></div>`;

  const subtitle = isFree
    ? "Essential daily practice sessions and foundational German exam preparation."
    : "Comprehensive Goethe & telc preparation with AI writing evaluations and full mock tests.";

  return html`
    <div class="membership-card ${isCurrentPlan ? "is-current" : ""} ${isFeatured ? "is-featured" : ""}">
      ${tagMarkup}
      <div class="membership-card-header">
        <h2 class="membership-card-title">${name}</h2>
        <p class="membership-card-subtitle">${subtitle}</p>
        ${priceDisplay}
      </div>

      <ul class="membership-features">
        <li class="membership-feature-item">
          <span class="membership-feature-icon">${icon("check-circle-2")}</span>
          <span class="membership-feature-text">${creditsDesc}</span>
        </li>
        <li class="membership-feature-item">
          <span class="membership-feature-icon">${icon("award")}</span>
          <span class="membership-feature-text">${mockExamsDesc}</span>
        </li>
        <li class="membership-feature-item ${schreibenInfo.enabled ? "" : "item-disabled"}">
          <span class="membership-feature-icon ${schreibenInfo.enabled ? "" : "icon-disabled"}">
            ${icon(schreibenInfo.enabled ? "file-text" : "lock")}
          </span>
          <span class="membership-feature-text">${schreibenInfo.text}</span>
        </li>
        <li class="membership-feature-item">
          <span class="membership-feature-icon">${icon("book-open")}</span>
          <span class="membership-feature-text">Curated Lesen, Hören, and Grammatik sets</span>
        </li>
        <li class="membership-feature-item">
          <span class="membership-feature-icon">${icon("bar-chart-2")}</span>
          <span class="membership-feature-text">Personalized accuracy & CEFR progress tracking</span>
        </li>
      </ul>

      <div class="membership-card-action">
        ${actionButton}
        ${actionNote ? `<p class="membership-action-note">${actionNote}</p>` : ""}
      </div>
    </div>
  `;
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
