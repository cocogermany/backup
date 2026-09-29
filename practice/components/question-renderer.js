/**
 * Coco Germany Practice App - Dynamic CEFR Question Renderer Engine
 * components/question-renderer.js
 *
 * Unified Question Rendering & Evaluation Engine supporting 12 CEFR task formats:
 *   1. SINGLE_CHOICE       - Radio buttons, single correct answer
 *   2. TRUE_FALSE          - Richtig / Falsch toggle buttons
 *   3. YES_NO              - Ja / Nein toggle buttons
 *   4. MATCHING            - Left item matched with options pool on right + "X"
 *   5. MULTIPLE_CHOICE     - Checkboxes for explicit multiple answers
 *   6. SENTENCE_INSERTION  - Text with gaps matched with sentence pool
 *   7. HEADING_MATCHING    - Paragraphs matched with headings pool
 *   8. PERSON_MATCHING     - Statements matched with person choices (Who says what)
 *   9. IMAGE_MATCHING      - Image choice cards with thumbnail & selection badge
 *  10. TEXT_INPUT          - Short free text with normalized answer validation
 *  11. FORM                - Multi-field Formular with field-level scoring & review
 *  12. LONG_TEXT           - Writing task with prompt, word count & textarea
 *
 * Supports audio play limits (1× / 2× playback with optional auto-replay).
 * Fully decoupled and shared by InteractivePlayerComponent and MockPlayerComponent.
 */

