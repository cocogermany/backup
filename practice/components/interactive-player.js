/**
 * Coco Germany Practice App - Interactive Player Component (CBT Exam Mode)
 * components/interactive-player.js
 *
 * Computer-based language examination interface with:
 * - Two Visual Modes: STYLE ON (Premium Coco) / STYLE OFF (Utilitarian Exam)
 * - Fixed Top Header with Exit, Countdown / Overtime timer, Layout popover & Style toggle
 * - Fixed Question Progress Navigator directly below header
 * - Desktop & Mobile dynamic layout modes (50/50, 60/40, 40/60, Vertical, Full Focus)
 * - Click-outside & Escape key popover dismissal
 * - Custom Exit & Time-Expired Dialogs (No native alert/confirm)
 * - Overtime negative timer (-00:01, -00:02...)
 * - Zero feedback during exam; full review mode with green/red navigator post-submission
 */

window.InteractivePlayerComponent = {
  timerStarted: false,
  hasTimerStarted: false,
  activeTimerInterval: null,
  secondsRemaining: 0,
  isOvertime: false,
  overtimeSeconds: 0,
  userAnswers: {},
  currentMaterial: null,
  currentSettings: null,
  preloadedMaterial: null,
  styleMode: "on", // "on" (default) | "off"
  layoutMode: "h-split", // "h-split", "reading-focus", "questions-focus", "v-split", "reading-full", "questions-full"
  activeMobileTab: "reading", // "reading" | "questions"
  isSubmitted: false,
  isReviewMode: false,
  lastScore: { score: 0, total: 0, pct: 0 },
  warningToastShown: false,
  timeExpiredModalShown: false,
  activeQuestionId: null,
  renderRequestId: 0,

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

  getSavedStyleMode: function () {
    try {
      const saved = localStorage.getItem("coco_exam_style_mode");
      if (saved === "off" || saved === "on") return saved;
    } catch (e) {}
    return "on"; // Default ON
  },

  escapeHtml: function (value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  escapeInlineJavaScript: function (value) {
    return JSON.stringify(String(value ?? ""))
      .replace(/'/g, "\\u0027")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e");
  },

  sanitizeRichText: function (value) {
    const text = String(value ?? "");
    if (typeof document === "undefined") return this.escapeHtml(text);

    const template = document.createElement("template");
    template.innerHTML = text;
    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  },

  resolveWorkerUrl: function (path) {
    const value = String(path || "").trim();
    if (!value) return "";

    try {
      const workerBase = window.SupabaseService && typeof window.SupabaseService.getWorkerBaseUrl === "function"
        ? window.SupabaseService.getWorkerBaseUrl()
        : "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";
      return new URL(value, `${workerBase.replace(/\/$/, "")}/`).href;
    } catch (error) {
      console.warn("Player: Invalid material asset URL:", value);
      return "";
    }
  },

  normalizeMaterialContent: function (content) {
    if (!content || typeof content !== "object") return {};

    const sourceQuestions = Array.isArray(content.questions) ? content.questions : [];
    const questions = sourceQuestions.map((question, index) => {
      const options = Array.isArray(question?.options)
        ? question.options.map((option) => String(option ?? "")).filter(Boolean)
        : [];
      if (!options.length) return null;

      return {
        id: String(question.id || `q-${index + 1}`),
        question: String(question.question || question.prompt || ""),
        options,
        correctAnswer: String(question.correctAnswer ?? question.correct_answer ?? ""),
        explanation: String(question.explanation || ""),
      };
    }).filter(Boolean);

    const audioPath = content.audioUrl || content.audio_url || content.audioPath || content.audio_path;
    return {
      ...(typeof content.passage === "string" ? { passage: content.passage } : {}),
      ...(typeof content.prompt === "string" ? { prompt: content.prompt } : {}),
      ...(typeof content.title === "string" ? { contentTitle: content.title } : {}),
      ...(questions.length ? { questions } : {}),
      ...(audioPath ? { audioUrl: this.resolveWorkerUrl(audioPath) } : {}),
    };
  },

  fetchMaterialContent: async function (contentPath) {
    const contentUrl = this.resolveWorkerUrl(contentPath);
    if (!contentUrl) return {};

    try {
      // Prevent stale browser/CDN caching: append cache-busting query param and set cache: "no-store"
      const urlObj = new URL(contentUrl);
      urlObj.searchParams.set("v", Date.now().toString());

      const response = await fetch(urlObj.href, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return this.normalizeMaterialContent(await response.json());
    } catch (error) {
      console.warn("Player: Material content could not be loaded; using the available fallback.", error);
      return {};
    }
  },

  stopTimer: function () {
    if (this.activeTimerInterval) {
      clearInterval(this.activeTimerInterval);
      this.activeTimerInterval = null;
    }
    this.timerStarted = false;
  },

  cleanup: function () {
    this.renderRequestId += 1;
    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;
    this.secondsRemaining = 0;
    this.timeExpiredModalShown = false;
    this.isOvertime = false;
    this.overtimeSeconds = 0;
    if (this._clickHandler) document.removeEventListener("click", this._clickHandler);
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    if (this._routeHandler) window.removeEventListener("hashchange", this._routeHandler);
    if (this._questionEventRoot && this._questionChangeHandler) {
      this._questionEventRoot.removeEventListener("change", this._questionChangeHandler);
    }
    this._clickHandler = null;
    this._keyHandler = null;
    this._routeHandler = null;
    this._questionEventRoot = null;
    this._questionChangeHandler = null;
  },

  render: function (appState, queryParams) {
    const materialId = queryParams ? queryParams.get("id") || "GoA1LM001" : "GoA1LM001";
    const renderRequestId = ++this.renderRequestId;

    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;
    this.secondsRemaining = 0;
    this.isOvertime = false;
    this.overtimeSeconds = 0;

    this.userAnswers = {};
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.warningToastShown = false;
    this.timeExpiredModalShown = false;
    this.activeMobileTab = "reading";
    this.styleMode = this.getSavedStyleMode();
    this.layoutMode = "h-split";

    const settings = this.currentSettings || this.getPrepSettings();
    this.currentSettings = settings;

    // Attach global click-outside and keydown handlers
    this.setupGlobalListeners();

    // Schedule async material fetch from Supabase (or reuse preloaded material)
    setTimeout(() => {
      this.initPlayerMaterial(materialId, appState, renderRequestId);
    }, 0);

    const isTimerHidden = settings.countdown === false;
    const isStyleOn = this.styleMode === "on";

    return `
      <div class="exam-cbt-root ${isStyleOn ? 'style-on' : 'style-off'}" id="player-main-container" data-layout-mode="${this.layoutMode}">
        <!-- FIXED CBT EXAM HEADER (~58px) -->
        <header class="exam-cbt-header" id="exam-cbt-header">
          <div class="exam-cbt-header-left">
            <button type="button" class="exam-cbt-btn" id="exam-exit-btn" onclick="window.InteractivePlayerComponent.openExitModal()" title="Leave Exam">
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
            <!-- Display / Layout Button -->
            <button type="button" class="exam-cbt-btn exam-cbt-btn-icon" id="exam-layout-btn" onclick="window.InteractivePlayerComponent.toggleLayoutPopover(event)" title="Display Layout" aria-label="Display Layout">
              <i data-lucide="layout-grid" style="width:16px;height:16px;"></i>
            </button>

            <!-- Dedicated Style Toggle: ON / OFF -->
            <button type="button" class="exam-style-toggle-btn" id="exam-style-toggle-btn" onclick="window.InteractivePlayerComponent.toggleStyleMode()" title="Toggle Visual Style Mode">
              <span>${isStyleOn ? '✨ Style ON' : 'Style OFF'}</span>
            </button>
          </div>
        </header>

        <!-- FIXED QUESTION PROGRESS BAR (Directly below Header) -->
        <nav class="exam-fixed-progress-bar" id="exam-fixed-progress-bar" aria-label="Question Progress">
          <span class="exam-progress-label">Fragen:</span>
          <div class="exam-progress-track" id="exam-progress-track">
            <!-- Rendered dynamically -->
          </div>
        </nav>

        <!-- 1-Minute Warning Banner -->
        <div id="exam-timer-toast-container"></div>

        <!-- FLOATING DISPLAY LAYOUT POPOVER -->
        <div class="exam-popover" id="exam-layout-popover" hidden onclick="event.stopPropagation()">
          <div class="exam-popover-header">Display Layout</div>
          <div class="exam-layout-grid-options">
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'h-split' ? 'active' : ''}" id="opt-layout-h-split" onclick="window.InteractivePlayerComponent.setLayoutMode('h-split')">
              <span>Horizontal</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">50 / 50</span>
            </button>
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'reading-focus' ? 'active' : ''}" id="opt-layout-reading-focus" onclick="window.InteractivePlayerComponent.setLayoutMode('reading-focus')">
              <span>Reading Focus</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">60 / 40</span>
            </button>
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'questions-focus' ? 'active' : ''}" id="opt-layout-questions-focus" onclick="window.InteractivePlayerComponent.setLayoutMode('questions-focus')">
              <span>Question Focus</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">40 / 60</span>
            </button>
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'v-split' ? 'active' : ''}" id="opt-layout-v-split" onclick="window.InteractivePlayerComponent.setLayoutMode('v-split')">
              <span>Vertical</span>
              <span style="font-family:var(--font-mono, monospace); font-size:0.75rem; color:var(--exam-ink-muted);">50 / 50</span>
            </button>
            <div class="exam-layout-divider" style="height:1px; background:#e2e8f0; margin:4px 0;"></div>
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'reading-full' ? 'active' : ''}" id="opt-layout-reading-full" onclick="window.InteractivePlayerComponent.setLayoutMode('reading-full')">
              <span>Reading</span>
              <span style="font-size:0.75rem; color:var(--exam-ink-muted);">Full Focus</span>
            </button>
            <button type="button" class="exam-layout-opt-btn ${this.layoutMode === 'questions-full' ? 'active' : ''}" id="opt-layout-questions-full" onclick="window.InteractivePlayerComponent.setLayoutMode('questions-full')">
              <span>Questions</span>
              <span style="font-size:0.75rem; color:var(--exam-ink-muted);">Full Focus</span>
            </button>
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

        <!-- CUSTOM EXIT CONFIRMATION DIALOG (No native confirm) -->
        <div class="exam-custom-modal-backdrop" id="exam-exit-modal" hidden>
          <div class="exam-custom-modal-card">
            <h2 class="exam-custom-modal-title">Leave exam?</h2>
            <p class="exam-custom-modal-desc">Your current answers will not be saved if you leave now.</p>
            <div class="exam-custom-modal-actions">
              <button type="button" class="btn-exam-secondary" onclick="window.InteractivePlayerComponent.closeExitModal()">
                Stay in Exam
              </button>
              <button type="button" class="btn-exam-primary" style="background:#b91c1c; border-color:#b91c1c;" onclick="window.InteractivePlayerComponent.confirmExitExam()">
                Exit Exam
              </button>
            </div>
          </div>
        </div>

        <!-- CUSTOM TIME-EXPIRED DIALOG (No native alert) -->
        <div class="exam-custom-modal-backdrop" id="exam-time-expired-modal" hidden>
          <div class="exam-custom-modal-card">
            <h2 class="exam-custom-modal-title">Time is up</h2>
            <p class="exam-custom-modal-desc">Your allocated exam time has ended. Would you like to continue in overtime or complete the exam now?</p>
            <div class="exam-custom-modal-actions">
              <button type="button" class="btn-exam-secondary" onclick="window.InteractivePlayerComponent.continueInOvertime()">
                Continue (Overtime)
              </button>
              <button type="button" class="btn-exam-primary" onclick="window.InteractivePlayerComponent.completeExamNow()">
                Complete Exam
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  setupGlobalListeners: function () {
    // Remove previous listeners if present
    if (this._clickHandler) document.removeEventListener("click", this._clickHandler);
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    if (this._routeHandler) window.removeEventListener("hashchange", this._routeHandler);

    this._clickHandler = (e) => {
      const popover = document.getElementById("exam-layout-popover");
      const btn = document.getElementById("exam-layout-btn");
      if (popover && !popover.hidden) {
        if (!popover.contains(e.target) && !btn.contains(e.target)) {
          popover.hidden = true;
        }
      }
    };

    this._keyHandler = (e) => {
      if (e.key === "Escape") {
        const popover = document.getElementById("exam-layout-popover");
        if (popover) popover.hidden = true;
        const exitModal = document.getElementById("exam-exit-modal");
        if (exitModal && !exitModal.hidden) exitModal.hidden = true;
      }
    };

    this._routeHandler = () => {
      if (window.location.hash.split("?")[0] !== "#player") this.cleanup();
    };

    document.addEventListener("click", this._clickHandler);
    document.addEventListener("keydown", this._keyHandler);
    window.addEventListener("hashchange", this._routeHandler);
  },

  toggleStyleMode: function () {
    this.styleMode = this.styleMode === "on" ? "off" : "on";
    try {
      localStorage.setItem("coco_exam_style_mode", this.styleMode);
    } catch (e) {}

    const container = document.getElementById("player-main-container");
    const toggleBtn = document.getElementById("exam-style-toggle-btn");

    if (container) {
      container.classList.toggle("style-on", this.styleMode === "on");
      container.classList.toggle("style-off", this.styleMode === "off");
    }

    if (toggleBtn) {
      toggleBtn.innerHTML = `<span>${this.styleMode === "on" ? '✨ Style ON' : 'Style OFF'}</span>`;
    }
  },

  toggleLayoutPopover: function (e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById("exam-layout-popover");
    if (popover) {
      popover.hidden = !popover.hidden;
    }
  },

  setLayoutMode: function (mode) {
    this.layoutMode = mode;
    const rootContainer = document.getElementById("player-main-container");
    if (rootContainer) {
      rootContainer.setAttribute("data-layout-mode", mode);
    }
    const workspace = document.getElementById("exam-cbt-workspace");
    if (workspace) {
      // Remove previous layout classes
      workspace.classList.remove(
        "layout-h-split",
        "layout-reading-focus",
        "layout-questions-focus",
        "layout-v-split",
        "layout-reading-full",
        "layout-questions-full"
      );
      workspace.classList.add(`layout-${mode}`);
    }

    document.querySelectorAll(".exam-layout-opt-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`opt-layout-${mode}`);
    if (activeBtn) activeBtn.classList.add("active");

    // Close layout menu after selection
    const popover = document.getElementById("exam-layout-popover");
    if (popover) popover.hidden = true;
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

  openExitModal: function () {
    if (this.isSubmitted) {
      this.confirmExitExam();
      return;
    }
    const modal = document.getElementById("exam-exit-modal");
    if (modal) modal.hidden = false;
  },

  closeExitModal: function () {
    const modal = document.getElementById("exam-exit-modal");
    if (modal) modal.hidden = true;
  },

  confirmExitExam: function () {
    this.cleanup();
    window.location.hash = "#practice";
  },

  continueInOvertime: function () {
    const modal = document.getElementById("exam-time-expired-modal");
    if (modal) modal.hidden = true;

    this.isOvertime = true;
    const timerBox = document.getElementById("exam-timer-box");
    if (timerBox) {
      timerBox.classList.remove("timer-warning");
      timerBox.classList.add("timer-overtime");
    }

    // Start negative count-up timer
    this.startOvertimeTimer();
  },

  completeExamNow: function () {
    const modal = document.getElementById("exam-time-expired-modal");
    if (modal) modal.hidden = true;
    this.submitAnswers(this.currentMaterial ? this.currentMaterial.id : null);
  },

  initPlayerMaterial: async function (materialId, appState, renderRequestId = this.renderRequestId) {
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
            .eq("active", true)
            .maybeSingle();

          if (dbMat) {
            const durMin = dbMat.duration_minutes !== null && dbMat.duration_minutes !== undefined ? Number(dbMat.duration_minutes) : NaN;
            material = {
              id: dbMat.id,
              title: dbMat.title,
              description: dbMat.description || "",
              exam: dbMat.exam || "goethe",
              level: dbMat.level || level,
              module: dbMat.module === "Grammar" ? "Grammatik" : (dbMat.module || "Lesen"),
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

    if (renderRequestId !== this.renderRequestId) return;

    // Practice Hub preloads the Supabase column as content_path, while a direct
    // player lookup maps it to contentPath. Support both paths before falling
    // back so the uploaded material JSON is always requested.
    const contentPath = material && (material.contentPath || material.content_path);
    if (contentPath) {
      const content = await this.fetchMaterialContent(contentPath);
      if (renderRequestId !== this.renderRequestId) return;
      material = { ...material, ...content };
    }

    if (!material) {
      material = this.getFallbackMaterialContent(materialId, level);
    } else if (!material.passage && !material.questions && !material.prompt) {
      const fallback = this.getFallbackMaterialContent(materialId, level);
      material.passage = fallback.passage;
      material.questions = fallback.questions ? JSON.parse(JSON.stringify(fallback.questions)) : [];
      material.prompt = fallback.prompt;
    }

    material.module = material.module === "Grammar" ? "Grammatik" : (material.module || "Lesen");
    material.isWriting = material.module === "Schreiben";
    material.isSpeaking = material.module === "Sprechen";
    material.questions = Array.isArray(material.questions) ? material.questions : [];

    const settings = this.currentSettings || this.getPrepSettings();
    this.currentSettings = settings;

    if (settings.shuffle && Array.isArray(material.questions) && material.questions.length > 1) {
      material.questions = [...material.questions].sort(() => Math.random() - 0.5);
    }

    this.currentMaterial = material;

    // Render fixed progress bar
    this.renderFixedProgressBar(material.questions || []);

    // Timer logic
    const timerBox = document.getElementById("exam-timer-box");
    if (settings.countdown !== false) {
      if (timerBox) timerBox.style.display = "inline-flex";
      const durSec = Number(material.estimatedSeconds);
      const safeDuration = (!isNaN(durSec) && durSec > 0) ? durSec : 600;
      this.startTimer(safeDuration);
    } else {
      this.stopTimer();
      this.timerStarted = false;
      this.hasTimerStarted = false;
      if (timerBox) timerBox.style.display = "none";
    }

    // Render workspace
    this.mountMaterialWorkspace(document.getElementById("player-content-area"), material);
  },

  renderMaterialWorkspace: function (material) {
    if (material.isWriting) return this.renderWritingInterface(material);
    if (material.isSpeaking) return this.renderSpeakingInterface(material);
    if (material.module === "Hören") return this.renderListeningInterface(material);
    if (material.module === "Grammatik") return this.renderGrammatikInterface(material);
    if (material.passage) return this.renderReadingSplitInterface(material);
    return this.renderQuestionsOnlyInterface(material);
  },

  mountMaterialWorkspace: function (contentArea, material) {
    if (!contentArea) return;
    contentArea.innerHTML = this.renderMaterialWorkspace(material);
    this.bindQuestionOptionEvents(contentArea);
    if (window.lucide) window.lucide.createIcons();
    this.setLayoutMode(this.layoutMode);
    this.updateMobileTabQuestionCount();
  },

  renderFixedProgressBar: function (questions) {
    const track = document.getElementById("exam-progress-track");
    if (!track) return;

    if (!questions || questions.length === 0) {
      track.innerHTML = `<span style="font-size:0.8rem; color:var(--exam-ink-muted);">Schreib-/Sprechaufgabe</span>`;
      return;
    }

    track.innerHTML = questions.map((q, idx) => `
      <button type="button" class="exam-progress-pill ${this.userAnswers[q.id] ? 'answered' : ''}" id="nav-pill-${this.escapeHtml(q.id)}" onclick='window.InteractivePlayerComponent.scrollToQuestion(${this.escapeInlineJavaScript(q.id)})'>
        ${idx + 1}
      </button>
    `).join("");
  },

  renderReadingSplitInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-cbt-workspace player-view-lesen layout-${this.layoutMode}" id="exam-cbt-workspace" data-active-tab="${this.activeMobileTab}">
        <!-- READING PANEL (Left / Top in vertical) -->
        <section class="exam-cbt-reading-panel" id="panel-reading" aria-label="Reading Document">
          <div class="exam-doc-meta">
            <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
            <span>·</span>
            <span>${this.escapeHtml(material.module || "Lesen")}</span>
          </div>

          <h1 class="exam-doc-title">${this.escapeHtml(material.contentTitle || material.title || "Lesetext")}</h1>

          <article class="exam-doc-body">
            ${this.sanitizeRichText(material.passage)}
          </article>
        </section>

        <!-- QUESTIONS PANEL (Right / Bottom in vertical) -->
        <section class="exam-cbt-questions-panel" id="panel-questions" aria-label="Examination Questions">
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
            <button type="button" class="exam-primary-submit-btn" id="exam-submit-btn" onclick='window.InteractivePlayerComponent.submitAnswers(${this.escapeInlineJavaScript(material.id)}, this)'>
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
      <div class="exam-hoeren-workspace player-view-hoeren exam-single-panel-workspace" id="exam-cbt-workspace">
        <div class="exam-doc-meta">
          <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
          <span>·</span>
          <span>Hören</span>
        </div>

        <h1 class="exam-doc-title" style="margin-bottom:16px;">${this.escapeHtml(material.contentTitle || material.title || "Hörtext")}</h1>

        <!-- Dedicated Hören Audio Card -->
        <div class="hoeren-audio-card exam-audio-card" style="margin-bottom:28px;">
          <div class="hoeren-audio-header">
            <div class="hoeren-audio-label">
              <i data-lucide="headphones" style="width:18px;height:18px;color:var(--exam-ink-color);"></i>
              <span>Audio Track</span>
            </div>
            <span class="hoeren-audio-badge">Hören</span>
          </div>
          ${material.audioUrl
            ? `<audio class="hoeren-audio-player" controls preload="metadata" style="width:100%;"><source src="${this.escapeHtml(material.audioUrl)}" type="audio/mpeg">Your browser does not support audio playback.</audio>`
            : `<p class="exam-audio-unavailable">Audio is not available for this practice set yet.</p>`}
        </div>

        <!-- Questions / Answers below audio -->
        <div class="hoeren-questions-container">
          <div class="exam-section-header">
            <h2 class="exam-section-title">Fragen</h2>
            <span class="exam-section-count">${totalQuestions} Fragen</span>
          </div>

          <div class="exam-questions-list">
            ${questions.map((q, idx) => this.renderQuestionBlock(q, idx, totalQuestions)).join("")}
          </div>

          <div class="exam-submit-bar">
            <button type="button" class="exam-primary-submit-btn" id="exam-submit-btn" onclick='window.InteractivePlayerComponent.submitAnswers(${this.escapeInlineJavaScript(material.id)}, this)'>
              <i data-lucide="check" style="width:16px;height:16px;"></i>
              <span>Prüfung abgeben (Submit Exam)</span>
            </button>
          </div>
        </div>
      </div>
    `;
  },


  renderQuestionsOnlyInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-single-panel-workspace" id="exam-cbt-workspace">
        <div class="exam-doc-meta">
          <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
          <span>·</span>
          <span>${this.escapeHtml(material.module || "Grammatik")}</span>
        </div>

        <h1 class="exam-doc-title" style="margin-bottom:20px;">${this.escapeHtml(material.contentTitle || material.title || "Grammatik Drill")}</h1>

        <div class="exam-questions-list">
          ${questions.map((q, idx) => this.renderQuestionBlock(q, idx, totalQuestions)).join("")}
        </div>

        <div class="exam-submit-bar">
          <button type="button" class="exam-primary-submit-btn" onclick='window.InteractivePlayerComponent.submitAnswers(${this.escapeInlineJavaScript(material.id)}, this)'>
            <i data-lucide="check" style="width:16px;height:16px;"></i>
            <span>Prüfung abgeben (Submit Exam)</span>
          </button>
        </div>
      </div>
    `;
  },

  renderGrammatikInterface: function (material) {
    const questions = material.questions || [];
    const totalQuestions = questions.length;

    return `
      <div class="exam-grammatik-workspace player-view-grammatik exam-single-panel-workspace" id="exam-cbt-workspace">
        <div class="exam-doc-meta">
          <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
          <span>·</span>
          <span>Grammatik</span>
        </div>

        <h1 class="exam-doc-title" style="margin-bottom:24px;">${this.escapeHtml(material.contentTitle || material.title || "Grammatik Drill")}</h1>

        <div class="exam-questions-list">
          ${questions.map((q, idx) => this.renderGrammatikQuestionBlock(q, idx, totalQuestions)).join("")}
        </div>

        <div class="exam-submit-bar">
          <button type="button" class="exam-primary-submit-btn" id="exam-submit-btn" onclick='window.InteractivePlayerComponent.submitAnswers(${this.escapeInlineJavaScript(material.id)}, this)'>
            <i data-lucide="check" style="width:16px;height:16px;"></i>
            <span>Prüfung abgeben (Submit Exam)</span>
          </button>
        </div>
      </div>
    `;
  },

  renderGrammatikQuestionBlock: function (q, idx, total) {
    const questionId = String(q.id || `q-${idx + 1}`);
    // Detect whether the question text contains a blank placeholder (_____)
    const hasBlank = /_{3,}/.test(q.question);

    // Build the sentence display: highlight the blank visually
    const sentenceHtml = hasBlank
      ? this.escapeHtml(q.question).replace(/_{3,}/g, '<span class="gram-blank">_____</span>')
      : `<span class="gram-sentence-label">Ergänzen Sie:</span> ${this.escapeHtml(q.question)}`;

    return `
      <div class="exam-q-block gram-q-block" id="exam-q-block-${this.escapeHtml(questionId)}">
        <div class="exam-q-counter">${idx + 1} / ${total}</div>

        <!-- Sentence with blank -->
        <div class="gram-sentence">${sentenceHtml}</div>

        <!-- Objective answer choice buttons -->
        <div class="gram-options-row">
          ${q.options.map((opt) => {
            const isSelected = this.userAnswers[q.id] === opt;
            return `
              <button
                type="button"
                class="gram-option-btn ${isSelected ? 'selected' : ''}"
                data-question-id="${this.escapeHtml(questionId)}"
                data-option-value="${this.escapeHtml(opt)}"
                onclick="window.InteractivePlayerComponent.selectGrammatikOption(${this.escapeInlineJavaScript(questionId)}, ${this.escapeInlineJavaScript(opt)}, this)"
              >${this.escapeHtml(opt)}</button>
            `;
          }).join("")}
        </div>

        <div class="exam-review-feedback" id="feedback-${questionId}" hidden></div>
      </div>
    `;
  },


  renderQuestionBlock: function (q, idx, total) {
    const isAnswered = Boolean(this.userAnswers[q.id]);
    const questionId = String(q.id || `q-${idx + 1}`);

    return `
      <div class="exam-q-block" id="exam-q-block-${this.escapeHtml(questionId)}">
        <div class="exam-q-counter">${idx + 1} / ${total}</div>
        <div class="exam-q-text">${this.escapeHtml(q.question)}</div>

        <div class="exam-radio-list">
          ${q.options.map((opt) => {
            const isSelected = this.userAnswers[q.id] === opt;
            return `
              <label class="exam-radio-item ${isSelected ? 'selected' : ''}">
                <input class="exam-radio-input" type="radio" name="q_${this.escapeHtml(questionId)}" value="${this.escapeHtml(opt)}" data-question-id="${this.escapeHtml(questionId)}" data-option-value="${this.escapeHtml(opt)}" ${isSelected ? 'checked' : ''}>
                <span class="exam-radio-circle"></span>
                <span class="exam-radio-label">${this.escapeHtml(opt)}</span>
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
      <div class="exam-writing-workspace player-view-schreiben exam-single-panel-workspace" id="exam-cbt-workspace">
        <div class="exam-doc-meta">
          <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
          <span>·</span>
          <span>Schreiben</span>
        </div>

        <h1 class="exam-doc-title">${this.escapeHtml(material.contentTitle || material.title || "Schreibaufgabe")}</h1>

        <div class="exam-prompt-card">
          <p class="exam-prompt-text">${this.escapeHtml(material.prompt || "Write a response to the prompt.")}</p>
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
      <div class="exam-speaking-workspace player-view-sprechen exam-single-panel-workspace" id="exam-cbt-workspace">
        <div class="exam-doc-meta">
          <span>${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml(material.level || "A1")}</span>
          <span>·</span>
          <span>Sprechen</span>
        </div>

        <h1 class="exam-doc-title">${this.escapeHtml(material.contentTitle || material.title || "Mündliche Prüfung")}</h1>

        <div class="speaking-prep-box" style="border-radius:4px; margin-bottom:20px;">
          <i data-lucide="mic" style="width:32px;height:32px;color:#059669;margin-bottom:6px;"></i>
          <h3 style="font-size:1.1rem; font-weight:700; color:#065f46; margin:0 0 4px 0;">Vorbereitungszeit (Preparation Time)</h3>
          <div class="prep-timer-display" id="speaking-prep-timer" style="font-size:1.8rem;">00:30</div>
          <p style="font-size:0.82rem; color:#047857; margin:0;">Read the prompt card and prepare your spoken German response.</p>
        </div>

        <div class="exam-prompt-card">
          <p class="exam-prompt-text">${this.escapeHtml(material.prompt || "Prepare a short spoken response to the prompt.")}</p>
        </div>

        <button type="button" class="exam-primary-submit-btn" onclick="window.InteractivePlayerComponent.finishSpeaking()">
          <i data-lucide="check" style="width:16px;height:16px;"></i>
          <span>Prüfung abschließen (Complete Speaking)</span>
        </button>
      </div>
    `;
  },

  scrollToQuestion: function (qId) {
    this.activeQuestionId = qId;
    const el = document.getElementById(`exam-q-block-${qId}`);
    const panel = document.getElementById("panel-questions") || document.querySelector(".exam-single-panel-workspace");
    if (el && panel) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Switch to questions tab on mobile if currently on reading and not in vertical split
    if (window.innerWidth <= 860 && this.layoutMode !== "v-split" && this.activeMobileTab !== "questions") {
      this.switchMobileTab("questions");
    }

    document.querySelectorAll(".exam-progress-pill").forEach(p => p.classList.remove("active"));
    const activePill = document.getElementById(`nav-pill-${qId}`);
    if (activePill) activePill.classList.add("active");
  },

  bindQuestionOptionEvents: function (root) {
    if (!root) return;
    if (this._questionEventRoot && this._questionChangeHandler) {
      this._questionEventRoot.removeEventListener("change", this._questionChangeHandler);
    }

    this._questionEventRoot = root;
    this._questionChangeHandler = (event) => {
      const input = event.target.closest(".exam-radio-input");
      if (!input || !input.checked) return;
      this.selectOption(input.dataset.questionId, input.dataset.optionValue, input);
    };
    root.addEventListener("change", this._questionChangeHandler);
  },

  selectOption: function (qId, optionValue, element) {
    if (this.isSubmitted && this.isReviewMode) return;

    this.userAnswers[qId] = optionValue;

    const optionItem = element.closest(".exam-radio-item");
    const block = optionItem?.closest(".exam-q-block");
    if (block) {
      block.querySelectorAll(".exam-radio-item").forEach(item => item.classList.remove("selected"));
      if (optionItem) optionItem.classList.add("selected");
    }

    // Update fixed progress pill
    const pill = document.getElementById(`nav-pill-${qId}`);
    if (pill) {
      pill.classList.add("answered");
    }

    this.updateMobileTabQuestionCount();
  },

  selectGrammatikOption: function (qId, optionValue, btnEl) {
    if (this.isSubmitted && this.isReviewMode) return;

    this.userAnswers[qId] = optionValue;

    // Toggle selected class on buttons within the same question block
    const block = btnEl ? btnEl.closest(".exam-q-block") : null;
    if (block) {
      block.querySelectorAll(".gram-option-btn").forEach(btn => btn.classList.remove("selected"));
      if (btnEl) btnEl.classList.add("selected");
    }

    // Update fixed progress pill
    const pill = document.getElementById(`nav-pill-${qId}`);
    if (pill) pill.classList.add("answered");

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

    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;

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

    // Save practice attempt directly to Supabase
    const saveResult = await this.savePracticeAttemptToSupabase(material, score, total);
    if (!saveResult || (!saveResult.success && !saveResult.alreadyCompleted)) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = `<i data-lucide="check" style="width:16px;height:16px;"></i><span>Prüfung abgeben (Submit Exam)</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
      if (window.PracticeApp && typeof window.PracticeApp.showToast === "function") {
        const errorMsg = saveResult?.error?.message || "Failed to save practice attempt. Please check your connection.";
        window.PracticeApp.showToast(errorMsg, "error", 4000);
      }
      return;
    }

    this.isSubmitted = true;

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
            <button type="button" class="btn-exam-secondary" onclick="window.InteractivePlayerComponent.confirmExitExam()">
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
      ${this.renderMaterialWorkspace(material)}
    `;

    this.bindQuestionOptionEvents(contentArea);
    if (window.lucide) window.lucide.createIcons();
    this.setLayoutMode(this.layoutMode);

    // Fill review feedback on each question
    const questions = material.questions || [];
    const showExpl = this.currentSettings ? this.currentSettings.showExplanations !== false : true;

    questions.forEach(q => {
      const userAns = this.userAnswers[q.id];
      const fb = document.getElementById(`feedback-${q.id}`);
      const navPill = document.getElementById(`nav-pill-${q.id}`);
      const isCorrect = userAns === q.correctAnswer;
      const explHtml = (showExpl && q.explanation) ? `<div style="margin-top:6px; font-size:0.8rem; opacity:0.9;">${this.escapeHtml(q.explanation)}</div>` : "";

      if (fb) {
        fb.hidden = false;
        if (isCorrect) {
          fb.className = "exam-review-feedback feedback-correct";
          fb.innerHTML = `<strong>✓ Richtig (Correct)!</strong>${explHtml}`;
        } else {
          fb.className = "exam-review-feedback feedback-incorrect";
          fb.innerHTML = `<strong>✗ Falsch (Incorrect).</strong> Richtige Antwort: <strong>${this.escapeHtml(q.correctAnswer)}</strong>.${explHtml}`;
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
    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;

    this.lastScore = { score: 9, total: 10, pct: 90 };

    const saveResult = await this.savePracticeAttemptToSupabase(material, 9, 10);
    if (!saveResult || (!saveResult.success && !saveResult.alreadyCompleted)) {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = `<i data-lucide="send" style="width:16px;height:16px;"></i><span>Aufgabe abgeben (Submit Writing)</span>`;
        if (window.lucide) window.lucide.createIcons();
      }
      if (window.PracticeApp && typeof window.PracticeApp.showToast === "function") {
        const errorMsg = saveResult?.error?.message || "Failed to save writing attempt. Please check your connection.";
        window.PracticeApp.showToast(errorMsg, "error", 4000);
      }
      return;
    }

    this.isSubmitted = true;

    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Schreiben", 90);
    }

    this.renderResultsScreen();
  },

  finishSpeaking: async function () {
    const material = this.currentMaterial || { id: "speaking-1", module: "Sprechen", level: "A1", exam: "goethe" };
    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;

    this.lastScore = { score: 8, total: 10, pct: 80 };

    const saveResult = await this.savePracticeAttemptToSupabase(material, 8, 10);
    if (!saveResult || (!saveResult.success && !saveResult.alreadyCompleted)) {
      if (window.PracticeApp && typeof window.PracticeApp.showToast === "function") {
        const errorMsg = saveResult?.error?.message || "Failed to save speaking attempt. Please check your connection.";
        window.PracticeApp.showToast(errorMsg, "error", 4000);
      }
      return;
    }

    this.isSubmitted = true;

    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Sprechen", 80);
    }

    this.renderResultsScreen();
  },

  savePracticeAttemptToSupabase: async function (material, correctAnswers, totalQuestions) {
    if (!window.SupabaseService || !window.SupabaseService.getSupabaseClient) {
      const err = new Error("Supabase service unavailable");
      console.error("Player: Supabase attempt save error:", err);
      return { success: false, error: err };
    }

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) {
        const err = new Error("Supabase client not initialized");
        console.error("Player: Supabase attempt save error:", err);
        return { success: false, error: err };
      }

      const uid = (window.AppState?.userProfile?.uid && window.AppState.userProfile.uid !== "local-user" && window.AppState.userProfile.uid !== "anonymous")
        ? window.AppState.userProfile.uid
        : (window.PracticeApp?.currentFirebaseUser?.uid || localStorage.getItem("coco_user_uid"));

      if (!uid || uid === "local-user" || uid === "anonymous") {
        const err = new Error("You must be logged in to record your practice attempt.");
        console.error("Player: No logged-in user UID found:", err);
        return { success: false, error: err };
      }

      const correctCount = parseInt(correctAnswers || 0, 10);
      const totalCount = Math.max(1, parseInt(totalQuestions || 1, 10));
      const scorePercent = Math.round((correctCount / totalCount) * 100);

      const dbModule = material.module === "Grammar" ? "Grammatik" : (material.module || "Grammatik");

      let dbFormat = String(material.exam || material.format || "").toLowerCase().trim();
      if (dbFormat !== "goethe" && dbFormat !== "telc") {
        const userFormat = String(window.AppState?.currentFormat || localStorage.getItem("coco_practice_format") || "goethe").toLowerCase().trim();
        dbFormat = userFormat === "telc" ? "telc" : "goethe";
      }

      const attemptPayload = {
        uid: uid,
        material_id: String(material.id),
        level: material.level || "A1",
        format: dbFormat,
        module: dbModule,
        correct_answers: correctCount,
        total_questions: totalCount,
        score_percent: scorePercent,
        completed_at: new Date().toISOString()
      };

      // Direct Supabase INSERT from frontend (no Cloudflare, no client-provided ID)
      const { error: insertError } = await supabase
        .from("practice_attempts")
        .insert([attemptPayload]);

      if (insertError) {
        if (insertError.code === "23505") {
          console.info("Player: Practice attempt already completed for (uid, material_id).", insertError.message);
          // Treat as "Already completed" - not a failure
          try {
            localStorage.removeItem("coco_practice_hub_materials_cache");
            if (window.PracticeHubComponent && window.PracticeHubComponent.completedMaterialIds) {
              window.PracticeHubComponent.completedMaterialIds.add(String(material.id));
            }
          } catch (e) {}
          return { success: true, alreadyCompleted: true };
        }

        console.error("Player: Supabase attempt save error:", insertError);
        return { success: false, error: insertError };
      }

      // Invalidate Practice Hub cache and update completed set in memory
      try {
        localStorage.removeItem("coco_practice_hub_materials_cache");
        if (window.PracticeHubComponent && window.PracticeHubComponent.completedMaterialIds) {
          window.PracticeHubComponent.completedMaterialIds.add(String(material.id));
        }
      } catch (e) {}

      return { success: true, alreadyCompleted: false };
    } catch (err) {
      console.error("Player: Supabase attempt save error:", err);
      return { success: false, error: err };
    }
  },

  retryTest: function () {
    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;
    this.userAnswers = {};
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.warningToastShown = false;
    this.timeExpiredModalShown = false;
    this.isOvertime = false;
    this.overtimeSeconds = 0;

    const timerBox = document.getElementById("exam-timer-box");
    if (timerBox) {
      timerBox.classList.remove("timer-warning", "timer-overtime");
    }

    if (this.currentMaterial) {
      this.renderFixedProgressBar(this.currentMaterial.questions || []);

      const contentArea = document.getElementById("player-content-area");
      if (contentArea) {
        this.mountMaterialWorkspace(contentArea, this.currentMaterial);
      }

      const settings = this.currentSettings || this.getPrepSettings();
      if (settings.countdown !== false) {
        const durSec = Number(this.currentMaterial.estimatedSeconds);
        const safeDuration = (!isNaN(durSec) && durSec > 0) ? durSec : 600;
        this.startTimer(safeDuration);
      }
    }
  },

  startTimer: function (durationSec) {
    this.stopTimer();

    const initialSeconds = Number(durationSec);
    if (isNaN(initialSeconds) || initialSeconds <= 0) {
      this.timerStarted = false;
      this.hasTimerStarted = false;
      this.secondsRemaining = 0;
      return;
    }

    this.timerStarted = true;
    this.hasTimerStarted = true;
    this.secondsRemaining = initialSeconds;
    this.warningToastShown = false;
    this.timeExpiredModalShown = false;
    this.isOvertime = false;
    this.overtimeSeconds = 0;

    const timerDisplay = document.getElementById("player-timer-display");
    const timerBox = document.getElementById("exam-timer-box");
    if (timerBox) {
      timerBox.classList.remove("timer-warning", "timer-overtime");
    }

    const renderDigits = (sec) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (timerDisplay) {
      timerDisplay.textContent = renderDigits(this.secondsRemaining);
    }

    this.activeTimerInterval = setInterval(() => {
      // Guard: must have genuinely started, be active, and not submitted
      if (!this.timerStarted || !this.hasTimerStarted || this.isSubmitted) {
        this.stopTimer();
        return;
      }

      this.secondsRemaining--;

      // 1-Minute Remaining Warning (at <= 60s and > 0s)
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
            }, 5000);
          }
        }
      }

      // 00:00 Time Expired -> Open Custom Modal
      // Only triggers when countdown genuinely reaches 00:00 after running
      if (this.secondsRemaining <= 0) {
        this.stopTimer();
        this.secondsRemaining = 0;
        if (timerDisplay) timerDisplay.textContent = "00:00";

        const currentSettings = this.currentSettings || this.getPrepSettings();
        if (currentSettings.countdown !== false && this.hasTimerStarted && !this.timeExpiredModalShown && !this.isSubmitted) {
          this.timeExpiredModalShown = true;
          const timeModal = document.getElementById("exam-time-expired-modal");
          if (timeModal) timeModal.hidden = false;
        }
        return;
      }

      if (timerDisplay) {
        timerDisplay.textContent = renderDigits(this.secondsRemaining);
      }
    }, 1000);
  },

  startOvertimeTimer: function () {
    this.stopTimer();
    this.timerStarted = false;
    this.hasTimerStarted = false;
    this.isOvertime = true;
    this.overtimeSeconds = 0;
    const timerDisplay = document.getElementById("player-timer-display");

    const renderOvertime = (sec) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `-${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    if (timerDisplay) timerDisplay.textContent = "-00:00";

    this.activeTimerInterval = setInterval(() => {
      if (!this.isOvertime || this.isSubmitted) {
        if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
        this.activeTimerInterval = null;
        return;
      }
      this.overtimeSeconds++;
      if (timerDisplay) {
        timerDisplay.textContent = renderOvertime(this.overtimeSeconds);
      }
    }, 1000);
  },

  getFallbackMaterialContent: function (id, level = "A1") {
    const normalizedId = String(id || "").toLowerCase();
    return {
      id: id,
      title: `${level} Practice Material (${id})`,
      exam: "goethe",
      level: level,
      module: normalizedId.includes("hoeren") ? "Hören" : normalizedId.includes("schreiben") ? "Schreiben" : normalizedId.includes("sprechen") ? "Sprechen" : "Lesen",
      estimatedSeconds: 600,
      passage: `
        <p>Dieses Übungsmaterial konnte nicht geladen werden.</p>
        <p>Bitte kehre zur Übersicht zurück und versuche es erneut.</p>
      `,
      questions: [],
      prompt: "",
      isWriting: normalizedId.includes("schreiben"),
      isSpeaking: normalizedId.includes("sprechen")
    };
  }
};
