/**
 * PostulacionAuto Hub v2.0
 * Main Controller - Optimizado y Funcional
 */

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────
    const API = '';
    const STORAGE = {
        PROFILE: 'pah_profile_v2',
        SAVED: 'pah_saved_jobs',
        DISCARDED: 'pah_discarded_jobs',
        ONBOARDING: 'pah_onboarding_done'
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

    const dom = {};

    function cacheDom() {
        dom.search = {
            btn: $('#search-btn'),
            keywords: $('#keywords'),
            modality: $('#modality'),
            location: $('#location'),
            maxResults: $('#max-results'),
            rangeVal: $('#range-value'),
            loader: $('#loader'),
            empty: $('#empty-state'),
            container: $('#jobs-container'),
            summary: $('#results-summary'),
            export: $('#export-btn')
        };

        dom.filters = {
            score: $('#min-score'),
            scoreVal: $('#score-value'),
            salary: $('#min-salary'),
            sort: $('#sort-by'),
            live: $('#live-search'),
            hide: $('#hide-discarded'),
            only: $('#only-saved'),
            chips: $$('.chip')
        };

        dom.profile = {
            name: $('#profile-name'),
            title: $('#profile-title'),
            years: $('#profile-years'),
            keywords: $('#profile-keywords'),
            source: $('#profile-source'),
            ocr: $('#profile-ocr'),
            summary: $('#profile-summary-text'),
            email: $('#detail-email'),
            phone: $('#detail-phone'),
            location: $('#detail-location'),
            linkedin: $('#link-linkedin'),
            github: $('#link-github'),
            roles: $('#roles-list'),
            languages: $('#languages-list'),
            experience: $('#experience-list'),
            education: $('#education-list'),
            certs: $('#certifications-list'),
            keywordsList: $('#keywords-list'),
            skills: $('#skills-container')
        };

        dom.edit = {
            form: $('#edit-form'),
            btn: $('#edit-profile-btn'),
            cancel: $('#edit-cancel'),
            save: $('#edit-save'),
            name: $('#edit-name'),
            title: $('#edit-title'),
            email: $('#edit-email'),
            phone: $('#edit-phone'),
            location: $('#edit-location'),
            linkedin: $('#edit-linkedin'),
            github: $('#edit-github'),
            years: $('#edit-years'),
            roles: $('#edit-roles'),
            summary: $('#edit-summary'),
            experience: $('#edit-experience'),
            languages: $('#edit-languages'),
            education: $('#edit-education'),
            certs: $('#edit-certifications')
        };

        dom.skills = {
            container: $('#skills-container'),
            btn: $('#edit-skills-btn'),
            form: $('#add-skill-form'),
            add: $('#add-skill-btn'),
            name: $('#skill-name'),
            cat: $('#skill-category')
        };

        dom.upload = {
            cv: $('#cv-zone'),
            cvInput: $('#cv-input'),
            latex: $('#latex-zone'),
            latexInput: $('#latex-input'),
            latexBtn: $('#latex-generate'),
            latexName: $('#latex-filename'),
            latexOutput: $('#latex-output'),
            latexText: $('#latex-text'),
            latexCopy: $('#latex-copy'),
            latexDownload: $('#latex-download')
        };

        dom.stats = {
            card: $('#stats-card'),
            total: $('#stat-total'),
            avg: $('#stat-avg'),
            high: $('#stat-high'),
            skills: $('#stat-skills'),
            dist: $('#distributions')
        };

        dom.metrics = {
            count: $('#header-count'),
            saved: $('#header-saved')
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
            source: $('#modal-source'),
            matched: $('#modal-matched'),
            summary: $('#modal-summary'),
            requirements: $('#modal-requirements'),
            benefits: $('#modal-benefits'),
            save: $('#modal-save'),
            apply: $('#modal-apply'),
            tabs: $$('.tab'),
            contents: $$('.tab-content'),
            atsBreakdown: $('#ats-breakdown'),
            atsMissing: $('#ats-missing'),
            atsRec: $('#ats-recommendation'),
            planGaps: $('#plan-gaps'),
            planSteps: $('#plan-steps'),
            letterText: $('#letter-text'),
            letterTone: $('#letter-tone'),
            letterRegen: $('#letter-regen'),
            letterCopy: $('#letter-copy'),
            letterEmail: $('#letter-email')
        };

        dom.toasts = $('#toasts');
    }

    // ─── TOASTS ──────────────────────────────────────────────────
    function toast(type, title, msg, duration = 4000) {
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

        dom.toasts.appendChild(el);
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

    // ─── RENDER PROFILE ──────────────────────────────────────────
    function renderProfile(profile) {
        if (!profile) return;
        state.profile = normalizeProfile(profile);
        const p = state.profile;
        const meta = p.analysis_meta || {};

        dom.profile.name.textContent = p.name || 'Sin nombre';
        dom.profile.title.textContent = p.title || 'Sin título';
        dom.profile.years.textContent = `${p.experience_years || 0} años`;
        dom.profile.keywords.textContent = (p.search_keywords || []).length;
        dom.profile.source.textContent = meta.source === 'pdf' ? 'PDF' : meta.source === 'fallback' ? 'Fallback' : 'ATS';
        dom.profile.ocr.textContent = meta.used_ocr ? 'Sí' : 'No';
        dom.profile.summary.textContent = p.summary || 'Sin resumen disponible.';
        dom.profile.email.textContent = p.email || '—';
        dom.profile.phone.textContent = p.phone || '—';
        dom.profile.location.textContent = p.location || '—';

        // Links
        const li = normalizeUrl(p.linkedin, 'linkedin');
        dom.profile.linkedin.href = li || '#';
        dom.profile.linkedin.style.opacity = li ? '' : '0.4';
        dom.profile.linkedin.style.pointerEvents = li ? '' : 'none';

        const gh = normalizeUrl(p.github, 'github');
        dom.profile.github.href = gh || '#';
        dom.profile.github.style.opacity = gh ? '' : '0.4';
        dom.profile.github.style.pointerEvents = gh ? '' : 'none';

        // Lists
        renderChips(dom.profile.roles, p.preferred_roles || []);
        renderChips(dom.profile.languages, p.languages_spoken || []);
        renderLines(dom.profile.experience, p.sections?.experience || []);
        renderLines(dom.profile.education, p.education || []);
        renderLines(dom.profile.certs, p.certifications || []);
        renderChips(dom.profile.keywordsList, (p.search_keywords || []).slice(0, 30));

        renderSkills(p.skills || {});
        fillEditForm(p);
        updateStatsSkills();
        saveProfile(p);
        syncProfile(p);
        autoFillSearch(p);
    }

    function normalizeUrl(value, type) {
        const raw = (value || '').trim();
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        const prefix = type === 'github' ? 'https://github.com/' : 'https://linkedin.com/';
        return `${prefix}${raw.replace(/^\/+/, '')}`;
    }

    function renderChips(container, items) {
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

    function renderSkills(skillsObj) {
        const labels = {
            languages: 'Lenguajes',
            backend: 'Backend',
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
            dom.profile.skills.appendChild(box);
        }
    }

    function fillEditForm(p) {
        dom.edit.name.value = p.name || '';
        dom.edit.title.value = p.title || '';
        dom.edit.email.value = p.email || '';
        dom.edit.phone.value = p.phone || '';
        dom.edit.location.value = p.location || '';
        dom.edit.linkedin.value = p.linkedin || '';
        dom.edit.github.value = p.github || '';
        dom.edit.years.value = p.experience_years || '';
        dom.edit.roles.value = (p.preferred_roles || []).join(', ');
        dom.edit.summary.value = p.summary || '';
        dom.edit.experience.value = (p.sections?.experience || []).join('\n');
        dom.edit.languages.value = (p.languages_spoken || []).join(', ');
        dom.edit.education.value = (p.education || []).join('\n');
        dom.edit.certs.value = (p.certifications || []).join('\n');
    }

    function updateStatsSkills() {
        const flat = state.profile?.all_skills_flat || [];
        dom.stats.skills.textContent = flat.length;
    }

    function autoFillSearch(p) {
        const kw = dom.search.keywords;
        if (!kw.value.trim() || kw.dataset.autofilled === '1') {
            const suggestions = getKeywords(p);
            if (suggestions.length) {
                kw.value = suggestions.join(', ');
                kw.dataset.autofilled = '1';
            }
        }
        const loc = dom.search.location;
        if ((!loc.value.trim() || loc.value === 'México') && p.location && dom.search.modality.value !== 'remoto') {
            loc.value = p.location;
            loc.dataset.autofilled = '1';
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
        dom.skills.btn.addEventListener('click', () => {
            const isEdit = dom.profile.skills.classList.toggle('edit-mode');
            dom.skills.btn.classList.toggle('active', isEdit);
            dom.skills.form.classList.toggle('hidden', !isEdit);
            dom.skills.btn.title = isEdit ? 'Salir edición' : 'Editar habilidades';
            renderSkills(state.profile?.skills || {});
        });

        dom.skills.add.addEventListener('click', () => {
            const name = dom.skills.name.value.trim();
            const cat = dom.skills.cat.value;
            if (!name) return;

            if (!state.profile.skills[cat]) state.profile.skills[cat] = [];
            if (state.profile.skills[cat].includes(name)) {
                toast('warning', 'Ya existe', `"${name}" ya está en tu perfil.`);
                return;
            }

            state.profile.skills[cat].push(name);
            state.profile.all_skills_flat = flattenSkills(state.profile.skills);
            state.profile.search_keywords = getKeywords(state.profile);
            dom.skills.name.value = '';
            renderProfile(state.profile);
            syncProfile(state.profile);
            recalcScores();
            toast('success', 'Habilidad añadida', `"${name}" agregada.`);
        });

        dom.skills.name.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dom.skills.add.click();
        });
    }

    function removeSkill(cat, skill) {
        if (!state.profile.skills[cat]) return;
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
        let snapshot = null;

        dom.edit.btn.addEventListener('click', () => {
            const isEditing = !dom.edit.form.classList.contains('hidden');
            if (isEditing) {
                cancelEdit();
            } else {
                snapshot = JSON.parse(JSON.stringify(state.profile || {}));
                fillEditForm(state.profile || {});
                dom.edit.form.classList.remove('hidden');
                dom.edit.btn.classList.add('active');
                dom.edit.btn.title = 'Cancelar edición';
            }
        });

        dom.edit.cancel.addEventListener('click', cancelEdit);
        dom.edit.save.addEventListener('click', saveEdit);

        function cancelEdit() {
            if (snapshot) fillEditForm(snapshot);
            dom.edit.form.classList.add('hidden');
            dom.edit.btn.classList.remove('active');
            dom.edit.btn.title = 'Editar perfil';
        }

        function saveEdit() {
            const updated = {
                ...state.profile,
                name: dom.edit.name.value.trim(),
                title: dom.edit.title.value.trim(),
                email: dom.edit.email.value.trim(),
                phone: dom.edit.phone.value.trim(),
                location: dom.edit.location.value.trim(),
                linkedin: dom.edit.linkedin.value.trim(),
                github: dom.edit.github.value.trim(),
                experience_years: parseInt(dom.edit.years.value) || 0,
                preferred_roles: dom.edit.roles.value.split(',').map(v => v.trim()).filter(Boolean),
                summary: dom.edit.summary.value.trim(),
                languages_spoken: dom.edit.languages.value.split(',').map(v => v.trim()).filter(Boolean),
                education: splitLines(dom.edit.education.value),
                certifications: splitLines(dom.edit.certs.value)
            };

            if (!updated.name) {
                toast('warning', 'Nombre requerido', 'Escribe tu nombre.');
                dom.edit.name.focus();
                return;
            }

            if (!updated.skills) updated.skills = {};
            if (!updated.sections) updated.sections = {};
            updated.sections.experience = splitLines(dom.edit.experience.value);
            updated.all_skills_flat = flattenSkills(updated.skills);
            updated.search_keywords = getKeywords(updated);

            state.profile = updated;
            renderProfile(updated);
            syncProfile(updated);
            snapshot = JSON.parse(JSON.stringify(updated));
            dom.edit.form.classList.add('hidden');
            dom.edit.btn.classList.remove('active');
            dom.edit.btn.title = 'Editar perfil';

            if (state.jobs.length) recalcScores();
            toast('success', 'Perfil actualizado', 'Información guardada.');
        }
    }

    // ─── UPLOAD CV ──────────────────────────────────────────────
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
            else toast('error', 'Formato inválido', 'Solo PDF.');
        });
    }

    async function uploadCV(file) {
        const zone = dom.upload.cv;
        const icon = zone.querySelector('i');

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
                setStore(STORAGE.ONBOARDING, '1');
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
        const types = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (!types.includes(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
            toast('error', 'Formato inválido', 'Usa PDF, PNG, JPG o WEBP.');
            return;
        }

        state.latexFile = file;
        state.latexFilename = `${file.name.replace(/\.[^.]+$/, '') || 'cv_latex'}.tex`;
        dom.upload.latexName.textContent = file.name;
        dom.upload.latexOutput.classList.add('hidden');
        dom.upload.latexText.value = '';
        toast('info', 'Imagen lista', 'Ahora puedes generar el LaTeX.');
    }

    function setLatexProcessing(isProcessing) {
        dom.upload.latexBtn.disabled = isProcessing;
        dom.upload.latex.classList.toggle('processing', isProcessing);
        dom.upload.latexBtn.innerHTML = isProcessing
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

            dom.upload.latexText.value = json.data?.latex || '';
            state.latexFilename = json.data?.suggested_filename || state.latexFilename;
            dom.upload.latexOutput.classList.remove('hidden');
            toast('success', 'CV LaTeX listo', 'Documento generado desde OCR local.');
        } catch {
            toast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
        } finally {
            setLatexProcessing(false);
        }
    }

    function copyLatex() {
        const text = dom.upload.latexText.value;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            toast('success', 'Copiado', 'Código copiado al portapapeles.');
        }).catch(() => {
            toast('error', 'No se pudo copiar', 'Copia manualmente.');
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

    // ─── SEARCH ──────────────────────────────────────────────────
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

        dom.search.keywords.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                performSearch();
            }
        });

        dom.search.export.addEventListener('click', exportJobs);
    }

    let stepInterval = null;

    function startLoader() {
        const steps = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6'];
        let idx = 0;

        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('active', 'done');
                el.querySelector('i').className = 'fa-regular fa-circle';
            }
        });

        const advance = () => {
            if (idx > 0 && steps[idx - 1]) {
                const prev = document.getElementById(steps[idx - 1]);
                if (prev) {
                    prev.classList.remove('active');
                    prev.classList.add('done');
                    prev.querySelector('i').className = 'fa-solid fa-circle-check';
                }
            }
            if (idx < steps.length) {
                const cur = document.getElementById(steps[idx]);
                if (cur) {
                    cur.classList.add('active');
                    cur.querySelector('i').className = 'fa-solid fa-circle-notch fa-spin';
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
        dom.search.container.innerHTML = '';
        dom.search.container.classList.remove('hidden');
        dom.search.empty.classList.add('hidden');

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
            dom.search.container.appendChild(s);
        }
    }

    async function performSearch() {
        if (state.searching) return;
        state.searching = true;

        const keywords = dom.search.keywords.value.trim();
        const location = dom.search.location.value.trim() || 'México';
        const modality = dom.search.modality.value || 'remoto';
        const max = parseInt(dom.search.maxResults.value) || 20;

        dom.search.btn.disabled = true;
        dom.search.btn.querySelector('.btn-text').classList.add('hidden');
        dom.search.btn.querySelector('.btn-spinner').classList.remove('hidden');
        dom.search.empty.classList.add('hidden');
        dom.search.container.classList.add('hidden');
        dom.stats.card.classList.add('hidden');
        dom.search.export.classList.add('hidden');
        dom.search.loader.classList.remove('hidden');
        dom.search.summary.innerHTML = 'Buscando vacantes con motor ATS v2...';

        showSkeletons(6);
        dom.search.container.classList.remove('hidden');
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
            dom.search.loader.classList.add('hidden');
            dom.search.btn.disabled = false;
            dom.search.btn.querySelector('.btn-text').classList.remove('hidden');
            dom.search.btn.querySelector('.btn-spinner').classList.add('hidden');

            if (json.status === 'success' && json.data.length) {
                state.jobs = json.data;
                dom.search.export.classList.remove('hidden');
                dom.stats.card.classList.remove('hidden');
                resetFilters();
                applyFilters();
                toast('success', 'Búsqueda completada', `${state.jobs.length} vacantes analizadas.`);
                updateMetrics();
            } else {
                state.jobs = [];
                dom.search.container.innerHTML = '';
                dom.search.container.classList.add('hidden');
                dom.search.summary.innerHTML = 'No se encontraron vacantes.';
                dom.search.empty.querySelector('h3').textContent = 'Sin resultados';
                dom.search.empty.querySelector('p').textContent = 'Prueba con otras palabras clave.';
                dom.search.empty.classList.remove('hidden');
                toast('warning', 'Sin resultados', 'Intenta ampliar las palabras clave.');
            }
        } catch {
            stopLoader();
            dom.search.loader.classList.add('hidden');
            dom.search.btn.disabled = false;
            dom.search.btn.querySelector('.btn-text').classList.remove('hidden');
            dom.search.btn.querySelector('.btn-spinner').classList.add('hidden');
            dom.search.container.innerHTML = '';
            dom.search.container.classList.add('hidden');
            dom.search.summary.textContent = 'Error de conexión.';
            dom.search.empty.querySelector('h3').textContent = 'Error de Conexión';
            dom.search.empty.querySelector('p').textContent = '¿El servidor Flask está activo?';
            dom.search.empty.classList.remove('hidden');
            toast('error', 'Error de conexión', '¿El servidor Flask está encendido?');
        } finally {
            state.searching = false;
        }
    }

    // ─── FILTERS ──────────────────────────────────────────────────
    function initFilters() {
        dom.filters.score.addEventListener('input', () => {
            dom.filters.scoreVal.textContent = `${dom.filters.score.value}%`;
            applyFilters();
        });

        dom.filters.salary.addEventListener('input', applyFilters);
        dom.filters.sort.addEventListener('change', applyFilters);
        dom.filters.live.addEventListener('input', applyFilters);
        dom.filters.hide.addEventListener('change', applyFilters);
        dom.filters.only.addEventListener('change', applyFilters);

        dom.filters.chips.forEach(chip => {
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
        dom.filters.score.value = 0;
        dom.filters.scoreVal.textContent = '0%';
        dom.filters.salary.value = '';
        dom.filters.sort.value = 'match';
        dom.filters.live.value = '';
        dom.filters.hide.checked = false;
        dom.filters.only.checked = false;
        dom.filters.chips.forEach(c => c.classList.add('active'));
        state.chips = { modality: ['remoto', 'hibrido', 'presencial'], level: ['junior', 'semi', 'senior', 'lead'] };
    }

    function applyFilters() {
        if (!state.jobs.length) return;

        const minScore = parseInt(dom.filters.score.value) || 0;
        const minSalary = parseFloat(dom.filters.salary.value) || 0;
        const sortBy = dom.filters.sort.value;
        const liveQ = dom.filters.live.value.toLowerCase().trim();
        const hide = dom.filters.hide.checked;
        const only = dom.filters.only.checked;

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

        dom.search.summary.innerHTML = `Mostrando <strong>${filtered.length}</strong> de <strong>${state.jobs.length}</strong> vacantes.`;

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
        dom.search.container.innerHTML = '';

        if (!jobs.length) {
            dom.search.container.innerHTML = `
                <div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-muted);">
                    <div style="font-size:2rem;margin-bottom:0.5rem;">🔍</div>
                    <p>No hay empleos que coincidan con los filtros aplicados.</p>
                </div>`;
            return;
        }

        dom.search.container.classList.remove('hidden');
        dom.search.empty.classList.add('hidden');

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

            card.querySelector('.details-btn').addEventListener('click', () => showJob(job));
            card.querySelector('.card-title').addEventListener('click', () => showJob(job));

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

    // ─── SAVE / DISCARD ─────────────────────────────────────────
    function toggleSave(id, btn) {
        const icon = btn.querySelector('i');
        if (state.saved.includes(id)) {
            state.saved = state.saved.filter(x => x !== id);
            btn.classList.remove('saved');
            icon.className = 'fa-regular fa-bookmark';
            toast('info', 'Guardado removido', '');
        } else {
            state.saved.push(id);
            btn.classList.add('saved');
            icon.className = 'fa-solid fa-bookmark';
            toast('success', 'Empleo guardado', '');

            if (state.discarded.includes(id)) {
                state.discarded = state.discarded.filter(x => x !== id);
                const card = document.getElementById(`card-${id}`);
                if (card) {
                    card.classList.remove('dimmed');
                    const db = card.querySelector('.discard-btn');
                    if (db) {
                        db.classList.remove('discarded');
                        db.querySelector('i').className = 'fa-solid fa-eye-slash';
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
            icon.className = 'fa-solid fa-eye-slash';
            btn.title = 'Descartar';
        } else {
            state.discarded.push(id);
            card.classList.add('dimmed');
            btn.classList.add('discarded');
            icon.className = 'fa-solid fa-eye';
            btn.title = 'Restaurar';

            if (state.saved.includes(id)) {
                state.saved = state.saved.filter(x => x !== id);
                const sb = card.querySelector('.save-btn');
                if (sb) {
                    sb.classList.remove('saved');
                    sb.querySelector('i').className = 'fa-regular fa-bookmark';
                }
            }
        }
        setStore(STORAGE.SAVED, state.saved);
        setStore(STORAGE.DISCARDED, state.discarded);
    }

    // ─── STATS ───────────────────────────────────────────────────
    function updateStats(jobs) {
        dom.stats.total.textContent = jobs.length;

        if (jobs.length) {
            const total = jobs.reduce((s, j) => s + j.match_score, 0);
            const avg = Math.round(total / jobs.length);
            dom.stats.avg.textContent = `${avg}%`;
            dom.stats.high.textContent = jobs.filter(j => j.match_score >= 70).length;
            dom.metrics.count.textContent = jobs.length;
        } else {
            dom.stats.avg.textContent = '0%';
            dom.stats.high.textContent = '0';
        }

        // Distribution
        const counts = {};
        jobs.forEach(j => { counts[j.source] = (counts[j.source] || 0) + 1; });

        const channels = ['LinkedIn', 'OCC Mundial', 'Computrabajo', 'Get on Board', 'Infojobs', 'Google (Web)'];
        const googleCount = jobs.filter(j => !channels.slice(0, -1).includes(j.source)).length;
        const toShow = Object.entries(counts).filter(([k]) => channels.includes(k));
        if (googleCount > 0) toShow.push(['Google (Web)', googleCount]);

        dom.stats.dist.innerHTML = '';

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
            dom.stats.dist.appendChild(el);

            setTimeout(() => {
                const bar = el.querySelector('.fill');
                if (bar) bar.style.width = `${pct}%`;
            }, 100);
        });
    }

    function updateMetrics() {
        dom.metrics.count.textContent = state.jobs.length || '0';
        dom.metrics.saved.textContent = state.saved.length;
    }

    // ─── RECALCULATE SCORES ─────────────────────────────────────
    function recalcScores() {
        if (!state.profile || !state.jobs.length) return;

        const allSkills = state.profile.all_skills_flat || [];
        const roles = (state.profile.preferred_roles || []).map(r => r.toLowerCase());
        const title = (state.profile.title || '').toLowerCase();
        const years = parseInt(state.profile.experience_years || 0, 10) || 0;
        const modality = dom.search.modality.value || 'any';

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

        state.jobs.sort((a, b) => b.match_score - a.match_score);
        applyFilters();
        toast('success', 'Scores recalculados', 'Los porcentajes de match fueron actualizados.');
    }

    // ─── JOB MODAL ──────────────────────────────────────────────
    function showJob(job) {
        state.currentJob = job;
        state.analysisToken++;

        resetModal();

        dom.modal.title.textContent = job.title;
        dom.modal.company.textContent = job.company;
        dom.modal.location.textContent = `${job.location} · ${formatModality(job.work_modality)}`;
        dom.modal.salary.textContent = job.salary;
        dom.modal.date.textContent = job.date;
        dom.modal.score.textContent = `${job.match_score}%`;

        const sourceSlug = job.source?.toLowerCase().replace(/[\s()]/g, '-').replace(/\./g, '') || '';
        dom.modal.source.textContent = job.source;
        dom.modal.source.className = `badge badge-platform ${sourceSlug}`;

        dom.modal.matched.innerHTML = '';
        if (job.matched_skills && job.matched_skills.length) {
            job.matched_skills.forEach(s => {
                const el = document.createElement('span');
                el.className = 'skill-tag';
                el.textContent = s;
                dom.modal.matched.appendChild(el);
            });
        } else {
            dom.modal.matched.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">Ninguna habilidad directa.</span>';
        }

        dom.modal.apply.href = job.link;
        updateModalSave(job.id);
        populateATS(job);
        loadDeep(job);
        generateLetter(job, dom.modal.letterTone.value);

        dom.modal.el.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function updateModalSave(id) {
        const saved = state.saved.includes(id);
        dom.modal.save.innerHTML = saved
            ? '<i class="fa-solid fa-bookmark"></i> Guardado'
            : '<i class="fa-regular fa-bookmark"></i> Guardar';
        dom.modal.save.classList.toggle('btn-primary', saved);
        dom.modal.save.classList.toggle('btn-ghost', !saved);
    }

    function resetModal() {
        dom.modal.tabs.forEach(b => b.classList.remove('active'));
        dom.modal.contents.forEach(c => c.classList.add('hidden'));
        const firstTab = dom.modal.tabs[0];
        const firstContent = document.getElementById('tab-desc');
        if (firstTab) firstTab.classList.add('active');
        if (firstContent) firstContent.classList.remove('hidden');
    }

    // ─── MODAL TABS ──────────────────────────────────────────────
    function initModalTabs() {
        dom.modal.tabs.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.modal.tabs.forEach(b => b.classList.remove('active'));
                dom.modal.contents.forEach(c => c.classList.add('hidden'));
                btn.classList.add('active');
                const content = document.getElementById(btn.dataset.tab);
                if (content) content.classList.remove('hidden');

                if (btn.dataset.tab === 'tab-letter' && state.currentJob) {
                    generateLetter(state.currentJob, dom.modal.letterTone.value);
                }
            });
        });

        dom.modal.letterRegen.addEventListener('click', () => {
            if (state.currentJob) generateLetter(state.currentJob, dom.modal.letterTone.value);
        });

        dom.modal.letterTone.addEventListener('change', () => {
            if (state.currentJob) generateLetter(state.currentJob, dom.modal.letterTone.value);
        });

        dom.modal.letterCopy.addEventListener('click', () => {
            const text = dom.modal.letterText.value;
            if (!text) return;
            navigator.clipboard.writeText(text).then(() => {
                toast('success', 'Copiado', 'Carta copiada al portapapeles.');
                dom.modal.letterCopy.innerHTML = '<i class="fa-solid fa-check"></i> Copiado!';
                setTimeout(() => {
                    dom.modal.letterCopy.innerHTML = '<i class="fa-solid fa-copy"></i> Copiar';
                }, 2000);
            });
        });

        dom.modal.letterEmail.addEventListener('click', () => {
            const text = dom.modal.letterText.value;
            if (!text) return;
            const subject = encodeURIComponent(`Postulación — ${state.currentJob?.title || ''}`);
            const body = encodeURIComponent(text);
            dom.modal.letterEmail.href = `mailto:reclutamiento@empresa.com?subject=${subject}&body=${body}`;
        });

        dom.modal.save.addEventListener('click', () => {
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

    // ─── MODAL CLOSE ─────────────────────────────────────────────
    function initModalClose() {
        dom.modal.close.addEventListener('click', () => {
            dom.modal.el.classList.add('hidden');
            document.body.style.overflow = '';
        });

        dom.modal.el.addEventListener('click', (e) => {
            if (e.target === dom.modal.el) {
                dom.modal.el.classList.add('hidden');
                document.body.style.overflow = '';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !dom.modal.el.classList.contains('hidden')) {
                dom.modal.el.classList.add('hidden');
                document.body.style.overflow = '';
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

        dom.modal.atsBreakdown.innerHTML = '';
        categories.forEach(cat => {
            const el = document.createElement('div');
            el.className = 'break-item';
            el.innerHTML = `
                <div class="break-meta"><span>${cat.label}</span><span>${cat.pct}%</span></div>
                <div class="break-bar"><div class="fill" style="width:0%;background:${cat.color};" data-pct="${cat.pct}"></div></div>`;
            dom.modal.atsBreakdown.appendChild(el);
            setTimeout(() => {
                const bar = el.querySelector('.fill');
                if (bar) bar.style.width = `${cat.pct}%`;
            }, 150);
        });

        dom.modal.atsMissing.innerHTML = '';
        if (missing.length) {
            missing.forEach(s => {
                const el = document.createElement('span');
                el.className = 'missing-tag';
                el.textContent = s;
                dom.modal.atsMissing.appendChild(el);
            });
        } else {
            dom.modal.atsMissing.innerHTML = '<span style="color:var(--green);">✓ Tu perfil cubre todas las habilidades.</span>';
        }

        if (job.deep_analysis?.recommendation) {
            dom.modal.atsRec.innerHTML = `<p>${job.deep_analysis.recommendation}</p>`;
        } else if (score >= 75) {
            dom.modal.atsRec.innerHTML = `<p>Alta compatibilidad (${score}%). Tu perfil es sólido. Postúlate de inmediato.</p>`;
        } else if (score >= 50) {
            dom.modal.atsRec.innerHTML = `<p>Compatibilidad media (${score}%). Considera adquirir: ${missing.slice(0, 3).join(', ')}.</p>`;
        } else {
            dom.modal.atsRec.innerHTML = `<p>Compatibilidad baja (${score}%). Úsalo como referencia de desarrollo.</p>`;
        }

        renderList(dom.modal.requirements, job.deep_analysis?.requirements || []);
        renderList(dom.modal.benefits, job.deep_analysis?.benefits || []);
    }

    function renderList(container, items) {
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
            dom.modal.atsRec.innerHTML = `<p>No se pudo enriquecer la vacante. ${error.message}</p>`;
            populateATS(job);
            populatePlan(job);
        }
    }

    function applyDeep(job) {
        const deep = job.deep_analysis;
        dom.modal.summary.textContent = deep.deep_description || deep.summary || 'Descripción no disponible.';

        if (deep.location_deep) {
            dom.modal.location.textContent = `${deep.location_deep} · ${formatModality(deep.work_modality_deep || job.work_modality)}`;
        }
        if (deep.salary_deep) dom.modal.salary.textContent = deep.salary_deep;

        renderList(dom.modal.requirements, deep.requirements || []);
        renderList(dom.modal.benefits, deep.benefits || []);
        populateATS(job);
        populatePlan(job);
    }

    // ─── PLAN DE ACCIÓN ─────────────────────────────────────────
    function populatePlan(job) {
        const deep = job.deep_analysis;
        const plan = deep?.action_plan;

        dom.modal.planGaps.innerHTML = '';
        dom.modal.planSteps.innerHTML = '';

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

        gaps.forEach(gap => {
            const el = document.createElement('div');
            el.className = 'gap-item';
            el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>${gap}</span>`;
            dom.modal.planGaps.appendChild(el);
        });

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
            dom.modal.planSteps.appendChild(card);
        });
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

        dom.modal.letterText.value = templates[tone] || templates.formal;

        const subject = encodeURIComponent(`Postulación — ${job.title} | ${name}`);
        const body = encodeURIComponent(dom.modal.letterText.value);
        dom.modal.letterEmail.href = `mailto:reclutamiento@${job.company?.toLowerCase().replace(/\s+/g, '') || 'empresa'}.com?subject=${subject}&body=${body}`;
    }

    // ─── EXPORT ──────────────────────────────────────────────────
    async function exportJobs() {
        if (!state.jobs.length) return;

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

    // ─── ONBOARDING ─────────────────────────────────────────────
    function initOnboarding() {
        const done = getStore(STORAGE.ONBOARDING);
        if (done) return;

        const modal = document.getElementById('onboarding-modal');
        modal.classList.add('visible');

        const steps = [
            document.getElementById('ob-step-1'),
            document.getElementById('ob-step-2'),
            document.getElementById('ob-step-3')
        ];
        const dots = document.querySelectorAll('.onboarding-step-dot');
        let current = 0;

        const goTo = (n) => {
            steps.forEach((s, i) => s?.classList.toggle('hidden', i !== n));
            dots.forEach((d, i) => d?.classList.toggle('active', i === n));
            current = n;
        };

        document.getElementById('ob-next-btn')?.addEventListener('click', () => goTo(1));
        document.getElementById('ob-next-btn-2')?.addEventListener('click', () => goTo(2));
        document.getElementById('ob-back-btn')?.addEventListener('click', () => goTo(0));

        document.getElementById('ob-skip-btn')?.addEventListener('click', () => {
            setStore(STORAGE.ONBOARDING, '1');
            modal.classList.remove('visible');
        });

        document.getElementById('ob-finish-btn')?.addEventListener('click', () => {
            setStore(STORAGE.ONBOARDING, '1');
            modal.classList.remove('visible');
            const mod = document.getElementById('ob-modality')?.value;
            if (mod) dom.search.modality.value = mod;
            const sal = document.getElementById('ob-salary')?.value;
            if (sal) dom.filters.salary.value = sal;
            setTimeout(() => dom.search.btn.click(), 300);
        });

        document.getElementById('ob-upload-zone')?.addEventListener('click', () => dom.upload.cvInput.click());
    }

    // ─── INIT ────────────────────────────────────────────────────
    function init() {
        cacheDom();

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
        initOnboarding();

        console.log('🚀 PostulacionAuto Hub v2.0 cargado');
    }

    document.addEventListener('DOMContentLoaded', init);
})();