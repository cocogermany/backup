/**
 * Coco Germany Practice App - Mock Exams Component
 * components/mock-exams.js
 *
 * Connected directly to Supabase database (plans & mock_attempts).
 */

window.MockExamsComponent = {
  render: function (appState) {
    const level = appState ? (appState.currentLevel || "A1") : "A1";
    const rawFormat = appState ? (appState.currentFormat || "goethe") : "goethe";
    const formatName = rawFormat.toLowerCase() === "telc" ? "TELC" : "Goethe";
    const mockExamId = `mock-${level.toLowerCase()}-full-1`;

    const duration = level === "A1" ? "60 mins" : level === "A2" ? "75 mins" : level === "B1" ? "90 mins" : "120 mins";

    const sections = [
      { name: "Lesen (Reading)", time: level === "A1" ? "20 mins" : "25 mins", questions: "15 Questions" },
      { name: "Hören (Listening)", time: level === "A1" ? "20 mins" : "20 mins", questions: "15 Questions" },
      { name: "Schreiben (Writing)", time: level === "A1" ? "15 mins" : "20 mins", questions: "1-2 Tasks" },
      { name: "Sprechen (Speaking)", time: level === "A1" ? "15 mins" : "15 mins", questions: "3 Tasks" }
    ];

    // Schedule async fetch of completed mock attempts from Supabase
    setTimeout(() => {
      this.initMockData(appState);
    }, 0);

    return `
      <div class="view-fade-in mock-exam-page" id="mock-exams-root">
        <!-- Page Header -->
        <div class="mock-page-header">
          <div class="mock-page-header-text">
            <h1 class="mock-page-title">Mock Exam Simulator</h1>
            <p class="mock-page-subtitle">Full timed examination simulation under official test conditions.</p>
          </div>
          <div class="mock-header-badge">
            <span class="badge-pill badge-gold">
              <i data-lucide="shield-check" style="width:14px;height:14px;"></i> ${formatName} / TELC Standard
            </span>
          </div>
        </div>

        <!-- MAIN MOCK EXAM START SECTION (HERO CARD) -->
        <div class="card mock-hero-card">
          <div class="mock-hero-top">
            <div class="mock-hero-badge-row">
              <span class="mock-badge-level">${formatName} · ${level}</span>
              <span class="mock-badge-simulation"><i data-lucide="sparkles" style="width:13px;height:13px;"></i> Full Mock Exam Simulation</span>
            </div>
            <h2 class="mock-hero-title">${formatName}-Zertifikat ${level} Examination</h2>
            <p class="mock-hero-desc">Experience the complete examination suite with authentic timing, audio playback controls, writing evaluations, and automated score certification.</p>
          </div>

          <!-- Key Information Metrics Grid -->
          <div class="mock-metrics-grid">
            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="layers"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Sections</span>
                <span class="mock-metric-value">4 Modules</span>
              </div>
            </div>

            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="clock"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Duration</span>
                <span class="mock-metric-value">${duration}</span>
              </div>
            </div>

            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="target"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Passing Score</span>
                <span class="mock-metric-value">60% (60/100 pts)</span>
              </div>
            </div>
          </div>

          <!-- Compact Sections Breakdown -->
          <div class="mock-sections-overview">
            <div class="mock-overview-header">
              <span>Included Exam Modules</span>
            </div>
            <div class="mock-sections-chips">
              ${sections.map(s => `
                <div class="mock-section-chip">
                  <div class="mock-chip-dot"></div>
                  <div class="mock-chip-info">
                    <span class="mock-chip-name">${s.name}</span>
                    <span class="mock-chip-time">${s.time} · ${s.questions}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>

          <!-- Start Action Bar -->
          <div class="mock-hero-action-bar">
            <button type="button" class="btn-primary mock-start-btn" onclick="window.PracticeApp.startMockExam('${mockExamId}')">
              <i data-lucide="play-circle" style="width:18px;height:18px;"></i>
              <span>Start Mock Exam</span>
            </button>
            <div class="mock-action-note">
              <span id="mock-plan-limit">Weekly Limit: Plan Based</span>
              <span style="opacity:0.4;">·</span>
              <span>1 Credit per simulation</span>
            </div>
          </div>
        </div>

        <!-- PAST EXAM REPORTS SECTION -->
        <div class="mock-reports-section">
          <div class="mock-reports-header">
            <div>
              <h2 class="mock-reports-title">Past Exam Reports</h2>
              <p class="mock-reports-subtitle">Your previous mock exam scores and historical performance.</p>
            </div>
            <div class="mock-reports-count-pill" id="mock-reports-count-badge">
              <span id="mock-user-count">0</span> Completed
            </div>
          </div>

          <!-- Reports Container (Dynamically Populated) -->
          <div id="mock-reports-container">
            <div class="mock-reports-skeleton">
              <div class="skeleton" style="height:60px; border-radius:10px; margin-bottom:10px;"></div>
              <div class="skeleton" style="height:60px; border-radius:10px;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  initMockData: async function (appState) {
    const container = document.getElementById("mock-reports-container");
    const countEl = document.getElementById("mock-user-count");

    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) {
      this.renderReportsEmpty(container);
      return;
    }

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) {
        this.renderReportsEmpty(container);
        return;
      }

      const uid = appState?.userProfile?.uid || "local-user";

      // 1. Fetch Plan limits
      const planCode = (appState?.userProfile?.plan || "free").toLowerCase();
      const { data: planData } = await supabase.from("plans").select("weekly_mock_exams").eq("code", planCode).maybeSingle();

      const limitEl = document.getElementById("mock-plan-limit");
      if (limitEl) {
        const limit = planData?.weekly_mock_exams !== undefined ? planData.weekly_mock_exams : 1;
        limitEl.textContent = `Weekly Limit: ${limit} Mock Exams`;
      }

      // 2. Fetch past attempts from mock_attempts table
      if (!uid || uid === "local-user") {
        if (countEl) countEl.textContent = "0";
        this.renderReportsEmpty(container);
        return;
      }

      const { data: attempts, error } = await supabase
        .from("mock_attempts")
        .select("id, uid, level, format, score_percent, completed_at")
        .eq("uid", uid)
        .order("completed_at", { ascending: false })
        .limit(30);

      if (error || !attempts || attempts.length === 0) {
        if (countEl) countEl.textContent = "0";
        this.renderReportsEmpty(container);
        return;
      }

      if (countEl) countEl.textContent = attempts.length.toString();
      this.renderReportsList(container, attempts);

    } catch (e) {
      console.warn("MockExams: Supabase sync error:", e);
      this.renderReportsEmpty(container);
    }
  },

  renderReportsList: function (container, attempts) {
    if (!container) return;

    container.innerHTML = `
      <div class="mock-reports-table-wrap">
        <table class="mock-reports-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Format & Level</th>
              <th>Score</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${attempts.map(att => {
              const score = typeof att.score_percent === "number" ? att.score_percent : parseInt(att.score_percent || 0, 10);
              const isPass = score >= 60;
              const dateStr = att.completed_at
                ? new Date(att.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                : "Recent";
              const formatStr = (att.format || "Goethe").toUpperCase();
              const levelStr = (att.level || "A1").toUpperCase();

              return `
                <tr class="mock-report-row">
                  <td class="mock-report-date">
                    <i data-lucide="calendar" style="width:14px;height:14px;color:var(--muted);display:inline;margin-right:6px;"></i>
                    ${dateStr}
                  </td>
                  <td class="mock-report-exam">
                    <strong>${formatStr}</strong> · ${levelStr}
                  </td>
                  <td class="mock-report-score">
                    <span class="mock-score-val ${isPass ? 'is-pass' : 'is-fail'}">${score}%</span>
                  </td>
                  <td class="mock-report-status">
                    <span class="badge-pill ${isPass ? 'badge-emerald' : 'badge-rose'}">
                      <i data-lucide="${isPass ? 'check' : 'x'}" style="width:12px;height:12px;"></i>
                      ${isPass ? 'Passed' : 'Needs Review'}
                    </span>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  renderReportsEmpty: function (container) {
    if (!container) return;
    container.innerHTML = `
      <div class="card mock-reports-empty">
        <div class="mock-empty-icon">
          <i data-lucide="clipboard-list"></i>
        </div>
        <h3 class="mock-empty-title">No Previous Mock Exam Reports</h3>
        <p class="mock-empty-desc">You haven't completed any full mock exams yet. Start your first simulated exam above to test your skills and view detailed scoring reports here.</p>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
  },

  recordMockAttemptCompletion: async function (appState, scorePercent) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = appState?.userProfile?.uid || "local-user";
      const level = appState?.currentLevel || "A1";
      const format = appState?.currentFormat || "goethe";

      const payload = {
        uid: uid,
        level: level,
        format: format,
        score_percent: parseInt(scorePercent || 0, 10),
        completed_at: new Date().toISOString()
      };

      await supabase.from("mock_attempts").insert([payload]);
    } catch (err) {
      console.warn("MockExams: Supabase save mock attempt error:", err);
    }
  }
};
