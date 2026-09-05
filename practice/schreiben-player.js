/**
 * Coco Germany Practice App - Dedicated Schreiben Player Component
 * components/schreiben-player.js
 *
 * Dedicated, independent language examination writing player:
 * - Pure standalone component decoupled from InteractivePlayerComponent
 * - Full CEFR Task & Prompt Rendering from Material JSON
 * - Real-time word counter enforcing 200 words maximum limit
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

  extractTaskDetails: function (material) {
    if (!material) {
      return {
        taskText: "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.",
        taskHtml: "<p>Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.</p>"
      };
    }

    const partsHtml = [];
    const partsText = [];

    // 1. Situation / Context / Passage (e.g. background scenario or letter/notice received)
    const situation = material.situation || material.context || material.passage;
    if (situation && typeof situation === "string" && situation.trim()) {
      partsHtml.push(`<div class="schreiben-task-situation" style="margin-bottom:12px; font-style:italic; color:#334155; line-height:1.65;">${this.sanitizeRichText(situation)}</div>`);
      partsText.push(`Situation / Kontext:\n${this.stripHtml(situation).trim()}`);
    }

    // 2. Main Task / Prompt / Instruction / Question
    const mainTask = material.task || material.prompt || material.instructions || material.question ||
      (Array.isArray(material.questions) && material.questions[0] && (material.questions[0].question || material.questions[0].prompt || material.questions[0].task)) || "";
    if (mainTask && typeof mainTask === "string" && mainTask.trim()) {
      partsHtml.push(`<div class="schreiben-task-instruction" style="font-weight:600; margin-bottom:12px; line-height:1.65;">${this.sanitizeRichText(mainTask)}</div>`);
      partsText.push(`Aufgabe:\n${this.stripHtml(mainTask).trim()}`);
    }

    // 3. Leitpunkte / Guidelines / Cues (critical in Goethe/telc Schreiben)
    const points = material.points || material.bullet_points || material.guidelines || material.cues ||
      (Array.isArray(material.questions) && material.questions[0] && material.questions[0].points);
    if (Array.isArray(points) && points.length > 0) {
      const pointItems = points
        .map((p) => {
          const text = typeof p === "string" ? p : (p.text || p.point || JSON.stringify(p));
          return `<li style="margin-bottom:4px;">${this.escapeHtml(text)}</li>`;
        })
        .join("");
      partsHtml.push(`
        <div class="schreiben-task-points-block" style="margin-top:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 16px;">
          <div style="font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">Leitpunkte:</div>
          <ul class="schreiben-task-points" style="margin:0; padding-left:20px; line-height:1.65; color:#1e293b;">${pointItems}</ul>
        </div>
      `);
      partsText.push("Punkte:\n" + points.map((p) => `- ${typeof p === "string" ? p : (p.text || p.point || JSON.stringify(p))}`).join("\n"));
    } else if (typeof points === "string" && points.trim()) {
      partsHtml.push(`
        <div class="schreiben-task-points-block" style="margin-top:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px 16px;">
          <div style="font-weight:700; font-size:0.82rem; color:#475569; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em;">Leitpunkte:</div>
          <div class="schreiben-task-points" style="line-height:1.65; color:#1e293b;">${this.sanitizeRichText(points)}</div>
        </div>
      `);
      partsText.push(`Punkte:\n${this.stripHtml(points).trim()}`);
    }

    // Fallback if none of the specific fields matched
    if (partsHtml.length === 0) {
      const fallback = material.description || "Schreibe einen zusammenhängenden deutschen Text entsprechend der Aufgabenstellung.";
      partsHtml.push(`<p style="line-height:1.65;">${this.escapeHtml(fallback)}</p>`);
      partsText.push(fallback);
    }

    return {
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
            <button type="button" class="schreiben-exit-btn" id="schreiben-btn-exit" onclick="window.SchreibenPlayerComponent.exitPlayer()" title="Zurück zum Practice Hub">
              <i data-lucide="arrow-left" style="width:18px;height:18px;"></i>
              <span class="schreiben-exit-label">Practice Hub</span>
            </button>
            <div class="schreiben-header-divider"></div>
            <div class="schreiben-brand-mark">
              <span class="schreiben-badge-gold">SCHREIBEN</span>
              <span class="schreiben-header-meta" id="schreiben-header-meta">Lade Prüfung...</span>
            </div>
          </div>
          <div class="schreiben-header-right">
            <div class="schreiben-credits-indicator" id="schreiben-credits-indicator">
              <i data-lucide="award" style="width:15px;height:15px; color:#d97706;"></i>
              <span id="schreiben-credits-text">Schreiben Player</span>
            </div>
          </div>
        </header>

        <!-- Dynamic Content Mount -->
        <main class="schreiben-content-container" id="schreiben-content-area">
          <div class="schreiben-loading-card">
            <div class="schreiben-spinner"></div>
            <p class="schreiben-loading-title">Lade Schreibaufgabe...</p>
            <p class="schreiben-loading-sub">Aufgabendetails und Prüfungsrichtlinien werden vorbereitet</p>
          </div>
        </main>
      </div>
    `;
  },

  initPlayerMaterial: async function (materialId, appState) {
    const renderRequestId = ++this.renderRequestId;
    const level = appState ? appState.currentLevel || "A1" : "A1";

    let material = this.preloadedMaterial && this.preloadedMaterial.id === materialId
      ? this.preloadedMaterial
      : null;

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
        title: `Schreibaufgabe (${level})`,
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
        creditsEl.textContent = `${window.AppState.schreibenCreditsRemaining} wöchentliche Credits`;
      } else {
        (async () => {
          try {
            const idToken = await (window.PracticeApp?.getFirebaseIdToken ? window.PracticeApp.getFirebaseIdToken() : null);
            if (idToken && window.SupabaseService?.checkSchreibenCredits) {
              const res = await window.SupabaseService.checkSchreibenCredits(idToken);
              if (res && typeof res.schreiben_credits_remaining === "number") {
                if (window.AppState) window.AppState.schreibenCreditsRemaining = res.schreiben_credits_remaining;
                const el = document.getElementById("schreiben-credits-text");
                if (el) el.textContent = `${res.schreiben_credits_remaining} wöchentliche Credits`;
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

    const material = this.currentMaterial || {};
    const examFormat = (material.exam || "Goethe").toUpperCase();
    const level = (material.level || "A1").toUpperCase();
    const title = material.contentTitle || material.title || "Schreibaufgabe";
    const taskDetails = this.extractTaskDetails(material);

    contentArea.innerHTML = `
      <div class="schreiben-workspace-card">
        <!-- Top Meta Pill Row -->
        <div class="schreiben-meta-row">
          <span class="schreiben-badge-pill schreiben-badge-level">${this.escapeHtml(examFormat)} ${this.escapeHtml(level)}</span>
          <span class="schreiben-badge-pill schreiben-badge-module">Schreiben</span>
          ${material.teil ? `<span class="schreiben-badge-pill schreiben-badge-sub">${this.escapeHtml(material.teil)}</span>` : ''}
        </div>

        <h1 class="schreiben-task-title">${this.escapeHtml(title)}</h1>

        <!-- Task Prompt Section -->
        <div class="schreiben-task-card">
          <div class="schreiben-task-header">
            <i data-lucide="file-text" style="width:16px;height:16px; color:#0284c7;"></i>
            <span>Aufgabenstellung (Writing Task)</span>
          </div>
          <div class="schreiben-task-body">${taskDetails.taskHtml}</div>
        </div>

        <!-- Student Input Section -->
        <div class="schreiben-input-card">
          <div class="schreiben-input-header">
            <label for="schreiben-textarea" class="schreiben-input-label">
              Deine schriftliche Ausarbeitung (Your German Text):
            </label>
            <div id="schreiben-word-count-pill" class="schreiben-word-pill">
              0 / 200 Wörter
            </div>
          </div>

          <textarea
            id="schreiben-textarea"
            class="schreiben-textarea"
            placeholder="Schreibe deinen Text hier auf Deutsch... (Maximal 200 Wörter)"
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
            <span>Text zur Bewertung einreichen</span>
          </button>
          <div class="schreiben-footnote">
            <i data-lucide="info" style="width:14px;height:14px; color:#64748b;"></i>
            <span>Maximal 200 Wörter · 1 wöchentlicher Credit nach erfolgreicher Bewertung</span>
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

    const pill = document.getElementById("schreiben-word-count-pill");
    const errorBanner = document.getElementById("schreiben-error-banner");
    const submitBtn = document.getElementById("schreiben-submit-btn");

    if (pill) {
      if (count > 200) {
        pill.innerHTML = `<span class="schreiben-text-danger">${count} / 200 Wörter (Limit überschritten!)</span>`;
        pill.classList.add("schreiben-pill-error");
      } else {
        pill.textContent = `${count} / 200 Wörter`;
        pill.classList.remove("schreiben-pill-error");
        if (count > 180) {
          pill.classList.add("schreiben-pill-warn");
        } else {
          pill.classList.remove("schreiben-pill-warn");
        }
      }
    }

    if (count > 200) {
      if (errorBanner) {
        errorBanner.textContent = `Die maximale Wortanzahl beträgt 200 Wörter. Bitte kürze deinen Text um ${count - 200} Wörter.`;
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
        errorBanner.textContent = "Bitte schreibe zuerst deinen Text, bevor du ihn einreichst.";
        errorBanner.style.display = "block";
      }
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast("Bitte gib einen Text ein.", "warning", 3500);
      }
      return;
    }

    if (wordCount > 200) {
      if (errorBanner) {
        errorBanner.textContent = `Die maximal erlaubte Wortanzahl ist 200 Wörter (aktuell: ${wordCount}).`;
        errorBanner.style.display = "block";
      }
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast(`Maximal 200 Wörter erlaubt (${wordCount} Wörter).`, "error", 3500);
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
          <h2 class="schreiben-eval-title">Text wird bewertet...</h2>
          <p class="schreiben-eval-sub">
            Deine Einreichung wird nach den offiziellen Prüfungsrichtlinien auf Aufgabenerfüllung, Textaufbau, Wortschatz und Grammatik geprüft.
          </p>
          <div class="schreiben-eval-meta">
            <span>Umfang: ${wordCount} Wörter</span> · <span>1 wöchentlicher Credit wird nach erfolgreicher Auswertung verbucht</span>
          </div>
        </div>
      `;
    }

    const material = this.currentMaterial || { id: "schreiben-1", module: "Schreiben", level: "A1", exam: "goethe" };
    const taskDetails = this.extractTaskDetails(material);
    const taskText = taskDetails.taskText;

    let evalRes = null;
    try {
      const idToken = await (window.PracticeApp?.getFirebaseIdToken ? window.PracticeApp.getFirebaseIdToken() : null);
      if (!idToken) {
        throw new Error("Du musst angemeldet sein, um die Auswertung zu starten.");
      }

      if (!window.SupabaseService?.evaluateSchreiben) {
        throw new Error("Der Bewertungsdienst ist derzeit nicht verfügbar.");
      }

      evalRes = await window.SupabaseService.evaluateSchreiben(
        {
          material_id: material.id,
          exam: material.exam || "goethe",
          level: material.level || "A1",
          task: taskText,
          answer: answerText
        },
        idToken
      );
    } catch (err) {
      console.error("SchreibenPlayer: Evaluation request error:", err);
      this.isEvaluating = false;
      this.renderWritingWorkspace();
      if (window.PracticeApp?.showToast) {
        window.PracticeApp.showToast(err.message || "Auswertungsfehler. Kein Credit abgezogen.", "error", 4500);
      }
      return;
    }

    if (!evalRes || !evalRes.success || !evalRes.evaluation) {
      this.isEvaluating = false;
      this.renderWritingWorkspace();
      const msg = evalRes?.message || "Auswertung fehlgeschlagen. Es wurde kein Credit abgezogen.";
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
        creditsEl.textContent = `${evalRes.schreiben_credits_remaining} wöchentliche Credits`;
      }
    }

    // Save attempt record to practice_attempts with integer marks
    const scorePercent = typeof this.evaluationResult.score_percent === "number"
      ? Math.round(this.evaluationResult.score_percent)
      : 70;
    const correctCount = Math.round(scorePercent / 10);
    const totalCount = 10;

    await this.savePracticeAttempt(material, correctCount, totalCount, scorePercent, evalRes.uid);

    if (window.PracticeApp?.recordTestCompletion) {
      window.PracticeApp.recordTestCompletion("Schreiben", scorePercent);
    }

    this.renderResultsScreen();
  },

  savePracticeAttempt: async function (material, correctCount, totalCount, scorePercent, serverUid) {
    if (!window.SupabaseService?.getSupabaseClient) return;

    try {
      const supabase = await window.SupabaseService.getSupabaseClient();
      if (!supabase) return;

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
      if (!uid || uid === "local-user" || uid === "anonymous") {
        console.warn("SchreibenPlayer: No valid UID found for practice attempt save.");
        return;
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

      const { error: insertError } = await supabase
        .from("practice_attempts")
        .insert([attemptPayload]);

      if (insertError) {
        if (insertError.code === "23505") {
          console.info("SchreibenPlayer: Practice attempt already completed for (uid, material_id).", insertError.message);
        } else {
          console.warn("SchreibenPlayer: Error recording attempt:", insertError);
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
    } catch (err) {
      console.warn("SchreibenPlayer: Failed to persist practice attempt:", err);
    }
  },

  renderResultsScreen: function () {
    const contentArea = document.getElementById("schreiben-content-area");
    if (!contentArea) return;

    const evaluation = this.evaluationResult || {};
    const scorePercent = typeof evaluation.score_percent === "number" ? Math.round(evaluation.score_percent) : 0;
    const isPassed = scorePercent >= 60;
    const criteria = Array.isArray(evaluation.criteria) ? evaluation.criteria : [];
    const mistakes = Array.isArray(evaluation.mistakes) ? evaluation.mistakes : [];
    const feedback = evaluation.feedback || "";
    const material = this.currentMaterial || {};
    const wordCount = evaluation.word_count || (this.studentAnswer ? this.studentAnswer.trim().split(/\s+/).filter(Boolean).length : 0);
    const creditsRemaining = (window.AppState && typeof window.AppState.schreibenCreditsRemaining === "number")
      ? window.AppState.schreibenCreditsRemaining
      : null;

    contentArea.innerHTML = `
      <div class="schreiben-results-card">
        <!-- Top Status Banner -->
        <div class="schreiben-results-topbar">
          <div>
            <div class="schreiben-meta-row" style="margin-bottom:8px;">
              <span class="schreiben-badge-pill schreiben-badge-level">${this.escapeHtml((material.exam || "Goethe").toUpperCase())} ${this.escapeHtml((material.level || "A1").toUpperCase())}</span>
              <span class="schreiben-badge-pill schreiben-badge-module">Schreiben Auswertung</span>
              ${creditsRemaining !== null ? `<span class="schreiben-badge-pill schreiben-badge-credits">${creditsRemaining} Credits übrig</span>` : ''}
            </div>
            <h1 class="schreiben-results-heading">Offizielles Bewertungsergebnis</h1>
          </div>
          <div>
            <span class="schreiben-status-badge ${isPassed ? 'schreiben-status-pass' : 'schreiben-status-fail'}">
              ${isPassed ? '✓ Bestanden (Passed)' : '✗ Nicht bestanden (Needs Practice)'}
            </span>
          </div>
        </div>

        <!-- Overall Score Box -->
        <div class="schreiben-score-summary-box">
          <div class="schreiben-score-figure ${isPassed ? 'schreiben-score-pass' : 'schreiben-score-fail'}">
            ${scorePercent}%
          </div>
          <div class="schreiben-score-details">
            <div class="schreiben-score-title">
              ${isPassed ? 'CEFR-Anforderung für dieses Niveau erfüllt' : 'Mindestpunktzahl: 60% erforderlich'}
            </div>
            <div class="schreiben-score-sub">
              Eingereichter Umfang: ${wordCount} Wörter · Max. 200 Wörter
            </div>
          </div>
        </div>

        <!-- Qualitative General Feedback -->
        ${feedback ? `
          <div class="schreiben-feedback-callout">
            <div class="schreiben-feedback-label">
              <i data-lucide="message-square" style="width:15px;height:15px;"></i>
              <span>Gesamteinschätzung (General Feedback)</span>
            </div>
            <p class="schreiben-feedback-text">${this.escapeHtml(feedback)}</p>
          </div>
        ` : ''}

        <!-- Criteria Grid -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="bar-chart-2" style="width:18px;height:18px; color:#0284c7;"></i>
            <span>Bewertungskriterien (Evaluation Criteria)</span>
          </h3>
          <div class="schreiben-criteria-grid">
            ${criteria.map(c => {
              const score = typeof c.score === "number" ? c.score : 3;
              const max = typeof c.max_score === "number" ? c.max_score : 5;
              const pct = Math.round((score / max) * 100);
              return `
                <div class="schreiben-criteria-item">
                  <div class="schreiben-criteria-row">
                    <span class="schreiben-criteria-name">${this.escapeHtml(c.name)}</span>
                    <span class="schreiben-criteria-score">${score} / ${max}</span>
                  </div>
                  <div class="schreiben-progress-track">
                    <div class="schreiben-progress-fill ${pct >= 60 ? 'schreiben-fill-pass' : 'schreiben-fill-warn'}" style="width:${pct}%;"></div>
                  </div>
                  ${c.feedback ? `<p class="schreiben-criteria-sub">${this.escapeHtml(c.feedback)}</p>` : ''}
                </div>
              `;
            }).join("")}
          </div>
        </div>

        <!-- Mistakes & Corrections -->
        <div class="schreiben-section-block">
          <h3 class="schreiben-section-title">
            <i data-lucide="spell-check" style="width:18px;height:18px; color:#f59e0b;"></i>
            <span>Gefundene Fehler & Korrekturen (Mistakes & Corrections)</span>
          </h3>
          ${mistakes.length > 0 ? `
            <div class="schreiben-mistakes-list">
              ${mistakes.map(m => `
                <div class="schreiben-mistake-card">
                  <div class="schreiben-mistake-row">
                    <span class="schreiben-badge-mistake">${this.escapeHtml(m.original || "")}</span>
                    <span class="schreiben-arrow">➔</span>
                    <span class="schreiben-badge-correction">${this.escapeHtml(m.correction || "")}</span>
                  </div>
                  ${m.explanation ? `<div class="schreiben-mistake-exp">${this.escapeHtml(m.explanation)}</div>` : ''}
                </div>
              `).join("")}
            </div>
          ` : `
            <div class="schreiben-clean-banner">
              <i data-lucide="check-circle-2" style="width:18px;height:18px; color:#16a34a;"></i>
              <span>Keine gravierenden sprachlichen Fehler gefunden. Sehr gute Formulierung!</span>
            </div>
          `}
        </div>

        <!-- Action Buttons -->
        <div class="schreiben-results-actions">
          <button type="button" class="schreiben-btn-primary" onclick="window.SchreibenPlayerComponent.enterReviewMode()">
            <i data-lucide="eye" style="width:16px;height:16px;"></i>
            <span>Eingereichten Text prüfen (Review Text)</span>
          </button>
          <button type="button" class="schreiben-btn-secondary" onclick="window.SchreibenPlayerComponent.retry()">
            <i data-lucide="rotate-ccw" style="width:16px;height:16px;"></i>
            <span>Erneut versuchen (Try Again)</span>
          </button>
          <button type="button" class="schreiben-btn-secondary" onclick="window.SchreibenPlayerComponent.exitPlayer()">
            <i data-lucide="grid" style="width:16px;height:16px;"></i>
            <span>Zurück zum Practice Hub</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  enterReviewMode: function () {
    const contentArea = document.getElementById("schreiben-content-area");
    if (!contentArea) return;

    const evaluation = this.evaluationResult || {};
    const scorePercent = typeof evaluation.score_percent === "number" ? Math.round(evaluation.score_percent) : 0;
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
            <span>Review Mode · Schreiben</span>
            <span class="schreiben-review-score">Ergebnis: ${scorePercent}% (${wordCount} Wörter)</span>
          </div>
          <button type="button" class="schreiben-review-back-btn" onclick="window.SchreibenPlayerComponent.renderResultsScreen()">
            Zurück zur Auswertung
          </button>
        </div>

        <!-- Task Prompt -->
        <div class="schreiben-task-card" style="margin-top:20px;">
          <div class="schreiben-task-header">
            <i data-lucide="file-text" style="width:16px;height:16px; color:#0284c7;"></i>
            <span>Aufgabenstellung</span>
          </div>
          <div class="schreiben-task-body">${taskDetails.taskHtml}</div>
        </div>

        <!-- Submitted Student Text -->
        <div class="schreiben-task-card">
          <div class="schreiben-task-header">
            <i data-lucide="edit-3" style="width:16px;height:16px; color:#10b981;"></i>
            <span>Deine abgegebene Antwort (${wordCount} Wörter):</span>
          </div>
          <div class="schreiben-review-text">${this.escapeHtml(studentText || "Keine Antwort erfasst.")}</div>
        </div>

        <div style="margin-top:24px;">
          <button type="button" class="schreiben-btn-primary" onclick="window.SchreibenPlayerComponent.renderResultsScreen()">
            <i data-lucide="arrow-left" style="width:16px;height:16px;"></i>
            <span>Zurück zur detaillierten Auswertung</span>
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

    window.location.hash = "#practice?module=Schreiben";
  }
};
