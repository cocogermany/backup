/**
 * Coco Germany Practice App - Mock Exams Component
 * components/mock-exams.js
 *
 * Connected directly to Supabase database (plans & mock_attempts).
 */

window.MockExamsComponent = {
  render: function (appState) {
    const level = appState ? appState.currentLevel || "A1" : "A1";
    const format = appState ? appState.currentFormat || "Goethe" : "Goethe";

    const mockExamData = [
      {
        id: `mock-${level.toLowerCase()}-full-1`,
        title: `${format}-Zertifikat ${level} - Full Official Practice Test 1`,
        exam: format,
        level: level,
        duration: level === "A1" ? "60 mins" : level === "A2" ? "75 mins" : "90 mins",
        parts: [
          { name: "Lesen (Reading)", time: "20 mins", questions: 15 },
          { name: "Hören (Listening)", time: "20 mins", questions: 15 },
          { name: "Schreiben (Writing)", time: "15 mins", questions: 2 },
          { name: "Sprechen (Speaking)", time: "15 mins", tasks: 3 }
        ],
        badge: "Official Format",
        attempts: 1240
      },
      {
        id: `mock-${level.toLowerCase()}-full-2`,
        title: `${format}-Zertifikat ${level} - Full Official Practice Test 2`,
        exam: format,
        level: level,
        duration: level === "A1" ? "60 mins" : level === "A2" ? "75 mins" : "90 mins",
        parts: [
          { name: "Lesen (Reading)", time: "20 mins", questions: 15 },
          { name: "Hören (Listening)", time: "20 mins", questions: 15 },
          { name: "Schreiben (Writing)", time: "15 mins", questions: 2 },
          { name: "Sprechen (Speaking)", time: "15 mins", tasks: 3 }
        ],
        badge: "Popular",
        attempts: 890
      },
      {
        id: `mock-${level.toLowerCase()}-telc-1`,
        title: `TELC ${level} - General Exam Simulator`,
        exam: "TELC",
        level: level,
        duration: "70 mins",
        parts: [
          { name: "Sprachbausteine & Lesen", time: "30 mins", questions: 20 },
          { name: "Hören (Listening)", time: "20 mins", questions: 15 },
          { name: "Schreiben (Writing)", time: "20 mins", questions: 1 }
        ],
        badge: "TELC Pattern",
        attempts: 540
      }
    ];

    // Schedule async fetch of completed mock attempts from Supabase
    setTimeout(() => {
      this.initMockData(appState);
    }, 0);

    return `
      <div class="view-fade-in" id="mock-exams-root">
        <div class="page-header">
          <div class="page-title-row">
            <h1 class="page-title">Mock Exam Simulator</h1>
            <span class="badge-pill badge-gold" style="font-size:0.85rem; padding:6px 12px;">
              <i data-lucide="shield-check" style="width:16px;height:16px;"></i> ${format} / TELC Standards
            </span>
          </div>
          <p class="page-subtitle">Full timed examination suites under real test condition rules.</p>
        </div>

        <!-- Suite Header Card -->
        <div class="mock-suite-header">
          <div class="mock-suite-title-box">
            <div class="mock-suite-badge">${level}</div>
            <div class="mock-suite-info">
              <h2>${format}-Zertifikat ${level} Exam Collection</h2>
              <p>Simulates exact time limits, passage structures, audio pauses, and scoring thresholds.</p>
            </div>
          </div>
          <div style="text-align:right;">
            <span style="font-size:0.8rem; color:var(--muted); display:block; margin-bottom:4px;">Passing Criteria</span>
            <span class="badge-pill badge-emerald" style="font-size:0.85rem;">60% (60/100 points)</span>
          </div>
        </div>

        <!-- User Completed Mock Summary Banner -->
        <div style="background:var(--paper); border:1px solid var(--line); border-radius:var(--radius-md); padding:12px 16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:0.85rem; color:var(--muted);" id="mock-user-summary">
            Completed Mock Exams: <strong style="color:var(--ink);" id="mock-user-count">0</strong> exams
          </span>
          <span class="badge-pill badge-sky" id="mock-plan-limit">Weekly Limit: Plan Based</span>
        </div>

        <!-- Exam Cards Grid -->
        <div class="mock-cards-grid">
          ${mockExamData.map(exam => `
            <div class="card mock-exam-card">
              <div>
                <div class="mock-exam-meta" style="margin-bottom:8px;">
                  <span class="badge-pill badge-gold">${exam.badge}</span>
                  <span style="font-size:0.75rem; color:var(--muted);"><i data-lucide="clock" style="width:12px;height:12px;display:inline;"></i> ${exam.duration}</span>
                </div>
                <h3 class="mock-exam-title" style="margin-bottom:12px;">${exam.title}</h3>

                <!-- Sections list -->
                <div class="mock-sections-list">
                  ${exam.parts.map(p => `
                    <div class="mock-sec-row">
                      <span><i data-lucide="check-circle-2"></i> ${p.name}</span>
                      <span style="color:var(--muted); font-size:0.75rem;">${p.time}</span>
                    </div>
                  `).join("")}
                </div>
              </div>

              <div class="mock-card-footer">
                <span style="font-size:0.75rem; color:var(--muted);">${exam.attempts} attempts taken</span>
                <button class="btn-primary btn-sm" onclick="window.PracticeApp.startMockExam('${exam.id}')">
                  <i data-lucide="play-circle"></i> Begin Simulation
                </button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  },

  initMockData: async function (appState) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = appState?.userProfile?.uid || "local-user";

      // 1. Fetch user completed mock attempts count
      let mockCount = 0;
      if (uid && uid !== "local-user") {
        const { count } = await supabase
          .from("mock_attempts")
          .select("id", { count: "exact", head: true })
          .eq("uid", uid);

        if (count !== null) mockCount = count;
      }

      const countEl = document.getElementById("mock-user-count");
      if (countEl) countEl.textContent = mockCount.toString();

      // 2. Fetch plan limits for mock exams
      const planCode = (appState?.userProfile?.plan || "free").toLowerCase();
      const { data: planData } = await supabase.from("plans").select("weekly_mock_exams").eq("code", planCode).maybeSingle();

      const limitEl = document.getElementById("mock-plan-limit");
      if (limitEl) {
        const limit = planData?.weekly_mock_exams !== undefined ? planData.weekly_mock_exams : 1;
        limitEl.textContent = `Weekly Limit: ${limit} Mock Exams`;
      }
    } catch (e) {
      console.warn("MockExams: Supabase data sync note:", e);
    }
  },

  recordMockAttemptCompletion: async function (appState, scorePercent) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = appState?.userProfile?.uid || "local-user";
      const level = appState?.currentLevel || "A1";
      const format = appState?.currentFormat || "Goethe";

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
