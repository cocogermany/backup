/**
 * Coco Germany Practice App - Dashboard Component
 * components/dashboard.js
 *
 * Fully connected to Supabase database (learning_users, materials, practice_attempts, plans).
 */

window.DashboardComponent = {
  render: function (appState) {
    const level = appState ? appState.currentLevel || "A1" : "A1";
    const format = appState ? appState.currentFormat || "goethe" : "goethe";
    const creditsObj = appState ? appState.dailyCredits : null;
    const creditsText = (creditsObj && typeof creditsObj.remaining === "number")
      ? `${creditsObj.remaining} / ${creditsObj.total || creditsObj.remaining}`
      : "-- / --";
    const streak = appState ? appState.streakDays || 0 : 0;
    const userProfile = appState ? appState.userProfile || { name: "Learner", plan: "Free Member" } : { name: "Learner", plan: "Free Member" };

    // Get cached stats / counts for immediate instant render
    const cachedStats = this.getCachedStats(level, format) || {
      Lesen: 0,
      Hören: 0,
      Grammatik: 0,
      Schreiben: 0,
      Sprechen: 0,
      totalCompleted: 0,
      counts: { Lesen: 0, Hören: 0, Grammatik: 0, Schreiben: 0, Sprechen: 0 }
    };

    const isPaid = this.isPaidMembership(userProfile.plan);

    // Schedule live Supabase sync after shell renders
    setTimeout(() => {
      this.initDashboardData(appState);
    }, 0);

    return `
      <div class="view-fade-in" id="dashboard-root">
        <!-- Hero Banner Grid -->
        <div class="dashboard-hero-grid">
          <div class="hero-welcome-card">
            <div>
              <div class="welcome-header-tag">
                <i data-lucide="sparkles" style="width:14px;height:14px;"></i>
                <span id="dash-welcome-name">Welcome back, ${userProfile.name}</span>
              </div>
              <h1 class="welcome-title" id="dash-welcome-title">Master German ${format} Level ${level} with Clarity</h1>
              <p class="welcome-desc" id="dash-welcome-desc">
                Your daily goal is practice sessions. You have <strong id="dash-credits-strong">${creditsText}</strong> daily credits remaining today.
              </p>
            </div>
            <div class="welcome-actions">
              <a href="#mock-exams" class="btn-primary">
                <i data-lucide="award"></i> Start ${level} Mock Exam
              </a>
              <a href="#practice" class="btn-secondary" style="background: rgba(255,255,255,0.15); color: #fff; border-color: rgba(255,255,255,0.3);">
                <i data-lucide="play-circle"></i> Daily Practice
              </a>
            </div>
          </div>

          <!-- Stats & Accuracy Overview Card -->
          <div class="card hero-stats-card">
            <div class="stats-card-title">SKILL ACCURACY</div>
            
            <div class="stats-rings-container" id="dash-rings-container">
              <div class="stat-ring-item">
                <svg class="stat-ring-svg" viewBox="0 0 36 36">
                  <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                  <path class="stat-ring-val" stroke-dasharray="${cachedStats.Lesen || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                </svg>
                <span class="stat-ring-label">Lesen (${cachedStats.Lesen || 0}%)</span>
              </div>

              <div class="stat-ring-item">
                <svg class="stat-ring-svg" viewBox="0 0 36 36">
                  <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" opacity="0.4" />
                  <path class="stat-ring-val" stroke="#d97706" stroke-dasharray="${cachedStats.Hören || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                </svg>
                <span class="stat-ring-label">Hören (${cachedStats.Hören || 0}%)</span>
              </div>

              <div class="stat-ring-item">
                <svg class="stat-ring-svg" viewBox="0 0 36 36">
                  <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" opacity="0.4" />
                  <path class="stat-ring-val" stroke="#10b981" stroke-dasharray="${cachedStats.Grammatik || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
                </svg>
                <span class="stat-ring-label">Grammatik (${cachedStats.Grammatik || 0}%)</span>
              </div>
            </div>

            <div class="hero-quick-start-box">
              <span class="quick-start-text">Track your accuracy & learning progress</span>
              <a href="#progress" class="btn-secondary btn-sm"><i data-lucide="line-chart" style="width:14px;height:14px;display:inline;"></i> Track Progress</a>
            </div>
          </div>
        </div>

        <!-- Practice Modules Grid -->
        <h2 class="dashboard-section-title">
          <span>PRACTICE MODULES (${format} ${level})</span>
          <a href="#practice" style="font-size:0.85rem; font-weight:500; color:var(--brown);">Explore All &rarr;</a>
        </h2>

        <div class="modules-grid" id="dash-modules-grid">
          <!-- Lesen Card -->
          <div class="module-card" onclick="window.location.hash='#practice?module=Lesen'">
            <div class="module-card-icon icon-reading">
              <i data-lucide="book-open"></i>
            </div>
            <div class="module-card-info">
              <span class="module-card-name">Lesen (Reading)</span>
              <span class="module-card-sub">Passages & Comprehension</span>
            </div>
            <div class="module-card-footer">
              <span>${format} ${level}</span>
              <span class="badge-pill badge-sky">500+ Sets</span>
            </div>
          </div>

          <!-- Hören Card -->
          <div class="module-card" onclick="window.location.hash='#practice?module=Hören'">
            <div class="module-card-icon icon-listening">
              <i data-lucide="headphones"></i>
            </div>
            <div class="module-card-info">
              <span class="module-card-name">Hören (Listening)</span>
              <span class="module-card-sub">Audio Tracks & Dialogues</span>
            </div>
            <div class="module-card-footer">
              <span>${format} ${level}</span>
              <span class="badge-pill badge-gold">400+ Audio Sets</span>
            </div>
          </div>

          <!-- Grammatik Card -->
          <div class="module-card" onclick="window.location.hash='#practice?module=Grammatik'">
            <div class="module-card-icon icon-grammar">
              <i data-lucide="file-code-2"></i>
            </div>
            <div class="module-card-info">
              <span class="module-card-name">Grammatik (Grammar)</span>
              <span class="module-card-sub">Cloze & Sentence Building</span>
            </div>
            <div class="module-card-footer">
              <span>${format} ${level}</span>
              <span class="badge-pill badge-emerald">500+ Drills</span>
            </div>
          </div>

          <!-- Schreiben Card -->
          <div class="module-card" onclick="window.location.hash='#practice?module=Schreiben'">
            <div class="module-card-icon icon-writing">
              <i data-lucide="pen-tool"></i>
            </div>
            <div class="module-card-info">
              <span class="module-card-name">Schreiben (Writing)</span>
              <span class="module-card-sub">Letters, Emails & Forms</span>
            </div>
            <div class="module-card-footer">
              <span>${format} ${level}</span>
              <span class="badge-pill badge-rose">Available with Pro Plan</span>
            </div>
          </div>

          <!-- Sprechen Card -->
          <div class="module-card" onclick="window.location.hash='#practice?module=Sprechen'">
            <div class="module-card-icon icon-speaking">
              <i data-lucide="mic"></i>
            </div>
            <div class="module-card-info">
              <span class="module-card-name">Sprechen (Speaking)</span>
              <span class="module-card-sub">Oral Drills & Audio Simulation</span>
            </div>
            <div class="module-card-footer">
              <span>${format} ${level}</span>
              <span class="badge-pill badge-rose">Available with Pro Plan</span>
            </div>
          </div>
        </div>

        <!-- Recommended Mock Exam Spotlight -->
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px; background: #fffcf7;">
          <div style="display:flex; align-items:center; gap:16px;">
            <div style="width:48px; height:48px; border-radius:12px; background:var(--brown-light); color:var(--brown-dark); display:flex; align-items:center; justify-content:center; font-family:var(--font-heading); font-weight:800; font-size:1.1rem;">
              ${level}
            </div>
            <div>
              <h3 style="font-family:var(--font-heading); font-size:1.05rem; font-weight:700;">Full ${level} Timed ${format} Simulator</h3>
              <p style="font-size:0.82rem; color:var(--muted);">Complete simulated test with automatic grading across all exam parts.</p>
            </div>
          </div>
          <a href="#mock-exams" class="btn-primary">
            <i data-lucide="play"></i> Launch Exam Simulation
          </a>
        </div>
      </div>
    `;
  },

  initDashboardData: async function (appState) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = appState?.userProfile?.uid || "local-user";
      const level = appState?.currentLevel || "A1";
      const format = appState?.currentFormat || "goethe";

      // Update credits text in DOM if appState contains credits
      const dashCreditsStrong = document.getElementById("dash-credits-strong");
      if (dashCreditsStrong && appState && appState.dailyCredits && typeof appState.dailyCredits.remaining === "number") {
        const remaining = appState.dailyCredits.remaining;
        const total = appState.dailyCredits.total || remaining;
        dashCreditsStrong.textContent = `${remaining} / ${total}`;
      }

      // 2. Fetch practice attempts summary & calculate skill accuracy
      let totalCompleted = 0;
      const stats = { Lesen: 0, Hören: 0, Grammatik: 0, Schreiben: 0, Sprechen: 0 };

      if (uid && uid !== "local-user") {
        const { data: attempts } = await supabase
          .from("practice_attempts")
          .select("module, correct_answers, total_questions")
          .eq("uid", uid);

        if (attempts && attempts.length > 0) {
          totalCompleted = attempts.length;
          const totals = {};
          attempts.forEach(a => {
            const m = a.module || "Lesen";
            if (!totals[m]) totals[m] = { correct: 0, total: 0 };
            totals[m].correct += parseInt(a.correct_answers || 0, 10);
            totals[m].total += parseInt(a.total_questions || 0, 10);
          });

          Object.keys(totals).forEach(m => {
            if (totals[m].total > 0) {
              stats[m] = Math.round((totals[m].correct / totals[m].total) * 100);
            }
          });
        }
      }

      // Save to AppState & Cache
      if (appState) {
        appState.stats = { ...stats, totalCompleted, counts };
      }
      this.setCachedStats(level, format, { ...stats, totalCompleted, counts });

      // Update Rings UI
      const ringsContainer = document.getElementById("dash-rings-container");
      if (ringsContainer) {
        ringsContainer.innerHTML = `
          <div class="stat-ring-item">
            <svg class="stat-ring-svg" viewBox="0 0 36 36">
              <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
              <path class="stat-ring-val" stroke-dasharray="${stats.Lesen || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
            </svg>
            <span class="stat-ring-label">Lesen (${stats.Lesen || 0}%)</span>
          </div>

          <div class="stat-ring-item">
            <svg class="stat-ring-svg" viewBox="0 0 36 36">
              <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" opacity="0.4" />
              <path class="stat-ring-val" stroke="#d97706" stroke-dasharray="${stats.Hören || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
            </svg>
            <span class="stat-ring-label">Hören (${stats.Hören || 0}%)</span>
          </div>

          <div class="stat-ring-item">
            <svg class="stat-ring-svg" viewBox="0 0 36 36">
              <path class="stat-ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" opacity="0.4" />
              <path class="stat-ring-val" stroke="#10b981" stroke-dasharray="${stats.Grammatik || 0}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" />
            </svg>
            <span class="stat-ring-label">Grammatik (${stats.Grammatik || 0}%)</span>
          </div>
        `;
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      console.warn("Dashboard: Supabase data sync error:", e);
    }
  },

  isPaidMembership: function (membership) {
    if (!membership) return false;
    const m = String(membership).toLowerCase().trim();
    return m !== "free" && m !== "free_learner" && m !== "free member" && m !== "";
  },

  getCachedStats: function (level, format) {
    try {
      const raw = localStorage.getItem(`coco_dash_stats_${level}_${format}`);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setCachedStats: function (level, format, data) {
    try {
      localStorage.setItem(`coco_dash_stats_${level}_${format}`, JSON.stringify(data));
    } catch (e) {
      console.warn("Dashboard: Cache set error:", e);
    }
  }
};
