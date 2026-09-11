/**
 * Coco Germany Practice App - Dedicated Schreiben Player Component
 * components/schreiben-player.js
 *
 * Dedicated, independent language examination writing player:
 * - Pure standalone component decoupled from InteractivePlayerComponent
 * - Full CEFR Task & Prompt Rendering from Material JSON
 * - Real-time word counter enforcing task-specific word limits
 * - Real loading state during server evaluation (no fake timeouts)
 * - True atomic weekly credit deduction via Cloudflare Worker
 * - Comprehensive CEFR evaluation result display with criteria breakdown, mistakes table & corrections
 * - Read-only review mode and retry functionality
 * - Integer scoring preservation for Supabase practice_attempts table
 * - Zero mention of AI/Gemini in user-facing UI
 */

window.SchreibenPlayerComponent = {
  currentMaterial: null,
  preloadedMaterial: null,
  currentSettings: null,
  studentAnswer: "",
  evaluationResult: null,
  isEvaluating: false,
  isSubmitted: false,
  isReviewMode: false,
  renderRequestId: 0,

  escapeHtml: function (value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  stripHtml: function (html) {
    if (!html) return "";
    if (typeof document === "undefined") {
      return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    const div = document.createElement("div");
    div.innerHTML = String(html);
    return div.textContent || div.innerText || "";
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
        const val = attribute.value.trim().toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || ((name === "href" || name === "src") && val.startsWith("javascript:"))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return template.innerHTML;
  },

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
        maxWords: 200,
        taskText: "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.",
        taskHtml: "<p>Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.</p>"
      };
    }

    const taskObj = (material.task && typeof material.task === "object") ? material.task : null;

    // 1. Situation / Context / Passage (reads from material.task.situation or flat fallbacks)
    const situation = String(
      taskObj?.situation ||
      material.situation ||
      material.context ||
      material.passage ||
      ""
    ).trim();

    // 2. Main Task / Prompt / Instruction / Aufgabe (reads from material.task.aufgabe or flat fallbacks)
    // Never treat material.task object as a display string
    const aufgabe = String(
      taskObj?.aufgabe ||
      taskObj?.task ||
      (typeof material.task === "string" ? material.task : "") ||
      material.prompt ||
      material.instructions ||
      material.question ||
      (Array.isArray(material.questions) && material.questions[0] && (material.questions[0].question || material.questions[0].prompt || material.questions[0].task)) ||
      ""
    ).trim();

    // 3. Leitpunkte / Guidelines / Cues (reads from material.task.leitpunkte or flat fallbacks)
    const rawPoints = (taskObj && (taskObj.leitpunkte || taskObj.points)) ||
      material.leitpunkte ||
      material.points ||
      material.bullet_points ||
      material.guidelines ||
      material.cues ||
      (Array.isArray(material.questions) && material.questions[0] && (material.questions[0].leitpunkte || material.questions[0].points)) ||
      [];

    let points = [];
    if (Array.isArray(rawPoints)) {
      points = rawPoints
        .map((p) => {
          if (typeof p === "string") return p.trim();
          if (p && typeof p === "object") return String(p.requirement || p.text || p.point || p.title || "").trim();
          return "";
        })
        .filter(Boolean);
    } else if (typeof rawPoints === "string" && rawPoints.trim()) {
      points = rawPoints
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter(Boolean);
    }

    const wordLimits = this.getWordLimits(material);
    const minWords = wordLimits.minimum;
    const maxWords = wordLimits.maximum;

    const partsHtml = [];
    const partsText = [];

    // 1. Situation HTML & Text
    if (situation) {
      partsHtml.push(`<div class="schreiben-task-situation" style="margin-bottom:12px; font-style:italic; color:#334155; line-height:1.65;">${this.sanitizeRichText(situation)}</div>`);
      partsText.push(`Situation / Kontext:\n${this.stripHtml(situation).trim()}`);
    }

    // 2. Aufgabe HTML & Text
    if (aufgabe) {
      partsHtml.push(`<div class="schreiben-task-instruction" style="font-weight:600; margin-bottom:12px; line-height:1.65;">${this.sanitizeRichText(aufgabe)}</div>`);
      partsText.push(`Aufgabe:\n${this.stripHtml(aufgabe).trim()}`);
    }

    // 3. Leitpunkte HTML & Text
    if (points.length > 0) {
      const pointItems = points
        .map((p) => `<li style="margin-bottom:6px;">${this.escapeHtml(p)}</li>`)
        .join("");
      partsHtml.push(`
        <div class="schreiben-task-points-block" style="margin-top:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 16px;">
          <div style="font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">Leitpunkte:</div>
          <ul class="schreiben-task-points" style="margin:0; padding-left:20px; line-height:1.65; color:#1e293b;">${pointItems}</ul>
        </div>
      `);
      partsText.push("Leitpunkte:\n" + points.map((p) => `- ${p}`).join("\n"));
    }

    // Fallback if none of the specific fields matched (and avoid displaying generic 'Test material')
    if (partsHtml.length === 0) {
      let fallback = String(material.description || "").trim();
      const isGeneric = !fallback || /^(test|test\s*material|schreibaufgabe)$/i.test(fallback);
      if (isGeneric) {
        fallback = "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.";
      }
      partsHtml.push(`<p style="line-height:1.65;">${this.escapeHtml(fallback)}</p>`);
      partsText.push(fallback);
    }

    return {
      situation,
      aufgabe,
      points,
      minWords,
      maxWords,
      taskHtml: partsHtml.join("\n"),
      taskText: partsText.join("\n\n")
    };
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
      console.warn("SchreibenPlayer: Invalid material asset URL:", value);
      return "";
    }
  },

  fetchMaterialContent: async function (contentPath) {
    if (!contentPath) return null;
    try {
      const fullUrl = this.resolveWorkerUrl(contentPath);
      const urlObj = new URL(fullUrl);
      urlObj.searchParams.set("v", Date.now().toString());
      const res = await fetch(urlObj.href, {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("SchreibenPlayer: fetchMaterialContent failed:", e);
      return null;
    }
  },

  render: function (appState, searchParams) {
    return `
      <div class="schreiben-player-root" id="schreiben-player-root">
        <!-- Sticky Minimal Header -->
        <header class="schreiben-header">
          <div class="schreiben-header-left">
            <button type="button" class="schreiben-exit-btn" id="schreiben-btn-exit" onclick="window.SchreibenPlayerComponent.exitPlayer()" title="Back to Practice Hub">
              <i data-lucide="arrow-left" style="width:18px;height:18px;"></i>
              <span class="schreiben-exit-label">Practice Hub</span>
            </button>
            <div class="schreiben-header-divider"></div>
            <div class="schreiben-brand-mark">
              <span class="schreiben-badge-gold">SCHREIBEN</span>
              <span class="schreiben-header-meta" id="schreiben-header-meta">Loading task...</span>
            </div>
          </div>
          <div class="schreiben-header-right">
            <div class="schreiben-credits-indicator" id="schreiben-credits-indicator">
              <i data-lucide="award" style="width:15px;height:15px; color:#d97706;"></i>
              <span id="schreiben-credits-text">Writing Module</span>
            </div>
          </div>
        </header>

        <!-- Dynamic Content Mount -->
        <main class="schreiben-content-container" id="schreiben-content-area">
          <div class="schreiben-loading-card">
            <div class="schreiben-spinner"></div>
            <p class="schreiben-loading-title">Loading writing task...</p>
            <p class="schreiben-loading-sub">Preparing task details and examination guidelines...</p>
          </div>
        </main>
      </div>
    `;
  },

  initPlayerMaterial: async function (materialId, appState) {
    const renderRequestId = ++this.renderRequestId;
    const level = appState ? appState.currentLevel || "A1" : "A1";

    let material = (this.preloadedMaterial && String(this.preloadedMaterial.id) === String(materialId))
      ? this.preloadedMaterial
      : null;

    // Check loaded materials cache from Practice Hub
    if (!material && materialId && window.PracticeHubComponent?.loadedMaterials) {
      const found = window.PracticeHubComponent.loadedMaterials.find(m => m && String(m.id) === String(materialId));
      if (found) {
        material = { ...found };
      }
    }

    // Fetch from Supabase materials table if not preloaded
    if (!material && materialId && window.SupabaseService?.getSupabaseClient) {
      try {
        const supabase = await window.SupabaseService.getSupabaseClient();
        if (supabase) {
          const { data: dbMat } = await supabase
            .from("materials")
            .select("id, title, description, exam, level, module, teil, material_number, content_path, difficulty, duration_minutes, active")
            .eq("id", materialId)
            .eq("active", true)
            .maybeSingle();

          if (dbMat) {
            material = {
              id: dbMat.id,
              title: dbMat.title,
              description: dbMat.description || "",
              exam: dbMat.exam || "goethe",
              level: dbMat.level || level,
              module: "Schreiben",
              teil: dbMat.teil || "",
              difficulty: dbMat.difficulty || "Medium",
              contentPath: dbMat.content_path
            };
          }
        }
      } catch (err) {
        console.warn("SchreibenPlayer: Supabase fetch error:", err);
      }
    }

    if (renderRequestId !== this.renderRequestId) return;

    // Load content JSON if contentPath is specified
    const contentPath = material && (material.contentPath || material.content_path);
    if (contentPath) {
      const content = await this.fetchMaterialContent(contentPath);
      if (renderRequestId !== this.renderRequestId) return;
      if (content) {
        material = {
          ...material,
          ...content,
          teil: material?.teil || content?.teil || "",
          exam: material?.exam || content?.exam || "goethe",
          level: material?.level || content?.level || level,
          module: "Schreiben"
        };
      }
    }

    // Fallback if material couldn't be resolved
    if (!material) {
      material = {
        id: materialId || "schreiben-fallback",
        title: `Writing Task (${level})`,
        exam: "goethe",
        level: level,
        module: "Schreiben",
        task: "Bitte verfasse einen kurzen Text nach CEFR-Prüfungsvorgabe.",
        teil: "Teil 1"
      };
    }

    this.currentMaterial = material;
    this.studentAnswer = "";
    this.evaluationResult = null;
    this.isEvaluating = false;
    this.isSubmitted = false;
    this.isReviewMode = false;

    this.updateHeaderMeta(material);
    this.renderWritingWorkspace();
  },

  updateHeaderMeta: function (material) {
    const metaEl = document.getElementById("schreiben-header-meta");
    if (metaEl && material) {
      const exam = (material.exam || "Goethe").toUpperCase();
      const lvl = (material.level || "A1").toUpperCase();
      const teil = material.teil ? `· ${material.teil}` : "";
      metaEl.textContent = `${exam} ${lvl} ${teil}`;
    }

    const creditsEl = document.getElementById("schreiben-credits-text");
    if (creditsEl) {
      if (window.AppState && typeof window.AppState.schreibenCreditsRemaining === "number") {
        creditsEl.textContent = `${window.AppState.schreibenCreditsRemaining} weekly credits`;
      } else {
        (async () => {
          try {
            const idToken = await (window.PracticeApp?.getFirebaseIdToken ? window.PracticeApp.getFirebaseIdToken() : null);
            if (idToken && window.SupabaseService?.checkSchreibenCredits) {
              const res = await window.SupabaseService.checkSchreibenCredits(idToken);
              if (res && typeof res.schreiben_credits_remaining === "number") {
                if (window.AppState) window.AppState.schreibenCreditsRemaining = res.schreiben_credits_remaining;
                const el = document.getElementById("schreiben-credits-text");
                if (el) el.textContent = `${res.schreiben_credits_remaining} weekly credits`;
              }
            }
          } catch (e) {}
        })();
      }
    }
  },

  renderWritingWorkspace: function () {
    const contentArea = document.getElementById("schreiben-content-area");
    if (!contentArea) return;

    const root = document.getElementById("schreiben-player-root");
    if (root) root.scrollTop = 0;

    const material = this.currentMaterial || {};
    const examFormat = (material.exam || "Goethe").toUpperCase();
    const level = (material.level || "A1").toUpperCase();
    const title = material.contentTitle || material.title || "Writing Task";
    const taskDetails = this.extractTaskDetails(material);
    const wordLimits = this.getWordLimits(material);
    const maxWords = wordLimits.maximum;
    const minWords = wordLimits.minimum;

    contentArea.innerHTML = `
      <div class="schreiben-workspace-card">
        <!-- Top Meta Pill Row -->
        <div class="schreiben-meta-row">
          <span class="schreiben-badge-pill schreiben-badge-level">${this.escapeHtml(examFormat)} ${this.escapeHtml(level)}</span>
          <span class="schreiben-badge-pill schreiben-badge-module">Writing</span>
          ${material.teil ? `<span class="schreiben-badge-pill schreiben-badge-sub">${this.escapeHtml(material.teil)}</span>` : ''}
        </div>

        <h1 class="schreiben-task-title">${this.escapeHtml(title)}</h1>

        <!-- Task Prompt Section -->
        <div class="schreiben-task-card">
          <div class="schreiben-task-header">
            <i data-lucide="file-text" style="width:16px;height:16px; color:#0284c7;"></i>
            <span>Task Prompt</span>
          </div>
          <div class="schreiben-task-body">${taskDetails.taskHtml}</div>
        </div>

        <!-- Student Input Section -->
        <div class="schreiben-input-card">
          <div class="schreiben-input-header">
            <label for="schreiben-textarea" class="schreiben-input-label">
              Your German Writing:
            </label>
            <div id="schreiben-word-count-pill" class="schreiben-word-pill">
              0 / ${maxWords} words
            </div>
          </div>

          <textarea
            id="schreiben-textarea"
            class="schreiben-textarea"
            placeholder="Write your text here in German... (${minWords ? `Minimum ${minWords}, maximum ${maxWords} words` : `Maximum ${maxWords} words`})"
            rows="12"
            oninput="window.SchreibenPlayerComponent.onTextInput(this)"
          >${this.escapeHtml(this.studentAnswer || "")}</textarea>

          <div id="schreiben-error-banner" class="schreiben-error-banner" style="display:none;"></div>
        </div>

        <!-- Actions Bar -->
        <div class="schreiben-actions-bar">
          <button
            type="button"
            id="schreiben-submit-btn"
            class="schreiben-btn-primary"
            onclick="window.SchreibenPlayerComponent.submitWriting()"
            disabled
          >
            <i data-lucide="send" style="width:16px;height:16px;"></i>
            <span>Submit Text for Evaluation</span>
          </button>
          <div class="schreiben-footnote">
            <i data-lucide="info" style="width:14px;height:14px; color:#64748b;"></i>
            <span>${minWords ? `Guideline: ${minWords}–${maxWords} words` : `Maximum ${maxWords} words`} · 1 weekly credit deducted upon successful evaluation</span>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Trigger initial word count check
    const textarea = document.getElementById("schreiben-textarea");
    if (textarea) {
      this.onTextInput(textarea);
    }
  },

  onTextInput: function (textarea) {
    const text = (textarea.value || "").trim();
    const words = text ? text.split(/\s+/).filter(Boolean) : [];
    const count = words.length;

    const wordLimits = this.getWordLimits(this.currentMaterial);
    const maxWords = wordLimits.maximum;
    const minWords = wordLimits.minimum;
    const warnThreshold = Math.floor(maxWords * 0.9);

    const pill = document.getElementById("schreiben-word-count-pill");
    const errorBanner = document.getElementById("schreiben-error-banner");
    const submitBtn = document.getElementById("schreiben-submit-btn");

    if (pill) {
      if (count > maxWords) {
        pill.innerHTML = `<span class="schreiben-text-danger">${count} / ${maxWords} words (Word limit exceeded!)</span>`;
        pill.classList.add("schreiben-pill-error");
        pill.classList.remove("schreiben-pill-warn");
      } else {
        pill.classList.remove("schreiben-pill-error");
        if (count >= warnThreshold) {
          pill.classList.add("schreiben-pill-warn");
        } else {
          pill.classList.remove("schreiben-pill-warn");
        }

        if (minWords && count > 0 && count < minWords) {
          pill.textContent = `${count} / ${maxWords} words (Recommended: min. ${minWords})`;
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
      if (submitBtn) {
        submitBtn.disabled = true;
      }
    } else if (count === 0) {
      if (errorBanner) {
        errorBanner.style.display = "none";
      }
      if (submitBtn) {
        submitBtn.disabled = true;
      }
    } else {
      if (errorBanner) {
        errorBanner.style.display = "none";
      }
      if (submitBtn && !this.isEvaluating) {
        submitBtn.disabled = false;
      }
    }
  },

  submitWriting: async function () {
    const textarea = document.getElementById("schreiben-textarea");
    const answerText = (textarea?.value || "").trim();
    const words = answerText ? answerText.split(/\s+/).filter(Boolean) : [];
    const wordCount = words.length;

    const errorBanner = document.getElementById("schreiben-error-banner");
    const submitBtn = document.getElementById("schreiben-submit-btn");

    if (wordCount === 0) {
      if (errorBanner) {
        errorBanner.textContent = "Please enter your text before submitting.";
        errorBanner.style.display = "block";
      }
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast("Please enter your text.", "warning", 3500);
      }
      return;
    }

    const material = this.currentMaterial || { id: "schreiben-1", module: "Schreiben", level: "A1", exam: "goethe", teil: "Teil 2" };
    const wordLimits = this.getWordLimits(material);
    const maxWords = wordLimits.maximum;

    if (wordCount > maxWords) {
      if (errorBanner) {
        errorBanner.textContent = `The maximum allowed word limit is ${maxWords} words (currently: ${wordCount}).`;
        errorBanner.style.display = "block";
      }
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast(`Maximum ${maxWords} words allowed (${wordCount} words).`, "error", 3500);
      }
      return;
    }

    this.isEvaluating = true;
    this.studentAnswer = answerText;

    // Show real evaluation loading state
    const contentArea = document.getElementById("schreiben-content-area");
    if (contentArea) {
      contentArea.innerHTML = `
        <div class="schreiben-evaluating-card">
          <div class="schreiben-spinner-lg"></div>
          <h2 class="schreiben-eval-title">Evaluating your writing...</h2>
          <p class="schreiben-eval-sub">
            Your submission is being evaluated against official exam criteria for task fulfillment, structure, vocabulary, and grammar.
          </p>
          <div class="schreiben-eval-meta">
            <span>Length: ${wordCount} / ${maxWords} words</span> · <span>1 weekly credit will be deducted upon successful evaluation</span>
          </div>
        </div>
      `;
    }

    const taskDetails = this.extractTaskDetails(material);

    // Resolve teil explicitly so the Worker can apply the correct rubric
    let teil = String(material.teil || material.part || "").trim();
    if (!teil) {
      const match = String(material.title || material.id || "").match(/teil\s*(\d+)/i);
      if (match) {
        teil = `Teil ${match[1]}`;
      } else if (material.level === "A1" || material.level === "A2") {
        teil = "Teil 2";
      } else {
        teil = "Teil 1";
      }
    }

    let evalRes = null;
    try {
      const idToken = await (window.PracticeApp?.getFirebaseIdToken ? window.PracticeApp.getFirebaseIdToken() : null);
      if (!idToken) {
        throw new Error("You must be logged in to start the evaluation.");
      }

      if (!window.SupabaseService?.evaluateSchreiben) {
        throw new Error("The evaluation service is currently unavailable.");
      }

      const payload = {
        material_id: material.id,
        exam: material.exam || "goethe",
        level: material.level || "A1",
        teil: teil,
        situation: taskDetails.situation || "",
        task: taskDetails.aufgabe || taskDetails.taskText,
        points: taskDetails.points || [],
        word_limit: maxWords,
        word_count: {
          minimum: wordLimits.minimum,
          maximum: maxWords
        },
        answer: answerText
      };

      // Preserve material.evaluation so the Worker/Gemini can use task-specific evaluation rules
      if (material.evaluation && typeof material.evaluation === "object") {
        payload.evaluation = material.evaluation;
      }

      evalRes = await window.SupabaseService.evaluateSchreiben(payload, idToken);
    } catch (err) {
      console.error("SchreibenPlayer: Evaluation request error:", err);
      this.isEvaluating = false;
      this.renderWritingWorkspace();
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast(err.message || "Evaluation error. No credit was deducted.", "error", 4500);
      }
      return;
    }

    if (!evalRes || !evalRes.success || !evalRes.evaluation) {
      if (evalRes?.details) {
        console.warn("SchreibenPlayer: Evaluation service failure details:", evalRes.details);
      }
      this.isEvaluating = false;
      this.renderWritingWorkspace();
      const msg = evalRes?.message || "Evaluation failed. No credit was deducted.";
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast(msg, "error", 4500);
      }
      return;
    }

    this.isEvaluating = false;
    this.isSubmitted = true;
    this.evaluationResult = evalRes.evaluation;

    // Update remaining credits in local AppState if returned
    if (typeof evalRes.schreiben_credits_remaining === "number" && window.AppState) {
      window.AppState.schreibenCreditsRemaining = evalRes.schreiben_credits_remaining;
      const creditsEl = document.getElementById("schreiben-credits-text");
      if (creditsEl) {
        creditsEl.textContent = `${evalRes.schreiben_credits_remaining} weekly credits`;
      }
    }

    // Validate evaluationResult before proceeding
    if (!this.evaluationResult || typeof this.evaluationResult !== "object") {
      console.error("SchreibenPlayer: Received invalid evaluation result from server:", this.evaluationResult);
      this.isEvaluating = false;
      this.renderWritingWorkspace();
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast("Invalid evaluation result received. No credit was deducted.", "error", 4500);
      }
      return;
    }

    // Save attempt record to practice_attempts (record module completion)
    const scorePercent = typeof this.evaluationResult.score_percent === "number" ? Math.round(this.evaluationResult.score_percent) : 100;
    const correctCount = 10;
    const totalCount = 10;

    await this.savePracticeAttempt(material, correctCount, totalCount, scorePercent, evalRes.uid);

    if (window.PracticeApp?.recordTestCompletion) {
      window.PracticeApp.recordTestCompletion("Schreiben", scorePercent);
    }

    this.renderResultsScreen();
  },

  savePracticeAttempt: async function (material, correctCount, totalCount, scorePercent, serverUid) {
    if (!window.SupabaseService?.getSupabaseClient) {
      console.warn("SchreibenPlayer: SupabaseService not available for practice attempt save.");
      return { success: false, error: new Error("SupabaseService not available") };
    }

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) {
        console.warn("SchreibenPlayer: Supabase client not initialized.");
        return { success: false, error: new Error("Supabase client not initialized") };
      }

      let uid = serverUid || (window.AppState?.userProfile?.uid && window.AppState.userProfile.uid !== "local-user" && window.AppState.userProfile.uid !== "anonymous" ? window.AppState.userProfile.uid : null);
      if (!uid) {
        uid = window.AppState?.user?.uid;
      }
      if (!uid && typeof window.firebase !== "undefined" && window.firebase.auth) {
        uid = window.firebase.auth().currentUser?.uid;
      }
      if (!uid) {
        uid = window.PracticeApp?.currentFirebaseUser?.uid || localStorage.getItem("coco_user_uid");
      }
      if (!uid || (!serverUid && (uid === "local-user" || uid === "anonymous"))) {
        console.warn("SchreibenPlayer: No valid UID found for practice attempt save.");
        return { success: false, error: new Error("No valid UID found") };
      }

      let dbFormat = String(material.exam || material.format || "").toLowerCase().trim();
      if (dbFormat !== "goethe" && dbFormat !== "telc") {
        const userFormat = String(window.AppState?.currentFormat || localStorage.getItem("coco_practice_format") || "goethe").toLowerCase().trim();
        dbFormat = userFormat === "telc" ? "telc" : "goethe";
      }

      const attemptPayload = {
        uid: uid,
        material_id: String(material.id),
        level: (material.level || window.AppState?.currentLevel || "A1").toUpperCase(),
        format: dbFormat,
        module: "Schreiben",
        correct_answers: parseInt(correctCount || 0, 10),
        total_questions: parseInt(totalCount || 10, 10),
        score_percent: parseInt(scorePercent || 0, 10),
        completed_at: new Date().toISOString()
      };

      const { data, error: insertError } = await supabase
        .from("practice_attempts")
        .insert([attemptPayload]);

      if (insertError) {
        if (insertError.code === "23505") {
          console.info("SchreibenPlayer: Practice attempt already completed for (uid, material_id).", insertError.message);
          return { success: true, alreadyCompleted: true };
        } else {
          console.warn("SchreibenPlayer: Error recording attempt:", insertError);
          return { success: false, error: insertError };
        }
      }

      try {
        localStorage.removeItem("coco_practice_hub_materials_cache");
        if (window.PracticeHubComponent?.completedMaterialIds) {
          window.PracticeHubComponent.completedMaterialIds.add(String(material.id));
        }
      } catch (e) {}

      if (window.CocoStateSync?.notifyAttemptCompleted) {
        window.CocoStateSync.notifyAttemptCompleted({ materialId: material.id, module: "Schreiben", scorePercent });
      }

      return { success: true, alreadyCompleted: false, data };
    } catch (err) {
      console.warn("SchreibenPlayer: Failed to persist practice attempt:", err);
      return { success: false, error: err };
    }
  },

  renderResultsScreen: function () {
    const contentArea = document.getElementById("schreiben-content-area");
    if (!contentArea) return;

    const root = document.getElementById("schreiben-player-root");
    if (root) root.scrollTop = 0;

    const evaluation = this.evaluationResult || {};
    const planConfig = evaluation.plan_config || {};
    const lockedFeatures = evaluation.locked_features || {};

    const criteria = Array.isArray(evaluation.criteria) ? evaluation.criteria : [];
    const mistakes = Array.isArray(evaluation.mistakes) ? evaluation.mistakes : [];
    const wordUsage = Array.isArray(evaluation.word_usage) ? evaluation.word_usage : [];
    const unclearSentences = Array.isArray(evaluation.unclear_sentences) ? evaluation.unclear_sentences : [];
    const registerAnalysis = evaluation.register_analysis || null;
    const improvedSentences = Array.isArray(evaluation.improved_sentences) ? evaluation.improved_sentences : [];
    const redemittel = Array.isArray(evaluation.redemittel) ? evaluation.redemittel : [];
    const improvedVersion = evaluation.improved_version ? String(evaluation.improved_version).trim() : null;
    const improvedVersionMode = evaluation.improved_version_mode || (improvedVersion ? "full" : "none");

    const feedback = evaluation.feedback || "";
    const feedbackDetails = evaluation.feedback_details || {};
    const strengths = Array.isArray(feedbackDetails.strengths) ? feedbackDetails.strengths : [];
    const improvements = Array.isArray(feedbackDetails.improvements) ? feedbackDetails.improvements : [];

    const errorPatterns = Array.isArray(evaluation.error_patterns) ? evaluation.error_patterns : [];
    const longTermWeaknesses = Array.isArray(evaluation.long_term_weaknesses) ? evaluation.long_term_weaknesses : [];
    const learningPlan = Array.isArray(evaluation.personalized_learning_plan) ? evaluation.personalized_learning_plan : [];

    const tfPoints = evaluation.task_fulfillment && Array.isArray(evaluation.task_fulfillment.points)
      ? evaluation.task_fulfillment.points
      : [];
    const material = this.currentMaterial || {};
    const wordLimits = this.getWordLimits(material);
    const maxWords = wordLimits.maximum;
    const minWords = wordLimits.minimum;
    const wordCount = evaluation.word_count || (this.studentAnswer ? this.studentAnswer.trim().split(/\s+/).filter(Boolean).length : 0);
    const creditsRemaining = (window.AppState && typeof window.AppState.schreibenCreditsRemaining === "number")
      ? window.AppState.schreibenCreditsRemaining
      : null;

    // Derived qualitative indicators from actual evaluation data
    const fulfilledCount = tfPoints.filter(p => String(p.status || "").toLowerCase() === "fulfilled").length;
    const partialCount = tfPoints.filter(p => String(p.status || "").toLowerCase() === "partial").length;
    const missingCount = tfPoints.filter(p => String(p.status || "").toLowerCase() === "missing").length;
    const isNonGerman = evaluation.language && evaluation.language.appropriate === false;
    const level = (material.level || "A1").toUpperCase();
    const exam = (material.exam || "Goethe").toUpperCase();

    // Qualitative assessment status badge
    let statusBadgeHtml = "";
    if (isNonGerman) {
      statusBadgeHtml = `
        <span class="schreiben-status-badge" style="background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;">
          <i data-lucide="alert-triangle" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
          Language Notice (Non-German)
        </span>`;
    } else if (tfPoints.length > 0 && missingCount === 0 && partialCount === 0) {
      statusBadgeHtml = `
        <span class="schreiben-status-badge schreiben-status-pass">
          <i data-lucide="check-check" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
          All Task Points Fulfilled
        </span>`;
    } else if (tfPoints.length > 0 && missingCount === 0) {
      statusBadgeHtml = `
        <span class="schreiben-status-badge" style="background:#f0fdf4; color:#15803d; border:1px solid #86efac;">
          <i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
          Task Fully Addressed
        </span>`;
    } else if (tfPoints.length > 0 && fulfilledCount > 0) {
      statusBadgeHtml = `
        <span class="schreiben-status-badge" style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd;">
          <i data-lucide="file-text" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
          Task Points Partially Fulfilled
        </span>`;
    } else {
      statusBadgeHtml = `
        <span class="schreiben-status-badge" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1;">
          <i data-lucide="file-check" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
          Qualitative Examination Report
        </span>`;
    }

    contentArea.innerHTML = `
      <div class="schreiben-results-card">
        <!-- Top Status Banner -->
        <div class="schreiben-results-topbar">
          <div>
            <div class="schreiben-meta-row" style="margin-bottom:8px;">
              <span class="schreiben-badge-pill schreiben-badge-level">${this.escapeHtml(exam)} ${this.escapeHtml(level)}</span>
              <span class="schreiben-badge-pill schreiben-badge-module">Writing Report</span>
              ${material.teil ? `<span class="schreiben-badge-pill schreiben-badge-sub">${this.escapeHtml(material.teil)}</span>` : ''}
              ${creditsRemaining !== null ? `<span class="schreiben-badge-pill schreiben-badge-credits">${creditsRemaining} credits remaining</span>` : ''}
            </div>
            <h1 class="schreiben-results-heading">Examination Evaluation Report</h1>
          </div>
          <div>
            ${statusBadgeHtml}
          </div>
        </div>

        <!-- Qualitative Examination Overview Card -->
        <div class="schreiben-eval-overview-box">
          <div class="schreiben-eval-overview-header">
            <div class="schreiben-eval-overview-icon">
              <i data-lucide="award" style="width:24px;height:24px; color:#0284c7;"></i>
            </div>
            <div>
              <div class="schreiben-eval-overview-title">
                Qualitative ${this.escapeHtml(exam)} Examination Report (${this.escapeHtml(level)})
              </div>
              <div class="schreiben-eval-overview-sub">
                Submitted Length: <strong>${wordCount} words</strong> ${minWords ? `· Guideline: ${minWords}–${maxWords} words` : `· Maximum: ${maxWords} words`}
              </div>
            </div>
          </div>

          <!-- Diagnostic Metrics Row -->
          <div class="schreiben-eval-pills-row">
            ${tfPoints.length > 0 ? `
              <div class="schreiben-eval-pill">
                <i data-lucide="list-checks" style="width:14px;height:14px; color:#10b981;"></i>
                <span>Task Fulfillment: <strong>${fulfilledCount}/${tfPoints.length}</strong> bullet points</span>
              </div>
            ` : ''}
            <div class="schreiben-eval-pill">
              <i data-lucide="languages" style="width:14px;height:14px; color:#0284c7;"></i>
              <span>Language: <strong>${this.escapeHtml(evaluation.language?.detected || "German")}</strong></span>
            </div>
            ${evaluation.development?.quality ? `
              <div class="schreiben-eval-pill">
                <i data-lucide="sparkles" style="width:14px;height:14px; color:#8b5cf6;"></i>
                <span>Text Development: <strong>${this.escapeHtml(evaluation.development.quality)}</strong></span>
              </div>
            ` : ''}
            <div class="schreiben-eval-pill">
              <i data-lucide="spell-check" style="width:14px;height:14px; color:#f59e0b;"></i>
              <span>Language Corrections: <strong>${mistakes.length}</strong></span>
            </div>
            ${redemittel.length > 0 ? `
              <div class="schreiben-eval-pill">
                <i data-lucide="bookmark" style="width:14px;height:14px; color:#0284c7;"></i>
                <span>Useful Phrases: <strong>${redemittel.length}</strong></span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 1. Task Fulfillment -->
        ${!lockedFeatures.task_fulfillment_locked && tfPoints.length > 0 ? `
          <div class="schreiben-section-block">
            <h3 class="schreiben-section-title">
              <i data-lucide="check-square" style="width:18px;height:18px; color:#10b981;"></i>
              <span>1. Task Fulfillment (Bullet Points)</span>
            </h3>
            <div style="display:flex; flex-direction:column; gap:10px;">
              ${tfPoints.map(p => {
                const st = String(p.status || "").toLowerCase();
                const badgeStyle = st === "fulfilled"
                  ? "background:#dcfce7; color:#15803d; border:1px solid #86efac;"
                  : (st === "partial" ? "background:#fef9c3; color:#a16207; border:1px solid #fde047;" : "background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;");
                const badgeLabel = st === "fulfilled" ? "✓ Fulfilled" : (st === "partial" ? "⚠ Partial" : "✗ Missing");
                return `
                  <div style="background:#ffffff; border:1px solid var(--schreiben-border); border-radius:8px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-weight:600; font-size:0.9rem; color:var(--schreiben-ink);">Task Bullet Point #${p.id || 1}</span>
                      <span style="font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:999px; ${badgeStyle}">${badgeLabel}</span>
                    </div>
                    ${p.evidence ? `<p style="margin:8px 0 0 0; font-size:0.88rem; color:#334155; font-style:italic;">„${this.escapeHtml(p.evidence)}“</p>` : `<p style="margin:8px 0 0 0; font-size:0.85rem; color:#94a3b8;">No textual evidence found.</p>`}
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        ` : (lockedFeatures.task_fulfillment_locked ? `
          <div class="schreiben-section-block">
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="check-square" style="width:20px;height:20px; color:#64748b;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Task Fulfillment Analysis</h4>
                  <p class="schreiben-locked-feature-desc">Verifies each required task bullet point with concrete textual evidence from your submission.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade for Task Check</a>
            </div>
          </div>
        ` : '')}

        <!-- 2. Criteria -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="file-check-2" style="width:18px;height:18px; color:#0284c7;"></i>
            <span>2. Evaluation Criteria & Report</span>
          </h3>
          <div class="schreiben-criteria-grid">
            ${criteria.map(c => {
              const critName = String(c.name || "").trim();
              let critIcon = "check-circle";
              if (/fulfillment|aufgabe/i.test(critName)) critIcon = "list-checks";
              else if (/coherence|struktur|aufbau/i.test(critName)) critIcon = "align-left";
              else if (/vocab|wortschatz/i.test(critName)) critIcon = "book-open";
              else if (/grammar|grammatik|form/i.test(critName)) critIcon = "spell-check";

              return `
                <div class="schreiben-criteria-item">
                  <div class="schreiben-criteria-row">
                    <span class="schreiben-criteria-name" style="display:flex; align-items:center; gap:6px;">
                      <i data-lucide="${critIcon}" style="width:16px;height:16px; color:#0284c7;"></i>
                      <span>${this.escapeHtml(c.name)}</span>
                    </span>
                    <span class="schreiben-criteria-badge">Qualitative</span>
                  </div>
                  ${c.feedback ? `<p class="schreiben-criteria-sub" style="margin-top:6px; font-size:0.88rem; line-height:1.55; color:#334155;">${this.escapeHtml(c.feedback)}</p>` : ''}
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- 3. Key Mistakes -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="spell-check" style="width:18px;height:18px; color:#f59e0b;"></i>
            <span>3. Key Mistakes & Corrections</span>
          </h3>
          ${mistakes.length > 0 ? `
            <div class="schreiben-mistakes-list">
              ${mistakes.map(m => `
                <div class="schreiben-mistake-card">
                  <div class="schreiben-mistake-row">
                    <span class="schreiben-mistake-type-pill schreiben-type-grammar">Grammar</span>
                    <span class="schreiben-badge-mistake">${this.escapeHtml(m.original || "")}</span>
                    <span class="schreiben-arrow">➔</span>
                    <span class="schreiben-badge-correction">${this.escapeHtml(m.correction || "")}</span>
                  </div>
                  ${m.explanation ? `<div class="schreiben-mistake-exp">${this.escapeHtml(m.explanation)}</div>` : ''}
                </div>
              `).join("")}
            </div>
            ${lockedFeatures.has_more_mistakes ? `
              <div class="schreiben-locked-teaser">
                <div class="schreiben-locked-teaser-left">
                  <div class="schreiben-locked-teaser-icon">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                  </div>
                  <div>
                    <div class="schreiben-locked-teaser-title">More errors identified in your text</div>
                    <div class="schreiben-locked-teaser-desc">Your current plan displays up to ${planConfig.max_key_mistakes || 3} errors. Higher plans unlock all remaining findings and detailed explanations.</div>
                  </div>
                </div>
                <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade Plan</a>
              </div>
            ` : ''}
          ` : `
            <div class="schreiben-clean-banner">
              <i data-lucide="check-circle-2" style="width:18px;height:18px; color:#16a34a;"></i>
              <span>No major language errors found. Very clean writing!</span>
            </div>
          `}
        </div>

        <!-- 4. Word Usage -->
        ${wordUsage.length > 0 || lockedFeatures.has_more_word_usage ? `
          <div class="schreiben-section-block">
            <h3 class="schreiben-section-title">
              <i data-lucide="book-open" style="width:18px;height:18px; color:#0284c7;"></i>
              <span>4. Word Choice & Vocabulary (Word Usage)</span>
            </h3>
            ${wordUsage.length > 0 ? `
              <div class="schreiben-word-usage-list">
                ${wordUsage.map(wu => `
                  <div class="schreiben-word-usage-card">
                    <div class="schreiben-word-usage-row">
                      <span class="schreiben-mistake-type-pill schreiben-type-vocab">Vocabulary</span>
                      <span class="schreiben-badge-mistake">${this.escapeHtml(wu.original || "")}</span>
                      <span class="schreiben-arrow">➔</span>
                      <span class="schreiben-badge-correction">${this.escapeHtml(wu.suggestion || wu.correction || "")}</span>
                    </div>
                    ${wu.explanation ? `<div class="schreiben-word-usage-exp">${this.escapeHtml(wu.explanation)}</div>` : ''}
                  </div>
                `).join("")}
              </div>
            ` : ''}
            ${lockedFeatures.has_more_word_usage ? `
              <div class="schreiben-locked-teaser">
                <div class="schreiben-locked-teaser-left">
                  <div class="schreiben-locked-teaser-icon">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                  </div>
                  <div>
                    <div class="schreiben-locked-teaser-title">More vocabulary recommendations available</div>
                    <div class="schreiben-locked-teaser-desc">Your current plan displays up to ${planConfig.max_word_usage_items || 2} vocabulary suggestions. Upgrade for unlimited lexical guidance.</div>
                  </div>
                </div>
                <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade Plan</a>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 5. Unclear Sentences -->
        ${unclearSentences.length > 0 || lockedFeatures.has_more_unclear_sentences ? `
          <div class="schreiben-section-block">
            <h3 class="schreiben-section-title">
              <i data-lucide="help-circle" style="width:18px;height:18px; color:#d97706;"></i>
              <span>5. Sentence Structure & Clarity (Unclear Sentences)</span>
            </h3>
            ${unclearSentences.length > 0 ? `
              <div class="schreiben-unclear-sentences-list">
                ${unclearSentences.map(us => `
                  <div class="schreiben-unclear-sentence-card">
                    <div class="schreiben-unclear-sentence-row">
                      <span class="schreiben-mistake-type-pill schreiben-type-structure">Sentence Structure</span>
                      <span class="schreiben-badge-mistake">${this.escapeHtml(us.original || "")}</span>
                      <span class="schreiben-arrow">➔</span>
                      <span class="schreiben-badge-correction">${this.escapeHtml(us.rewritten || us.correction || "")}</span>
                    </div>
                    ${us.explanation ? `<div class="schreiben-unclear-sentence-exp">${this.escapeHtml(us.explanation)}</div>` : ''}
                  </div>
                `).join("")}
              </div>
            ` : ''}
            ${lockedFeatures.has_more_unclear_sentences ? `
              <div class="schreiben-locked-teaser">
                <div class="schreiben-locked-teaser-left">
                  <div class="schreiben-locked-teaser-icon">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                  </div>
                  <div>
                    <div class="schreiben-locked-teaser-title">More sentence structure notes found</div>
                    <div class="schreiben-locked-teaser-desc">Your current plan displays up to ${planConfig.unclear_sentence_limit || 2} unclear sentences. Higher plans offer deep structural analysis.</div>
                  </div>
                </div>
                <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade Plan</a>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 6. Register Analysis -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="scale" style="width:18px;height:18px; color:#6366f1;"></i>
            <span>6. Register & Tone Analysis</span>
          </h3>
          ${registerAnalysis ? `
            <div class="schreiben-register-card">
              <div class="schreiben-register-meta">
                <span class="schreiben-badge-pill" style="background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe;">
                  Tone: <strong>${this.escapeHtml(registerAnalysis.tone || "Neutral")}</strong>
                </span>
                <span class="schreiben-badge-pill" style="${registerAnalysis.appropriate !== false ? 'background:#dcfce7; color:#15803d; border:1px solid #86efac;' : 'background:#fee2e2; color:#b91c1c; border:1px solid #fca5a5;'}">
                  ${registerAnalysis.appropriate !== false ? '✓ Register appropriate for exam format' : '⚠ Register inappropriate'}
                </span>
              </div>
              ${registerAnalysis.analysis ? `<p style="margin:10px 0 6px 0; font-size:0.9rem; line-height:1.6; color:#334155;">${this.escapeHtml(registerAnalysis.analysis)}</p>` : ''}
              ${registerAnalysis.recommendation ? `<p style="margin:6px 0 0 0; font-size:0.86rem; color:#4f46e5; font-style:italic;">Recommendation: ${this.escapeHtml(registerAnalysis.recommendation)}</p>` : ''}
            </div>
          ` : `
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="scale" style="width:20px;height:20px; color:#6366f1;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Register & Tone Analysis</h4>
                  <p class="schreiben-locked-feature-desc">Checks whether your form of address (Du vs. Sie), formality, and tone match the required exam conventions.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade for Register Analysis</a>
            </div>
          `}
        </div>

        <!-- 7. Sentence Optimizations -->
        ${improvedSentences.length > 0 || lockedFeatures.has_more_improved_sentences ? `
          <div class="schreiben-section-block">
            <h3 class="schreiben-section-title">
              <i data-lucide="refresh-cw" style="width:18px;height:18px; color:#059669;"></i>
              <span>7. Sentence Optimizations (Better Phrasing)</span>
            </h3>
            ${improvedSentences.length > 0 ? `
              <div class="schreiben-improved-sentences-list">
                ${improvedSentences.map(s => `
                  <div class="schreiben-sentence-card">
                    <div class="schreiben-sentence-row">
                      <div class="schreiben-sentence-before">
                        <span class="schreiben-sentence-label">Original:</span>
                        <span>${this.escapeHtml(s.original || "")}</span>
                      </div>
                      <div class="schreiben-sentence-arrow">➔</div>
                      <div class="schreiben-sentence-after">
                        <span class="schreiben-sentence-label">Better:</span>
                        <span>${this.escapeHtml(s.improved || s.correction || "")}</span>
                      </div>
                    </div>
                    ${(s.explanation || s.reason) ? `<div class="schreiben-sentence-reason">${this.escapeHtml(s.explanation || s.reason)}</div>` : ''}
                  </div>
                `).join("")}
              </div>
            ` : ''}
            ${lockedFeatures.has_more_improved_sentences ? `
              <div class="schreiben-locked-teaser">
                <div class="schreiben-locked-teaser-left">
                  <div class="schreiben-locked-teaser-icon">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                  </div>
                  <div>
                    <div class="schreiben-locked-teaser-title">More sentence optimizations available</div>
                    <div class="schreiben-locked-teaser-desc">Your current plan displays up to ${planConfig.max_improved_sentences || 3} sentence optimizations. Higher plans offer unlimited improvements.</div>
                  </div>
                </div>
                <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade Plan</a>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 8. Redemittel -->
        ${redemittel.length > 0 || lockedFeatures.has_more_redemittel ? `
          <div class="schreiben-section-block">
            <h3 class="schreiben-section-title">
              <i data-lucide="bookmark" style="width:18px;height:18px; color:#0284c7;"></i>
              <span>8. Recommended Phrases & Connectors (Redemittel)</span>
            </h3>
            ${redemittel.length > 0 ? `
              <div class="schreiben-redemittel-grid">
                ${redemittel.map(r => {
                  const phrase = typeof r === "object" ? (r.phrase || r.text || "") : String(r || "");
                  const usage = typeof r === "object" ? (r.usage || r.context || "") : "";
                  return `
                    <div class="schreiben-redemittel-card">
                      <div class="schreiben-redemittel-phrase">„${this.escapeHtml(phrase)}“</div>
                      ${usage ? `<div class="schreiben-redemittel-usage">${this.escapeHtml(usage)}</div>` : ''}
                    </div>
                  `;
                }).join("")}
              </div>
            ` : ''}
            ${lockedFeatures.has_more_redemittel ? `
              <div class="schreiben-locked-teaser">
                <div class="schreiben-locked-teaser-left">
                  <div class="schreiben-locked-teaser-icon">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                  </div>
                  <div>
                    <div class="schreiben-locked-teaser-title">More exam-relevant phrases available</div>
                    <div class="schreiben-locked-teaser-desc">Your current plan displays up to ${planConfig.redemittel_limit || 2} phrases. Upgrade for unlimited task-specific expressions.</div>
                  </div>
                </div>
                <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade Plan</a>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- 9. Improved Version -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="sparkles" style="width:18px;height:18px; color:#8b5cf6;"></i>
            <span>9. Model Revision (Improved Text)</span>
          </h3>
          ${improvedVersion ? `
            <div class="schreiben-improved-version-box">
              <div class="schreiben-improved-header">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span class="schreiben-badge-pill" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe;">
                    ${improvedVersionMode === "first_2_sentences" ? "2-Sentence Preview" : "Full Model Text"}
                  </span>
                </div>
                <button type="button" class="schreiben-copy-btn" onclick="window.SchreibenPlayerComponent.copyImprovedText(this)">
                  <i data-lucide="copy" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>
                  <span>Copy Text</span>
                </button>
              </div>
              <p class="schreiben-improved-sub">
                ${improvedVersionMode === "first_2_sentences"
                  ? "Preview of your optimized text (first 2 sentences) featuring native corrections and polished sentence structure."
                  : "Fully corrected and stylistically polished revision of your writing while preserving your core ideas."}
              </p>
              <div class="schreiben-improved-content">${this.escapeHtml(improvedVersion)}</div>
              ${improvedVersionMode === "first_2_sentences" || lockedFeatures.has_more_improved_version ? `
                <div class="schreiben-improved-locked-footer">
                  <div class="schreiben-improved-locked-info">
                    <i data-lucide="lock" style="width:16px;height:16px;"></i>
                    <span>The full optimized model text is available on Pro, Advanced, and Personal plans.</span>
                  </div>
                  <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn schreiben-teaser-btn-purple">Unlock Full Text</a>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="sparkles" style="width:20px;height:20px; color:#8b5cf6;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Model Revision</h4>
                  <p class="schreiben-locked-feature-desc">Receive a complete, error-free, and stylistically perfected revision of your text with native phrasing.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn schreiben-teaser-btn-purple">Upgrade for Model Text</a>
            </div>
          `}
        </div>

        <!-- 10. Strengths & Improvements -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="thumbs-up" style="width:18px;height:18px; color:#10b981;"></i>
            <span>10. Overall Assessment & Strengths</span>
          </h3>
          ${feedback ? `
            <div class="schreiben-feedback-callout" style="margin-bottom:14px;">
              <div class="schreiben-feedback-label">
                <i data-lucide="message-square" style="width:15px;height:15px;"></i>
                <span>Examiner Feedback</span>
              </div>
              <p class="schreiben-feedback-text">${this.escapeHtml(feedback)}</p>
            </div>
          ` : ''}
          ${(strengths.length > 0 || improvements.length > 0) ? `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
              ${strengths.length > 0 ? `
                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:16px;">
                  <h4 style="margin:0 0 10px 0; font-size:0.95rem; color:#166534; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="thumbs-up" style="width:16px;height:16px;"></i>
                    <span>Strengths</span>
                  </h4>
                  <ul style="margin:0; padding-left:18px; font-size:0.88rem; color:#14532d; line-height:1.6;">
                    ${strengths.map(s => `<li>${this.escapeHtml(s)}</li>`).join("")}
                  </ul>
                </div>
              ` : ''}
              ${improvements.length > 0 ? `
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:16px;">
                  <h4 style="margin:0 0 10px 0; font-size:0.95rem; color:#92400e; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="arrow-up-right" style="width:16px;height:16px;"></i>
                    <span>Tips for Improvement</span>
                  </h4>
                  <ul style="margin:0; padding-left:18px; font-size:0.88rem; color:#78350f; line-height:1.6;">
                    ${improvements.map(i => `<li>${this.escapeHtml(i)}</li>`).join("")}
                  </ul>
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>

        <!-- 11. Systematic Error Patterns -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="layers" style="width:18px;height:18px; color:#f59e0b;"></i>
            <span>11. Systematic Error Patterns</span>
          </h3>
          ${errorPatterns.length > 0 ? `
            <div class="schreiben-error-patterns-list">
              ${errorPatterns.map(ep => `
                <div class="schreiben-pattern-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <h4 style="margin:0; font-size:0.95rem; font-weight:700; color:var(--schreiben-ink);">${this.escapeHtml(ep.pattern || "Pattern")}</h4>
                    ${ep.frequency ? `<span class="schreiben-badge-pill" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;">${this.escapeHtml(ep.frequency)}</span>` : ''}
                  </div>
                  ${ep.description ? `<p style="margin:0 0 8px 0; font-size:0.88rem; line-height:1.55; color:#334155;">${this.escapeHtml(ep.description)}</p>` : ''}
                  ${ep.examples && ep.examples.length > 0 ? `
                    <div style="background:#f8fafc; border-radius:6px; padding:10px 12px; font-size:0.82rem; color:#475569;">
                      <strong>Examples from your text:</strong>
                      <ul style="margin:4px 0 0 0; padding-left:18px; font-style:italic;">
                        ${ep.examples.map(ex => `<li>„${this.escapeHtml(ex)}“</li>`).join("")}
                      </ul>
                    </div>
                  ` : ''}
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="layers" style="width:20px;height:20px; color:#f59e0b;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Systematic Error Patterns</h4>
                  <p class="schreiben-locked-feature-desc">Identifies recurring structural error patterns (e.g., subordinate clause word order, prepositional cases) across your entire text.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade for Error Patterns</a>
            </div>
          `}
        </div>

        <!-- 12. Long-Term Weaknesses -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="target" style="width:18px;height:18px; color:#ef4444;"></i>
            <span>12. Long-Term Weaknesses (Diagnostic)</span>
          </h3>
          ${longTermWeaknesses.length > 0 ? `
            <div class="schreiben-weaknesses-list">
              ${longTermWeaknesses.map(w => `
                <div class="schreiben-weakness-card">
                  <h4 style="margin:0 0 6px 0; font-size:0.95rem; font-weight:700; color:#b91c1c;">
                    ${this.escapeHtml(w.area || "Weakness Area")}
                  </h4>
                  ${w.diagnostic ? `<p style="margin:0 0 8px 0; font-size:0.88rem; line-height:1.55; color:#334155;"><strong>Diagnostic:</strong> ${this.escapeHtml(w.diagnostic)}</p>` : ''}
                  ${w.remedy ? `
                    <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 12px; font-size:0.84rem; color:#166534;">
                      <strong>Actionable Remedy:</strong> ${this.escapeHtml(w.remedy)}
                    </div>
                  ` : ''}
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="target" style="width:20px;height:20px; color:#ef4444;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Long-Term Weakness Analysis</h4>
                  <p class="schreiben-locked-feature-desc">Identifies deeper grammatical and structural weaknesses with targeted strategies to overcome them for your exam.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade for Weakness Analysis</a>
            </div>
          `}
        </div>

        <!-- 13. Personalized Learning Plan -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="compass" style="width:18px;height:18px; color:#10b981;"></i>
            <span>13. Personalized Learning Plan</span>
          </h3>
          ${learningPlan.length > 0 ? `
            <div class="schreiben-learning-plan-list">
              ${learningPlan.map(lp => `
                <div class="schreiben-learning-card">
                  <h4 style="margin:0 0 8px 0; font-size:0.95rem; font-weight:700; color:#15803d; display:flex; align-items:center; gap:6px;">
                    <i data-lucide="check-circle" style="width:16px;height:16px;"></i>
                    <span>Focus: ${this.escapeHtml(lp.focus || "Study Area")}</span>
                  </h4>
                  ${lp.action_items && lp.action_items.length > 0 ? `
                    <div style="margin-bottom:8px;">
                      <div style="font-size:0.82rem; font-weight:700; color:#475569; text-transform:uppercase; margin-bottom:4px;">Action Items:</div>
                      <ul style="margin:0; padding-left:18px; font-size:0.88rem; color:#334155; line-height:1.55;">
                        ${lp.action_items.map(ai => `<li>${this.escapeHtml(ai)}</li>`).join("")}
                      </ul>
                    </div>
                  ` : ''}
                  ${lp.recommended_topics && lp.recommended_topics.length > 0 ? `
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px;">
                      <span style="font-size:0.8rem; font-weight:600; color:#64748b;">Recommended Topics:</span>
                      ${lp.recommended_topics.map(t => `<span class="schreiben-badge-pill" style="background:#f1f5f9; color:#475569; border:1px solid #e2e8f0;">${this.escapeHtml(t)}</span>`).join("")}
                    </div>
                  ` : ''}
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="schreiben-locked-feature-card">
              <div class="schreiben-locked-feature-info">
                <div class="schreiben-locked-feature-icon-wrap">
                  <i data-lucide="compass" style="width:20px;height:20px; color:#10b981;"></i>
                </div>
                <div>
                  <h4 class="schreiben-locked-feature-title">Unlock Personalized Learning Plan</h4>
                  <p class="schreiben-locked-feature-desc">Receive personalized study recommendations and targeted grammar exercises tailored to your exam prep.</p>
                </div>
              </div>
              <a href="../index.html#/membership" onclick="return window.SchreibenPlayerComponent.openMembership(event);" class="schreiben-teaser-btn">Upgrade for Learning Plan</a>
            </div>
          `}
        </div>

        <!-- Action Buttons -->
        <div class="schreiben-results-actions">
          <button type="button" class="schreiben-btn-primary" onclick="window.SchreibenPlayerComponent.enterReviewMode()">
            <i data-lucide="eye" style="width:16px;height:16px;"></i>
            <span>Review Submitted Text</span>
          </button>
          <button type="button" class="schreiben-btn-secondary" onclick="window.SchreibenPlayerComponent.retry()">
            <i data-lucide="rotate-ccw" style="width:16px;height:16px;"></i>
            <span>Try Again</span>
          </button>
          <button type="button" class="schreiben-btn-secondary" onclick="window.SchreibenPlayerComponent.exitPlayer()">
            <i data-lucide="grid" style="width:16px;height:16px;"></i>
            <span>Back to Practice Hub</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  enterReviewMode: function () {
    const contentArea = document.getElementById("schreiben-content-area");
    if (!contentArea) return;

    const root = document.getElementById("schreiben-player-root");
    if (root) root.scrollTop = 0;

    const evaluation = this.evaluationResult || {};
    const material = this.currentMaterial || {};
    const taskDetails = this.extractTaskDetails(material);
    const studentText = this.studentAnswer || "";
    const wordCount = studentText ? studentText.trim().split(/\s+/).filter(Boolean).length : 0;

    contentArea.innerHTML = `
      <div class="schreiben-review-card">
        <!-- Review Mode Banner -->
        <div class="schreiben-review-banner">
          <div class="schreiben-review-banner-left">
            <i data-lucide="eye" style="width:16px;height:16px; color:#38bdf8;"></i>
            <span>Review Mode · Writing</span>
            <span class="schreiben-review-score">Submitted Writing (${wordCount} words)</span>
          </div>
          <button type="button" class="schreiben-review-back-btn" onclick="window.SchreibenPlayerComponent.renderResultsScreen()">
            Back to Evaluation
          </button>
        </div>

        <!-- Task Prompt -->
        <div class="schreiben-task-card" style="margin-top:20px;">
          <div class="schreiben-task-header">
            <i data-lucide="file-text" style="width:16px;height:16px; color:#0284c7;"></i>
            <span>Task Prompt</span>
          </div>
          <div class="schreiben-task-body">${taskDetails.taskHtml}</div>
        </div>

        <!-- Submitted Student Text -->
        <div class="schreiben-task-card">
          <div class="schreiben-task-header">
            <i data-lucide="edit-3" style="width:16px;height:16px; color:#10b981;"></i>
            <span>Your Submitted Response (${wordCount} words):</span>
          </div>
          <div class="schreiben-review-text">${this.escapeHtml(studentText || "No response recorded.")}</div>
        </div>

        <div style="margin-top:24px;">
          <button type="button" class="schreiben-btn-primary" onclick="window.SchreibenPlayerComponent.renderResultsScreen()">
            <i data-lucide="arrow-left" style="width:16px;height:16px;"></i>
            <span>Back to Detailed Evaluation</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  retry: function () {
    this.studentAnswer = "";
    this.evaluationResult = null;
    this.isEvaluating = false;
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.renderWritingWorkspace();
  },

  exitPlayer: function () {
    this.studentAnswer = "";
    this.evaluationResult = null;
    this.isEvaluating = false;
    this.isSubmitted = false;
    this.isReviewMode = false;
    this.currentMaterial = null;
    this.preloadedMaterial = null;

    if (typeof document !== "undefined" && document.body) {
      document.body.classList.remove("schreiben-mode");
    }

    window.location.hash = "#practice?module=Schreiben";
  },

  openMembership: function (event) {
    if (event && event.preventDefault) event.preventDefault();
    if (window.PracticeApp && typeof window.PracticeApp.handleUpgradePlan === "function") {
      return window.PracticeApp.handleUpgradePlan(event);
    }
    window.location.href = "../index.html#/membership";
    return false;
  },

  copyImprovedText: function (btn) {
    if (!this.evaluationResult || !this.evaluationResult.improved_version) return;
    const textToCopy = String(this.evaluationResult.improved_version);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(() => {
        if (btn) {
          const originalHtml = btn.innerHTML;
          btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i><span>Copied!</span>';
          if (window.lucide) window.lucide.createIcons();
          setTimeout(() => {
            btn.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
          }, 2000);
        }
      }).catch((err) => {
        console.warn("Clipboard copy failed:", err);
      });
    }
  }
};
