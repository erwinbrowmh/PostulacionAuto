/**
 * PostulacionAuto Hub v2.0 — Main Controller
 * - ATS Search Engine v2
 * - Advanced client-side filters (chips, sort, live search)
 * - Toast notification system
 * - Onboarding wizard
 * - Header live metrics
 * - Skeleton screens
 * - Skills editor with recalc
 * - ATS Analysis tab
 * - Cover letter generator
 */

(function () {
  "use strict";

  const API_URL = "";       // Flask same-origin
  const STORAGE_PROFILE  = "pah_profile_v2";
  const STORAGE_SAVED    = "pah_saved_jobs";
  const STORAGE_DISCARDED = "pah_discarded_jobs";
  const STORAGE_OB       = "pah_onboarding_done";

  // ── State ─────────────────────────────────────────────────
  let activeProfile = null;
  let currentJobs = [];
  let currentModalJob = null;
  let savedJobIds = [];
  let discardedJobIds = [];
  let activeChips = { modality: ["remoto","hibrido","presencial"], level: ["junior","semi","senior","lead"] };

  // ── DOM refs ──────────────────────────────────────────────
  const searchBtn      = document.getElementById("search-btn");
  const searchKeywords = document.getElementById("search-keywords");
  const searchType     = document.getElementById("search-type");
  const searchLoc      = document.getElementById("search-loc-input");
  const maxResults     = document.getElementById("max-results");
  const rangeVal       = document.getElementById("range-val");
  const searchLoader   = document.getElementById("search-loader");
  const emptyState     = document.getElementById("empty-state");
  const jobsContainer  = document.getElementById("jobs-container");
  const resultsSummary = document.getElementById("results-summary");
  const resultsActionsBar = document.getElementById("results-actions-bar");
  const exportBtn      = document.getElementById("export-btn");
  const jobModal       = document.getElementById("job-modal");
  const modalClose     = document.getElementById("modal-close");
  const modalTitle     = document.getElementById("modal-title");
  const modalCompany   = document.getElementById("modal-company");
  const modalLocation  = document.getElementById("modal-location");
  const modalSalary    = document.getElementById("modal-salary");
  const modalDate      = document.getElementById("modal-date");
  const modalScore     = document.getElementById("modal-score");
  const modalDescText  = document.getElementById("modal-desc-text");
  const modalApplyLink = document.getElementById("modal-apply-link");
  const modalSourceBadge = document.getElementById("modal-source-badge");
  const modalMatchedSkills = document.getElementById("modal-matched-skills");
  const modalSaveBtn   = document.getElementById("modal-save-btn");

  const filterScore    = document.getElementById("filter-score");
  const filterScoreVal = document.getElementById("filter-score-val");
  const filterSalary   = document.getElementById("filter-salary");
  const filterSort     = document.getElementById("filter-sort");
  const filterLiveSearch = document.getElementById("filter-live-search");
  const toggleHideDiscarded = document.getElementById("toggle-hide-discarded");
  const toggleOnlySaved     = document.getElementById("toggle-only-saved");

  const statsCard      = document.getElementById("results-stats-card");
  const statTotal      = document.getElementById("stat-total");
  const statAvgMatch   = document.getElementById("stat-avg-match");
  const statHighMatch  = document.getElementById("stat-high-match");
  const statSkillsCount = document.getElementById("stat-skills-count");
  const statsBars      = document.getElementById("stats-dist-bars");

  const hmJobsCount    = document.getElementById("hm-jobs-count");
  const hmAvgScore     = document.getElementById("hm-avg-score");
  const hmSavedCount   = document.getElementById("hm-saved-count");

  const candName       = document.getElementById("cand-name");
  const candTitle      = document.getElementById("cand-title");
  const candEmail      = document.getElementById("cand-email");
  const candPhone      = document.getElementById("cand-phone");
  const candLocation   = document.getElementById("cand-location");
  const candLinkedin   = document.getElementById("cand-linkedin");
  const candGithub     = document.getElementById("cand-github");
  const skillsContainer = document.getElementById("skills-container");
  const cvUploadZone   = document.getElementById("cv-upload-zone");
  const cvFileInput    = document.getElementById("cv-file-input");
  const toggleEditSkillsBtn = document.getElementById("toggle-edit-skills");
  const addSkillForm   = document.getElementById("add-skill-form");
  const addSkillBtn    = document.getElementById("add-skill-btn");
  const newSkillName   = document.getElementById("new-skill-name");
  const newSkillCategory = document.getElementById("new-skill-category");

  // ══════════════════════════════════════════════════════════
  //  TOAST SYSTEM
  // ══════════════════════════════════════════════════════════
  const toastContainer = document.getElementById("toast-container");

  function showToast(type, title, msg, duration = 4000) {
    const icons = { success: "fa-check-circle", error: "fa-circle-xmark", info: "fa-circle-info", warning: "fa-triangle-exclamation" };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("removing");
      toast.addEventListener("animationend", () => toast.remove());
    }, duration);
  }

  // ══════════════════════════════════════════════════════════
  //  SKELETON SCREENS
  // ══════════════════════════════════════════════════════════
  function showSkeletonCards(count = 6) {
    jobsContainer.innerHTML = "";
    jobsContainer.classList.remove("hidden");
    emptyState.classList.add("hidden");
    for (let i = 0; i < count; i++) {
      const s = document.createElement("div");
      s.className = "skeleton-card";
      s.style.animationDelay = `${i * 60}ms`;
      s.innerHTML = `
        <div class="skel-header">
          <div class="skel-title">
            <div class="skeleton skel-line w-80"></div>
            <div class="skeleton skel-line w-55"></div>
          </div>
          <div class="skeleton skel-score"></div>
        </div>
        <div class="skel-meta">
          <div class="skeleton skel-chip w-30"></div>
          <div class="skeleton skel-chip w-20"></div>
          <div class="skeleton skel-chip w-25"></div>
        </div>
        <div class="skeleton skel-line w-80" style="height: 10px;"></div>
        <div class="skeleton skel-line w-40" style="height: 10px;"></div>`;
      jobsContainer.appendChild(s);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  PROFILE RENDERING
  // ══════════════════════════════════════════════════════════
  function renderProfile(profile) {
    if (!profile) return;
    activeProfile = profile;
    candName.textContent      = profile.name || "Sin nombre";
    candTitle.textContent     = profile.title || "Sin título";
    candEmail.textContent     = profile.email || "Sin email";
    candPhone.textContent     = profile.phone || "Sin teléfono";
    candLocation.textContent  = profile.location || "Sin ubicación";

    if (profile.linkedin) {
      candLinkedin.href = profile.linkedin.startsWith("http") ? profile.linkedin : `https://${profile.linkedin}`;
    }
    if (profile.github) {
      candGithub.href = profile.github.startsWith("http") ? profile.github : `https://github.com/${profile.github}`;
    }

    renderSkills(profile.skills || {});
    saveProfileToStorage(profile);
    updateStatSkillsCount(profile);
  }

  function updateStatSkillsCount(profile) {
    const flat = profile.all_skills_flat || [];
    if (statSkillsCount) statSkillsCount.textContent = flat.length;
  }

  function renderSkills(skillsObj) {
    const catLabels = {
      languages: "Lenguajes", backend: "Backend / Frameworks",
      infrastructure: "Infraestructura", security: "Seguridad",
      iot: "IoT / Hardware", management: "Gestión"
    };
    skillsContainer.innerHTML = "";
    for (const [cat, skills] of Object.entries(skillsObj)) {
      if (!skills || skills.length === 0) continue;
      const catEl = document.createElement("div");
      catEl.className = "skill-category-box";
      catEl.innerHTML = `<div class="category-name">${catLabels[cat] || cat}</div>`;
      const badgesEl = document.createElement("div");
      badgesEl.className = "skills-badges";
      skills.forEach(skill => {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = skill;
        b.dataset.skill = skill;
        b.dataset.cat = cat;
        if (skillsContainer.classList.contains("edit-mode")) {
          b.addEventListener("click", () => removeSkill(cat, skill));
        }
        badgesEl.appendChild(b);
      });
      catEl.appendChild(badgesEl);
      skillsContainer.appendChild(catEl);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SKILLS EDITOR
  // ══════════════════════════════════════════════════════════
  function initSkillsEditor() {
    toggleEditSkillsBtn.addEventListener("click", () => {
      const isEdit = skillsContainer.classList.toggle("edit-mode");
      toggleEditSkillsBtn.classList.toggle("active", isEdit);
      addSkillForm.classList.toggle("hidden", !isEdit);
      if (isEdit) {
        toggleEditSkillsBtn.title = "Salir del modo edición";
        renderSkillsEditMode();
      } else {
        toggleEditSkillsBtn.title = "Editar habilidades";
        renderSkills(activeProfile.skills || {});
      }
    });

    addSkillBtn.addEventListener("click", () => {
      const skill = newSkillName.value.trim();
      const cat   = newSkillCategory.value;
      if (!skill) return;
      if (!activeProfile.skills[cat]) activeProfile.skills[cat] = [];
      if (!activeProfile.skills[cat].includes(skill)) {
        activeProfile.skills[cat].push(skill);
        activeProfile.all_skills_flat = flattenSkills(activeProfile.skills);
        newSkillName.value = "";
        renderSkillsEditMode();
        saveProfileToStorage(activeProfile);
        syncProfileToBackend();
        recalculateMatchScoresClientSide();
        showToast("success", "Habilidad añadida", `"${skill}" agregada a ${cat}. Los match scores se actualizaron.`);
      } else {
        showToast("warning", "Ya existe", `"${skill}" ya está en tu perfil.`);
      }
    });

    newSkillName.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addSkillBtn.click();
    });
  }

  function renderSkillsEditMode() {
    const catLabels = {
      languages: "Lenguajes", backend: "Backend / Frameworks",
      infrastructure: "Infraestructura", security: "Seguridad",
      iot: "IoT / Hardware", management: "Gestión"
    };
    skillsContainer.innerHTML = "";
    for (const [cat, skills] of Object.entries(activeProfile.skills || {})) {
      if (!skills || skills.length === 0) continue;
      const catEl = document.createElement("div");
      catEl.className = "skill-category-box";
      catEl.innerHTML = `<div class="category-name">${catLabels[cat] || cat}</div>`;
      const badgesEl = document.createElement("div");
      badgesEl.className = "skills-badges";
      skills.forEach(skill => {
        const b = document.createElement("span");
        b.className = "badge";
        b.textContent = skill;
        b.style.cursor = "pointer";
        b.addEventListener("click", () => removeSkill(cat, skill));
        badgesEl.appendChild(b);
      });
      catEl.appendChild(badgesEl);
      skillsContainer.appendChild(catEl);
    }
    skillsContainer.classList.add("edit-mode");
  }

  function removeSkill(cat, skill) {
    if (!activeProfile.skills[cat]) return;
    activeProfile.skills[cat] = activeProfile.skills[cat].filter(s => s !== skill);
    activeProfile.all_skills_flat = flattenSkills(activeProfile.skills);
    renderSkillsEditMode();
    saveProfileToStorage(activeProfile);
    syncProfileToBackend();
    recalculateMatchScoresClientSide();
    showToast("info", "Habilidad eliminada", `"${skill}" removida del perfil.`);
  }

  function flattenSkills(skillsObj) {
    return Object.values(skillsObj).flat();
  }

  // ══════════════════════════════════════════════════════════
  //  PROFILE PERSISTENCE & SYNC
  // ══════════════════════════════════════════════════════════
  function saveProfileToStorage(profile) {
    try { localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile)); } catch (e) {}
  }

  function loadProfileFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function syncProfileToBackend() {
    if (!activeProfile) return;
    try {
      await fetch(`${API_URL}/api/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeProfile)
      });
    } catch (e) { /* fail silently */ }
  }

  async function loadProfile() {
    // 1. Try localStorage
    const cached = loadProfileFromStorage();
    if (cached) {
      renderProfile(cached);
      return;
    }
    // 2. Fetch from API
    try {
      const res = await fetch(`${API_URL}/api/profile`);
      const json = await res.json();
      if (json.status === "success" && json.data) {
        renderProfile(json.data);
      }
    } catch (e) {
      showToast("warning", "Sin conexión", "No se pudo cargar el perfil del servidor.");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CV UPLOAD
  // ══════════════════════════════════════════════════════════
  function initUpload() {
    cvUploadZone.addEventListener("click", () => {
      if (!cvUploadZone.classList.contains("processing")) cvFileInput.click();
    });
    cvFileInput.addEventListener("change", () => {
      if (cvFileInput.files[0]) uploadCV(cvFileInput.files[0]);
    });
    cvUploadZone.addEventListener("dragover", (e) => { e.preventDefault(); cvUploadZone.classList.add("dragover"); });
    cvUploadZone.addEventListener("dragleave", () => cvUploadZone.classList.remove("dragover"));
    cvUploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      cvUploadZone.classList.remove("dragover");
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".pdf")) uploadCV(file);
      else showToast("error", "Formato inválido", "Solo se aceptan archivos PDF.");
    });
  }

  async function uploadCV(file) {
    cvUploadZone.classList.add("processing");
    cvUploadZone.querySelector(".upload-icon").className = "fa-solid fa-circle-notch fa-spin upload-icon";
    showToast("info", "Procesando CV", "Analizando tu currículum con el motor ATS...");

    const formData = new FormData();
    formData.append("cv", file);
    try {
      const res  = await fetch(`${API_URL}/api/upload-cv`, { method: "POST", body: formData });
      const json = await res.json();
      if (json.status === "success") {
        renderProfile(json.data);
        const skills = json.data.all_skills_flat || [];
        showToast("success", "CV procesado", `Se detectaron ${skills.length} habilidades. ¡Listo para buscar!`);
        localStorage.removeItem(STORAGE_OB);
      } else {
        showToast("error", "Error al procesar", json.message || "Intenta con otro archivo.");
      }
    } catch {
      showToast("error", "Sin conexión", "No se pudo conectar con el servidor Flask.");
    } finally {
      cvUploadZone.classList.remove("processing");
      cvUploadZone.querySelector(".upload-icon").className = "fa-solid fa-cloud-arrow-up upload-icon";
    }
  }

  // ══════════════════════════════════════════════════════════
  //  SEARCH
  // ══════════════════════════════════════════════════════════
  function initSearch() {
    maxResults.addEventListener("input", () => { rangeVal.textContent = maxResults.value; });
    searchBtn.addEventListener("click", performSearch);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target === searchKeywords) performSearch();
    });
  }

  let stepInterval = null;

  function startStepLoader() {
    const steps = ["step-init", "step-li", "step-occ", "step-ct", "step-gb", "step-ats"];
    let idx = 0;
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.classList.remove("active", "completed"); el.querySelector(".step-icon").className = "fa-regular fa-circle step-icon"; }
    });
    const advance = () => {
      if (idx > 0 && steps[idx - 1]) {
        const prev = document.getElementById(steps[idx - 1]);
        if (prev) { prev.classList.remove("active"); prev.classList.add("completed"); prev.querySelector(".step-icon").className = "fa-solid fa-circle-check step-icon"; }
      }
      if (idx < steps.length) {
        const cur = document.getElementById(steps[idx]);
        if (cur) { cur.classList.add("active"); cur.querySelector(".step-icon").className = "fa-solid fa-circle-notch fa-spin step-icon"; }
        idx++;
      }
    };
    advance();
    stepInterval = setInterval(advance, 2800);
  }

  function stopStepLoader() {
    if (stepInterval) { clearInterval(stepInterval); stepInterval = null; }
  }

  async function performSearch() {
    const keywords = searchKeywords.value.trim();
    const location = searchLoc.value.trim() || "México";
    const max      = parseInt(maxResults.value) || 20;

    searchBtn.disabled = true;
    searchBtn.querySelector(".btn-content").classList.add("hidden");
    searchBtn.querySelector(".btn-loader").classList.remove("hidden");
    emptyState.classList.add("hidden");
    jobsContainer.classList.add("hidden");
    statsCard.classList.add("hidden");
    resultsActionsBar.classList.add("hidden");
    searchLoader.classList.remove("hidden");
    resultsSummary.innerHTML = "Buscando vacantes con motor ATS v2...";

    showSkeletonCards(6);
    jobsContainer.classList.remove("hidden");
    startStepLoader();

    const queryParams = new URLSearchParams();
    if (keywords) queryParams.set("keywords", keywords);
    queryParams.set("location", location);
    queryParams.set("max_results", max);

    try {
      const res  = await fetch(`${API_URL}/api/search?${queryParams.toString()}`);
      const json = await res.json();

      stopStepLoader();
      searchLoader.classList.add("hidden");
      searchBtn.disabled = false;
      searchBtn.querySelector(".btn-content").classList.remove("hidden");
      searchBtn.querySelector(".btn-loader").classList.add("hidden");

      if (json.status === "success" && json.data.length > 0) {
        currentJobs = json.data;
        resultsActionsBar.classList.remove("hidden");
        statsCard.classList.remove("hidden");
        resetFilterInputs();
        applyClientFilters();
        showToast("success", "Búsqueda completada", `Se analizaron ${currentJobs.length} vacantes con ATS v2.`);
        updateHeaderMetrics();
      } else {
        currentJobs = [];
        jobsContainer.innerHTML = "";
        jobsContainer.classList.add("hidden");
        resultsSummary.innerHTML = "No se encontraron vacantes con las palabras clave especificadas.";
        emptyState.querySelector("h3").textContent = "Sin resultados";
        emptyState.querySelector("p").textContent  = "Prueba con otras palabras clave o modifica la ubicación.";
        emptyState.classList.remove("hidden");
        showToast("warning", "Sin resultados", "Intenta ampliar las palabras clave o la ubicación.");
      }
    } catch (err) {
      console.error(err);
      stopStepLoader();
      searchLoader.classList.add("hidden");
      searchBtn.disabled = false;
      searchBtn.querySelector(".btn-content").classList.remove("hidden");
      searchBtn.querySelector(".btn-loader").classList.add("hidden");
      jobsContainer.innerHTML = "";
      jobsContainer.classList.add("hidden");
      resultsSummary.textContent = "Error de conexión.";
      emptyState.querySelector("h3").textContent = "Error de Conexión";
      emptyState.querySelector("p").textContent  = "Asegúrate de que el servidor Flask esté activo en localhost:5000.";
      emptyState.classList.remove("hidden");
      showToast("error", "Error de conexión", "¿El servidor Flask está encendido en puerto 5000?");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  RENDER JOBS
  // ══════════════════════════════════════════════════════════
  function renderJobsList(jobs) {
    jobsContainer.innerHTML = "";

    if (jobs.length === 0) {
      jobsContainer.innerHTML = `
        <div class="empty-container" style="padding: 3rem; background: none; border: none; grid-column: 1/-1;">
          <div class="empty-icon"><i class="fa-solid fa-filter-circle-xmark"></i></div>
          <h3>Sin resultados</h3>
          <p>Ningún empleo coincide con los filtros aplicados. Relaja los criterios.</p>
        </div>`;
      return;
    }

    jobsContainer.classList.remove("hidden");
    emptyState.classList.add("hidden");

    jobs.forEach((job, i) => {
      const isSaved     = savedJobIds.includes(job.id);
      const isDiscarded = discardedJobIds.includes(job.id);
      const score       = job.match_score || 0;
      const superMatch  = score >= 80;
      const highMatch   = score >= 65;
      const midMatch    = score >= 45;

      // Color for bar fill
      const barColor = score >= 70
        ? "linear-gradient(90deg, #34d399 0%, #22d3ee 100%)"
        : score >= 50
        ? "linear-gradient(90deg, #fbbf24 0%, #f97316 100%)"
        : "linear-gradient(90deg, #f87171 0%, #fb923c 100%)";

      const scoreColor = score >= 70 ? "var(--green)" : score >= 50 ? "var(--amber)" : "var(--rose)";

      const sourceSlug = job.source.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');

      const card = document.createElement("div");
      card.className = `job-card ${superMatch ? 'super-match' : highMatch ? 'high-match' : ''} ${isDiscarded ? 'dimmed' : ''}`;
      card.id = `card-${job.id}`;
      card.style.animationDelay = `${i * 40}ms`;

      card.innerHTML = `
        <div class="job-card-header">
          <div class="job-title-block">
            <h4 class="job-card-title">
              ${job.title}
              ${superMatch ? `<span class="super-match-badge"><i class="fa-solid fa-fire"></i> Súper Match</span>` : ''}
            </h4>
            <div class="job-company">${job.company}</div>
          </div>
          <div class="match-score-block">
            <span class="match-percentage" style="background: ${barColor}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">${score}%</span>
            <span class="match-label">Match</span>
            <div class="match-bar-bg">
              <div class="match-bar-fill" style="width:${score}%; background:${barColor};"></div>
            </div>
          </div>
        </div>

        <div class="job-meta-row">
          <div class="meta-col"><i class="fa-solid fa-location-dot"></i> <span>${job.location}</span></div>
          <div class="meta-col"><i class="fa-solid fa-money-bill-wave"></i> <span>${job.salary}</span></div>
          <div class="meta-col"><i class="fa-solid fa-calendar"></i> <span>${job.date}</span></div>
          <div class="meta-col"><span class="badge platform-badge ${sourceSlug}">${job.source}</span></div>
        </div>

        ${job.matched_skills && job.matched_skills.length > 0 ? `
        <div class="job-skills-matched">
          <span class="matched-label">Coincide:</span>
          ${job.matched_skills.slice(0, 5).map(s => `<span class="skill-tag-matched">${s}</span>`).join('')}
          ${job.matched_skills.length > 5 ? `<span class="skill-tag-matched">+${job.matched_skills.length - 5}</span>` : ''}
        </div>` : ''}

        <div class="job-card-actions">
          <div class="action-left">
            <button class="icon-btn save-btn ${isSaved ? 'active-save' : ''}" title="Guardar">
              <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
            </button>
            <button class="icon-btn discard-btn ${isDiscarded ? 'active-discard' : ''}" title="${isDiscarded ? 'Restaurar' : 'Descartar'}">
              <i class="fa-solid ${isDiscarded ? 'fa-eye' : 'fa-eye-slash'}"></i>
            </button>
          </div>
          <button class="btn btn-secondary btn-sm details-btn">Ver Detalles</button>
        </div>`;

      // Events
      card.querySelector(".job-card-title").addEventListener("click", () => showJobDetails(job));
      card.querySelector(".details-btn").addEventListener("click", () => showJobDetails(job));
      card.querySelector(".save-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleSaveJob(job.id, card.querySelector(".save-btn")); });
      card.querySelector(".discard-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleDiscardJob(job.id, card, card.querySelector(".discard-btn")); });

      jobsContainer.appendChild(card);
    });

    updateHeaderMetrics();
  }

  // ══════════════════════════════════════════════════════════
  //  SAVE / DISCARD TOGGLES
  // ══════════════════════════════════════════════════════════
  function toggleSaveJob(id, btn) {
    const icon = btn.querySelector("i");
    if (savedJobIds.includes(id)) {
      savedJobIds = savedJobIds.filter(x => x !== id);
      btn.classList.remove("active-save");
      icon.className = "fa-regular fa-bookmark";
      showToast("info", "Guardado removido", "El empleo fue removido de guardados.");
    } else {
      savedJobIds.push(id);
      btn.classList.add("active-save");
      icon.className = "fa-solid fa-bookmark";
      showToast("success", "Empleo guardado", "Puedes ver tus guardados con el filtro correspondiente.");
      if (discardedJobIds.includes(id)) {
        discardedJobIds = discardedJobIds.filter(x => x !== id);
        const card = document.getElementById(`card-${id}`);
        if (card) {
          card.classList.remove("dimmed");
          const db = card.querySelector(".discard-btn");
          if (db) { db.classList.remove("active-discard"); db.querySelector("i").className = "fa-solid fa-eye-slash"; }
        }
      }
    }
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(savedJobIds));
    localStorage.setItem(STORAGE_DISCARDED, JSON.stringify(discardedJobIds));
    updateHeaderMetrics();
  }

  function toggleDiscardJob(id, card, btn) {
    const icon = btn.querySelector("i");
    if (discardedJobIds.includes(id)) {
      discardedJobIds = discardedJobIds.filter(x => x !== id);
      card.classList.remove("dimmed");
      btn.classList.remove("active-discard");
      icon.className = "fa-solid fa-eye-slash";
      btn.title = "Descartar";
    } else {
      discardedJobIds.push(id);
      card.classList.add("dimmed");
      btn.classList.add("active-discard");
      icon.className = "fa-solid fa-eye";
      btn.title = "Restaurar";
      if (savedJobIds.includes(id)) {
        savedJobIds = savedJobIds.filter(x => x !== id);
        const sb = card.querySelector(".save-btn");
        if (sb) { sb.classList.remove("active-save"); sb.querySelector("i").className = "fa-regular fa-bookmark"; }
      }
    }
    localStorage.setItem(STORAGE_SAVED, JSON.stringify(savedJobIds));
    localStorage.setItem(STORAGE_DISCARDED, JSON.stringify(discardedJobIds));
  }

  // ══════════════════════════════════════════════════════════
  //  CLIENT FILTERS
  // ══════════════════════════════════════════════════════════
  function initFilters() {
    filterScore.addEventListener("input", () => { filterScoreVal.textContent = `${filterScore.value}%`; applyClientFilters(); });
    filterSalary.addEventListener("input", applyClientFilters);
    filterSort.addEventListener("change", applyClientFilters);
    filterLiveSearch.addEventListener("input", applyClientFilters);
    toggleHideDiscarded.addEventListener("change", applyClientFilters);
    toggleOnlySaved.addEventListener("change", applyClientFilters);
    document.querySelectorAll(".platform-filter").forEach(cb => cb.addEventListener("change", applyClientFilters));

    // Filter chips
    document.querySelectorAll(".filter-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("active");
        const group = chip.dataset.group;
        const val   = chip.dataset.val;
        const groupArr = activeChips[group] || [];
        if (chip.classList.contains("active")) {
          if (!groupArr.includes(val)) groupArr.push(val);
        } else {
          activeChips[group] = groupArr.filter(v => v !== val);
        }
        activeChips[group] = [...new Set(groupArr.filter(v => chip.classList.contains("active") || v !== val))];
        applyClientFilters();
      });
    });
  }

  function resetFilterInputs() {
    filterScore.value = 0;
    filterScoreVal.textContent = "0%";
    filterSalary.value = "";
    filterSort.value = "match";
    filterLiveSearch.value = "";
    toggleHideDiscarded.checked = false;
    toggleOnlySaved.checked = false;
    document.querySelectorAll(".platform-filter").forEach(cb => cb.checked = true);
    document.querySelectorAll(".filter-chip").forEach(ch => ch.classList.add("active"));
    activeChips = { modality: ["remoto","hibrido","presencial"], level: ["junior","semi","senior","lead"] };
  }

  function applyClientFilters() {
    if (currentJobs.length === 0) return;

    const minScore     = parseInt(filterScore.value || 0);
    const minSalary    = parseFloat(filterSalary.value || 0);
    const sortBy       = filterSort.value;
    const liveQ        = (filterLiveSearch.value || "").toLowerCase().trim();
    const hideDiscard  = toggleHideDiscarded.checked;
    const onlySaved    = toggleOnlySaved.checked;
    const checkedPlats = [...document.querySelectorAll(".platform-filter:checked")].map(cb => cb.value);
    const STANDARD_PLATS = ["LinkedIn","OCC Mundial","Computrabajo","Get on Board","Infojobs"];

    let filtered = currentJobs.filter(job => {
      // Platform filter
      let platMatch = checkedPlats.includes(job.source);
      if (!platMatch && checkedPlats.includes("Google (Web)") && !STANDARD_PLATS.includes(job.source)) {
        platMatch = true;
      }
      if (!platMatch) return false;

      // Score filter
      if (job.match_score < minScore) return false;

      // Salary filter
      if (minSalary > 0) {
        const parsed = parseSalary(job.salary);
        if (parsed === 0 || parsed < minSalary) return false;
      }

      // Modality chips
      const titleLoc = (job.title + " " + job.location).toLowerCase();
      const modalityActive = activeChips.modality || [];
      if (modalityActive.length < 3) {
        const isRemote = /remoto|remote|home office|teletrabajo/i.test(titleLoc);
        const isHybrid = /h[íi]brido|hybrid/i.test(titleLoc);
        const isPresential = !isRemote && !isHybrid;
        const allowed =
          (isRemote     && modalityActive.includes("remoto")) ||
          (isHybrid     && modalityActive.includes("hibrido")) ||
          (isPresential && modalityActive.includes("presencial"));
        if (!allowed) return false;
      }

      // Level chips
      const levelActive = activeChips.level || [];
      if (levelActive.length < 4) {
        const t = job.title.toLowerCase();
        const isJunior = /junior|jr\.|entry|practicante|trainee/i.test(t);
        const isSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(t);
        const isSemi   = /semi|mid|pleno|ssr/i.test(t);
        const isLead   = /lead|l[íi]der|manager|director/i.test(t);
        const isGeneral = !isJunior && !isSenior && !isSemi && !isLead;
        const allowed =
          (isJunior   && levelActive.includes("junior")) ||
          (isSemi     && levelActive.includes("semi")) ||
          (isSenior   && levelActive.includes("senior")) ||
          (isLead     && levelActive.includes("lead")) ||
          (isGeneral);
        if (!allowed) return false;
      }

      // Live search
      if (liveQ) {
        const haystack = `${job.title} ${job.company} ${job.location} ${(job.matched_skills||[]).join(' ')}`.toLowerCase();
        if (!haystack.includes(liveQ)) return false;
      }

      // Hide discarded
      if (hideDiscard && discardedJobIds.includes(job.id)) return false;

      // Only saved
      if (onlySaved && !savedJobIds.includes(job.id)) return false;

      return true;
    });

    // Sort
    filtered = sortJobs(filtered, sortBy);

    // Update count in results summary
    resultsSummary.innerHTML = `Mostrando <strong>${filtered.length}</strong> de <strong>${currentJobs.length}</strong> vacantes analizadas.`;

    renderJobsList(filtered);
    updateStatistics(filtered);
  }

  function sortJobs(jobs, by) {
    return [...jobs].sort((a, b) => {
      if (by === "match")   return b.match_score - a.match_score;
      if (by === "salary")  return parseSalary(b.salary) - parseSalary(a.salary);
      if (by === "company") return (a.company||"").localeCompare(b.company||"");
      if (by === "date") {
        const rank = s => {
          if (/hoy|today|ahora/i.test(s)) return 0;
          if (/ayer|yesterday/i.test(s)) return 1;
          const m = s.match(/(\d+)/);
          return m ? parseInt(m[1]) : 999;
        };
        return rank(a.date) - rank(b.date);
      }
      return b.match_score - a.match_score;
    });
  }

  function parseSalary(s) {
    if (!s || /no especificado|ver en portal/i.test(s)) return 0;
    const clean = s.replace(/,/g, '').replace(/\s/g, '').toLowerCase();
    const m = clean.match(/\d+(\.\d+)?/);
    if (!m) return 0;
    let n = parseFloat(m[0]);
    if (/usd|dolar|dollar/i.test(clean)) n *= 18.5;
    return n;
  }

  // ══════════════════════════════════════════════════════════
  //  STATISTICS
  // ══════════════════════════════════════════════════════════
  function updateStatistics(jobs) {
    statTotal.textContent = jobs.length;
    if (jobs.length > 0) {
      const total = jobs.reduce((s, j) => s + j.match_score, 0);
      const avg   = Math.round(total / jobs.length);
      statAvgMatch.textContent  = `${avg}%`;
      statHighMatch.textContent = jobs.filter(j => j.match_score >= 70).length;
      hmAvgScore.textContent    = `${avg}%`;
    } else {
      statAvgMatch.textContent  = "0%";
      statHighMatch.textContent = "0";
    }

    // Distribution bars
    const counts = {};
    jobs.forEach(j => { counts[j.source] = (counts[j.source] || 0) + 1; });
    statsBars.innerHTML = "";
    const channels = ["LinkedIn","OCC Mundial","Computrabajo","Get on Board","Infojobs","Google (Web)"];
    const all = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    // Merge non-standard under Google
    const googleCount = jobs.filter(j => !["LinkedIn","OCC Mundial","Computrabajo","Get on Board","Infojobs"].includes(j.source)).length;
    const toShow = [...all.filter(([k]) => channels.includes(k))];
    if (googleCount > 0) toShow.push(["Google (Web)", googleCount]);

    toShow.slice(0, 6).forEach(([ch, count]) => {
      const pct  = jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0;
      const slug = ch.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');
      const el = document.createElement("div");
      el.className = "dist-bar-item";
      el.innerHTML = `
        <div class="dist-bar-meta">
          <span class="dist-name">${ch}</span>
          <span class="dist-count">${count} (${pct}%)</span>
        </div>
        <div class="dist-progress-bg">
          <div class="dist-progress-fill ${slug}" style="width:0%;" data-pct="${pct}"></div>
        </div>`;
      statsBars.appendChild(el);
      setTimeout(() => {
        const bar = el.querySelector(".dist-progress-fill");
        if (bar) bar.style.width = `${pct}%`;
      }, 100);
    });
  }

  function updateHeaderMetrics() {
    hmJobsCount.textContent  = currentJobs.length || "—";
    hmSavedCount.textContent = savedJobIds.length;
  }

  // ══════════════════════════════════════════════════════════
  //  CLIENT-SIDE ATS RECALCULATION
  // ══════════════════════════════════════════════════════════
  function recalculateMatchScoresClientSide() {
    if (!activeProfile || currentJobs.length === 0) return;
    const allSkills = activeProfile.all_skills_flat || [];

    currentJobs.forEach(job => {
      const title = (job.title || "").toLowerCase();
      const desc  = (job.description || "").toLowerCase();
      let score = 5;
      const matched = [];
      const primary = allSkills.slice(0, 6).map(s => s.toLowerCase());

      allSkills.forEach(skill => {
        const sl = skill.toLowerCase();
        const escaped = sl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = /[#\+\.\/]/.test(sl) ? new RegExp(escaped, 'i') : new RegExp(`\\b${escaped}\\b`, 'i');
        const isPrimary = primary.includes(sl);
        if (pattern.test(title)) {
          score += isPrimary ? 30 : 20;
          matched.push(skill);
        } else if (pattern.test(desc)) {
          score += isPrimary ? 10 : 6;
          matched.push(skill);
        }
      });
      job.match_score    = Math.min(score, 100);
      job.matched_skills = [...new Set(matched)];
    });

    currentJobs.sort((a, b) => b.match_score - a.match_score);
    applyClientFilters();
    showToast("success", "Scores recalculados", "Los porcentajes de match fueron actualizados con tu perfil modificado.");
  }

  // ══════════════════════════════════════════════════════════
  //  JOB MODAL
  // ══════════════════════════════════════════════════════════
  function showJobDetails(job) {
    currentModalJob = job;
    resetModalTabs();

    modalTitle.textContent   = job.title;
    modalCompany.textContent = job.company;
    modalLocation.textContent= job.location;
    modalSalary.textContent  = job.salary;
    modalDate.textContent    = job.date;
    modalScore.textContent   = `${job.match_score}%`;
    modalDescText.textContent = job.description || "Descripción no disponible. Visita el enlace del portal.";
    modalApplyLink.href      = job.link;

    const sourceSlug = job.source.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g,'');
    modalSourceBadge.textContent = job.source;
    modalSourceBadge.className   = `badge platform-badge ${sourceSlug}`;

    // Matched skills
    modalMatchedSkills.innerHTML = "";
    if (job.matched_skills && job.matched_skills.length > 0) {
      job.matched_skills.forEach(skill => {
        const s = document.createElement("span");
        s.className = "skill-tag-matched";
        s.textContent = skill;
        modalMatchedSkills.appendChild(s);
      });
    } else {
      modalMatchedSkills.innerHTML = `<span style="font-size:0.82rem; color:var(--text-muted);">Ninguna habilidad directa detectada.</span>`;
    }

    // Modal save button sync
    updateModalSaveButton(job.id);

    // Populate ATS analysis tab
    populateATSAnalysis(job);

    // Generate cover letter
    generateCoverLetter(job, document.getElementById("cl-tone-select").value);

    jobModal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function updateModalSaveButton(id) {
    if (!modalSaveBtn) return;
    const saved = savedJobIds.includes(id);
    modalSaveBtn.innerHTML = saved
      ? `<i class="fa-solid fa-bookmark"></i> Guardado`
      : `<i class="fa-regular fa-bookmark"></i> Guardar`;
    modalSaveBtn.classList.toggle("btn-primary", saved);
    modalSaveBtn.classList.toggle("btn-secondary", !saved);
  }

  // ATS Analysis tab
  function populateATSAnalysis(job) {
    const score = job.match_score || 0;
    const matched = job.matched_skills || [];
    const allSkills = activeProfile ? (activeProfile.all_skills_flat || []) : [];
    const missing = allSkills.filter(s => !matched.map(m=>m.toLowerCase()).includes(s.toLowerCase())).slice(0, 10);

    const breakdownEl = document.getElementById("ats-breakdown-bars");
    const missingEl   = document.getElementById("ats-missing-skills");
    const recEl       = document.getElementById("ats-recommendation");

    if (!breakdownEl) return;

    // Breakdown bars
    const categories = [
      { label: "Skills Técnicas", pct: Math.min(100, matched.length * 14), color: "var(--cyan)" },
      { label: "Relevancia del Puesto", pct: score, color: "var(--indigo)" },
      { label: "Cobertura de Perfil", pct: allSkills.length > 0 ? Math.round((matched.length / allSkills.length) * 100) : 0, color: "var(--green)" },
    ];

    breakdownEl.innerHTML = "";
    categories.forEach(cat => {
      const el = document.createElement("div");
      el.className = "dist-bar-item";
      el.innerHTML = `
        <div class="dist-bar-meta">
          <span class="dist-name" style="color:var(--text-body);">${cat.label}</span>
          <span class="dist-count">${cat.pct}%</span>
        </div>
        <div class="dist-progress-bg">
          <div class="dist-progress-fill" style="width:0%; background:${cat.color};" data-pct="${cat.pct}"></div>
        </div>`;
      breakdownEl.appendChild(el);
      setTimeout(() => {
        const bar = el.querySelector(".dist-progress-fill");
        if (bar) bar.style.width = `${cat.pct}%`;
      }, 150);
    });

    // Missing skills
    missingEl.innerHTML = "";
    if (missing.length > 0) {
      missing.forEach(s => {
        const b = document.createElement("span");
        b.style.cssText = "display:inline-flex;align-items:center;padding:0.18rem 0.55rem;border-radius:100px;background:var(--rose-soft);color:var(--rose);border:1px solid rgba(248,113,113,0.3);font-size:0.68rem;font-weight:600;";
        b.textContent = s;
        missingEl.appendChild(b);
      });
    } else {
      missingEl.innerHTML = `<span style="font-size:0.82rem; color:var(--green);">✓ Tu perfil cubre todas las habilidades detectadas.</span>`;
    }

    // Recommendation
    if (score >= 75) {
      recEl.textContent = `✅ Alta compatibilidad (${score}%). Tu perfil es sólido para este puesto. Se recomienda postularte de inmediato y personalizar tu carta de presentación resaltando: ${matched.slice(0,3).join(', ')}.`;
    } else if (score >= 50) {
      recEl.textContent = `⚠️ Compatibilidad media (${score}%). Tienes varias habilidades requeridas. Refuerza tu carta destacando: ${matched.slice(0,3).join(', ')}. Considera adquirir: ${missing.slice(0,2).join(', ')}.`;
    } else {
      recEl.textContent = `🔴 Compatibilidad baja (${score}%). Este puesto requiere habilidades fuera de tu perfil actual. Úsalo como referencia de desarrollo o aplica con énfasis en tu experiencia general.`;
    }
  }

  // Modal tabs
  function resetModalTabs() {
    document.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".modal-tab-content").forEach(c => c.classList.add("hidden"));
    const firstBtn = document.querySelector(".modal-tab-btn");
    const firstContent = document.getElementById("tab-details");
    if (firstBtn) firstBtn.classList.add("active");
    if (firstContent) firstContent.classList.remove("hidden");
  }

  function initModalTabs() {
    document.querySelectorAll(".modal-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".modal-tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".modal-tab-content").forEach(c => c.classList.add("hidden"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.tab)?.classList.remove("hidden");
        if (btn.dataset.tab === "tab-cover-letter" && currentModalJob) {
          generateCoverLetter(currentModalJob, document.getElementById("cl-tone-select").value);
        }
      });
    });

    document.getElementById("cl-regen-btn")?.addEventListener("click", () => {
      if (currentModalJob) generateCoverLetter(currentModalJob, document.getElementById("cl-tone-select").value);
    });
    document.getElementById("cl-tone-select")?.addEventListener("change", () => {
      if (currentModalJob) generateCoverLetter(currentModalJob, document.getElementById("cl-tone-select").value);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  COVER LETTER GENERATOR
  // ══════════════════════════════════════════════════════════
  function generateCoverLetter(job, tone) {
    const name    = activeProfile?.name || "Nombre del candidato";
    const title   = activeProfile?.title || "Desarrollador";
    const skills  = (job.matched_skills || activeProfile?.all_skills_flat || []).slice(0, 4).join(", ");
    const output  = document.getElementById("cl-text-output");
    const emailBtn = document.getElementById("cl-email-btn");
    if (!output) return;

    const templates = {
      formal: `Estimado equipo de Reclutamiento de ${job.company},

Me dirijo a ustedes con gran interés en la posición de "${job.title}" publicada en ${job.source}. Soy ${name}, ${title} con experiencia en ${skills} y otros proyectos relevantes.

A lo largo de mi trayectoria, he desarrollado competencias sólidas que considero altamente aplicables a los objetivos de ${job.company}. Estoy comprometido con la calidad técnica, el trabajo colaborativo y la mejora continua.

Quedo a su disposición para una entrevista y agradezco de antemano su atención.

Atentamente,
${name}`,
      enthusiastic: `¡Hola, equipo de ${job.company}! 🚀

¡Me encantó ver la vacante de "${job.title}"! Soy ${name}, un apasionado de la tecnología con experiencia en ${skills}.

Creo genuinamente que puedo aportar valor real a su equipo. Me motiva construir soluciones que importen y aprender constantemente. ¡Estaría encantado de mostrarles lo que puedo hacer!

¿Podemos coordinar una llamada? 🎯

${name}`,
      technical: `Estimado equipo técnico de ${job.company}:

En respuesta a la vacante "${job.title}" (${job.source}), presento mi candidatura. Mi stack incluye: ${skills}. He trabajado en arquitecturas escalables, APIs RESTful e integración de sistemas.

Aporto capacidad de análisis técnico, resolución de problemas y documentación. Estoy disponible para una evaluación técnica o entrevista en el horario que sea conveniente.

${name} | ${activeProfile?.email || ''}`,
      short: `Hola ${job.company},

Me interesa la posición "${job.title}". Soy ${name}, tengo experiencia en ${skills}.

¿Podemos coordinar una entrevista?

${name}
${activeProfile?.email || ''} | ${activeProfile?.phone || ''}`
    };

    output.value = templates[tone] || templates.formal;

    const subject = encodeURIComponent(`Postulación — ${job.title} | ${name}`);
    const body    = encodeURIComponent(output.value);
    emailBtn.href = `mailto:reclutamiento@${job.company.toLowerCase().replace(/\s+/g,'')}.com?subject=${subject}&body=${body}`;
  }

  // ══════════════════════════════════════════════════════════
  //  COPY & EMAIL BUTTONS
  // ══════════════════════════════════════════════════════════
  function initCoverLetterActions() {
    const copyBtn = document.getElementById("cl-copy-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const txt = document.getElementById("cl-text-output")?.value;
        if (txt) {
          navigator.clipboard.writeText(txt).then(() => {
            showToast("success", "Copiado", "La carta fue copiada al portapapeles.");
            copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copiado!`;
            setTimeout(() => { copyBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copiar Texto`; }, 2000);
          });
        }
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MODAL SAVE BUTTON
  // ══════════════════════════════════════════════════════════
  function initModalSave() {
    if (!modalSaveBtn) return;
    modalSaveBtn.addEventListener("click", () => {
      if (!currentModalJob) return;
      const card = document.getElementById(`card-${currentModalJob.id}`);
      const btn  = card?.querySelector(".save-btn");
      if (btn) toggleSaveJob(currentModalJob.id, btn);
      else {
        // Direct toggle if card not visible
        if (savedJobIds.includes(currentModalJob.id)) {
          savedJobIds = savedJobIds.filter(x => x !== currentModalJob.id);
        } else {
          savedJobIds.push(currentModalJob.id);
        }
        localStorage.setItem(STORAGE_SAVED, JSON.stringify(savedJobIds));
        updateHeaderMetrics();
      }
      updateModalSaveButton(currentModalJob.id);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  EXPORT CSV
  // ══════════════════════════════════════════════════════════
  async function exportJobs() {
    if (!currentJobs.length) return;
    try {
      const res = await fetch(`${API_URL}/api/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: currentJobs })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `empleos_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("success", "CSV exportado", `${currentJobs.length} empleos guardados en el archivo.`);
      } else {
        showToast("error", "Error al exportar", "Intenta de nuevo.");
      }
    } catch {
      showToast("error", "Sin conexión", "No se pudo conectar al servidor para exportar.");
    }
  }

  // ══════════════════════════════════════════════════════════
  //  ONBOARDING WIZARD
  // ══════════════════════════════════════════════════════════
  function initOnboarding() {
    const done = localStorage.getItem(STORAGE_OB);
    if (done) return;

    const modal = document.getElementById("onboarding-modal");
    modal.classList.add("visible");

    const steps = [
      document.getElementById("ob-step-1"),
      document.getElementById("ob-step-2"),
      document.getElementById("ob-step-3"),
    ];
    const dots = [
      document.getElementById("ob-dot-1"),
      document.getElementById("ob-dot-2"),
      document.getElementById("ob-dot-3"),
    ];
    let currentStep = 0;

    const goto = (n) => {
      steps.forEach((s, i) => s?.classList.toggle("hidden", i !== n));
      dots.forEach((d, i) => d?.classList.toggle("active", i === n));
      currentStep = n;
    };

    document.getElementById("ob-next-btn")?.addEventListener("click", () => goto(1));
    document.getElementById("ob-next-btn-2")?.addEventListener("click", () => goto(2));
    document.getElementById("ob-back-btn")?.addEventListener("click", () => goto(0));
    document.getElementById("ob-skip-btn")?.addEventListener("click", () => {
      localStorage.setItem(STORAGE_OB, "1");
      modal.classList.remove("visible");
    });
    document.getElementById("ob-finish-btn")?.addEventListener("click", () => {
      localStorage.setItem(STORAGE_OB, "1");
      modal.classList.remove("visible");
      // Prefill modality from onboarding
      const mod = document.getElementById("ob-modality")?.value;
      if (mod && searchType) searchType.value = mod;
      const sal = document.getElementById("ob-salary")?.value;
      if (sal && filterSalary) filterSalary.value = sal;
      setTimeout(() => searchBtn.click(), 300);
    });

    // Upload zone in onboarding
    document.getElementById("ob-upload-zone")?.addEventListener("click", () => cvFileInput.click());
  }

  // ══════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════
  async function init() {
    // Load persisted lists
    try {
      savedJobIds    = JSON.parse(localStorage.getItem(STORAGE_SAVED) || "[]");
      discardedJobIds = JSON.parse(localStorage.getItem(STORAGE_DISCARDED) || "[]");
    } catch { savedJobIds = []; discardedJobIds = []; }

    updateHeaderMetrics();

    // Load profile
    await loadProfile();

    // Init UI systems
    initUpload();
    initSearch();
    initFilters();
    initSkillsEditor();
    initModalTabs();
    initCoverLetterActions();
    initModalSave();

    // Modal close
    modalClose.addEventListener("click", () => { jobModal.style.display = "none"; document.body.style.overflow = ""; });
    jobModal.addEventListener("click", (e) => { if (e.target === jobModal) { jobModal.style.display = "none"; document.body.style.overflow = ""; } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && jobModal.style.display === "block") { jobModal.style.display = "none"; document.body.style.overflow = ""; } });

    // Export button
    exportBtn?.addEventListener("click", exportJobs);

    // Onboarding
    initOnboarding();
  }

  // Start
  document.addEventListener("DOMContentLoaded", init);

})();
