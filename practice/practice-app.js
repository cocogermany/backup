/**
 * Coco Germany - Practice & Mock Exam Web Application Controller
 * practice/practice-app.js
 *
 * Bound to Supabase learning_users table (uid, membership, current_level, daily_credits, credits_remaining, last_reset, format, updated_at).
 */

(function () {
  "use strict";

  // Application Global State
  const AppState = {
    currentLevel: localStorage.getItem("coco_practice_level") || "A1",
    currentFormat: localStorage.getItem("coco_practice_format") || "Goethe",
    dailyCredits: JSON.parse(localStorage.getItem("coco_daily_credits")) || {
      remaining: null,
      total: null,
      lastReset: new Date().toISOString().split("T")[0]
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
      this.init();
    }

    init() {
      this.checkCreditsReset();
      this.bindUIEvents();
      this.updateHeaderUI();
      this.handleRoute();
      this.loadUserProfile();

      // Fallback timer: guarantee page loader disappears even if network takes > 2.5s
      setTimeout(() => {
        this.hidePageLoader();
      }, 2500);

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

        authModule.onAuthStateChanged(auth, async (user) => {
          if (user) {
            AppState.userProfile.uid = user.uid;
            AppState.userProfile.name = user.displayName || user.email?.split("@")[0] || "Learner";
            localStorage.setItem("coco_user_uid", user.uid);

            if (window.SupabaseService && window.SupabaseService.getSupabaseClient) {
              try {
                const supabase = await window.SupabaseService.getSupabaseClient();
                if (supabase) {
                  const todayStr = new Date().toISOString().split("T")[0];

                  const { data, error } = await supabase
                    .from("learning_users")
                    .select("uid, membership, current_level, credits_remaining, last_reset, format")
                    .eq("uid", user.uid)
                    .maybeSingle();

                  if (!error && data) {
                    if (data.current_level) AppState.currentLevel = data.current_level;
                    if (data.format) AppState.currentFormat = data.format.toLowerCase() === "telc" ? "TELC" : "Goethe";
                    if (data.membership) AppState.userProfile.plan = data.membership;
                    
                    // Authoritative allowance from plans table
                    const membershipCode = (data.membership || "FREE").toUpperCase();
                    const { data: planData } = await supabase.from("plans").select("daily_practice_credits").eq("code", membershipCode).maybeSingle();
                    const dailyTotal = planData && typeof planData.daily_practice_credits === "number" ? planData.daily_practice_credits : 2;
                    AppState.dailyCredits.total = dailyTotal;

                    // Daily Reset Check using DB last_reset date
                    if (data.last_reset && data.last_reset !== todayStr) {
                      AppState.dailyCredits.remaining = dailyTotal;
                      await supabase.from("learning_users").update({
                        credits_remaining: dailyTotal,
                        last_reset: todayStr,
                        updated_at: new Date().toISOString()
                      }).eq("uid", user.uid);
                    } else if (typeof data.credits_remaining === "number") {
                      AppState.dailyCredits.remaining = data.credits_remaining;
                    }
                  } else if (!data) {
                    // Create new learning_users record adhering strictly to schema without daily_credits
                    const newRecord = {
                      uid: user.uid,
                      membership: "FREE",
                      current_level: AppState.currentLevel || "A1",
                      credits_remaining: 2,
                      last_reset: todayStr,
                      format: (AppState.currentFormat || "Goethe").toLowerCase(),
                      created_at: new Date().toISOString(),
                      updated_at: new Date().toISOString()
                    };
                    await supabase.from("learning_users").insert([newRecord]);
                    AppState.dailyCredits.remaining = 2;
                    AppState.dailyCredits.total = 2;
                  }
                }
              } catch (err) {
                console.warn("PracticeApp: Supabase learning_users profile error:", err);
              }
            }
            this.saveState();
            this.updateHeaderUI();
            this.handleRoute();
            this.hidePageLoader();
          }
        });
      } catch (e) {
        console.warn("PracticeApp: Auth init note:", e);
      }
    }

    checkCreditsReset() {
      const todayStr = new Date().toISOString().split("T")[0];
      if (AppState.dailyCredits.lastReset !== todayStr) {
        AppState.dailyCredits.remaining = AppState.dailyCredits.total || 2;
        AppState.dailyCredits.lastReset = todayStr;
        this.saveState();
      }
    }

    saveState() {
      localStorage.setItem("coco_practice_level", AppState.currentLevel);
      localStorage.setItem("coco_practice_format", AppState.currentFormat);
      localStorage.setItem("coco_daily_credits", JSON.stringify(AppState.dailyCredits));
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

      // Level Dropdown Events
      const pill = document.getElementById("level-select-pill");
      const menu = document.getElementById("level-menu-dropdown");
      const topbarLevelBtn = document.getElementById("topbar-level-btn");

      const toggleLevelMenu = (e) => {
        e.stopPropagation();
        if (menu) menu.hidden = !menu.hidden;
      };

      if (pill) pill.addEventListener("click", toggleLevelMenu);
      if (topbarLevelBtn) topbarLevelBtn.addEventListener("click", toggleLevelMenu);

      document.addEventListener("click", () => {
        if (menu) menu.hidden = true;
      });

      if (menu) {
        menu.querySelectorAll(".level-opt").forEach(btn => {
          btn.addEventListener("click", (e) => {
            const level = btn.getAttribute("data-level");
            if (level) {
              this.setLevelAndFormat(level, AppState.currentFormat);
            }
          });
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

      // Claim Bonus Button Events
      const claimBtn = document.getElementById("claim-bonus-btn");
      const modalClaimBtn = document.getElementById("modal-claim-bonus");

      const claimBonusAction = async () => {
        if (AppState.dailyCredits.remaining < AppState.dailyCredits.total + 2) {
          AppState.dailyCredits.remaining += 1;
          this.saveState();
          this.updateHeaderUI();
          this.updateCreditsModalUI();

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
              console.warn("PracticeApp: Supabase bonus credit update note:", e);
            }
          }
          alert("🎉 +1 Bonus Credit added for today!");
        } else {
          alert("Maximum daily bonus credits claimed!");
        }
      };

      if (claimBtn) claimBtn.addEventListener("click", claimBonusAction);
      if (modalClaimBtn) modalClaimBtn.addEventListener("click", claimBonusAction);
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
            await supabase.from("learning_users").upsert({
              uid: uid,
              current_level: AppState.currentLevel,
              format: AppState.currentFormat.toLowerCase(),
              updated_at: new Date().toISOString()
            }, { onConflict: "uid" });
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

      // Sidebar UI
      const badge = document.getElementById("current-level-badge");
      const name = document.getElementById("current-level-name");
      const creditsCount = document.getElementById("sidebar-credits-count");
      const creditsFill = document.getElementById("sidebar-credits-fill");
      const userName = document.getElementById("sidebar-user-name");
      const userPlan = document.getElementById("sidebar-user-plan");

      if (badge) badge.textContent = level;
      if (name) name.textContent = `${format} ${level}`;
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
      if (levelTextEl) levelTextEl.textContent = `${format} ${level}`;
      if (creditsTextEl) {
        if (credits.remaining === null || credits.remaining === undefined) {
          creditsTextEl.textContent = "-- Credits";
        } else {
          creditsTextEl.textContent = `${credits.remaining} Credits`;
        }
      }

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
      if (formatRow) {
        formatRow.querySelectorAll(".format-opt").forEach(btn => {
          const btnFmt = btn.getAttribute("data-format");
          if (btnFmt && btnFmt.toLowerCase() === format.toLowerCase()) {
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
      const activeModule = searchParams.get("module");

      document.querySelectorAll(".sidebar-nav .nav-item").forEach(link => {
        if (link.getAttribute("href") === mainPath) {
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
      const ok = await this.deductCreditAndPersist();
      if (!ok) {
        alert("⚡ Out of daily credits! Claim daily bonus or upgrade your account to continue.");
        return;
      }

      window.location.hash = `#player?id=${mockId}`;
    }

    async openPlayer(materialId) {
      const ok = await this.deductCreditAndPersist();
      if (!ok) {
        alert("⚡ Out of daily credits! Claim daily bonus or upgrade your account to continue.");
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
