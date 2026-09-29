/**
 * Coco Germany Practice App - Dedicated Mock Exam Player Component
 * components/mock-player.js
 *
 * Dedicated Mock Examination Player:
 * - Independent route (#mock-player) separate from InteractivePlayerComponent
 * - Dynamically configures exam structure based on level and format (Goethe / Telc)
 * - Queries and reuses existing practice materials from Supabase
 * - Prefers uncompleted materials by checking practice_attempts table
 * - Supports materials usable for 'both' Goethe and Telc formats
 * - Displays "You have solved all available materials for this Teil." with Skip button when all solved
 * - Sequential CBT Flow: Teil -> Result/Corrections -> Next Teil -> ... -> Final Mock Report
 * - Per-Teil independent countdown timers with auto-submission on expiration
 * - Dedicated Mock Schreiben Player sub-flow with full CEFR evaluation and corrections
 * - Consumes 1 Mock Exam credit at exam start; 1 normal Schreiben credit upon writing evaluation
 * - Saves each completed Teil attempt to practice_attempts
 * - Saves final aggregated exam results to mock_attempts via saveMockAttemptSupabase()
 * - Responsive UI across mobile, tablet, and desktop with zero horizontal overflow
 */

window.MockPlayerComponent = {
  activeExam: null,
  activeTimerInterval: null,
  isEvaluating: false,
  _exitModalOpen: false,

  /* ============================================================
   * 1. EXAM CONFIGURATION & STRUCTURE BUILDER
   * ============================================================ */
  buildExamStructure: function (format, level) {
    const fmt = String(format || "goethe").toLowerCase().trim() === "telc" ? "telc" : "goethe";
    const lvl = String(level || "A1").toUpperCase().trim();
    const structure = [];

    if (fmt === "goethe") {
      // Goethe Lesen: A1: T1-T3, A2: T1-T4, B1/B2: T1-T5
      let lesenTeile = 3;
      if (lvl === "A2") lesenTeile = 4;
      else if (lvl === "B1" || lvl === "B2") lesenTeile = 5;

      for (let i = 1; i <= lesenTeile; i++) {
        structure.push({ module: "Lesen", teil: `Teil ${i}`, teilNum: i, mandatory: true });
      }

      // Goethe Grammatik: optional/random (offered if material exists)
      structure.push({ module: "Grammatik", teil: null, teilNum: null, isRandomApplicable: true, optional: true, mandatory: false });

      // Goethe Hören: A1: T1-T3, A2/B1/B2: T1-T4
      let hoerenTeile = 3;
      if (lvl === "A2" || lvl === "B1" || lvl === "B2") hoerenTeile = 4;
      for (let i = 1; i <= hoerenTeile; i++) {
        structure.push({ module: "Hören", teil: `Teil ${i}`, teilNum: i, mandatory: true });
      }

      // Goethe Schreiben: specifically Teil 1
      structure.push({ module: "Schreiben", teil: "Teil 1", teilNum: 1, isRandomApplicable: false, mandatory: true });

    } else {
      // Telc Lesen: T1-T3 for all levels
      for (let i = 1; i <= 3; i++) {
        structure.push({ module: "Lesen", teil: `Teil ${i}`, teilNum: i, mandatory: true });
      }

      // Telc Grammatik:
      // B1/B2 mandatory T1-T2 (Sprachbausteine Teil 1 & Teil 2)
      // A1/A2 optional/random
      if (lvl === "B1" || lvl === "B2") {
        structure.push({ module: "Grammatik", teil: "Teil 1", teilNum: 1, mandatory: true });
        structure.push({ module: "Grammatik", teil: "Teil 2", teilNum: 2, mandatory: true });
      } else {
        structure.push({ module: "Grammatik", teil: null, teilNum: null, isRandomApplicable: true, optional: true, mandatory: false });
      }

      // Telc Hören: T1-T3 for all levels
      for (let i = 1; i <= 3; i++) {
        structure.push({ module: "Hören", teil: `Teil ${i}`, teilNum: i, mandatory: true });
      }

      // Telc Schreiben: specifically Teil 1
      structure.push({ module: "Schreiben", teil: "Teil 1", teilNum: 1, isRandomApplicable: false, mandatory: true });
    }

    return structure;
  },

  /* ============================================================
   * 2. MATERIAL RESOLUTION
   * ============================================================ */
  resolveMaterialsForExam: async function (format, level, uid) {
    if (!window.SupabaseService || typeof window.SupabaseService.getSupabaseClient !== "function") {
      throw new Error("Supabase client unavailable");
    }

    const supabase = await window.SupabaseService.getSupabaseClient();
    if (!supabase) throw new Error("Could not initialize Supabase connection");

    const fmtLower = String(format || "goethe").toLowerCase().trim() === "telc" ? "telc" : "goethe";
    const lvlUpper = String(level || "A1").toUpperCase().trim();

    // Query all active materials matching this level and format ('goethe'/'telc' or 'both')
    const { data: dbMaterials, error: matErr } = await supabase
      .from("materials")
      .select("id, title, description, exam, level, module, teil, material_number, content_path, difficulty, duration_minutes, active")
      .eq("active", true)
      .eq("level", lvlUpper)
      .in("exam", [fmtLower, "both"])
      .order("material_number", { ascending: true });

    if (matErr) {
      console.warn("MockPlayer: Material fetch error:", matErr);
    }
    const allMaterials = dbMaterials || [];

    // Query solved materials from practice_attempts for this user
    const solvedMaterialIds = new Set();
    if (uid && uid !== "local-user" && uid !== "anonymous") {
      try {
        const { data: attempts } = await supabase
          .from("practice_attempts")
          .select("material_id")
          .eq("uid", uid);

        if (attempts && Array.isArray(attempts)) {
          attempts.forEach(a => {
            if (a.material_id) solvedMaterialIds.add(String(a.material_id));
          });
        }
      } catch (e) {
        console.warn("MockPlayer: Failed to load previous practice attempts:", e);
      }
    }

    const structure = this.buildExamStructure(fmtLower, lvlUpper);
    const resolvedSteps = [];

    for (let i = 0; i < structure.length; i++) {
      const stepDef = structure[i];
      const modLower = stepDef.module.toLowerCase();

      // Filter all materials belonging to this module
      const moduleMaterials = allMaterials.filter(m => {
        const mMod = String(m.module || "").toLowerCase();
        if (modLower === "grammatik") {
          return mMod === "grammatik" || mMod === "grammar" || mMod.includes("sprachbaustein");
        }
        if (modLower === "hören") {
          return mMod.includes("h") && (mMod.includes("ren") || mMod.includes("oren"));
        }
        if (modLower === "lesen") {
          return mMod.includes("lesen");
        }
        if (modLower === "schreiben") {
          return mMod.includes("schreiben");
        }
        return mMod === modLower;
      });

      // Filter candidate materials by Teil
      let candidateMaterials = [];
      if (stepDef.module === "Schreiben") {
        // Schreiben Teil 1 candidate selection
        candidateMaterials = moduleMaterials.filter(m => {
          const rawTeil = String(m.teil || "").toLowerCase();
          const matchNum = rawTeil.match(/\d+/);
          if (matchNum && parseInt(matchNum[0], 10) === 1) return true;

          const matchTitle = String(m.title || "").toLowerCase().match(/teil\s*(\d+)/);
          if (matchTitle && parseInt(matchTitle[1], 10) === 1) return true;

          const matchId = String(m.id || "").toLowerCase().match(/t(\d+)/);
          if (matchId && parseInt(matchId[1], 10) === 1) return true;

          if (!m.teil) return true;
          return false;
        });
      } else if (stepDef.isRandomApplicable) {
        // Applicable for any Teil in this module (e.g. optional Grammatik)
        candidateMaterials = moduleMaterials;
      } else if (stepDef.teilNum) {
        candidateMaterials = moduleMaterials.filter(m => {
          const rawTeil = String(m.teil || "").toLowerCase();
          const matchNum = rawTeil.match(/\d+/);
          if (matchNum && parseInt(matchNum[0], 10) === stepDef.teilNum) return true;

          const matchTitle = String(m.title || "").toLowerCase().match(/teil\s*(\d+)/);
          if (matchTitle && parseInt(matchTitle[1], 10) === stepDef.teilNum) return true;

          const matchId = String(m.id || "").toLowerCase().match(/t(\d+)/);
          if (matchId && parseInt(matchId[1], 10) === stepDef.teilNum) return true;

          if (!m.teil && stepDef.teilNum === 1 && moduleMaterials.length === 1) return true;
          return false;
        });
      }

      // Optional Grammatik check: if no material exists, omit step cleanly
      if (stepDef.optional && candidateMaterials.length === 0) {
        continue;
      }

      // Check unused vs completed materials
      const unusedMaterials = candidateMaterials.filter(m => !solvedMaterialIds.has(String(m.id)));
      const completedMaterials = candidateMaterials.filter(m => solvedMaterialIds.has(String(m.id)));

      let chosenMaterial = null;
      let isSolvedAll = false;
      let isMissingDb = false;

      if (unusedMaterials.length > 0) {
        if (stepDef.isRandomApplicable || stepDef.module === "Schreiben") {
          chosenMaterial = unusedMaterials[Math.floor(Math.random() * unusedMaterials.length)];
        } else {
          chosenMaterial = unusedMaterials[0]; // default ordering: material_number ASC
        }
      } else if (completedMaterials.length > 0) {
        isSolvedAll = true;
      } else {
        isMissingDb = true;
      }

      resolvedSteps.push({
        stepIndex: resolvedSteps.length,
        module: stepDef.module,
        teil: stepDef.teil || (chosenMaterial?.teil || "Teil 1"),
        teilNum: stepDef.teilNum || 1,
        mandatory: stepDef.mandatory,
        materialMeta: chosenMaterial,
        isSolvedAll: isSolvedAll,
        isMissingDb: isMissingDb,
        isSkipped: isSolvedAll || isMissingDb,
        skipReason: isSolvedAll
          ? "You have solved all available materials for this Teil."
          : (isMissingDb ? "No practice material is currently available in the database for this Teil." : null),
        status: (isSolvedAll || isMissingDb) ? "ready_to_skip" : "pending"
      });
    }

    return resolvedSteps;
  },

  /* ============================================================
   * 3. INITIALIZATION & STATE RESTORATION
   * ============================================================ */
  render: function (appState, searchParams) {
    return `
      <div class="mock-player-container" id="mock-player-root">
        <!-- Render placeholder while initMockExam executes -->
        <div style="min-height:80vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px;">
          <div class="app-spinner" style="width:40px; height:40px; border-width:3px;"></div>
          <p style="font-size:0.95rem; font-weight:600; color:var(--muted);">Initializing official Mock Examination...</p>
        </div>
      </div>
    `;
  },

  initMockExam: async function (appState, searchParams) {
    const root = document.getElementById("mock-player-root");
    if (!root) return;

    // Check user login
    const uid = (appState?.userProfile?.uid && appState.userProfile.uid !== "local-user")
      ? appState.userProfile.uid
      : (window.PracticeApp?.currentFirebaseUser?.uid || localStorage.getItem("coco_user_uid"));

    if (!uid || uid === "local-user" || uid === "anonymous") {
      if (window.PracticeApp) {
        window.PracticeApp.showToast("Please log in to access the Mock Examination.", "warning", 3500);
      }
      window.location.hash = "#practice";
      return;
    }

    const level = (appState?.currentLevel || localStorage.getItem("coco_practice_level") || "A1").toUpperCase();
    const rawFormat = (appState?.currentFormat || localStorage.getItem("coco_practice_format") || "goethe").toLowerCase();
    const format = rawFormat.includes("telc") ? "telc" : "goethe";

    // 1. Check if an ongoing exam session exists in localStorage
    let existingExam = null;
    try {
      const saved = localStorage.getItem("coco_active_mock_exam");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.uid === uid && parsed.level === level && parsed.format === format && !parsed.isExamFinished) {
          existingExam = parsed;
        }
      }
    } catch (e) {
      console.warn("MockPlayer: Failed to parse saved session:", e);
    }

    if (existingExam && Array.isArray(existingExam.steps) && existingExam.steps.length > 0) {
      this.activeExam = existingExam;
      this.loadStep(existingExam.currentStepIndex || 0);
      return;
    }

    // 2. Authorization guard: ensure exam was launched via startMockExamConfirmed()
    const isAuthorized = sessionStorage.getItem("coco_mock_authorized");
    if (!isAuthorized) {
      if (window.PracticeApp) {
        window.PracticeApp.showToast("Please launch your Mock Examination from the Mock Exams Hub.", "info", 3500);
      }
      window.location.hash = "#mock-exams";
      return;
    }
    sessionStorage.removeItem("coco_mock_authorized");

    // 3. Build fresh exam steps
    try {
      const steps = await this.resolveMaterialsForExam(format, level, uid);
      if (!steps || steps.length === 0) {
        root.innerHTML = `
          <div class="mock-workspace">
            <div class="mock-skipped-card">
              <div class="mock-skipped-icon"><i data-lucide="alert-circle" style="width:28px;height:28px;"></i></div>
              <h2 class="mock-skipped-title">No Exam Materials Found</h2>
              <p class="mock-skipped-desc">Could not load examination materials for ${format.toUpperCase()} ${level}. Please contact support or try another level.</p>
              <button type="button" class="btn-primary" onclick="window.location.hash='#mock-exams'">Return to Mock Exams</button>
            </div>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const examId = `mock_${format}_${level.toLowerCase()}_${Date.now()}`;
      this.activeExam = {
        examId: examId,
        uid: uid,
        level: level,
        format: format,
        startedAt: new Date().toISOString(),
        currentStepIndex: 0,
        steps: steps,
        stepResults: {}, // stepIndex -> result object
        isExamFinished: false,
        finalReport: null
      };

      this.saveActiveExamState();
      this.loadStep(0);

    } catch (err) {
      console.error("MockPlayer: Error configuring mock exam:", err);
      root.innerHTML = `
        <div class="mock-workspace">
          <div class="mock-skipped-card">
            <div class="mock-skipped-icon"><i data-lucide="alert-triangle" style="width:28px;height:28px;"></i></div>
            <h2 class="mock-skipped-title">Unable to Start Exam</h2>
            <p class="mock-skipped-desc">${err.message || "An error occurred while loading exam materials."}</p>
            <button type="button" class="btn-primary" onclick="window.location.hash='#mock-exams'">Return to Mock Exams</button>
          </div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  },

  saveActiveExamState: function () {
    if (!this.activeExam) return;
    try {
      localStorage.setItem("coco_active_mock_exam", JSON.stringify(this.activeExam));
    } catch (e) {
      console.warn("MockPlayer: Failed to persist exam state:", e);
    }
  },

  /* ============================================================
   * 4. STEP LOADING & WORKSPACE RENDERING
   * ============================================================ */
  loadStep: async function (stepIndex) {
    if (!this.activeExam) return;
    this.stopTimer();

    const root = document.getElementById("mock-player-root");
    if (!root) return;

    if (stepIndex >= this.activeExam.steps.length) {
      this.finishMockExam();
      return;
    }

    this.activeExam.currentStepIndex = stepIndex;
    this.saveActiveExamState();

    const step = this.activeExam.steps[stepIndex];
    const totalSteps = this.activeExam.steps.length;

    // Render small loader card between each Teil loading
    root.innerHTML = `
      <div class="mock-workspace">
        <div class="mock-step-loader-container">
          <div class="mock-step-loader-card">
            <div class="mock-step-spinner"></div>
            <span class="mock-step-loader-pill">Teil ${stepIndex + 1} / ${totalSteps}</span>
            <h3 class="mock-step-loader-title">Loading ${this.escapeHtml(step.module)} · ${this.escapeHtml(step.teil)}</h3>
            <p class="mock-step-loader-sub">Preparing examination task and timer...</p>
          </div>
        </div>
      </div>
    `;
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 1. If Teil was flagged to skip (solved all or missing from DB)
    if (step.isSkipped || step.isSolvedAll || step.isMissingDb) {
      await new Promise(r => setTimeout(r, 400));
      this.renderSkippedStepView(step, stepIndex, totalSteps);
      return;
    }

    // 2. Fetch full material content JSON from R2 via Worker
    try {
      const meta = step.materialMeta;
      const minLoaderDelay = new Promise(r => setTimeout(r, 450));
      const [content] = await Promise.all([
        this.fetchMaterialJson(meta.content_path),
        minLoaderDelay
      ]);

      const fullMaterial = {
        ...meta,
        ...content,
        id: meta.id,
        module: step.module,
        teil: step.teil || meta.teil || "Teil 1",
        level: this.activeExam.level,
        exam: this.activeExam.format,
        questions: Array.isArray(content?.questions) ? content.questions : []
      };

      step.loadedContent = fullMaterial;
      step.userAnswers = {};
      step.studentText = "";
      step.timeLimitSeconds = this.determineTimeLimitSeconds(fullMaterial);

      this.renderActiveStepWorkspace(step, stepIndex, totalSteps);
      this.startTeilTimer(step.timeLimitSeconds);

    } catch (loadErr) {
      console.error("MockPlayer: Content load failed for step:", step, loadErr);
      step.isSkipped = true;
      step.skipReason = "Could not load content for this Teil. You may skip it without failing the exam.";
      this.renderSkippedStepView(step, stepIndex, totalSteps);
    }
  },

  determineTimeLimitSeconds: function (material) {
    const durMin = material.duration_minutes !== null && material.duration_minutes !== undefined
      ? parseInt(material.duration_minutes, 10)
      : null;

    if (durMin && !isNaN(durMin) && durMin > 0) {
      return durMin * 60;
    }

    // Standard module fallbacks
    const mod = String(material.module || "").toLowerCase();
    if (mod.includes("schreiben")) return 15 * 60; // 15 mins for Teil 1
    if (mod.includes("h")) return 12 * 60; // 12 mins
    if (mod.includes("gramm")) return 10 * 60; // 10 mins
    return 10 * 60; // Lesen 10 mins per Teil
  },

  fetchMaterialJson: async function (contentPath) {
    if (!contentPath) return {};
    const workerBase = (window.SupabaseService && typeof window.SupabaseService.getWorkerBaseUrl === "function")
      ? window.SupabaseService.getWorkerBaseUrl()
      : "https://cocogermany-r2-worker.cocogermany-ytd.workers.dev";

    const cleanPath = String(contentPath).replace(/^\/+/, "");
    const url = new URL(cleanPath, `${workerBase.replace(/\/$/, "")}/`);
    url.searchParams.set("v", Date.now().toString());

    const res = await fetch(url.href, {
      cache: "no-store",
      headers: { Accept: "application/json" }
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching material JSON`);
    return await res.json();
  },

  /* ============================================================
   * 5. WORKSPACE UI RENDERING
   * ============================================================ */
  renderSkippedStepView: function (step, stepIndex, totalSteps) {
    const root = document.getElementById("mock-player-root");
    if (!root) return;

    const formatLabel = this.activeExam.format.toUpperCase();
    const level = this.activeExam.level;

    root.innerHTML = `
      <header class="mock-cbt-header">
        <div class="mock-header-left">
          <button type="button" class="mock-exit-btn" onclick="window.MockPlayerComponent.confirmExit()">
            <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Exit
          </button>
          <div class="mock-exam-info-header">
            <span class="mock-exam-title-text">${formatLabel} ${level} Mock Examination</span>
            <div class="mock-step-indicator">
              <span class="mock-step-pill">Step ${stepIndex + 1} of ${totalSteps}</span>
              <span>· ${step.module} ${step.teil}</span>
            </div>
          </div>
        </div>
        <div class="mock-header-right">
          <button type="button" class="mock-btn-submit-teil" onclick="window.MockPlayerComponent.skipCurrentStep(${stepIndex}, this)">
            Skip to Next Teil <i data-lucide="chevron-right" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </header>

      <div class="mock-workspace">
        <div class="mock-skipped-card">
          <div class="mock-skipped-icon">
            <i data-lucide="check-circle-2" style="width:30px;height:30px;"></i>
          </div>
          <span class="mock-skipped-badge">${step.module} · ${step.teil}</span>
          <h2 class="mock-skipped-title">${step.skipReason || "All available materials for this Teil have been solved."}</h2>
          <p class="mock-skipped-desc">
            You can proceed to the next examination Teil. Skipping this Teil will not count as a failure or prevent your exam from being scored.
          </p>
          <button type="button" class="mock-btn-next-teil" style="margin:0 auto;" onclick="window.MockPlayerComponent.skipCurrentStep(${stepIndex}, this)">
            <span>Skip to Next Teil</span>
            <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  renderActiveStepWorkspace: function (step, stepIndex, totalSteps) {
    const root = document.getElementById("mock-player-root");
    if (!root) return;

    const formatLabel = this.activeExam.format.toUpperCase();
    const level = this.activeExam.level;
    const material = step.loadedContent;

    root.innerHTML = `
      <header class="mock-cbt-header">
        <div class="mock-header-left">
          <button type="button" class="mock-exit-btn" onclick="window.MockPlayerComponent.confirmExit()">
            <i data-lucide="arrow-left" style="width:16px;height:16px;"></i> Exit
          </button>
          <div class="mock-exam-info-header">
            <span class="mock-exam-title-text">${formatLabel} ${level} Mock Examination</span>
            <div class="mock-step-indicator">
              <span class="mock-step-pill">Teil ${stepIndex + 1} / ${totalSteps}</span>
              <span>· ${step.module} ${step.teil}</span>
            </div>
          </div>
        </div>

        <div class="mock-header-center">
          <div class="mock-timer-box" id="mock-timer-display">
            <i data-lucide="clock" style="width:16px;height:16px;"></i>
            <span id="mock-timer-text">--:--</span>
          </div>
        </div>

        <div class="mock-header-right">
          <button type="button" class="mock-btn-submit-teil" id="mock-submit-btn" onclick="window.MockPlayerComponent.submitCurrentStep(${stepIndex})">
            <i data-lucide="check" style="width:16px;height:16px;"></i>
            <span>Submit ${step.teil}</span>
          </button>
        </div>
      </header>

      <div class="mock-workspace" id="mock-workspace-body">
        ${this.renderModuleWorkspaceHtml(step, material)}
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    this.bindWorkspaceInputs(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  renderModuleWorkspaceHtml: function (step, material) {
    const mod = step.module;

    if (mod === "Lesen") {
      const passageHtml = material.passage || material.text || "Kein Lesetext vorhanden.";
      const questions = material.questions || [];

      return `
        <div class="mock-lesen-split">
          <div class="mock-passage-panel">
            <div class="mock-passage-header">
              <h1 class="mock-passage-title">${this.escapeHtml(material.title || "Lesetext")}</h1>
              <span style="font-size:0.8rem; color:var(--muted);">${material.exam.toUpperCase()} ${material.level} · ${step.teil}</span>
            </div>
            <div class="mock-passage-body">${passageHtml}</div>
          </div>

          <div class="mock-questions-panel">
            <div class="mock-questions-header">
              <h2 class="mock-questions-title">Fragen (${questions.length})</h2>
              <span style="font-size:0.8rem; color:var(--muted);">Select the correct answer</span>
            </div>
            <div class="mock-questions-list">
              ${questions.map((q, idx) => this.renderObjectiveQuestionCard(q, idx, questions.length)).join("")}
            </div>
          </div>
        </div>
      `;
    }

    if (mod === "Hören") {
      const questions = material.questions || [];
      const audioUrl = material.audioUrl || material.audio_url || "";

      return `
        <div class="mock-hoeren-container">
          <div class="mock-audio-card">
            <div class="mock-audio-header">
              <div class="mock-audio-label">
                <i data-lucide="headphones"></i>
                <span>Hördatei · ${step.teil}</span>
              </div>
              <span class="badge-pill badge-gold">Timed Listening</span>
            </div>
            ${audioUrl
              ? `<audio class="mock-audio-player" controls preload="metadata" src="${this.escapeHtml(audioUrl)}">Your browser does not support audio playback.</audio>`
              : `<p style="font-size:0.85rem; color:var(--muted); margin:0;">Audio file is not available for this set.</p>`}
          </div>

          <div class="mock-questions-panel" style="max-height:none;">
            <div class="mock-questions-header">
              <h2 class="mock-questions-title">Fragen (${questions.length})</h2>
              <span style="font-size:0.8rem; color:var(--muted);">Listen carefully and choose the correct answers</span>
            </div>
            <div class="mock-questions-list">
              ${questions.map((q, idx) => this.renderObjectiveQuestionCard(q, idx, questions.length)).join("")}
            </div>
          </div>
        </div>
      `;
    }

    if (mod === "Grammatik") {
      const questions = material.questions || [];

      return `
        <div class="mock-grammatik-container">
          <div style="margin-bottom:16px;">
            <h1 style="font-size:1.25rem; font-weight:700; margin:0 0 4px; font-family:var(--font-heading);">${this.escapeHtml(material.title || "Grammatik & Sprachbausteine")}</h1>
            <p style="font-size:0.85rem; color:var(--muted); margin:0;">Choose the correct word or grammatical form to complete each sentence.</p>
          </div>

          <div class="mock-gram-list">
            ${questions.map((q, idx) => this.renderGrammatikQuestionCard(q, idx, questions.length)).join("")}
          </div>
        </div>
      `;
    }

    if (mod === "Schreiben") {
      const taskDetails = this.extractTaskDetails(material);
      const wordLimits = this.getWordLimits(material);
      const minWords = wordLimits.minimum;
      const maxWords = wordLimits.maximum;

      return `
        <div class="mock-schreiben-container">
          <!-- Task Prompt Card -->
          <div class="mock-prompt-card">
            <span class="mock-prompt-badge">${this.escapeHtml(step.teil)}</span>
            <h2 class="mock-prompt-title">${this.escapeHtml(material.title || "Schreibaufgabe")}</h2>
            
            ${taskDetails.situation ? `
              <div class="mock-prompt-situation">${this.sanitizeRichText(taskDetails.situation)}</div>
            ` : ""}
            
            <p style="font-weight:600; font-size:0.92rem; color:var(--ink); margin-bottom:8px;">${this.sanitizeRichText(taskDetails.aufgabe)}</p>
            
            ${taskDetails.points.length > 0 ? `
              <div class="mock-prompt-points-title">Leitpunkte:</div>
              <ul class="mock-prompt-points">
                ${taskDetails.points.map(pt => `<li>${this.escapeHtml(pt)}</li>`).join("")}
              </ul>
            ` : ""}
          </div>

          <!-- Student Input Card -->
          <div class="mock-editor-card">
            <div class="mock-editor-header">
              <span class="mock-editor-title">Ihr Text (Your German Writing):</span>
              <div id="mock-schreiben-word-pill" class="mock-word-counter">
                0 / ${maxWords} words
              </div>
            </div>

            <!-- German Special Characters Toolbar -->
            <div class="mock-umlauts-row">
              <span style="font-size:0.75rem; color:var(--muted); font-weight:600; margin-right:4px;">Umlaute:</span>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('ä')">ä</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('ö')">ö</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('ü')">ü</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('ß')">ß</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('Ä')">Ä</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('Ö')">Ö</button>
              <button type="button" class="mock-umlaut-btn" onclick="window.MockPlayerComponent.insertSpecialChar('Ü')">Ü</button>
            </div>

            <textarea
              class="mock-textarea"
              id="mock-student-text"
              placeholder="Schreiben Sie hier Ihren Text... (${minWords ? `Richtwert: ${minWords}–${maxWords} Wörter` : `Maximal ${maxWords} Wörter`})"
              spellcheck="false"
              rows="12"
            >${this.escapeHtml(step.studentText || "")}</textarea>

            <div id="mock-schreiben-error-banner" class="mock-schreiben-error-banner" style="display:none;"></div>

            <div class="mock-schreiben-footnote">
              <i data-lucide="info" style="width:14px;height:14px; color:#64748b;"></i>
              <span>${minWords ? `Guideline: ${minWords}–${maxWords} words` : `Maximum ${maxWords} words`} · Consumes 1 weekly Schreiben credit upon evaluation</span>
            </div>
          </div>
        </div>
      `;
    }

    return `<p>Unsupported module: ${mod}</p>`;
  },

  renderObjectiveQuestionCard: function (q, idx, total) {
    const qId = String(q.id || `q-${idx + 1}`);
    const options = Array.isArray(q.options) ? q.options : [];

    return `
      <div class="mock-q-card" id="mock-q-card-${this.escapeHtml(qId)}">
        <div class="mock-q-header">
          <span class="mock-q-num">Frage ${idx + 1} / ${total}</span>
        </div>
        <div class="mock-q-text">${this.escapeHtml(q.question || "")}</div>
        <div class="mock-options-list">
          ${options.map(opt => `
            <label class="mock-option-label" id="label-${this.escapeHtml(qId)}-${this.escapeHtml(opt)}">
              <input
                type="radio"
                class="mock-radio-input"
                name="q_${this.escapeHtml(qId)}"
                value="${this.escapeHtml(opt)}"
                data-qid="${this.escapeHtml(qId)}"
                data-val="${this.escapeHtml(opt)}"
              />
              <span class="mock-option-text">${this.escapeHtml(opt)}</span>
            </label>
          `).join("")}
        </div>
        <div class="mock-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
      </div>
    `;
  },

  renderGrammatikQuestionCard: function (q, idx, total) {
    const qId = String(q.id || `q-${idx + 1}`);
    const options = Array.isArray(q.options) ? q.options : [];
    const sentence = this.escapeHtml(q.question || "").replace(/_{2,}/g, "_____");

    return `
      <div class="mock-gram-card" id="mock-q-card-${this.escapeHtml(qId)}">
        <div class="mock-q-header">
          <span class="mock-q-num">Lücke ${idx + 1} / ${total}</span>
        </div>
        <div class="mock-gram-sentence">${sentence}</div>
        <div class="mock-gram-options">
          ${options.map(opt => `
            <button
              type="button"
              class="mock-gram-btn"
              data-qid="${this.escapeHtml(qId)}"
              data-val="${this.escapeHtml(opt)}"
              onclick="window.MockPlayerComponent.selectGrammatikOption('${this.escapeHtml(qId)}', '${this.escapeHtml(opt)}', this)"
            >
              ${this.escapeHtml(opt)}
            </button>
          `).join("")}
        </div>
        <div class="mock-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
      </div>
    `;
  },

  bindWorkspaceInputs: function (step) {
    const mod = step.module;

    if (mod === "Lesen" || mod === "Hören") {
      const radioInputs = document.querySelectorAll(".mock-radio-input");
      radioInputs.forEach(input => {
        input.addEventListener("change", (e) => {
          const qId = e.target.getAttribute("data-qid");
          const val = e.target.getAttribute("data-val");
          step.userAnswers[qId] = val;

          const parentList = e.target.closest(".mock-options-list");
          if (parentList) {
            parentList.querySelectorAll(".mock-option-label").forEach(l => l.classList.remove("selected"));
          }
          const currentLabel = e.target.closest(".mock-option-label");
          if (currentLabel) currentLabel.classList.add("selected");
        });
      });
    }

    if (mod === "Schreiben") {
      const textarea = document.getElementById("mock-student-text");
      const pill = document.getElementById("mock-schreiben-word-pill");
      const errorBanner = document.getElementById("mock-schreiben-error-banner");
      const submitBtn = document.getElementById("mock-submit-btn");

      if (textarea) {
        const onInput = () => {
          const text = textarea.value || "";
          step.studentText = text;
          const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean) : [];
          const count = words.length;

          const wordLimits = this.getWordLimits(step.loadedContent);
          const maxWords = wordLimits.maximum;
          const minWords = wordLimits.minimum;
          const warnThreshold = Math.floor(maxWords * 0.9);

          if (pill) {
            if (count > maxWords) {
              pill.innerHTML = `<span style="color:#b91c1c;">${count} / ${maxWords} words (Limit exceeded)</span>`;
              pill.className = "mock-word-counter mock-word-pill-error";
            } else {
              if (count >= warnThreshold) {
                pill.className = "mock-word-counter mock-word-pill-warn";
              } else if (minWords && count >= minWords) {
                pill.className = "mock-word-counter target-met";
              } else {
                pill.className = "mock-word-counter";
              }

              if (minWords && count > 0 && count < minWords) {
                pill.textContent = `${count} / ${maxWords} words (Target: min. ${minWords})`;
              } else {
                pill.textContent = `${count} / ${maxWords} words`;
              }
            }
          }

          if (count > maxWords) {
            if (errorBanner) {
              errorBanner.textContent = `The maximum word limit is ${maxWords} words. Please shorten your text by ${count - maxWords} words.`;
              errorBanner.style.display = "block";
            }
            if (submitBtn) submitBtn.disabled = true;
          } else {
            if (errorBanner) errorBanner.style.display = "none";
            if (submitBtn && !this.isEvaluating) submitBtn.disabled = false;
          }
        };

        textarea.addEventListener("input", onInput);
        onInput();
      }
    }
  },

  selectGrammatikOption: function (qId, optionVal, btnEl) {
    if (!this.activeExam) return;
    const step = this.activeExam.steps[this.activeExam.currentStepIndex];
    if (!step) return;

    step.userAnswers[qId] = optionVal;

    const card = document.getElementById(`mock-q-card-${qId}`);
    if (card) {
      card.querySelectorAll(".mock-gram-btn").forEach(b => b.classList.remove("selected"));
    }
    if (btnEl) btnEl.classList.add("selected");
  },

  insertSpecialChar: function (char) {
    const textarea = document.getElementById("mock-student-text");
    if (!textarea) return;

    const start = textarea.selectionStart || textarea.value.length;
    const end = textarea.selectionEnd || textarea.value.length;
    const val = textarea.value;

    textarea.value = val.substring(0, start) + char + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + char.length;
    textarea.focus();
    textarea.dispatchEvent(new Event("input"));
  },

  /* ============================================================
   * 6. SCHREIBEN UTILITIES
   * ============================================================ */
  getWordLimits: function (material) {
    if (!material) return { minimum: null, maximum: 200 };

    const taskObj = (material.task && typeof material.task === "object") ? material.task : null;
    const wordCountObj = (taskObj?.word_count && typeof taskObj.word_count === "object")
      ? taskObj.word_count
      : ((material.word_count && typeof material.word_count === "object") ? material.word_count : null);

    const minVal = wordCountObj?.minimum ?? material.min_words ?? material.minimum_words ?? null;
    const maxVal = wordCountObj?.maximum ?? material.word_limit ?? material.max_words ?? material.maximum_words ?? 200;

    const minimum = (typeof minVal === "number" && minVal > 0) ? minVal : null;
    const maximum = (typeof maxVal === "number" && maxVal > 0) ? maxVal : 200;

    return { minimum, maximum };
  },

  extractTaskDetails: function (material) {
    if (!material) {
      return {
        situation: "",
        aufgabe: "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.",
        points: [],
        minWords: null,
        maxWords: 200
      };
    }

    const taskObj = (material.task && typeof material.task === "object") ? material.task : null;

    const situation = String(
      taskObj?.situation ||
      material.situation ||
      material.context ||
      material.passage ||
      ""
    ).trim();

    const aufgabe = String(
      taskObj?.aufgabe ||
      taskObj?.task ||
      (typeof material.task === "string" ? material.task : "") ||
      material.prompt ||
      material.instructions ||
      material.question ||
      "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung."
    ).trim();

    const rawPoints = (taskObj && (taskObj.leitpunkte || taskObj.points)) ||
      material.leitpunkte ||
      material.points ||
      material.bullet_points ||
      [];

    let points = [];
    if (Array.isArray(rawPoints)) {
      points = rawPoints
        .map(p => {
          if (typeof p === "string") return p.trim();
          if (p && typeof p === "object") return String(p.requirement || p.text || p.point || "").trim();
          return "";
        })
        .filter(Boolean);
    } else if (typeof rawPoints === "string" && rawPoints.trim()) {
      points = rawPoints
        .split(/\r?\n/)
        .map(line => line.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter(Boolean);
    }

    const limits = this.getWordLimits(material);

    return {
      situation,
      aufgabe,
      points,
      minWords: limits.minimum,
      maxWords: limits.maximum
    };
  },

  sanitizeRichText: function (value) {
    const text = String(value ?? "");
    if (typeof document === "undefined") return this.escapeHtml(text);

    const template = document.createElement("template");
    template.innerHTML = text;
    template.content.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach(node => node.remove());
    return template.innerHTML;
  },

  stripHtml: function (html) {
    if (!html) return "";
    const div = document.createElement("div");
    div.innerHTML = String(html);
    return div.textContent || div.innerText || "";
  },

  /* ============================================================
   * 7. INDEPENDENT TEIL TIMER
   * ============================================================ */
  startTeilTimer: function (durationSeconds) {
    this.stopTimer();

    let remaining = Math.max(10, parseInt(durationSeconds || 600, 10));
    const timerDisplay = document.getElementById("mock-timer-display");
    const timerText = document.getElementById("mock-timer-text");

    const updateTimerUi = () => {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      if (timerText) timerText.textContent = formatted;

      if (timerDisplay) {
        if (remaining <= 60) {
          timerDisplay.className = "mock-timer-box timer-critical";
        } else if (remaining <= 120) {
          timerDisplay.className = "mock-timer-box timer-warning";
        } else {
          timerDisplay.className = "mock-timer-box";
        }
      }
    };

    updateTimerUi();

    this.activeTimerInterval = setInterval(() => {
      remaining -= 1;
      updateTimerUi();

      if (remaining <= 0) {
        this.stopTimer();
        if (window.PracticeApp) {
          window.PracticeApp.showToast("⏳ Time expired! Automatically submitting this Teil...", "warning", 3000);
        }
        this.submitCurrentStep(this.activeExam.currentStepIndex, true);
      }
    }, 1000);
  },

  stopTimer: function () {
    if (this.activeTimerInterval) {
      clearInterval(this.activeTimerInterval);
      this.activeTimerInterval = null;
    }
  },

  /* ============================================================
   * 8. TEIL EVALUATION & PERSISTENCE
   * ============================================================ */
  submitCurrentStep: async function (stepIndex, autoSubmit = false) {
    if (this.isEvaluating || !this.activeExam) return;
    this.stopTimer();

    const step = this.activeExam.steps[stepIndex];
    if (!step) return;

    if (step.module === "Schreiben") {
      await this.evaluateSchreibenStep(step, stepIndex, autoSubmit);
    } else {
      await this.evaluateObjectiveStep(step, stepIndex);
    }
  },

  evaluateObjectiveStep: async function (step, stepIndex) {
    const submitBtn = document.getElementById("mock-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="btn-spinner"></span> Submitting...`;
    }

    this.isEvaluating = true;

    try {
      const material = step.loadedContent;
      const questions = material.questions || [];
      const userAnswers = step.userAnswers || {};

      let rawScore = 0;
      const rawTotal = Math.max(1, questions.length);

      questions.forEach(q => {
        if (userAnswers[q.id] === q.correctAnswer) {
          rawScore++;
        }
      });

      const multiplier = this.calculateMultiplier(material, this.activeExam.format, this.activeExam.level);
      const earnedMarks = Math.round((rawScore * multiplier + Number.EPSILON) * 100) / 100;
      const totalMarks = Math.round((rawTotal * multiplier + Number.EPSILON) * 100) / 100;
      const pct = totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 100) : 0;

      const stepResult = {
        stepIndex: stepIndex,
        module: step.module,
        teil: step.teil,
        materialId: material.id,
        title: material.title,
        rawScore: rawScore,
        rawTotal: rawTotal,
        multiplier: multiplier,
        earnedMarks: earnedMarks,
        totalMarks: totalMarks,
        scorePercent: pct,
        skipped: false,
        userAnswers: userAnswers,
        questions: questions
      };

      this.activeExam.stepResults[stepIndex] = stepResult;
      this.saveActiveExamState();

      // Save individual attempt to Supabase practice_attempts table
      await this.savePracticeAttemptToSupabase(material, rawScore, rawTotal, pct);

      // Render Review & Corrections screen for this Teil
      this.renderTeilReviewScreen(step, stepResult, stepIndex);

    } catch (err) {
      console.error("MockPlayer: Evaluation error on objective step:", step, err);
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Submit ${step.teil}`;
      }
      if (window.PracticeApp) {
        window.PracticeApp.showToast("Failed to submit Teil: " + (err.message || "Network error"), "error", 4000);
      }
    } finally {
      this.isEvaluating = false;
    }
  },

  evaluateSchreibenStep: async function (step, stepIndex, autoSubmit = false) {
    const material = step.loadedContent;
    const textarea = document.getElementById("mock-student-text");
    const studentText = String(textarea?.value || step.studentText || "").trim();
    step.studentText = studentText;

    if (!autoSubmit && !studentText) {
      if (window.PracticeApp) {
        window.PracticeApp.showToast("Please enter your writing before submitting.", "warning", 3500);
      }
      return;
    }

    // Check Schreiben credits allowance before calling evaluation
    if (window.AppState && typeof window.AppState.schreibenCreditsRemaining === "number" && window.AppState.schreibenCreditsRemaining <= 0) {
      this.showSchreibenCreditModal(step, stepIndex);
      return;
    }

    const submitBtn = document.getElementById("mock-submit-btn");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="btn-spinner"></span> Evaluating...`;
    }

    const workspaceBody = document.getElementById("mock-workspace-body");
    if (workspaceBody) {
      workspaceBody.innerHTML = `
        <div style="min-height:60vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px;">
          <div class="app-spinner" style="width:40px; height:40px; border-width:3px;"></div>
          <h2 style="font-size:1.15rem; font-weight:700; margin:0; color:var(--ink);">Evaluating your German writing...</h2>
          <p style="font-size:0.88rem; color:var(--muted); margin:0;">Assessing against official CEFR examination criteria for task fulfillment, vocabulary, and grammar.</p>
        </div>
      `;
    }

    this.isEvaluating = true;

    try {
      const taskDetails = this.extractTaskDetails(material);
      const wordLimits = this.getWordLimits(material);

      const idToken = (window.PracticeApp && typeof window.PracticeApp.getFirebaseIdToken === "function")
        ? await window.PracticeApp.getFirebaseIdToken()
        : "";

      if (!idToken) {
        throw new Error("You must be logged in to submit writing evaluation.");
      }

      const payload = {
        material_id: material.id,
        exam: material.exam || this.activeExam.format,
        level: material.level || this.activeExam.level,
        teil: step.teil || "Teil 1",
        situation: taskDetails.situation || "",
        task: taskDetails.aufgabe || "",
        points: taskDetails.points || [],
        word_limit: wordLimits.maximum,
        word_count: {
          minimum: wordLimits.minimum,
          maximum: wordLimits.maximum
        },
        answer: studentText
      };

      if (material.evaluation && typeof material.evaluation === "object") {
        payload.evaluation = material.evaluation;
      }

      // Authoritative evaluation call via SupabaseService & Cloudflare Worker
      const evalRes = await window.SupabaseService.evaluateSchreiben(payload, idToken);

      if (!evalRes || !evalRes.success) {
        if (evalRes?.error === "insufficient_credits") {
          this.showSchreibenCreditModal(step, stepIndex);
          return;
        }
        throw new Error(evalRes?.message || "Schreiben evaluation service was unable to evaluate your response.");
      }

      // Update Schreiben credits remaining in AppState
      if (typeof evalRes.schreiben_credits_remaining === "number" && window.AppState) {
        window.AppState.schreibenCreditsRemaining = evalRes.schreiben_credits_remaining;
        if (typeof evalRes.weekly_schreiben_limit === "number") {
          window.AppState.weeklySchreibenLimit = evalRes.weekly_schreiben_limit;
        }
        if (window.SchreibenPlayerComponent && typeof window.SchreibenPlayerComponent.updateWeeklyCreditsDisplay === "function") {
          window.SchreibenPlayerComponent.updateWeeklyCreditsDisplay(evalRes.schreiben_credits_remaining, evalRes.weekly_schreiben_limit);
        }
      }

      const evalObj = evalRes.evaluation || {};
      const scorePct = typeof evalObj.score_percent === "number" ? evalObj.score_percent : 70;
      const totalMarks = 25; // Standard 25 marks per module in Goethe/Telc
      const earnedMarks = Math.round(((scorePct / 100) * totalMarks + Number.EPSILON) * 100) / 100;

      const stepResult = {
        stepIndex: stepIndex,
        module: "Schreiben",
        teil: step.teil,
        materialId: material.id,
        title: material.title,
        rawScore: Math.round(scorePct / 10),
        rawTotal: 10,
        multiplier: 2.5,
        earnedMarks: earnedMarks,
        totalMarks: totalMarks,
        scorePercent: scorePct,
        skipped: false,
        studentText: studentText,
        evaluation: evalObj
      };

      this.activeExam.stepResults[stepIndex] = stepResult;
      this.saveActiveExamState();

      // Save individual attempt to Supabase practice_attempts table
      await this.savePracticeAttemptToSupabase(material, Math.round(scorePct / 10), 10, scorePct);

      // Render Review & Corrections screen for Schreiben
      this.renderTeilReviewScreen(step, stepResult, stepIndex);

    } catch (err) {
      console.error("MockPlayer: Schreiben evaluation error:", err);
      if (window.PracticeApp) {
        window.PracticeApp.showToast("Evaluation error: " + (err.message || "Network error"), "error", 4500);
      }
      // Re-render active workspace so user can retry or edit
      this.renderActiveStepWorkspace(step, stepIndex, this.activeExam.steps.length);
    } finally {
      this.isEvaluating = false;
    }
  },

  showSchreibenCreditModal: function (step, stepIndex) {
    const existing = document.getElementById("mock-credit-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "mock-modal-overlay";
    overlay.id = "mock-credit-modal";

    overlay.innerHTML = `
      <div class="mock-confirm-box">
        <h3 class="mock-confirm-title" style="color:#b91c1c;">No Schreiben Credits Remaining</h3>
        <p class="mock-confirm-desc">
          You have used all of your weekly Schreiben evaluation credits. To complete your examination without writing evaluation, you can skip this Teil.
        </p>
        <div class="mock-confirm-actions">
          <button type="button" class="btn-secondary" id="mock-credit-cancel">Back</button>
          <button type="button" class="btn-primary" id="mock-credit-skip">Skip this Teil</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("mock-credit-cancel").addEventListener("click", () => {
      overlay.remove();
      this.renderActiveStepWorkspace(step, stepIndex, this.activeExam.steps.length);
    });

    document.getElementById("mock-credit-skip").addEventListener("click", () => {
      overlay.remove();
      this.skipCurrentStep(stepIndex);
    });
  },

  calculateMultiplier: function (material, format, level) {
    const fmt = String(format || "goethe").toLowerCase().trim() === "telc" ? "telc" : "goethe";
    const lvl = String(level || "A1").toUpperCase().trim();
    const isA1 = lvl === "A1";
    const isA2 = lvl === "A2";
    const isB1B2 = lvl === "B1" || lvl === "B2";

    if (fmt === "goethe") {
      if (isA1) return 1;
      if (isA2) return 1.25;
      if (isB1B2) return 3.33;
      return 1;
    }

    if (fmt === "telc") {
      if (isA1 || isA2) return 1;
      if (isB1B2) {
        const mod = String(material.module || "").toLowerCase();
        if (mod.includes("lesen")) return 2.5;
        if (mod.includes("h")) return 2.5;
        if (mod.includes("gramm")) return 1.5;
      }
    }

    return 1;
  },

  savePracticeAttemptToSupabase: async function (material, correctAnswers, totalQuestions, scorePercent) {
    if (!window.SupabaseService || typeof window.SupabaseService.getSupabaseClient !== "function") return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

      const uid = this.activeExam.uid;
      if (!uid || uid === "local-user" || uid === "anonymous") return;

      const payload = {
        uid: uid,
        material_id: String(material.id),
        level: this.activeExam.level,
        format: this.activeExam.format,
        module: material.module || "Lesen",
        correct_answers: parseInt(correctAnswers || 0, 10),
        total_questions: Math.max(1, parseInt(totalQuestions || 1, 10)),
        score_percent: parseInt(scorePercent || 0, 10),
        completed_at: new Date().toISOString()
      };

      await supabase.from("practice_attempts").insert([payload]);
    } catch (err) {
      console.warn("MockPlayer: Failed to record individual practice attempt to Supabase:", err);
    }
  },

  /* ============================================================
   * 9. TEIL REVIEW & CORRECTIONS SCREEN
   * ============================================================ */
  renderTeilReviewScreen: function (step, result, stepIndex) {
    const root = document.getElementById("mock-player-root");
    if (!root) return;

    const totalSteps = this.activeExam.steps.length;
    const isLastStep = stepIndex + 1 >= totalSteps;
    const isPass = result.scorePercent >= 60;
    const nextStep = this.activeExam.steps[stepIndex + 1];
    const nextLabel = isLastStep
      ? "View Final Exam Report"
      : `Continue to ${nextStep.module} ${nextStep.teil}`;

    root.innerHTML = `
      <header class="mock-cbt-header">
        <div class="mock-header-left">
          <div class="mock-exam-info-header">
            <span class="mock-exam-title-text">${this.activeExam.format.toUpperCase()} ${this.activeExam.level} · Results & Corrections</span>
            <div class="mock-step-indicator">
              <span class="mock-step-pill">Teil ${stepIndex + 1} / ${totalSteps} Completed</span>
              <span>· ${step.module} ${step.teil}</span>
            </div>
          </div>
        </div>

        <div class="mock-header-right">
          <button type="button" class="mock-btn-next-teil" onclick="window.MockPlayerComponent.nextStep(this)">
            <span>${nextLabel}</span>
            <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
          </button>
        </div>
      </header>

      <div class="mock-workspace">
        <div class="mock-review-screen">
          <!-- Summary Banner -->
          <div class="mock-review-banner">
            <div>
              <div class="mock-review-score-title">${step.module} ${step.teil} Score</div>
              <div class="mock-review-score-val">
                ${result.earnedMarks} / ${result.totalMarks} Marks
                <span style="font-size:1.1rem; color:var(--muted); font-weight:600;">(${result.scorePercent}%)</span>
              </div>
            </div>

            <div class="mock-review-actions">
              <span class="badge-pill ${isPass ? 'badge-emerald' : 'badge-rose'}" style="font-size:0.85rem; padding:6px 14px;">
                <i data-lucide="${isPass ? 'check' : 'x'}" style="width:14px;height:14px;"></i>
                ${isPass ? 'Bestanden (Passed)' : 'Needs Review'}
              </span>
              <button type="button" class="mock-btn-next-teil" onclick="window.MockPlayerComponent.nextStep(this)">
                <span>${nextLabel}</span>
                <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>
              </button>
            </div>
          </div>

          <!-- Answers and Corrections -->
          ${this.renderReviewCorrectionsHtml(step, result)}
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  renderReviewCorrectionsHtml: function (step, result) {
    if (step.module === "Schreiben") {
      const ev = result.evaluation || {};
      const criteria = Array.isArray(ev.criteria) ? ev.criteria : [];
      const tfPoints = ev.task_fulfillment && Array.isArray(ev.task_fulfillment.points) ? ev.task_fulfillment.points : [];
      const mistakes = Array.isArray(ev.mistakes) ? ev.mistakes : [];
      const wordUsage = Array.isArray(ev.word_usage) ? ev.word_usage : [];
      const strengths = Array.isArray(ev.feedback_details?.strengths) ? ev.feedback_details.strengths : [];
      const improvements = Array.isArray(ev.feedback_details?.improvements) ? ev.feedback_details.improvements : [];
      const betterGerman = ev.better_german || ev.exemplary_text || "";
      const redemittel = Array.isArray(ev.redemittel) ? ev.redemittel : [];

      return `
        <!-- Submitted Student Text -->
        <div class="mock-editor-card" style="margin-bottom:20px;">
          <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 12px;">Submitted Text</h3>
          <div style="background:var(--paper); padding:16px; border-radius:8px; font-size:0.92rem; line-height:1.65; white-space:pre-wrap;">${this.escapeHtml(result.studentText || "(No text submitted)")}</div>
        </div>

        <!-- CEFR Assessment Rubric -->
        ${criteria.length > 0 ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 4px;">CEFR Assessment Rubric</h3>
            <p style="font-size:0.82rem; color:var(--muted); margin:0 0 12px;">Standardized German examination criteria breakdown</p>
            <div class="mock-rubric-grid">
              ${criteria.map(c => `
                <div class="mock-rubric-card">
                  <div class="mock-rubric-card-title">${this.escapeHtml(c.name || c.criterion)}</div>
                  <div class="mock-rubric-card-score">${c.score !== undefined ? `${c.score} / ${c.max || 25}` : "Evaluated"}</div>
                  ${c.feedback ? `<p style="font-size:0.8rem; color:#475569; margin:6px 0 0;">${this.escapeHtml(c.feedback)}</p>` : ""}
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Task Fulfillment Bullet Points -->
        ${tfPoints.length > 0 ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 4px;">Task Fulfillment (Bullet Points)</h3>
            <p style="font-size:0.82rem; color:var(--muted); margin:0 0 12px;">Analysis of required exam cues and textual evidence</p>
            <div class="mock-tf-list">
              ${tfPoints.map(p => {
                const st = String(p.status || "").toLowerCase();
                const badgeClass = st === "fulfilled" ? "status-fulfilled" : (st === "partial" ? "status-partial" : "status-missing");
                const badgeLabel = st === "fulfilled" ? "✓ Fulfilled" : (st === "partial" ? "⚠ Partial" : "✗ Missing");
                return `
                  <div class="mock-tf-item">
                    <div class="mock-tf-header">
                      <strong style="font-size:0.88rem; color:var(--ink);">Bullet Point #${p.id || 1}: ${this.escapeHtml(p.requirement || "")}</strong>
                      <span class="mock-tf-badge ${badgeClass}">${badgeLabel}</span>
                    </div>
                    ${p.evidence ? `<p style="margin:8px 0 0 0; font-size:0.85rem; color:#334155; font-style:italic;">„${this.escapeHtml(p.evidence)}“</p>` : `<p style="margin:8px 0 0 0; font-size:0.82rem; color:#94a3b8;">No textual evidence found.</p>`}
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Key Mistakes & Corrections -->
        <div class="mock-editor-card" style="margin-bottom:20px;">
          <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 4px;">Key Mistakes & Corrections</h3>
          <p style="font-size:0.82rem; color:var(--muted); margin:0 0 12px;">Grammar and structural corrections from your text</p>
          ${mistakes.length > 0 ? `
            <div class="mock-mistakes-list">
              ${mistakes.map(m => `
                <div class="mock-mistake-card">
                  <div class="mock-mistake-row">
                    <span class="mock-mistake-pill grammar">Grammar</span>
                    <span class="mock-badge-orig">${this.escapeHtml(m.original || "")}</span>
                    <span class="mock-arrow">➔</span>
                    <span class="mock-badge-corr">${this.escapeHtml(m.correction || "")}</span>
                  </div>
                  ${m.explanation ? `<div class="mock-mistake-exp">${this.escapeHtml(m.explanation)}</div>` : ""}
                  ${m.rule ? `<div style="font-size:0.78rem; color:#64748b; margin-top:2px;"><strong>Rule:</strong> ${this.escapeHtml(m.rule)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : `
            <div style="background:#f0fdf4; border:1px solid #86efac; border-radius:8px; padding:14px; color:#15803d; font-size:0.88rem;">
              ✓ No major grammar errors detected. Excellent accuracy!
            </div>
          `}
        </div>

        <!-- Word Choice & Vocabulary Suggestions -->
        ${wordUsage.length > 0 ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 4px;">Word Choice & Vocabulary (Word Usage)</h3>
            <p style="font-size:0.82rem; color:var(--muted); margin:0 0 12px;">Suggestions to elevate your lexical register</p>
            <div class="mock-mistakes-list">
              ${wordUsage.map(wu => `
                <div class="mock-mistake-card">
                  <div class="mock-mistake-row">
                    <span class="mock-mistake-pill vocab">Vocabulary</span>
                    <span class="mock-badge-orig">${this.escapeHtml(wu.original || "")}</span>
                    <span class="mock-arrow">➔</span>
                    <span class="mock-badge-corr">${this.escapeHtml(wu.suggestion || wu.correction || "")}</span>
                  </div>
                  ${wu.explanation ? `<div class="mock-mistake-exp">${this.escapeHtml(wu.explanation)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <!-- Better German / Exemplary Reformulation -->
        ${betterGerman ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 4px;">Exemplary German Formulation (Better German)</h3>
            <p style="font-size:0.82rem; color:var(--muted); margin:0 0 12px;">Model phrasing meeting full CEFR examination standards</p>
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; font-size:0.9rem; line-height:1.65; white-space:pre-wrap;">${this.escapeHtml(betterGerman)}</div>
          </div>
        ` : ""}

        <!-- Useful Redemittel -->
        ${redemittel.length > 0 ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 12px;">Useful Redemittel (Examination Phrases)</h3>
            <ul style="margin:0; padding-left:20px; font-size:0.88rem; color:#334155; line-height:1.6;">
              ${redemittel.map(r => `<li>${this.escapeHtml(r)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        <!-- Strengths & Areas for Improvement -->
        ${strengths.length > 0 || improvements.length > 0 ? `
          <div class="mock-editor-card" style="margin-bottom:20px;">
            <h3 style="font-size:1.05rem; font-weight:700; margin:0 0 12px;">Overall Qualitative Feedback</h3>
            ${strengths.length > 0 ? `
              <div style="margin-bottom:12px;">
                <strong style="color:#059669; font-size:0.88rem;">Key Strengths:</strong>
                <ul style="margin:4px 0 0 18px; font-size:0.88rem; color:#334155; line-height:1.5;">
                  ${strengths.map(s => `<li>${this.escapeHtml(s)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
            ${improvements.length > 0 ? `
              <div>
                <strong style="color:#d97706; font-size:0.88rem;">Recommendations for Improvement:</strong>
                <ul style="margin:4px 0 0 18px; font-size:0.88rem; color:#334155; line-height:1.5;">
                  ${improvements.map(imp => `<li>${this.escapeHtml(imp)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        ` : ""}
      `;
    }

    // Objective Questions Review (Lesen, Hören, Grammatik)
    const questions = result.questions || [];
    const answers = result.userAnswers || {};

    return `
      <div class="mock-questions-list">
        ${questions.map((q, idx) => {
          const userAns = answers[q.id];
          const isCorrect = userAns === q.correctAnswer;
          const expl = q.explanation ? `<div style="margin-top:6px; font-size:0.82rem; opacity:0.9;"><strong>Explanation:</strong> ${this.escapeHtml(q.explanation)}</div>` : "";

          return `
            <div class="mock-q-card" style="border-left: 4px solid ${isCorrect ? '#10b981' : '#f43f5e'};">
              <div class="mock-q-header">
                <span class="mock-q-num">Frage ${idx + 1}</span>
                <span class="badge-pill ${isCorrect ? 'badge-emerald' : 'badge-rose'}">
                  ${isCorrect ? '✓ Richtig' : '✗ Falsch'}
                </span>
              </div>
              <div class="mock-q-text">${this.escapeHtml(q.question || "")}</div>

              <div style="font-size:0.88rem; margin-bottom:8px;">
                <span>Your Answer: </span>
                <strong style="color:${isCorrect ? '#059669' : '#dc2626'};">${this.escapeHtml(userAns || "(No answer selected)")}</strong>
              </div>

              ${!isCorrect ? `
                <div style="font-size:0.88rem; color:#059669; margin-bottom:8px;">
                  <span>Correct Answer: </span>
                  <strong>${this.escapeHtml(q.correctAnswer || "")}</strong>
                </div>
              ` : ""}

              ${expl ? `
                <div class="mock-review-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}">
                  ${expl}
                </div>
              ` : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  },

  skipCurrentStep: function (stepIndex, btnEl = null) {
    if (!this.activeExam) return;
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="btn-spinner"></span> Skipping...`;
    }

    const step = this.activeExam.steps[stepIndex];
    if (step) {
      step.isSkipped = true;
      this.activeExam.stepResults[stepIndex] = {
        stepIndex: stepIndex,
        module: step.module,
        teil: step.teil,
        materialId: null,
        title: `${step.module} ${step.teil}`,
        earnedMarks: 0,
        totalMarks: 0,
        scorePercent: null,
        skipped: true,
        skipReason: step.skipReason || "Skipped by learner"
      };
      this.saveActiveExamState();
    }

    this.nextStep();
  },

  nextStep: function (btnEl = null) {
    if (!this.activeExam) return;
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = `<span class="btn-spinner"></span> Loading...`;
    }
    const nextIdx = this.activeExam.currentStepIndex + 1;
    if (nextIdx >= this.activeExam.steps.length) {
      this.finishMockExam();
    } else {
      this.loadStep(nextIdx);
    }
  },

  /* ============================================================
   * 10. FINAL MOCK EXAM RESULT & AGGREGATION
   * ============================================================ */
  finishMockExam: async function () {
    if (!this.activeExam) return;
    this.stopTimer();

    const root = document.getElementById("mock-player-root");
    if (root) {
      root.innerHTML = `
        <div class="mock-workspace" style="min-height:80vh; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px;">
          <div class="app-spinner" style="width:40px; height:40px; border-width:3px;"></div>
          <p style="font-size:1rem; font-weight:700; color:var(--ink);">Aggregating official Examination Results...</p>
        </div>
      `;
    }

    const exam = this.activeExam;
    const results = exam.stepResults || {};
    const modules = ["Lesen", "Grammatik", "Hören", "Schreiben"];

    const sectionScores = {};
    let totalScore = 0;
    let maxScore = 0;

    modules.forEach(mod => {
      let modEarned = 0;
      let modTotal = 0;
      let count = 0;

      Object.values(results).forEach(res => {
        if (res.module === mod && !res.skipped) {
          modEarned += Number(res.earnedMarks || 0);
          modTotal += Number(res.totalMarks || 0);
          count++;
        }
      });

      const pct = modTotal > 0 ? Math.round((modEarned / modTotal) * 100) : null;
      sectionScores[mod] = {
        score: Math.round(modEarned * 100) / 100,
        total: Math.round(modTotal * 100) / 100,
        percent: pct,
        passed: pct !== null ? pct >= 60 : null,
        teileCompleted: count
      };

      totalScore += modEarned;
      maxScore += modTotal;
    });

    totalScore = Math.round(totalScore * 100) / 100;
    maxScore = Math.round(maxScore * 100) / 100;
    const overallPercent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const isPass = overallPercent >= 60;

    const completedAt = new Date().toISOString();
    const startMs = new Date(exam.startedAt).getTime();
    const durationSeconds = Math.max(1, Math.round((Date.now() - startMs) / 1000));

    const finalReport = {
      examId: exam.examId,
      uid: exam.uid,
      level: exam.level,
      format: exam.format,
      totalScore: totalScore,
      maxScore: maxScore,
      scorePercent: overallPercent,
      passed: isPass,
      startedAt: exam.startedAt,
      completedAt: completedAt,
      durationSeconds: durationSeconds,
      sectionScores: sectionScores,
      teile: Object.values(results)
    };

    exam.isExamFinished = true;
    exam.finalReport = finalReport;
    this.saveActiveExamState();

    // Save final exam attempt into Supabase mock_attempts table
    if (window.SupabaseService && typeof window.SupabaseService.saveMockAttempt === "function") {
      try {
        await window.SupabaseService.saveMockAttempt({
          uid: exam.uid,
          exam_id: exam.examId,
          level: exam.level,
          format: exam.format,
          total_score: totalScore,
          max_score: maxScore,
          score_percent: overallPercent,
          started_at: exam.startedAt,
          completed_at: completedAt,
          duration_seconds: durationSeconds,
          details: {
            passed: isPass,
            section_scores: sectionScores,
            teile: Object.values(results)
          }
        });
      } catch (saveErr) {
        console.warn("MockPlayer: Failed to save final mock attempt into Supabase:", saveErr);
      }
    }

    // Clear active exam session from storage upon completion
    localStorage.removeItem("coco_active_mock_exam");

    // Render Final Exam Report
    this.renderFinalReportScreen(finalReport);
  },

  renderFinalReportScreen: function (report) {
    const root = document.getElementById("mock-player-root");
    if (!root) return;

    const isPass = report.passed;
    const formatLabel = report.format.toUpperCase();
    const durationMins = Math.round(report.durationSeconds / 60);

    root.innerHTML = `
      <header class="mock-cbt-header">
        <div class="mock-header-left">
          <div class="mock-exam-info-header">
            <span class="mock-exam-title-text">${formatLabel} ${report.level} · Examination Simulation Report</span>
            <span class="mock-step-indicator">Official Performance Breakdown</span>
          </div>
        </div>
        <div class="mock-header-right">
          <button type="button" class="btn-secondary" onclick="window.print()">
            <i data-lucide="printer" style="width:16px;height:16px;"></i> Print Report
          </button>
          <button type="button" class="btn-primary" onclick="window.location.hash='#mock-exams'">
            <i data-lucide="check" style="width:16px;height:16px;"></i> Return to Hub
          </button>
        </div>
      </header>

      <div class="mock-workspace">
        <div class="mock-final-report">
          <!-- Hero Certificate Card -->
          <div class="mock-hero-cert-card">
            <div class="mock-cert-badge ${isPass ? 'badge-passed' : 'badge-review'}">
              <i data-lucide="${isPass ? 'shield-check' : 'alert-triangle'}" style="width:16px;height:16px;"></i>
              ${isPass ? 'Official Standard Met (Passed)' : 'Criteria Not Met (Needs Review)'}
            </div>

            <h1 class="mock-cert-title">${formatLabel}-Zertifikat ${report.level} Simulation</h1>
            <p class="mock-cert-subtitle">Official full-length examination simulation report for ${report.uid}</p>

            <div class="mock-cert-score-box">
              <span class="mock-cert-score-big">${report.scorePercent}%</span>
              <span class="mock-cert-score-pts">${report.totalScore} / ${report.maxScore} Total Points</span>
            </div>

            <div class="mock-cert-meta-row">
              <div class="mock-cert-meta-item">
                <span>Status:</span> <strong>${isPass ? 'Passed (≥ 60%)' : 'Needs Review (< 60%)'}</strong>
              </div>
              <div class="mock-cert-meta-item">
                <span>Duration:</span> <strong>${durationMins} Minutes</strong>
              </div>
              <div class="mock-cert-meta-item">
                <span>Date:</span> <strong>${new Date(report.completedAt).toLocaleDateString()}</strong>
              </div>
            </div>
          </div>

          <!-- Section Performance Cards -->
          <h2 style="font-size:1.2rem; font-weight:700; margin:8px 0 -8px; font-family:var(--font-heading);">Module Performance</h2>
          <div class="mock-section-grid">
            ${Object.entries(report.sectionScores).map(([modName, sec]) => {
              const pct = sec.percent !== null ? sec.percent : 0;
              const hasTaken = sec.percent !== null;
              const isSecPass = sec.passed === true;

              return `
                <div class="mock-section-card">
                  <div class="mock-sec-header">
                    <span class="mock-sec-name">${modName}</span>
                    <span class="badge-pill ${hasTaken ? (isSecPass ? 'badge-emerald' : 'badge-rose') : 'badge-gold'}" style="font-size:0.7rem; padding:2px 8px;">
                      ${hasTaken ? (isSecPass ? 'Pass' : 'Review') : 'Skipped'}
                    </span>
                  </div>
                  <div class="mock-sec-score">${hasTaken ? `${sec.score} / ${sec.total}` : 'N/A'}</div>
                  <div class="mock-sec-bar">
                    <div class="mock-sec-fill ${isSecPass ? 'is-pass' : 'is-fail'}" style="width: ${hasTaken ? pct : 0}%;"></div>
                  </div>
                  <div class="mock-sec-status">${hasTaken ? `${pct}% Score` : 'No materials evaluated'}</div>
                </div>
              `;
            }).join("")}
          </div>

          <!-- Detailed Breakdown Table -->
          <div class="mock-breakdown-card">
            <h2 class="mock-breakdown-title">Teil-by-Teil Performance Breakdown</h2>
            <div class="mock-table-wrap">
              <table class="mock-table">
                <thead>
                  <tr>
                    <th>Module</th>
                    <th>Teil</th>
                    <th>Material</th>
                    <th>Score</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${report.teile.map(t => {
                    const isSkipped = t.skipped;
                    const isTeilPass = !isSkipped && t.scorePercent >= 60;

                    return `
                      <tr>
                        <td><strong>${t.module}</strong></td>
                        <td>${t.teil || "-"}</td>
                        <td><span style="font-size:0.82rem; color:var(--muted);">${t.title || t.materialId || "(Skipped)"}</span></td>
                        <td><strong>${isSkipped ? '-' : `${t.earnedMarks} / ${t.totalMarks} (${t.scorePercent}%)`}</strong></td>
                        <td>
                          <span class="badge-pill ${isSkipped ? 'badge-gold' : (isTeilPass ? 'badge-emerald' : 'badge-rose')}">
                            ${isSkipped ? 'Skipped' : (isTeilPass ? 'Passed' : 'Needs Review')}
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join("")}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Actions -->
          <div class="mock-final-actions">
            <button type="button" class="btn-primary" onclick="window.location.hash='#mock-exams'">
              <i data-lucide="check" style="width:16px;height:16px;"></i> Return to Mock Exams Hub
            </button>
            <button type="button" class="btn-secondary" onclick="window.location.hash='#practice'">
              <i data-lucide="book-open" style="width:16px;height:16px;"></i> Practice Weak Modules
            </button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  /* ============================================================
   * 11. EXIT CONFIRMATION DIALOG
   * ============================================================ */
  confirmExit: function () {
    if (this._exitModalOpen) return;
    this._exitModalOpen = true;

    const overlay = document.createElement("div");
    overlay.className = "mock-modal-overlay";
    overlay.id = "mock-exit-modal";

    overlay.innerHTML = `
      <div class="mock-confirm-box">
        <h3 class="mock-confirm-title">Exit Examination Simulation?</h3>
        <p class="mock-confirm-desc">
          Are you sure you want to exit? Your answers for the current Teil will not be submitted, though completed Teile are saved in your history.
        </p>
        <div class="mock-confirm-actions">
          <button type="button" class="btn-secondary" id="mock-exit-cancel">Resume Exam</button>
          <button type="button" class="btn-primary" style="background:#dc2626; border-color:#dc2626;" id="mock-exit-confirm">Exit to Hub</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById("mock-exit-cancel").addEventListener("click", () => {
      overlay.remove();
      this._exitModalOpen = false;
    });

    document.getElementById("mock-exit-confirm").addEventListener("click", () => {
      this.stopTimer();
      overlay.remove();
      this._exitModalOpen = false;
      localStorage.removeItem("coco_active_mock_exam");
      window.location.hash = "#mock-exams";
    });
  },

  escapeHtml: function (val) {
    return String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(new RegExp('"', "g"), "&quot;")
      .replace(new RegExp("'", "g"), "&#39;");
  }
};
