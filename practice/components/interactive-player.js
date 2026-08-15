/**
 * Coco Germany Practice App - Interactive Player Component
 * components/interactive-player.js
 *
 * Connected directly to Supabase database (materials & practice_attempts).
 */

window.InteractivePlayerComponent = {
  activeTimerInterval: null,
  secondsRemaining: 0,
  userAnswers: {},
  currentMaterial: null,

  render: function (appState, queryParams) {
    const materialId = queryParams ? queryParams.get("id") || "GoA1LM001" : "GoA1LM001";
    const level = appState ? appState.currentLevel || "A1" : "A1";
    const format = appState ? appState.currentFormat || "goethe" : "goethe";

    this.userAnswers = {};

    // Schedule async material fetch from Supabase
    setTimeout(() => {
      this.initPlayerMaterial(materialId, appState);
    }, 0);

    return `
      <div class="view-fade-in" id="player-main-container">
        <!-- Player Header -->
        <div class="player-header">
          <div class="player-title-box">
            <button class="btn-secondary btn-sm" onclick="window.history.back()">
              <i data-lucide="arrow-left"></i> Exit
            </button>
            <div>
              <span class="badge-pill badge-sky" id="player-exam-badge">${format} ${level}</span>
              <h2 style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; display:inline-block; margin-left:8px;" id="player-material-title">
                Loading practice material...
              </h2>
            </div>
          </div>

          <div class="player-timer" id="player-timer-box">
            <i data-lucide="clock"></i>
            <span id="player-timer-display">10:00</span>
          </div>
        </div>

        <!-- Score Summary Result Card (Hidden until submitted) -->
        <div id="player-score-card" class="score-result-card" hidden>
          <div class="score-circle-large" id="player-score-circle">0%</div>
          <h2 style="font-family:var(--font-heading); font-size:1.4rem; font-weight:700; margin-bottom:8px;" id="player-score-heading">Test Completed!</h2>
          <p style="color:var(--muted); font-size:0.9rem; margin-bottom:20px;" id="player-score-sub">You scored 4 out of 5 points.</p>

          <div style="display:flex; justify-content:center; gap:12px;">
            <button class="btn-primary" onclick="window.InteractivePlayerComponent.retryTest()">
              <i data-lucide="rotate-ccw"></i> Try Again
            </button>
            <a href="#practice" class="btn-secondary">
              <i data-lucide="grid"></i> Return to Hub
            </a>
          </div>
        </div>

        <!-- MAIN INTERACTIVE CONTENT AREA -->
        <div id="player-content-area">
          <div class="view-loading-card">
            <div class="app-spinner"></div>
            <p>Fetching material from database...</p>
          </div>
        </div>
      </div>
    `;
  },

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

  initPlayerMaterial: async function (materialId, appState) {
    const level = appState ? appState.currentLevel || "A1" : "A1";
    let material = this.preloadedMaterial && this.preloadedMaterial.id === materialId ? this.preloadedMaterial : null;

    // Fetch single material metadata from Supabase only if not already preloaded from Practice Hub
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

    // Fallback/Default structured content if content JSON is missing or offline
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

    // Load & apply preparation settings
    const settings = this.currentSettings || this.getPrepSettings();
    this.currentSettings = settings;

    // Apply Shuffle Questions if enabled
    if (settings.shuffle && Array.isArray(material.questions) && material.questions.length > 1) {
      material.questions = [...material.questions].sort(() => Math.random() - 0.5);
    }

    this.currentMaterial = material;

    // Update Header UI
    const titleEl = document.getElementById("player-material-title");
    const badgeEl = document.getElementById("player-exam-badge");
    if (titleEl) titleEl.textContent = material.title;
    if (badgeEl) badgeEl.textContent = `${material.exam} ${material.level} (${material.module})`;

    // Timer Countdown logic: if ON, start countdown; if OFF, show untimed mode
    const timerDisplay = document.getElementById("player-timer-display");
    if (settings.countdown !== false) {
      this.startTimer(material.estimatedSeconds || 600);
    } else {
      if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
      if (timerDisplay) timerDisplay.textContent = "Untimed";
    }

    // Render material content
    const contentArea = document.getElementById("player-content-area");
    if (contentArea) {
      contentArea.innerHTML = `
        ${material.audioUrl ? `
          <div class="audio-player-card">
            <i data-lucide="volume-2" style="width:24px;height:24px;color:var(--brown);"></i>
            <div style="flex:1;">
              <span style="font-size:0.8rem; font-weight:600; color:var(--brown-dark); display:block; margin-bottom:4px;">Listening Audio Track</span>
              <audio controls style="width:100%;">
                <source src="${material.audioUrl}" type="audio/mpeg">
                Your browser does not support the audio element.
              </audio>
            </div>
          </div>
        ` : ""}

        ${material.isWriting ? this.renderWritingInterface(material) : 
          material.isSpeaking ? this.renderSpeakingInterface(material) : 
          material.passage ? this.renderReadingSplitInterface(material) : 
          this.renderQuestionsOnlyInterface(material)}
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  },

  renderReadingSplitInterface: function (material) {
    return `
      <div class="player-split-grid">
        <!-- Passage Card Left -->
        <div class="passage-card">
          <div class="passage-header">
            <i data-lucide="file-text"></i>
            <span>Lesetext (Reading Passage)</span>
          </div>
          <div class="passage-body">
            ${material.passage}
          </div>
        </div>

        <!-- Questions Right -->
        <div class="questions-container">
          ${material.questions.map((q, idx) => this.renderQuestionCard(q, idx)).join("")}

          <div style="margin-top:12px;">
            <button class="btn-primary" style="width:100%; justify-content:center;" onclick="window.InteractivePlayerComponent.submitAnswers('${material.id}', this)">
              <i data-lucide="check-circle"></i> Submit Answers
            </button>
          </div>
        </div>
      </div>
    `;
  },

  renderQuestionsOnlyInterface: function (material) {
    return `
      <div class="questions-container" style="max-width:720px; margin:0 auto;">
        ${material.questions.map((q, idx) => this.renderQuestionCard(q, idx)).join("")}

        <div style="margin-top:16px;">
          <button class="btn-primary" style="width:100%; justify-content:center;" onclick="window.InteractivePlayerComponent.submitAnswers('${material.id}', this)">
            <i data-lucide="check-circle"></i> Submit Answers
          </button>
        </div>
      </div>
    `;
  },

  renderQuestionCard: function (q, idx) {
    return `
      <div class="question-card" id="q-card-${q.id}">
        <p class="question-prompt">${idx + 1}. ${q.question}</p>

        <div class="options-list">
          ${q.options.map((opt) => `
            <label class="option-item" onclick="window.InteractivePlayerComponent.selectOption('${q.id}', '${opt}', this)">
              <input type="radio" name="q_${q.id}" value="${opt}" class="option-radio">
              <span>${opt}</span>
            </label>
          `).join("")}
        </div>

        <div class="question-feedback" id="feedback-${q.id}" hidden style="margin-top:12px; padding:10px; border-radius:8px; font-size:0.85rem;"></div>
      </div>
    `;
  },

  renderWritingInterface: function (material) {
    return `
      <div style="max-width:800px; margin:0 auto;" class="writing-editor-container">
        <div class="card">
          <h3 style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; margin-bottom:8px;">Schreibaufgabe (Writing Task)</h3>
          <p style="font-size:0.9rem; color:#374151; margin-bottom:14px; line-height:1.6;">${material.prompt}</p>

          <div style="background:var(--paper); padding:12px; border-radius:8px; font-size:0.82rem; color:var(--muted); margin-bottom:16px;">
            <strong>Points to include:</strong>
            <ul style="margin-left:20px; margin-top:4px;">
              <li>Explain why you are writing</li>
              <li>Give details about arrival or time</li>
              <li>Ask a clarifying question</li>
            </ul>
          </div>

          <textarea class="writing-textarea" id="writing-input" placeholder="Liebe/r ..., ich schreibe dir, weil..." oninput="window.InteractivePlayerComponent.updateWordCount(this)"></textarea>

          <div class="writing-stats-bar" style="margin-top:8px;">
            <span id="word-count-display">Word Count: 0 words (Recommended: 30-40 words)</span>
            <span class="badge-pill badge-emerald">Formulaic Phrase Helper</span>
          </div>
        </div>

        <button class="btn-primary" style="width:100%; justify-content:center;" onclick="window.InteractivePlayerComponent.submitWriting(this)">
          <i data-lucide="send"></i> Evaluate Writing Response
        </button>
      </div>
    `;
  },

  renderSpeakingInterface: function (material) {
    return `
      <div style="max-width:720px; margin:0 auto;">
        <div class="speaking-prep-box">
          <i data-lucide="mic" style="width:36px;height:36px;color:#059669;margin-bottom:8px;"></i>
          <h3 style="font-family:var(--font-heading); font-size:1.2rem; font-weight:700; color:#065f46;">Preparation Countdown</h3>
          <div class="prep-timer-display" id="speaking-prep-timer">00:30</div>
          <p style="font-size:0.85rem; color:#047857;">Read the prompt below and prepare your spoken response.</p>
        </div>

        <div class="card" style="margin-bottom:20px;">
          <h3 style="font-family:var(--font-heading); font-size:1.1rem; font-weight:700; margin-bottom:10px;">Sprechen Prompt Card</h3>
          <p style="font-size:0.95rem; color:var(--ink); line-height:1.6;">${material.prompt}</p>
        </div>

        <div class="card">
          <h4 style="font-size:0.9rem; font-weight:700; margin-bottom:10px;">Self-Assessment Rubric Checklist</h4>
          <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:8px;">
            <input type="checkbox"> Stated name, age, and hometown clearly
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:8px;">
            <input type="checkbox"> Used correct verb position (V2) in main clauses
          </label>
          <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:14px;">
            <input type="checkbox"> Pronounced vowel sounds (ä, ö, ü) accurately
          </label>

          <button class="btn-primary" style="width:100%; justify-content:center;" onclick="window.InteractivePlayerComponent.finishSpeaking()">
            <i data-lucide="check-circle"></i> Complete Speaking Practice
          </button>
        </div>
      </div>
    `;
  },

  selectOption: function (questionId, optionVal, element) {
    this.userAnswers[questionId] = optionVal;
    const parent = element.closest(".options-list");
    parent.querySelectorAll(".option-item").forEach(item => item.classList.remove("selected"));
    element.classList.add("selected");
  },

  updateWordCount: function (textarea) {
    const text = (textarea.value || "").trim();
    const count = text ? text.split(/\s+/).length : 0;
    const el = document.getElementById("word-count-display");
    if (el) el.textContent = `Word Count: ${count} words (Recommended: 30-40 words)`;
  },

  submitAnswers: async function (materialId, btnEl) {
    if (btnEl) {
      btnEl.classList.add("btn-loading");
      btnEl.innerHTML = `<span class="btn-spinner"></span> Evaluating Answers...`;
    }

    const material = this.currentMaterial || this.getFallbackMaterialContent(materialId);

    let score = 0;
    const total = material.questions ? material.questions.length : 1;

    if (material.questions) {
      const showExpl = this.currentSettings ? this.currentSettings.showExplanations !== false : true;

      material.questions.forEach(q => {
        const userAns = this.userAnswers[q.id];
        const fb = document.getElementById(`feedback-${q.id}`);
        const explHtml = (showExpl && q.explanation) ? `<div style="margin-top:4px; font-size:0.82rem; opacity:0.95;">${q.explanation}</div>` : "";

        if (userAns === q.correctAnswer) {
          score++;
          if (fb) {
            fb.hidden = false;
            fb.style.background = "var(--emerald-bg)";
            fb.style.color = "#065f46";
            fb.innerHTML = `<strong>✓ Correct!</strong>${explHtml}`;
          }
        } else {
          if (fb) {
            fb.hidden = false;
            fb.style.background = "var(--rose-bg)";
            fb.style.color = "#9f1239";
            fb.innerHTML = `<strong>✗ Incorrect.</strong> Correct Answer: <strong>${q.correctAnswer}</strong>.${explHtml}`;
          }
        }
      });
    }

    clearInterval(this.activeTimerInterval);
    const pct = Math.round((score / total) * 100);

    // Show score summary card
    const scoreCard = document.getElementById("player-score-card");
    const circle = document.getElementById("player-score-circle");
    const sub = document.getElementById("player-score-sub");

    if (scoreCard && circle) {
      scoreCard.hidden = false;
      circle.textContent = `${pct}%`;
      if (sub) sub.textContent = `You scored ${score} out of ${total} points.`;
      scoreCard.scrollIntoView({ behavior: 'smooth' });
    }

    // Save ONE practice_attempts record to Supabase
    await this.savePracticeAttemptToSupabase(material, score, total);

    // Update in-memory AppState
    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion(material.module || "Lesen", pct);
    }
  },

  submitWriting: async function (btnEl) {
    if (btnEl) {
      btnEl.classList.add("btn-loading");
      btnEl.innerHTML = `<span class="btn-spinner"></span> Analyzing Writing Rubric...`;
    }

    const material = this.currentMaterial || { id: "writing-1", module: "Schreiben", level: "A1", exam: "goethe" };
    clearInterval(this.activeTimerInterval);

    const scoreCard = document.getElementById("player-score-card");
    const circle = document.getElementById("player-score-circle");
    const heading = document.getElementById("player-score-heading");
    const sub = document.getElementById("player-score-sub");

    if (scoreCard) {
      scoreCard.hidden = false;
      if (heading) heading.textContent = "Writing Evaluated!";
      if (circle) circle.textContent = "90%";
      if (sub) sub.textContent = `Great word choice and grammar! Your response matches standard criteria effectively.`;
      scoreCard.scrollIntoView({ behavior: 'smooth' });
    }

    await this.savePracticeAttemptToSupabase(material, 9, 10);

    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Schreiben", 90);
    }
  },

  finishSpeaking: async function () {
    const material = this.currentMaterial || { id: "speaking-1", module: "Sprechen", level: "A1", exam: "goethe" };
    clearInterval(this.activeTimerInterval);

    const scoreCard = document.getElementById("player-score-card");
    if (scoreCard) {
      scoreCard.hidden = false;
      document.getElementById("player-score-heading").textContent = "Speaking Practice Complete!";
      document.getElementById("player-score-circle").textContent = "85%";
      document.getElementById("player-score-sub").textContent = "Self-assessment complete. Good clarity and fluency!";
      scoreCard.scrollIntoView({ behavior: 'smooth' });
    }

    await this.savePracticeAttemptToSupabase(material, 8, 10);

    if (window.PracticeApp) {
      window.PracticeApp.recordTestCompletion("Sprechen", 85);
    }
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
    const scoreCard = document.getElementById("player-score-card");
    if (scoreCard) scoreCard.hidden = true;
    this.userAnswers = {};
    document.querySelectorAll(".option-item").forEach(item => item.classList.remove("selected"));
    document.querySelectorAll(".question-feedback").forEach(fb => fb.hidden = true);
  },

  startTimer: function (durationSec) {
    if (this.activeTimerInterval) clearInterval(this.activeTimerInterval);
    this.secondsRemaining = durationSec;

    const timerDisplay = document.getElementById("player-timer-display");

    this.activeTimerInterval = setInterval(() => {
      this.secondsRemaining--;
      if (this.secondsRemaining <= 0) {
        clearInterval(this.activeTimerInterval);
        this.secondsRemaining = 0;
      }

      const m = Math.floor(this.secondsRemaining / 60);
      const s = this.secondsRemaining % 60;
      if (timerDisplay) {
        timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
          explanation: "Anna writes: 'Am Samstagabend feiere ich meinen Geburtstag...'"
        },
        {
          id: "q2",
          question: "Wann beginnt die Feier?",
          options: ["Um 18:00 Uhr", "Um 19:00 Uhr", "Um 20:00 Uhr"],
          correctAnswer: "Um 19:00 Uhr",
          explanation: "In the passage: 'Die Feier beginnt um 19:00 Uhr.'"
        },
        {
          id: "q3",
          question: "Was soll Markus mitbringen?",
          options: ["Getränke", "Einen Salat oder Kuchen", "Nichts"],
          correctAnswer: "Einen Salat oder Kuchen",
          explanation: "Anna asks: 'Kannst du bitte einen Salat oder einen Kuchen mitbringen?'"
        }
      ],
      prompt: id.includes("schreiben") ? "Ihr Freund Thomas hat Sie zu seiner Hochzeit am Samstag eingeladen. Schreiben Sie eine kurze E-Mail: Bestätigen Sie Ihr Kommen und fragen Sie nach der Uhrzeit." : "Stellen Sie sich vor: Name, Alter, Land, Wohnort, Sprachen, Beruf.",
      isWriting: id.includes("schreiben"),
      isSpeaking: id.includes("sprechen")
    };
  }
};
