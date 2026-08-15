/**
 * Coco Germany Practice App - Practice Hub Component
 * components/practice-hub.js
 *
 * Connected directly to Supabase materials & learning_users database.
 */

window.PracticeHubComponent = {
  currentQuery: {
    level: "A1",
    format: "goethe",
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
        <!-- Filter Bar & Search -->
        <div class="filter-bar">
          <div class="filter-tabs" role="tablist" aria-label="Skill filters">
            <button type="button" class="filter-tab-btn ${activeModule === "All" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('All')">
              All
            </button>
            <button type="button" class="filter-tab-btn ${activeModule === "Lesen" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Lesen')">
              Lesen
            </button>
            <button type="button" class="filter-tab-btn ${activeModule === "Hören" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Hören')">
              Hören
            </button>
            <button type="button" class="filter-tab-btn ${activeModule === "Grammatik" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Grammatik')">
              Grammatik
            </button>
            <button type="button" class="filter-tab-btn ${activeModule === "Schreiben" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Schreiben')">
              Schreiben
            </button>
            <button type="button" class="filter-tab-btn ${activeModule === "Sprechen" ? "active" : ""}" onclick="window.PracticeHubComponent.setModuleFilter('Sprechen')">
              Sprechen
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
    const level = appState ? (appState.currentLevel || "A1") : "A1";
    const format = appState ? (appState.currentFormat || "goethe") : "goethe";
    const membership = appState ? (appState.userProfile?.plan || "FREE") : "FREE";

    this.currentQuery.level = level;
    this.currentQuery.format = format;
    this.currentQuery.membership = membership;

    // Fetch completed materials list for status badges
    this.completedMaterialIds = await this.fetchCompletedMaterialIds();

    // Execute fetch & render
    await this.executeFetchAndRender();
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
      this.loadedMaterials = cached.materials;
      this.renderMaterialsGrid(cached.materials, gridContainer);
      this.renderPagination(cached.page, cached.totalPages, cached.totalCount, pagContainer);
      cacheRendered = true;
    }

    try {
      const res = await this.querySupabaseMaterials();
      this.loadedMaterials = res.materials;
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

    // Scope columns strictly to current materials table schema: id, title, description, exam, level, module, material_number, content_path, difficulty, duration_minutes, active
    let query = supabase
      .from("materials")
      .select("id, title, description, exam, level, module, material_number, content_path, difficulty, duration_minutes, active", { count: "exact" })
      .eq("active", true);

    if (this.currentQuery.level) {
      query = query.eq("level", this.currentQuery.level);
    }

    if (this.currentQuery.format) {
      query = query.in("exam", [this.currentQuery.format.toLowerCase(), "both"]);
    }

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

      const durationNum = mat.duration_minutes !== null && mat.duration_minutes !== undefined ? Number(mat.duration_minutes) : NaN;
      const timeStr = (!isNaN(durationNum) && durationNum > 0) ? `${durationNum} mins` : "--";
      const diffStr = mat.difficulty || "Medium";
      const descText = (mat.description && mat.description.trim()) ? mat.description.trim() : "No description available";

      const moduleBadgeClass = mat.module === "Lesen" ? "badge-sky"
        : mat.module === "Hören" ? "badge-gold"
        : mat.module === "Grammatik" ? "badge-emerald"
        : mat.module === "Sprechen" ? "badge-sky"
        : "badge-rose";

      const diffBadgeClass = diffStr.toLowerCase() === "easy" ? "diff-easy"
        : diffStr.toLowerCase() === "hard" ? "diff-hard"
        : "diff-medium";

      const actionBtnHtml = isLocked
        ? `<button type="button" class="btn-secondary btn-sm mat-action-btn" onclick="window.PracticeHubComponent.showWritingLockedModal()">
             <i data-lucide="lock"></i> Locked (Pro)
           </button>`
        : `<button type="button" class="btn-primary btn-sm mat-action-btn" onclick="window.PracticeApp.openPrepModal('${mat.id}')">
             <i data-lucide="play"></i> ${isCompleted ? 'Practice Again' : 'Practice'}
           </button>`;

      return `
        <div class="card material-card mat-item-card" data-title="${(mat.title || '').toLowerCase()}">
          <div class="mat-card-header">
            <div style="display:flex; gap:6px; align-items:center;">
              <span class="badge-pill ${moduleBadgeClass}">
                ${mat.module}
              </span>
              ${isCompleted ? `<span class="badge-pill badge-emerald"><i data-lucide="check" style="width:10px;height:10px;display:inline;"></i> Completed</span>` : ''}
            </div>
            <span class="mat-duration">
              <i data-lucide="clock"></i>
              ${timeStr}
            </span>
          </div>

          <div class="mat-card-body">
            <h3 class="mat-card-title">${mat.title}</h3>
            <p class="mat-card-desc">${descText}</p>
          </div>

          <div class="mat-card-footer">
            <span class="badge-pill diff-badge ${diffBadgeClass}">
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
    if (window.PracticeApp && !window.PracticeApp.isLoggedIn()) {
      window.PracticeApp.requireLogin("Please log in to access this feature.", window.location.href);
      return;
    }
    if (window.PracticeApp && typeof window.PracticeApp.showToast === "function") {
      window.PracticeApp.showToast("🔒 Writing (Schreiben) drills require a Pro plan. Upgrade to access full prompts!", "warning", 3500);
    }
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
