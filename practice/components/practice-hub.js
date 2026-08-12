/**
 * Coco Germany Practice App - Practice Hub Component
 * components/practice-hub.js
 *
 * Connected directly to Supabase materials & learning_users database.
 */

window.PracticeHubComponent = {
  currentQuery: {
    level: "A1",
    format: "Goethe",
    membership: "FREE",
    activeModule: "All",
    page: 1,
    searchQuery: "",
    totalCount: 0,
    totalPages: 1,
  },
  searchTimeout: null,
  completedMaterialIds: new Set(),

  render: function (appState, queryParams) {
    const activeModule = queryParams ? (queryParams.get("module") || "All") : "All";
    const pageParam = queryParams ? parseInt(queryParams.get("page") || "1", 10) : 1;
    const level = appState ? (appState.currentLevel || "A1") : "A1";

    this.currentQuery.level = level;
    this.currentQuery.activeModule = activeModule;
    this.currentQuery.page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

    // Schedule async initialization after shell renders
    setTimeout(() => {
      this.initHubData(appState);
    }, 0);

    return `
      <div class="view-fade-in" id="practice-hub-root">
        <div class="page-header">
          <div class="page-title-row">
            <h1 class="page-title" id="practice-hub-title">Practice Hub (${level})</h1>
            <span class="badge-pill badge-sky" id="practice-hub-level-badge">Level ${level} Collection</span>
          </div>
          <p class="page-subtitle">Modular skill drills fetched live from database for daily learning sessions.</p>
        </div>

        <!-- Filter Bar & Search -->
        <div class="filter-bar">
          <div class="filter-tabs">
            <button class="filter-tab-btn ${activeModule === "All" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('All')">
              All Skills
            </button>
            <button class="filter-tab-btn ${activeModule === "Lesen" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Lesen')">
              Lesen (Reading)
            </button>
            <button class="filter-tab-btn ${activeModule === "Hören" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Hören')">
              Hören (Listening)
            </button>
            <button class="filter-tab-btn ${activeModule === "Grammatik" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Grammatik')">
              Grammatik
            </button>
            <button class="filter-tab-btn ${activeModule === "Schreiben" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Schreiben')">
              Schreiben
            </button>
          </div>

          <div class="search-box">
            <i data-lucide="search"></i>
            <input type="text" id="practice-search-input" placeholder="Search topic or keyword..." value="${this.currentQuery.searchQuery}" oninput="window.PracticeHubComponent.handleSearchInput(this.value)">
          </div>
        </div>

        <!-- Materials Grid Container -->
        <div class="practice-materials-grid" id="materials-grid-container">
          <div class="skeleton-card">
            <div class="skeleton" style="height:20px; width:60%; margin-bottom:12px;"></div>
            <div class="skeleton" style="height:14px; width:90%; margin-bottom:8px;"></div>
            <div class="skeleton" style="height:14px; width:75%;"></div>
          </div>
          <div class="skeleton-card">
            <div class="skeleton" style="height:20px; width:60%; margin-bottom:12px;"></div>
            <div class="skeleton" style="height:14px; width:90%; margin-bottom:8px;"></div>
            <div class="skeleton" style="height:14px; width:75%;"></div>
          </div>
        </div>

        <!-- Real Pagination Container -->
        <div id="practice-pagination-container" style="margin-top:24px;"></div>
      </div>
    `;
  },

  initHubData: async function (appState) {
    // 1. Fetch user learning profile (Firebase Auth & Supabase learning_users)
    const profile = await this.fetchUserProfile();
    if (profile.level) {
      this.currentQuery.level = profile.level;
      if (appState) appState.currentLevel = profile.level;
    }
    if (profile.format) {
      this.currentQuery.format = profile.format;
    }
    this.currentQuery.membership = profile.membership || "FREE";

    // Store level/format in localStorage cache
    localStorage.setItem("coco_practice_level", this.currentQuery.level);
    localStorage.setItem("coco_practice_format", this.currentQuery.format);

    // Update Header title if level changed
    const titleEl = document.getElementById("practice-hub-title");
    const badgeEl = document.getElementById("practice-hub-level-badge");
    if (titleEl) titleEl.textContent = `Practice Hub (${this.currentQuery.level})`;
    if (badgeEl) badgeEl.textContent = `${this.currentQuery.format} ${this.currentQuery.level} Collection`;

    // 2. Fetch completed materials list for status badges
    this.completedMaterialIds = await this.fetchCompletedMaterialIds();

    // 3. Execute fetch & render
    await this.executeFetchAndRender();
  },

  fetchUserProfile: async function () {
    let uid = null;
    try {
      const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
      const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
      const firebaseConfig = {
        apiKey: "AIzaSyCAmxLSnUWMuhuuH8oFshZMTajeP2iXvpY",
        authDomain: "cocogermany-ba33f.firebaseapp.com",
        projectId: "cocogermany-ba33f",
        storageBucket: "cocogermany-ba33f.firebasestorage.app",
        messagingSenderId: "689122181603",
        appId: "1:689122181603:web:a8bd80e2c187695ac8a0d6",
      };
      let app = appModule.getApps().length === 0 ? appModule.initializeApp(firebaseConfig) : appModule.getApp();
      const auth = authModule.getAuth(app);
      if (auth.currentUser) {
        uid = auth.currentUser.uid;
      } else {
        uid = await new Promise((resolve) => {
          const unsub = authModule.onAuthStateChanged(auth, (user) => {
            unsub();
            resolve(user ? user.uid : null);
          });
        });
      }
    } catch (e) {
      console.warn("PracticeHub: Firebase auth lookup note:", e);
    }

    let dbProfile = null;
    if (uid && window.SupabaseService && window.SupabaseService.getSupabaseClient) {
      try {
        const supabase = await window.SupabaseService.getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase
            .from("learning_users")
            .select("uid, membership, current_level, format")
            .eq("uid", uid)
            .maybeSingle();

          if (!error && data) {
            dbProfile = data;
          }
        }
      } catch (err) {
        console.warn("PracticeHub: Supabase learning_users query error:", err);
      }
    }

    return {
      uid: uid || "local-user",
      level: dbProfile?.current_level || localStorage.getItem("coco_practice_level") || "A1",
      format: dbProfile?.format || localStorage.getItem("coco_practice_format") || "Goethe",
      membership: dbProfile?.membership || "FREE",
    };
  },

  fetchCompletedMaterialIds: async function () {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return new Set();
    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      const uid = localStorage.getItem("coco_user_uid") || "local-user";
      if (supabase && uid && uid !== "local-user") {
        const { data } = await supabase.from("practice_attempts").select("material_id").eq("uid", uid);
        if (data) return new Set(data.map(d => d.material_id));
      }
    } catch (e) {
      console.warn("PracticeHub: Completed materials lookup note:", e);
    }
    return new Set();
  },

  executeFetchAndRender: async function () {
    const gridContainer = document.getElementById("materials-grid-container");
    const pagContainer = document.getElementById("practice-pagination-container");

    const cacheKey = `hub_cache_${this.currentQuery.level}_${this.currentQuery.format}_${this.currentQuery.activeModule}_p${this.currentQuery.page}_q${this.currentQuery.searchQuery}`;

    // Render cached materials immediately if valid (SWR Pattern)
    const cached = this.getCachedResult(cacheKey);
    let cacheRendered = false;
    if (cached && cached.materials) {
      this.renderMaterialsGrid(cached.materials, gridContainer);
      this.renderPagination(cached.page, cached.totalPages, cached.totalCount, pagContainer);
      cacheRendered = true;
    }

    try {
      const res = await this.querySupabaseMaterials();
      this.currentQuery.totalCount = res.totalCount;
      this.currentQuery.totalPages = res.totalPages;

      // Update cache
      this.setCachedResult(cacheKey, res.materials, res.totalCount, res.page, res.totalPages);

      // Render live fresh data
      this.renderMaterialsGrid(res.materials, gridContainer);
      this.renderPagination(res.page, res.totalPages, res.totalCount, pagContainer);
    } catch (err) {
      console.error("PracticeHub: Supabase materials fetch error:", err);

      // If cached data was already rendered, keep it without crashing
      if (!cacheRendered) {
        if (gridContainer) {
          gridContainer.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; text-align:center; padding:40px;">
              <i data-lucide="alert-circle" style="width:32px;height:32px;color:var(--gold);margin-bottom:12px;"></i>
              <p style="font-weight:600; color:var(--ink);">Unable to load practice materials</p>
              <p style="font-size:0.85rem; color:var(--muted); margin-top:4px;">Please check your connection and try again.</p>
              <button class="btn-primary btn-sm" style="margin-top:16px;" onclick="window.PracticeHubComponent.executeFetchAndRender()">
                <i data-lucide="rotate-cw"></i> Retry
              </button>
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();
        }
        if (pagContainer) pagContainer.innerHTML = "";
      }
    }
  },

  querySupabaseMaterials: async function () {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) {
      throw new Error("Supabase service not initialized");
    }

    const supabase = await window.SupabaseService.getSupabaseClient();
    if (!supabase) throw new Error("Supabase client unavailable");

    // Scope columns to card requirements ONLY
    let query = supabase
      .from("materials")
      .select("id, title, exam, level, module, material_number, difficulty, estimated_time, active", { count: "exact" })
      .eq("active", true);

    if (this.currentQuery.level) {
      query = query.eq("level", this.currentQuery.level);
    }

    if (this.currentQuery.format) {
      query = query.ilike("exam", this.currentQuery.format);
    }

    // Keep Sprechen out of Practice Hub
    query = query.neq("module", "Sprechen");

    if (this.currentQuery.activeModule && this.currentQuery.activeModule !== "All") {
      query = query.eq("module", this.currentQuery.activeModule);
    }

    if (this.currentQuery.searchQuery && this.currentQuery.searchQuery.trim() !== "") {
      query = query.ilike("title", `%${this.currentQuery.searchQuery.trim()}%`);
    }

    // Pagination: max 10 per page
    const page = this.currentQuery.page;
    const from = (page - 1) * 10;
    const to = from + 9;

    query = query
      .order("material_number", { ascending: true })
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    const totalCount = count !== null && count !== undefined ? count : (data ? data.length : 0);
    const totalPages = Math.max(1, Math.ceil(totalCount / 10));

    return {
      materials: data || [],
      totalCount,
      page,
      totalPages,
    };
  },

  renderMaterialsGrid: function (materials, container) {
    if (!container) return;

    if (!materials || materials.length === 0) {
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding:40px;">
          <i data-lucide="folder-open" style="width:32px;height:32px;color:var(--muted);margin-bottom:12px;"></i>
          <p style="font-weight:600; color:var(--ink);">No practice materials found for module: ${this.currentQuery.activeModule}</p>
          <p style="font-size:0.8rem; color:var(--muted); margin-top:4px;">Target Level: ${this.currentQuery.level} (${this.currentQuery.format})</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const isPaid = this.isPaidMembership(this.currentQuery.membership);

    container.innerHTML = materials.map((mat) => {
      const isSchreiben = mat.module === "Schreiben";
      const isLocked = isSchreiben && !isPaid;
      const isCompleted = this.completedMaterialIds.has(mat.id);

      const timeStr = typeof mat.estimated_time === "number" ? `${mat.estimated_time} mins` : (mat.estimated_time || "15 mins");
      const diffStr = mat.difficulty || "Medium";
      const descStr = `${mat.exam || "Goethe"} ${mat.level} ${mat.module} drill - Material #${mat.material_number || 1}`;

      const moduleBadgeClass = mat.module === "Lesen" ? "badge-sky" : mat.module === "Hören" ? "badge-gold" : mat.module === "Grammatik" ? "badge-emerald" : "badge-rose";
      const diffBadgeClass = diffStr === "Easy" ? "badge-emerald" : diffStr === "Medium" ? "badge-gold" : "badge-rose";

      const actionBtnHtml = isLocked
        ? `<button class="btn-secondary btn-sm" onclick="window.PracticeHubComponent.showWritingLockedModal()" style="opacity:0.85; border-color:var(--rose); color:var(--rose);">
             <i data-lucide="lock"></i> Locked (Pro)
           </button>`
        : `<button class="btn-primary btn-sm" onclick="window.PracticeApp.openPlayer('${mat.id}')">
             <i data-lucide="play"></i> ${isCompleted ? 'Practice Again' : 'Practice'}
           </button>`;

      return `
        <div class="card material-card mat-item-card" data-title="${mat.title.toLowerCase()}">
          <div>
            <div class="mat-card-header">
              <div style="display:flex; gap:6px; align-items:center;">
                <span class="badge-pill ${moduleBadgeClass}">
                  ${mat.module}
                </span>
                ${isCompleted ? `<span class="badge-pill badge-emerald"><i data-lucide="check" style="width:10px;height:10px;display:inline;"></i> Completed</span>` : ''}
              </div>
              <span style="font-size:0.75rem; color:var(--muted);"><i data-lucide="clock" style="width:12px;height:12px;display:inline;"></i> ${timeStr}</span>
            </div>
            <h3 class="mat-card-title">${mat.title}</h3>
            <p class="mat-card-desc">${descStr}</p>
          </div>

          <div class="mat-card-footer">
            <span class="badge-pill ${diffBadgeClass}">
              ${diffStr}
            </span>
            ${actionBtnHtml}
          </div>
        </div>
      `;
    }).join("");

    if (window.lucide) window.lucide.createIcons();
  },

  renderPagination: function (page, totalPages, totalCount, container) {
    if (!container) return;

    if (totalCount <= 10 && totalPages <= 1) {
      container.innerHTML = "";
      return;
    }

    const startItem = (page - 1) * 10 + 1;
    const endItem = Math.min(page * 10, totalCount);

    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; padding:12px 16px; background:var(--white); border:1px solid var(--line); border-radius:var(--radius-md);">
        <span style="font-size:0.82rem; color:var(--muted);">
          Showing <strong>${startItem}–${endItem}</strong> of <strong>${totalCount}</strong> materials
        </span>

        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn-secondary btn-sm" ${page <= 1 ? "disabled style='opacity:0.5;cursor:not-allowed;'" : ""} onclick="window.PracticeHubComponent.goToPage(${page - 1})">
            <i data-lucide="chevron-left"></i> Previous
          </button>
          <span style="font-size:0.85rem; font-weight:600; padding:0 8px;">
            Page ${page} of ${totalPages}
          </span>
          <button class="btn-secondary btn-sm" ${page >= totalPages ? "disabled style='opacity:0.5;cursor:not-allowed;'" : ""} onclick="window.PracticeHubComponent.goToPage(${page + 1})">
            Next <i data-lucide="chevron-right"></i>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  setModuleFilter: function (moduleName) {
    this.currentQuery.activeModule = moduleName;
    this.currentQuery.page = 1;

    const params = new URLSearchParams();
    if (moduleName !== "All") params.set("module", moduleName);
    window.location.hash = `#practice${params.toString() ? "?" + params.toString() : ""}`;
  },

  handleSearchInput: function (value) {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.currentQuery.searchQuery = (value || "").trim();
      this.currentQuery.page = 1;
      this.executeFetchAndRender();
    }, 300);
  },

  goToPage: function (newPage) {
    if (newPage < 1 || newPage > this.currentQuery.totalPages) return;
    this.currentQuery.page = newPage;

    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    params.set("page", newPage);
    if (this.currentQuery.activeModule !== "All") params.set("module", this.currentQuery.activeModule);

    window.history.replaceState(null, "", `#practice?${params.toString()}`);
    this.executeFetchAndRender();
  },

  isPaidMembership: function (membership) {
    if (!membership) return false;
    const m = String(membership).toLowerCase().trim();
    return m !== "free" && m !== "free_learner" && m !== "free member" && m !== "";
  },

  showWritingLockedModal: function () {
    alert("🔒 Writing (Schreiben) drills require a Pro or Paid membership plan. Upgrade your plan to access full writing prompts!");
  },

  getCachedResult: function (key) {
    try {
      const raw = localStorage.getItem("coco_practice_hub_materials_cache");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const item = parsed[key];
      if (!item) return null;
      // 5-minute freshness strategy
      if (Date.now() - item.timestamp > 5 * 60 * 1000) return null;
      return item;
    } catch (e) {
      return null;
    }
  },

  setCachedResult: function (key, materials, totalCount, page, totalPages) {
    try {
      const raw = localStorage.getItem("coco_practice_hub_materials_cache");
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[key] = {
        timestamp: Date.now(),
        materials,
        totalCount,
        page,
        totalPages,
      };
      localStorage.setItem("coco_practice_hub_materials_cache", JSON.stringify(parsed));
    } catch (e) {
      console.warn("PracticeHub: Cache set error:", e);
    }
  },
};
