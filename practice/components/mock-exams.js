/**
 * Coco Germany Practice App - Mock Exams Component
 * components/mock-exams.js
 *
 * Connected directly to Supabase database (plans & mock_attempts).
 */

const EXAM_META = {
  goethe: {
    A1: {
      title: "Goethe-Zertifikat A1: Start Deutsch 1",
      subtitle: "Official Goethe Beginner German Examination",
      desc: "Comprehensive mock test simulating the official Goethe-Zertifikat A1 format. Tests basic everyday communication, vocabulary, and grammar structures.",
      duration: "55 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "25 mins", questions: "15 Questions", status: "available" },
        { name: "Hören (Listening)", time: "20 mins", questions: "15 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "15 mins", questions: "1-2 Tasks", status: "pro" }
      ]
    },
    A2: {
      title: "Goethe-Zertifikat A2",
      subtitle: "Official Goethe Elementary German Examination",
      desc: "Full mock simulation for elementary German. Evaluates understanding of simple sentences and frequently used expressions related to everyday situations.",
      duration: "70 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "30 mins", questions: "20 Questions", status: "available" },
        { name: "Hören (Listening)", time: "30 mins", questions: "20 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "20 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    B1: {
      title: "Goethe-Zertifikat B1",
      subtitle: "Official Goethe Intermediate German Examination",
      desc: "Standard intermediate proficiency simulation. Assesses independent German language usage in familiar contexts like work, school, and leisure.",
      duration: "95 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "45 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "40 mins", questions: "30 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "30 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    B2: {
      title: "Goethe-Zertifikat B2",
      subtitle: "Official Goethe Upper-Intermediate Examination",
      desc: "Upper-intermediate simulation measuring spontaneous and fluent interaction with complex technical, social, and topical discussions.",
      duration: "115 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "55 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "40 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "35 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    C1: {
      title: "Goethe-Zertifikat C1",
      subtitle: "Official Goethe Advanced German Examination",
      desc: "Advanced level simulation requiring high-level mastery of expressive, idiomatic, and complex syntactic German constructs.",
      duration: "135 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "65 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "45 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "15 mins", questions: "15 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "40 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    C2: {
      title: "Goethe-Zertifikat C2: GDS",
      subtitle: "Official Goethe Mastery Examination",
      desc: "Mastery level examination simulation demonstrating near-native fluency in abstract academic, cultural, and professional contexts.",
      duration: "150 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "70 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "50 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "15 mins", questions: "15 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "45 mins", questions: "2 Tasks", status: "pro" }
      ]
    }
  },
  telc: {
    A1: {
      title: "telc Deutsch A1: Start Deutsch 1",
      subtitle: "Official telc Beginner German Examination",
      desc: "Authentic telc A1 exam simulator testing baseline listening, reading comprehension, and language element structures under timed conditions.",
      duration: "55 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "25 mins", questions: "15 Questions", status: "available" },
        { name: "Hören (Listening)", time: "20 mins", questions: "15 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "15 mins", questions: "1-2 Tasks", status: "pro" }
      ]
    },
    A2: {
      title: "telc Deutsch A2",
      subtitle: "Official telc Elementary German Examination",
      desc: "Full telc A2 simulation evaluating practical everyday communication, short dialogues, information notices, and basic grammar.",
      duration: "70 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "30 mins", questions: "20 Questions", status: "available" },
        { name: "Hören (Listening)", time: "30 mins", questions: "20 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "20 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    B1: {
      title: "telc Deutsch B1: Zertifikat Deutsch",
      subtitle: "Official telc Intermediate German Examination",
      desc: "Standard telc B1 simulation covering Sprachbausteine, reading passages, audio broadcasts, and structured writing tasks.",
      duration: "95 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "45 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "40 mins", questions: "30 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "30 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    B2: {
      title: "telc Deutsch B2",
      subtitle: "Official telc Upper-Intermediate Examination",
      desc: "Upper-intermediate telc test simulator evaluating advanced comprehension of arguments, complex texts, and professional communication.",
      duration: "115 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "55 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "40 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "35 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    C1: {
      title: "telc Deutsch C1 Hochschule",
      subtitle: "Official telc Advanced Academic Examination",
      desc: "Advanced academic German examination simulation designed for university admission and professional recognition in German-speaking countries.",
      duration: "135 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "65 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "45 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "15 mins", questions: "15 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "40 mins", questions: "2 Tasks", status: "pro" }
      ]
    },
    C2: {
      title: "telc Deutsch C2",
      subtitle: "Official telc Mastery Examination",
      desc: "Mastery level academic examination simulating rigorous reading analysis, subtle audio nuances, and professional composition.",
      duration: "150 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "70 mins", questions: "30 Questions", status: "available" },
        { name: "Hören (Listening)", time: "50 mins", questions: "25 Questions", status: "available" },
        { name: "Grammatik", time: "15 mins", questions: "15 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "45 mins", questions: "2 Tasks", status: "pro" }
      ]
    }
  }
};

window.MockExamsComponent = {
  render: function (appState) {
    const level = appState ? (appState.currentLevel || "A1") : "A1";
    const rawFormat = appState ? (appState.currentFormat || "goethe") : "goethe";
    const formatKey = rawFormat.toLowerCase().includes("telc") ? "telc" : "goethe";
    const formatLabel = formatKey === "telc" ? "TELC" : "Goethe";
    const levelUpper = (level || "A1").toUpperCase();
    const mockExamId = `mock-${levelUpper.toLowerCase()}-full-1`;

    const formatDict = EXAM_META[formatKey] || EXAM_META.goethe;
    const examInfo = formatDict[levelUpper] || {
      title: `${formatLabel}-Zertifikat ${levelUpper}`,
      subtitle: `Official ${formatLabel} ${levelUpper} German Examination`,
      desc: `Comprehensive mock examination simulating official ${formatLabel} ${levelUpper} format and time standards.`,
      duration: "65 mins",
      passingScore: "60% (60/100 pts)",
      modules: [
        { name: "Lesen (Reading)", time: "25 mins", questions: "15 Questions", status: "available" },
        { name: "Hören (Listening)", time: "20 mins", questions: "15 Questions", status: "available" },
        { name: "Grammatik", time: "10 mins", questions: "10 Questions", status: "available" },
        { name: "Schreiben (Writing)", time: "15 mins", questions: "1-2 Tasks", status: "pro" }
      ]
    };

    const availableModulesCount = examInfo.modules.filter(m => m.status === "available").length;
    const proModulesCount = examInfo.modules.filter(m => m.status === "pro").length;
    const modulesSummaryText = `${availableModulesCount} Available · ${proModulesCount} PRO`;

    // Live async fetch of completed mock attempts tied to real loader
    this._initPromise = this.initMockData(appState);

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
              <i data-lucide="shield-check" style="width:14px;height:14px;"></i> ${formatLabel} Official Standard
            </span>
          </div>
        </div>

        <!-- MAIN MOCK EXAM START SECTION (HERO CARD) -->
        <div class="card mock-hero-card">
          <div class="mock-hero-top">
            <div class="mock-hero-badge-row">
              <span class="mock-badge-level">${formatLabel} · ${levelUpper}</span>
              <span class="mock-badge-simulation"><i data-lucide="sparkles" style="width:13px;height:13px;"></i> Full Mock Simulation</span>
            </div>
            <h2 class="mock-hero-title">${examInfo.title}</h2>
            <p class="mock-hero-desc">${examInfo.desc}</p>
          </div>

          <!-- Key Information Metrics Grid -->
          <div class="mock-metrics-grid">
            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="layers"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Included Modules</span>
                <span class="mock-metric-value">${modulesSummaryText}</span>
              </div>
            </div>

            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="clock"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Total Duration</span>
                <span class="mock-metric-value">${examInfo.duration}</span>
              </div>
            </div>

            <div class="mock-metric-card">
              <div class="mock-metric-icon">
                <i data-lucide="target"></i>
              </div>
              <div class="mock-metric-content">
                <span class="mock-metric-label">Passing Criteria</span>
                <span class="mock-metric-value">${examInfo.passingScore}</span>
              </div>
            </div>
          </div>

          <!-- Compact Sections Breakdown -->
          <div class="mock-sections-overview">
            <div class="mock-overview-header">
              <span>Exam Modules Breakdown</span>
            </div>
            <div class="mock-sections-chips">
              ${examInfo.modules.map(m => {
                const isPro = m.status === "pro";
                return `
                  <div class="mock-section-chip ${isPro ? 'is-pro-locked' : 'is-available'}">
                    <div class="mock-chip-dot ${isPro ? 'is-pro-locked' : 'is-available'}">
                      ${isPro ? '<i data-lucide="lock" style="width:11px;height:11px;"></i>' : ''}
                    </div>
                    <div class="mock-chip-info">
                      <div class="mock-chip-header">
                        <span class="mock-chip-name">${m.name}</span>
                        <span class="mock-chip-badge ${isPro ? 'badge-pro' : 'badge-available'}">
                          ${isPro ? 'PRO ONLY' : 'Available'}
                        </span>
                      </div>
                      <span class="mock-chip-time">${m.time} · ${m.questions}</span>
                    </div>
                  </div>
                `;
              }).join("")}
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
      if (window.CocoStateSync) {
        window.CocoStateSync.notifyAttemptCompleted({ type: "mock", level, format, scorePercent });
      }
    } catch (err) {
      console.warn("MockExams: Supabase save mock attempt error:", err);
    }
  }
};
