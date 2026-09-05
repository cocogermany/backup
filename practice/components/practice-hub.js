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
    activeTeil: "All",
    page: 1,
    searchQuery: "",
    totalCount: 0,
    totalPages: 1,
  },
  searchTimeout: null,
  completedMaterialIds: new Set(),
  _lastAppState: null,

  getCurrentUserUid: function (appState) {
    // Match the UID source used when practice_attempts are recorded.
    if (appState?.userProfile?.uid && appState.userProfile.uid !== "local-user" && appState.userProfile.uid !== "anonymous") {
      return appState.userProfile.uid;
    }
    if (this._lastAppState?.userProfile?.uid && this._lastAppState.userProfile.uid !== "local-user" && this._lastAppState.userProfile.uid !== "anonymous") {
      return this._lastAppState.userProfile.uid;
    }
    if (window.AppState?.userProfile?.uid && window.AppState.userProfile.uid !== "local-user" && window.AppState.userProfile.uid !== "anonymous") {
      return window.AppState.userProfile.uid;
    }
    if (window.PracticeApp?.currentFirebaseUser?.uid && window.PracticeApp.currentFirebaseUser.uid !== "local-user" && window.PracticeApp.currentFirebaseUser.uid !== "anonymous") {
      return window.PracticeApp.currentFirebaseUser.uid;
    }
    const stored = localStorage.getItem("coco_user_uid");
    if (stored && stored !== "local-user" && stored !== "anonymous") {
      return stored;
    }
    return null;
  },

  render: function (appState, queryParams) {
    this._lastAppState = appState || this._lastAppState;
    const activeModule = queryParams ? (queryParams.get("module") || "All") : "All";
    const activeTeil = queryParams ? (queryParams.get("teil") || "All") : (this.currentQuery.activeTeil || "All");
    const displayTeilLabel = (!activeTeil || activeTeil === "All" || activeTeil === "Default") ? "Teil - All" : activeTeil;
    const pageParam = queryParams ? parseInt(queryParams.get("page") || "1", 10) : 1;
    const level = appState ? (appState.currentLevel || "A1") : "A1";
    const format = appState ? (appState.currentFormat || "goethe") : "goethe";
    const membership = appState ? (appState.userProfile?.plan || "FREE") : "FREE";

    this.currentQuery.level = level;
    this.currentQuery.format = format;
    this.currentQuery.membership = membership;
    this.currentQuery.activeModule = activeModule;
    this.currentQuery.activeTeil = activeTeil;
    this.currentQuery.page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;

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

          <div class="filter-search-row">
            <div class="search-box">
              <i data-lucide="search"></i>
              <input type="text" id="practice-search-input" placeholder="Search topic or keyword..." value="${this.currentQuery.searchQuery}" oninput="window.PracticeHubComponent.handleSearchInput(this.value)">
            </div>
            <div class="teil-selector-wrap" id="practice-teil-wrap">
              <button type="button" class="teil-selector-btn" id="practice-teil-btn" onclick="window.PracticeHubComponent.toggleTeilPopover(event)" aria-haspopup="listbox" aria-expanded="false" aria-label="Filter by Teil">
                <span class="teil-btn-label">${displayTeilLabel}</span>
                <i data-lucide="chevron-down" class="teil-btn-chevron"></i>
              </button>
              <select id="practice-teil-select" class="teil-selector-select-hidden" onchange="window.PracticeHubComponent.setTeilFilter(this.value)" aria-hidden="true" tabindex="-1">
                <option value="All" ${activeTeil === "All" || activeTeil === "Default" ? "selected" : ""}>Teil - All</option>
                <option value="Teil 1" ${activeTeil === "Teil 1" ? "selected" : ""}>Teil 1</option>
                <option value="Teil 2" ${activeTeil === "Teil 2" ? "selected" : ""}>Teil 2</option>
                <option value="Teil 3" ${activeTeil === "Teil 3" ? "selected" : ""}>Teil 3</option>
                <option value="Teil 4" ${activeTeil === "Teil 4" ? "selected" : ""}>Teil 4</option>
              </select>
              <div class="teil-popover-card" id="practice-teil-popover" hidden>
                <div class="teil-popover-header">
                  <span class="teil-popover-subtitle">EXAM SECTION / TEIL</span>
                </div>
                <div class="teil-popover-options" role="listbox">
                  ${[
                    { val: "All", label: "Teil - All" },
                    { val: "Teil 1", label: "Teil 1" },
                    { val: "Teil 2", label: "Teil 2" },
                    { val: "Teil 3", label: "Teil 3" },
                    { val: "Teil 4", label: "Teil 4" },
                  ].map(opt => {
                    const isSelected = (activeTeil === opt.val) || (opt.val === "All" && (activeTeil === "All" || activeTeil === "Default"));
                    return `
                      <button type="button" class="teil-opt-item ${isSelected ? 'active' : ''}" data-teil-val="${opt.val}" role="option" aria-selected="${isSelected}" onclick="window.PracticeHubComponent.selectTeilOption('${opt.val}', event)">
                        <span class="teil-opt-label">${opt.label}</span>
                        ${isSelected ? '<i data-lucide="check" class="teil-opt-check"></i>' : ''}
                      </button>
                    `;
                  }).join("")}
                </div>
              </div>
            </div>
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
    this._lastAppState = appState || this._lastAppState;
    const level = appState ? (appState.currentLevel || "A1") : "A1";
    const format = appState ? (appState.currentFormat || "goethe") : "goethe";
    const membership = appState ? (appState.userProfile?.plan || "FREE") : "FREE";

    this.currentQuery.level = level;
    this.currentQuery.format = format;
    this.currentQuery.membership = membership;

    // executeFetchAndRender refreshes completed IDs before querying materials.
    return await this.executeFetchAndRender(appState);
  },

  fetchCompletedMaterialIds: async function (appState) {
    if (appState) this._lastAppState = appState;
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return new Set();
    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return new Set();
      const uid = this.getCurrentUserUid(appState);

      if (uid) {
        const { data, error } = await supabase
          .from("practice_attempts")
          .select("material_id")
          .eq("uid", uid);

        if (error) {
          console.warn("PracticeHub: Error fetching completed attempts:", error);
          return new Set();
        }

        this.completedMaterialIds = new Set(
          (data || [])
            .map(row => String(row?.material_id || "").trim())
            .filter(Boolean)
        );
        return this.completedMaterialIds;
      }
    } catch (e) {
      console.warn("PracticeHub: Completed materials lookup note:", e);
    }
    this.completedMaterialIds = new Set();
    return this.completedMaterialIds;
  },

  executeFetchAndRender: async function (appState) {
    if (appState) this._lastAppState = appState;
    const gridContainer = document.getElementById("materials-grid-container");
    const pagContainer = document.getElementById("practice-pagination-container");

    const uid = this.getCurrentUserUid(appState) || "local-user";
    const cacheKey = `hub_cache_${uid}_${this.currentQuery.level}_${this.currentQuery.format}_${this.currentQuery.activeModule}_t${this.currentQuery.activeTeil}_p${this.currentQuery.page}_q${this.currentQuery.searchQuery}`;

    // Always ensure fresh completed materials list is loaded
    this.completedMaterialIds = await this.fetchCompletedMaterialIds(appState);

    // Render cached materials immediately if valid (SWR Pattern)
    const cached = this.getCachedResult(cacheKey);
    let cacheRendered = false;
    if (cached && Array.isArray(cached.materials)) {
      const filteredCached = cached.materials.filter(
        mat => mat && !this.completedMaterialIds.has(String(mat.id || "").trim())
      );

      // Do not render stale cache if it contained completed materials
      if (filteredCached.length === cached.materials.length) {
        this.loadedMaterials = filteredCached;
        this.renderMaterialsGrid(filteredCached, gridContainer);
        this.renderPagination(cached.page, cached.totalPages, cached.totalCount, pagContainer);
        cacheRendered = true;
      }
    }

    try {
      let res = await this.querySupabaseMaterials();

      if (res.page > res.totalPages && res.totalPages >= 1) {
        this.currentQuery.page = res.totalPages;
        const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
        params.set("page", res.totalPages);
        if (this.currentQuery.activeModule !== "All") params.set("module", this.currentQuery.activeModule);
        if (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
          params.set("teil", this.currentQuery.activeTeil);
        }
        window.history.replaceState(null, "", `#practice?${params.toString()}`);
        res = await this.querySupabaseMaterials();
      }

      this.loadedMaterials = res.materials;
      this.currentQuery.totalCount = res.totalCount;
      this.currentQuery.totalPages = res.totalPages;

      // Update cache
      const resolvedCacheKey = `hub_cache_${uid}_${this.currentQuery.level}_${this.currentQuery.format}_${this.currentQuery.activeModule}_t${this.currentQuery.activeTeil}_p${res.page}_q${this.currentQuery.searchQuery}`;
      this.setCachedResult(resolvedCacheKey, res.materials, res.totalCount, res.page, res.totalPages);

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

    // Scope columns strictly to current materials table schema: id, title, description, exam, level, module, teil, material_number, content_path, difficulty, duration_minutes, active
    let query = supabase
      .from("materials")
      .select("id, title, description, exam, level, module, teil, material_number, content_path, difficulty, duration_minutes, active")
      .eq("active", true);

    if (this.currentQuery.level) {
      query = query.eq("level", this.currentQuery.level);
    }

    if (this.currentQuery.format) {
      const fmtLower = this.currentQuery.format.toLowerCase().trim();
      const fmtUpper = fmtLower.toUpperCase();
      const fmtCap = fmtLower.charAt(0).toUpperCase() + fmtLower.slice(1);
      const formatList = Array.from(new Set([fmtLower, fmtUpper, fmtCap, "both", "Both", "BOTH"]));
      query = query.in("exam", formatList);
    }

    if (this.currentQuery.activeModule && this.currentQuery.activeModule !== "All") {
      const dbModule = this.currentQuery.activeModule === "Grammar" ? "Grammatik" : this.currentQuery.activeModule;
      query = query.eq("module", dbModule);
    }

    if (this.currentQuery.searchQuery && this.currentQuery.searchQuery.trim() !== "") {
      query = query.ilike("title", `%${this.currentQuery.searchQuery.trim()}%`);
    }

    query = query.order("material_number", { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    let allMaterials = data || [];

    // Authoritative client-side filtering by completedMaterialIds
    if (this.completedMaterialIds && this.completedMaterialIds.size > 0) {
      allMaterials = allMaterials.filter(
        mat => mat && !this.completedMaterialIds.has(String(mat.id || "").trim())
      );
    }

    // Apply Teil filter after completed-material filtering
    if (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
      const targetTeil = this.currentQuery.activeTeil.toLowerCase().trim();
      allMaterials = allMaterials.filter(mat => {
        const matTeil = String(mat.teil || "").toLowerCase().trim();
        return matTeil === targetTeil;
      });
    }

    const totalCount = allMaterials.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / 10));
    const page = Math.min(Math.max(1, this.currentQuery.page), totalPages);

    const from = (page - 1) * 10;
    const to = from + 10;
    const paginatedMaterials = allMaterials.slice(from, to);

    return {
      materials: paginatedMaterials,
      totalCount,
      page,
      totalPages,
    };
  },

  renderMaterialsGrid: function (materials, container) {
    if (!container) return;

    // Filter out completed materials as authoritative safeguard immediately before rendering
    let availableMaterials = (materials || []).filter(
      mat => mat && !this.completedMaterialIds.has(String(mat.id || "").trim())
    );

    if (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
      const targetTeil = this.currentQuery.activeTeil.toLowerCase().trim();
      availableMaterials = availableMaterials.filter(mat => {
        const matTeil = String(mat.teil || "").toLowerCase().trim();
        return matTeil === targetTeil;
      });
    }

    if (!availableMaterials || availableMaterials.length === 0) {
      const isCompletedEmpty = this.completedMaterialIds && this.completedMaterialIds.size > 0;
      const teilInfo = (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") ? ` (${this.currentQuery.activeTeil})` : "";
      container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align:center; padding:40px;">
          <i data-lucide="${isCompletedEmpty ? 'check-circle-2' : 'folder-open'}" style="width:32px;height:32px;color:${isCompletedEmpty ? 'var(--emerald)' : 'var(--muted)'};margin-bottom:12px;"></i>
          <p style="font-weight:600; color:var(--ink);">${isCompletedEmpty ? `All practice materials completed for module: ${this.currentQuery.activeModule}${teilInfo}` : `No practice materials found for module: ${this.currentQuery.activeModule}${teilInfo}`}</p>
          <p style="font-size:0.8rem; color:var(--muted); margin-top:4px;">${isCompletedEmpty ? 'Check your scores and history in Learning Progress.' : `Target Level: ${this.currentQuery.level} (${this.currentQuery.format})`}</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = availableMaterials.map((mat) => {
      const durationNum = mat.duration_minutes !== null && mat.duration_minutes !== undefined ? Number(mat.duration_minutes) : NaN;
      const timeStr = (!isNaN(durationNum) && durationNum > 0) ? `${durationNum} mins` : "--";
      const diffStr = mat.difficulty || "Medium";
      const lvlStr = (mat.level || this.currentQuery.level || "A1").toUpperCase();
      const diffText = `${lvlStr} - ${diffStr}`;
      const descText = (mat.description && mat.description.trim()) ? mat.description.trim() : "No description available";

      const displayModule = mat.module === "Grammar" ? "Grammatik" : mat.module;

      const moduleBadgeClass = mat.module === "Lesen" ? "badge-sky"
        : mat.module === "Hören" ? "badge-gold"
        : mat.module === "Grammatik" ? "badge-emerald"
        : mat.module === "Sprechen" ? "badge-sky"
        : "badge-rose";

      const diffBadgeClass = diffStr.toLowerCase() === "easy" ? "diff-easy"
        : diffStr.toLowerCase() === "hard" ? "diff-hard"
        : "diff-medium";

      const safeId = String(mat.id).replace(/'/g, "\\'");

      const teilHtml = (mat.teil && String(mat.teil).trim())
        ? `<span class="badge-pill mat-teil-badge">${String(mat.teil).trim()}</span>`
        : "";

      const isSchreiben = mat.module === "Schreiben" ||
        String(mat.module || "").toLowerCase() === "schreiben" ||
        Boolean(mat.isWriting) ||
        String(mat.id || "").toLowerCase().includes("schreiben");

      const cardClickAction = isSchreiben
        ? `window.location.hash = '#schreiben-player?id=${safeId}';`
        : `window.PracticeApp.openPrepModal('${safeId}');`;

      const actionBtnHtml = isSchreiben
        ? `<a href="#schreiben-player?id=${safeId}" class="btn-primary btn-sm mat-action-btn" onclick="event.stopPropagation(); window.location.hash = '#schreiben-player?id=${safeId}';" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
             <i data-lucide="play"></i> Practice
           </a>`
        : `<button type="button" class="btn-primary btn-sm mat-action-btn" onclick="event.stopPropagation(); window.PracticeApp.openPrepModal('${safeId}')">
             <i data-lucide="play"></i> Practice
           </button>`;

      return `
        <div class="card material-card mat-item-card" style="cursor:pointer;" onclick="${cardClickAction}" data-title="${(mat.title || '').toLowerCase()}">
          <div class="mat-card-header">
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
              <span class="badge-pill mat-module-badge ${moduleBadgeClass}">
                ${displayModule}
              </span>
              ${teilHtml}
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
              ${diffText}
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

    // Update tab styles in DOM immediately
    document.querySelectorAll(".filter-tabs .filter-tab-btn").forEach(btn => {
      const text = btn.textContent.trim();
      if (text === moduleName) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });

    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    if (moduleName !== "All") {
      params.set("module", moduleName);
    } else {
      params.delete("module");
    }
    if (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
      params.set("teil", this.currentQuery.activeTeil);
    } else {
      params.delete("teil");
    }
    params.delete("page");

    const newHash = `#practice${params.toString() ? "?" + params.toString() : ""}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
    this.executeFetchAndRender();
  },

  toggleTeilPopover: function (event) {
    if (event) event.stopPropagation();
    const popover = document.getElementById("practice-teil-popover");
    const btn = document.getElementById("practice-teil-btn");
    if (!popover) return;
    const isHidden = popover.hasAttribute("hidden");
    if (isHidden) {
      popover.removeAttribute("hidden");
      btn?.classList.add("active");
      btn?.setAttribute("aria-expanded", "true");
      if (window.lucide) window.lucide.createIcons();
      this.bindTeilOutsideClick();
    } else {
      this.closeTeilPopover();
    }
  },

  closeTeilPopover: function () {
    const popover = document.getElementById("practice-teil-popover");
    const btn = document.getElementById("practice-teil-btn");
    if (popover && !popover.hasAttribute("hidden")) {
      popover.setAttribute("hidden", "");
      btn?.classList.remove("active");
      btn?.setAttribute("aria-expanded", "false");
    }
    this.unbindTeilOutsideClick();
  },

  bindTeilOutsideClick: function () {
    if (this._onTeilOutsideClick) return;
    this._onTeilOutsideClick = (e) => {
      const wrap = document.getElementById("practice-teil-wrap");
      if (wrap && !wrap.contains(e.target)) {
        this.closeTeilPopover();
      }
    };
    document.addEventListener("click", this._onTeilOutsideClick);
  },

  unbindTeilOutsideClick: function () {
    if (this._onTeilOutsideClick) {
      document.removeEventListener("click", this._onTeilOutsideClick);
      this._onTeilOutsideClick = null;
    }
  },

  selectTeilOption: function (val, event) {
    if (event) event.stopPropagation();
    this.closeTeilPopover();
    this.setTeilFilter(val);
  },

  setTeilFilter: function (teilValue) {
    this.currentQuery.activeTeil = teilValue || "All";
    this.currentQuery.page = 1;

    // Update button text and hidden select
    const btnLabel = document.querySelector("#practice-teil-btn .teil-btn-label");
    const displayLabel = (!this.currentQuery.activeTeil || this.currentQuery.activeTeil === "All" || this.currentQuery.activeTeil === "Default")
      ? "Teil - All"
      : this.currentQuery.activeTeil;
    if (btnLabel) btnLabel.textContent = displayLabel;

    const selectEl = document.getElementById("practice-teil-select");
    if (selectEl) selectEl.value = this.currentQuery.activeTeil;

    // Update active class in popover items
    const popover = document.getElementById("practice-teil-popover");
    if (popover) {
      popover.querySelectorAll(".teil-opt-item").forEach(item => {
        const itemVal = item.getAttribute("data-teil-val");
        const isMatch = (itemVal === this.currentQuery.activeTeil) || (itemVal === "All" && (this.currentQuery.activeTeil === "All" || this.currentQuery.activeTeil === "Default"));
        if (isMatch) {
          item.classList.add("active");
          item.setAttribute("aria-selected", "true");
          if (!item.querySelector(".teil-opt-check")) {
            item.insertAdjacentHTML("beforeend", '<i data-lucide="check" class="teil-opt-check"></i>');
          }
        } else {
          item.classList.remove("active");
          item.setAttribute("aria-selected", "false");
          const check = item.querySelector(".teil-opt-check");
          if (check) check.remove();
        }
      });
      if (window.lucide) window.lucide.createIcons();
    }

    const params = new URLSearchParams(window.location.hash.includes("?") ? window.location.hash.split("?")[1] : "");
    if (this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
      params.set("teil", this.currentQuery.activeTeil);
    } else {
      params.delete("teil");
    }
    if (this.currentQuery.activeModule !== "All") {
      params.set("module", this.currentQuery.activeModule);
    }
    params.delete("page");

    const newHash = `#practice${params.toString() ? "?" + params.toString() : ""}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, "", newHash);
    }
    this.executeFetchAndRender();
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
    if (this.currentQuery.activeTeil && this.currentQuery.activeTeil !== "All" && this.currentQuery.activeTeil !== "Default") {
      params.set("teil", this.currentQuery.activeTeil);
    }

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
