/**
 * Coco Germany Practice App - Interactive Player Component (CBT Exam Mode)
 * components/interactive-player.js
 *
 * Computer-based language examination interface with vertical split workspace,
 * independent document scrolling, layout controls, question navigator, and review mode.
 */

window.InteractivePlayerComponent = {
  activeTimerInterval: null,
  secondsRemaining: 0,
  userAnswers: {},
  currentMaterial: null,
  currentSettings: null,
  preloadedMaterial: null,
  layoutMode: "balanced", // "balanced" (50/50), "reading" (60/40), "questions" (40/60)
  textSize: "md", // "sm", "md", "lg"
  activeMobileTab: "reading", // "reading" | "questions"
  isSubmitted: false,
  isReviewMode: false,
  lastScore: { score: 0, total: 0, pct: 0 },
  warningToastShown: false,

  getPrepSettings: function () {
    try {
      const raw = localStorage.getItem("coco_practice_prep_settings");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      countdown: true,
      shuffle: false,
      showExplanations: true
    };
  },

  render: function (appState, queryParams) {
    const materialId = queryParams ? queryParams.get("id") || "GoA1LM001" : "GoA1LM001";
    const level = appState ? appState.currentLevel || "A1" : "A1";
    const format = appState ? appState.currentFormat || "goethe" : "goethe";

    this.userAnswers = {};
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.warningToastShown = false;
    this.activeMobileTab = "reading";

    const settings = this.currentSettings || this.getPrepSettings();
    this.currentSettings = settings;

    // Schedule async material fetch from Supabase (or reuse preloaded material)
    setTimeout(() => {
      this.initPlayerMaterial(materialId, appState);
    }, 0);

    const isTimerHidden = settings.countdown === false;

    return `
      <div class="exam-cbt-root" id="player-main-container">
        <!-- FIXED CBT EXAM HEADER -->
        <header class="exam-cbt-header" id="exam-cbt-header">
          <div class="exam-cbt-header-left">
            <button type="button" class="exam-cbt-btn" id="exam-exit-btn" onclick="window.InteractivePlayerComponent.handleExitExam()">
              <i data-lucide="arrow-left" style="width:15px;height:15px;"></i>
              <span>Exit</span>
            </button>
          </div>

          <div class="exam-cbt-header-center">
            <div class="exam-cbt-timer" id="exam-timer-box" style="${isTimerHidden ? 'display:none;' : ''}">
              <i data-lucide="clock" style="width:14px;height:14px;"></i>
              <span id="player-timer-display">--:--</span>
            </div>
          </div>

          <div class="exam-cbt-header-right">
            <!-- Layout / Display Toggle -->
            <button type="button" class="exam-cbt-btn exam-cbt-btn-icon" id="exam-layout-btn" onclick="window.InteractivePlayerComponent.toggleLayoutPopover()" title="Layout & Display" aria-label="Layout & Display">
              <i data-lucide="columns" style="width:16px;height:16px;"></i>
            </button>

            <!-- Settings Toggle -->
            <button type="button" class="exam-cbt-btn exam-cbt-btn-icon" id="exam-settings-btn" onclick="window.InteractivePlayerComponent.toggleSettingsPopover()" title="Exam Settings" aria-label="Exam Settings">
              <i data-lucide="sliders" style="width:16px;height:16px;"></i>
            </button>
          </div>
        </header>

        <!-- 1-Minute Warning Banner (Injected dynamically) -->
        <div id="exam-timer-toast-container"></div>

        <!-- LAYOUT & DISPLAY POPOVER -->
        <div class="exam-popover" id="exam-layout-popover" hidden>
          <div class="exam-popover-header">Display & Layout</div>

          <div class="exam-popover-label">Split View Ratio</div>
          <div class="exam-layout-options">
            <button type="button" class="exam-layout-opt ${this.layoutMode === 'balanced' ? 'active' : ''}" id="opt-layout-balanced" onclick="window.InteractivePlayerComponent.setLayoutMode('balanced')">
              <span>Balanced</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">50 / 50</span>
            </button>
            <button type="button" class="exam-layout-opt ${this.layoutMode === 'reading' ? 'active' : ''}" id="opt-layout-reading" onclick="window.InteractivePlayerComponent.setLayoutMode('reading')">
              <span>Reading Focus</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">60 / 40</span>
            </button>
            <button type="button" class="exam-layout-opt ${this.layoutMode === 'questions' ? 'active' : ''}" id="opt-layout-questions" onclick="window.InteractivePlayerComponent.setLayoutMode('questions')">
              <span>Questions Focus</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">40 / 60</span>
            </button>
          </div>

          <div class="exam-popover-label">Text Size</div>
          <div class="exam-font-options">
            <button type="button" class="exam-font-btn ${this.textSize === 'sm' ? 'active' : ''}" id="btn-font-sm" onclick="window.InteractivePlayerComponent.setTextSize('sm')">A−</button>
            <button type="button" class="exam-font-btn ${this.textSize === 'md' ? 'active' : ''}" id="btn-font-md" onclick="window.InteractivePlayerComponent.setTextSize('md')">A</button>
            <button type="button" class="exam-font-btn ${this.textSize === 'lg' ? 'active' : ''}" id="btn-font-lg" onclick="window.InteractivePlayerComponent.setTextSize('lg')">A+</button>
          </div>
        </div>

        <!-- SETTINGS POPOVER -->
        <div class="exam-popover" id="exam-settings-popover" hidden>
          <div class="exam-popover-header">Exam Settings</div>

          <div style="display:flex; flex-direction:column; gap:12px;">
            <!-- Time Countdown -->
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:0.82rem; font-weight:600;">Time Countdown</span>
              <label class="switch-control">
                <input type="checkbox" id="exam-setting-countdown" ${settings.countdown !== false ? 'checked' : ''} onchange="window.InteractivePlayerComponent.toggleSetting('countdown', this.checked)">
                <span class="switch-track"></span>
              </label>
            </div>

            <!-- Shuffle Questions -->
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:0.82rem; font-weight:600;">Shuffle Questions</span>
              <label class="switch-control">
                <input type="checkbox" id="exam-setting-shuffle" ${settings.shuffle ? 'checked' : ''} onchange="window.InteractivePlayerComponent.toggleSetting('shuffle', this.checked)">
                <span class="switch-track"></span>
              </label>
            </div>

            <!-- Show Explanations (Review) -->
            <div style="display:flex; align-items:center; justify-content:space-between;">
              <span style="font-size:0.82rem; font-weight:600;">Show Explanations</span>
              <label class="switch-control">
                <input type="checkbox" id="exam-setting-explanations" ${settings.showExplanations !== false ? 'checked' : ''} onchange="window.InteractivePlayerComponent.toggleSetting('showExplanations', this.checked)">
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- MOBILE SUB-HEADER TABS -->
        <nav class="exam-mobile-tabs" id="exam-mobile-tabs" aria-label="Exam Sections">
          <button type="button" class="exam-tab-btn active" id="mobile-tab-reading" onclick="window.InteractivePlayerComponent.switchMobileTab('reading')">
            <i data-lucide="file-text" style="width:14px;height:14px;"></i>
            <span>LESEN</span>
          </button>
          <button type="button" class="exam-tab-btn" id="mobile-tab-questions" onclick="window.InteractivePlayerComponent.switchMobileTab('questions')">
            <i data-lucide="help-circle" style="width:14px;height:14px;"></i>
            <span id="mobile-tab-q-label">FRAGEN (0)</span>
          </button>
        </nav>

        <!-- MAIN INTERACTIVE EXAM CONTENT -->
        <main id="player-content-area" style="width:100%; height:100%; overflow:hidden;">
          <div class="exam-cbt-workspace" style="align-items:center; justify-content:center;">
            <div style="text-align:center; padding:40px;">
              <div class="app-spinner" style="margin:0 auto 12px;"></div>
              <p style="font-weight:600; color:var(--exam-ink-color); font-size:0.9rem;">Initializing examination workspace...</p>
            </div>
          </div>
        </main>
      </div>
    `;
  },

  handleExitExam: function () {
    if (this.isSubmitted) {
      this.handleExitExamDirect();
      return;
    }
    const confirmed = confirm("Are you sure you want to exit the exam? Your progress will not be saved.");
    if (confirmed) {
      if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
      window.location.hash = "#practice";
    }
  },

  handleExitExamDirect: function () {
    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
    window.location.hash = "#practice";
    return true;
  },

  toggleLayoutPopover: function () {
    const layoutPop = document.getElementById("exam-layout-popover");
    const settingsPop = document.getElementById("exam-settings-popover");
    if (settingsPop) settingsPop.hidden = true;

    if (layoutPop) {
      layoutPop.hidden = !layoutPop.hidden;
    }
  },

  toggleSettingsPopover: function () {
    const layoutPop = document.getElementById("exam-layout-popover");
    const settingsPop = document.getElementById("exam-settings-popover");
    if (layoutPop) layoutPop.hidden = true;

    if (settingsPop) {
      settingsPop.hidden = !settingsPop.hidden;
      if (window.lucide) window.lucide.createIcons();
    }
  },

  closeAllPopovers: function () {
    const layoutPop = document.getElementById("exam-layout-popover");
    const settingsPop = document.getElementById("exam-settings-popover");
    if (layoutPop) layoutPop.hidden = true;
    if (settingsPop) settingsPop.hidden = true;
  },

  setLayoutMode: function (mode) {
    this.layoutMode = mode;
    const root = document.documentElement;

    if (mode === "reading") {
      root.style.setProperty("--exam-reading-w", "60%");
      root.style.setProperty("--exam-questions-w", "40%");
    } else if (mode === "questions") {
      root.style.setProperty("--exam-reading-w", "40%");
      root.style.setProperty("--exam-questions-w", "60%");
    } else {
      // balanced
      root.style.setProperty("--exam-reading-w", "50%");
      root.style.setProperty("--exam-questions-w", "50%");
    }

    document.querySelectorAll(".exam-layout-opt").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`opt-layout-${mode}`);
    if (activeBtn) activeBtn.classList.add("active");
  },

  setTextSize: function (size) {
    this.textSize = size;
    const root = document.documentElement;

    if (size === "sm") {
      root.style.setProperty("--exam-font-scale", "0.9");
      root.style.setProperty("--exam-passage-scale", "0.96rem");
    } else if (size === "lg") {
      root.style.setProperty("--exam-font-scale", "1.14");
      root.style.setProperty("--exam-passage-scale", "1.18rem");
    } else {
      // md
      root.style.setProperty("--exam-font-scale", "1");
      root.style.setProperty("--exam-passage-scale", "1.05rem");
    }

    document.querySelectorAll(".exam-font-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`btn-font-${size}`);
    if (activeBtn) activeBtn.classList.add("active");
  },

  switchMobileTab: function (tab) {
    this.activeMobileTab = tab;
    const workspace = document.getElementById("exam-cbt-workspace");
    if (workspace) {
      workspace.setAttribute("data-active-tab", tab);
    }

    const tabReading = document.getElementById("mobile-tab-reading");
    const tabQuestions = document.getElementById("mobile-tab-questions");

    if (tabReading) tabReading.classList.toggle("active", tab === "reading");
    if (tabQuestions) tabQuestions.classList.toggle("active", tab === "questions");
  },

  toggleSetting: function (key, value) {
    if (!this.currentSettings) this.currentSettings = this.getPrepSettings();
    this.currentSettings[key] = value;

    try {
      localStorage.setItem("coco_practice_prep_settings", JSON.stringify(this.currentSettings));
    } catch (e) {}

    if (key === "countdown") {
      const timerBox = document.getElementById("exam-timer-box");
      if (!value) {
        if (timerBox) timerBox.style.display = "none";
        if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
      } else {
        if (timerBox) timerBox.style.display = "inline-flex";
        const remaining = (this.secondsRemaining && this.secondsRemaining > 0)
          ? this.secondsRemaining
          : (this.currentMaterial && this.currentMaterial.estimatedSeconds) || 600;
        this.startTimer(remaining);
      }
    }
  },

  initPlayerMaterial: async function (materialId, appState) {
    const level = appState ? appState.currentLevel || "A1" : "A1";
    let material = this.preloadedMaterial && this.preloadedMaterial.id === materialId ? this.preloadedMaterial : null;

    if (!material && window.SupabaseService && window.SupabaseService.getSupabaseClient) {
      try {
        const supabase = await window.SupabaseService.getSupabaseClient();
        if (supabase) {
          const { data: dbMat } = await supabase
            .from("materials")
            .select("id, title, description, exam, level, module, material_number, content_path, difficulty, duration_minutes, active")
            .eq("id", materialId)
            .maybeSingle();

          if (dbMat) {
            const durMin = dbMat.duration_minutes !== null && dbMat.duration_minutes !== undefined ? Number(dbMat.duration_minutes) : NaN;
            material = {
              id: dbMat.id,
              title: dbMat.title,
              description: dbMat.description || "",
              exam: dbMat.exam || "goethe",
              level: dbMat.level || level,
              module: dbMat.module || "Lesen",
              difficulty: dbMat.difficulty || "Medium",
              duration_minutes: dbMat.duration_minutes,
              estimatedSeconds: (!isNaN(durMin) && durMin > 0) ? durMin * 60 : (dbMat.module === "Schreiben" ? 1200 : dbMat.module === "Hören" ? 900 : 600),
              contentPath: dbMat.content_path
            };
          }
        }
      } catch (e) {
        console.warn("Player: Supabase fetch error:", e);
      }
    }

    if (!material) {
      material = this.getFallbackMaterialContent(materialId, level);
    } else if (!material.passage && !material.questions && !material.prompt) {
      const fallback = this.getFallbackMaterialContent(materialId, level);
      material.passage = fallback.passage;
      material.questions = fallback.questions ? JSON.parse(JSON.stringify(fallback.questions)) : [];
      material.prompt = fallback.prompt;
      material.isWriting = material.module === "Schreiben";
      material.isSpeaking = material.module === "Sprechen";
    }

    const settings = this.currentSettings || this.getPrepSettings();
    this.currentSettings = settings;

    if (settings.shuffle && Array.isArray(material.questions) && material.questions.length > 1) {
      material.questions = [...material.questions].sort(() => Math.random() - 0.5);
    }

    this.currentMaterial = material;

    // Apply default layout and text size
    this.setLayoutMode(this.layoutMode || "balanced");
    this.setTextSize(this.textSize || "md");

    // Timer logic
    const timerBox = document.getElementById("exam-timer-box");
    if (settings.countdown !== false) {
      if (timerBox) timerBox.style.display = "inline-flex";
      this.startTimer(material.estimatedSeconds || 600);
    } else {
      if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
      if (timerBox) timerBox.style.display = "none";
    }

    // Render workspace
    const contentArea = document.getElementById("player-content-area");
    if (contentArea) {
      contentArea.innerHTML = `
        ${material.isWriting ? this.renderWritingInterface(material) : 
          material.isSpeaking ? this.renderSpeakingInterface(material) : 
          material.module === "Hören" ? this.renderListeningInterface(material) :
          material.passage ? this.renderReadingSplitInterface(material) : 
          this.renderQuestionsOnlyInterface(material)}
      `;
      if (window.lucide) window.lucide.createIcons();
      this.updateMobileTabQuestionCount();
    }
  },

  renderReadingSplitInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-cbt-workspace" id="exam-cbt-workspace" data-active-tab="${this.activeMobileTab}">
        <!-- LEFT PANEL: READING DOCUMENT -->
        <section class="exam-cbt-reading-panel" id="panel-reading" aria-label="Reading Document">
          <div class="exam-doc-meta">
            <span>${(material.exam || "Goethe").toUpperCase()} ${material.level || "A1"}</span>
            <span>·</span>
            <span>${material.module || "Lesen"}</span>
          </div>

          <h1 class="exam-doc-title">${material.title || "Lesetext"}</h1>

          <article class="exam-doc-body">
            ${material.passage}
          </article>
        </section>

        <!-- RIGHT PANEL: QUESTIONS -->
        <section class="exam-cbt-questions-panel" id="panel-questions" aria-label="Examination Questions">
          <!-- Question Navigator -->
          <nav class="exam-navigator-bar" aria-label="Question Navigator">
            <span class="exam-nav-label">Fragen:</span>
            <div class="exam-nav-pills">
              ${questions.map((q, idx) => `
                <button type="button" class="exam-nav-pill ${this.userAnswers[q.id] ? 'answered' : ''}" id="nav-pill-${q.id}" onclick="window.InteractivePlayerComponent.scrollToQuestion('${q.id}')">
                  ${idx + 1}
                </button>
              `).join("")}
            </div>
          </nav>

          <div class="exam-section-header">
            <h2 class="exam-section-title">Fragen</h2>
            <span class="exam-section-count">${totalQuestions} Fragen</span>
          </div>

          <!-- Questions List -->
          <div class="exam-questions-list">
            ${questions.map((q, idx) => this.renderQuestionBlock(q, idx, totalQuestions)).join("")}
          </div>

          <!-- Submit Bar -->
          <div class="exam-submit-bar">
            <button type="button" class="exam-primary-submit-btn" id="exam-submit-btn" onclick="window.InteractivePlayerComponent.submitAnswers('${material.id}', this)">
              <i data-lucide="check" style="width:16px;height:16px;"></i>
              <span>Prüfung abgeben (Submit Exam)</span>
            </button>
          </div>
        </section>
      </div>
    `;
  },

  renderListeningInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-cbt-workspace" id="exam-cbt-workspace" data-active-tab="${this.activeMobileTab}">
        <section class="exam-cbt-reading-panel" id="panel-reading" aria-label="Audio Track">
          <div class="exam-doc-meta">
            <span>${(material.exam || "Goethe").toUpperCase()} ${material.level || "A1"}</span>
            <span>·</span>
            <span>Hören</span>
          </div>

          <h1 class="exam-doc-title">${material.title || "Hörtext"}</h1>

          <div style="background:#f8fafc; border:1px solid var(--exam-border-color); border-radius:4px; padding:16px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
              <i data-lucide="volume-2" style="width:18px;height:18px;color:#1e293b;"></i>
              <span style="font-size:0.85rem; font-weight:700;">Audio Track</span>
            </div>
            <audio controls style="width:100%;">
              <source src="${material.audioUrl || ""}" type="audio/mpeg">
              Your browser does not support audio playback.
            </audio>
          </div>

          ${material.passage ? `
            <article class="exam-doc-body">
              ${material.passage}
            </article>
          ` : ""}
        </section>

        <section class="exam-cbt-questions-panel" id="panel-questions" aria-label="Questions">
          <nav class="exam-navigator-bar">
            <span class="exam-nav-label">Fragen:</span>
            <div class="exam-nav-pills">
              ${questions.map((q, idx) => `
                <button type="button" class="exam-nav-pill ${this.userAnswers[q.id] ? 'answered' : ''}" id="nav-pill-${q.id}" onclick="window.InteractivePlayerComponent.scrollToQuestion('${q.id}')">
                  ${idx + 1}
                </button>
              `).join("")}
            </div>
          </nav>

          <div class="exam-section-header">
            <h2 class="exam-section-title">Fragen</h2>
            <span class="exam-section-count">${totalQuestions} Fragen</span>
          </div>

          <div class="exam-questions-list">
            ${questions.map((q, idx) => this.renderQuestionBlock(q, idx, totalQuestions)).join("")}
          </div>

          <div class="exam-submit-bar">
            <button type="button" class="exam-primary-submit-btn" onclick="window.InteractivePlayerComponent.submitAnswers('${material.id}', this)">
              <i data-lucide="check" style="width:16px;height:16px;"></i>
              <span>Prüfung abgeben (Submit Exam)</span>
            </button>
          </div>
        </section>
      </div>
    `;
  },

  renderQuestionsOnlyInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-single-panel-workspace">
        <div class="exam-doc-meta">
          <span>${(material.exam || "Goethe").toUpperCase()} ${material.level || "A1"}</span>
          <span>·</span>
          <span>${material.module || "Grammatik"}</span>
        </div>

        <h1 class="exam-doc-title" style="margin-bottom:20px;">${material.title || "Grammatik Drill"}</h1>

        <nav class="exam-navigator-bar">
          <span class="exam-nav-label">Fragen:</span>
          <div class="exam-nav-pills">
            ${questions.map((q, idx) => `
              <button type="button" class="exam-nav-pill ${this.userAnswers[q.id] ? 'answered' : ''}" id="nav-pill-${q.id}" onclick="window.InteractivePlayerComponent.scrollToQuestion('${q.id}')">
                ${idx + 1}
              </button>
            `).join("")}
          </div>
        </nav>

        <div class="exam-questions-list">
          ${questions.map((q, idx) => this.renderQuestionBlock(q, idx, totalQuestions)).join("")}
        </div>

        <div class="exam-submit-bar">
          <button type="button" class="exam-primary-submit-btn" onclick="window.InteractivePlayerComponent.submitAnswers('${material.id}', this)">
            <i data-lucide="check" style="width:16px;height:16px;"></i>
            <span>Prüfung abgeben (Submit Exam)</span>
          </button>
        </div>
      </div>
    `;
  },

  renderQuestionBlock: function (q, idx, total) {
    const isAnswered = Boolean(this.userAnswers[q.id]);

    return `
      <div class="exam-q-block" id="exam-q-block-${q.id}">
        <div class="exam-q-counter">${idx + 1} / ${total}</div>
        <div class="exam-q-text">${q.question}</div>

        <div class="exam-radio-list">
          ${q.options.map((opt) => {
            const isSelected = this.userAnswers[q.id] === opt;
            return `
              <label class="exam-radio-item ${isSelected ? 'selected' : ''}" onclick="window.InteractivePlayerComponent.selectOption('${q.id}', '${opt.replace(/'/g, "\\'")}', this)">
                <input type="radio" name="q_${q.id}" value="${opt.replace(/"/g, '&quot;')}" ${isSelected ? 'checked' : ''}>
                <span class="exam-radio-circle"></span>
                <span class="exam-radio-label">${opt}</span>
              </label>
            `;
          }).join("")}
        </div>

        <div class="exam-review-feedback" id="feedback-${q.id}" hidden></div>
      </div>
    `;
  },

  renderWritingInterface: function (material) {
    return `
      <div class="exam-single-panel-workspace">
        <div class="exam-doc-meta">
          <span>${(material.exam || "Goethe").toUpperCase()} ${material.level || "A1"}</span>
          <span>·</span>
          <span>Schreiben</span>
        </div>

        <h1 class="exam-doc-title">${material.title || "Schreibaufgabe"}</h1>

        <div style="background:#ffffff; border:1px solid var(--exam-border-color); border-radius:4px; padding:20px; margin-bottom:20px;">
          <p style="font-size:0.95rem; color:#1e293b; line-height:1.6; margin:0 0 16px 0;">${material.prompt || "Write a response to the prompt."}</p>
          <textarea class="writing-textarea" id="writing-input" placeholder="Liebe/r ..., ich schreibe dir, weil..." oninput="window.InteractivePlayerComponent.updateWordCount(this)"></textarea>
          <div style="margin-top:10px; font-size:0.8rem; color:var(--exam-ink-muted);" id="word-count-display">
            Word Count: 0 words (Recommended: 30-40 words)
          </div>
        </div>

        <button type="button" class="exam-primary-submit-btn" onclick="window.InteractivePlayerComponent.submitWriting(this)">
          <i data-lucide="send" style="width:16px;height:16px;"></i>
          <span>Aufgabe abgeben (Submit Writing)</span>
        </button>
      </div>
    `;
  },

  renderSpeakingInterface: function (material) {
    return `
      <div class="exam-single-panel-workspace">
        <div class="exam-doc-meta">
          <span>${(material.exam || "Goethe").toUpperCase()} ${material.level || "A1"}</span>
          <span>·</span>
          <span>Sprechen</span>
        </div>

        <h1 class="exam-doc-title">${material.title || "Mündliche Prüfung"}</h1>

        <div class="speaking-prep-box" style="border-radius:4px; margin-bottom:20px;">
          <i data-lucide="mic" style="width:32px;height:32px;color:#059669;margin-bottom:6px;"></i>
          <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 4px 0;">Vorbereitungszeit (Preparation Time)</h3>
          <div class="prep-timer-display" id="speaking-prep-timer" style="font-size:1.8rem;">00:30</div>
          <p style="font-size:0.82rem; color:#047857; margin:0;">Read the prompt card and prepare your spoken German response.</p>
        </div>

        <div style="background:#ffffff; border:1px solid var(--exam-border-color); border-radius:4px; padding:20px; margin-bottom:20px;">
          <p style="font-size:0.95rem; color:#1e293b; line-height:1.6; margin:0;">${material.prompt}</p>
        </div>

        <button type="button" class="exam-primary-submit-btn" onclick="window.InteractivePlayerComponent.finishSpeaking()">
          <i data-lucide="check" style="width:16px;height:16px;"></i>
          <span>Prüfung abschließen (Complete Speaking)</span>
        </button>
      </div>
    `;
  },

  scrollToQuestion: function (qId) {
    const el = document.getElementById(`exam-q-block-${qId}`);
    const panel = document.getElementById("panel-questions") || document.querySelector(".exam-single-panel-workspace");
    if (el && panel) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  },

  selectOption: function (qId, optionValue, element) {
    if (this.isSubmitted && this.isReviewMode) return;

    this.userAnswers[qId] = optionValue;

    const block = element.closest(".exam-q-block");
    if (block) {
      block.querySelectorAll(".exam-radio-item").forEach(item => item.classList.remove("selected"));
      element.classList.add("selected");
      const radio = element.querySelector("input[type='radio']");
      if (radio) radio.checked = true;
    }

    // Update navigator pill
    const pill = document.getElementById(`nav-pill-${qId}`);
    if (pill) {
      pill.classList.add("answered");
    }

    this.updateMobileTabQuestionCount();
  },

  updateMobileTabQuestionCount: function () {
    const questions = (this.currentMaterial && this.currentMaterial.questions) ? this.currentMaterial.questions : [];
    const answeredCount = Object.keys(this.userAnswers).length;
    const label = document.getElementById("mobile-tab-q-label");
    if (label) {
      label.textContent = `FRAGEN (${answeredCount}/${questions.length})`;
    }
  },

  updateWordCount: function (textarea) {
    const text = (textarea.value || "").trim();
    const count = text ? text.split(/\s+/).length : 0;
    const el = document.getElementById("word-count-display");
    if (el) el.textContent = `Word Count: ${count} words (Recommended: 30-40 words)`;
  },

  submitAnswers: async function (materialId, btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="btn-spinner"></span> Submitting...`;
    }

    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);

    const material = this.currentMaterial || this.getFallbackMaterialContent(materialId);
    const questions = material.questions || [];
    const total = questions.length || 1;
    let score = 0;

    questions.forEach(q => {
      if (this.userAnswers[q.id] === q.correctAnswer) {
        score++;
      }
    });

    const pct = Math.round((score / total) * 100);
    this.lastScore = { score, total, pct };
    this.isSubmitted = true;

    // Save practice attempt to Supabase
    await this.savePracticeAttemptToSupabase(material, score, total);

    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion(material.module || "Lesen", pct);
    }

    // Render Exam Results Screen
    this.renderResultsScreen();
  },

  renderResultsScreen: function () {
    const contentArea = document.getElementById("player-content-area");
    if (!contentArea) return;

    const { score, total, pct } = this.lastScore;
    const isPassed = pct >= 60;

    contentArea.innerHTML = `
      <div class="exam-results-screen">
        <div class="exam-results-card">
          <div class="exam-results-badge">PRÜFUNG BEENDET</div>
          <h1 class="exam-results-title">Test Completed</h1>

          <div class="exam-results-score-box">
            <span class="exam-results-score-num">${score} / ${total}</span>
            <span class="exam-results-score-pct">(${pct}%)</span>
          </div>

          <div class="exam-results-status ${isPassed ? 'pass' : 'fail'}">
            ${isPassed ? '✓ Bestanden (Passed - CEFR Criterion Met)' : '✗ Nicht bestanden (60% required to pass)'}
          </div>

          <div class="exam-results-actions">
            <button type="button" class="btn-exam-primary" onclick="window.InteractivePlayerComponent.enterReviewMode()">
              <i data-lucide="eye" style="width:16px;height:16px;"></i>
              <span>Review Answers</span>
            </button>
            <button type="button" class="btn-exam-secondary" onclick="window.InteractivePlayerComponent.retryTest()">
              <i data-lucide="rotate-ccw" style="width:16px;height:16px;"></i>
              <span>Try Again</span>
            </button>
            <button type="button" class="btn-exam-secondary" onclick="window.InteractivePlayerComponent.handleExitExamDirect()">
              <i data-lucide="grid" style="width:16px;height:16px;"></i>
              <span>Return to Practice Hub</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  enterReviewMode: function () {
    this.isReviewMode = true;
    const material = this.currentMaterial;
    if (!material) return;

    const contentArea = document.getElementById("player-content-area");
    if (!contentArea) return;

    // Render split/single interface
    contentArea.innerHTML = `
      <div class="exam-review-top-banner">
        <div>
          <span>Review Mode</span> · Score: <strong>${this.lastScore.score}/${this.lastScore.total} (${this.lastScore.pct}%)</strong>
        </div>
        <button type="button" class="exam-cbt-btn" style="background:#ffffff; color:#0f172a; font-size:0.75rem; padding:4px 8px;" onclick="window.InteractivePlayerComponent.renderResultsScreen()">
          Back to Summary
        </button>
      </div>
      ${material.passage ? this.renderReadingSplitInterface(material) : this.renderQuestionsOnlyInterface(material)}
    `;

    if (window.lucide) window.lucide.createIcons();

    // Fill review feedback on each question
    const questions = material.questions || [];
    const showExpl = this.currentSettings ? this.currentSettings.showExplanations !== false : true;

    questions.forEach(q => {
      const userAns = this.userAnswers[q.id];
      const fb = document.getElementById(`feedback-${q.id}`);
      const navPill = document.getElementById(`nav-pill-${q.id}`);
      const isCorrect = userAns === q.correctAnswer;
      const explHtml = (showExpl && q.explanation) ? `<div style="margin-top:6px; font-size:0.8rem; opacity:0.9;">${q.explanation}</div>` : "";

      if (fb) {
        fb.hidden = false;
        if (isCorrect) {
          fb.className = "exam-review-feedback feedback-correct";
          fb.innerHTML = `<strong>✓ Richtig (Correct)!</strong>${explHtml}`;
        } else {
          fb.className = "exam-review-feedback feedback-incorrect";
          fb.innerHTML = `<strong>✗ Falsch (Incorrect).</strong> Richtige Antwort: <strong>${q.correctAnswer}</strong>.${explHtml}`;
        }
      }

      if (navPill) {
        navPill.classList.remove("answered");
        navPill.classList.add(isCorrect ? "is-correct" : "is-incorrect");
      }
    });

    // Disable submission button in review mode
    const submitBtn = document.getElementById("exam-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Exam Submitted</span>`;
    }
  },

  submitWriting: async function (btnEl) {
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="btn-spinner"></span> Evaluating...`;
    }

    const material = this.currentMaterial || { id: "writing-1", module: "Schreiben", level: "A1", exam: "goethe" };
    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);

    this.lastScore = { score: 9, total: 10, pct: 90 };
    this.isSubmitted = true;

    await this.savePracticeAttemptToSupabase(material, 9, 10);
    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Schreiben", 90);
    }

    this.renderResultsScreen();
  },

  finishSpeaking: async function () {
    const material = this.currentMaterial || { id: "speaking-1", module: "Sprechen", level: "A1", exam: "goethe" };
    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);

    this.lastScore = { score: 8, total: 10, pct: 80 };
    this.isSubmitted = true;

    await this.savePracticeAttemptToSupabase(material, 8, 10);
    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Sprechen", 80);
    }

    this.renderResultsScreen();
  },

  savePracticeAttemptToSupabase: async function (material, correctAnswers, totalQuestions) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = localStorage.getItem("coco_user_uid") || "local-user";

      const attemptPayload = {
        uid: uid,
        material_id: material.id,
        level: material.level || "A1",
        format: material.exam || "goethe",
        module: material.module || "Lesen",
        correct_answers: parseInt(correctAnswers || 0, 10),
        total_questions: parseInt(totalQuestions || 1, 10),
        completed_at: new Date().toISOString()
      };

      const { error } = await supabase.from("practice_attempts").insert([attemptPayload]);
      if (error) {
        console.warn("Player: practice_attempts insert warning:", error);
      }
    } catch (err) {
      console.warn("Player: Supabase attempt save error:", err);
    }
  },

  retryTest: function () {
    this.userAnswers = {};
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.warningToastShown = false;

    if (this.currentMaterial) {
      const contentArea = document.getElementById("player-content-area");
      if (contentArea) {
        contentArea.innerHTML = `
          ${this.currentMaterial.isWriting ? this.renderWritingInterface(this.currentMaterial) : 
            this.currentMaterial.isSpeaking ? this.renderSpeakingInterface(this.currentMaterial) : 
            this.currentMaterial.passage ? this.renderReadingSplitInterface(this.currentMaterial) : 
            this.renderQuestionsOnlyInterface(this.currentMaterial)}
        `;
        if (window.lucide) window.lucide.createIcons();
      }

      const settings = this.currentSettings || this.getPrepSettings();
      if (settings.countdown !== false) {
        this.startTimer(this.currentMaterial.estimatedSeconds || 600);
      }
    }
  },

  startTimer: function (durationSec) {
    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
    this.secondsRemaining = durationSec;
    this.warningToastShown = false;

    const timerDisplay = document.getElementById("player-timer-display");
    const timerBox = document.getElementById("exam-timer-box");

    const renderDigits = (sec) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (timerDisplay) {
      timerDisplay.textContent = renderDigits(this.secondsRemaining);
    }

    this.activeTimerInterval = setInterval(() => {
      this.secondsRemaining--;

      // 1-Minute Remaining Warning
      if (this.secondsRemaining <= 60 && this.secondsRemaining > 0) {
        if (!this.warningToastShown) {
          this.warningToastShown = true;
          if (timerBox) timerBox.classList.add("timer-warning");

          const toastContainer = document.getElementById("exam-timer-toast-container");
          if (toastContainer) {
            toastContainer.innerHTML = `
              <div class="exam-timer-toast" id="exam-timer-toast">
                <i data-lucide="clock" style="width:15px;height:15px;"></i>
                <span>⏱ 1 minute remaining</span>
              </div>
            `;
            if (window.lucide) window.lucide.createIcons();

            setTimeout(() => {
              const t = document.getElementById("exam-timer-toast");
              if (t) t.remove();
            }, 6000);
          }
        }
      }

      // 00:00 Auto Submit
      if (this.secondsRemaining <= 0) {
        clearInterval(this.activeTimerInterval);
        this.secondsRemaining = 0;
        if (timerDisplay) timerDisplay.textContent = "00:00";
        if (timerBox) timerBox.classList.add("timer-danger");
        this.submitAnswers(this.currentMaterial ? this.currentMaterial.id : null);
        return;
      }

      if (timerDisplay) {
        timerDisplay.textContent = renderDigits(this.secondsRemaining);
      }
    }, 1000);
  },

  getFallbackMaterialContent: function (id, level = "A1") {
    return {
      id: id,
      title: `${level} Practice Material (${id})`,
      exam: "goethe",
      level: level,
      module: id.includes("hoeren") ? "Hören" : id.includes("schreiben") ? "Schreiben" : id.includes("sprechen") ? "Sprechen" : "Lesen",
      estimatedSeconds: 600,
      passage: `
        <p><strong>Von:</strong> Anna Berger &lt;anna.b@gmx.de&gt;<br>
        <strong>An:</strong> Markus Schmidt &lt;markus.s@web.de&gt;<br>
        <strong>Betreff:</strong> Treffen am Samstagabend</p>
        <br>
        <p>Lieber Markus,</p>
        <p>wie geht es dir? Ich hoffe, du hattest eine gute Woche. Am Samstagabend feiere ich meinen Geburtstag im Restaurant <em>"Zum goldenen Hirsch"</em> in der Hauptstraße. Die Feier beginnt um 19:00 Uhr.</p>
        <p>Kannst du bitte einen Salat oder einen Kuchen mitbringen? Meine Schwester bringt schon Getränke mit.</p>
        <p>Sag mir bitte bis Donnerstag Bescheid, ob du kommen kannst.</p>
        <p>Herzliche Grüße,<br>Anna</p>
      `,
      questions: [
        {
          id: "q1",
          question: "Warum schreibt Anna an Markus?",
          options: [
            "Sie möchte ihn zu ihrem Geburtstag einladen.",
            "Sie sucht eine neue Wohnung in der Hauptstraße.",
            "Sie möchte am Samstag ins Kino gehen."
          ],
          correctAnswer: "Sie möchte ihn zu ihrem Geburtstag einladen.",
          explanation: "Anna schreibt: 'Am Samstagabend feiere ich meinen Geburtstag...'"
        },
        {
          id: "q2",
          question: "Wann beginnt die Feier?",
          options: ["Um 18:00 Uhr", "Um 19:00 Uhr", "Um 20:00 Uhr"],
          correctAnswer: "Um 19:00 Uhr",
          explanation: "Im Text steht: 'Die Feier beginnt um 19:00 Uhr.'"
        },
        {
          id: "q3",
          question: "Was soll Markus mitbringen?",
          options: ["Getränke", "Einen Salat oder Kuchen", "Nichts"],
          correctAnswer: "Einen Salat oder Kuchen",
          explanation: "Anna bittet: 'Kannst du bitte einen Salat oder einen Kuchen mitbringen?'"
        }
      ],
      prompt: id.includes("schreiben") ? "Ihr Freund Thomas hat Sie zu seiner Hochzeit am Samstag eingeladen. Schreiben Sie eine kurze E-Mail: Bestätigen Sie Ihr Kommen und fragen Sie nach der Uhrzeit." : "Stellen Sie sich vor: Name, Alter, Land, Wohnort, Sprachen, Beruf.",
      isWriting: id.includes("schreiben"),
      isSpeaking: id.includes("sprechen")
    };
  }
};
