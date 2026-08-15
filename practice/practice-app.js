/**
 * Coco Germany - Practice & Mock Exam Web Application Controller
 * practice/practice-app.js
 *
 * Profile settings are read from Supabase. Displayed credits are read exclusively
 * from the authenticated /learning/credits/check Worker endpoint.
 */

(function () {
  "use strict";

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
      this.init();
    }

    async init() {
      this.bindUIEvents();
      this.updateHeaderUI();
      await this.loadUserProfile();

      window.addEventListener("hashchange", () => this.handleRoute());
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

      // Modals: Quick Actions (+) & Credits Details
      const actionsModal = document.getElementById("quick-actions-modal");
      const creditsModal = document.getElementById("credits-detail-modal");

      const plusBtn = document.getElementById("bnav-plus-btn");
      const topbarCreditsBtn = document.getElementById("topbar-credits-btn");
      const bnavCreditsBtn = document.getElementById("bnav-credits-btn");

      const actionsClose = document.getElementById("quick-actions-close");
      const creditsClose = document.getElementById("credits-modal-close");

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

    }

    async setLevelAndFormat(level, format) {
      if (level) AppState.currentLevel = level;
      if (format) AppState.currentFormat = format;

      this.saveState();
      this.updateHeaderUI();
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
      const bar = document.getElementById("top-progress-bar");
      if (!bar) return;

      bar.style.opacity = "1";
      bar.style.width = "35%";

      setTimeout(() => {
        bar.style.width = "75%";
      }, 80);

      setTimeout(() => {
        bar.style.width = "100%";
        setTimeout(() => {
          bar.style.opacity = "0";
          setTimeout(() => { bar.style.width = "0%"; }, 200);
        }, 150);
      }, 220);
    }

    handleRoute() {
      const hash = window.location.hash || "#dashboard";
      const mainPath = hash.split("?")[0];
      const searchParams = new URLSearchParams(hash.includes("?") ? hash.split("?")[1] : "");

      const viewport = document.getElementById("app-viewport");
      const titleEl = document.getElementById("topbar-title");

      this.updateNavLinks(mainPath, searchParams);
      this.triggerTopProgressBar();

      if (!viewport) return;

      // Render Skeleton Loader for smooth feedback
      viewport.innerHTML = `
        <div class="view-fade-in">
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px;">
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
        </div>
      `;

      setTimeout(() => {
        switch (mainPath) {
          case "#dashboard":
            if (titleEl) titleEl.textContent = "Dashboard";
            viewport.innerHTML = window.DashboardComponent.render(AppState);
            break;

          case "#mock-exams":
            if (titleEl) titleEl.textContent = "Mock Exams";
            viewport.innerHTML = window.MockExamsComponent.render(AppState);
            break;

          case "#practice":
            if (titleEl) titleEl.textContent = "Practice";
            viewport.innerHTML = window.PracticeHubComponent.render(AppState, searchParams);
            break;

          case "#player":
            if (titleEl) titleEl.textContent = "Interactive Player";
            viewport.innerHTML = window.InteractivePlayerComponent.render(AppState, searchParams);
            break;

          case "#progress":
            if (titleEl) titleEl.textContent = "Learning Progress";
            viewport.innerHTML = window.ProgressTrackerComponent.render(AppState);
            break;

          default:
            if (titleEl) titleEl.textContent = "Dashboard";
            viewport.innerHTML = window.DashboardComponent.render(AppState);
            break;
        }

        if (window.lucide) {
          window.lucide.createIcons();
        }

        window.scrollTo(0, 0);
      }, 100);
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

      const toast = document.createElement("div");
      toast.className = `app-toast toast-${type}`;

      const iconName = type === "warning" ? "alert-triangle" : type === "success" ? "check-circle-2" : type === "error" ? "alert-circle" : "log-in";
      const iconClass = `toast-icon toast-icon-${type}`;

      toast.innerHTML = `
        <span class="${iconClass}">
          <i data-lucide="${iconName}" style="width:16px;height:16px;"></i>
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

    async deductCreditAndPersist() {
      if (AppState.dailyCredits.remaining <= 0) return false;

      AppState.dailyCredits.remaining -= 1;
      this.saveState();
      this.updateHeaderUI();

      if (window.SupabaseService && window.SupabaseService.getSupabaseClient) {
        try {
          const supabase = await window.SupabaseService.getSupabaseClient();
          const uid = AppState.userProfile.uid;
          if (supabase && uid && uid !== "local-user") {
            await supabase.from("learning_users").update({
              credits_remaining: AppState.dailyCredits.remaining,
              updated_at: new Date().toISOString()
            }).eq("uid", uid);
          }
        } catch (e) {
          console.warn("PracticeApp: Supabase credit deduction error:", e);
        }
      }
      return true;
    }

    async startMockExam(mockId) {
      if (!this.requireLogin("Please log in to access this feature.", `#player?id=${mockId}`)) {
        return;
      }

      const ok = await this.deductCreditAndPersist();
      if (!ok) {
        this.showToast("⚡ You're out of daily credits. Upgrade your plan to continue.", "warning", 3500);
        return;
      }

      window.location.hash = `#player?id=${mockId}`;
    }

    async openPlayer(materialId) {
      if (!this.requireLogin("Please log in to access this feature.", `#player?id=${materialId}`)) {
        return;
      }

      const ok = await this.deductCreditAndPersist();
      if (!ok) {
        this.showToast("⚡ You're out of daily credits. Upgrade your plan to continue.", "warning", 3500);
        return;
      }

      window.location.hash = `#player?id=${materialId}`;
    }

    recordTestCompletion(moduleName, accuracyPct) {
      if (AppState.stats[moduleName] !== undefined) {
        AppState.stats[moduleName] = Math.round((AppState.stats[moduleName] + accuracyPct) / 2);
      }
      AppState.stats.totalCompleted += 1;

      AppState.testHistory.unshift({
        date: "Just now",
        test: `${moduleName} Drill (${AppState.currentLevel})`,
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
