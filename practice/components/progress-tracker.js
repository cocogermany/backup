/**
 * Coco Germany Practice App - Progress Tracker Component
 * components/progress-tracker.js
 *
 * Connected directly to Supabase practice_attempts table.
 */

window.ProgressTrackerComponent = {
  render: function (appState) {
    const level = appState ? appState.currentLevel || "A1" : "A1";
    const format = appState ? appState.currentFormat || "Goethe" : "Goethe";
    const streak = appState ? appState.streakDays || 0 : 0;
    const stats = appState ? appState.stats || { Lesen: 0, Hören: 0, Grammatik: 0, Schreiben: 0, Sprechen: 0, totalCompleted: 0 } : { Lesen: 0, Hören: 0, Grammatik: 0, Schreiben: 0, Sprechen: 0, totalCompleted: 0 };

    // Schedule async data fetch from Supabase
    setTimeout(() => {
      this.initProgressData(appState);
    }, 0);

    return `
      <div class="view-fade-in" id="progress-root">
        <div class="page-header">
          <div class="page-title-row">
            <h1 class="page-title">Learning Progress & Analytics</h1>
            <span class="badge-pill badge-emerald">Active Learner Path</span>
          </div>
          <p class="page-subtitle">Track accuracy, study streak, and readiness for official ${format} certification.</p>
        </div>

        <!-- Top Overview Stats Grid -->
        <div class="progress-header-grid">
          <div class="card prog-stat-card">
            <div class="prog-stat-icon" style="background:var(--sky); color:var(--sky-strong);">
              <i data-lucide="award"></i>
            </div>
            <div class="prog-stat-info">
              <h3>${format} ${level}</h3>
              <p>Current CEFR Target</p>
            </div>
          </div>

          <div class="card prog-stat-card">
            <div class="prog-stat-icon" style="background:#f0fdf4; color:#16a34a;">
              <i data-lucide="target"></i>
            </div>
            <div class="prog-stat-info">
              <h3>${format} Format</h3>
              <p>Active Exam Standard</p>
            </div>
          </div>

          <div class="card prog-stat-card">
            <div class="prog-stat-icon" style="background:var(--emerald-bg); color:var(--emerald);">
              <i data-lucide="check-circle-2"></i>
            </div>
            <div class="prog-stat-info">
              <h3 id="prog-completed-count">${stats.totalCompleted || 0} Sessions</h3>
              <p>Completed Exercises</p>
            </div>
          </div>
        </div>

        <!-- Level Advancement Progress Bar -->
        <div class="card" style="margin-bottom:28px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="font-family:var(--font-heading); font-size:1.05rem; font-weight:700;">${format} ${level} Mastery Path</h3>
            <span style="font-weight:700; color:var(--brown);" id="prog-overall-readiness">-- % Exam Ready</span>
          </div>
          <div style="height:12px; background:var(--soft); border-radius:99px; overflow:hidden;">
            <div style="width:0%; height:100%; background:linear-gradient(90deg, var(--brown) 0%, var(--gold) 100%); border-radius:99px;" id="prog-bar-fill"></div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted); margin-top:8px;">
            <span>A1 Foundation</span>
            <span>A2 Elementary</span>
            <span>B1 Intermediate</span>
            <span>B2 Vantage</span>
            <span>C1 Advanced</span>
          </div>
        </div>

        <!-- Skill Mastery Bars -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:28px;">
          <div class="card">
            <h3 style="font-family:var(--font-heading); font-size:1.05rem; font-weight:700; margin-bottom:16px;">Skill Mastery Breakdown</h3>

            <div class="skill-bar-item">
              <div class="skill-bar-header">
                <span>Lesen (Reading)</span>
                <span id="txt-acc-lesen">${stats.Lesen || 0}%</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" id="bar-acc-lesen" style="width:${stats.Lesen || 0}%;"></div>
              </div>
            </div>

            <div class="skill-bar-item">
              <div class="skill-bar-header">
                <span>Hören (Listening)</span>
                <span id="txt-acc-hoeren">${stats.Hören || 0}%</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" id="bar-acc-hoeren" style="width:${stats.Hören || 0}%; background:#d97706;"></div>
              </div>
            </div>

            <div class="skill-bar-item">
              <div class="skill-bar-header">
                <span>Grammatik (Grammar)</span>
                <span id="txt-acc-grammatik">${stats.Grammatik || 0}%</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" id="bar-acc-grammatik" style="width:${stats.Grammatik || 0}%; background:#10b981;"></div>
              </div>
            </div>

            <div class="skill-bar-item">
              <div class="skill-bar-header">
                <span>Schreiben (Writing)</span>
                <span id="txt-acc-schreiben">${stats.Schreiben || 0}%</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" id="bar-acc-schreiben" style="width:${stats.Schreiben || 0}%; background:#db2777;"></div>
              </div>
            </div>

            <div class="skill-bar-item">
              <div class="skill-bar-header">
                <span>Sprechen (Speaking)</span>
                <span id="txt-acc-sprechen">${stats.Sprechen || 0}%</span>
              </div>
              <div class="skill-bar-track">
                <div class="skill-bar-fill" id="bar-acc-sprechen" style="width:${stats.Sprechen || 0}%; background:#0284c7;"></div>
              </div>
            </div>
          </div>

          <!-- Weak Points & Focus Recommendations -->
          <div class="card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <h3 style="font-family:var(--font-heading); font-size:1.05rem; font-weight:700; margin-bottom:12px;">Recommended Focus Areas</h3>
              <p style="font-size:0.85rem; color:var(--muted); margin-bottom:16px;">Based on your recent practice attempts, focusing on these topics will boost your overall accuracy:</p>

              <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="background:var(--paper); padding:10px 14px; border-radius:8px; border-left:3px solid var(--gold); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="font-weight:600; font-size:0.85rem; display:block;">Writing Formats (Schreiben)</span>
                    <span style="font-size:0.75rem; color:var(--muted);">Practice email structures and formal tone</span>
                  </div>
                  <a href="#practice?module=Schreiben" class="btn-secondary btn-sm">Practice</a>
                </div>

                <div style="background:var(--paper); padding:10px 14px; border-radius:8px; border-left:3px solid var(--sky-strong); display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="font-weight:600; font-size:0.85rem; display:block;">Public Dialogues (Hören)</span>
                    <span style="font-size:0.75rem; color:var(--muted);">Station & supermarket audio tracks</span>
                  </div>
                  <a href="#practice?module=Hören" class="btn-secondary btn-sm">Practice</a>
                </div>
              </div>
            </div>

            <div style="margin-top:20px; background:var(--emerald-bg); padding:12px; border-radius:8px; border:1px solid var(--emerald-border); text-align:center;">
              <span style="font-weight:700; color:#065f46; font-size:0.85rem;">🎉 You are actively preparing for ${format} ${level} Certification!</span>
            </div>
          </div>
        </div>

        <!-- Recent Activity Table -->
        <div class="card">
          <h3 style="font-family:var(--font-heading); font-size:1.05rem; font-weight:700; margin-bottom:14px;">Recent Exam & Practice History</h3>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left;">
              <thead>
                <tr style="border-bottom:1px solid var(--line); color:var(--muted);">
                  <th style="padding:10px;">Date</th>
                  <th style="padding:10px;">Exercise Title</th>
                  <th style="padding:10px;">Score</th>
                  <th style="padding:10px;">Accuracy</th>
                  <th style="padding:10px;">Status</th>
                </tr>
              </thead>
              <tbody id="prog-history-tbody">
                <tr>
                  <td colspan="5" style="padding:20px; text-align:center; color:var(--muted);">Loading recent history...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  initProgressData: async function (appState) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = appState?.userProfile?.uid || "local-user";
      const level = appState?.currentLevel || "A1";

      // 1. Fetch recent practice attempts (limit 20)
      let attempts = [];
      if (uid && uid !== "local-user") {
        const { data } = await supabase
          .from("practice_attempts")
          .select("id, material_id, level, format, module, correct_answers, total_questions, completed_at")
          .eq("uid", uid)
          .order("completed_at", { ascending: false })
          .limit(20);

        if (data) attempts = data;
      }

      // Calculate totals & per-module accuracy
      let totalCompleted = attempts.length;
      const totals = {};
      attempts.forEach(a => {
        const m = a.module || "Lesen";
        if (!totals[m]) totals[m] = { correct: 0, total: 0 };
        totals[m].correct += parseInt(a.correct_answers || 0, 10);
        totals[m].total += parseInt(a.total_questions || 0, 10);
      });

      const stats = { Lesen: 0, Hören: 0, Grammatik: 0, Schreiben: 0, Sprechen: 0 };
      let sumPct = 0, moduleCount = 0;

      Object.keys(stats).forEach(m => {
        if (totals[m] && totals[m].total > 0) {
          stats[m] = Math.round((totals[m].correct / totals[m].total) * 100);
          sumPct += stats[m];
          moduleCount++;
        }
      });

      const overallAccuracy = moduleCount > 0 ? Math.round(sumPct / moduleCount) : 0;

      // Update UI elements
      const completedEl = document.getElementById("prog-completed-count");
      const readinessEl = document.getElementById("prog-overall-readiness");
      const barFillEl = document.getElementById("prog-bar-fill");

      if (completedEl) completedEl.textContent = `${totalCompleted} Sessions`;
      if (readinessEl) readinessEl.textContent = overallAccuracy > 0 ? `${overallAccuracy}% Exam Ready` : `0% Exam Ready`;
      if (barFillEl) barFillEl.style.width = `${overallAccuracy}%`;

      // Update skill mastery bars
      ["Lesen", "Hören", "Grammatik", "Schreiben", "Sprechen"].forEach(mod => {
        const key = mod.toLowerCase();
        const txtEl = document.getElementById(`txt-acc-${key}`);
        const barEl = document.getElementById(`bar-acc-${key}`);

        if (txtEl) txtEl.textContent = `${stats[mod] || 0}%`;
        if (barEl) barEl.style.width = `${stats[mod] || 0}%`;
      });

      // Update Recent History Table
      const tbody = document.getElementById("prog-history-tbody");
      if (tbody) {
        if (attempts.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="padding:20px; text-align:center; color:var(--muted);">
                No practice attempts recorded yet. Complete a drill to see results!
              </td>
            </tr>
          `;
        } else {
          tbody.innerHTML = attempts.map(item => {
            const dateStr = item.completed_at ? new Date(item.completed_at).toLocaleDateString() : "Recent";
            const correct = parseInt(item.correct_answers || 0, 10);
            const total = parseInt(item.total_questions || 1, 10);
            const pct = Math.round((correct / total) * 100);
            const status = pct >= 60 ? "Passed" : "Review";
            const badgeClass = pct >= 60 ? "badge-emerald" : "badge-rose";

            return `
              <tr style="border-bottom:1px solid var(--line-subtle);">
                <td style="padding:10px; color:var(--muted);">${dateStr}</td>
                <td style="padding:10px; font-weight:600; color:var(--ink);">${item.module} Drill (${item.level || level})</td>
                <td style="padding:10px;">${correct} / ${total}</td>
                <td style="padding:10px; font-weight:700; color:var(--brown);">${pct}%</td>
                <td style="padding:10px;"><span class="badge-pill ${badgeClass}">${status}</span></td>
              </tr>
            `;
          }).join("");
        }
      }

      if (window.lucide) window.lucide.createIcons();
    } catch (err) {
      console.warn("ProgressTracker: Supabase data error:", err);
    }
  }
};
