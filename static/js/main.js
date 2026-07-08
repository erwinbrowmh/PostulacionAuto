/**
 * PostulacionAuto Hub v2.0 - Main Controller
 * Con Bootstrap, navegación por secciones y OCR en navegador
 */

(function () {
    'use strict';

    // ─── CONFIG ──────────────────────────────────────────────────
    const API = '';
    const ENABLE_CLIENT_FALLBACK = ['localhost', '127.0.0.1'].includes(window.location.hostname);
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
        latexFilename: 'cv_ats_optimizado.docx',
        latexDocxB64: null,   // base64 del DOCX generado por el servidor
        latexPlainText: '',   // texto plano ATS
        analysisToken: 0,
        profileLoadToken: 0,
        searching: false,
        currentSection: 'profile'
    };
    const LEGACY_KEYWORD_SEED = 'PHP, Flutter, Desarrollador, Sistemas, Laravel';
    // #region debug-point C:prod-search-debug
    function debugEmit(hypothesisId, message, data = {}) {
        fetch('http://127.0.0.1:7777/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: 'production-scrapers',
                runId: 'pre',
                hypothesisId,
                location: 'static/js/main.js',
                msg: `[DEBUG] ${message}`,
                data,
                ts: Date.now()
            })
        }).catch(() => {});
    }
    // #endregion
    const MEXICO_LOCATIONS = [
        'México', 'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
        'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
        'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
        'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
        'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
    ];

    // ─── DOM REFS ───────────────────────────────────────────────
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => [...c.querySelectorAll(s)];

    // ─── NAVEGACIÓN ──────────────────────────────────────────────
    function initNavigation() {
        const navLinks = $$('.nav-link[data-section]');
        const sections = {
            profile: document.getElementById('section-profile'),
            search: document.getElementById('section-search'),
            latex: document.getElementById('section-latex'),
            saved: document.getElementById('section-saved')
        };

        function showSection(section) {
            Object.values(sections).forEach(el => {
                if (el) el.classList.add('hidden');
            });
            if (sections[section]) {
                sections[section].classList.remove('hidden');
            }
            navLinks.forEach(link => {
                link.classList.toggle('active', link.dataset.section === section);
            });
            state.currentSection = section;
            if (section === 'search') {
                setTimeout(() => {
                    autoResizeTextarea(safeGet('#keywords'));
                }, 0);
            }
        }

        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showSection(link.dataset.section);
            });
        });

        showSection('profile');
    }

    // ─── TOASTS ──────────────────────────────────────────────────
    function toast(type, title, msg, duration = 4000) {
        const container = document.getElementById('toasts');
        if (!container) return;

        const icons = {
            success: 'bi-check-circle-fill',
            error: 'bi-x-circle-fill',
            info: 'bi-info-circle-fill',
            warning: 'bi-exclamation-triangle-fill'
        };

        const colors = {
            success: 'text-success',
            error: 'text-danger',
            info: 'text-primary',
            warning: 'text-warning'
        };

        const el = document.createElement('div');
        el.className = `toast align-items-center border-0 show toast-${type}`;
        el.role = 'alert';
        el.innerHTML = `
            <div class="d-flex gap-2 align-items-center">
                <i class="bi ${icons[type] || icons.info} ${colors[type] || colors.info} fs-5"></i>
                <div class="flex-grow-1">
                    <div class="fw-semibold small">${title}</div>
                    ${msg ? `<div class="text-muted small">${msg}</div>` : ''}
                </div>
                <button type="button" class="btn-close btn-close-white btn-sm" data-bs-dismiss="toast"></button>
            </div>
        `;

        container.appendChild(el);
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
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

    function sanitizeKeywordList(values) {
        const output = [];
        const seen = new Set();
        (values || []).forEach(value => {
            toKeywordCandidates(value).forEach(clean => {
                if (!clean) return;
                if (clean.length < 2 || clean.length > 40) return;
                if (/^[,.;:()\-]+$/.test(clean)) return;
                if (/[|,:]/.test(clean)) return;
                if (/\b(19|20)\d{2}\b/.test(clean)) return;
                if (/\d/.test(clean)) return;
                if (/^[\d\s.%+-]+$/.test(clean)) return;
                if (clean.split(' ').filter(Boolean).length > 4) return;
                const lowered = clean.toLowerCase();
                if (seen.has(lowered)) return;
                seen.add(lowered);
                output.push(clean);
            });
        });
        return output;
    }

    function toKeywordCandidates(value) {
        const raw = String(value || '').replace(/\s+/g, ' ').trim();
        if (!raw) return [];
        const candidates = [raw];
        if (/\d/.test(raw)) {
            let clean = raw.replace(/\((?=[^)]*\d)[^)]*\)/g, ' ');
            clean = clean.replace(/\d+(?:[.,]\d+)*%?/g, ' ');
            clean = clean.replace(/\s+/g, ' ').trim().replace(/[\/()\-]+$/, '').trim();
            if (clean) candidates.push(clean);
        }
        const output = [];
        candidates.forEach(candidate => {
            semanticKeywordCandidates(candidate).forEach(item => output.push(item));
        });
        return [...new Set(output)];
    }

    function semanticKeywordCandidates(value) {
        const clean = String(value || '').replace(/\s+/g, ' ').trim().replace(/^[,.;:\-]+|[,.;:\-]+$/g, '');
        if (!clean) return [];
        const lowered = clean.toLowerCase();
        if (['freelance', 'autonomo', 'autónomo', 'lider de proyecto', 'project lead'].includes(lowered)) return [];

        let variants = [];
        let keepOriginal = true;
        const wrapperPatterns = [
            /^especialista en (.+)$/i,
            /^ingeniero en (.+)$/i,
            /^desarrollador(?:a)? (.+)$/i,
            /^developer (.+)$/i,
            /^becario de (.+)$/i,
            /^lider de proyecto\s*[-:]\s*(.+)$/i,
            /^(.+?)\s+developer$/i
        ];
        for (const pattern of wrapperPatterns) {
            const match = clean.match(pattern);
            if (match) {
                keepOriginal = false;
                variants.push(match[1].trim());
                break;
            }
        }
        const comboMatch = clean.match(/^(frontend|backend)\s+(.+)$/i);
        if (comboMatch) {
            keepOriginal = false;
            variants.push(comboMatch[1][0].toUpperCase() + comboMatch[1].slice(1).toLowerCase());
            variants.push(comboMatch[2].trim());
        }
        if (keepOriginal) variants.push(clean);

        const featureMap = [
            [/\bfull stack\b/i, 'Full Stack'],
            [/\bfrontend\b/i, 'Frontend'],
            [/\bbackend\b/i, 'Backend'],
            [/\bjava\b/i, 'Java'],
            [/\bangular\b/i, 'Angular'],
            [/\bflutter\b/i, 'Flutter'],
            [/\bciberseguridad\b/i, 'Ciberseguridad'],
            [/\binfraestructura ti\b/i, 'Infraestructura TI']
        ];
        featureMap.forEach(([pattern, label]) => {
            if (pattern.test(lowered)) variants.push(label);
        });
        const normalizedVariants = [];
        variants.forEach(value => {
            const comboMatchInner = value.match(/^(frontend|backend)\s+(.+)$/i);
            if (comboMatchInner) {
                normalizedVariants.push(comboMatchInner[1][0].toUpperCase() + comboMatchInner[1].slice(1).toLowerCase());
                normalizedVariants.push(comboMatchInner[2].trim());
            } else {
                normalizedVariants.push(value);
            }
        });
        return [...new Set(normalizedVariants.map(v => v.trim()).filter(Boolean))];
    }

    function getKeywords(profile) {
        if (!profile) return [];
        const title = profile.title ? [profile.title] : [];
        const roles = profile.preferred_roles || [];
        const skills = profile.all_skills_flat || [];
        const expTitles = (profile.experience || []).map(exp => exp.title).filter(Boolean);
        const stored = profile.search_keywords || [];
        return sanitizeKeywordList([...stored, ...roles, ...skills, ...expTitles, ...title]);
    }

    function normalizeProfile(p) {
        if (!p) return null;
        const profile = {
            ...p,
            preferred_roles: p.preferred_roles || [],
            languages_spoken: p.languages_spoken || [],
            education: p.education || [],
            education_entries: p.education_entries || [],
            certifications: p.certifications || [],
            certification_entries: p.certification_entries || [],
            language_entries: p.language_entries || [],
            experience: p.experience || [],
            skills: p.skills || {},
            sections: p.sections || {},
            analysis_meta: p.analysis_meta || {}
        };
        profile.all_skills_flat = (p.all_skills_flat && p.all_skills_flat.length)
            ? sanitizeKeywordList(p.all_skills_flat)
            : sanitizeKeywordList(flattenSkills(profile.skills));
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

    function safeGet(selector) {
        return document.querySelector(selector);
    }

    function autoResizeTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 92), 140)}px`;
    }

    function stripAccents(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function normalizeLocationOption(rawLocation) {
        const clean = String(rawLocation || '').trim();
        if (!clean) return 'México';
        const normalized = stripAccents(clean.toLowerCase());
        const aliases = {
            'mexico': 'México',
            'nacional': 'México',
            'veracruz, mexico': 'Veracruz',
            'veracruz': 'Veracruz',
            'cdmx': 'Ciudad de México',
            'ciudad de mexico': 'Ciudad de México',
            'nuevo leon': 'Nuevo León',
            'queretaro': 'Querétaro',
            'michoacan': 'Michoacán',
            'yucatan': 'Yucatán'
        };
        const direct = aliases[normalized];
        if (direct) return direct;
        const found = MEXICO_LOCATIONS.find(item => normalized.includes(stripAccents(item.toLowerCase())));
        return found || 'México';
    }

    // ─── RENDER PROFILE ──────────────────────────────────────────
    function renderProfile(profile) {
        if (!profile) return;
        state.profile = normalizeProfile(profile);
        const p = state.profile;
        const meta = p.analysis_meta || {};

        const el = (id) => safeGet('#' + id);

        const nameEl = el('profile-name');
        if (nameEl) nameEl.textContent = p.name || 'Sin nombre';

        const titleEl = el('profile-title');
        if (titleEl) titleEl.textContent = p.title || 'Sin título';

        const yearsEl = el('profile-years');
        if (yearsEl) yearsEl.textContent = `${p.experience_years || 0}`;

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

        const rolesList = el('roles-list');
        if (rolesList) renderChips(rolesList, p.preferred_roles || []);

        const langsList = el('languages-list');
        if (langsList) renderLanguageEntries(langsList, p.language_entries || p.languages_spoken || []);

        const expList = el('experience-list');
        if (expList) renderExperienceEntries(expList, p.experience || p.sections?.experience || []);

        const eduList = el('education-list');
        if (eduList) renderEducationEntries(eduList, p.education_entries || p.education || []);

        const certsList = el('certifications-list');
        if (certsList) renderCertificationEntries(certsList, p.certification_entries || p.certifications || []);

        const keywordsList = el('keywords-list');
        if (keywordsList) renderChips(keywordsList, p.search_keywords || []);

        const skillsContainer = el('skills-container');
        if (skillsContainer) renderSkills(skillsContainer, p.skills || {});

        fillEditForm(p);

        const skillsStat = el('stat-skills-profile');
        if (skillsStat) skillsStat.textContent = (p.all_skills_flat || []).length;

        const keywordsStat = el('stat-keywords-profile');
        if (keywordsStat) keywordsStat.textContent = (p.search_keywords || []).length;

        const rolesStat = el('stat-roles-profile');
        if (rolesStat) rolesStat.textContent = (p.preferred_roles || []).length;

        const expStat = el('stat-experience-profile');
        if (expStat) expStat.textContent = p.experience_years || 0;

        saveProfile(p);
        autoFillSearch(p);
    }

    function renderChips(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="text-muted small">Sin datos</span>';
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
            container.innerHTML = '<span class="text-muted small">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'line-item';
            el.innerHTML = `<i class="bi bi-check-circle-fill"></i><span>${item}</span>`;
            container.appendChild(el);
        });
    }

    function renderExperienceEntries(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="text-muted small">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'line-item';
            if (typeof item === 'string') {
                row.innerHTML = `<i class="bi bi-briefcase-fill"></i><span>${item}</span>`;
            } else {
                const title = [item.title, item.company].filter(Boolean).join(' | ');
                const dates = item.dates ? `<div class="small text-muted mt-1">${item.dates}</div>` : '';
                row.innerHTML = `<i class="bi bi-briefcase-fill"></i><span><strong>${title || 'Experiencia'}</strong>${dates}</span>`;
            }
            container.appendChild(row);
        });
    }

    function renderEducationEntries(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="text-muted small">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'line-item';
            if (typeof item === 'string') {
                row.innerHTML = `<i class="bi bi-mortarboard-fill"></i><span>${item}</span>`;
            } else {
                const main = [item.degree, item.school].filter(Boolean).join(' | ');
                const date = item.date ? `<div class="small text-muted mt-1">${item.date}</div>` : '';
                row.innerHTML = `<i class="bi bi-mortarboard-fill"></i><span><strong>${main || 'Educación'}</strong>${date}</span>`;
            }
            container.appendChild(row);
        });
    }

    function renderCertificationEntries(container, items) {
        if (!container) return;
        container.innerHTML = '';
        if (!items || !items.length) {
            container.innerHTML = '<span class="text-muted small">Sin datos</span>';
            return;
        }
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'line-item';
            if (typeof item === 'string') {
                row.innerHTML = `<i class="bi bi-award-fill"></i><span>${item}</span>`;
            } else {
                const main = [item.name, item.issuer].filter(Boolean).join(' | ');
                const date = item.date ? `<div class="small text-muted mt-1">${item.date}</div>` : '';
                row.innerHTML = `<i class="bi bi-award-fill"></i><span><strong>${main || 'Certificación'}</strong>${date}</span>`;
            }
            container.appendChild(row);
        });
    }

    function renderLanguageEntries(container, items) {
        if (!container) return;
        if (Array.isArray(items) && items.length && typeof items[0] === 'object') {
            renderChips(container, items.map(item => item.level ? `${item.language} (${item.level})` : item.language).filter(Boolean));
            return;
        }
        renderChips(container, items || []);
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
            'edit-experience': formatExperienceForEdit(p),
            'edit-languages': formatLanguagesForEdit(p),
            'edit-education': formatEducationForEdit(p),
            'edit-certifications': formatCertificationsForEdit(p)
        };

        for (const [id, value] of Object.entries(fields)) {
            const el = safeGet('#' + id);
            if (el) el.value = value;
        }
    }

    function autoFillSearch(p) {
        if (!p) return;
        const kw = safeGet('#keywords');
        const defaultSeed = (kw?.dataset.defaultSeed || '').trim();
        const currentValue = kw?.value?.trim() || '';
        if (kw && (!currentValue || currentValue === defaultSeed || currentValue === LEGACY_KEYWORD_SEED || kw.dataset.autofilled === '1')) {
            const suggestions = getKeywords(p);
            if (suggestions.length) {
                kw.value = suggestions.join(', ');
                kw.dataset.autofilled = '1';
                autoResizeTextarea(kw);
            }
        }
        const loc = safeGet('#location');
        if (loc && (!loc.value.trim() || loc.value === 'México') && p.location) {
            const mod = safeGet('#modality');
            if (mod && mod.value !== 'remoto') {
                loc.value = normalizeLocationOption(p.location);
                loc.dataset.autofilled = '1';
            }
        }
    }

    function forceSearchAutoFill(profile) {
        const kw = safeGet('#keywords');
        if (kw) kw.dataset.autofilled = '1';
        autoFillSearch(profile);
    }

    function formatExperienceForEdit(profile) {
        if (profile.experience && profile.experience.length) {
            return profile.experience.map(exp => [exp.title, exp.company, exp.dates].filter(Boolean).join(' | ')).join('\n');
        }
        return (profile.sections?.experience || []).join('\n');
    }

    function formatLanguagesForEdit(profile) {
        if (profile.language_entries && profile.language_entries.length) {
            return profile.language_entries.map(lang => lang.level ? `${lang.language} (${lang.level})` : lang.language).join(', ');
        }
        return (profile.languages_spoken || []).join(', ');
    }

    function formatEducationForEdit(profile) {
        if (profile.education_entries && profile.education_entries.length) {
            return profile.education_entries.map(edu => [edu.degree, edu.school, edu.date].filter(Boolean).join(' | ')).join('\n');
        }
        return (profile.education || []).join('\n');
    }

    function formatCertificationsForEdit(profile) {
        if (profile.certification_entries && profile.certification_entries.length) {
            return profile.certification_entries.map(cert => [cert.name, cert.issuer, cert.date].filter(Boolean).join(' | ')).join('\n');
        }
        return (profile.certifications || []).join('\n');
    }

    function extractLanguageName(token) {
        return String(token || '').replace(/\s*\(([^()]*)\)\s*$/, '').trim();
    }

    function extractLanguageLevel(token) {
        const match = String(token || '').match(/\(([^()]*)\)\s*$/);
        return match ? match[1].trim() : '';
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
        }

        const requestToken = ++state.profileLoadToken;
        try {
            const res = await fetch(`${API}/api/profile`);
            const json = await res.json();
            if (requestToken !== state.profileLoadToken) return;
            if (json.status === 'success' && json.data) {
                renderProfile(json.data);
            }
        } catch {
            if (!cached) toast('warning', 'Sin conexión', 'No se pudo cargar el perfil.');
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
                state.profileLoadToken++;
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
        state.profileLoadToken++;
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
                btn.innerHTML = '<i class="bi bi-x-lg"></i>';
                btn.classList.add('btn-danger');
                btn.classList.remove('btn-outline-secondary');
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
            btn.innerHTML = '<i class="bi bi-pencil"></i>';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-outline-secondary');
        }

        function saveEdit() {
            if (!state.profile) return;

            const experienceLines = splitLines(safeGet('#edit-experience')?.value || '');
            const educationLines = splitLines(safeGet('#edit-education')?.value || '');
            const certificationLines = splitLines(safeGet('#edit-certifications')?.value || '');
            const languageTokens = (safeGet('#edit-languages')?.value || '').split(',').map(v => v.trim()).filter(Boolean);

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
                languages_spoken: languageTokens.map(extractLanguageName),
                education: educationLines,
                certifications: certificationLines
            };

            if (!updated.name) {
                toast('warning', 'Nombre requerido', 'Escribe tu nombre.');
                const nameInput = safeGet('#edit-name');
                if (nameInput) nameInput.focus();
                return;
            }

            if (!updated.skills) updated.skills = {};
            if (!updated.sections) updated.sections = {};
            updated.sections.experience = experienceLines;
            updated.experience = experienceLines.map(line => {
                const parts = line.split('|').map(v => v.trim()).filter(Boolean);
                return {
                    title: parts[0] || line,
                    company: parts[1] || '',
                    dates: parts[2] || '',
                    description: []
                };
            });
            updated.education_entries = educationLines.map(line => {
                const parts = line.split('|').map(v => v.trim()).filter(Boolean);
                return {
                    degree: parts[0] || line,
                    school: parts[1] || '',
                    date: parts[2] || ''
                };
            });
            updated.certification_entries = certificationLines.map(line => {
                const parts = line.split('|').map(v => v.trim()).filter(Boolean);
                return {
                    name: parts[0] || line,
                    issuer: parts[1] || '',
                    date: parts[2] || ''
                };
            });
            updated.language_entries = languageTokens.map(token => ({
                language: extractLanguageName(token),
                level: extractLanguageLevel(token)
            }));
            updated.all_skills_flat = flattenSkills(updated.skills);
            updated.search_keywords = getKeywords(updated);

            state.profile = updated;
            state.profileLoadToken++;
            renderProfile(updated);
            syncProfile(updated);
            snapshot = JSON.parse(JSON.stringify(updated));
            form.classList.add('hidden');
            btn.innerHTML = '<i class="bi bi-pencil"></i>';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-outline-secondary');

            if (state.jobs.length) recalcScores();
            toast('success', 'Perfil actualizado', 'Información guardada.');
        }
    }

    // ─── UPLOAD CV ──────────────────────────────────────────────
    function initUpload() {
        const zone = safeGet('#cv-zone');
        const input = safeGet('#cv-input');
        const generatePdfBtn = safeGet('#generate-pdf-btn');

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

        if (generatePdfBtn) {
            generatePdfBtn.addEventListener('click', async () => {
                try {
                    generatePdfBtn.disabled = true;
                    generatePdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generando...';
                    const res = await fetch(`${API}/api/generate-ats-pdf-from-profile`, { method: 'POST' });
                    
                    if (!res.ok) {
                        const errorJson = await res.json();
                        toast('error', 'Error', errorJson.message || 'No se pudo generar el PDF.');
                        return;
                    }

                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `cv_${(state.profile?.name || 'candidato').replace(/\s+/g, '_')}_ats.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                    toast('success', 'PDF listo', 'CV ATS descargado correctamente.');
                } catch (e) {
                    console.error('Error generating PDF:', e);
                    toast('error', 'Error', 'No se pudo conectar con el servidor.');
                } finally {
                    generatePdfBtn.disabled = false;
                    generatePdfBtn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Generar CV ATS (PDF)';
                }
            });
        }
    }

    async function uploadCV(file) {
        const zone = safeGet('#cv-zone');
        if (!zone) return;
        const icon = zone.querySelector('i');
        if (!icon) return;

        zone.classList.add('processing');
        icon.className = 'bi bi-arrow-repeat spinner-border';
        toast('info', 'Procesando CV', 'Analizando tu currículum...');

        const fd = new FormData();
        fd.append('cv', file);

        try {
            const res = await fetch(`${API}/api/upload-cv`, { method: 'POST', body: fd });
            const json = await res.json();

            if (json.status === 'success') {
                state.profile = normalizeProfile(json.data);
                state.profileLoadToken++;
                renderProfile(state.profile);
                forceSearchAutoFill(state.profile);
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
            icon.className = 'bi bi-cloud-arrow-up';
        }
    }

    // ─── CV ATS GENERATOR CON TESSERACT.JS Y PDF.JS ──────────────
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
        if (genBtn) genBtn.addEventListener('click', generateLatexWithTesseract);

        const copyBtn = safeGet('#latex-copy');
        if (copyBtn) copyBtn.addEventListener('click', copyLatex);

        const dlBtn = safeGet('#latex-download');
        if (dlBtn) dlBtn.addEventListener('click', downloadLatexDocx);

        const dlTxtBtn = safeGet('#latex-download-txt');
        if (dlTxtBtn) dlTxtBtn.addEventListener('click', downloadLatexTxt);
    }

    function handleLatexFile(file) {
        const types = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
        if (!types.includes(file.type) && !/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
            toast('error', 'Formato inválido', 'Usa PDF, PNG, JPG o WEBP.');
            return;
        }

        state.latexFile = file;
        state.latexFilename = `${file.name.replace(/\.[^.]+$/, '') || 'cv_ats'}.docx`;
        state.latexDocxB64 = null;
        state.latexPlainText = '';

        const nameEl = safeGet('#latex-filename');
        if (nameEl) nameEl.textContent = file.name;

        const outputEl = safeGet('#latex-output');
        if (outputEl) outputEl.classList.add('hidden');

        const progressEl = safeGet('#latex-progress');
        if (progressEl) progressEl.classList.add('hidden');

        const textEl = safeGet('#latex-text');
        if (textEl) textEl.value = '';

        toast('info', 'Archivo listo', 'Ahora puedes generar el CV ATS con OCR en navegador.');
    }

    function setLatexProcessing(isProcessing) {
        const btn = safeGet('#latex-generate');
        if (!btn) return;
        btn.disabled = isProcessing;
        const zone = safeGet('#latex-zone');
        if (zone) zone.classList.toggle('processing', isProcessing);
        btn.innerHTML = isProcessing
            ? '<span class="spinner-border spinner-border-sm" role="status"></span> Procesando...'
            : '<i class="bi bi-wand-2"></i> Generar LaTeX';
    }

    function updateProgress(percent, text) {
        const fill = safeGet('#latex-progress-fill');
        const label = safeGet('#latex-progress-text');
        if (fill) {
            fill.style.width = `${percent}%`;
            fill.setAttribute('aria-valuenow', percent);
        }
        if (label) label.textContent = text;
    }

    async function pdfToImages(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const images = [];

        for (let i = 1; i <= Math.min(pdf.numPages, 5); i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const imageData = canvas.toDataURL('image/png');
            const response = await fetch(imageData);
            const blob = await response.blob();
            images.push(blob);
        }

        return images;
    }

    async function generateLatexWithTesseract() {
        if (!state.latexFile) {
            toast('warning', 'Falta imagen', 'Selecciona primero una imagen.');
            return;
        }

        if (typeof Tesseract === 'undefined') {
            toast('error', 'Tesseract no disponible', 'Carga la librería Tesseract.js.');
            return;
        }

        setLatexProcessing(true);

        const progressEl = safeGet('#latex-progress');
        if (progressEl) progressEl.classList.remove('hidden');

        updateProgress(5, 'Iniciando OCR en el navegador...');

        try {
            let imagesToProcess = [];

            if (state.latexFile.type === 'application/pdf' || state.latexFile.name.toLowerCase().endsWith('.pdf')) {
                updateProgress(10, 'Convirtiendo PDF a imágenes...');
                try {
                    imagesToProcess = await pdfToImages(state.latexFile);
                    toast('info', 'PDF convertido', `${imagesToProcess.length} páginas renderizadas.`);
                } catch (pdfError) {
                    console.warn('Error convirtiendo PDF:', pdfError);
                    toast('warning', 'Error en PDF', 'Usando el archivo directamente.');
                    imagesToProcess = [state.latexFile];
                }
            } else {
                imagesToProcess = [state.latexFile];
            }

            const worker = await Tesseract.createWorker('spa+eng');
            updateProgress(25, 'Cargando modelo de reconocimiento...');

            let allText = '';

            for (let i = 0; i < imagesToProcess.length; i++) {
                const img = imagesToProcess[i];
                const pageNum = imagesToProcess.length > 1 ? ` (Página ${i+1}/${imagesToProcess.length})` : '';

                updateProgress(
                    30 + (i / imagesToProcess.length) * 50,
                    `Reconociendo texto${pageNum}...`
                );

                const result = await worker.recognize(img);
                const pageText = result.data.text || '';

                if (pageText.trim()) {
                    allText += (allText ? '\n\n' : '') + pageText;
                }
            }

            await worker.terminate();

            updateProgress(85, 'Procesando texto extraído...');

            if (!allText || !allText.trim()) {
                toast('error', 'No se detectó texto', 'La imagen no contiene texto legible.');
                updateProgress(100, '❌ No se detectó texto');
                setLatexProcessing(false);
                return;
            }

            updateProgress(90, 'Generando documento LaTeX...');

            const res = await fetch(`${API}/api/generate-latex-from-text`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: allText })
            });

            const json = await res.json();

            updateProgress(100, '✅ ¡Completado!');

            if (json.status === 'success') {
                const textEl = safeGet('#latex-text');
                const plainText = json.data?.plain_text || json.data?.latex || '';
                if (textEl) textEl.value = plainText;

                state.latexPlainText = plainText;
                state.latexDocxB64 = json.data?.docx_base64 || null;
                state.latexFilename = json.data?.suggested_filename || state.latexFilename;

                const outputEl = safeGet('#latex-output');
                if (outputEl) outputEl.classList.remove('hidden');

                // Mostrar/ocultar botón DOCX según disponibilidad
                const dlBtn = safeGet('#latex-download');
                if (dlBtn) dlBtn.style.display = state.latexDocxB64 ? '' : 'none';

                toast('success', 'CV ATS listo', `Documento generado desde ${imagesToProcess.length} página(s).`);
            } else {
                toast('error', 'Error', json.message || 'No se pudo generar el CV ATS.');
            }

        } catch (error) {
            console.error('Error en Tesseract OCR:', error);
            updateProgress(100, '❌ Error en OCR');
            toast('error', 'Error en OCR', error.message || 'No se pudo procesar la imagen.');
        } finally {
            setLatexProcessing(false);
        }
    }

    function copyLatex() {
        const textEl = safeGet('#latex-text');
        if (!textEl || !textEl.value) return;
        navigator.clipboard.writeText(textEl.value).then(() => {
            toast('success', 'Copiado', 'Texto ATS copiado al portapapeles.');
        }).catch(() => {
            toast('error', 'No se pudo copiar', 'Copia manualmente.');
        });
    }

    function downloadLatexDocx() {
        if (!state.latexDocxB64) {
            toast('warning', 'Sin DOCX', 'El servidor no devolvió el archivo Word. Descarga el .txt.');
            return;
        }
        const binary = atob(state.latexDocxB64);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = state.latexFilename || 'cv_ats_optimizado.docx';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('success', 'Descargado', `${a.download} listo.`);
    }

    function downloadLatexTxt() {
        const text = state.latexPlainText || safeGet('#latex-text')?.value || '';
        if (!text) { toast('warning', 'Sin contenido', 'Genera el CV primero.'); return; }
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = (state.latexFilename || 'cv_ats').replace(/\.docx$/, '.txt');
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('success', 'Descargado', `${a.download} listo.`);
    }

    // alias legacy
    function downloadLatex() { downloadLatexDocx(); }

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
            autoResizeTextarea(keywords);
            keywords.addEventListener('input', () => {
                keywords.dataset.autofilled = '0';
                autoResizeTextarea(keywords);
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
            location.addEventListener('change', () => {
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
                if (icon) icon.className = 'bi bi-circle';
            }
        });

        const advance = () => {
            if (idx > 0 && steps[idx - 1]) {
                const prev = document.getElementById(steps[idx - 1]);
                if (prev) {
                    prev.classList.remove('active');
                    prev.classList.add('done');
                    const icon = prev.querySelector('i');
                    if (icon) icon.className = 'bi bi-check-circle-fill';
                }
            }
            if (idx < steps.length) {
                const cur = document.getElementById(steps[idx]);
                if (cur) {
                    cur.classList.add('active');
                    const icon = cur.querySelector('i');
                    if (icon) icon.className = 'bi bi-arrow-repeat spinner-border spinner-border-sm';
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
                <div class="d-flex justify-content-between gap-2">
                    <div class="flex-grow-1">
                        <div class="skeleton" style="height:14px;width:80%;"></div>
                        <div class="skeleton mt-1" style="height:10px;width:55%;"></div>
                    </div>
                    <div class="skeleton" style="width:50px;height:40px;border-radius:0.5rem;"></div>
                </div>
                <div class="d-flex gap-2">
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
                description: `Buscamos un Ingeniero de Software con experiencia en ${kw}, APIs RESTful, SQL y Git.`,
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
                description: `Se solicita desarrollador junior. Conocimientos de ${kw}, HTML, CSS, JavaScript.`,
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
                description: `Liderar el diseño de sistemas. Requisitos: ${kw}, Docker, AWS.`,
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
                description: `Join our team building fintech solutions. Stack: ${kw}, React, PostgreSQL.`,
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

        // Cambiar a sección de búsqueda automáticamente
        const searchLink = document.querySelector('.nav-link[data-section="search"]');
        if (searchLink) searchLink.click();

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
            // #region debug-point C:frontend-api-result
            debugEmit('C', 'frontend received /api/search response', {
                ok: res.ok,
                status: res.status,
                json_status: json?.status || null,
                data_count: Array.isArray(json?.data) ? json.data.length : 0
            });
            // #endregion

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
                updateSavedJobsUI();
            } else {
                state.jobs = [];
                if (container) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                }
                if (summary) summary.innerHTML = 'No se encontraron vacantes.';
                if (empty) {
                    const h3 = empty.querySelector('h4');
                    const p = empty.querySelector('p');
                    if (h3) h3.textContent = 'Sin resultados';
                    if (p) p.textContent = 'Prueba con otras palabras clave o ubicación.';
                    empty.classList.remove('hidden');
                }
                toast('warning', 'Sin resultados', 'Intenta ampliar las palabras clave.');
            }
        } catch (err) {
            // #region debug-point C:frontend-fallback
            debugEmit('C', 'frontend fetch failed and entered fallback', {
                error: String(err?.message || err || 'unknown'),
                location,
                modality,
                has_keywords: Boolean(keywords)
            });
            // #endregion
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

            const fallbackJobs = ENABLE_CLIENT_FALLBACK ? getFallbackJobs(keywords || 'desarrollador', location, modality) : [];
            if (fallbackJobs.length) {
                // #region debug-point C:frontend-fallback-jobs
                debugEmit('C', 'frontend fallback jobs generated', {
                    count: fallbackJobs.length,
                    modality,
                    location
                });
                // #endregion
                state.jobs = fallbackJobs;
                if (exportBtn) exportBtn.classList.remove('hidden');
                if (statsCard) statsCard.classList.remove('hidden');
                resetFilters();
                applyFilters();
                toast('info', 'Datos de respaldo', 'Usando vacantes de muestra (sin conexión).');
                updateMetrics();
                updateSavedJobsUI();
            } else {
                if (container) {
                    container.innerHTML = '';
                    container.classList.add('hidden');
                }
                if (summary) summary.textContent = 'No fue posible obtener vacantes reales.';
                if (empty) {
                    const h3 = empty.querySelector('h4');
                    const p = empty.querySelector('p');
                    if (h3) h3.textContent = 'Sin conexión a fuentes reales';
                    if (p) p.textContent = ENABLE_CLIENT_FALLBACK
                        ? 'No se pudo consultar el backend. Revisa si el servidor Flask está activo.'
                        : 'El servidor no pudo consultar fuentes reales de empleo. Intenta de nuevo más tarde.';
                    empty.classList.remove('hidden');
                }
                toast('error', 'Fuentes no disponibles', ENABLE_CLIENT_FALLBACK
                    ? 'No se pudo conectar con el backend local.'
                    : 'No se obtuvieron vacantes reales desde producción.');
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
                <div class="text-center py-5 text-muted" style="grid-column:1/-1;">
                    <i class="bi bi-search fs-1"></i>
                    <p class="mt-2">No hay empleos que coincidan con los filtros aplicados.</p>
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
                <div class="d-flex justify-content-between gap-2">
                    <div class="flex-grow-1">
                        <div class="card-title">${job.title}</div>
                        <div class="card-company">${job.company}</div>
                    </div>
                    <div class="card-score">
                        <div class="score-value">${score}%</div>
                        <div class="score-label">Match</div>
                        <div class="score-bar"><div class="fill" style="width:${score}%;"></div></div>
                    </div>
                </div>

                <div class="card-meta">
                    <span><i class="bi bi-geo-alt"></i> ${job.location}</span>
                    <span><i class="bi bi-laptop"></i> ${formatModality(job.work_modality)}</span>
                    <span><i class="bi bi-cash"></i> ${job.salary}</span>
                    <span><i class="bi bi-calendar"></i> ${job.date}</span>
                    <span class="badge bg-secondary badge-platform ${sourceSlug}">${job.source}</span>
                </div>

                ${job.matched_skills && job.matched_skills.length ? `
                    <div class="card-skills">
                        ${job.matched_skills.slice(0, 5).map(s => `<span class="skill-tag">${s}</span>`).join('')}
                        ${job.matched_skills.length > 5 ? `<span class="skill-tag">+${job.matched_skills.length - 5}</span>` : ''}
                    </div>` : ''}

                <div class="card-actions d-flex justify-content-between align-items-center pt-2 border-top border-secondary">
                    <div class="d-flex gap-1">
                        <button class="icon-btn ${isSaved ? 'saved' : ''}" title="Guardar">
                            <i class="${isSaved ? 'bi bi-bookmark-fill' : 'bi bi-bookmark'}"></i>
                        </button>
                        <button class="icon-btn ${isDiscarded ? 'discarded' : ''}" title="${isDiscarded ? 'Restaurar' : 'Descartar'}">
                            <i class="${isDiscarded ? 'bi bi-eye' : 'bi bi-eye-slash'}"></i>
                        </button>
                    </div>
                    <button class="btn btn-outline-primary btn-sm details-btn">Ver Detalles</button>
                </div>
            `;

            card.querySelector('.details-btn').addEventListener('click', () => showJob(job));
            card.querySelector('.card-title').addEventListener('click', () => showJob(job));

            const saveBtn = card.querySelector('.icon-btn:first-child');
            if (saveBtn) {
                saveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleSave(job.id, saveBtn);
                });
            }

            const discardBtn = card.querySelector('.icon-btn:last-child');
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
            if (icon) icon.className = 'bi bi-bookmark';
            toast('info', 'Guardado removido', '');
            updateSavedJobsUI();
        } else {
            state.saved.push(id);
            btn.classList.add('saved');
            if (icon) icon.className = 'bi bi-bookmark-fill';
            toast('success', 'Empleo guardado', '');

            if (state.discarded.includes(id)) {
                state.discarded = state.discarded.filter(x => x !== id);
                const card = document.getElementById(`card-${id}`);
                if (card) {
                    card.classList.remove('dimmed');
                    const db = card.querySelector('.icon-btn:last-child');
                    if (db) {
                        db.classList.remove('discarded');
                        const dbIcon = db.querySelector('i');
                        if (dbIcon) dbIcon.className = 'bi bi-eye-slash';
                    }
                }
            }
            updateSavedJobsUI();
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
            if (icon) icon.className = 'bi bi-eye-slash';
            btn.title = 'Descartar';
        } else {
            state.discarded.push(id);
            card.classList.add('dimmed');
            btn.classList.add('discarded');
            if (icon) icon.className = 'bi bi-eye';
            btn.title = 'Restaurar';

            if (state.saved.includes(id)) {
                state.saved = state.saved.filter(x => x !== id);
                const sb = card.querySelector('.icon-btn:first-child');
                if (sb) {
                    sb.classList.remove('saved');
                    const sbIcon = sb.querySelector('i');
                    if (sbIcon) sbIcon.className = 'bi bi-bookmark';
                }
            }
            updateSavedJobsUI();
        }
        setStore(STORAGE.SAVED, state.saved);
        setStore(STORAGE.DISCARDED, state.discarded);
    }

    // ─── SAVED JOBS UI ──────────────────────────────────────────
    function updateSavedJobsUI() {
        const container = safeGet('#saved-jobs-container');
        const countBadge = safeGet('#saved-count');
        if (!container) return;

        if (countBadge) countBadge.textContent = state.saved.length;

        const savedJobs = state.jobs.filter(j => state.saved.includes(j.id));

        if (!savedJobs.length) {
            container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-bookmark fs-1"></i>
                    <p class="mt-2">No tienes empleos guardados aún.</p>
                    <p class="small">Guarda empleos desde los resultados de búsqueda.</p>
                </div>`;
            return;
        }

        container.innerHTML = '';
        const fragment = document.createDocumentFragment();

        savedJobs.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-card';
            card.innerHTML = `
                <div class="d-flex justify-content-between gap-2">
                    <div class="flex-grow-1">
                        <div class="card-title">${job.title}</div>
                        <div class="card-company">${job.company}</div>
                    </div>
                    <div class="card-score">
                        <div class="score-value">${job.match_score || 0}%</div>
                        <div class="score-label">Match</div>
                    </div>
                </div>
                <div class="card-meta">
                    <span><i class="bi bi-geo-alt"></i> ${job.location}</span>
                    <span><i class="bi bi-laptop"></i> ${formatModality(job.work_modality)}</span>
                    <span><i class="bi bi-cash"></i> ${job.salary}</span>
                </div>
                <div class="d-flex gap-2 mt-2">
                    <button class="btn btn-outline-primary btn-sm view-saved-btn">Ver Detalles</button>
                    <button class="btn btn-outline-danger btn-sm remove-saved-btn"><i class="bi bi-trash"></i></button>
                </div>
            `;

            card.querySelector('.view-saved-btn').addEventListener('click', () => showJob(job));
            card.querySelector('.remove-saved-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = state.saved.indexOf(job.id);
                if (idx > -1) {
                    state.saved.splice(idx, 1);
                    setStore(STORAGE.SAVED, state.saved);
                    updateSavedJobsUI();
                    updateMetrics();
                    const mainCard = document.getElementById(`card-${job.id}`);
                    if (mainCard) {
                        const sb = mainCard.querySelector('.icon-btn:first-child');
                        if (sb) {
                            sb.classList.remove('saved');
                            const icon = sb.querySelector('i');
                            if (icon) icon.className = 'bi bi-bookmark';
                        }
                    }
                    toast('info', 'Removido de guardados', '');
                }
            });

            fragment.appendChild(card);
        });

        container.appendChild(fragment);
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

        const savedBadge = safeGet('#saved-count');
        if (savedBadge) savedBadge.textContent = state.saved.length;
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
    let modalInstance = null;

    function initModal() {
        const modalEl = document.getElementById('job-modal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            modalInstance = new bootstrap.Modal(modalEl, {
                backdrop: 'static',
                keyboard: true
            });
        }
    }

    function showJob(job) {
        state.currentJob = job;
        state.analysisToken++;

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
            sourceEl.className = `badge bg-secondary badge-platform ${sourceSlug}`;
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
                matchedEl.innerHTML = '<span class="text-muted small">Ninguna habilidad directa.</span>';
            }
        }

        const applyEl = safeGet('#modal-apply');
        if (applyEl) applyEl.href = job.link;

        updateModalSave(job.id);
        populateATS(job);
        loadDeep(job);

        const tone = safeGet('#letter-tone');
        if (tone) generateLetter(job, tone.value);

        if (modalInstance) {
            modalInstance.show();
        } else {
            const modalEl = document.getElementById('job-modal');
            if (modalEl) modalEl.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModal() {
        if (modalInstance) {
            modalInstance.hide();
        } else {
            const modalEl = document.getElementById('job-modal');
            if (modalEl) modalEl.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    function updateModalSave(id) {
        const saveBtn = safeGet('#modal-save');
        if (!saveBtn) return;

        const saved = state.saved.includes(id);
        saveBtn.innerHTML = saved
            ? '<i class="bi bi-bookmark-fill"></i> Guardado'
            : '<i class="bi bi-bookmark"></i> Guardar';
        saveBtn.classList.toggle('btn-primary', saved);
        saveBtn.classList.toggle('btn-outline-secondary', !saved);
    }

    // ─── MODAL TABS ──────────────────────────────────────────────
    function initModalTabs() {
        document.querySelectorAll('#job-modal .nav-link').forEach(btn => {
            btn.addEventListener('click', function(e) {
                // Bootstrap maneja los tabs automáticamente
                if (this.dataset.bsTarget === '#tab-letter' && state.currentJob) {
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
                    copyBtn.innerHTML = '<i class="bi bi-check-lg"></i> Copiado!';
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> Copiar';
                    }, 2000);
                });
            });
        }

        const emailBtn = safeGet('#letter-email');
        if (emailBtn) {
            emailBtn.addEventListener('click', (e) => {
                const textEl = safeGet('#letter-text');
                if (!textEl || !textEl.value) {
                    e.preventDefault();
                    return;
                }
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
                const btn = card?.querySelector('.icon-btn:first-child');
                if (btn) toggleSave(state.currentJob.id, btn);
                else {
                    if (state.saved.includes(state.currentJob.id)) {
                        state.saved = state.saved.filter(x => x !== state.currentJob.id);
                    } else {
                        state.saved.push(state.currentJob.id);
                    }
                    setStore(STORAGE.SAVED, state.saved);
                    updateMetrics();
                    updateSavedJobsUI();
                }
                updateModalSave(state.currentJob.id);
            });
        }
    }

    // ─── MODAL CLOSE ─────────────────────────────────────────────
    function initModalClose() {
        const closeBtn = safeGet('#modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modalEl = document.getElementById('job-modal');
                if (modalEl && modalEl.classList.contains('show')) {
                    closeModal();
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
            { label: 'Skills Técnicas', pct: Math.min(100, (job.deep_analysis?.signals?.matched_count || matched.length) * 14), color: 'var(--bs-primary)' },
            { label: 'Relevancia', pct: score, color: 'var(--bs-info)' },
            { label: 'Cobertura', pct: allSkills.length ? Math.round(((job.deep_analysis?.matched_skills_deep || matched).length / allSkills.length) * 100) : 0, color: 'var(--bs-success)' }
        ];

        const breakdownEl = safeGet('#ats-breakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = '';
            categories.forEach(cat => {
                const el = document.createElement('div');
                el.className = 'break-item mb-2';
                el.innerHTML = `
                    <div class="d-flex justify-content-between small">
                        <span>${cat.label}</span>
                        <span class="fw-bold">${cat.pct}%</span>
                    </div>
                    <div class="progress" style="height:4px;">
                        <div class="progress-bar" style="width:0%;background:${cat.color};" data-pct="${cat.pct}"></div>
                    </div>`;
                breakdownEl.appendChild(el);
                setTimeout(() => {
                    const bar = el.querySelector('.progress-bar');
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
                missingEl.innerHTML = '<span class="text-success">✓ Tu perfil cubre todas las habilidades.</span>';
            }
        }

        const recEl = safeGet('#ats-recommendation');
        if (recEl) {
            if (job.deep_analysis?.recommendation) {
                recEl.innerHTML = `<p class="small mb-0">${job.deep_analysis.recommendation}</p>`;
            } else if (score >= 75) {
                recEl.innerHTML = `<p class="small mb-0 text-success">Alta compatibilidad (${score}%). Tu perfil es sólido. Postúlate de inmediato.</p>`;
            } else if (score >= 50) {
                recEl.innerHTML = `<p class="small mb-0 text-warning">Compatibilidad media (${score}%). Considera adquirir: ${missing.slice(0, 3).join(', ')}.</p>`;
            } else {
                recEl.innerHTML = `<p class="small mb-0 text-danger">Compatibilidad baja (${score}%). Úsalo como referencia de desarrollo.</p>`;
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
            container.innerHTML = '<span class="text-muted small">Sin datos detectados.</span>';
            return;
        }
        items.forEach(item => {
            const el = document.createElement('div');
            el.className = 'list-item';
            el.innerHTML = `<i class="bi bi-chevron-right text-primary"></i><span class="small">${item}</span>`;
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
            if (recEl) recEl.innerHTML = `<p class="small mb-0 text-danger">No se pudo enriquecer la vacante. ${error.message}</p>`;
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
                el.innerHTML = `<i class="bi bi-exclamation-triangle-fill text-warning"></i><span class="small">${gap}</span>`;
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
                    icon: 'bi-book',
                    items: missing.length
                        ? [`Estudia los conceptos básicos de: ${missing.join(', ')} y realiza un proyecto personal.`]
                        : ['Continúa ampliando tus conocimientos técnicos.']
                },
                {
                    title: 'Optimización de CV',
                    icon: 'bi-file-earmark-text',
                    items: ['Adapta tu experiencia para resaltar proyectos con tecnologías similares.',
                        'Asegúrate de que tu resumen mencione tus habilidades adaptables.']
                },
                {
                    title: 'Preparación de Entrevista',
                    icon: 'bi-person-video',
                    items: ['Prepara historias usando la metodología STAR.',
                        'Ensaya respuestas sobre proyectos técnicos complejos.']
                }
            ];
        }

        if (stepsEl) {
            steps.forEach((step, idx) => {
                const card = document.createElement('div');
                card.className = 'step-card mb-2';

                let itemsHtml = '';
                step.items.forEach(item => {
                    itemsHtml += `
                        <div class="d-flex gap-2 align-items-start small text-muted">
                            <i class="bi bi-check-circle-fill text-success mt-1"></i>
                            <span>${item}</span>
                        </div>`;
                });

                card.innerHTML = `
                    <div class="d-flex align-items-center gap-2 mb-1">
                        <span class="badge bg-primary rounded-circle">${idx + 1}</span>
                        <span class="fw-semibold"><i class="bi ${step.icon} me-1"></i>${step.title}</span>
                    </div>
                    <div class="ms-3">${itemsHtml}</div>
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

    // ─── EXPORT JOBS ─────────────────────────────────────────────
    async function exportJobs() {
        if (!state.jobs || !state.jobs.length) {
            toast('warning', 'Sin datos', 'No hay empleos para exportar.');
            return;
        }

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
                toast('success', 'CSV exportado', `${state.jobs.length} empleos exportados.`);
            } else {
                toast('error', 'Error', 'No se pudo exportar. Intenta de nuevo.');
            }
        } catch {
            toast('error', 'Sin conexión', 'No se pudo conectar con el servidor.');
        }
    }

    // ─── ATS CV EDITOR ────────────────────────────────────────────
    const ATS_STORAGE_KEY = 'ats_cv_draft';
    let atsData = {
        name: '',
        location: '',
        phone: '',
        email: '',
        linkedin: '',
        github: '',
        summary: '',
        experience: [],
        education: [],
        skills: '',
        certifications: [],
        languages: []
    };

    function initATSEditor() {
        // Load from storage if available
        const saved = getStore(ATS_STORAGE_KEY, null);
        if (saved) {
            atsData = saved;
            renderATSEditor();
        } else if (state.profile) {
            // Pre-fill from profile if available
            preFillFromProfile();
        }

        // Upload zone
        const importZone = safeGet('#ats-import-zone');
        const importInput = safeGet('#ats-import-input');
        if (importZone && importInput && !importInput.dataset.bound) {
            importInput.dataset.bound = '1';
            importZone.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', () => {
                const file = importInput.files[0];
                importCVFromFile(file);
                importInput.value = '';
            });
            importZone.addEventListener('dragover', e => {
                e.preventDefault();
                importZone.classList.add('dragover');
            });
            importZone.addEventListener('dragleave', () => importZone.classList.remove('dragover'));
            importZone.addEventListener('drop', e => {
                e.preventDefault();
                importZone.classList.remove('dragover');
                if (e.dataTransfer.files[0]) importCVFromFile(e.dataTransfer.files[0]);
            });
        }

        // Add buttons
        const addExpBtn = safeGet('#ats-add-experience');
        if (addExpBtn) addExpBtn.addEventListener('click', addExperience);
        const addEduBtn = safeGet('#ats-add-education');
        if (addEduBtn) addEduBtn.addEventListener('click', addEducation);
        const addCertBtn = safeGet('#ats-add-certification');
        if (addCertBtn) addCertBtn.addEventListener('click', addCertification);
        const addLangBtn = safeGet('#ats-add-language');
        if (addLangBtn) addLangBtn.addEventListener('click', addLanguage);

        // Action buttons
        const generateBtn = safeGet('#ats-generate-pdf');
        if (generateBtn) generateBtn.addEventListener('click', generateATSPDF);
        const saveBtn = safeGet('#ats-save-draft');
        if (saveBtn) saveBtn.addEventListener('click', saveATSDraft);
        const loadBtn = safeGet('#ats-load-draft');
        if (loadBtn) loadBtn.addEventListener('click', loadATSDraft);

        // Input listeners to recalculate score
        ['ats-name', 'ats-location', 'ats-phone', 'ats-email', 'ats-summary', 'ats-skills'].forEach(id => {
            const el = safeGet('#' + id);
            if (el) el.addEventListener('input', () => {
                collectATSData();
                calculateATSScore();
            });
        });

        renderATSEditor();
        calculateATSScore();
    }

    function preFillFromProfile() {
        if (!state.profile) return;
        atsData.name = state.profile.name || '';
        atsData.location = state.profile.location || '';
        atsData.phone = state.profile.phone || '';
        atsData.email = state.profile.email || '';
        atsData.linkedin = state.profile.linkedin || '';
        atsData.github = state.profile.github || '';
        atsData.summary = state.profile.summary || '';
        atsData.skills = (state.profile.all_skills_flat || []).join(', ');
        
        // Education
        if (state.profile.education_entries && state.profile.education_entries.length > 0) {
            atsData.education = state.profile.education_entries.map(edu => ({
                degree: edu.degree || '',
                school: edu.school || '',
                date: edu.date || ''
            }));
        } else {
            atsData.education = (state.profile.education || []).map(edu => ({
                degree: edu,
                school: '',
                date: ''
            }));
        }
        
        // Experience (structured or fallback)
        if (state.profile.experience && state.profile.experience.length > 0) {
            atsData.experience = state.profile.experience.map(exp => ({
                title: exp.title || '',
                company: exp.company || '',
                dates: exp.dates || '',
                description: (exp.description || []).join('\n')
            }));
        } else if (state.profile.sections?.experience) {
            atsData.experience = state.profile.sections.experience.slice(0, 5).map(exp => ({
                title: '',
                company: '',
                dates: '',
                description: exp
            }));
        }
        
        // Certifications
        if (state.profile.certification_entries && state.profile.certification_entries.length > 0) {
            atsData.certifications = state.profile.certification_entries.map(cert => ({
                name: cert.name || '',
                issuer: cert.issuer || '',
                date: cert.date || ''
            }));
        } else {
            atsData.certifications = (state.profile.certifications || []).map(cert => ({
                name: cert,
                issuer: '',
                date: ''
            }));
        }
        
        // Languages
        if (state.profile.language_entries && state.profile.language_entries.length > 0) {
            atsData.languages = state.profile.language_entries.map(lang => ({
                language: lang.language || '',
                level: lang.level || ''
            }));
        } else {
            atsData.languages = (state.profile.languages_spoken || []).map(lang => ({
                language: lang,
                level: ''
            }));
        }
        
        renderATSEditor();
        calculateATSScore();
    }

    async function importCVFromFile(file) {
        if (!file) return;
        if (!file.type.includes('pdf')) {
            toast('error', 'Archivo inválido', 'Solo PDFs son compatibles para importar.');
            return;
        }
        
        // Upload to server to parse
        const fd = new FormData();
        fd.append('cv', file);
        
        try {
            toast('info', 'Importando', 'Analizando CV para extraer datos...');
            const res = await fetch(`${API}/api/upload-cv`, { method: 'POST', body: fd });
            const json = await res.json();
            
            if (json.status === 'success') {
                state.profile = normalizeProfile(json.data);
                state.profileLoadToken++;
                renderProfile(state.profile);
                forceSearchAutoFill(state.profile);
                preFillFromProfile();
                toast('success', 'Importado', 'Datos extraídos correctamente.');
            } else {
                toast('error', 'Error', json.message || 'No se pudo analizar el CV.');
            }
        } catch (err) {
            console.error(err);
            toast('error', 'Error', 'No se pudo conectar con el servidor.');
        }
    }

    function addExperience() {
        atsData.experience.push({
            title: '',
            company: '',
            dates: '',
            description: ''
        });
        renderATSEditor();
        calculateATSScore();
    }

    function removeExperience(index) {
        atsData.experience.splice(index, 1);
        renderATSEditor();
        calculateATSScore();
    }

    function addEducation() {
        atsData.education.push({
            degree: '',
            school: '',
            date: ''
        });
        renderATSEditor();
        calculateATSScore();
    }

    function removeEducation(index) {
        atsData.education.splice(index, 1);
        renderATSEditor();
        calculateATSScore();
    }

    function addCertification() {
        atsData.certifications.push({
            name: '',
            issuer: '',
            date: ''
        });
        renderATSEditor();
        calculateATSScore();
    }

    function removeCertification(index) {
        atsData.certifications.splice(index, 1);
        renderATSEditor();
        calculateATSScore();
    }

    function addLanguage() {
        atsData.languages.push({
            language: '',
            level: ''
        });
        renderATSEditor();
        calculateATSScore();
    }

    function removeLanguage(index) {
        atsData.languages.splice(index, 1);
        renderATSEditor();
        calculateATSScore();
    }

    function collectATSData() {
        atsData.name = safeGet('#ats-name')?.value || '';
        atsData.location = safeGet('#ats-location')?.value || '';
        atsData.phone = safeGet('#ats-phone')?.value || '';
        atsData.email = safeGet('#ats-email')?.value || '';
        atsData.linkedin = safeGet('#ats-linkedin')?.value || '';
        atsData.github = safeGet('#ats-github')?.value || '';
        atsData.summary = safeGet('#ats-summary')?.value || '';
        atsData.skills = safeGet('#ats-skills')?.value || '';
        
        // Collect dynamic fields
        atsData.experience.forEach((exp, i) => {
            exp.title = safeGet(`#ats-exp-title-${i}`)?.value || '';
            exp.company = safeGet(`#ats-exp-company-${i}`)?.value || '';
            exp.dates = safeGet(`#ats-exp-dates-${i}`)?.value || '';
            exp.description = safeGet(`#ats-exp-desc-${i}`)?.value || '';
        });
        
        atsData.education.forEach((edu, i) => {
            edu.degree = safeGet(`#ats-edu-degree-${i}`)?.value || '';
            edu.school = safeGet(`#ats-edu-school-${i}`)?.value || '';
            edu.date = safeGet(`#ats-edu-date-${i}`)?.value || '';
        });
        
        atsData.certifications.forEach((cert, i) => {
            cert.name = safeGet(`#ats-cert-name-${i}`)?.value || '';
            cert.issuer = safeGet(`#ats-cert-issuer-${i}`)?.value || '';
            cert.date = safeGet(`#ats-cert-date-${i}`)?.value || '';
        });
        
        atsData.languages.forEach((lang, i) => {
            lang.language = safeGet(`#ats-lang-name-${i}`)?.value || '';
            lang.level = safeGet(`#ats-lang-level-${i}`)?.value || '';
        });
    }

    function renderATSEditor() {
        // Fill basic fields
        safeGet('#ats-name') && (safeGet('#ats-name').value = atsData.name);
        safeGet('#ats-location') && (safeGet('#ats-location').value = atsData.location);
        safeGet('#ats-phone') && (safeGet('#ats-phone').value = atsData.phone);
        safeGet('#ats-email') && (safeGet('#ats-email').value = atsData.email);
        safeGet('#ats-linkedin') && (safeGet('#ats-linkedin').value = atsData.linkedin);
        safeGet('#ats-github') && (safeGet('#ats-github').value = atsData.github);
        safeGet('#ats-summary') && (safeGet('#ats-summary').value = atsData.summary);
        safeGet('#ats-skills') && (safeGet('#ats-skills').value = atsData.skills);
        
        // Render experience
        const expContainer = safeGet('#ats-experience-container');
        if (expContainer) {
            expContainer.innerHTML = atsData.experience.map((exp, i) => `
                <div class="card mb-2 bg-light">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-semibold">Experiencia ${i+1}</h6>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-remove-exp="${i}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small">Título del Cargo</label>
                                <input type="text" id="ats-exp-title-${i}" class="form-control form-control-sm" value="${exp.title}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small">Empresa</label>
                                <input type="text" id="ats-exp-company-${i}" class="form-control form-control-sm" value="${exp.company}">
                            </div>
                            <div class="col-md-12">
                                <label class="form-label small">Fechas (ej: Ene 2020 - Dic 2023)</label>
                                <input type="text" id="ats-exp-dates-${i}" class="form-control form-control-sm" value="${exp.dates}">
                            </div>
                            <div class="col-md-12">
                                <label class="form-label small">Descripción (usa viñetas con •)</label>
                                <textarea id="ats-exp-desc-${i}" class="form-control form-control-sm" rows="3">${exp.description}</textarea>
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            expContainer.querySelectorAll('[data-remove-exp]').forEach(btn => {
                btn.addEventListener('click', () => removeExperience(parseInt(btn.dataset.removeExp)));
            });
            
            expContainer.querySelectorAll('input, textarea').forEach(input => {
                input.addEventListener('input', () => {
                    collectATSData();
                    calculateATSScore();
                });
            });
        }
        
        // Render education
        const eduContainer = safeGet('#ats-education-container');
        if (eduContainer) {
            eduContainer.innerHTML = atsData.education.map((edu, i) => `
                <div class="card mb-2 bg-light">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-semibold">Educación ${i+1}</h6>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-remove-edu="${i}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small">Título</label>
                                <input type="text" id="ats-edu-degree-${i}" class="form-control form-control-sm" value="${edu.degree}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small">Institución</label>
                                <input type="text" id="ats-edu-school-${i}" class="form-control form-control-sm" value="${edu.school}">
                            </div>
                            <div class="col-md-12">
                                <label class="form-label small">Fecha</label>
                                <input type="text" id="ats-edu-date-${i}" class="form-control form-control-sm" value="${edu.date}">
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            eduContainer.querySelectorAll('[data-remove-edu]').forEach(btn => {
                btn.addEventListener('click', () => removeEducation(parseInt(btn.dataset.removeEdu)));
            });
            
            eduContainer.querySelectorAll('input, textarea').forEach(input => {
                input.addEventListener('input', () => {
                    collectATSData();
                    calculateATSScore();
                });
            });
        }
        
        // Render certifications
        const certContainer = safeGet('#ats-certifications-container');
        if (certContainer) {
            certContainer.innerHTML = atsData.certifications.map((cert, i) => `
                <div class="card mb-2 bg-light">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-semibold">Certificación ${i+1}</h6>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-remove-cert="${i}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small">Nombre</label>
                                <input type="text" id="ats-cert-name-${i}" class="form-control form-control-sm" value="${cert.name}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small">Emisor</label>
                                <input type="text" id="ats-cert-issuer-${i}" class="form-control form-control-sm" value="${cert.issuer}">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small">Fecha</label>
                                <input type="text" id="ats-cert-date-${i}" class="form-control form-control-sm" value="${cert.date}">
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            certContainer.querySelectorAll('[data-remove-cert]').forEach(btn => {
                btn.addEventListener('click', () => removeCertification(parseInt(btn.dataset.removeCert)));
            });
            
            certContainer.querySelectorAll('input, textarea').forEach(input => {
                input.addEventListener('input', () => {
                    collectATSData();
                    calculateATSScore();
                });
            });
        }
        
        // Render languages
        const langContainer = safeGet('#ats-languages-container');
        if (langContainer) {
            langContainer.innerHTML = atsData.languages.map((lang, i) => `
                <div class="card mb-2 bg-light">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h6 class="mb-0 fw-semibold">Idioma ${i+1}</h6>
                            <button type="button" class="btn btn-outline-danger btn-sm" data-remove-lang="${i}">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        <div class="row g-2">
                            <div class="col-md-6">
                                <label class="form-label small">Idioma</label>
                                <input type="text" id="ats-lang-name-${i}" class="form-control form-control-sm" value="${lang.language}">
                            </div>
                            <div class="col-md-6">
                                <label class="form-label small">Nivel</label>
                                <input type="text" id="ats-lang-level-${i}" class="form-control form-control-sm" value="${lang.level}" placeholder="Ej: Nativo, Avanzado, Intermedio">
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            
            langContainer.querySelectorAll('[data-remove-lang]').forEach(btn => {
                btn.addEventListener('click', () => removeLanguage(parseInt(btn.dataset.removeLang)));
            });
            
            langContainer.querySelectorAll('input, textarea').forEach(input => {
                input.addEventListener('input', () => {
                    collectATSData();
                    calculateATSScore();
                });
            });
        }
        
        updateATSTips();
    }

    function calculateATSScore() {
        collectATSData();
        let score = 0;
        let totalItems = 0;
        
        // Contact info
        const contactFields = ['name', 'email', 'phone', 'location'];
        contactFields.forEach(field => { if (atsData[field]?.trim()) score += 10; totalItems +=10; });
        
        // Summary
        if (atsData.summary?.trim().length > 50) { score +=15; }
        totalItems +=15;
        
        // Experience
        if (atsData.experience.length > 0) {
            score += 25;
            atsData.experience.forEach(exp => {
                if (exp.title && exp.company) score +=5;
                if (exp.description?.length > 100) score +=5;
            });
        }
        totalItems +=40;
        
        // Education
        if (atsData.education.length > 0) {
            score += 10;
        }
        totalItems +=10;
        
        // Skills
        const skillCount = atsData.skills.split(',').filter(s => s.trim()).length;
        if (skillCount >= 5) score +=10;
        else if (skillCount >=3) score +=5;
        totalItems +=10;
        
        // Certifications/Languages bonus
        if (atsData.certifications.length >0 || atsData.languages.length>0) score +=10;
        
        // Cap at 100
        score = Math.min(100, score);
        
        // Update UI
        const scoreEl = safeGet('#ats-score');
        if (scoreEl) scoreEl.textContent = score;
        const barEl = safeGet('#ats-score-bar');
        if (barEl) {
            barEl.style.width = `${score}%`;
            if (score >= 80) {
                barEl.className = 'progress-bar bg-success';
            } else if (score >= 50) {
                barEl.className = 'progress-bar bg-warning';
            } else {
                barEl.className = 'progress-bar bg-danger';
            }
        }
        const scoreText = safeGet('#ats-score-text');
        if (scoreText) {
            if (score >= 80) {
                scoreText.textContent = '¡Excelente! Tu CV está listo para ATS.';
            } else if (score >=50) {
                scoreText.textContent = 'Sigue completando campos para mejorar tu puntaje.';
            } else {
                scoreText.textContent = 'Completa tu información para pasar filtros ATS.';
            }
        }
        
        updateATSTips();
    }

    function updateATSTips() {
        const tips = [];
        const descriptions = (atsData.experience || []).map(exp => exp.description || '').filter(Boolean);
        const combinedDescriptions = descriptions.join('\n');
        const hasQuantifiedResults = /(\d+%|\$\s?\d|[0-9,]+\s+(?:usuarios|clientes|proyectos|transacciones|horas|personas|asistentes))/i.test(combinedDescriptions);
        const diseneMatches = combinedDescriptions.match(/\bDiseñ[ée]\b/gi) || [];
        const decorativeBulletMatches = combinedDescriptions.match(/[◆►●◉▪▫★☆]/g) || [];
        
        if (!atsData.name) tips.push({ type: 'warning', title: 'Falta nombre', msg: 'Tu nombre completo es esencial para que el reclutador te contacte.' });
        if (!atsData.email) tips.push({ type: 'warning', title: 'Falta email', msg: 'Agrega un correo electrónico profesional.' });
        if (atsData.summary?.trim().length < 100) tips.push({ type: 'info', title: 'Mejora tu resumen', msg: 'Tu resumen debe ser de 3-4 líneas con tus habilidades clave y valor agregado.' });
        if (atsData.experience.length ===0) tips.push({ type: 'warning', title: 'Falta experiencia', msg: 'Agrega tu experiencia laboral con descripciones detalladas.' });
        atsData.experience.forEach((exp, i) => {
            if (!exp.title || !exp.company) tips.push({ type: 'warning', title: `Experiencia ${i+1} incompleta`, msg: 'Completa título del cargo y nombre de la empresa.' });
            if (!exp.description || exp.description.length < 80) tips.push({ type: 'info', title: `Mejora experiencia ${i+1}`, msg: 'Usa verbos de acción (Diseñé, Implementé, Lideré) y cuantifica logros.' });
        });
        if (!hasQuantifiedResults && descriptions.length > 0) {
            tips.push({ type: 'info', title: 'Logros cuantificados', msg: 'Agrega resultados medibles como porcentajes, ahorro de tiempo, usuarios atendidos o ingresos impactados.' });
        }
        if (diseneMatches.length >= 3) {
            tips.push({ type: 'info', title: 'Varía verbos de acción', msg: 'Evita repetir "Diseñé" demasiadas veces. Alterna con Lideré, Coordiné, Implementé, Optimicé o Dirigí.' });
        }
        if (decorativeBulletMatches.length > 0) {
            tips.push({ type: 'info', title: 'Bullets simples', msg: 'Usa bullets sencillos y consistentes como • o - para mejorar compatibilidad ATS.' });
        }
        
        const tipsEl = safeGet('#ats-tips');
        if (tipsEl) {
            if (tips.length === 0) {
                tipsEl.innerHTML = `
                    <div class="alert alert-success d-flex gap-2">
                        <i class="bi bi-check-circle-fill"></i>
                        <div><div class="fw-bold">¡Genial!</div><div class="small">Tu CV sigue las recomendaciones ATS básicas.</div></div>
                    </div>
                `;
            } else {
                tipsEl.innerHTML = tips.map(tip => `
                    <div class="alert alert-${tip.type} d-flex gap-2">
                        <i class="bi bi-${tip.type === 'success' ? 'check-circle' : tip.type === 'warning' ? 'exclamation-triangle' : 'info-circle'}-fill"></i>
                        <div><div class="fw-bold">${tip.title}</div><div class="small">${tip.msg}</div></div>
                    </div>
                `).join('');
            }
        }
    }

    function saveATSDraft() {
        collectATSData();
        setStore(ATS_STORAGE_KEY, atsData);
        toast('success', 'Guardado', 'Borrador de CV guardado correctamente.');
    }

    function loadATSDraft() {
        const saved = getStore(ATS_STORAGE_KEY, null);
        if (saved) {
            atsData = saved;
            renderATSEditor();
            calculateATSScore();
            toast('success', 'Cargado', 'Borrador recuperado correctamente.');
        } else {
            toast('warning', 'Sin borrador', 'No hay ningún borrador guardado.');
        }
    }

    async function generateATSPDF() {
        collectATSData();
        
        // First, save to current profile for the backend
        if (!state.profile) state.profile = {};
        
        // Prepare structured data for backend
        const profileForPDF = {
            ...state.profile,
            name: atsData.name,
            email: atsData.email,
            phone: atsData.phone,
            location: atsData.location,
            linkedin: atsData.linkedin,
            github: atsData.github,
            summary: atsData.summary,
            experience: atsData.experience.map(exp => ({
                title: exp.title,
                company: exp.company,
                dates: exp.dates,
                description: exp.description.split('\n').filter(Boolean)
            })),
            education: atsData.education.map(edu => `${edu.degree}${edu.school ? `, ${edu.school}` : ''}${edu.date ? ` (${edu.date})` : ''}`),
            certifications: atsData.certifications.map(cert => `${cert.name}${cert.issuer ? ` - ${cert.issuer}` : ''}${cert.date ? ` (${cert.date})` : ''}`),
            skills: atsData.skills.split(',').map(s => s.trim()).filter(Boolean),
            all_skills_flat: atsData.skills.split(',').map(s => s.trim()).filter(Boolean),
            languages_spoken: atsData.languages.map(lang => `${lang.language}${lang.level ? ` (${lang.level})` : ''}`)
        };
        
        try {
            // Call backend to generate PDF
            const generateBtn = safeGet('#ats-generate-pdf');
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generando...';
            }
            
            // Update state profile for the API call
            const oldProfile = JSON.parse(JSON.stringify(state.profile || {}));
            state.profile = profileForPDF;
            
            const res = await fetch(`${API}/api/generate-ats-pdf-from-profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profileForPDF)
            });
            
            // Restore original profile
            state.profile = oldProfile;
            
            if (!res.ok) {
                throw new Error('Error generating PDF');
            }
            
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `CV_${(atsData.name || 'candidato').replace(/\s+/g, '_')}_ATS.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            
            toast('success', 'Listo', 'PDF ATS generado correctamente.');
        } catch (err) {
            console.error(err);
            toast('error', 'Error', 'No se pudo generar el PDF.');
        } finally {
            const generateBtn = safeGet('#ats-generate-pdf');
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> Generar PDF ATS';
            }
        }
    }

    // ─── INIT ────────────────────────────────────────────────────
    function init() {
        state.saved = getStore(STORAGE.SAVED, []);
        state.discarded = getStore(STORAGE.DISCARDED, []);
        updateMetrics();

        initNavigation();
        loadProfile();
        initUpload();
        initLatex();
        initSearch();
        initFilters();
        initProfileEditor();
        initSkillsEditor();
        initModal();
        initModalTabs();
        initModalClose();
        initATSEditor(); // <-- NEW!

        setTimeout(updateSavedJobsUI, 500);

        console.log('🚀 PostulacionAuto Hub v2.0 cargado correctamente');
        console.log('📷 OCR en navegador con Tesseract.js + PDF.js disponible');
    }

    document.addEventListener('DOMContentLoaded', init);

})();
