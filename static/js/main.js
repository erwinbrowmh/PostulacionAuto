/**
 * PostulacionAuto Hub v2.0 - Main Controller
 * Todas las referencias DOM son verificadas antes de usar
 */

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────
    const API = '';
    const STORAGE = {
        PROFILE: 'pah_profile_v2',
        SAVED: 'pah_saved_jobs',
        DISCARDED: 'pah_discarded_jobs'
    };

    // ─── STATE ──────────────────────────────────────────────────
    const state = {
        profile: null,
        jobs: [],
        saved: [],
        discarded: [],
        currentJob: null,
        chips: { modality: ['remoto', 'hibrido', 'presencial'], level: ['junior', 'semi', 'senior', 'lead'] },
        latexFile: null,
        latexFilename: 'cv_latex.tex',
        analysisToken: 0,
        searching: false
    };

    // ─── DOM REFS ───────────────────────────────────────────────
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => [...c.querySelectorAll(s)];

    // ─── TOASTS ──────────────────────────────────────────────────
    let toastContainer = null;

    function getToastContainer() {
        if (!toastContainer) {
            toastContainer = document.getElementById('toasts');
        }
        return toastContainer;
    }

    function toast(type, title, msg, duration = 4000) {
        const container = getToastContainer();
        if (!container) return;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-circle-xmark',
            info: 'fa-circle-info',
            warning: 'fa-triangle-exclamation'
        };

        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `
            <div class="toast-icon"><i class="fa-solid ${icons[type] || icons.info}"></i></div>
            <div class="toast-body">
                <div class="toast-title">${title}</div>
                ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
            </div>
        `;

        container.appendChild(el);
        setTimeout(() => {
            el.classList.add('removing');
            el.addEventListener('animationend', () => el.remove());
        }, duration);
    }

    // ─── STORAGE ─────────────────────────────────────────────────
    function getStore(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch { return fallback; }
    }

    function setStore(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }

    // ─── PROFILE HELPERS ────────────────────────────────────────
    function flattenSkills(obj) {
        return Object.values(obj || {}).flat();
    }

    function getKeywords(profile) {
        if (!profile) return [];
        const title = (profile.title || '').split(/[\s/|,•·-]+/).filter(w => w.length >= 4);
        const roles = profile.preferred_roles || [];
        const skills = profile.all_skills_flat || [];
        const certs = profile.certifications || [];
        const edu = profile.education || [];
        const langs = profile.languages_spoken || [];
        const stored = profile.search_keywords || [];
        return [...new Set([...stored, ...roles, ...skills, ...langs, ...certs, ...edu, ...title])];
    }

    function normalizeProfile(p) {
        if (!p) return null;
        const profile = {
            ...p,
            preferred_roles: p.preferred_roles || [],
            languages_spoken: p.languages_spoken || [],
            education: p.education || [],
            certifications: p.certifications || [],
            skills: p.skills || {},
            sections: p.sections || {},
            analysis_meta: p.analysis_meta || {}
        };
        profile.all_skills_flat = flattenSkills(profile.skills);
        profile.search_keywords = getKeywords(profile);
        return profile;
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

    function formatModality(v) {
        const map = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
        return map[v] || v;
    }

    function splitLines(v) {
        return (v || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    }

    function normalizeUrl(value, type) {
        const raw = (value || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        const prefix = type === 'github' ? 'https://github.com/' : 'https://linkedin.com/';
        return `${prefix}${raw.replace(/^\/+/, '')}`;
    }

    // ─── DOM REFS CON SEGURIDAD ──────────────────────────────────
    function safeGet(selector, fallback = null) {
        const el = document.querySelector(selector);
        return el || fallback;
    }

    // ─── RENDER PROFILE ──────────────────────────────────────────
    function renderProfile(profile) {
        if (!profile) return;
        state.profile = normalizeProfile(profile);
        const p = state.profile;
        const meta = p.analysis_meta || {};

        const el = (id) => safeGet('#' + id);

        // Actualizar elementos del perfil
        const nameEl = el('profile-name');
        if (nameEl) nameEl.textContent = p.name || 'Sin nombre';

        const titleEl = el('profile-title');
        if (titleEl) titleEl.textContent = p.title || 'Sin título';

        const yearsEl = el('profile-years');
        if (yearsEl) yearsEl.textContent = `${p.experience_years || 0} años`;

        const keywordsEl = el('profile-keywords');
        if (keywordsEl) keywordsEl.textContent = (p.search_keywords || []).length;

        const sourceEl = el('profile-source');
        if (sourceEl) sourceEl.textContent = meta.source === 'pdf' ? 'PDF' : meta.source === 'fallback' ? 'Fallback' : 'ATS';

        const ocrEl = el('profile-ocr');
        if (ocrEl) ocrEl.textContent = meta.used_ocr ? 'Sí' : 'No';

        const summaryEl = el('profile-summary-text');
        if (summaryEl) summaryEl.textContent = p.summary || 'Sin resumen disponible.';

        const emailEl = el('detail-email');
        if (emailEl) emailEl.textContent = p.email || '—';

        const phoneEl = el('detail-phone');
        if (phoneEl) phoneEl.textContent = p.phone || '—';

        const locationEl = el('detail-location');
        if (locationEl) locationEl.textContent = p.location || '—';

        // Links
        const linkedinEl = el('link-linkedin');
        if (linkedinEl) {
            const li = normalizeUrl(p.linkedin, 'linkedin');
            linkedinEl.href = li || '#';
            linkedinEl.style.opacity = li ? '' : '0.4';
            linkedinEl.style.pointerEvents = li ? '' : 'none';
        }

        const githubEl = el('link-github');
        if (githubEl) {
            const gh = normalizeUrl(p.github, 'github');
            githubEl.href = gh || '#';
            githubEl.style.opacity = gh ? '' : '0.4';
            githubEl.style.pointerEvents = gh ? '' : 'none';
        }

        // Lists
        const rolesList = el('roles-list');
        if (rolesList) renderChips(rolesList, p.preferred_roles || []);

        const langsList = el('languages-list');
        if (langsList) renderChips(langsList, p.languages_spoken || []);

        const expList = el('experience-list');
        if (expList) renderLines(expList, p.sections?.experience || []);

        const eduList = el('education-list');
        if (eduList) renderLines(eduList, p.education || []);

        const certsList = el('certifications-list');
        if (certsList) renderLines(certsList, p.certifications || []);

        const keywordsList = el('keywords-list');
        if (keywordsList) renderChips(keywordsList, (p.search_keywords || []).slice(0, 30));

        // Skills
        const skillsContainer = el('skills-container');
        if (skillsContainer) renderSkills(skillsContainer, p.skills || {});

        // Edit form
        fillEditForm(p);

        // Stats
        const statsSkills = el('stat-skills');
        if (statsSkills) statsSkills.textContent = (p.all_skills_flat || []).length;

        // Guardar y sincronizar
        saveProfile(p);
        syncProfile(p);
        autoFillSearch(p);
    }

    function renderChips(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="empty-data">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const el = document.createElement('span');
            el.className = 'chip-item';
            el.textContent = item;
            container.appendChild(el);
        });
    }

    function renderLines(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="empty-data">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'line-item';
            el.innerHTML = `<i class="fa-solid fa-check"></i><span>${item}</span>`;
            container.appendChild(el);
        });
    }

    function renderSkills(container, skillsObj) {
        if (!container) return;
        const labels = {
            languages: 'Lenguajes',
            backend: 'Backend',
            infrastructure: 'Infraestructura',
            security: 'Seguridad',
            iot: 'IoT / Hardware',
            management: 'Gestión'
        };

        container.innerHTML = '';
        const isEdit = container.classList.contains('edit-mode');

        for (const [cat, skills] of Object.entries(skillsObj)) {
            if (!skills || !skills.length) continue;
            const box = document.createElement('div');
            box.className = 'skill-category';
            box.innerHTML = `<div class="cat-name">${labels[cat] || cat}</div>`;
            const badges = document.createElement('div');
            badges.className = 'skill-badges';

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
            container.appendChild(box);
        }
    }

    function fillEditForm(p) {
        if (!p) return;
        const fields = {
            'edit-name': p.name || '',
            'edit-title': p.title || '',
            'edit-email': p.email || '',
            'edit-phone': p.phone || '',
            'edit-location': p.location || '',
            'edit-linkedin': p.linkedin || '',
            'edit-github': p.github || '',
            'edit-years': p.experience_years || '',
            'edit-roles': (p.preferred_roles || []).join(', '),
            'edit-summary': p.summary || '',
            'edit-experience': (p.sections?.experience || []).join('\n'),
            'edit-languages': (p.languages_spoken || []).join(', '),
            'edit-education': (p.education || []).join('\n'),
            'edit-certifications': (p.certifications || []).join('\n')
        };

        for (const [id, value] of Object.entries(fields)) {
            const el = safeGet('#' + id);
            if (el) el.value = value;
        }
    }

    function autoFillSearch(p) {
        if (!p) return;
        const kw = safeGet('#keywords');
        if (kw && (!kw.value.trim() || kw.dataset.autofilled === '1')) {
            const suggestions = getKeywords(p);
            if (suggestions.length) {
                kw.value = suggestions.join(', ');
                kw.dataset.autofilled = '1';
            }
        }
        const loc = safeGet('#location');
        if (loc && (!loc.value.trim() || loc.value === 'México') && p.location) {
            const mod = safeGet('#modality');
            if (mod && mod.value !== 'remoto') {
                loc.value = p.location;
                loc.dataset.autofilled = '1';
            }
        }
    }

    // ─── PROFILE PERSISTENCE ────────────────────────────────────
    function saveProfile(p) {
        setStore(STORAGE.PROFILE, p);
    }

    function loadProfileFromStore() {
        return getStore(STORAGE.PROFILE);
    }

    async function syncProfile(p) {
        try {
            await fetch(`${API}/api/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
        } catch {}
    }

    async function loadProfile() {
        const cached = loadProfileFromStore();
        if (cached) {
            renderProfile(cached);
            return;
        }

        try {
            const res = await fetch(`${API}/api/profile`);
            const json = await res.json();
            if (json.status === 'success' && json.data) {
                renderProfile(json.data);
            }
        } catch {
            toast('warning', 'Sin conexión', 'No se pudo cargar el perfil.');
        }
    }

    // ─── SKILLS EDITOR ──────────────────────────────────────────
    function initSkillsEditor() {
        const btn = safeGet('#edit-skills-btn');
        const form = safeGet('#add-skill-form');
        const container = safeGet('#skills-container');

        if (!btn || !form || !container) return;

        btn.addEventListener('click', () => {
            const isEdit = container.classList.toggle('edit-mode');
            btn.classList.toggle('active', isEdit);
            form.classList.toggle('hidden', !isEdit);
            btn.title = isEdit ? 'Salir edición' : 'Editar habilidades';
            if (state.profile) renderSkills(container, state.profile.skills || {});
        });

        const addBtn = safeGet('#add-skill-btn');
        const nameInput = safeGet('#skill-name');
        const catSelect = safeGet('#skill-category');

        if (addBtn && nameInput && catSelect) {
            addBtn.addEventListener('click', () => {
                const name = nameInput.value.trim();
                const cat = catSelect.value;
                if (!name) return;

                if (!state.profile) {
                    toast('warning', 'Sin perfil', 'Carga un perfil primero.');
                    return;
                }

                if (!state.profile.skills[cat]) state.profile.skills[cat] = [];
                if (state.profile.skills[cat].includes(name)) {
                    toast('warning', 'Ya existe', `"${name}" ya está en tu perfil.`);
                    return;
                }

                state.profile.skills[cat].push(name);
                state.profile.all_skills_flat = flattenSkills(state.profile.skills);
                state.profile.search_keywords = getKeywords(state.profile);
                nameInput.value = '';
                renderProfile(state.profile);
                syncProfile(state.profile);
                recalcScores();
                toast('success', 'Habilidad añadida', `"${name}" agregada.`);
            });

            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addBtn.click();
            });
        }
    }

    function removeSkill(cat, skill) {
        if (!state.profile || !state.profile.skills[cat]) return;
        state.profile.skills[cat] = state.profile.skills[cat].filter(s => s !== skill);
        state.profile.all_skills_flat = flattenSkills(state.profile.skills);
        state.profile.search_keywords = getKeywords(state.profile);
        renderProfile(state.profile);
        syncProfile(state.profile);
        recalcScores();
        toast('info', 'Habilidad eliminada', `"${skill}" removida.`);
    }

    // ─── PROFILE EDITOR ─────────────────────────────────────────
    function initProfileEditor() {
        const btn = safeGet('#edit-profile-btn');
        const form = safeGet('#edit-form');
        const cancelBtn = safeGet('#edit-cancel');
        const saveBtn = safeGet('#edit-save');

        if (!btn || !form) return;

        let snapshot = null;

        btn.addEventListener('click', () => {
            const isEditing = !form.classList.contains('hidden');
            if (isEditing) {
                cancelEdit();
            } else {
                snapshot = JSON.parse(JSON.stringify(state.profile || {}));
                fillEditForm(state.profile || {});
                form.classList.remove('hidden');
                btn.classList.add('active');
                btn.title = 'Cancelar edición';
            }
        });

        if (cancelBtn) {
            cancelBtn.addEventListener('click', cancelEdit);
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', saveEdit);
        }

        function cancelEdit() {
            if (snapshot) fillEditForm(snapshot);
            form.classList.add('hidden');
            btn.classList.remove('active');
            btn.title = 'Editar perfil';
        }

        function saveEdit() {
            if (!state.profile) return;

            const updated = {
                ...state.profile,
                name: safeGet('#edit-name')?.value?.trim() || state.profile.name || '',
                title: safeGet('#edit-title')?.value?.trim() || state.profile.title || '',
                email: safeGet('#edit-email')?.value?.trim() || state.profile.email || '',
                phone: safeGet('#edit-phone')?.value?.trim() || state.profile.phone || '',
                location: safeGet('#edit-location')?.value?.trim() || state.profile.location || '',
                linkedin: safeGet('#edit-linkedin')?.value?.trim() || state.profile.linkedin || '',
                github: safeGet('#edit-github')?.value?.trim() || state.profile.github || '',
                experience_years: parseInt(safeGet('#edit-years')?.value) || 0,
                preferred_roles: (safeGet('#edit-roles')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
                summary: safeGet('#edit-summary')?.value?.trim() || state.profile.summary || '',
                languages_spoken: (safeGet('#edit-languages')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
                education: splitLines(safeGet('#edit-education')?.value || ''),
                certifications: splitLines(safeGet('#edit-certifications')?.value || '')
            };

            if (!updated.name) {
                toast('warning', 'Nombre requerido', 'Escribe tu nombre.');
                const nameInput = safeGet('#edit-name');
                if (nameInput) nameInput.focus();
                return;
            }

            if (!updated.skills) updated.skills = {};
            if (!updated.sections) updated.sections = {};
            updated.sections.experience = splitLines(safeGet('#edit-experience')?.value || '');
            updated.all_skills_flat = flattenSkills(updated.skills);
            updated.search_keywords = getKeywords(updated);

            state.profile = updated;
            renderProfile(updated);
            syncProfile(updated);
            snapshot = JSON.parse(JSON.stringify(updated));
            form.classList.add('hidden');
            btn.classList.remove('active');
            btn.title = 'Editar perfil';

            if (state.jobs.length) recalcScores();
            toast('success', 'Perfil actualizado', 'Información guardada.');
        }
    }

    // ─── UPLOAD CV ──────────────────────────────────────────────
    function initUpload() {
        const zone = safeGet('#cv-zone');
        const input = safeGet('#cv-input');

        if (!zone || !input) return;

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
            else toast('error', 'Formato inválido', 'Solo PDF.');
        });
    }

    async function uploadCV(file) {
        const zone = safeGet('#cv-zone');
        if (!zone) return;
        const icon = zone.querySelector('i');
        if (!icon) return;

        zone.classList.add('processing');
        icon.className = 'fa-solid fa-spinner fa-spin';
        toast('info', 'Procesando CV', 'Analizando tu currículum...');

        const fd = new FormData();
        fd.append('cv', file);

        try {
            const res = await fetch(`${API}/api/upload-cv`, { method: 'POST', body: fd });
            const json = await res.json();

            if (json.status === 'success') {
                renderProfile(json.data);
                const meta = json.data.analysis_meta || {};
                const note = meta.used_ocr ? ' usando OCR' : '';
                toast('success', 'CV procesado', `${json.data.all_skills_flat?.length || 0} habilidades detectadas${note}.`);
            } else {
                toast('error', 'Error', json.message || 'Intenta con otro archivo.');
            }
        } catch {
            toast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
        } finally {
            zone.classList.remove('processing');
            icon.className = 'fa-solid fa-cloud-arrow-up';
        }
    }

    // ─── LATEX GENERATOR ─────────────────────────────────────────
    function initLatex() {
        const zone = safeGet('#latex-zone');
        const input = safeGet('#latex-input');

        if (!zone || !input) return;

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

        const genBtn = safeGet('#latex-generate');
        if (genBtn) genBtn.addEventListener('click', generateLatex);

        const copyBtn = safeGet('#latex-copy');
        if (copyBtn) copyBtn.addEventListener('click', copyLatex);

        const dlBtn = safeGet('#latex-download');
        if (dlBtn) dlBtn.addEventListener('click', downloadLatex);
    }

    function handleLatexFile(file) {
        const types = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (!types.includes(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
            toast('error', 'Formato inválido', 'Usa PDF, PNG, JPG o WEBP.');
            return;
        }

        state.latexFile = file;
        state.latexFilename = `${file.name.replace(/\.[^.]+$/, '') || 'cv_latex'}.tex`;

        const nameEl = safeGet('#latex-filename');
        if (nameEl) nameEl.textContent = file.name;

        const outputEl = safeGet('#latex-output');
        if (outputEl) outputEl.classList.add('hidden');

        const textEl = safeGet('#latex-text');
        if (textEl) textEl.value = '';

        toast('info', 'Imagen lista', 'Ahora puedes generar el LaTeX.');
    }

    function setLatexProcessing(isProcessing) {
        const btn = safeGet('#latex-generate');
        if (!btn) return;
        btn.disabled = isProcessing;
        const zone = safeGet('#latex-zone');
        if (zone) zone.classList.toggle('processing', isProcessing);
        btn.innerHTML = isProcessing
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Generando...'
            : 'Generar';
    }

    async function generateLatex() {
        if (!state.latexFile) {
            toast('warning', 'Falta imagen', 'Selecciona primero una imagen.');
            return;
        }

        setLatexProcessing(true);
        toast('info', 'Generando LaTeX', 'Transcribiendo con OCR local...');

        const fd = new FormData();
        fd.append('image', state.latexFile);

        try {
            const res = await fetch(`${API}/api/generate-cv-latex`, { method: 'POST', body: fd });
            const json = await res.json();

            if (!res.ok || json.status !== 'success') {
                toast('error', 'Error', json.message || 'Intenta de nuevo.');
                return;
            }

            const textEl = safeGet('#latex-text');
            if (textEl) textEl.value = json.data?.latex || '';

            state.latexFilename = json.data?.suggested_filename || state.latexFilename;

            const outputEl = safeGet('#latex-output');
            if (outputEl) outputEl.classList.remove('hidden');

            toast('success', 'CV LaTeX listo', 'Documento generado desde OCR local.');
        } catch {
            toast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
        } finally {
            setLatexProcessing(false);
        }
    }

    function copyLatex() {
        const textEl = safeGet('#latex-text');
        if (!textEl || !textEl.value) return;
        navigator.clipboard.writeText(textEl.value).then(() => {
            toast('success', 'Copiado', 'Código copiado al portapapeles.');
        }).catch(() => {
            toast('error', 'No se pudo copiar', 'Copia manualmente.');
        });
    }

    function downloadLatex() {
        const textEl = safeGet('#latex-text');
        if (!textEl || !textEl.value) return;
        const blob = new Blob([textEl.value], { type: 'application/x-tex;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = state.latexFilename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    // ─── SEARCH ──────────────────────────────────────────────────
    function initSearch() {
        const maxResults = safeGet('#max-results');
        const rangeVal = safeGet('#range-value');

        if (maxResults && rangeVal) {
            maxResults.addEventListener('input', () => {
                rangeVal.textContent = maxResults.value;
            });
        }

        const btn = safeGet('#search-btn');
        if (btn) btn.addEventListener('click', performSearch);

        const keywords = safeGet('#keywords');
        if (keywords) {
            keywords.addEventListener('input', () => {
                keywords.dataset.autofilled = '0';
            });
            keywords.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    performSearch();
                }
            });
        }

        const location = safeGet('#location');
        if (location) {
            location.addEventListener('input', () => {
                location.dataset.autofilled = '0';
            });
        }

        const exportBtn = safeGet('#export-btn');
        if (exportBtn) exportBtn.addEventListener('click', exportJobs);
    }

    let stepInterval = null;

    function startLoader() {
        const steps = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6'];
        let idx = 0;

        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('active', 'done');
                const icon = el.querySelector('i');
                if (icon) icon.className = 'fa-regular fa-circle';
            }
        });

        const advance = () => {
            if (idx > 0 && steps[idx - 1]) {
                const prev = document.getElementById(steps[idx - 1]);
                if (prev) {
                    prev.classList.remove('active');
                    prev.classList.add('done');
                    const icon = prev.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-circle-check';
                }
            }
            if (idx < steps.length) {
                const cur = document.getElementById(steps[idx]);
                if (cur) {
                    cur.classList.add('active');
                    const icon = cur.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-circle-notch fa-spin';
                }
                idx++;
            }
        };

        advance();
        stepInterval = setInterval(advance, 2800);
    }

    function stopLoader() {
        if (stepInterval) {
            clearInterval(stepInterval);
            stepInterval = null;
        }
    }

    function showSkeletons(count = 6) {
        const container = safeGet('#jobs-container');
        if (!container) return;

        container.innerHTML = '';
        container.classList.remove('hidden');

        const empty = safeGet('#empty-state');
        if (empty) empty.classList.add('hidden');

        for (let i = 0; i < count; i++) {
            const s = document.createElement('div');
            s.className = 'skeleton-card';
            s.style.animationDelay = `${i * 60}ms`;
            s.innerHTML = `
                <div style="display:flex;justify-content:space-between;gap:0.75rem;">
                    <div style="flex:1;display:flex;flex-direction:column;gap:0.3rem;">
                        <div class="skeleton" style="height:14px;width:80%;"></div>
                        <div class="skeleton" style="height:10px;width:55%;"></div>
                    </div>
                    <div class="skeleton" style="width:52px;height:52px;border-radius:0.5rem;"></div>
                </div>
                <div style="display:flex;gap:0.5rem;">
                    <div class="skeleton" style="height:20px;width:30%;border-radius:100px;"></div>
                    <div class="skeleton" style="height:20px;width:20%;border-radius:100px;"></div>
                    <div class="skeleton" style="height:20px;width:25%;border-radius:100px;"></div>
                </div>
                <div class="skeleton" style="height:10px;width:80%;"></div>
                <div class="skeleton" style="height:10px;width:40%;"></div>
            `;
            container.appendChild(s);
        }
    }

    function getFallbackJobs(keyword, location, modality) {
        const kw = keyword || 'desarrollador';
        const mod = modality || 'remoto';

        const templates = [
            {
                title: `Senior ${kw.charAt(0).toUpperCase() + kw.slice(1)} Developer`,
                company: 'BairesDev',
                location: mod === 'remoto' ? 'Remoto (México)' : location || 'México',
                salary: '$45,000 - $65,000 MXN',
                date: 'Hace 2 días',
                link: 'https://mx.linkedin.com/jobs/',
                source: 'LinkedIn',
                description: `Buscamos un Ingeniero de Software con experiencia en ${kw}, APIs RESTful, SQL y Git. Trabajo 100% remoto.`,
                applicants: '45 postulantes',
                work_modality: mod
            },
            {
                title: `Desarrollador ${kw.charAt(0).toUpperCase() + kw.slice(1)} Jr`,
                company: 'Tech Solutions',
                location: location || 'México',
                salary: '$18,000 - $22,000 MXN',
                date: 'Ayer',
                link: 'https://www.computrabajo.com.mx/',
                source: 'Computrabajo',
                description: `Se solicita desarrollador junior. Conocimientos de ${kw}, HTML, CSS, JavaScript y Git.`,
                applicants: '12 postulantes',
                work_modality: 'presencial'
            },
            {
                title: `Software Engineer Lead (${kw.charAt(0).toUpperCase() + kw.slice(1)})`,
                company: 'Softtek México',
                location: mod === 'remoto' ? 'Remoto (Monterrey)' : location || 'México',
                salary: '$55,000 MXN',
                date: 'Hace 5 días',
                link: 'https://www.occ.com.mx/',
                source: 'OCC Mundial',
                description: `Liderar el diseño e implementación de sistemas empresariales. Requisitos: ${kw}, Docker, AWS, microservicios.`,
                applicants: '8 postulantes',
                work_modality: mod
            },
            {
                title: `Full Stack Developer (${kw.charAt(0).toUpperCase() + kw.slice(1)})`,
                company: 'Niuro LatAm',
                location: 'Remoto (LatAm)',
                salary: '$2,500 - $3,500 USD',
                date: 'Hace 1 semana',
                link: 'https://www.getonbrd.com/',
                source: 'Get on Board',
                description: `Join our team building fintech solutions. Stack: ${kw}, React, PostgreSQL, Docker, AWS.`,
                applicants: '19 postulantes',
                work_modality: 'remoto'
            }
        ];

        const filtered = templates.filter(j => {
            if (mod === 'remoto') return j.work_modality === 'remoto';
            if (mod === 'presencial') return j.work_modality === 'presencial';
            return true;
        });

        filtered.forEach((job, i) => {
            const baseScore = 85 - (i * 12);
            job.match_score = Math.max(baseScore, 55);
            job.matched_skills = [kw, 'Git', 'SQL', 'REST APIs'].slice(0, 3);
            job.id = `fallback_${i}`;
            job.seniority = i === 0 ? 'senior' : i === 1 ? 'junior' : 'semi';
            if (!job.work_modality) job.work_modality = mod;
        });

        return filtered;
    }

    async function performSearch() {
        if (state.searching) return;
        state.searching = true;

        const keywords = safeGet('#keywords')?.value?.trim() || '';
        const location = safeGet('#location')?.value?.trim() || 'México';
        const modality = safeGet('#modality')?.value || 'remoto';
        const max = parseInt(safeGet('#max-results')?.value) || 20;

        const btn = safeGet('#search-btn');
        if (btn) {
            btn.disabled = true;
            const text = btn.querySelector('.btn-text');
            const spinner = btn.querySelector('.btn-spinner');
            if (text) text.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
        }

        const empty = safeGet('#empty-state');
        if (empty) empty.classList.add('hidden');

        const container = safeGet('#jobs-container');
        if (container) container.classList.add('hidden');

        const statsCard = safeGet('#stats-card');
        if (statsCard) statsCard.classList.add('hidden');

        const exportBtn = safeGet('#export-btn');
        if (exportBtn) exportBtn.classList.add('hidden');

        const loader = safeGet('#loader');
        if (loader) loader.classList.remove('hidden');

        const summary = safeGet('#results-summary');
        if (summary) summary.innerHTML = 'Buscando vacantes...';

        showSkeletons(6);
        if (container) container.classList.remove('hidden');
        startLoader();

        const params = new URLSearchParams();
        if (keywords) params.set('keywords', keywords);
        params.set('location', location);
        params.set('modality', modality);
        params.set('max_results', max);

        try {
            const res = await fetch(`${API}/api/search?${params}`);
            const json = await res.json();

            stopLoader();
            if (loader) loader.classList.add('hidden');

            if (btn) {
                btn.disabled = false;
                const text = btn.querySelector('.btn-text');
                const spinner = btn.querySelector('.btn-spinner');
                if (text) text.classList.remove('hidden');
                if (spinner) spinner.classList.add('hidden');
            }

            if (json.status === 'success' && json.data && json.data.length) {
                state.jobs = json.data;
                if (exportBtn) exportBtn.classList.remove('hidden');
                if (statsCard) statsCard.classList.remove('hidden');
                resetFilters();
                applyFilters();
                toast('success', 'Búsqueda completada', `${state.jobs.length} vacantes analizadas.`);
                updateMetrics();
            } else {
                state.jobs = [];
                if (container) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                }
                if (summary) summary.innerHTML = 'No se encontraron vacantes.';
                if (empty) {
                    const h3 = empty.querySelector('h3');
                    const p = empty.querySelector('p');
                    if (h3) h3.textContent = 'Sin resultados';
                    if (p) p.textContent = 'Prueba con otras palabras clave o ubicación.';
                    empty.classList.remove('hidden');
                }
                toast('warning', 'Sin resultados', 'Intenta ampliar las palabras clave.');
            }
        } catch (err) {
            console.error('Search error:', err);
            stopLoader();
            if (loader) loader.classList.add('hidden');

            if (btn) {
                btn.disabled = false;
                const text = btn.querySelector('.btn-text');
                const spinner = btn.querySelector('.btn-spinner');
                if (text) text.classList.remove('hidden');
                if (spinner) spinner.classList.add('hidden');
            }

            // Fallback jobs
            const fallbackJobs = getFallbackJobs(keywords || 'desarrollador', location, modality);
            if (fallbackJobs.length) {
                state.jobs = fallbackJobs;
                if (exportBtn) exportBtn.classList.remove('hidden');
                if (statsCard) statsCard.classList.remove('hidden');
                resetFilters();
                applyFilters();
                toast('info', 'Datos de respaldo', 'Usando vacantes de muestra (sin conexión).');
                updateMetrics();
            } else {
                if (container) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                }
                if (summary) summary.textContent = 'Error de conexión.';
                if (empty) {
                    const h3 = empty.querySelector('h3');
                    const p = empty.querySelector('p');
                    if (h3) h3.textContent = 'Error de Conexión';
                    if (p) p.textContent = '¿El servidor Flask está activo?';
                    empty.classList.remove('hidden');
                }
                toast('error', 'Error de conexión', '¿El servidor Flask está encendido?');
            }
        } finally {
            state.searching = false;
        }
    }

    // ─── FILTERS ──────────────────────────────────────────────────
    function initFilters() {
        const score = safeGet('#min-score');
        const scoreVal = safeGet('#score-value');

        if (score && scoreVal) {
            score.addEventListener('input', () => {
                scoreVal.textContent = `${score.value}%`;
                applyFilters();
            });
        }

        const salary = safeGet('#min-salary');
        if (salary) salary.addEventListener('input', applyFilters);

        const sort = safeGet('#sort-by');
        if (sort) sort.addEventListener('change', applyFilters);

        const live = safeGet('#live-search');
        if (live) live.addEventListener('input', applyFilters);

        const hide = safeGet('#hide-discarded');
        if (hide) hide.addEventListener('change', applyFilters);

        const only = safeGet('#only-saved');
        if (only) only.addEventListener('change', applyFilters);

        // Chips
        document.querySelectorAll('.chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                const group = chip.dataset.group;
                const val = chip.dataset.value;
                const arr = state.chips[group] || [];
                if (chip.classList.contains('active')) {
                    if (!arr.includes(val)) arr.push(val);
                } else {
                    state.chips[group] = arr.filter(v => v !== val);
                }
                applyFilters();
            });
        });
    }

    function resetFilters() {
        const score = safeGet('#min-score');
        const scoreVal = safeGet('#score-value');
        const salary = safeGet('#min-salary');
        const sort = safeGet('#sort-by');
        const live = safeGet('#live-search');
        const hide = safeGet('#hide-discarded');
        const only = safeGet('#only-saved');

        if (score) score.value = 0;
        if (scoreVal) scoreVal.textContent = '0%';
        if (salary) salary.value = '';
        if (sort) sort.value = 'match';
        if (live) live.value = '';
        if (hide) hide.checked = false;
        if (only) only.checked = false;

        document.querySelectorAll('.chip').forEach(c => c.classList.add('active'));
        state.chips = { modality: ['remoto', 'hibrido', 'presencial'], level: ['junior', 'semi', 'senior', 'lead'] };
    }

    function applyFilters() {
        if (!state.jobs || !state.jobs.length) return;

        const minScore = parseInt(safeGet('#min-score')?.value) || 0;
        const minSalary = parseFloat(safeGet('#min-salary')?.value) || 0;
        const sortBy = safeGet('#sort-by')?.value || 'match';
        const liveQ = safeGet('#live-search')?.value?.toLowerCase()?.trim() || '';
        const hide = safeGet('#hide-discarded')?.checked || false;
        const only = safeGet('#only-saved')?.checked || false;

        let filtered = state.jobs.filter(job => {
            if (job.match_score < minScore) return false;

            if (minSalary > 0) {
                const parsed = parseSalary(job.salary);
                if (parsed === 0 || parsed < minSalary) return false;
            }

            const modActive = state.chips.modality || [];
            if (modActive.length < 3) {
                const title = `${job.title} ${job.location}`.toLowerCase();
                const modality = job.work_modality ||
                    (/remoto|remote|home office|teletrabajo/i.test(title) ? 'remoto' :
                        /h[íi]brido|hybrid/i.test(title) ? 'hibrido' : 'presencial');
                const isRemote = modality === 'remoto';
                const isHybrid = modality === 'hibrido';
                const isPresential = !isRemote && !isHybrid;
                const allowed = (isRemote && modActive.includes('remoto')) ||
                    (isHybrid && modActive.includes('hibrido')) ||
                    (isPresential && modActive.includes('presencial'));
                if (!allowed) return false;
            }

            const levelActive = state.chips.level || [];
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

            if (liveQ) {
                const haystack = `${job.title} ${job.company} ${job.location} ${(job.matched_skills || []).join(' ')}`.toLowerCase();
                if (!haystack.includes(liveQ)) return false;
            }

            if (hide && state.discarded.includes(job.id)) return false;
            if (only && !state.saved.includes(job.id)) return false;

            return true;
        });

        filtered = sortJobs(filtered, sortBy);

        const summary = safeGet('#results-summary');
        if (summary) {
            summary.innerHTML = `Mostrando <strong>${filtered.length}</strong> de <strong>${state.jobs.length}</strong> vacantes.`;
        }

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

    // ─── RENDER JOBS ─────────────────────────────────────────────
    function renderJobs(jobs) {
        const container = safeGet('#jobs-container');
        if (!container) return;

        container.innerHTML = '';

        if (!jobs || !jobs.length) {
            container.innerHTML = `
                <div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-muted);">
                    <div style="font-size:2rem;margin-bottom:0.5rem;">🔍</div>
                    <p>No hay empleos que coincidan con los filtros aplicados.</p>
                </div>`;
            return;
        }

        container.classList.remove('hidden');

        const empty = safeGet('#empty-state');
        if (empty) empty.classList.add('hidden');

        const fragment = document.createDocumentFragment();

        jobs.forEach((job, i) => {
            const isSaved = state.saved.includes(job.id);
            const isDiscarded = state.discarded.includes(job.id);
            const score = job.match_score || 0;
            const superMatch = score >= 80;

            const card = document.createElement('div');
            card.className = `job-card ${superMatch ? 'super-match' : ''} ${isDiscarded ? 'dimmed' : ''}`;
            card.id = `card-${job.id}`;
            card.style.animationDelay = `${i * 40}ms`;

            const sourceSlug = job.source?.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '') || '';

            card.innerHTML = `
                <div class="card-header">
                    <div>
                        <div class="card-title">
                            ${job.title}
                            ${superMatch ? `<span class="super-badge"><i class="fa-solid fa-fire"></i> Súper Match</span>` : ''}
                        </div>
                        <div class="card-company">${job.company}</div>
                    </div>
                    <div class="card-score">
                        <div class="score-value">${score}%</div>
                        <div class="score-label">Match</div>
                        <div class="score-bar"><div class="fill" style="width:${score}%;"></div></div>
                    </div>
                </div>

                <div class="card-meta">
                    <span><i class="fa-solid fa-location-dot"></i> ${job.location}</span>
                    <span><i class="fa-solid fa-laptop-house"></i> ${formatModality(job.work_modality)}</span>
                    <span><i class="fa-solid fa-money-bill"></i> ${job.salary}</span>
                    <span><i class="fa-solid fa-calendar"></i> ${job.date}</span>
                    <span class="badge badge-platform ${sourceSlug}">${job.source}</span>
                </div>

                ${job.matched_skills && job.matched_skills.length ? `
                    <div class="card-skills">
                        ${job.matched_skills.slice(0, 5).map(s => `<span class="skill-tag">${s}</span>`).join('')}
                        ${job.matched_skills.length > 5 ? `<span class="skill-tag">+${job.matched_skills.length - 5}</span>` : ''}
                    </div>` : ''}

                <div class="card-actions">
                    <div class="action-left">
                        <button class="icon-btn save-btn ${isSaved ? 'saved' : ''}" title="Guardar">
                            <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                        </button>
                        <button class="icon-btn discard-btn ${isDiscarded ? 'discarded' : ''}" title="${isDiscarded ? 'Restaurar' : 'Descartar'}">
                            <i class="fa-solid ${isDiscarded ? 'fa-eye' : 'fa-eye-slash'}"></i>
                        </button>
                    </div>
                    <button class="btn-ghost btn-sm details-btn">Ver Detalles</button>
                </div>
            `;

            const detailsBtn = card.querySelector('.details-btn');
            if (detailsBtn) detailsBtn.addEventListener('click', () => showJob(job));

            const titleEl = card.querySelector('.card-title');
            if (titleEl) titleEl.addEventListener('click', () => showJob(job));

            const saveBtn = card.querySelector('.save-btn');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSave(job.id, saveBtn);
                });
            }

            const discardBtn = card.querySelector('.discard-btn');
            if (discardBtn) {
                discardBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleDiscard(job.id, card, discardBtn);
                });
            }

            fragment.appendChild(card);
        });

        container.appendChild(fragment);
        updateMetrics();
    }

    // ─── SAVE / DISCARD ─────────────────────────────────────────
    function toggleSave(id, btn) {
        const icon = btn.querySelector('i');
        if (state.saved.includes(id)) {
            state.saved = state.saved.filter(x => x !== id);
            btn.classList.remove('saved');
            if (icon) icon.className = 'fa-regular fa-bookmark';
            toast('info', 'Guardado removido', '');
        } else {
            state.saved.push(id);
            btn.classList.add('saved');
            if (icon) icon.className = 'fa-solid fa-bookmark';
            toast('success', 'Empleo guardado', '');

            if (state.discarded.includes(id)) {
                state.discarded = state.discarded.filter(x => x !== id);
                const card = document.getElementById(`card-${id}`);
                if (card) {
                    card.classList.remove('dimmed');
                    const db = card.querySelector('.discard-btn');
                    if (db) {
                        db.classList.remove('discarded');
                        const dbIcon = db.querySelector('i');
                        if (dbIcon) dbIcon.className = 'fa-solid fa-eye-slash';
                    }
                }
            }
        }
        setStore(STORAGE.SAVED, state.saved);
        setStore(STORAGE.DISCARDED, state.discarded);
        updateMetrics();
        updateModalSave(id);
    }

    function toggleDiscard(id, card, btn) {
        const icon = btn.querySelector('i');
        if (state.discarded.includes(id)) {
            state.discarded = state.discarded.filter(x => x !== id);
            card.classList.remove('dimmed');
            btn.classList.remove('discarded');
            if (icon) icon.className = 'fa-solid fa-eye-slash';
            btn.title = 'Descartar';
        } else {
            state.discarded.push(id);
            card.classList.add('dimmed');
            btn.classList.add('discarded');
            if (icon) icon.className = 'fa-solid fa-eye';
            btn.title = 'Restaurar';

            if (state.saved.includes(id)) {
                state.saved = state.saved.filter(x => x !== id);
                const sb = card.querySelector('.save-btn');
                if (sb) {
                    sb.classList.remove('saved');
                    const sbIcon = sb.querySelector('i');
                    if (sbIcon) sbIcon.className = 'fa-regular fa-bookmark';
                }
            }
        }
        setStore(STORAGE.SAVED, state.saved);
        setStore(STORAGE.DISCARDED, state.discarded);
    }

    // ─── STATS ───────────────────────────────────────────────────
    function updateStats(jobs) {
        const totalEl = safeGet('#stat-total');
        const avgEl = safeGet('#stat-avg');
        const highEl = safeGet('#stat-high');

        if (totalEl) totalEl.textContent = jobs.length || '0';

        if (jobs && jobs.length) {
            const total = jobs.reduce((s, j) => s + (j.match_score || 0), 0);
            const avg = Math.round(total / jobs.length);
            if (avgEl) avgEl.textContent = `${avg}%`;
            if (highEl) highEl.textContent = jobs.filter(j => (j.match_score || 0) >= 70).length;

            const countEl = safeGet('#header-count');
            if (countEl) countEl.textContent = jobs.length;
        } else {
            if (avgEl) avgEl.textContent = '0%';
            if (highEl) highEl.textContent = '0';
        }

        // Distribution
        const distContainer = safeGet('#distributions');
        if (!distContainer) return;

        distContainer.innerHTML = '';

        if (!jobs || !jobs.length) return;

        const counts = {};
        jobs.forEach(j => { counts[j.source] = (counts[j.source] || 0) + 1; });

        const channels = ['LinkedIn', 'OCC Mundial', 'Computrabajo', 'Get on Board', 'Infojobs', 'Google (Web)'];
        const googleCount = jobs.filter(j => !channels.slice(0, -1).includes(j.source)).length;
        const toShow = Object.entries(counts).filter(([k]) => channels.includes(k));
        if (googleCount > 0) toShow.push(['Google (Web)', googleCount]);

        toShow.slice(0, 6).forEach(([ch, count]) => {
            const pct = jobs.length ? Math.round((count / jobs.length) * 100) : 0;
            const slug = ch.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '');
            const el = document.createElement('div');
            el.className = 'dist-item';
            el.innerHTML = `
                <div class="dist-meta">
                    <span class="name">${ch}</span>
                    <span class="count">${count} (${pct}%)</span>
                </div>
                <div class="dist-bar"><div class="fill ${slug}" style="width:0%;" data-pct="${pct}"></div></div>`;
            distContainer.appendChild(el);

            setTimeout(() => {
                const bar = el.querySelector('.fill');
                if (bar) bar.style.width = `${pct}%`;
            }, 100);
        });
    }

    function updateMetrics() {
        const countEl = safeGet('#header-count');
        if (countEl) countEl.textContent = state.jobs.length || '0';

        const savedEl = safeGet('#header-saved');
        if (savedEl) savedEl.textContent = state.saved.length;
    }

    // ─── RECALCULATE SCORES ─────────────────────────────────────
    function recalcScores() {
        if (!state.profile || !state.jobs || !state.jobs.length) return;

        const allSkills = state.profile.all_skills_flat || [];
        const roles = (state.profile.preferred_roles || []).map(r => r.toLowerCase());
        const title = (state.profile.title || '').toLowerCase();
        const years = parseInt(state.profile.experience_years || 0, 10) || 0;
        const modality = safeGet('#modality')?.value || 'any';

        state.jobs.forEach(job => {
            const jt = (job.title || '').toLowerCase();
            const desc = (job.description || '').toLowerCase();
            const mod = (job.work_modality || 'presencial').toLowerCase();
            let score = 5;
            const matched = [];
            const primary = allSkills.slice(0, 6).map(s => s.toLowerCase());

            allSkills.forEach(skill => {
                const sl = skill.toLowerCase();
                const escaped = sl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = /[#\+\.\/]/.test(sl) ? new RegExp(escaped, 'i') : new RegExp(`\\b${escaped}\\b`, 'i');
                const isPrimary = primary.includes(sl);

                if (pattern.test(jt)) {
                    score += isPrimary ? 30 : 20;
                    matched.push(skill);
                } else if (pattern.test(desc)) {
                    score += isPrimary ? 10 : 6;
                    matched.push(skill);
                }
            });

            if (modality === 'remoto') {
                score += mod === 'remoto' ? 12 : -12;
            } else if (modality === 'hibrido') {
                score += mod === 'hibrido' ? 10 : mod === 'remoto' ? 3 : -6;
            } else {
                score += mod === 'presencial' ? 10 : mod === 'hibrido' ? 3 : -4;
            }

            const jobSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(job.title || '');
            const jobJunior = /junior|jr\.|entry|practicante|trainee/i.test(job.title || '');
            const profileSenior = /senior|sr\.|lead|l[íi]der|principal|architect/i.test(title) || years >= 5;
            const profileJunior = /junior|jr\.|trainee|practicante/i.test(title) || (years > 0 && years <= 2);

            if (jobSenior && profileSenior) score += 12;
            else if (jobJunior && profileJunior) score += 8;
            else if (jobSenior && profileJunior) score -= 8;

            for (const role of roles.slice(0, 3)) {
                const parts = role.split(/[\s/|,]+/).filter(Boolean).slice(0, 2);
                if (parts.length && parts.every(p => p.length >= 4 && (jt + ' ' + desc).includes(p))) {
                    score += 6;
                    break;
                }
            }

            job.match_score = Math.min(Math.max(Math.round(score), 0), 100);
            job.matched_skills = [...new Set(matched)];
        });

        state.jobs.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
        applyFilters();
        toast('success', 'Scores recalculados', 'Los porcentajes de match fueron actualizados.');
    }

    // ─── JOB MODAL ──────────────────────────────────────────────
    function showJob(job) {
        state.currentJob = job;
        state.analysisToken++;

        resetModal();

        const titleEl = safeGet('#modal-title');
        if (titleEl) titleEl.textContent = job.title;

        const companyEl = safeGet('#modal-company');
        if (companyEl) companyEl.textContent = job.company;

        const locationEl = safeGet('#modal-location');
        if (locationEl) locationEl.textContent = `${job.location} · ${formatModality(job.work_modality)}`;

        const salaryEl = safeGet('#modal-salary');
        if (salaryEl) salaryEl.textContent = job.salary;

        const dateEl = safeGet('#modal-date');
        if (dateEl) dateEl.textContent = job.date;

        const scoreEl = safeGet('#modal-score');
        if (scoreEl) scoreEl.textContent = `${job.match_score || 0}%`;

        const sourceEl = safeGet('#modal-source');
        if (sourceEl) {
            const sourceSlug = job.source?.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '') || '';
            sourceEl.textContent = job.source;
            sourceEl.className = `badge badge-platform ${sourceSlug}`;
        }

        const matchedEl = safeGet('#modal-matched');
        if (matchedEl) {
            matchedEl.innerHTML = '';
            if (job.matched_skills && job.matched_skills.length) {
                job.matched_skills.forEach(s => {
                    const el = document.createElement('span');
                    el.className = 'skill-tag';
                    el.textContent = s;
                    matchedEl.appendChild(el);
                });
            } else {
                matchedEl.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Ninguna habilidad directa.</span>';
            }
        }

        const applyEl = safeGet('#modal-apply');
        if (applyEl) applyEl.href = job.link;

        updateModalSave(job.id);
        populateATS(job);
        loadDeep(job);

        const tone = safeGet('#letter-tone');
        if (tone) generateLetter(job, tone.value);

        const modal = safeGet('#job-modal');
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    function updateModalSave(id) {
        const saveBtn = safeGet('#modal-save');
        if (!saveBtn) return;

        const saved = state.saved.includes(id);
        saveBtn.innerHTML = saved
            ? '<i class="fa-solid fa-bookmark"></i> Guardado'
            : '<i class="fa-regular fa-bookmark"></i> Guardar';
        saveBtn.classList.toggle('btn-primary', saved);
        saveBtn.classList.toggle('btn-ghost', !saved);
    }

    function resetModal() {
        document.querySelectorAll('.modal-tabs .tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

        const firstTab = document.querySelector('.modal-tabs .tab');
        if (firstTab) firstTab.classList.add('active');

        const firstContent = document.getElementById('tab-desc');
        if (firstContent) firstContent.classList.remove('hidden');
    }

    // ─── MODAL TABS ──────────────────────────────────────────────
    function initModalTabs() {
        document.querySelectorAll('.modal-tabs .tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal-tabs .tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
                btn.classList.add('active');

                const content = document.getElementById(btn.dataset.tab);
                if (content) content.classList.remove('hidden');

                if (btn.dataset.tab === 'tab-letter' && state.currentJob) {
                    const tone = safeGet('#letter-tone');
                    if (tone) generateLetter(state.currentJob, tone.value);
                }
            });
        });

        const regenBtn = safeGet('#letter-regen');
        if (regenBtn) {
            regenBtn.addEventListener('click', () => {
                if (state.currentJob) {
                    const tone = safeGet('#letter-tone');
                    if (tone) generateLetter(state.currentJob, tone.value);
                }
            });
        }

        const toneSelect = safeGet('#letter-tone');
        if (toneSelect) {
            toneSelect.addEventListener('change', () => {
                if (state.currentJob) generateLetter(state.currentJob, toneSelect.value);
            });
        }

        const copyBtn = safeGet('#letter-copy');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textEl = safeGet('#letter-text');
                if (!textEl || !textEl.value) return;
                navigator.clipboard.writeText(textEl.value).then(() => {
                    toast('success', 'Copiado', 'Carta copiada al portapapeles.');
                    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar';
                    }, 2000);
                });
            });
        }

        const emailBtn = safeGet('#letter-email');
        if (emailBtn) {
            emailBtn.addEventListener('click', () => {
                const textEl = safeGet('#letter-text');
                if (!textEl || !textEl.value) return;
                const subject = encodeURIComponent(`Postulación — ${state.currentJob?.title || ''}`);
                const body = encodeURIComponent(textEl.value);
                emailBtn.href = `mailto:reclutamiento@empresa.com?subject=${subject}&body=${body}`;
            });
        }

        const saveBtn = safeGet('#modal-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (!state.currentJob) return;
                const card = document.getElementById(`card-${state.currentJob.id}`);
                const btn = card?.querySelector('.save-btn');
                if (btn) toggleSave(state.currentJob.id, btn);
                else {
                    if (state.saved.includes(state.currentJob.id)) {
                        state.saved = state.saved.filter(x => x !== state.currentJob.id);
                    } else {
                        state.saved.push(state.currentJob.id);
                    }
                    setStore(STORAGE.SAVED, state.saved);
                    updateMetrics();
                }
                updateModalSave(state.currentJob.id);
            });
        }
    }

    // ─── MODAL CLOSE ─────────────────────────────────────────────
    function initModalClose() {
        const closeBtn = safeGet('#modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const modal = safeGet('#job-modal');
                if (modal) modal.classList.add('hidden');
                document.body.style.overflow = '';
            });
        }

        const modal = safeGet('#job-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.add('hidden');
                    document.body.style.overflow = '';
                }
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modalEl = safeGet('#job-modal');
                if (modalEl && !modalEl.classList.contains('hidden')) {
                    modalEl.classList.add('hidden');
                    document.body.style.overflow = '';
                }
            }
        });
    }

    // ─── ATS ANALYSIS ────────────────────────────────────────────
    function populateATS(job) {
        const score = job.match_score || 0;
        const matched = job.matched_skills || [];
        const allSkills = state.profile?.all_skills_flat || [];
        const deepMissing = job.deep_analysis?.missing_skills_deep || [];
        const missing = deepMissing.length
            ? deepMissing
            : allSkills.filter(s => !matched.map(m => m.toLowerCase()).includes(s.toLowerCase())).slice(0, 10);

        const categories = [
            { label: 'Skills Técnicas', pct: Math.min(100, (job.deep_analysis?.signals?.matched_count || matched.length) * 14), color: 'var(--cyan)' },
            { label: 'Relevancia', pct: score, color: 'var(--indigo)' },
            { label: 'Cobertura', pct: allSkills.length ? Math.round(((job.deep_analysis?.matched_skills_deep || matched).length / allSkills.length) * 100) : 0, color: 'var(--green)' }
        ];

        const breakdownEl = safeGet('#ats-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = '';
            categories.forEach(cat => {
                const el = document.createElement('div');
                el.className = 'break-item';
                el.innerHTML = `
                    <div class="break-meta"><span>${cat.label}</span><span>${cat.pct}%</span></div>
                    <div class="break-bar"><div class="fill" style="width:0%;background:${cat.color};" data-pct="${cat.pct}"></div></div>`;
                breakdownEl.appendChild(el);
                setTimeout(() => {
                    const bar = el.querySelector('.fill');
                    if (bar) bar.style.width = `${cat.pct}%`;
                }, 150);
            });
        }

        const missingEl = safeGet('#ats-missing');
        if (missingEl) {
            missingEl.innerHTML = '';
            if (missing.length) {
                missing.forEach(s => {
                    const el = document.createElement('span');
                    el.className = 'missing-tag';
                    el.textContent = s;
                    missingEl.appendChild(el);
                });
            } else {
                missingEl.innerHTML = '<span style="color:var(--green);">✓ Tu perfil cubre todas las habilidades.</span>';
            }
        }

        const recEl = safeGet('#ats-recommendation');
        if (recEl) {
            if (job.deep_analysis?.recommendation) {
                recEl.innerHTML = `<p>${job.deep_analysis.recommendation}</p>`;
            } else if (score >= 75) {
                recEl.innerHTML = `<p>Alta compatibilidad (${score}%). Tu perfil es sólido. Postúlate de inmediato.</p>`;
            } else if (score >= 50) {
                recEl.innerHTML = `<p>Compatibilidad media (${score}%). Considera adquirir: ${missing.slice(0, 3).join(', ')}.</p>`;
            } else {
                recEl.innerHTML = `<p>Compatibilidad baja (${score}%). Úsalo como referencia de desarrollo.</p>`;
            }
        }

        const reqEl = safeGet('#modal-requirements');
        if (reqEl) renderList(reqEl, job.deep_analysis?.requirements || []);

        const benEl = safeGet('#modal-benefits');
        if (benEl) renderList(benEl, job.deep_analysis?.benefits || []);
    }

    function renderList(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="empty-data">Sin datos detectados.</span>';
            return;
        }
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.innerHTML = `<i class="fa-solid fa-angle-right"></i><span>${item}</span>`;
            container.appendChild(el);
        });
    }

    // ─── DEEP ANALYSIS ───────────────────────────────────────────
    async function loadDeep(job) {
        if (job.deep_analysis) {
            applyDeep(job);
            return;
        }

        const token = ++state.analysisToken;
        try {
            const res = await fetch(`${API}/api/job-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ job })
            });
            const json = await res.json();

            if (token !== state.analysisToken || state.currentJob?.id !== job.id) return;

            if (!res.ok || json.status !== 'success') {
                throw new Error(json.message || 'No se pudo analizar.');
            }

            job.deep_analysis = json.data;
            applyDeep(job);
        } catch (error) {
            if (token !== state.analysisToken || state.currentJob?.id !== job.id) return;
            const recEl = safeGet('#ats-recommendation');
            if (recEl) recEl.innerHTML = `<p>No se pudo enriquecer la vacante. ${error.message}</p>`;
            populateATS(job);
            populatePlan(job);
        }
    }

    function applyDeep(job) {
        const deep = job.deep_analysis;

        const summaryEl = safeGet('#modal-summary');
        if (summaryEl) summaryEl.textContent = deep.deep_description || deep.summary || 'Descripción no disponible.';

        if (deep.location_deep) {
            const locEl = safeGet('#modal-location');
            if (locEl) locEl.textContent = `${deep.location_deep} · ${formatModality(deep.work_modality_deep || job.work_modality)}`;
        }

        if (deep.salary_deep) {
            const salEl = safeGet('#modal-salary');
            if (salEl) salEl.textContent = deep.salary_deep;
        }

        const reqEl = safeGet('#modal-requirements');
        if (reqEl) renderList(reqEl, deep.requirements || []);

        const benEl = safeGet('#modal-benefits');
        if (benEl) renderList(benEl, deep.benefits || []);

        populateATS(job);
        populatePlan(job);
    }

    // ─── PLAN DE ACCIÓN ─────────────────────────────────────────
    function populatePlan(job) {
        const deep = job.deep_analysis;
        const plan = deep?.action_plan;

        const gapsEl = safeGet('#plan-gaps');
        const stepsEl = safeGet('#plan-steps');

        if (gapsEl) gapsEl.innerHTML = '';
        if (stepsEl) stepsEl.innerHTML = '';

        const gaps = plan?.gaps || [];
        if (!gaps.length) {
            const allSkills = state.profile?.all_skills_flat || [];
            const matched = job.matched_skills || [];
            const missing = allSkills.filter(s => !matched.map(m => m.toLowerCase()).includes(s.toLowerCase())).slice(0, 5);
            if (missing.length) {
                gaps.push(`Habilidades técnicas ausentes: ${missing.join(', ')}`);
            } else {
                gaps.push('¡Sin brechas significativas! Tu perfil coincide plenamente.');
            }
        }

        if (gapsEl) {
            gaps.forEach(gap => {
                const el = document.createElement('div');
                el.className = 'gap-item';
                el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>${gap}</span>`;
                gapsEl.appendChild(el);
            });
        }

        let steps = plan?.steps || [];
        if (!steps.length) {
            const allSkills = state.profile?.all_skills_flat || [];
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

        if (stepsEl) {
            steps.forEach((step, idx) => {
                const card = document.createElement('div');
                card.className = 'step-card';

                let itemsHtml = '';
                step.items.forEach(item => {
                    itemsHtml += `
                        <div class="item">
                            <i class="fa-solid fa-circle-check"></i>
                            <span>${item}</span>
                        </div>`;
                });

                card.innerHTML = `
                    <div class="step-head">
                        <div class="num">${idx + 1}</div>
                        <div class="title"><i class="fa-solid ${step.icon}"></i>${step.title}</div>
                    </div>
                    <div class="step-body">${itemsHtml}</div>
                `;
                stepsEl.appendChild(card);
            });
        }
    }

    // ─── CARTA DE PRESENTACIÓN ──────────────────────────────────
    function generateLetter(job, tone) {
        const name = state.profile?.name || 'Nombre del candidato';
        const title = state.profile?.title || 'Desarrollador';
        const skills = (job.matched_skills || state.profile?.all_skills_flat || []).slice(0, 4).join(', ');

        const templates = {
            formal: `Estimado equipo de Reclutamiento de ${job.company},

Me dirijo a ustedes con gran interés en la posición de "${job.title}" publicada en ${job.source}. Soy ${name}, ${title} con experiencia en ${skills}.

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

        const textEl = safeGet('#letter-text');
        if (textEl) textEl.value = templates[tone] || templates.formal;

        const subject = encodeURIComponent(`Postulación — ${job.title} | ${name}`);
        const body = encodeURIComponent(textEl?.value || '');

        const emailBtn = safeGet('#letter-email');
        if (emailBtn) {
            emailBtn.href = `mailto:reclutamiento@${job.company?.toLowerCase().replace(/\s+/g, '') || 'empresa'}.com?subject=${subject}&body=${body}`;
        }
    }

    // ─── EXPORT ──────────────────────────────────────────────────
    async function exportJobs() {
        if (!state.jobs || !state.jobs.length) return;

        try {
            const res = await fetch(`${API}/api/export`, {
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
                toast('success', 'CSV exportado', `${state.jobs.length} empleos.`);
            } else {
                toast('error', 'Error', 'Intenta de nuevo.');
            }
        } catch {
            toast('error', 'Sin conexión', 'No se pudo conectar.');
        }
    }

    // ─── INIT ────────────────────────────────────────────────────
    function init() {
        state.saved = getStore(STORAGE.SAVED, []);
        state.discarded = getStore(STORAGE.DISCARDED, []);
        updateMetrics();

        loadProfile();
        initUpload();
        initLatex();
        initSearch();
        initFilters();
        initProfileEditor();
        initSkillsEditor();
        initModalTabs();
        initModalClose();

        console.log('🚀 PostulacionAuto Hub v2.0 cargado correctamente');
    }

    document.addEventListener('DOMContentLoaded', init);
})();