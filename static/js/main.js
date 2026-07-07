/**
 * PostulacionAuto Hub v2.0 — Main Controller Optimizado
 * Arquitectura modular, state centralizado, eventos optimizados
 */

(function () {
  'use strict';

  // ── Configuración ────────────────────────────────────────────
  const CONFIG = {
    API_URL: '',
    STORAGE: {
      PROFILE: 'pah_profile_v2',
      SAVED: 'pah_saved_jobs',
      DISCARDED: 'pah_discarded_jobs',
      ONBOARDING: 'pah_onboarding_done'
    },
    DEFAULT_LOCATION: 'México',
    DEFAULT_MODALITY: 'remoto',
    MAX_RESULTS: 20,
    TOAST_DURATION: 4000
  };

  // ── State ────────────────────────────────────────────────────
  const state = {
    profile: null,
    jobs: [],
    savedIds: [],
    discardedIds: [],
    currentJob: null,
    activeChips: { modality: ['remoto', 'hibrido', 'presencial'], level: ['junior', 'semi', 'senior', 'lead'] },
    latexFile: null,
    latexFilename: 'cv_latex.tex',
    analysisToken: 0,
    isSearching: false,
    isProcessing: false
  };

  // ── DOM Cache ────────────────────────────────────────────────
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  const dom = {};

  function cacheDom() {
    dom.search = {
      btn: $('#search-btn'),
      keywords: $('#search-keywords'),
      type: $('#search-type'),
      location: $('#search-loc-input'),
      maxResults: $('#max-results'),
      rangeVal: $('#range-val'),
      loader: $('#search-loader'),
      empty: $('#empty-state'),
      container: $('#jobs-container'),
      summary: $('#results-summary'),
      actions: $('#results-actions-bar')
    };

    dom.filters = {
      score: $('#filter-score'),
      scoreVal: $('#filter-score-val'),
      salary: $('#filter-salary'),
      sort: $('#filter-sort'),
      live: $('#filter-live-search'),
      hideDiscarded: $('#toggle-hide-discarded'),
      onlySaved: $('#toggle-only-saved'),
      platforms: $$('.platform-filter'),
      chips: $$('.filter-chip')
    };

    dom.profile = {
      name: $('#cand-name'),
      title: $('#cand-title'),
      email: $('#cand-email'),
      phone: $('#cand-phone'),
      location: $('#cand-location'),
      linkedin: $('#cand-linkedin'),
      github: $('#cand-github'),
      years: $('#cand-years'),
      keywordsCount: $('#cand-keywords-count'),
      source: $('#cand-analysis-source'),
      ocr: $('#cand-ocr-flag'),
      summary: $('#cand-summary'),
      roles: $('#cand-roles'),
      languages: $('#cand-languages'),
      experience: $('#cand-experience'),
      education: $('#cand-education'),
      certifications: $('#cand-certifications'),
      keywords: $('#cand-keywords'),
      skills: $('#skills-container')
    };

    dom.profileEdit = {
      form: $('#profile-edit-form'),
      toggle: $('#toggle-edit-profile'),
      save: $('#profile-save-btn'),
      cancel: $('#profile-cancel-btn'),
      name: $('#profile-name-input'),
      title: $('#profile-title-input'),
      email: $('#profile-email-input'),
      phone: $('#profile-phone-input'),
      location: $('#profile-location-input'),
      linkedin: $('#profile-linkedin-input'),
      github: $('#profile-github-input'),
      years: $('#profile-years-input'),
      roles: $('#profile-roles-input'),
      summary: $('#profile-summary-input'),
      experience: $('#profile-experience-input'),
      languages: $('#profile-languages-input'),
      education: $('#profile-education-input'),
      certifications: $('#profile-certifications-input'),
      keywords: $('#profile-keywords-input'),
      advanced: $('#profile-advanced-json-input')
    };

    dom.skills = {
      container: $('#skills-container'),
      toggle: $('#toggle-edit-skills'),
      form: $('#add-skill-form'),
      addBtn: $('#add-skill-btn'),
      name: $('#new-skill-name'),
      category: $('#new-skill-category')
    };

    dom.upload = {
      cv: $('#cv-upload-zone'),
      cvInput: $('#cv-file-input'),
      latex: $('#latex-image-upload-zone'),
      latexInput: $('#latex-image-input'),
      latexBtn: $('#latex-generate-btn'),
      latexName: $('#latex-file-name'),
      latexOutput: $('#latex-output-panel'),
      latexText: $('#latex-output'),
      latexCopy: $('#latex-copy-btn'),
      latexDownload: $('#latex-download-btn')
    };

    dom.stats = {
      card: $('#results-stats-card'),
      total: $('#stat-total'),
      avg: $('#stat-avg-match'),
      high: $('#stat-high-match'),
      skills: $('#stat-skills-count'),
      bars: $('#stats-dist-bars')
    };

    dom.metrics = {
      jobs: $('#hm-jobs-count'),
      avg: $('#hm-avg-score'),
      saved: $('#hm-saved-count')
    };

    dom.modal = {
      el: $('#job-modal'),
      close: $('#modal-close'),
      title: $('#modal-title'),
      company: $('#modal-company'),
      location: $('#modal-location'),
      salary: $('#modal-salary'),
      date: $('#modal-date'),
      score: $('#modal-score'),
      desc: $('#modal-desc-text'),
      apply: $('#modal-apply-link'),
      source: $('#modal-source-badge'),
      matched: $('#modal-matched-skills'),
      save: $('#modal-save-btn'),
      tabs: $$('.modal-tab-btn'),
      tabContents: $$('.modal-tab-content'),
      analysisStatus: $('#job-analysis-status'),
      analysisSummary: $('#job-analysis-summary'),
      analysisModality: $('#job-analysis-modality'),
      analysisSeniority: $('#job-analysis-seniority'),
      analysisEmployment: $('#job-analysis-employment'),
      analysisConfidence: $('#job-analysis-confidence'),
      analysisRequirements: $('#job-analysis-requirements'),
      analysisBenefits: $('#job-analysis-benefits'),
      analysisDetected: $('#job-analysis-detected-skills'),
      analysisRisks: $('#job-analysis-risks'),
      atsBreakdown: $('#ats-breakdown-bars'),
      atsMissing: $('#ats-missing-skills'),
      atsRecommendation: $('#ats-recommendation'),
      actionGaps: $('#action-plan-gaps'),
      actionSteps: $('#action-plan-steps'),
      clText: $('#cl-text-output'),
      clTone: $('#cl-tone-select'),
      clRegen: $('#cl-regen-btn'),
      clCopy: $('#cl-copy-btn'),
      clEmail: $('#cl-email-btn')
    };

    dom.onboarding = {
      modal: $('#onboarding-modal'),
      steps: $$('.onboarding-modal .onboarding-step'),
      dots: $$('.onboarding-step-dot'),
      upload: $('#ob-upload-zone'),
      next1: $('#ob-next-btn'),
      next2: $('#ob-next-btn-2'),
      back: $('#ob-back-btn'),
      skip: $('#ob-skip-btn'),
      finish: $('#ob-finish-btn'),
      modality: $('#ob-modality'),
      salary: $('#ob-salary')
    };

    dom.toast = $('#toast-container');
    dom.exportBtn = $('#export-btn');
  }

  // ── Toast System ─────────────────────────────────────────────
  function showToast(type, title, msg, duration = CONFIG.TOAST_DURATION) {
    const icons = {
      success: 'fa-check-circle',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info',
      warning: 'fa-triangle-exclamation'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
      <div class="toast-body">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
    `;

    dom.toast.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  // ── Storage Helpers ──────────────────────────────────────────
  function storageGet(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  // ── Profile Helpers ──────────────────────────────────────────
  function flattenSkills(skillsObj) {
    return Object.values(skillsObj || {}).flat();
  }

  function getProfileKeywords(profile) {
    const titleWords = (profile.title || '').split(/[\s/|,•·-]+/).filter(w => w.length >= 4);
    const preferred = profile.preferred_roles || [];
    const topSkills = profile.all_skills_flat || [];
    const certs = profile.certifications || [];
    const education = profile.education || [];
    const languages = profile.languages_spoken || [];
    const stored = profile.search_keywords || [];
    return [...new Set([...stored, ...preferred, ...topSkills, ...languages, ...certs, ...education, ...titleWords])];
  }

  function normalizeProfile(profile) {
    const normalized = {
      ...profile,
      preferred_roles: profile.preferred_roles || [],
      languages_spoken: profile.languages_spoken || [],
      education: profile.education || [],
      certifications: profile.certifications || [],
      skills: profile.skills || {},
      sections: profile.sections || {},
      analysis_meta: profile.analysis_meta || {},
      all_skills_flat: flattenSkills(profile.skills)
    };
    normalized.search_keywords = getProfileKeywords(normalized);
    return normalized;
  }

  function normalizeUrl(value, type) {
    const raw = (value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    const prefix = type === 'github' ? 'https://github.com/' : 'https://linkedin.com/';
    return `${prefix}${raw.replace(/^\/+/, '')}`;
  }

  function splitItems(value) {
    return (value || '').split(/\n+/).map(v => v.trim()).filter(Boolean);
  }

  function parseKeywords(value, profile) {
    const raw = (value || '').split(/[\n,]+/).map(v => v.trim()).filter(Boolean);
    return raw.length ? raw : getProfileKeywords(profile);
  }

  function formatModality(value) {
    const map = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
    return map[value] || value;
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

  function formatSeniority(value) {
    const map = { senior: 'Senior', junior: 'Junior', semi: 'Semi Senior' };
    return map[value] || 'General';
  }

  // ── Rendering: Profile ──────────────────────────────────────
  function renderProfile(profile) {
    if (!profile) return;
    state.profile = normalizeProfile(profile);

    const p = state.profile;
    const meta = p.analysis_meta || {};

    dom.profile.name.textContent = p.name || 'Sin nombre';
    dom.profile.title.textContent = p.title || 'Sin título';
    dom.profile.email.textContent = p.email || 'Sin email';
    dom.profile.phone.textContent = p.phone || 'Sin teléfono';
    dom.profile.location.textContent = p.location || 'Sin ubicación';
    dom.profile.years.textContent = `${p.experience_years || 0} años`;
    dom.profile.keywordsCount.textContent = (p.search_keywords || []).length;
    dom.profile.source.textContent = meta.source === 'pdf' ? 'PDF' : meta.source === 'fallback' ? 'Fallback' : 'ATS';
    dom.profile.ocr.textContent = meta.used_ocr ? 'Sí' : 'No';
    dom.profile.summary.textContent = p.summary || 'Sin resumen disponible.';

    // Links
    const linkedinUrl = normalizeUrl(p.linkedin, 'linkedin');
    dom.profile.linkedin.href = linkedinUrl || '#';
    dom.profile.linkedin.style.pointerEvents = linkedinUrl ? '' : 'none';
    dom.profile.linkedin.style.opacity = linkedinUrl ? '' : '0.55';

    const githubUrl = normalizeUrl(p.github, 'github');
    dom.profile.github.href = githubUrl || '#';
    dom.profile.github.style.pointerEvents = githubUrl ? '' : 'none';
    dom.profile.github.style.opacity = githubUrl ? '' : '0.55';

    // Chips & lists
    renderChips(dom.profile.roles, p.preferred_roles || []);
    renderChips(dom.profile.languages, p.languages_spoken || []);
    renderList(dom.profile.experience, p.sections?.experience || []);
    renderList(dom.profile.education, p.education || []);
    renderList(dom.profile.certifications, p.certifications || []);
    renderChips(dom.profile.keywords, (p.search_keywords || []).slice(0, 40));

    renderSkills(p.skills || {});
    fillProfileForm(p);
    updateStatsSkills(p);
    saveProfileToStorage(p);
    syncProfileToBackend(p);

    // Auto-fill search inputs
    autoFillSearch(p);
  }

  function renderChips(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<span class="profile-empty">Sin datos disponibles.</span>';
      return;
    }
    items.forEach(item => {
      const chip = document.createElement('span');
      chip.className = 'profile-chip';
      chip.innerHTML = `<i class="fa-solid fa-circle"></i><span>${item}</span>`;
      container.appendChild(chip);
    });
  }

  function renderList(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<span class="profile-empty">Sin datos disponibles.</span>';
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'profile-line-item';
      row.innerHTML = `<i class="fa-solid fa-check"></i><span>${item}</span>`;
      container.appendChild(row);
    });
  }

  function renderSkills(skillsObj) {
    const labels = {
      languages: 'Lenguajes',
      backend: 'Backend / Frameworks',
      infrastructure: 'Infraestructura',
      security: 'Seguridad',
      iot: 'IoT / Hardware',
      management: 'Gestión'
    };

    dom.profile.skills.innerHTML = '';
    const isEdit = dom.profile.skills.classList.contains('edit-mode');

    for (const [cat, skills] of Object.entries(skillsObj)) {
      if (!skills || !skills.length) continue;
      const box = document.createElement('div');
      box.className = 'skill-category-box';
      box.innerHTML = `<div class="category-name">${labels[cat] || cat}</div>`;

      const badges = document.createElement('div');
      badges.className = 'skills-badges';

      skills.forEach(skill => {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = skill;
        b.dataset.skill = skill;
        b.dataset.cat = cat;
        if (isEdit) {
          b.style.cursor = 'pointer';
          b.addEventListener('click', () => removeSkill(cat, skill));
        }
        badges.appendChild(b);
      });

      box.appendChild(badges);
      dom.profile.skills.appendChild(box);
    }
  }

  function fillProfileForm(profile) {
    const f = dom.profileEdit;
    f.name.value = profile.name || '';
    f.title.value = profile.title || '';
    f.email.value = profile.email || '';
    f.phone.value = profile.phone || '';
    f.location.value = profile.location || '';
    f.linkedin.value = profile.linkedin || '';
    f.github.value = profile.github || '';
    f.years.value = profile.experience_years || '';
    f.roles.value = (profile.preferred_roles || []).join(', ');
    f.summary.value = profile.summary || '';
    f.experience.value = (profile.sections?.experience || []).join('\n');
    f.languages.value = (profile.languages_spoken || []).join(', ');
    f.education.value = (profile.education || []).join('\n');
    f.certifications.value = (profile.certifications || []).join('\n');
    f.keywords.value = (profile.search_keywords || []).join('\n');
    try {
      f.advanced.value = JSON.stringify(profile, null, 2);
    } catch {
      f.advanced.value = '{}';
    }
  }

  function updateStatsSkills(profile) {
    const flat = profile.all_skills_flat || [];
    dom.stats.skills.textContent = flat.length;
  }

  function autoFillSearch(profile) {
    const kw = dom.search.keywords;
    const loc = dom.search.location;
    const currentKw = kw.value.trim();

    if (!currentKw || kw.dataset.autofilled === '1') {
      const suggestions = getProfileKeywords(profile);
      if (suggestions.length) {
        kw.value = suggestions.join(', ');
        kw.dataset.autofilled = '1';
      }
    }

    const currentLoc = loc.value.trim();
    if ((!currentLoc || currentLoc === 'México') && profile.location && dom.search.type.value !== 'remoto') {
      loc.value = profile.location;
      loc.dataset.autofilled = '1';
    }
  }

  // ── Profile Persistence ──────────────────────────────────────
  function saveProfileToStorage(profile) {
    storageSet(CONFIG.STORAGE.PROFILE, profile);
  }

  function loadProfileFromStorage() {
    return storageGet(CONFIG.STORAGE.PROFILE);
  }

  async function syncProfileToBackend(profile) {
    try {
      await fetch(`${CONFIG.API_URL}/api/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
    } catch { /* fail silently */ }
  }

  async function loadProfile() {
    const cached = loadProfileFromStorage();
    if (cached) {
      renderProfile(cached);
      return;
    }

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/profile`);
      const json = await res.json();
      if (json.status === 'success' && json.data) {
        renderProfile(json.data);
      }
    } catch {
      showToast('warning', 'Sin conexión', 'No se pudo cargar el perfil del servidor.');
    }
  }

  // ── Skills Editor ────────────────────────────────────────────
  function initSkillsEditor() {
    dom.skills.toggle.addEventListener('click', () => {
      const isEdit = dom.profile.skills.classList.toggle('edit-mode');
      dom.skills.toggle.classList.toggle('active', isEdit);
      dom.skills.form.classList.toggle('hidden', !isEdit);
      dom.skills.toggle.title = isEdit ? 'Salir del modo edición' : 'Editar habilidades';
      if (isEdit) renderSkills(state.profile.skills || {});
      else renderSkills(state.profile.skills || {});
    });

    dom.skills.addBtn.addEventListener('click', () => {
      const skill = dom.skills.name.value.trim();
      const cat = dom.skills.category.value;
      if (!skill) return;

      if (!state.profile.skills[cat]) state.profile.skills[cat] = [];
      if (state.profile.skills[cat].includes(skill)) {
        showToast('warning', 'Ya existe', `"${skill}" ya está en tu perfil.`);
        return;
      }

      state.profile.skills[cat].push(skill);
      state.profile.all_skills_flat = flattenSkills(state.profile.skills);
      state.profile.search_keywords = getProfileKeywords(state.profile);
      dom.skills.name.value = '';
      renderProfile(state.profile);
      syncProfileToBackend(state.profile);
      recalculateMatchScores();
      showToast('success', 'Habilidad añadida', `"${skill}" agregada a ${cat}.`);
    });

    dom.skills.name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dom.skills.addBtn.click();
    });
  }

  function removeSkill(cat, skill) {
    if (!state.profile.skills[cat]) return;
    state.profile.skills[cat] = state.profile.skills[cat].filter(s => s !== skill);
    state.profile.all_skills_flat = flattenSkills(state.profile.skills);
    state.profile.search_keywords = getProfileKeywords(state.profile);
    renderProfile(state.profile);
    syncProfileToBackend(state.profile);
    recalculateMatchScores();
    showToast('info', 'Habilidad eliminada', `"${skill}" removida del perfil.`);
  }

  // ── Profile Editor ───────────────────────────────────────────
  function initProfileEditor() {
    let snapshot = null;

    dom.profileEdit.toggle.addEventListener('click', () => {
      const isEditing = !dom.profileEdit.form.classList.contains('hidden');
      if (isEditing) {
        cancelEdit();
      } else {
        snapshot = JSON.parse(JSON.stringify(state.profile || {}));
        fillProfileForm(state.profile || {});
        dom.profileEdit.form.classList.remove('hidden');
        dom.profileEdit.toggle.classList.add('active');
        dom.profileEdit.toggle.title = 'Cancelar edición de perfil';
      }
    });

    dom.profileEdit.cancel.addEventListener('click', cancelEdit);
    dom.profileEdit.save.addEventListener('click', saveEdit);

    function cancelEdit() {
      if (snapshot) fillProfileForm(snapshot);
      dom.profileEdit.form.classList.add('hidden');
      dom.profileEdit.toggle.classList.remove('active');
      dom.profileEdit.toggle.title = 'Editar perfil';
    }

    function saveEdit() {
      const f = dom.profileEdit;
      let base = JSON.parse(JSON.stringify(state.profile));

      // Advanced JSON override
      if (f.advanced.value.trim()) {
        try {
          const parsed = JSON.parse(f.advanced.value);
          if (parsed && typeof parsed === 'object') base = parsed;
        } catch {
          showToast('error', 'JSON inválido', 'Revisa el editor avanzado antes de guardar.');
          f.advanced.focus();
          return;
        }
      }

      const updated = {
        ...base,
        name: f.name.value.trim(),
        title: f.title.value.trim(),
        email: f.email.value.trim(),
        phone: f.phone.value.trim(),
        location: f.location.value.trim(),
        linkedin: f.linkedin.value.trim(),
        github: f.github.value.trim(),
        experience_years: parseInt(f.years.value) || 0,
        preferred_roles: f.roles.value.split(',').map(v => v.trim()).filter(Boolean),
        summary: f.summary.value.trim(),
        languages_spoken: f.languages.value.split(',').map(v => v.trim()).filter(Boolean),
        education: splitItems(f.education.value),
        certifications: splitItems(f.certifications.value)
      };

      if (!updated.name) {
        showToast('warning', 'Nombre requerido', 'Escribe al menos tu nombre.');
        f.name.focus();
        return;
      }

      if (!updated.skills) updated.skills = {};
      if (!updated.sections || typeof updated.sections !== 'object') updated.sections = {};
      updated.sections.experience = splitItems(f.experience.value);
      updated.sections.education = [...updated.education];
      updated.sections.certifications = [...updated.certifications];
      updated.sections.languages_spoken = [...updated.languages_spoken];
      updated.all_skills_flat = flattenSkills(updated.skills);
      updated.search_keywords = parseKeywords(f.keywords.value, updated);

      state.profile = updated;
      renderProfile(updated);
      syncProfileToBackend(updated);
      snapshot = JSON.parse(JSON.stringify(updated));
      dom.profileEdit.form.classList.add('hidden');
      dom.profileEdit.toggle.classList.remove('active');
      dom.profileEdit.toggle.title = 'Editar perfil';

      if (state.jobs.length) recalculateMatchScores();
      showToast('success', 'Perfil actualizado', 'La información se guardó correctamente.');
    }
  }

  // ── CV Upload ────────────────────────────────────────────────
  function initUpload() {
    const zone = dom.upload.cv;
    const input = dom.upload.cvInput;

    zone.addEventListener('click', () => {
      if (!zone.classList.contains('processing')) input.click();
    });

    input.addEventListener('change', () => {
      if (input.files[0]) uploadCV(input.files[0]);
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.pdf')) uploadCV(file);
      else showToast('error', 'Formato inválido', 'Solo se aceptan PDF.');
    });
  }

  async function uploadCV(file) {
    const zone = dom.upload.cv;
    const icon = zone.querySelector('.upload-icon');

    zone.classList.add('processing');
    icon.className = 'fa-solid fa-circle-notch fa-spin upload-icon';
    showToast('info', 'Procesando CV', 'Analizando tu currículum...');

    const formData = new FormData();
    formData.append('cv', file);

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/upload-cv`, { method: 'POST', body: formData });
      const json = await res.json();

      if (json.status === 'success') {
        renderProfile(json.data);
        const meta = json.data.analysis_meta || {};
        const note = meta.used_ocr ? ' usando OCR local' : '';
        const skills = json.data.all_skills_flat || [];
        showToast('success', 'CV procesado', `Se detectaron ${skills.length} habilidades${note}. ¡Listo para buscar!`);
        localStorage.removeItem(CONFIG.STORAGE.ONBOARDING);
      } else {
        showToast('error', 'Error al procesar', json.message || 'Intenta con otro archivo.');
      }
    } catch {
      showToast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
    } finally {
      zone.classList.remove('processing');
      icon.className = 'fa-solid fa-cloud-arrow-up upload-icon';
    }
  }

  // ── LaTeX Generator ──────────────────────────────────────────
  function initLatexGenerator() {
    const zone = dom.upload.latex;
    const input = dom.upload.latexInput;

    zone.addEventListener('click', () => {
      if (!zone.classList.contains('processing')) input.click();
    });

    input.addEventListener('change', () => {
      if (input.files[0]) handleLatexFile(input.files[0]);
    });

    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });

    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleLatexFile(file);
    });

    dom.upload.latexBtn.addEventListener('click', generateLatex);
    dom.upload.latexCopy.addEventListener('click', copyLatex);
    dom.upload.latexDownload.addEventListener('click', downloadLatex);
  }

  function handleLatexFile(file) {
    const validTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      showToast('error', 'Formato inválido', 'Usa PDF, PNG, JPG o WEBP.');
      return;
    }

    state.latexFile = file;
    state.latexFilename = `${file.name.replace(/\.[^.]+$/, '') || 'cv_latex'}.tex`;
    dom.upload.latexName.textContent = file.name;
    dom.upload.latexOutput.classList.add('hidden');
    dom.upload.latexText.value = '';
    showToast('info', 'Imagen lista', 'Ahora puedes generar el documento LaTeX.');
  }

  function setLatexProcessing(isProcessing) {
    dom.upload.latexBtn.disabled = isProcessing;
    dom.upload.latex.classList.toggle('processing', isProcessing);
    dom.upload.latexBtn.innerHTML = isProcessing
      ? '<i class="fa-solid fa-circle-notch fa-spin"></i> Generando...'
      : '<i class="fa-solid fa-wand-magic-sparkles"></i> Generar CV LaTeX';
  }

  async function generateLatex() {
    if (!state.latexFile) {
      showToast('warning', 'Falta imagen', 'Selecciona primero una imagen.');
      return;
    }

    setLatexProcessing(true);
    showToast('info', 'Generando LaTeX', 'Transcribiendo con OCR local...');

    const formData = new FormData();
    formData.append('image', state.latexFile);

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/generate-cv-latex`, { method: 'POST', body: formData });
      const json = await res.json();

      if (!res.ok || json.status !== 'success') {
        showToast('error', 'No se pudo generar', json.message || 'Intenta de nuevo.');
        return;
      }

      dom.upload.latexText.value = json.data?.latex || '';
      state.latexFilename = json.data?.suggested_filename || state.latexFilename;
      dom.upload.latexOutput.classList.remove('hidden');
      showToast('success', 'CV LaTeX listo', 'Documento generado desde OCR local.');
    } catch {
      showToast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
    } finally {
      setLatexProcessing(false);
    }
  }

  function copyLatex() {
    const text = dom.upload.latexText.value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      showToast('success', 'LaTeX copiado', 'Código copiado al portapapeles.');
    }).catch(() => {
      showToast('error', 'No se pudo copiar', 'Copia manualmente desde el cuadro.');
    });
  }

  function downloadLatex() {
    const text = dom.upload.latexText.value;
    if (!text) return;
    const blob = new Blob([text], { type: 'application/x-tex;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.latexFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Search ────────────────────────────────────────────────────
  function initSearch() {
    dom.search.maxResults.addEventListener('input', () => {
      dom.search.rangeVal.textContent = dom.search.maxResults.value;
    });

    dom.search.btn.addEventListener('click', performSearch);

    dom.search.keywords.addEventListener('input', () => {
      dom.search.keywords.dataset.autofilled = '0';
    });

    dom.search.location.addEventListener('input', () => {
      dom.search.location.dataset.autofilled = '0';
    });

    // Ctrl+Enter to search
    dom.search.keywords.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        performSearch();
      }
    });
  }

  let stepInterval = null;

  function startStepLoader() {
    const steps = ['step-init', 'step-li', 'step-occ', 'step-ct', 'step-gb', 'step-ats'];
    let idx = 0;

    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active', 'completed');
        el.querySelector('.step-icon').className = 'fa-regular fa-circle step-icon';
      }
    });

    const advance = () => {
      if (idx > 0 && steps[idx - 1]) {
        const prev = document.getElementById(steps[idx - 1]);
        if (prev) {
          prev.classList.remove('active');
          prev.classList.add('completed');
          prev.querySelector('.step-icon').className = 'fa-solid fa-circle-check step-icon';
        }
      }
      if (idx < steps.length) {
        const cur = document.getElementById(steps[idx]);
        if (cur) {
          cur.classList.add('active');
          cur.querySelector('.step-icon').className = 'fa-solid fa-circle-notch fa-spin step-icon';
        }
        idx++;
      }
    };

    advance();
    stepInterval = setInterval(advance, 2800);
  }

  function stopStepLoader() {
    if (stepInterval) {
      clearInterval(stepInterval);
      stepInterval = null;
    }
  }

  function showSkeleton(count = 6) {
    dom.search.container.innerHTML = '';
    dom.search.container.classList.remove('hidden');
    dom.search.empty.classList.add('hidden');

    for (let i = 0; i < count; i++) {
      const s = document.createElement('div');
      s.className = 'skeleton-card';
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
        <div class="skeleton skel-line w-80" style="height:10px;"></div>
        <div class="skeleton skel-line w-40" style="height:10px;"></div>
      `;
      dom.search.container.appendChild(s);
    }
  }

  async function performSearch() {
    if (state.isSearching) return;
    state.isSearching = true;

    const keywords = dom.search.keywords.value.trim();
    const location = dom.search.location.value.trim() || 'México';
    const modality = dom.search.type.value || 'remoto';
    const max = parseInt(dom.search.maxResults.value) || 20;

    // UI loading state
    dom.search.btn.disabled = true;
    dom.search.btn.querySelector('.btn-content').classList.add('hidden');
    dom.search.btn.querySelector('.btn-loader').classList.remove('hidden');
    dom.search.empty.classList.add('hidden');
    dom.search.container.classList.add('hidden');
    dom.stats.card.classList.add('hidden');
    dom.search.actions.classList.add('hidden');
    dom.search.loader.classList.remove('hidden');
    dom.search.summary.innerHTML = 'Buscando vacantes con motor ATS v2...';

    showSkeleton(6);
    dom.search.container.classList.remove('hidden');
    startStepLoader();

    const params = new URLSearchParams();
    if (keywords) params.set('keywords', keywords);
    params.set('location', location);
    params.set('modality', modality);
    params.set('max_results', max);

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/search?${params}`);
      const json = await res.json();

      stopStepLoader();
      dom.search.loader.classList.add('hidden');
      dom.search.btn.disabled = false;
      dom.search.btn.querySelector('.btn-content').classList.remove('hidden');
      dom.search.btn.querySelector('.btn-loader').classList.add('hidden');

      if (json.status === 'success' && json.data.length) {
        state.jobs = json.data;
        dom.search.actions.classList.remove('hidden');
        dom.stats.card.classList.remove('hidden');
        resetFilters();
        applyFilters();
        showToast('success', 'Búsqueda completada', `Se analizaron ${state.jobs.length} vacantes.`);
        updateMetrics();
      } else {
        state.jobs = [];
        dom.search.container.innerHTML = '';
        dom.search.container.classList.add('hidden');
        dom.search.summary.innerHTML = 'No se encontraron vacantes con las palabras clave especificadas.';
        dom.search.empty.querySelector('h3').textContent = 'Sin resultados';
        dom.search.empty.querySelector('p').textContent = 'Prueba con otras palabras clave o modifica la ubicación.';
        dom.search.empty.classList.remove('hidden');
        showToast('warning', 'Sin resultados', 'Intenta ampliar las palabras clave.');
      }
    } catch (err) {
      console.error(err);
      stopStepLoader();
      dom.search.loader.classList.add('hidden');
      dom.search.btn.disabled = false;
      dom.search.btn.querySelector('.btn-content').classList.remove('hidden');
      dom.search.btn.querySelector('.btn-loader').classList.add('hidden');
      dom.search.container.innerHTML = '';
      dom.search.container.classList.add('hidden');
      dom.search.summary.textContent = 'Error de conexión.';
      dom.search.empty.querySelector('h3').textContent = 'Error de Conexión';
      dom.search.empty.querySelector('p').textContent = 'Asegúrate de que el servidor Flask esté activo.';
      dom.search.empty.classList.remove('hidden');
      showToast('error', 'Error de conexión', '¿El servidor Flask está encendido?');
    } finally {
      state.isSearching = false;
    }
  }

  // ── Filters ──────────────────────────────────────────────────
  function initFilters() {
    dom.filters.score.addEventListener('input', () => {
      dom.filters.scoreVal.textContent = `${dom.filters.score.value}%`;
      applyFilters();
    });

    dom.filters.salary.addEventListener('input', applyFilters);
    dom.filters.sort.addEventListener('change', applyFilters);
    dom.filters.live.addEventListener('input', applyFilters);
    dom.filters.hideDiscarded.addEventListener('change', applyFilters);
    dom.filters.onlySaved.addEventListener('change', applyFilters);

    dom.filters.platforms.forEach(cb => cb.addEventListener('change', applyFilters));

    dom.filters.chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        const group = chip.dataset.group;
        const val = chip.dataset.val;
        const arr = state.activeChips[group] || [];
        if (chip.classList.contains('active')) {
          if (!arr.includes(val)) arr.push(val);
        } else {
          state.activeChips[group] = arr.filter(v => v !== val);
        }
        applyFilters();
      });
    });
  }

  function resetFilters() {
    dom.filters.score.value = 0;
    dom.filters.scoreVal.textContent = '0%';
    dom.filters.salary.value = '';
    dom.filters.sort.value = 'match';
    dom.filters.live.value = '';
    dom.filters.hideDiscarded.checked = false;
    dom.filters.onlySaved.checked = false;
    dom.filters.platforms.forEach(cb => cb.checked = true);
    dom.filters.chips.forEach(ch => ch.classList.add('active'));
    state.activeChips = { modality: ['remoto', 'hibrido', 'presencial'], level: ['junior', 'semi', 'senior', 'lead'] };
  }

  function applyFilters() {
    if (!state.jobs.length) return;

    const minScore = parseInt(dom.filters.score.value) || 0;
    const minSalary = parseFloat(dom.filters.salary.value) || 0;
    const sortBy = dom.filters.sort.value;
    const liveQ = dom.filters.live.value.toLowerCase().trim();
    const hideDiscard = dom.filters.hideDiscarded.checked;
    const onlySaved = dom.filters.onlySaved.checked;
    const checkedPlats = dom.filters.platforms.filter(cb => cb.checked).map(cb => cb.value);
    const standardPlats = ['LinkedIn', 'OCC Mundial', 'Computrabajo', 'Get on Board', 'Infojobs'];

    let filtered = state.jobs.filter(job => {
      // Platform
      let platMatch = checkedPlats.includes(job.source);
      if (!platMatch && checkedPlats.includes('Google (Web)') && !standardPlats.includes(job.source)) {
        platMatch = true;
      }
      if (!platMatch) return false;

      // Score
      if (job.match_score < minScore) return false;

      // Salary
      if (minSalary > 0) {
        const parsed = parseSalary(job.salary);
        if (parsed === 0 || parsed < minSalary) return false;
      }

      // Modality chips
      const titleLoc = `${job.title} ${job.location}`.toLowerCase();
      const modActive = state.activeChips.modality || [];
      if (modActive.length < 3) {
        const modality = job.work_modality || (/remoto|remote|home office|teletrabajo/i.test(titleLoc) ? 'remoto' :
          /h[íi]brido|hybrid/i.test(titleLoc) ? 'hibrido' : 'presencial');
        const isRemote = modality === 'remoto';
        const isHybrid = modality === 'hibrido';
        const isPresential = !isRemote && !isHybrid;
        const allowed = (isRemote && modActive.includes('remoto')) ||
          (isHybrid && modActive.includes('hibrido')) ||
          (isPresential && modActive.includes('presencial'));
        if (!allowed) return false;
      }

      // Level chips
      const levelActive = state.activeChips.level || [];
      if (levelActive.length < 4) {
        const t = job.title.toLowerCase();
        const isJunior = /junior|jr\.|entry|practicante|trainee/i.test(t);
        const isSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(t);
        const isSemi = /semi|mid|pleno|ssr/i.test(t);
        const isLead = /lead|l[íi]der|manager|director/i.test(t);
        const isGeneral = !isJunior && !isSenior && !isSemi && !isLead;
        const allowed = (isJunior && levelActive.includes('junior')) ||
          (isSemi && levelActive.includes('semi')) ||
          (isSenior && levelActive.includes('senior')) ||
          (isLead && levelActive.includes('lead')) ||
          isGeneral;
        if (!allowed) return false;
      }

      // Live search
      if (liveQ) {
        const haystack = `${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`.toLowerCase();
        if (!haystack.includes(liveQ)) return false;
      }

      // Hide discarded
      if (hideDiscard && state.discardedIds.includes(job.id)) return false;

      // Only saved
      if (onlySaved && !state.savedIds.includes(job.id)) return false;

      return true;
    });

    // Sort
    filtered = sortJobs(filtered, sortBy);

    dom.search.summary.innerHTML = `Mostrando <strong>${filtered.length}</strong> de <strong>${state.jobs.length}</strong> vacantes analizadas.`;

    renderJobs(filtered);
    updateStats(filtered);
  }

  function sortJobs(jobs, by) {
    return [...jobs].sort((a, b) => {
      if (by === 'match') return b.match_score - a.match_score;
      if (by === 'salary') return parseSalary(b.salary) - parseSalary(a.salary);
      if (by === 'company') return (a.company || '').localeCompare(b.company || '');
      if (by === 'date') {
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

  // ── Render Jobs ──────────────────────────────────────────────
  function renderJobs(jobs) {
    dom.search.container.innerHTML = '';

    if (!jobs.length) {
      dom.search.container.innerHTML = `
        <div class="empty-container" style="padding:3rem;background:none;border:none;grid-column:1/-1;">
          <div class="empty-icon"><i class="fa-solid fa-filter-circle-xmark"></i></div>
          <h3>Sin resultados</h3>
          <p>Ningún empleo coincide con los filtros aplicados. Relaja los criterios.</p>
        </div>`;
      return;
    }

    dom.search.container.classList.remove('hidden');
    dom.search.empty.classList.add('hidden');

    const fragment = document.createDocumentFragment();

    jobs.forEach((job, i) => {
      const isSaved = state.savedIds.includes(job.id);
      const isDiscarded = state.discardedIds.includes(job.id);
      const score = job.match_score || 0;
      const superMatch = score >= 80;

      const barColor = score >= 70
        ? 'linear-gradient(90deg, #34d399 0%, #22d3ee 100%)'
        : score >= 50
          ? 'linear-gradient(90deg, #fbbf24 0%, #f97316 100%)'
          : 'linear-gradient(90deg, #f87171 0%, #fb923c 100%)';

      const sourceSlug = job.source.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');

      const card = document.createElement('div');
      card.className = `job-card ${superMatch ? 'super-match' : ''} ${isDiscarded ? 'dimmed' : ''}`;
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
            <span class="match-percentage" style="background:${barColor};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">${score}%</span>
            <span class="match-label">Match</span>
            <div class="match-bar-bg">
              <div class="match-bar-fill" style="width:${score}%;background:${barColor};"></div>
            </div>
          </div>
        </div>

        <div class="job-meta-row">
          <div class="meta-col"><i class="fa-solid fa-location-dot"></i> <span>${job.location}</span></div>
          <div class="meta-col"><i class="fa-solid fa-laptop-house"></i> <span>${formatModality(job.work_modality)}</span></div>
          <div class="meta-col"><i class="fa-solid fa-money-bill-wave"></i> <span>${job.salary}</span></div>
          <div class="meta-col"><i class="fa-solid fa-calendar"></i> <span>${job.date}</span></div>
          <div class="meta-col"><span class="badge platform-badge ${sourceSlug}">${job.source}</span></div>
        </div>

        ${job.matched_skills && job.matched_skills.length ? `
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
        </div>
      `;

      // Events
      card.querySelector('.job-card-title').addEventListener('click', () => showJobDetail(job));
      card.querySelector('.details-btn').addEventListener('click', () => showJobDetail(job));
      card.querySelector('.save-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSave(job.id, card.querySelector('.save-btn'));
      });
      card.querySelector('.discard-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDiscard(job.id, card, card.querySelector('.discard-btn'));
      });

      fragment.appendChild(card);
    });

    dom.search.container.appendChild(fragment);
    updateMetrics();
  }

  // ── Save / Discard ───────────────────────────────────────────
  function toggleSave(id, btn) {
    const icon = btn.querySelector('i');
    if (state.savedIds.includes(id)) {
      state.savedIds = state.savedIds.filter(x => x !== id);
      btn.classList.remove('active-save');
      icon.className = 'fa-regular fa-bookmark';
      showToast('info', 'Guardado removido', 'Empleo removido de guardados.');
    } else {
      state.savedIds.push(id);
      btn.classList.add('active-save');
      icon.className = 'fa-solid fa-bookmark';
      showToast('success', 'Empleo guardado', 'Puedes ver tus guardados con el filtro correspondiente.');

      if (state.discardedIds.includes(id)) {
        state.discardedIds = state.discardedIds.filter(x => x !== id);
        const card = document.getElementById(`card-${id}`);
        if (card) {
          card.classList.remove('dimmed');
          const db = card.querySelector('.discard-btn');
          if (db) {
            db.classList.remove('active-discard');
            db.querySelector('i').className = 'fa-solid fa-eye-slash';
          }
        }
      }
    }
    storageSet(CONFIG.STORAGE.SAVED, state.savedIds);
    storageSet(CONFIG.STORAGE.DISCARDED, state.discardedIds);
    updateMetrics();
    updateModalSaveButton(id);
  }

  function toggleDiscard(id, card, btn) {
    const icon = btn.querySelector('i');
    if (state.discardedIds.includes(id)) {
      state.discardedIds = state.discardedIds.filter(x => x !== id);
      card.classList.remove('dimmed');
      btn.classList.remove('active-discard');
      icon.className = 'fa-solid fa-eye-slash';
      btn.title = 'Descartar';
    } else {
      state.discardedIds.push(id);
      card.classList.add('dimmed');
      btn.classList.add('active-discard');
      icon.className = 'fa-solid fa-eye';
      btn.title = 'Restaurar';

      if (state.savedIds.includes(id)) {
        state.savedIds = state.savedIds.filter(x => x !== id);
        const sb = card.querySelector('.save-btn');
        if (sb) {
          sb.classList.remove('active-save');
          sb.querySelector('i').className = 'fa-regular fa-bookmark';
        }
      }
    }
    storageSet(CONFIG.STORAGE.SAVED, state.savedIds);
    storageSet(CONFIG.STORAGE.DISCARDED, state.discardedIds);
  }

  // ── Stats ────────────────────────────────────────────────────
  function updateStats(jobs) {
    dom.stats.total.textContent = jobs.length;

    if (jobs.length) {
      const total = jobs.reduce((s, j) => s + j.match_score, 0);
      const avg = Math.round(total / jobs.length);
      dom.stats.avg.textContent = `${avg}%`;
      dom.stats.high.textContent = jobs.filter(j => j.match_score >= 70).length;
      dom.metrics.avg.textContent = `${avg}%`;
    } else {
      dom.stats.avg.textContent = '0%';
      dom.stats.high.textContent = '0';
    }

    // Distribution bars
    const counts = {};
    jobs.forEach(j => { counts[j.source] = (counts[j.source] || 0) + 1; });

    const channels = ['LinkedIn', 'OCC Mundial', 'Computrabajo', 'Get on Board', 'Infojobs', 'Google (Web)'];
    const googleCount = jobs.filter(j => !channels.slice(0, -1).includes(j.source)).length;
    const toShow = Object.entries(counts).filter(([k]) => channels.includes(k));
    if (googleCount > 0) toShow.push(['Google (Web)', googleCount]);

    dom.stats.bars.innerHTML = '';

    toShow.slice(0, 6).forEach(([ch, count]) => {
      const pct = jobs.length ? Math.round((count / jobs.length) * 100) : 0;
      const slug = ch.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');
      const el = document.createElement('div');
      el.className = 'dist-bar-item';
      el.innerHTML = `
        <div class="dist-bar-meta">
          <span class="dist-name">${ch}</span>
          <span class="dist-count">${count} (${pct}%)</span>
        </div>
        <div class="dist-progress-bg">
          <div class="dist-progress-fill ${slug}" style="width:0%;" data-pct="${pct}"></div>
        </div>`;
      dom.stats.bars.appendChild(el);

      setTimeout(() => {
        const bar = el.querySelector('.dist-progress-fill');
        if (bar) bar.style.width = `${pct}%`;
      }, 100);
    });
  }

  function updateMetrics() {
    dom.metrics.jobs.textContent = state.jobs.length || '—';
    dom.metrics.saved.textContent = state.savedIds.length;
  }

  // ── Recalculate Match Scores ─────────────────────────────────
  function recalculateMatchScores() {
    if (!state.profile || !state.jobs.length) return;

    const allSkills = state.profile.all_skills_flat || [];
    const preferredRoles = (state.profile.preferred_roles || []).map(r => r.toLowerCase());
    const profileTitle = (state.profile.title || '').toLowerCase();
    const profileYears = parseInt(state.profile.experience_years || 0, 10) || 0;
    const requestedModality = dom.search.type.value || 'any';

    state.jobs.forEach(job => {
      const title = (job.title || '').toLowerCase();
      const desc = (job.description || '').toLowerCase();
      const modality = (job.work_modality || 'presencial').toLowerCase();
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

      // Modality bonus
      if (requestedModality === 'remoto') {
        score += modality === 'remoto' ? 12 : -12;
      } else if (requestedModality === 'hibrido') {
        score += modality === 'hibrido' ? 10 : modality === 'remoto' ? 3 : -6;
      } else {
        score += modality === 'presencial' ? 10 : modality === 'hibrido' ? 3 : -4;
      }

      // Seniority match
      const jobIsSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(job.title || '');
      const jobIsJunior = /junior|jr\.|entry|practicante|trainee/i.test(job.title || '');
      const profileIsSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(profileTitle) || profileYears >= 5;
      const profileIsJunior = /junior|jr\.|trainee|practicante/i.test(profileTitle) || (profileYears > 0 && profileYears <= 2);

      if (jobIsSenior && profileIsSenior) score += 12;
      else if (jobIsJunior && profileIsJunior) score += 8;
      else if (jobIsSenior && profileIsJunior) score -= 8;

      // Role match
      for (const role of preferredRoles.slice(0, 3)) {
        const parts = role.split(/[\s/|,]+/).filter(Boolean).slice(0, 2);
        if (parts.length && parts.every(p => p.length >= 4 && (title + ' ' + desc).includes(p))) {
          score += 6;
          break;
        }
      }

      job.match_score = Math.min(Math.max(Math.round(score), 0), 100);
      job.matched_skills = [...new Set(matched)];
    });

    state.jobs.sort((a, b) => b.match_score - a.match_score);
    applyFilters();
    showToast('success', 'Scores recalculados', 'Los porcentajes de match fueron actualizados.');
  }

  // ── Job Detail Modal ─────────────────────────────────────────
  function showJobDetail(job) {
    state.currentJob = job;
    state.analysisToken++;

    resetModalTabs();

    dom.modal.title.textContent = job.title;
    dom.modal.company.textContent = job.company;
    dom.modal.location.textContent = `${job.location} · ${formatModality(job.work_modality)}`;
    dom.modal.salary.textContent = job.salary;
    dom.modal.date.textContent = job.date;
    dom.modal.score.textContent = `${job.match_score}%`;
    dom.modal.desc.textContent = job.description || 'Descripción no disponible.';
    dom.modal.apply.href = job.link;

    const sourceSlug = job.source.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');
    dom.modal.source.textContent = job.source;
    dom.modal.source.className = `badge platform-badge ${sourceSlug}`;

    // Matched skills
    dom.modal.matched.innerHTML = '';
    if (job.matched_skills && job.matched_skills.length) {
      job.matched_skills.forEach(skill => {
        const badge = document.createElement('span');
        badge.className = 'skill-tag-matched';
        badge.textContent = skill;
        dom.modal.matched.appendChild(badge);
      });
    } else {
      dom.modal.matched.innerHTML = '<span style="font-size:0.82rem;color:var(--text-muted);">Ninguna habilidad directa detectada.</span>';
    }

    updateModalSaveButton(job.id);
    populateATSAnalysis(job);
    loadDeepAnalysis(job);
    generateCoverLetter(job, dom.modal.clTone.value);

    dom.modal.el.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function updateModalSaveButton(id) {
    const saved = state.savedIds.includes(id);
    dom.modal.save.innerHTML = saved
      ? '<i class="fa-solid fa-bookmark"></i> Guardado'
      : '<i class="fa-regular fa-bookmark"></i> Guardar';
    dom.modal.save.classList.toggle('btn-primary', saved);
    dom.modal.save.classList.toggle('btn-secondary', !saved);
  }

  function resetModalTabs() {
    dom.modal.tabs.forEach(b => b.classList.remove('active'));
    dom.modal.tabContents.forEach(c => c.classList.add('hidden'));
    const firstTab = dom.modal.tabs[0];
    const firstContent = document.getElementById('tab-details');
    if (firstTab) firstTab.classList.add('active');
    if (firstContent) firstContent.classList.remove('hidden');
  }

  // ── ATS Analysis ─────────────────────────────────────────────
  function populateATSAnalysis(job) {
    const score = job.match_score || 0;
    const matched = job.matched_skills || [];
    const allSkills = state.profile ? (state.profile.all_skills_flat || []) : [];
    const deepMissing = job.deep_analysis?.missing_skills_deep || [];
    const missing = deepMissing.length
      ? deepMissing
      : allSkills.filter(s => !matched.map(m => m.toLowerCase()).includes(s.toLowerCase())).slice(0, 10);

    // Breakdown
    const categories = [
      { label: 'Skills Técnicas', pct: Math.min(100, (job.deep_analysis?.signals?.matched_count || matched.length) * 14), color: 'var(--cyan)' },
      { label: 'Relevancia del Puesto', pct: score, color: 'var(--indigo)' },
      { label: 'Cobertura de Perfil', pct: allSkills.length ? Math.round(((job.deep_analysis?.matched_skills_deep || matched).length / allSkills.length) * 100) : 0, color: 'var(--green)' }
    ];

    dom.modal.atsBreakdown.innerHTML = '';
    categories.forEach(cat => {
      const el = document.createElement('div');
      el.className = 'dist-bar-item';
      el.innerHTML = `
        <div class="dist-bar-meta">
          <span class="dist-name" style="color:var(--text-body);">${cat.label}</span>
          <span class="dist-count">${cat.pct}%</span>
        </div>
        <div class="dist-progress-bg">
          <div class="dist-progress-fill" style="width:0%;background:${cat.color};" data-pct="${cat.pct}"></div>
        </div>`;
      dom.modal.atsBreakdown.appendChild(el);
      setTimeout(() => {
        const bar = el.querySelector('.dist-progress-fill');
        if (bar) bar.style.width = `${cat.pct}%`;
      }, 150);
    });

    // Missing skills
    dom.modal.atsMissing.innerHTML = '';
    if (missing.length) {
      missing.forEach(s => {
        const b = document.createElement('span');
        b.style.cssText = 'display:inline-flex;align-items:center;padding:0.18rem 0.55rem;border-radius:100px;background:var(--rose-soft);color:var(--rose);border:1px solid rgba(248,113,113,0.3);font-size:0.68rem;font-weight:600;';
        b.textContent = s;
        dom.modal.atsMissing.appendChild(b);
      });
    } else {
      dom.modal.atsMissing.innerHTML = '<span style="font-size:0.82rem;color:var(--green);">✓ Tu perfil cubre todas las habilidades detectadas.</span>';
    }

    // Recommendation
    if (job.deep_analysis?.recommendation) {
      dom.modal.atsRecommendation.textContent = job.deep_analysis.recommendation;
    } else if (score >= 75) {
      dom.modal.atsRecommendation.textContent = `Alta compatibilidad (${score}%). Tu perfil es sólido para este puesto. Se recomienda postularte de inmediato.`;
    } else if (score >= 50) {
      dom.modal.atsRecommendation.textContent = `Compatibilidad media (${score}%). Tienes varias habilidades requeridas. Considera adquirir: ${missing.slice(0, 3).join(', ')}.`;
    } else {
      dom.modal.atsRecommendation.textContent = `Compatibilidad baja (${score}%). Este puesto requiere habilidades fuera de tu perfil actual. Úsalo como referencia de desarrollo.`;
    }

    // Detected skills & risks
    renderBadgeList(dom.modal.analysisDetected, job.deep_analysis?.detected_skills || []);
    renderListItems(dom.modal.analysisRisks, job.deep_analysis?.risk_flags || []);
  }

  function renderBadgeList(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<span class="job-analysis-empty">Sin datos detectados.</span>';
      return;
    }
    items.forEach(item => {
      const badge = document.createElement('span');
      badge.className = 'skill-tag';
      badge.textContent = item;
      container.appendChild(badge);
    });
  }

  function renderListItems(container, items) {
    container.innerHTML = '';
    if (!items || !items.length) {
      container.innerHTML = '<span class="job-analysis-empty">Sin datos detectados.</span>';
      return;
    }
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'job-analysis-list-item';
      row.innerHTML = `<i class="fa-solid fa-angle-right"></i><span>${item}</span>`;
      container.appendChild(row);
    });
  }

  // ── Deep Analysis ────────────────────────────────────────────
  async function loadDeepAnalysis(job) {
    if (job.deep_analysis) {
      applyDeepAnalysis(job);
      return;
    }

    const token = ++state.analysisToken;
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/job-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job })
      });
      const json = await res.json();

      if (token !== state.analysisToken || state.currentJob?.id !== job.id) return;

      if (!res.ok || json.status !== 'success') {
        throw new Error(json.message || 'No se pudo analizar la vacante.');
      }

      job.deep_analysis = json.data;
      applyDeepAnalysis(job);
    } catch (error) {
      if (token !== state.analysisToken || state.currentJob?.id !== job.id) return;
      dom.modal.analysisStatus.textContent = 'Sin lectura completa';
      dom.modal.analysisStatus.className = 'badge match-badge-low';
      dom.modal.analysisSummary.textContent = 'No fue posible leer todo el detalle del portal.';
      renderListItems(dom.modal.analysisRisks, [error.message || 'No se pudo enriquecer la vacante.']);
      populateATSAnalysis(job);
      populateActionPlan(job);
    }
  }

  function applyDeepAnalysis(job) {
    const deep = job.deep_analysis;

    dom.modal.analysisStatus.textContent = deep.fetch_status === 'fetched' ? 'Leído del portal' : 'Parcial';
    dom.modal.analysisStatus.className = `badge ${deep.fetch_status === 'fetched' ? 'match-badge-high' : 'match-badge-medium'}`;
    dom.modal.analysisSummary.textContent = deep.summary || 'Sin resumen adicional.';
    dom.modal.analysisModality.textContent = formatModality(deep.work_modality_deep || job.work_modality);
    dom.modal.analysisSeniority.textContent = formatSeniority(deep.seniority_deep || job.seniority);
    dom.modal.analysisEmployment.textContent = deep.employment_type || 'No especificado';
    dom.modal.analysisConfidence.textContent = `${deep.confidence || 0}%`;

    if (deep.deep_description) dom.modal.desc.textContent = deep.deep_description;
    if (deep.location_deep) dom.modal.location.textContent = `${deep.location_deep} · ${formatModality(deep.work_modality_deep || job.work_modality)}`;
    if (deep.salary_deep) dom.modal.salary.textContent = deep.salary_deep;

    renderListItems(dom.modal.analysisRequirements, deep.requirements || []);
    renderListItems(dom.modal.analysisBenefits, deep.benefits || []);
    renderBadgeList(dom.modal.analysisDetected, deep.detected_skills || []);
    renderListItems(dom.modal.analysisRisks, deep.risk_flags || []);
    populateATSAnalysis(job);
    populateActionPlan(job);
  }

  // ── Action Plan ──────────────────────────────────────────────
  function populateActionPlan(job) {
    const deep = job.deep_analysis;
    const plan = deep?.action_plan;

    dom.modal.actionGaps.innerHTML = '';
    dom.modal.actionSteps.innerHTML = '';

    const gaps = plan?.gaps || [];
    if (!gaps.length) {
      const allSkills = state.profile ? (state.profile.all_skills_flat || []) : [];
      const matched = job.matched_skills || [];
      const missing = allSkills.filter(s => !matched.map(m => m.toLowerCase()).includes(s.toLowerCase())).slice(0, 5);
      if (missing.length) {
        gaps.push(`Habilidades técnicas ausentes: ${missing.join(', ')}`);
      } else {
        gaps.push('¡Sin brechas significativas! Tu perfil coincide plenamente.');
      }
    }

    gaps.forEach(gap => {
      const row = document.createElement('div');
      row.className = 'job-analysis-list-item';
      row.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:var(--yellow);font-size:0.75rem;margin-right:8px;"></i><span>${gap}</span>`;
      dom.modal.actionGaps.appendChild(row);
    });

    let steps = plan?.steps || [];
    if (!steps.length) {
      const allSkills = state.profile ? (state.profile.all_skills_flat || []) : [];
      const matched = job.matched_skills || [];
      const missing = allSkills.filter(s => !matched.map(m => m.toLowerCase()).includes(s.toLowerCase())).slice(0, 3);

      steps = [
        {
          title: 'Adquisición de Habilidades',
          icon: 'fa-book-open',
          items: missing.length
            ? [`Estudia los conceptos básicos de: ${missing.join(', ')} y realiza un proyecto personal.`]
            : ['Continúa ampliando tus conocimientos técnicos.']
        },
        {
          title: 'Optimización de CV',
          icon: 'fa-file-pen',
          items: ['Adapta tu experiencia para resaltar proyectos con tecnologías similares.',
            'Asegúrate de que tu resumen mencione tus habilidades adaptables.']
        },
        {
          title: 'Preparación de Entrevista',
          icon: 'fa-user-tie',
          items: ['Prepara historias usando la metodología STAR.',
            'Ensaya respuestas sobre proyectos técnicos complejos.']
        }
      ];
    }

    steps.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'action-plan-card';

      let itemsHtml = '';
      step.items.forEach(item => {
        itemsHtml += `
          <div class="action-plan-item">
            <i class="fa-solid fa-circle-check" style="color:var(--green);font-size:0.85rem;margin-top:2px;"></i>
            <span>${item}</span>
          </div>`;
      });

      card.innerHTML = `
        <div class="action-plan-card-header">
          <div class="action-plan-step-num">${idx + 1}</div>
          <div class="action-plan-card-title">
            <i class="fa-solid ${step.icon}"></i>
            <span>${step.title}</span>
          </div>
        </div>
        <div class="action-plan-card-body">${itemsHtml}</div>
      `;
      dom.modal.actionSteps.appendChild(card);
    });
  }

  // ── Cover Letter ─────────────────────────────────────────────
  function generateCoverLetter(job, tone) {
    const name = state.profile?.name || 'Nombre del candidato';
    const title = state.profile?.title || 'Desarrollador';
    const skills = (job.matched_skills || state.profile?.all_skills_flat || []).slice(0, 4).join(', ');
    const output = dom.modal.clText;

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

${name} | ${state.profile?.email || ''}`,

      short: `Hola ${job.company},

Me interesa la posición "${job.title}". Soy ${name}, tengo experiencia en ${skills}.

¿Podemos coordinar una entrevista?

${name}
${state.profile?.email || ''} | ${state.profile?.phone || ''}`
    };

    output.value = templates[tone] || templates.formal;

    const subject = encodeURIComponent(`Postulación — ${job.title} | ${name}`);
    const body = encodeURIComponent(output.value);
    dom.modal.clEmail.href = `mailto:reclutamiento@${job.company.toLowerCase().replace(/\s+/g, '')}.com?subject=${subject}&body=${body}`;
  }

  // ── Modal Tabs ───────────────────────────────────────────────
  function initModalTabs() {
    dom.modal.tabs.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.modal.tabs.forEach(b => b.classList.remove('active'));
        dom.modal.tabContents.forEach(c => c.classList.add('hidden'));
        btn.classList.add('active');
        const content = document.getElementById(btn.dataset.tab);
        if (content) content.classList.remove('hidden');

        if (btn.dataset.tab === 'tab-cover-letter' && state.currentJob) {
          generateCoverLetter(state.currentJob, dom.modal.clTone.value);
        }
      });
    });

    dom.modal.clRegen.addEventListener('click', () => {
      if (state.currentJob) generateCoverLetter(state.currentJob, dom.modal.clTone.value);
    });

    dom.modal.clTone.addEventListener('change', () => {
      if (state.currentJob) generateCoverLetter(state.currentJob, dom.modal.clTone.value);
    });

    dom.modal.clCopy.addEventListener('click', () => {
      const text = dom.modal.clText.value;
      if (!text) return;
      navigator.clipboard.writeText(text).then(() => {
        showToast('success', 'Copiado', 'La carta fue copiada al portapapeles.');
        dom.modal.clCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
        setTimeout(() => {
          dom.modal.clCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar Texto';
        }, 2000);
      });
    });

    dom.modal.save.addEventListener('click', () => {
      if (!state.currentJob) return;
      const card = document.getElementById(`card-${state.currentJob.id}`);
      const btn = card?.querySelector('.save-btn');
      if (btn) toggleSave(state.currentJob.id, btn);
      else {
        if (state.savedIds.includes(state.currentJob.id)) {
          state.savedIds = state.savedIds.filter(x => x !== state.currentJob.id);
        } else {
          state.savedIds.push(state.currentJob.id);
        }
        storageSet(CONFIG.STORAGE.SAVED, state.savedIds);
        updateMetrics();
      }
      updateModalSaveButton(state.currentJob.id);
    });
  }

  // ── Modal Close ──────────────────────────────────────────────
  function initModalClose() {
    dom.modal.close.addEventListener('click', () => {
      dom.modal.el.style.display = 'none';
      document.body.style.overflow = '';
    });

    dom.modal.el.addEventListener('click', (e) => {
      if (e.target === dom.modal.el) {
        dom.modal.el.style.display = 'none';
        document.body.style.overflow = '';
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.modal.el.style.display === 'block') {
        dom.modal.el.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  // ── Export ───────────────────────────────────────────────────
  async function exportJobs() {
    if (!state.jobs.length) return;

    try {
      const res = await fetch(`${CONFIG.API_URL}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobs: state.jobs })
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `empleos_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('success', 'CSV exportado', `${state.jobs.length} empleos guardados.`);
      } else {
        showToast('error', 'Error al exportar', 'Intenta de nuevo.');
      }
    } catch {
      showToast('error', 'Sin conexión', 'No se pudo conectar al servidor.');
    }
  }

  // ── Onboarding ───────────────────────────────────────────────
  function initOnboarding() {
    const done = storageGet(CONFIG.STORAGE.ONBOARDING);
    if (done) return;

    const modal = dom.onboarding.modal;
    modal.classList.add('visible');

    const steps = [
      document.getElementById('ob-step-1'),
      document.getElementById('ob-step-2'),
      document.getElementById('ob-step-3')
    ];
    const dots = dom.onboarding.dots;
    let currentStep = 0;

    const goTo = (n) => {
      steps.forEach((s, i) => s?.classList.toggle('hidden', i !== n));
      dots.forEach((d, i) => d?.classList.toggle('active', i === n));
      currentStep = n;
    };

    dom.onboarding.next1.addEventListener('click', () => goTo(1));
    dom.onboarding.next2.addEventListener('click', () => goTo(2));
    dom.onboarding.back.addEventListener('click', () => goTo(0));

    dom.onboarding.skip.addEventListener('click', () => {
      storageSet(CONFIG.STORAGE.ONBOARDING, '1');
      modal.classList.remove('visible');
    });

    dom.onboarding.finish.addEventListener('click', () => {
      storageSet(CONFIG.STORAGE.ONBOARDING, '1');
      modal.classList.remove('visible');

      const mod = dom.onboarding.modality.value;
      if (mod) dom.search.type.value = mod;
      const sal = dom.onboarding.salary.value;
      if (sal) dom.filters.salary.value = sal;

      setTimeout(() => dom.search.btn.click(), 300);
    });

    dom.onboarding.upload.addEventListener('click', () => dom.upload.cvInput.click());
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    cacheDom();

    // Load saved lists
    state.savedIds = storageGet(CONFIG.STORAGE.SAVED, []);
    state.discardedIds = storageGet(CONFIG.STORAGE.DISCARDED, []);
    updateMetrics();

    // Load profile
    loadProfile();

    // Init systems
    initUpload();
    initLatexGenerator();
    initSearch();
    initFilters();
    initProfileEditor();
    initSkillsEditor();
    initModalTabs();
    initModalClose();

    // Export
    dom.exportBtn.addEventListener('click', exportJobs);

    // Onboarding
    initOnboarding();

    console.log('🚀 PostulacionAuto Hub v2.0 cargado correctamente');
  }

  // Start
  document.addEventListener('DOMContentLoaded', init);
})();