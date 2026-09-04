/**
 * Coco Germany - Practice & Mock Exam Web Application Controller
 * practice/practice-app.js
 *
 * Profile settings are read from Supabase. Displayed credits are read exclusively
 * from the authenticated /learning/credits/check Worker endpoint.
 */

(function () {
  "use strict";

  // Shared Real AppLoader tied to actual async operations
  window.AppLoader = window.AppLoader || {
    activeCount: 0,
    _timer: null,

    getBar: function () {
      return document.getElementById("top-progress-bar");
    },

    start: function () {
      this.activeCount++;
      const bar = this.getBar();
      if (!bar) return;

      if (this.activeCount === 1) {
        if (this._timer) clearInterval(this._timer);
        bar.style.transition = "width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease";
        bar.style.opacity = "1";
        bar.style.width = "30%";

        let current = 30;
        this._timer = setInterval(() => {
          if (current < 85) {
            current += (85 - current) * 0.18;
            if (bar) bar.style.width = `${Math.min(85, Math.round(current))}%`;
          }
        }, 120);
      }
    },

    finish: function () {
      this.activeCount = Math.max(0, this.activeCount - 1);
      if (this.activeCount === 0) {
        if (this._timer) {
          clearInterval(this._timer);
          this._timer = null;
        }
        const bar = this.getBar();
        if (bar) {
          bar.style.transition = "width 0.15s ease-out, opacity 0.25s ease";
          bar.style.width = "100%";
          setTimeout(() => {
            if (this.activeCount === 0) {
              bar.style.opacity = "0";
              setTimeout(() => {
                if (this.activeCount === 0) {
                  bar.style.width = "0%";
                }
              }, 250);
            }
          }, 120);
        }
      }
    },

    track: async function (promiseOrFn) {
      this.start();
      try {
        const promise = typeof promiseOrFn === "function" ? promiseOrFn() : promiseOrFn;
        return await promise;
      } finally {
        this.finish();
      }
    }
  };

  // Shared Cross-Page State & Auto-Refresh Sync
  window.CocoStateSync = window.CocoStateSync || {
    getTarget: function () {
      return {
        level: localStorage.getItem("coco_practice_level") || "A1",
        format: (localStorage.getItem("coco_practice_format") || "goethe").toLowerCase(),
        lastUpdate: localStorage.getItem("coco_last_target_update") || "0",
      };
    },

    notifyTargetChanged: function (level, format) {
      const ts = Date.now().toString();
      const lvl = (level || "A1").toUpperCase().trim();
      const fmt = (format || "goethe").toLowerCase().trim();

      localStorage.setItem("coco_last_target_update", ts);
      localStorage.setItem("coco_practice_level", lvl);
      localStorage.setItem("coco_practice_format", fmt);

      try {
        localStorage.removeItem("coco_practice_hub_materials_cache");
        localStorage.removeItem("coco_dashboard_stats_cache");
        localStorage.removeItem("coco_mock_attempts_cache");
      } catch (e) {}

      window.dispatchEvent(new CustomEvent("coco:target-changed", {
        detail: { level: lvl, format: fmt, timestamp: ts }
      }));
    },

    notifyAttemptCompleted: function (details = {}) {
      const ts = Date.now().toString();
      localStorage.setItem("coco_last_attempt_update", ts);

      try {
        localStorage.removeItem("coco_practice_hub_materials_cache");
        localStorage.removeItem("coco_dashboard_stats_cache");
        localStorage.removeItem("coco_mock_attempts_cache");
      } catch (e) {}

      window.dispatchEvent(new CustomEvent("coco:attempt-completed", {
        detail: { ...details, timestamp: ts }
      }));
    },

    notifyCreditsUpdated: function (credits) {
      const ts = Date.now().toString();
      localStorage.setItem("coco_last_credits_update", ts);
      window.dispatchEvent(new CustomEvent("coco:credits-updated", {
        detail: { credits, timestamp: ts }
      }));
    },

    notifyMaterialsChanged: function () {
      const ts = Date.now().toString();
      localStorage.setItem("coco_last_materials_update", ts);
      try {
        localStorage.removeItem("coco_practice_hub_materials_cache");
      } catch (e) {}
      window.dispatchEvent(new CustomEvent("coco:materials-changed", {
        detail: { timestamp: ts }
      }));
    }
  };

  // Application Global State
  const AppState = {
    currentLevel: localStorage.getItem("coco_practice_level") || "",
    currentFormat: localStorage.getItem("coco_practice_format") || "",
    // Do not render a cached credit balance before the Worker verifies it. Cached
    // values can be stale after a reset or a membership change.
    dailyCredits: {
      remaining: null,
      total: null,
      lastReset: null
    },
    streakDays: parseInt(localStorage.getItem("coco_streak") || "0", 10),
    userProfile: {
      name: "Learner",
      plan: "FREE",
      uid: "local-user"
    },
    stats: JSON.parse(localStorage.getItem("coco_stats")) || {
      Lesen: 0,
      Hören: 0,
      Grammatik: 0,
      Schreiben: 0,
      Sprechen: 0,
      totalCompleted: 0
    },
    testHistory: JSON.parse(localStorage.getItem("coco_history")) || []
  };

  class PracticeApp {
    constructor() {
      window.PracticeApp = this;
      // Firebase is loaded with the modular SDK, which does not create the
      // legacy `window.firebase` global. Keep the signed-in user for Worker
      // calls that require a Firebase ID token.
      this.currentFirebaseUser = null;
      this.init();
    }

    async init() {
      this.bindUIEvents();
      this.bindStateSyncEvents();
      this.updateHeaderUI();
      await this.loadUserProfile();

      window.addEventListener("hashchange", () => this.handleRoute());
    }

    bindStateSyncEvents() {
      window.addEventListener("coco:target-changed", (e) => {
        const { level, format } = e.detail || {};
        let changed = false;
        if (level && AppState.currentLevel !== level) {
          AppState.currentLevel = level;
          changed = true;
        }
        if (format && AppState.currentFormat !== format) {
          AppState.currentFormat = format;
          changed = true;
        }
        if (changed) {
          this.updateHeaderUI();
          this.refreshActiveView();
        }
      });

      window.addEventListener("coco:attempt-completed", () => {
        this.refreshActiveView();
      });

      window.addEventListener("coco:materials-changed", () => {
        this.refreshActiveView();
      });

      window.addEventListener("coco:credits-updated", (e) => {
        if (e.detail?.credits) {
          AppState.dailyCredits = e.detail.credits;
          this.updateHeaderUI();
        }
      });

      window.addEventListener("storage", (e) => {
        if (e.key === "coco_last_target_update" || e.key === "coco_practice_level" || e.key === "coco_practice_format") {
          const target = window.CocoStateSync.getTarget();
          if (target.level !== AppState.currentLevel || target.format !== AppState.currentFormat) {
            AppState.currentLevel = target.level;
            AppState.currentFormat = target.format;
            this.updateHeaderUI();
            this.refreshActiveView();
          }
        } else if (e.key === "coco_last_attempt_update" || e.key === "coco_last_materials_update") {
          this.refreshActiveView();
        }
      });
    }

    refreshActiveView(options = {}) {
      const hash = window.location.hash || "#dashboard";
      const mainPath = hash.split("?")[0];
      if (mainPath === "#player") return; // Keep ongoing drills uninterrupted

      this.handleRoute({ isAutoRefresh: true, ...options });
    }

    hidePageLoader() {
      const loader = document.getElementById("app-page-loader");
      if (loader) {
        loader.classList.add("hidden-loader");
        setTimeout(() => {
          if (loader.parentNode) loader.parentNode.removeChild(loader);
        }, 350);
      }
    }

    async loadUserProfile() {
      const fetchSupabaseProfile = async (uid) => {
        if (!uid) return;
        let retries = 0;
        while ((!window.SupabaseService || typeof window.SupabaseService.getSupabaseClient !== "function") && retries < 25) {
          await new Promise(r => setTimeout(r, 100));
          retries++;
        }
        if (!window.SupabaseService || typeof window.SupabaseService.getSupabaseClient !== "function") return;
        try {
          const supabase = await window.SupabaseService.getSupabaseClient();
          if (supabase) {
            const { data, error } = await supabase
              .from("learning_users")
              .select("uid, membership, current_level, format")
              .eq("uid", uid)
              .maybeSingle();

            if (!error && data) {
              if (data.current_level) {
                AppState.currentLevel = data.current_level;
                localStorage.setItem("coco_practice_level", data.current_level);
              }
              if (data.format) {
                AppState.currentFormat = data.format.toLowerCase();
                localStorage.setItem("coco_practice_format", AppState.currentFormat);
              }
              if (data.membership) AppState.userProfile.plan = data.membership;
              this.updateHeaderUI();
            }
          }
        } catch (err) {
          console.warn("PracticeApp: Supabase learning_users profile error:", err);
        }
      };

      const cachedUid = localStorage.getItem("coco_user_uid");
      if (cachedUid) {
        await fetchSupabaseProfile(cachedUid);
      }

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

        // Wait for Firebase's first auth result before the app renders its pages.
        // This prevents an empty AppState from rendering a permanent "Loading..."
        // target while the signed-in user's database profile is still arriving.
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          let unsubscribe = null;
          unsubscribe = authModule.onAuthStateChanged(auth, async (user) => {
            this.currentFirebaseUser = user || null;
            if (user) {
              AppState.userProfile.uid = user.uid;
              AppState.userProfile.name = user.displayName || user.email?.split("@")[0] || "Learner";
              localStorage.setItem("coco_user_uid", user.uid);

              await this.loadCreditsFromWorker(user);
              await fetchSupabaseProfile(user.uid);
              this.saveState();
              this.updateHeaderUI();
            }

            // Firebase normally invokes this asynchronously, but defer cleanup
            // so the handler is also safe if a cached auth state fires at once.
            Promise.resolve().then(() => {
              if (unsubscribe) unsubscribe();
            });
            finish();
          });
        });
        this.handleRoute();
        this.hidePageLoader();
      } catch (e) {
        console.warn("PracticeApp: Auth init note:", e);
        this.handleRoute();
        this.hidePageLoader();
      }
    }

    async loadCreditsFromWorker(user) {
      // supabase.js is a module and can finish loading after the regular app
      // script. Wait for it instead of silently skipping the only authoritative
      // profile request during that small startup window.
      let retries = 0;
      while ((!window.SupabaseService || typeof window.SupabaseService.checkLearningCredits !== "function") && retries < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries += 1;
      }

      if (!window.SupabaseService || typeof window.SupabaseService.checkLearningCredits !== "function") {
        console.warn("PracticeApp: Credit service did not initialize; leaving credits unloaded.");
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const creditRes = await window.SupabaseService.checkLearningCredits(idToken);
        const remaining = creditRes && creditRes.credits_remaining;
        const total = creditRes && creditRes.daily_practice_credits;

        if (!creditRes || !creditRes.success || !Number.isFinite(remaining) || !Number.isFinite(total)) {
          throw new Error("Credit service returned an invalid balance.");
        }

        AppState.dailyCredits.remaining = remaining;
        AppState.dailyCredits.total = total;
        AppState.dailyCredits.lastReset = creditRes.last_reset || null;
        if (creditRes.membership) AppState.userProfile.plan = creditRes.membership;
        if (creditRes.current_level) {
          AppState.currentLevel = String(creditRes.current_level).toUpperCase();
          localStorage.setItem("coco_practice_level", AppState.currentLevel);
        }
        if (creditRes.format) {
          AppState.currentFormat = String(creditRes.format).toLowerCase();
          localStorage.setItem("coco_practice_format", AppState.currentFormat);
        }
      } catch (err) {
        // Keep the UI in its unloaded state rather than showing a fabricated
        // allowance. A later page load will retry the authenticated request.
        console.warn("PracticeApp: Worker credit check error:", err);
      }
    }

    async getFirebaseIdToken() {
      return this.currentFirebaseUser ? this.currentFirebaseUser.getIdToken() : "";
    }

    saveState() {
      localStorage.setItem("coco_practice_level", AppState.currentLevel);
      localStorage.setItem("coco_practice_format", AppState.currentFormat);
      localStorage.setItem("coco_streak", AppState.streakDays.toString());
      localStorage.setItem("coco_stats", JSON.stringify(AppState.stats));
      localStorage.setItem("coco_history", JSON.stringify(AppState.testHistory));
    }

    bindUIEvents() {
      const sidebar = document.getElementById("app-sidebar");
      const overlay = document.getElementById("sidebar-overlay");
      const mobToggle = document.getElementById("mobile-sidebar-toggle");
      const mobClose = document.getElementById("mobile-sidebar-close");

      // Sidebar Open / Close logic
      const openSidebar = () => {
        if (sidebar) sidebar.classList.add("mobile-open");
        if (overlay) overlay.hidden = false;
      };

      const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove("mobile-open");
        if (overlay) overlay.hidden = true;
      };

      if (mobToggle) mobToggle.addEventListener("click", openSidebar);
      if (mobClose) mobClose.addEventListener("click", closeSidebar);
      if (overlay) overlay.addEventListener("click", closeSidebar);

      // Close sidebar when clicking any navigation link on mobile
      document.querySelectorAll(".app-sidebar a").forEach(link => {
        link.addEventListener("click", () => {
          closeSidebar();
        });
      });

      // Dashboard Group Foldable Toggle
      const dashToggle = document.getElementById("dashboard-toggle-btn");
      const dashGroup = document.getElementById("dashboard-nav-group");
      if (dashToggle && dashGroup) {
        dashToggle.addEventListener("click", (e) => {
          e.stopPropagation();
          dashGroup.classList.toggle("expanded");
        });
      }

      // Topbar Level Popover Events
      const topbarLevelBtn = document.getElementById("topbar-level-btn");
      const topbarPopover = document.getElementById("topbar-level-popover");

      if (topbarLevelBtn) {
        topbarLevelBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (topbarPopover) topbarPopover.hidden = !topbarPopover.hidden;
        });
      }

      document.addEventListener("click", () => {
        if (topbarPopover) topbarPopover.hidden = true;
      });

      if (topbarPopover) {
        topbarPopover.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      }

      // Format Selector Buttons (Goethe / TELC)
      const formatRow = document.getElementById("format-select-group");
      if (formatRow) {
        formatRow.querySelectorAll(".format-opt").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const fmt = btn.getAttribute("data-format");
            if (fmt) {
              this.setLevelAndFormat(AppState.currentLevel, fmt);
            }
          });
        });
      }

      // Modals: Quick Actions (+), Credits Details, and Practice Prep Modal
      const actionsModal = document.getElementById("quick-actions-modal");
      const creditsModal = document.getElementById("credits-detail-modal");
      const prepModal = document.getElementById("practice-prep-modal");

      const plusBtn = document.getElementById("bnav-plus-btn");
      const topbarCreditsBtn = document.getElementById("topbar-credits-btn");
      const bnavCreditsBtn = document.getElementById("bnav-credits-btn");

      const actionsClose = document.getElementById("quick-actions-close");
      const creditsClose = document.getElementById("credits-modal-close");
      const prepClose = document.getElementById("prep-modal-close");
      const prepCancel = document.getElementById("prep-modal-cancel");
      const prepStart = document.getElementById("prep-modal-start");

      if (plusBtn && actionsModal) {
        plusBtn.addEventListener("click", () => actionsModal.hidden = false);
      }

      if (actionsClose && actionsModal) {
        actionsClose.addEventListener("click", () => actionsModal.hidden = true);
      }

      const openCreditsModal = () => {
        this.updateCreditsModalUI();
        if (creditsModal) creditsModal.hidden = false;
      };

      if (topbarCreditsBtn) topbarCreditsBtn.addEventListener("click", openCreditsModal);
      if (bnavCreditsBtn) bnavCreditsBtn.addEventListener("click", openCreditsModal);
      if (creditsClose && creditsModal) {
        creditsClose.addEventListener("click", () => creditsModal.hidden = true);
      }

      if (prepClose) prepClose.addEventListener("click", () => this.closePrepModal());
      if (prepCancel) prepCancel.addEventListener("click", () => this.closePrepModal());

      if (prepStart) {
        prepStart.addEventListener("click", () => {
          const cd = document.getElementById("prep-setting-countdown")?.checked ?? true;
          const sf = document.getElementById("prep-setting-shuffle")?.checked ?? false;
          const ex = document.getElementById("prep-setting-explanations")?.checked ?? true;
          const settings = { countdown: cd, shuffle: sf, showExplanations: ex };
          this.savePrepSettings(settings);
          this.startPracticeFromPrepModal(this.pendingPrepMaterial, settings);
        });
      }

      // Close modals on clicking backdrop background
      if (actionsModal) {
        actionsModal.addEventListener("click", (e) => {
          if (e.target === actionsModal) actionsModal.hidden = true;
        });
      }

      if (creditsModal) {
        creditsModal.addEventListener("click", (e) => {
          if (e.target === creditsModal) creditsModal.hidden = true;
        });
      }

      if (prepModal) {
        prepModal.addEventListener("click", (e) => {
          if (e.target === prepModal) this.closePrepModal();
        });
      }
    }

    async setLevelAndFormat(level, format) {
      if (level) AppState.currentLevel = level;
      if (format) AppState.currentFormat = format;

      this.saveState();
      this.updateHeaderUI();
      if (window.CocoStateSync) {
        window.CocoStateSync.notifyTargetChanged(AppState.currentLevel, AppState.currentFormat);
      }
      this.handleRoute();

      // Async sync to Supabase learning_users table
      if (window.SupabaseService && window.SupabaseService.getSupabaseClient) {
        try {
          const supabase = await window.SupabaseService.getSupabaseClient();
          const uid = AppState.userProfile.uid;
          if (supabase && uid && uid !== "local-user") {
            const todayStr = new Date().toISOString().split("T")[0];
              await supabase.from("learning_users").update({
                uid: uid,
                current_level: AppState.currentLevel,
                format: AppState.currentFormat.toLowerCase(),
                updated_at: new Date().toISOString()
              }).eq("uid", uid);
          }
        } catch (e) {
          console.warn("PracticeApp: Supabase learning_users upsert warning:", e);
        }
      }
    }

    setLevel(level) {
      this.setLevelAndFormat(level, AppState.currentFormat);
    }

    updateCreditsModalUI() {
      const credits = AppState.dailyCredits;
      const bigCount = document.getElementById("modal-credits-big");
      const fillBar = document.getElementById("modal-credits-fill");
      const userPlan = document.getElementById("modal-user-plan");

      if (bigCount) {
        if (credits.remaining === null || credits.remaining === undefined) {
          bigCount.textContent = "-- / --";
        } else {
          bigCount.textContent = `${credits.remaining} / ${credits.total || credits.remaining}`;
        }
      }
      if (userPlan) userPlan.textContent = AppState.userProfile.plan || "FREE";
      if (fillBar) {
        if (credits.remaining === null || !credits.total) {
          fillBar.style.width = "0%";
        } else {
          const pct = Math.round((credits.remaining / (credits.total || 1)) * 100);
          fillBar.style.width = `${pct}%`;
        }
      }
    }

    updateHeaderUI() {
      const level = AppState.currentLevel;
      const format = AppState.currentFormat;
      const credits = AppState.dailyCredits;
      const displayFormatLevel = format && level ? `${format} ${level}` : (format || level ? `${format || ''} ${level || ''}`.trim() : "Loading...");

      // Sidebar UI
      const badge = document.getElementById("current-level-badge");
      const name = document.getElementById("current-level-name");
      const creditsCount = document.getElementById("sidebar-credits-count");
      const creditsFill = document.getElementById("sidebar-credits-fill");
      const userName = document.getElementById("sidebar-user-name");
      const userPlan = document.getElementById("sidebar-user-plan");

      if (badge) badge.textContent = level || "--";
      if (name) name.textContent = displayFormatLevel;
      if (creditsCount) {
        if (credits.remaining === null || credits.remaining === undefined) {
          creditsCount.textContent = "-- / --";
        } else {
          creditsCount.textContent = `${credits.remaining} / ${credits.total || credits.remaining}`;
        }
      }
      if (userName) userName.textContent = AppState.userProfile.name;
      if (userPlan) userPlan.textContent = AppState.userProfile.plan;

      if (creditsFill) {
        if (credits.remaining === null || !credits.total) {
          creditsFill.style.width = "0%";
        } else {
          const pct = Math.round((credits.remaining / (credits.total || 1)) * 100);
          creditsFill.style.width = `${pct}%`;
        }
      }

      // Topbar UI
      const streakEl = document.getElementById("topbar-streak-count");
      const levelTextEl = document.getElementById("topbar-level-text");
      const creditsTextEl = document.getElementById("topbar-credits-text");

      if (streakEl) streakEl.textContent = `${AppState.streakDays} Day Streak`;
      if (levelTextEl) levelTextEl.textContent = displayFormatLevel;
      if (creditsTextEl) {
        if (credits.remaining === null || credits.remaining === undefined) {
          creditsTextEl.textContent = "-- Credits";
        } else {
          creditsTextEl.textContent = `${credits.remaining} Credits`;
        }
      }

      // Update Topbar Popover UI elements
      const popoverBadge = document.getElementById("popover-level-badge");
      const popoverTargetName = document.getElementById("popover-target-name");
      const popoverFormatVal = document.getElementById("popover-format-val");
      const popoverLevelVal = document.getElementById("popover-level-val");

      if (popoverBadge) popoverBadge.textContent = level || "--";
      if (popoverTargetName) popoverTargetName.textContent = displayFormatLevel;
      if (popoverFormatVal) popoverFormatVal.textContent = format || "--";
      if (popoverLevelVal) popoverLevelVal.textContent = level || "--";

      // Update level popover active class
      const menu = document.getElementById("level-menu-dropdown");
      if (menu) {
        menu.querySelectorAll(".level-opt").forEach(btn => {
          if (btn.getAttribute("data-level") === level) {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });
      }

      // Update format selector active class
      const formatRow = document.getElementById("format-select-group");
      const normalizedFormat = String(format || "").toLowerCase();
      if (formatRow) {
        formatRow.querySelectorAll(".format-opt").forEach(btn => {
          const btnFmt = btn.getAttribute("data-format");
          if (btnFmt && normalizedFormat && btnFmt.toLowerCase() === normalizedFormat) {
            btn.classList.add("active");
          } else {
            btn.classList.remove("active");
          }
        });
      }
    }

    triggerTopProgressBar() {
      if (window.AppLoader) {
        window.AppLoader.start();
        setTimeout(() => window.AppLoader.finish(), 250);
      }
    }

    handleRoute(options = {}) {
      const hash = window.location.hash || "#dashboard";
      const mainPath = hash.split("?")[0];
      const searchParams = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "");

      const isExamMode = mainPath === "#player";
      if (isExamMode) {
        document.body.classList.add("exam-mode");
      } else {
        document.body.classList.remove("exam-mode");
      }

      const viewport = document.getElementById("app-viewport");
      const titleEl = document.getElementById("topbar-title");

      this.updateNavLinks(mainPath, searchParams);

      if (!viewport) return;

      if (window.AppLoader) {
        window.AppLoader.start();
      }

      let initPromise = null;

      switch (mainPath) {
        case "#dashboard":
          if (titleEl) titleEl.textContent = "Dashboard";
          viewport.innerHTML = window.DashboardComponent.render(AppState);
          initPromise = window.DashboardComponent._initPromise = window.DashboardComponent.initDashboardData(AppState);
          break;

        case "#mock-exams":
          if (titleEl) titleEl.textContent = "Mock Exams";
          viewport.innerHTML = window.MockExamsComponent.render(AppState);
          initPromise = window.MockExamsComponent._initPromise = window.MockExamsComponent.initMockData(AppState);
          break;

        case "#practice":
          if (titleEl) titleEl.textContent = "Practice";
          viewport.innerHTML = window.PracticeHubComponent.render(AppState, searchParams);
          initPromise = window.PracticeHubComponent._initPromise = window.PracticeHubComponent.initHubData(AppState);
          break;

        case "#player":
          if (titleEl) titleEl.textContent = "Interactive Player";
          viewport.innerHTML = window.InteractivePlayerComponent.render(AppState, searchParams);
          initPromise = window.InteractivePlayerComponent._initPromise = window.InteractivePlayerComponent.initPlayerMaterial(
            searchParams ? searchParams.get("id") : null,
            AppState
          );
          break;

        case "#progress":
          if (titleEl) titleEl.textContent = "Learning Progress";
          viewport.innerHTML = window.ProgressTrackerComponent.render(AppState);
          initPromise = window.ProgressTrackerComponent._initPromise = window.ProgressTrackerComponent.initProgressData(AppState);
          break;

        default:
          if (titleEl) titleEl.textContent = "Dashboard";
          viewport.innerHTML = window.DashboardComponent.render(AppState);
          initPromise = window.DashboardComponent._initPromise = window.DashboardComponent.initDashboardData(AppState);
          break;
      }

      if (window.lucide) {
        window.lucide.createIcons();
      }

      if (!options.isAutoRefresh) {
        window.scrollTo(0, 0);
      }

      if (initPromise && typeof initPromise.then === "function") {
        initPromise.finally(() => {
          if (window.AppLoader) window.AppLoader.finish();
        });
      } else {
        if (window.AppLoader) window.AppLoader.finish();
      }
    }

    updateNavLinks(mainPath, searchParams) {
      const activeModule = searchParams ? searchParams.get("module") : null;
      const dashGroup = document.getElementById("dashboard-nav-group");

      if (mainPath === "#dashboard" || activeModule) {
        if (dashGroup) dashGroup.classList.add("expanded");
      }

      document.querySelectorAll(".sidebar-nav .nav-item").forEach(link => {
        const href = link.getAttribute("href");
        if (href === mainPath && !activeModule) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });

      document.querySelectorAll(".sidebar-nav .nav-subitem").forEach(link => {
        if (activeModule && link.getAttribute("data-module") === activeModule) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });

      document.querySelectorAll(".mobile-bottom-nav .bnav-item").forEach(link => {
        if (link.getAttribute("href") === mainPath) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });
    }

    showToast(message, type = "info", duration = 3200) {
      let backdrop = document.getElementById("app-toast-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.id = "app-toast-backdrop";
        backdrop.className = "app-toast-backdrop";
        document.body.appendChild(backdrop);
      }
      requestAnimationFrame(() => {
        if (backdrop) backdrop.classList.add("backdrop-visible");
      });

      let container = document.getElementById("app-toast-container");
      if (!container) {
        container = document.createElement("div");
        container.id = "app-toast-container";
        container.className = "app-toast-container";
        document.body.appendChild(container);
      }

      // Context-aware attractive icon and badge variant selection
      let iconName = "sparkles";
      const msgLower = (message || "").toLowerCase();
      let badgeType = type;

      if (msgLower.includes("credit") || msgLower.includes("⚡")) {
        iconName = "zap";
        badgeType = "warning";
      } else if (msgLower.includes("pro") || msgLower.includes("writing") || msgLower.includes("schreiben")) {
        iconName = "crown";
        badgeType = "pro";
      } else if (msgLower.includes("log in") || msgLower.includes("login")) {
        iconName = "sparkles";
        badgeType = "info";
      } else if (type === "warning") {
        iconName = "alert-circle";
      } else if (type === "success") {
        iconName = "check";
      } else if (type === "error") {
        iconName = "alert-triangle";
      }

      const toast = document.createElement("div");
      toast.className = `app-toast toast-${badgeType}`;

      toast.innerHTML = `
        <span class="toast-icon toast-icon-${badgeType}">
          <i data-lucide="${iconName}" style="width:18px;height:18px;"></i>
        </span>
        <span class="toast-message">${message}</span>
      `;

      container.appendChild(toast);
      if (window.lucide) window.lucide.createIcons();

      const removeToast = () => {
        if (!toast.parentNode) return;
        toast.classList.add("toast-hiding");

        const remaining = container.querySelectorAll(".app-toast:not(.toast-hiding)");
        if (remaining.length === 0 && backdrop) {
          backdrop.classList.remove("backdrop-visible");
        }

        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
          if (container.querySelectorAll(".app-toast").length === 0) {
            if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          }
        }, 250);
      };

      backdrop.onclick = () => removeToast();
      setTimeout(removeToast, duration);
      return toast;
    }

    isLoggedIn() {
      const uid = AppState.userProfile && AppState.userProfile.uid;
      const cachedUid = localStorage.getItem("coco_user_uid");
      if (uid && uid !== "local-user" && uid !== "anonymous") return true;
      if (cachedUid && cachedUid !== "local-user" && cachedUid !== "anonymous") return true;
      return false;
    }

    requireLogin(featureMessage, returnTarget) {
      if (!this.isLoggedIn()) {
        const returnUrl = returnTarget
          ? (returnTarget.startsWith("http") ? returnTarget : `${window.location.origin}${window.location.pathname}${returnTarget.startsWith("#") ? returnTarget : "#" + returnTarget}`)
          : window.location.href;
        localStorage.setItem("loginRedirect", returnUrl);
        this.showToast(featureMessage || "Please log in to access this feature.", "info", 2500);
        setTimeout(() => {
          window.location.href = "../index.html#/login";
        }, 750);
        return false;
      }
      return true;
    }

    requireLoginAndNavigate(targetHash, featureName) {
      if (!this.isLoggedIn()) {
        const returnUrl = targetHash
          ? `${window.location.origin}${window.location.pathname}${targetHash.startsWith("#") ? targetHash : "#" + targetHash}`
          : window.location.href;
        localStorage.setItem("loginRedirect", returnUrl);
        this.showToast("Please log in to access this feature.", "info", 2500);
        setTimeout(() => {
          window.location.href = "../index.html#/login";
        }, 750);
        return false;
      }
      if (targetHash) {
        window.location.hash = targetHash.startsWith("#") ? targetHash : "#" + targetHash;
      }
      return true;
    }

    handleUpgradePlan(event) {
      if (event) event.preventDefault();
      if (!this.isLoggedIn()) {
        localStorage.setItem("loginRedirect", window.location.href);
        this.showToast("Please log in first to upgrade your plan.", "info", 2500);
        setTimeout(() => {
          window.location.href = "../index.html#/login";
        }, 750);
        return false;
      }
      window.location.href = "../index.html#/membership";
      return true;
    }

    getPrepSettings() {
      try {
        const raw = localStorage.getItem("coco_practice_prep_settings");
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return {
        countdown: true,
        shuffle: false,
        showExplanations: true
      };
    }

    savePrepSettings(settings) {
      try {
        localStorage.setItem("coco_practice_prep_settings", JSON.stringify(settings));
      } catch (e) {}
    }

    openPrepModal(materialId) {
      if (!this.requireLogin("Please log in to access this feature.", "#practice")) {
        return;
      }

      // Retrieve material data already loaded by Practice Hub without fetching DB again
      let material = null;
      if (window.PracticeHubComponent && window.PracticeHubComponent.loadedMaterials) {
        material = window.PracticeHubComponent.loadedMaterials.find(m => m && String(m.id) === String(materialId));
      }
      if (!material) {
        material = { id: materialId, title: `Practice Set (${materialId})` };
      }

      this.pendingPrepMaterial = material;

      const titleEl = document.getElementById("prep-material-title");
      if (titleEl) titleEl.textContent = material.title || material.id;

      const settings = this.getPrepSettings();
      const cdInput = document.getElementById("prep-setting-countdown");
      const sfInput = document.getElementById("prep-setting-shuffle");
      const exInput = document.getElementById("prep-setting-explanations");

      if (cdInput) cdInput.checked = settings.countdown !== false;
      if (sfInput) sfInput.checked = Boolean(settings.shuffle);
      if (exInput) exInput.checked = settings.showExplanations !== false;

      const prepModal = document.getElementById("practice-prep-modal");
      if (prepModal) {
        prepModal.hidden = false;
        if (window.lucide) window.lucide.createIcons();
      }
    }

    closePrepModal() {
      const prepModal = document.getElementById("practice-prep-modal");
      if (prepModal) prepModal.hidden = true;
      this.pendingPrepMaterial = null;
    }

    async startPracticeFromPrepModal(material, settings) {
      if (!material) return;

      const startBtn = document.getElementById("prep-modal-start");
      const originalText = startBtn ? startBtn.innerHTML : '<i data-lucide="play"></i> Start Practice';
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = `<span class="btn-spinner"></span> Starting...`;
      }

      const isSchreiben = Boolean(material && (
        material.module === "Schreiben" ||
        material.isWriting ||
        String(material.id || "").toLowerCase().includes("schreiben") ||
        String(material.title || "").toLowerCase().includes("schreiben")
      ));

      // SCHREIBEN SPECIFIC FLOW: Check weekly credits via Worker (do NOT deduct daily credits)
      if (isSchreiben) {
        let checkOk = false;
        let checkRes = null;

        try {
          const idToken = await this.getFirebaseIdToken();
          if (window.SupabaseService && window.SupabaseService.checkSchreibenCreditsWorker) {
            checkRes = await window.SupabaseService.checkSchreibenCreditsWorker(idToken);
            if (checkRes && checkRes.success && checkRes.schreiben_enabled && checkRes.schreiben_credits_remaining > 0) {
              checkOk = true;
            }
          }
        } catch (err) {
          console.warn("PracticeApp: Schreiben credit check error:", err);
        }

        if (startBtn) {
          startBtn.disabled = false;
          startBtn.innerHTML = originalText;
        }

        if (!checkOk) {
          this.closePrepModal();
          if (checkRes && checkRes.schreiben_enabled === false) {
            this.showToast("⭐ Schreiben tasks require a PRO plan. Upgrade to access writing evaluations.", "warning", 4000);
            const creditsModal = document.getElementById("credits-detail-modal");
            this.updateCreditsModalUI();
            if (creditsModal) creditsModal.hidden = false;
          } else {
            this.showToast("⚡ You have used all your weekly Schreiben credits. Quota resets next week.", "warning", 4000);
          }
          return;
        }

        // Allowed: Open player without consuming weekly or daily credit
        this.closePrepModal();

        if (window.InteractivePlayerComponent) {
          window.InteractivePlayerComponent.preloadedMaterial = material;
          window.InteractivePlayerComponent.currentSettings = settings;
        }

        window.location.hash = `#player?id=${material.id}`;
        return;
      }

      // Call secure Worker endpoint to atomically deduct 1 credit (Lesen, Hören, Grammatik)
      let deductOk = false;
      let newRemaining = null;

      try {
        const idToken = await this.getFirebaseIdToken();

        if (window.SupabaseService && window.SupabaseService.consumeCreditWorker) {
          const res = await window.SupabaseService.consumeCreditWorker(idToken);
          if (res && res.success) {
            deductOk = true;
            newRemaining = typeof res.credits_remaining === "number" ? res.credits_remaining : null;
          }
        }
      } catch (err) {
        console.warn("PracticeApp: Credit consumption error:", err);
      }

      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = originalText;
      }

      if (!deductOk) {
        // Insufficient credits: do not start practice; open Credits UI
        this.closePrepModal();
        this.showToast("⚡ You're out of daily credits. Upgrade your plan to continue.", "warning", 3500);
        const creditsModal = document.getElementById("credits-detail-modal");
        this.updateCreditsModalUI();
        if (creditsModal) creditsModal.hidden = false;
        return;
      }

      // If deduction succeeded, update local state with authoritative server credits
      if (newRemaining !== null) {
        AppState.dailyCredits.remaining = newRemaining;
      } else {
        AppState.dailyCredits.remaining = Math.max(0, AppState.dailyCredits.remaining - 1);
      }
      this.saveState();
      this.updateHeaderUI();

      // Close prep modal and pass preloaded material & preferences into Interactive Player
      this.closePrepModal();

      if (window.InteractivePlayerComponent) {
        window.InteractivePlayerComponent.preloadedMaterial = material;
        window.InteractivePlayerComponent.currentSettings = settings;
      }

      // Immediately open player without another credit check or DB fetch
      window.location.hash = `#player?id=${material.id}`;
    }

    async startMockExam(mockId) {
      if (!this.requireLogin("Please log in to access this feature.", `#player?id=${mockId}`)) {
        return;
      }

      let deductOk = false;
      let newRemaining = null;
      try {
        const idToken = await this.getFirebaseIdToken();
        if (window.SupabaseService && window.SupabaseService.consumeCreditWorker) {
          const res = await window.SupabaseService.consumeCreditWorker(idToken);
          if (res && res.success) {
            deductOk = true;
            newRemaining = typeof res.credits_remaining === "number" ? res.credits_remaining : null;
          }
        }
      } catch (e) {
        console.warn("PracticeApp: Mock exam credit deduction error:", e);
      }

      if (!deductOk) {
        this.showToast("⚡ You're out of daily credits. Upgrade your plan to continue.", "warning", 3500);
        const creditsModal = document.getElementById("credits-detail-modal");
        this.updateCreditsModalUI();
        if (creditsModal) creditsModal.hidden = false;
        return;
      }

      if (newRemaining !== null) {
        AppState.dailyCredits.remaining = newRemaining;
        this.saveState();
        this.updateHeaderUI();
      }

      window.location.hash = `#player?id=${mockId}`;
    }

    async openPlayer(materialId) {
      this.openPrepModal(materialId);
    }

    recordTestCompletion(moduleName, accuracyPct) {
      const normalizedModule = moduleName === "Grammar" ? "Grammatik" : moduleName;
      if (AppState.stats[normalizedModule] !== undefined) {
        AppState.stats[normalizedModule] = Math.round((AppState.stats[normalizedModule] + accuracyPct) / 2);
      }
      AppState.stats.totalCompleted += 1;

      AppState.testHistory.unshift({
        date: "Just now",
        test: `${normalizedModule} Drill (${AppState.currentLevel})`,
        score: `${accuracyPct}%`,
        pct: accuracyPct,
        status: accuracyPct >= 60 ? "Passed" : "Review"
      });

      this.saveState();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.PracticeApp = new PracticeApp();
  });

})();
