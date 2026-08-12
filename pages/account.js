function renderProfileSetup() {
  if (!currentUser) {
    renderLogin("login");
    return;
  }

  app.innerHTML = html`
    <section class="section auth-wrap">
      <div class="auth-card profile-setup-card">
        <img class="auth-logo" src="public/images/cocoLogo.jpg" alt="Coco Germany logo" />
        <p class="eyebrow">One-time setup</p>
        <h1>Profile & Learning Setup</h1>
        <p class="intro">Choose your exam format, German level, country, and preferred currency.</p>
        <form class="form auth-form" id="profile-setup-form">
          ${renderProfileFields()}
          <button class="button" type="submit">${icon("save")}Save preferences</button>
          <p id="profile-message" aria-live="polite"></p>
        </form>
      </div>
    </section>
  `;

  document.querySelector("#profile-setup-form").addEventListener("submit", saveProfilePreferences);
}

function renderProfileFields() {
  return html`
    <label class="field">
      Exam Format
      <select name="format" required>
        <option value="">Select exam format</option>
        ${optionList(examFormatOptions, currentUserProfile?.format || "goethe")}
      </select>
    </label>
    <label class="field">
      Current German Level
      <select name="level" required>
        <option value="">Select level</option>
        ${optionList(germanLevelOptions, currentUserProfile?.level || currentUserProfile?.current_level || "A1")}
      </select>
    </label>
    <label class="field">
      Country
      <select name="country" required>
        <option value="">Select country</option>
        ${optionList(countryOptions, currentUserProfile?.country || "")}
      </select>
    </label>
    <label class="field">
      Currency
      <select name="currency" required>
        <option value="">Select currency</option>
        ${optionList(currencyOptions, currentUserProfile?.currency || "")}
      </select>
    </label>
  `;
}

async function saveProfilePreferences(event) {
  event.preventDefault();
  if (!currentUser) {
    renderLogin("login");
    return;
  }

  const form = event.currentTarget;
  const message = document.querySelector("#profile-message");
  const data = new FormData(form);
  const country = String(data.get("country") || "").trim();
  const currency = String(data.get("currency") || "").trim();
  const format = String(data.get("format") || "goethe").toLowerCase().trim();
  const level = String(data.get("level") || "A1").toUpperCase().trim();

  if (!country || !currency || !format || !level) {
    message.className = "error";
    message.textContent = "Please complete all fields (Exam Format, Level, Country, Currency).";
    return;
  }

  const tools = await getFirebaseTools();
  try {
    // 1. Save profile preferences to Firestore userProfiles document
    await tools.firestoreModule.setDoc(
      tools.firestoreModule.doc(tools.db, "userProfiles", currentUser.uid),
      {
        uid: currentUser.uid,
        email: currentUser.email || "",
        country,
        currency,
        format,
        level,
        referrer: currentUserProfile?.referrer || referrerSource(),
        firstVisitAtLocal: currentUserProfile?.firstVisitAtLocal || new Date().toISOString(),
        updatedAt: tools.firestoreModule.serverTimestamp(),
        ...(currentUserProfile?.firstVisitAt ? {} : { firstVisitAt: tools.firestoreModule.serverTimestamp() }),
      },
      { merge: true },
    );

    currentUserProfile = {
      ...(currentUserProfile || {}),
      uid: currentUser.uid,
      email: currentUser.email || "",
      country,
      currency,
      format,
      level,
      current_level: level,
    };

    // 2. Send selected level, format, and browser timezone to Cloudflare Worker POST /learning/onboarding
    const timezone = typeof Intl !== "undefined" && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
    if (tools && tools.auth && tools.auth.currentUser) {
      const idToken = await tools.auth.currentUser.getIdToken(true);
      if (window.SupabaseService && typeof window.SupabaseService.submitLearningOnboarding === "function") {
        await window.SupabaseService.submitLearningOnboarding({ level, format, timezone }, idToken);
      } else {
        const workerBase = (localStorage.getItem("r2_worker_url") || "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev").replace(/\/$/, "");
        await fetch(`${workerBase}/learning/onboarding`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({ level, format, timezone }),
        });
      }
    }

    message.className = "success";
    message.textContent = "Preferences saved.";
    if (form.id === "profile-setup-form") {
      const destination = localStorage.getItem("loginRedirect") || "#/account";
      localStorage.removeItem("loginRedirect");
      location.hash = destination.replace("#", "");
    } else {
      renderAccount();
    }
  } catch (error) {
    message.className = "error";
    message.textContent = friendlyError(error);
  }
}

function renderAccount() {
  if (!currentUser) {
    renderLogin("login");
    return;
  }

  const completedOrders = orders.filter((order) => order.status === "Completed");

  app.innerHTML = html`
    <section class="section">
      <div class="account-header">
        <div>
          <p class="eyebrow">Customer dashboard</p>
          <h1>My Account</h1>
          <p class="intro">${currentUser.email}</p>
        </div>
        <div class="actions">
          ${isAdmin() ? `<a class="button" href="#/admin">${icon("settings")}Admin Panel</a>` : ""}
          <button class="button-light" type="button" data-logout>${icon("log-out")}Logout</button>
        </div>
      </div>

      <div class="dashboard-grid">
        <div class="card card-body">
          <h3>My Orders</h3>
          <div class="order-list">
            ${orders.length
              ? orders.map(renderOrderRow).join("")
              : `<p class="muted">No orders yet. Browse resources and submit a checkout request.</p>`}
          </div>
        </div>
        <div class="card card-body">
          <h3>Purchased Resources</h3>
          <p class="muted">${completedOrders.length ? `${completedOrders.length} completed order(s).` : "Completed resources will appear here after fulfilment."}</p>
        </div>
        <div class="card card-body">
          <h3>Profile Settings</h3>
          <p class="muted">Email: ${currentUser.email}</p>
          <form class="form profile-settings-form" id="account-profile-form">
            ${renderProfileFields()}
            <button class="button-light" type="submit">${icon("save")}Update profile</button>
            <p id="profile-message" aria-live="polite"></p>
          </form>
        </div>
      </div>
    </section>
  `;

  document.querySelector("[data-logout]").addEventListener("click", logout);
  document.querySelector("#account-profile-form")?.addEventListener("submit", saveProfilePreferences);
}