(function () {
  "use strict";

  const QuestionRenderer = {
    /* ============================================================
     * 1. QUESTION TYPE DETECTION
     * ============================================================ */
    detectQuestionType: function (q, material = null) {
      if (!q && !material) return "unsupported";

      // 1. Explicit declaration on question or material
      const explicitType = String(
        q?.questionType ||
        q?.question_type ||
        q?.type ||
        material?.questionType ||
        material?.question_type ||
        ""
      ).toLowerCase().trim();

      if (explicitType) {
        if (explicitType.includes("single") || explicitType === "sc" || explicitType === "radio") return "single_choice";
        if (explicitType.includes("true_false") || explicitType.includes("true-false") || explicitType.includes("richtig") || explicitType === "tf") return "true_false";
        if (explicitType.includes("yes_no") || explicitType.includes("yes-no") || explicitType.includes("ja_nein") || explicitType === "yn") return "yes_no";
        if (explicitType.includes("heading")) return "heading_matching";
        if (explicitType.includes("sentence")) return "sentence_insertion";
        if (explicitType.includes("person") || explicitType.includes("who_says") || explicitType.includes("wer_sagt")) return "person_matching";
        if (explicitType.includes("image") || explicitType.includes("bild")) return "image_matching";
        if (explicitType.includes("match") || explicitType.includes("zuordn")) return "matching";
        if (explicitType.includes("multi") || explicitType === "mc" || explicitType === "checkbox") return "multiple_choice";
        if (explicitType.includes("form")) return "form";
        if (explicitType.includes("text_input") || explicitType.includes("text-input") || explicitType.includes("short_text") || explicitType === "input") return "text_input";
        if (explicitType.includes("long_text") || explicitType.includes("essay") || explicitType.includes("schreiben") || explicitType === "textarea") return "long_text";
      }

      // 2. Infer from question/material schema
      if (q && Array.isArray(q.fields) && q.fields.length > 0) return "form";
      if (material && Array.isArray(material.form_fields) && material.form_fields.length > 0) return "form";
      if (material && Array.isArray(material.fields) && material.fields.length > 0) return "form";

      if (q && (q.sentencePool || q.sentences || material?.availableSentences || material?.sentencePool)) return "sentence_insertion";
      if (q && (q.headingsPool || q.headings || material?.availableHeadings || material?.headingPool)) return "heading_matching";
      if (q && (q.persons || material?.persons || material?.people)) return "person_matching";

      if (q && (q.images || (Array.isArray(q.options) && q.options.some(o => typeof o === "object" && (o.image || o.imageUrl))))) return "image_matching";

      if (q && (q.matchingPool || q.matchingOptions || material?.matchingPool || material?.matchingOptions)) return "matching";

      if (q && (q.multiple === true || (Array.isArray(q.correctAnswer) && q.correctAnswer.length > 1))) return "multiple_choice";

      if (q && Array.isArray(q.options) && q.options.length === 2) {
        const normOpts = q.options.map(o => String(o).trim().toLowerCase());
        if (normOpts.includes("richtig") && normOpts.includes("falsch")) return "true_false";
        if (normOpts.includes("true") && normOpts.includes("false")) return "true_false";
        if (normOpts.includes("ja") && normOpts.includes("nein")) return "yes_no";
        if (normOpts.includes("yes") && normOpts.includes("no")) return "yes_no";
      }

      if (q && (q.inputType === "text" || (!q.options && (q.correctAnswer !== undefined || q.acceptedAnswers)))) return "text_input";

      // Writing module without questions array
      if (material && (material.module === "Schreiben" || material.task) && (!q || !Array.isArray(material.questions))) return "long_text";

      // Standard single choice fallback for any questions with options
      if (q && Array.isArray(q.options) && q.options.length > 0) return "single_choice";

      return "unsupported";
    },

    /* ============================================================
     * 2. UTILITY & SANITIZATION HELPERS
     * ============================================================ */
    escapeHtml: function (str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    normalizeText: function (str) {
      if (str === null || str === undefined) return "";
      return String(str)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/^[„“"']+|[„“"'.?!]+$/g, "")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/:\s*00\b/, "")
        .replace(/\.\s*00\b/, "");
    },

    getOptionValue: function (opt) {
      if (opt === null || opt === undefined) return "";
      if (typeof opt === "object") {
        return String(opt.id || opt.code || opt.value || opt.key || opt.text || opt.label || "");
      }
      return String(opt);
    },

    getOptionLabel: function (opt) {
      if (opt === null || opt === undefined) return "";
      if (typeof opt === "object") {
        return String(opt.label || opt.text || opt.title || opt.name || opt.id || opt.code || "");
      }
      return String(opt);
    },

    /* ============================================================
     * 3. HTML RENDERING FOR ALL 12 QUESTION TYPES
     * ============================================================ */
    renderQuestion: function (q, idx, total, userAnswers = {}, isReviewMode = false, opts = {}) {
      const qId = String(q.id || `q-${idx + 1}`);
      const type = this.detectQuestionType(q, opts.material);
      const isMock = opts.playerType === "mock";
      const blockClass = isMock ? "mock-q-card" : "exam-q-block";
      const counterClass = isMock ? "mock-q-num" : "exam-q-counter";
      const textClass = isMock ? "mock-q-text" : "exam-q-text";

      // Type title pill
      const typeLabels = {
        single_choice: "Single Choice",
        true_false: "Richtig / Falsch",
        yes_no: "Ja / Nein",
        matching: "Zuordnung (Matching)",
        multiple_choice: "Multiple Choice",
        sentence_insertion: "Satz einsetzen",
        heading_matching: "Überschriften-Zuordnung",
        person_matching: "Personen-Zuordnung",
        image_matching: "Bilder-Zuordnung",
        text_input: "Freitext-Antwort",
        form: "Formular",
        long_text: "Schreibaufgabe",
        unsupported: "Unsupported"
      };

      const typeBadge = `<span class="exam-q-type-badge">${typeLabels[type] || "Aufgabe"}</span>`;

      // Header row
      const headerHtml = `
        <div class="${isMock ? 'mock-q-header' : 'exam-q-header'}" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span class="${counterClass}">Frage ${idx + 1} / ${total} ${typeBadge}</span>
        </div>
      `;

      // Unsupported Fallback
      if (type === "unsupported") {
        console.warn("QuestionRenderer: Unsupported question type detected for question:", q);
        return `
          <div class="${blockClass} exam-unsupported-q" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.statement || "Aufgabe")}</div>
            <div class="exam-unsupported-card">
              <i data-lucide="alert-circle" style="width:20px;height:20px;color:#d97706;flex-shrink:0;"></i>
              <div>
                <strong>This question type is not supported yet.</strong>
                <p style="font-size:0.8rem; color:var(--muted, #64748b); margin:4px 0 0;">
                  Format: ${this.escapeHtml(q.questionType || q.type || "unknown")}. You can skip this question and continue.
                </p>
              </div>
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 1. SINGLE CHOICE
      if (type === "single_choice") {
        const options = Array.isArray(q.options) ? q.options : [];
        const userVal = userAnswers[qId];

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || "")}</div>
            <div class="${isMock ? 'mock-options-list' : 'exam-radio-list'}">
              ${options.map((opt) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const isSelected = String(userVal) === optVal;
                return `
                  <label class="${isMock ? 'mock-option-label' : 'exam-radio-item'} ${isSelected ? 'selected' : ''}" id="label-${this.escapeHtml(qId)}-${this.escapeHtml(optVal)}">
                    <input
                      type="radio"
                      class="${isMock ? 'mock-radio-input' : 'exam-radio-input'}"
                      name="q_${this.escapeHtml(qId)}"
                      value="${this.escapeHtml(optVal)}"
                      data-question-id="${this.escapeHtml(qId)}"
                      data-option-value="${this.escapeHtml(optVal)}"
                      ${isSelected ? 'checked' : ''}
                      ${isReviewMode ? 'disabled' : ''}
                    />
                    <span class="${isMock ? 'mock-radio-circle' : 'exam-radio-circle'}"></span>
                    <span class="${isMock ? 'mock-option-text' : 'exam-radio-label'}">${this.escapeHtml(optLabel)}</span>
                  </label>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 2. TRUE / FALSE
      if (type === "true_false") {
        const options = Array.isArray(q.options) && q.options.length === 2 ? q.options : ["Richtig", "Falsch"];
        const userVal = userAnswers[qId];

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.statement || "")}</div>
            <div class="exam-tf-group">
              ${options.map((opt) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const isSelected = String(userVal) === optVal;
                return `
                  <button
                    type="button"
                    class="exam-tf-btn ${isSelected ? 'selected' : ''}"
                    data-question-id="${this.escapeHtml(qId)}"
                    data-option-value="${this.escapeHtml(optVal)}"
                    ${isReviewMode ? 'disabled' : ''}
                  >
                    <span>${this.escapeHtml(optLabel)}</span>
                  </button>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 3. YES / NO
      if (type === "yes_no") {
        const options = Array.isArray(q.options) && q.options.length === 2 ? q.options : ["Ja", "Nein"];
        const userVal = userAnswers[qId];

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.statement || "")}</div>
            <div class="exam-tf-group">
              ${options.map((opt) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const isSelected = String(userVal) === optVal;
                return `
                  <button
                    type="button"
                    class="exam-tf-btn ${isSelected ? 'selected' : ''}"
                    data-question-id="${this.escapeHtml(qId)}"
                    data-option-value="${this.escapeHtml(optVal)}"
                    ${isReviewMode ? 'disabled' : ''}
                  >
                    <span>${this.escapeHtml(optLabel)}</span>
                  </button>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 4. MATCHING
      if (type === "matching") {
        const pool = q.matchingPool || q.matchingOptions || opts.material?.matchingPool || opts.material?.matchingOptions || q.options || [];
        const userVal = userAnswers[qId] || "";

        return `
          <div class="${blockClass} exam-matching-card" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.situation || "")}</div>
            <div class="exam-matching-select-row">
              <span class="exam-matching-label">Passende Zuordnung:</span>
              <select
                class="exam-matching-select ${userVal ? 'selected' : ''}"
                data-question-id="${this.escapeHtml(qId)}"
                ${isReviewMode ? 'disabled' : ''}
              >
                <option value="">-- Zuordnung auswählen --</option>
                ${pool.map((opt) => {
                  const val = this.getOptionValue(opt);
                  const lbl = this.getOptionLabel(opt);
                  const isSel = String(userVal) === val;
                  return `<option value="${this.escapeHtml(val)}" ${isSel ? 'selected' : ''}>${this.escapeHtml(lbl)}</option>`;
                }).join("")}
              </select>
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 5. MULTIPLE CHOICE (CHECKBOXES)
      if (type === "multiple_choice") {
        const options = Array.isArray(q.options) ? q.options : [];
        const userSelected = Array.isArray(userAnswers[qId])
          ? userAnswers[qId]
          : (userAnswers[qId] ? [String(userAnswers[qId])] : []);

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || "Wählen Sie alle passenden Antworten:")}</div>
            <div class="exam-checkbox-list">
              ${options.map((opt) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const isChecked = userSelected.includes(optVal);
                return `
                  <label class="exam-checkbox-item ${isChecked ? 'selected' : ''}" id="label-${this.escapeHtml(qId)}-${this.escapeHtml(optVal)}">
                    <input
                      type="checkbox"
                      class="exam-checkbox-input"
                      name="q_${this.escapeHtml(qId)}[]"
                      value="${this.escapeHtml(optVal)}"
                      data-question-id="${this.escapeHtml(qId)}"
                      data-option-value="${this.escapeHtml(optVal)}"
                      ${isChecked ? 'checked' : ''}
                      ${isReviewMode ? 'disabled' : ''}
                    />
                    <span class="exam-checkbox-box"></span>
                    <span class="exam-radio-label">${this.escapeHtml(optLabel)}</span>
                  </label>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 6. SENTENCE INSERTION
      if (type === "sentence_insertion") {
        const pool = q.sentencePool || q.sentences || opts.material?.availableSentences || opts.material?.sentencePool || q.options || [];
        const userVal = userAnswers[qId] || "";

        return `
          <div class="${blockClass} exam-matching-card" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.gapContext || `Lücke ${idx + 1}`)}</div>
            <div class="exam-matching-select-row">
              <span class="exam-matching-label">Passender Satz:</span>
              <select
                class="exam-matching-select exam-sentence-select ${userVal ? 'selected' : ''}"
                data-question-id="${this.escapeHtml(qId)}"
                ${isReviewMode ? 'disabled' : ''}
              >
                <option value="">-- Satz auswählen --</option>
                ${pool.map((opt) => {
                  const val = this.getOptionValue(opt);
                  const lbl = this.getOptionLabel(opt);
                  const isSel = String(userVal) === val;
                  return `<option value="${this.escapeHtml(val)}" ${isSel ? 'selected' : ''}>${this.escapeHtml(lbl)}</option>`;
                }).join("")}
              </select>
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 7. HEADING MATCHING
      if (type === "heading_matching") {
        const pool = q.headingsPool || q.headings || opts.material?.availableHeadings || opts.material?.headingPool || q.options || [];
        const userVal = userAnswers[qId] || "";

        return `
          <div class="${blockClass} exam-matching-card" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.paragraph || q.question || `Abschnitt ${idx + 1}`)}</div>
            <div class="exam-matching-select-row">
              <span class="exam-matching-label">Passende Überschrift:</span>
              <select
                class="exam-matching-select exam-heading-select ${userVal ? 'selected' : ''}"
                data-question-id="${this.escapeHtml(qId)}"
                ${isReviewMode ? 'disabled' : ''}
              >
                <option value="">-- Überschrift auswählen --</option>
                ${pool.map((opt) => {
                  const val = this.getOptionValue(opt);
                  const lbl = this.getOptionLabel(opt);
                  const isSel = String(userVal) === val;
                  return `<option value="${this.escapeHtml(val)}" ${isSel ? 'selected' : ''}>${this.escapeHtml(lbl)}</option>`;
                }).join("")}
              </select>
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 8. PERSON MATCHING / WHO SAYS WHAT
      if (type === "person_matching") {
        const pool = q.persons || opts.material?.persons || opts.material?.people || q.options || [];
        const userVal = userAnswers[qId];

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.statement || q.question || "")}</div>
            <div class="${isMock ? 'mock-options-list' : 'exam-radio-list'}">
              ${pool.map((opt) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const isSelected = String(userVal) === optVal;
                return `
                  <label class="${isMock ? 'mock-option-label' : 'exam-radio-item'} ${isSelected ? 'selected' : ''}">
                    <input
                      type="radio"
                      class="${isMock ? 'mock-radio-input' : 'exam-radio-input'}"
                      name="q_${this.escapeHtml(qId)}"
                      value="${this.escapeHtml(optVal)}"
                      data-question-id="${this.escapeHtml(qId)}"
                      data-option-value="${this.escapeHtml(optVal)}"
                      ${isSelected ? 'checked' : ''}
                      ${isReviewMode ? 'disabled' : ''}
                    />
                    <span class="${isMock ? 'mock-radio-circle' : 'exam-radio-circle'}"></span>
                    <span class="${isMock ? 'mock-option-text' : 'exam-radio-label'}">${this.escapeHtml(optLabel)}</span>
                  </label>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 9. IMAGE MATCHING
      if (type === "image_matching") {
        const options = Array.isArray(q.options) ? q.options : (q.images || []);
        const userVal = userAnswers[qId];

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || "Wählen Sie das passende Bild:")}</div>
            <div class="exam-img-grid">
              ${options.map((opt, oIdx) => {
                const optVal = this.getOptionValue(opt);
                const optLabel = this.getOptionLabel(opt);
                const imgUrl = typeof opt === "object" ? (opt.imageUrl || opt.image || opt.url || "") : "";
                const isSelected = String(userVal) === optVal;
                return `
                  <div
                    class="exam-img-card ${isSelected ? 'selected' : ''}"
                    data-question-id="${this.escapeHtml(qId)}"
                    data-option-value="${this.escapeHtml(optVal)}"
                  >
                    ${imgUrl ? `<img src="${this.escapeHtml(imgUrl)}" alt="${this.escapeHtml(optLabel)}" class="exam-img-preview" />` : ''}
                    <div class="exam-img-footer">
                      <span>${this.escapeHtml(optLabel)}</span>
                      <span class="exam-img-badge">${String.fromCharCode(65 + oIdx)}</span>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 10. TEXT INPUT
      if (type === "text_input") {
        const userVal = userAnswers[qId] || "";

        return `
          <div class="${blockClass}" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="${textClass}">${this.escapeHtml(q.question || q.label || "")}</div>
            <div class="exam-text-input-wrap">
              <input
                type="text"
                class="exam-text-input"
                data-question-id="${this.escapeHtml(qId)}"
                value="${this.escapeHtml(userVal)}"
                placeholder="${this.escapeHtml(q.placeholder || 'Ihre Antwort eingeben...')}"
                ${isReviewMode ? 'disabled' : ''}
              />
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 11. FORM (MULTI-FIELD FORMULAR)
      if (type === "form") {
        const fields = Array.isArray(q.fields) ? q.fields : (opts.material?.fields || []);

        return `
          <div class="${blockClass} exam-form-container" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="exam-form-header">${this.escapeHtml(q.question || q.title || "Formular ausfüllen")}</div>
            <div class="exam-form-grid">
              ${fields.map((field) => {
                const fId = String(field.id || field.name);
                const fieldKey = `${qId}__${fId}`;
                const userVal = userAnswers[fieldKey] || (typeof userAnswers[qId] === "object" ? userAnswers[qId]?.[fId] : "") || "";
                return `
                  <div class="exam-form-row">
                    <label class="exam-form-label">${this.escapeHtml(field.label || field.name)}:</label>
                    <div>
                      <input
                        type="text"
                        class="exam-form-field-input"
                        id="form-input-${this.escapeHtml(fieldKey)}"
                        data-question-id="${this.escapeHtml(qId)}"
                        data-field-id="${this.escapeHtml(fId)}"
                        value="${this.escapeHtml(userVal)}"
                        placeholder="${this.escapeHtml(field.placeholder || '')}"
                        ${isReviewMode ? 'disabled' : ''}
                      />
                      <div class="exam-form-field-corr" id="corr-${this.escapeHtml(fieldKey)}" hidden></div>
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      // 12. LONG TEXT (WRITING)
      if (type === "long_text") {
        const userText = userAnswers[qId] || "";
        const situation = q.task?.situation || opts.material?.task?.situation || "";
        const aufgabe = q.task?.aufgabe || opts.material?.task?.aufgabe || "";
        const points = q.task?.leitpunkte || opts.material?.task?.leitpunkte || [];
        const wordLimits = q.task?.word_count || opts.material?.task?.word_count || { minimum: 30, maximum: 120 };

        return `
          <div class="${blockClass} mock-schreiben-container" id="exam-q-block-${this.escapeHtml(qId)}">
            ${headerHtml}
            <div class="mock-prompt-card">
              <span class="mock-prompt-badge">Schreibaufgabe</span>
              <h2 class="mock-prompt-title">${this.escapeHtml(q.title || opts.material?.title || "Schriftlicher Ausdruck")}</h2>
              ${situation ? `<div class="mock-prompt-situation">${this.escapeHtml(situation)}</div>` : ''}
              ${aufgabe ? `<p style="font-size:0.92rem; font-weight:600; margin:0 0 10px;">${this.escapeHtml(aufgabe)}</p>` : ''}
              ${points.length > 0 ? `
                <div class="mock-prompt-points-title">Punkte der Aufgabe:</div>
                <ul class="mock-prompt-points">
                  ${points.map(p => `<li>${this.escapeHtml(p)}</li>`).join("")}
                </ul>
              ` : ''}
            </div>

            <div class="mock-editor-card">
              <div class="mock-editor-header">
                <span class="mock-editor-title">Ihre Antwort:</span>
                <span class="mock-word-counter" id="word-counter-${this.escapeHtml(qId)}">0 / ${wordLimits.maximum || 120} Wörter</span>
              </div>
              <textarea
                class="mock-textarea"
                id="textarea-${this.escapeHtml(qId)}"
                data-question-id="${this.escapeHtml(qId)}"
                data-min-words="${wordLimits.minimum || 0}"
                data-max-words="${wordLimits.maximum || 999}"
                placeholder="Schreiben Sie hier Ihren Text auf Deutsch..."
                ${isReviewMode ? 'disabled' : ''}
              >${this.escapeHtml(userText)}</textarea>
            </div>
            <div class="exam-review-feedback" id="feedback-${this.escapeHtml(qId)}" hidden></div>
          </div>
        `;
      }

      return "";
    },

    /* ============================================================
     * 4. EVENT BINDING ENGINE
     * ============================================================ */
    bindEvents: function (root, onAnswerChange) {
      if (!root || typeof onAnswerChange !== "function") return;

      // 1. Radio inputs
      const radios = root.querySelectorAll('input[type="radio"]');
      radios.forEach(radio => {
        radio.addEventListener("change", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const val = e.target.getAttribute("data-option-value") || e.target.value;
          
          const parentList = e.target.closest(".mock-options-list, .exam-radio-list");
          if (parentList) {
            parentList.querySelectorAll(".mock-option-label, .exam-radio-item").forEach(l => l.classList.remove("selected"));
          }
          const label = e.target.closest("label");
          if (label) label.classList.add("selected");

          onAnswerChange(qId, val, e);
        });
      });

      // 2. Checkboxes (Multiple Choice)
      const checkboxes = root.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.addEventListener("change", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const block = e.target.closest(".exam-q-block, .mock-q-card");
          const label = e.target.closest("label");
          if (label) {
            label.classList.toggle("selected", e.target.checked);
          }

          if (block) {
            const checkedVals = Array.from(block.querySelectorAll('input[type="checkbox"]:checked'))
              .map(input => input.getAttribute("data-option-value") || input.value);
            onAnswerChange(qId, checkedVals, e);
          }
        });
      });

      // 3. Dropdown selects (Matching, Sentence Insertion, Heading Matching)
      const selects = root.querySelectorAll(".exam-matching-select");
      selects.forEach(select => {
        select.addEventListener("change", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const val = e.target.value;
          e.target.classList.toggle("selected", Boolean(val));
          onAnswerChange(qId, val, e);
        });
      });

      // 4. True/False & Yes/No Toggle Buttons
      const tfButtons = root.querySelectorAll(".exam-tf-btn");
      tfButtons.forEach(btn => {
        btn.addEventListener("click", (e) => {
          const qId = btn.getAttribute("data-question-id");
          const val = btn.getAttribute("data-option-value");
          const parent = btn.closest(".exam-tf-group");
          if (parent) {
            parent.querySelectorAll(".exam-tf-btn").forEach(b => b.classList.remove("selected"));
          }
          btn.classList.add("selected");
          onAnswerChange(qId, val, e);
        });
      });

      // 5. Image Matching Cards
      const imgCards = root.querySelectorAll(".exam-img-card");
      imgCards.forEach(card => {
        card.addEventListener("click", (e) => {
          const qId = card.getAttribute("data-question-id");
          const val = card.getAttribute("data-option-value");
          const grid = card.closest(".exam-img-grid");
          if (grid) {
            grid.querySelectorAll(".exam-img-card").forEach(c => c.classList.remove("selected"));
          }
          card.classList.add("selected");
          onAnswerChange(qId, val, e);
        });
      });

      // 6. Text Inputs (Short answer)
      const textInputs = root.querySelectorAll(".exam-text-input");
      textInputs.forEach(input => {
        input.addEventListener("input", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const val = e.target.value;
          onAnswerChange(qId, val, e);
        });
      });

      // 7. Form Fields (Formular)
      const formInputs = root.querySelectorAll(".exam-form-field-input");
      formInputs.forEach(input => {
        input.addEventListener("input", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const fId = e.target.getAttribute("data-field-id");
          const val = e.target.value;
          onAnswerChange(`${qId}__${fId}`, val, e);
        });
      });

      // 8. Long Text Textarea (Schreiben)
      const textareas = root.querySelectorAll(".mock-textarea");
      textareas.forEach(ta => {
        ta.addEventListener("input", (e) => {
          const qId = e.target.getAttribute("data-question-id");
          const val = e.target.value;
          const words = val.trim() ? val.trim().split(/\s+/).filter(Boolean) : [];
          const count = words.length;

          const minWords = parseInt(ta.getAttribute("data-min-words") || "0", 10);
          const maxWords = parseInt(ta.getAttribute("data-max-words") || "999", 10);
          const pill = document.getElementById(`word-counter-${qId}`);

          if (pill) {
            if (count > maxWords) {
              pill.className = "mock-word-counter mock-word-pill-error";
              pill.textContent = `${count} / ${maxWords} Wörter (Limit überschritten)`;
            } else if (minWords > 0 && count >= minWords) {
              pill.className = "mock-word-counter target-met";
              pill.textContent = `${count} / ${maxWords} Wörter (Ziel erreicht)`;
            } else {
              pill.className = "mock-word-counter";
              pill.textContent = `${count} / ${maxWords} Wörter`;
            }
          }

          onAnswerChange(qId, val, e);
        });
      });
    },

    /* ============================================================
     * 5. UNIVERSAL EVALUATION ENGINE
     * ============================================================ */
    evaluateQuestion: function (q, userAnswers = {}) {
      const qId = String(q.id || "q");
      const type = this.detectQuestionType(q);
      const userVal = userAnswers[qId];

      // 1. Unsupported or Long Text (AI Evaluated)
      if (type === "unsupported" || type === "long_text") {
        return {
          isCorrect: true,
          earnedScore: 0,
          maxScore: 0,
          userAnswer: userVal,
          correctAnswer: null,
          feedbackText: "Not scored objectively."
        };
      }

      // 2. FORM (Multi-field scoring)
      if (type === "form") {
        const fields = Array.isArray(q.fields) ? q.fields : [];
        let correctFieldsCount = 0;
        const fieldResults = {};

        fields.forEach(f => {
          const fId = String(f.id || f.name);
          const fieldKey = `${qId}__${fId}`;
          const rawUserVal = userAnswers[fieldKey] || (typeof userVal === "object" ? userVal?.[fId] : "") || "";
          const accepted = Array.isArray(f.acceptedAnswers)
            ? f.acceptedAnswers
            : (f.correctAnswer !== undefined ? [String(f.correctAnswer)] : []);

          const isFCorrect = accepted.some(ans => this.normalizeText(rawUserVal) === this.normalizeText(ans));
          if (isFCorrect) correctFieldsCount++;

          fieldResults[fId] = {
            isCorrect: isFCorrect,
            userVal: rawUserVal,
            correctAnswer: f.correctAnswer || accepted[0] || ""
          };
        });

        const maxFields = Math.max(1, fields.length);
        const allCorrect = correctFieldsCount === maxFields;

        return {
          isCorrect: allCorrect,
          earnedScore: correctFieldsCount,
          maxScore: maxFields,
          userAnswer: userVal,
          correctAnswer: fields.map(f => `${f.label}: ${f.correctAnswer}`).join(", "),
          fieldResults: fieldResults,
          explanation: q.explanation || ""
        };
      }

      // 3. MULTIPLE CHOICE (Checkboxes)
      if (type === "multiple_choice") {
        const userArr = Array.isArray(userVal) ? userVal : (userVal ? [String(userVal)] : []);
        const correctArr = Array.isArray(q.correctAnswer) ? q.correctAnswer : [String(q.correctAnswer || "")];

        const normUser = userArr.map(v => this.normalizeText(v)).sort();
        const normCorrect = correctArr.map(v => this.normalizeText(v)).sort();

        const isExactMatch = normUser.length === normCorrect.length &&
          normUser.every((val, i) => val === normCorrect[i]);

        return {
          isCorrect: isExactMatch,
          earnedScore: isExactMatch ? 1 : 0,
          maxScore: 1,
          userAnswer: userArr,
          correctAnswer: correctArr.join(", "),
          explanation: q.explanation || ""
        };
      }

      // 4. TEXT INPUT (Normalized text check)
      if (type === "text_input") {
        const accepted = Array.isArray(q.acceptedAnswers)
          ? q.acceptedAnswers
          : (q.correctAnswer !== undefined ? [String(q.correctAnswer)] : []);

        const isMatch = accepted.some(ans => this.normalizeText(userVal) === this.normalizeText(ans));

        return {
          isCorrect: isMatch,
          earnedScore: isMatch ? 1 : 0,
          maxScore: 1,
          userAnswer: userVal || "(empty)",
          correctAnswer: q.correctAnswer || accepted[0] || "",
          explanation: q.explanation || ""
        };
      }

      // 5. OBJECTIVE SINGLE VALUE MATCH (Single Choice, True/False, Yes/No, Matching, Sentences, Headings, Persons, Images)
      const correctVal = this.getOptionValue(q.correctAnswer);
      const userNorm = this.normalizeText(userVal);
      const correctNorm = this.normalizeText(correctVal);

      // Support matching code or full text
      const isCorrect = Boolean(userNorm && (
        userNorm === correctNorm ||
        (correctVal.length <= 2 && userNorm.startsWith(correctNorm)) ||
        (userVal && String(userVal).trim() === String(correctVal).trim())
      ));

      return {
        isCorrect: isCorrect,
        earnedScore: isCorrect ? 1 : 0,
        maxScore: 1,
        userAnswer: userVal || "(keine Antwort)",
        correctAnswer: this.getOptionLabel(q.correctAnswer),
        explanation: q.explanation || ""
      };
    },

    /* ============================================================
     * 6. POST-SUBMISSION REVIEW FEEDBACK RENDERER
     * ============================================================ */
    renderReviewFeedback: function (q, userAnswers = {}, showExplanations = true) {
      const evalRes = this.evaluateQuestion(q, userAnswers);
      const explHtml = (showExplanations && evalRes.explanation)
        ? `<div style="margin-top:6px; font-size:0.82rem; opacity:0.9;"><strong>Hinweis:</strong> ${this.escapeHtml(evalRes.explanation)}</div>`
        : "";

      if (evalRes.isCorrect) {
        return `
          <div class="exam-review-feedback feedback-correct" style="margin-top:12px; padding:10px 14px; border-radius:6px; background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; font-size:0.86rem; line-height:1.5;">
            <strong>✓ Richtig (Correct)!</strong>
            ${evalRes.maxScore > 1 ? ` (${evalRes.earnedScore} / ${evalRes.maxScore} Punkte)` : ''}
            ${explHtml}
          </div>
        `;
      } else {
        return `
          <div class="exam-review-feedback feedback-incorrect" style="margin-top:12px; padding:10px 14px; border-radius:6px; background:#fff1f2; border:1px solid #fecdd3; color:#9f1239; font-size:0.86rem; line-height:1.5;">
            <strong>✗ Falsch (Incorrect).</strong>
            ${evalRes.maxScore > 1 ? ` (${evalRes.earnedScore} / ${evalRes.maxScore} Punkte). ` : ' '}
            Richtige Antwort: <strong>${this.escapeHtml(evalRes.correctAnswer)}</strong>.
            ${explHtml}
          </div>
        `;
      }
    },

    /* ============================================================
     * 7. LISTENING AUDIO PLAYBACK CONTROLLER
     * ============================================================ */
    setupAudioPlaybackControl: function (audioEl, material, badgeEl = null) {
      if (!audioEl || !material) return;

      const maxPlays = parseInt(
        material.playbackCount ||
        material.max_plays ||
        material.playback_count ||
        material.audio_plays ||
        material.audioPlays ||
        "0",
        10
      );

      // If no play count restriction is specified by material, keep unrestricted
      if (!maxPlays || isNaN(maxPlays) || maxPlays <= 0) {
        if (badgeEl) badgeEl.style.display = "none";
        return;
      }

      let currentPlays = 0;
      const autoReplay = Boolean(material.auto_replay || material.autoReplay);

      const updateBadge = () => {
        if (!badgeEl) return;
        badgeEl.style.display = "inline-flex";
        if (currentPlays >= maxPlays) {
          badgeEl.className = "exam-audio-play-badge completed";
          badgeEl.innerHTML = `<i data-lucide="check-circle" style="width:12px;height:12px;"></i> Audio beendet (${currentPlays}/${maxPlays} abgespielt)`;
        } else {
          badgeEl.className = "exam-audio-play-badge";
          badgeEl.innerHTML = `<i data-lucide="headphones" style="width:12px;height:12px;"></i> ${maxPlays}× Wiedergabe (${currentPlays}/${maxPlays} abgespielt)`;
        }
        if (window.lucide) window.lucide.createIcons();
      };

      updateBadge();

      audioEl.addEventListener("ended", () => {
        currentPlays += 1;
        updateBadge();

        if (currentPlays < maxPlays) {
          if (autoReplay) {
            setTimeout(() => {
              audioEl.currentTime = 0;
              audioEl.play().catch(() => {});
            }, 2000);
          }
        } else {
          // Play limit reached
          audioEl.pause();
          audioEl.controls = false;
        }
      });
    }
  };

  // Expose to window
  window.QuestionRenderer = QuestionRenderer;
})();
