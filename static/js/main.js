document.addEventListener("DOMContentLoaded", () => {
    // API base URL
    const API_URL = "";

    // DOM Elements
    const searchBtn = document.getElementById("search-btn");
    const exportBtn = document.getElementById("export-btn");
    const resultsActionsBar = document.getElementById("results-actions-bar");
    const jobsContainer = document.getElementById("jobs-container");
    const emptyState = document.getElementById("empty-state");
    const searchLoader = document.getElementById("search-loader");
    const resultsSummary = document.getElementById("results-summary");
    const rangeSlider = document.getElementById("max-results");
    const rangeVal = document.getElementById("range-val");
    
    // Advanced UI Filters & Stats DOM
    const filtersCard = document.getElementById("advanced-filters-card");
    const statsCard = document.getElementById("results-stats-card");

    // Modal Elements
    const jobModal = document.getElementById("job-modal");
    const modalClose = document.getElementById("modal-close");
    const modalTitle = document.getElementById("modal-title");
    const modalCompany = document.getElementById("modal-company");
    const modalLocation = document.getElementById("modal-location");
    const modalSalary = document.getElementById("modal-salary");
    const modalDate = document.getElementById("modal-date");
    const modalScore = document.getElementById("modal-score");
    const modalMatchedSkills = document.getElementById("modal-matched-skills");
    const modalDescText = document.getElementById("modal-desc-text");
    const modalApplyLink = document.getElementById("modal-apply-link");
    const modalSourceBadge = document.getElementById("modal-source-badge");

    // Local State
    let currentJobs = [];
    let activeProfile = null;
    let currentModalJob = null;
    let stepTimer = null;
    
    let savedJobIds = JSON.parse(localStorage.getItem("saved_jobs") || "[]");
    let discardedJobIds = JSON.parse(localStorage.getItem("discarded_jobs") || "[]");

    // Initialize Range Slider value display
    rangeSlider.addEventListener("input", (e) => {
        rangeVal.textContent = e.target.value;
    });

    // Close Modal handler
    modalClose.addEventListener("click", () => {
        jobModal.style.display = "none";
    });

    window.addEventListener("click", (e) => {
        if (e.target === jobModal) {
            jobModal.style.display = "none";
        }
    });

    // Handle Search Type (Presencial / Remoto) Change to swap place defaults
    const searchTypeSelect = document.getElementById("search-type");
    const searchLocInput = document.getElementById("search-loc-input");
    
    searchTypeSelect.addEventListener("change", (e) => {
        if (e.target.value === "presencial") {
            searchLocInput.value = "Veracruz, Veracruz";
            searchLocInput.placeholder = "Ej. Veracruz, Monterrey, Puebla";
        } else {
            searchLocInput.value = "México";
            searchLocInput.placeholder = "Ej. México, USA, LatAm, Global";
        }
    });

    // Load Candidate Profile on Startup
    async function loadProfile() {
        try {
            const localData = localStorage.getItem("postulacion_candidate_profile");
            if (localData) {
                activeProfile = JSON.parse(localData);
                console.log("Loaded profile from localStorage", activeProfile);
                
                // Sync to backend
                await fetch(`${API_URL}/api/profile`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(activeProfile)
                });
                
                updateProfileUI(activeProfile);
            } else {
                const response = await fetch(`${API_URL}/api/profile`);
                const json = await response.json();
                
                if (json.status === "success") {
                    activeProfile = json.data;
                    localStorage.setItem("postulacion_candidate_profile", JSON.stringify(activeProfile));
                    updateProfileUI(activeProfile);
                }
            }
        } catch (error) {
            console.error("Error loading profile:", error);
            document.getElementById("cand-name").textContent = "Erwin Brow M. Herrera";
            document.getElementById("cand-title").textContent = "Full Stack Developer";
        }
    }

    async function saveProfileLocallyAndRemotely() {
        if (!activeProfile) return;
        localStorage.setItem("postulacion_candidate_profile", JSON.stringify(activeProfile));
        try {
            await fetch(`${API_URL}/api/profile`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(activeProfile)
            });
        } catch (e) {
            console.error("Error syncing profile with server:", e);
        }
    }

    // Step Loader Sequence
    function startStepLoader() {
        const steps = ["step-init", "step-li", "step-occ", "step-ct", "step-gb", "step-ats"];
        // Reset all steps to initial state
        steps.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.className = "loader-step";
                const icon = el.querySelector(".step-icon");
                if (icon) icon.className = "fa-regular fa-circle step-icon";
            }
        });
        
        let currentIdx = 0;
        
        function next() {
            if (currentIdx > 0) {
                // Mark previous step as completed
                const prevEl = document.getElementById(steps[currentIdx - 1]);
                if (prevEl) {
                    prevEl.className = "loader-step completed";
                    const icon = prevEl.querySelector(".step-icon");
                    if (icon) icon.className = "fa-solid fa-circle-check step-icon";
                }
            }
            
            if (currentIdx < steps.length) {
                // Mark current step as active
                const el = document.getElementById(steps[currentIdx]);
                if (el) {
                    el.className = "loader-step active";
                    const icon = el.querySelector(".step-icon");
                    if (icon) icon.className = "fa-solid fa-circle-notch fa-spin step-icon";
                }
                currentIdx++;
                stepTimer = setTimeout(next, 2000); // Trigger next step in 2 seconds
            }
        }
        next();
    }

    function stopStepLoader() {
        if (stepTimer) {
            clearTimeout(stepTimer);
            stepTimer = null;
        }
    }

    // Search Job Openings
    async function searchJobsAction() {
        const keywords = document.getElementById("search-keywords").value;
        const searchType = searchTypeSelect.value;
        const searchLoc = searchLocInput.value.trim();
        const maxResults = rangeSlider.value;

        // Build composite location string (e.g. "Remoto (México)" or "Veracruz, Veracruz")
        const locationQuery = searchType === "remoto" ? `Remoto (${searchLoc})` : searchLoc;

        // Show loading state
        searchBtn.disabled = true;
        searchBtn.querySelector(".btn-content").classList.add("hidden");
        searchBtn.querySelector(".btn-loader").classList.remove("hidden");
        
        jobsContainer.classList.add("hidden");
        emptyState.classList.add("hidden");
        searchLoader.classList.remove("hidden");
        resultsActionsBar.classList.add("hidden");
        
        // Hide stats & filters during search
        filtersCard.classList.add("hidden");
        statsCard.classList.add("hidden");

        resultsSummary.textContent = "Buscando vacantes...";
        startStepLoader();

        try {
            const queryParams = new URLSearchParams({
                keywords: keywords,
                location: locationQuery,
                max_results: maxResults
            });

            const response = await fetch(`${API_URL}/api/search?${queryParams.toString()}`);
            const json = await response.json();

            stopStepLoader();
            searchLoader.classList.add("hidden");
            searchBtn.disabled = false;
            searchBtn.querySelector(".btn-content").classList.remove("hidden");
            searchBtn.querySelector(".btn-loader").classList.add("hidden");

            if (json.status === "success" && json.data.length > 0) {
                currentJobs = json.data;
                resultsSummary.textContent = `Se encontraron ${currentJobs.length} empleos calificados en base a tu CV.`;
                resultsActionsBar.classList.remove("hidden");
                
                // Show stats & filters panel
                filtersCard.classList.remove("hidden");
                statsCard.classList.remove("hidden");
                
                resetFilterInputs();
                applyClientFilters();
            } else {
                currentJobs = [];
                resultsSummary.textContent = "No se encontraron vacantes con las palabras clave especificadas.";
                emptyState.querySelector("h3").textContent = "Sin resultados";
                emptyState.querySelector("p").textContent = "Prueba agregando otros términos o modificando los parámetros de búsqueda.";
                emptyState.classList.remove("hidden");
            }
        } catch (error) {
            console.error("Error searching jobs:", error);
            stopStepLoader();
            searchLoader.classList.add("hidden");
            resultsSummary.textContent = "Error al conectar con los servidores de búsqueda.";
            emptyState.querySelector("h3").textContent = "Error de Conexión";
            emptyState.querySelector("p").textContent = "Asegúrate de que el servidor Flask esté activo en localhost:5000.";
            emptyState.classList.remove("hidden");
        }
    }

    // Render Jobs onto Grid
    function renderJobsList(jobsToRender = currentJobs) {
        jobsContainer.innerHTML = "";
        
        if (jobsToRender.length === 0) {
            jobsContainer.innerHTML = `
                <div class="empty-container" style="padding: 3rem 1.5rem; background: none; border: none;">
                    <div class="empty-icon" style="font-size: 2.2rem;"><i class="fa-solid fa-filter-circle-xmark"></i></div>
                    <h4>Filtros restrictivos</h4>
                    <p style="font-size: 0.85rem;">Ningún empleo coincide con los filtros aplicados. Relaja los criterios.</p>
                </div>
            `;
            return;
        }

        jobsContainer.classList.remove("hidden");

        jobsToRender.forEach(job => {
            const isSaved = savedJobIds.includes(job.id);
            const isDiscarded = discardedJobIds.includes(job.id);
            const highMatch = job.match_score >= 75;
            const superMatch = job.match_score >= 80;

            const card = document.createElement("div");
            card.className = `job-card ${superMatch ? 'super-match' : (highMatch ? 'high-match' : '')} ${isDiscarded ? 'dimmed' : ''}`;
            card.id = `card-${job.id}`;

            const sourceSlug = job.source.toLowerCase().replace(/\s+/g, '-');

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
                        <span class="match-percentage">${job.match_score}%</span>
                        <span class="match-label">Match</span>
                        <div class="match-bar-bg">
                            <div class="match-bar-fill" style="width: ${job.match_score}%"></div>
                        </div>
                    </div>
                </div>

                <div class="job-meta-row">
                    <div class="meta-col"><i class="fa-solid fa-location-dot"></i> <span>${job.location}</span></div>
                    <div class="meta-col"><i class="fa-solid fa-money-bill-wave"></i> <span>${job.salary}</span></div>
                    <div class="meta-col"><i class="fa-solid fa-calendar"></i> <span>${job.date}</span></div>
                    <div class="meta-col">
                        <span class="platform-badge ${sourceSlug}">${job.source}</span>
                    </div>
                </div>

                ${job.matched_skills && job.matched_skills.length > 0 ? `
                <div class="job-skills-matched">
                    <span class="matched-label">Coincide:</span>
                    ${job.matched_skills.map(skill => `<span class="skill-tag-matched">${skill}</span>`).join('')}
                </div>
                ` : ''}

                <div class="job-card-actions">
                    <div class="action-left">
                        <button class="icon-btn save-btn ${isSaved ? 'active-save' : ''}" title="Guardar oferta">
                            <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                        </button>
                        <button class="icon-btn discard-btn ${isDiscarded ? 'active-discard' : ''}" title="Descartar de la lista">
                            <i class="fa-solid ${isDiscarded ? 'fa-eye' : 'fa-eye-slash'}"></i>
                        </button>
                    </div>
                    <button class="btn btn-secondary btn-sm details-btn">Ver Detalles</button>
                </div>
            `;

            // Card Event Listeners
            const triggerModal = () => showJobDetails(job);
            card.querySelector(".job-card-title").addEventListener("click", triggerModal);
            card.querySelector(".details-btn").addEventListener("click", triggerModal);

            // Save Toggle
            const saveBtn = card.querySelector(".save-btn");
            saveBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleSaveJob(job.id, saveBtn);
            });

            // Discard Toggle
            const discardBtn = card.querySelector(".discard-btn");
            discardBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleDiscardJob(job.id, card, discardBtn);
            });

            jobsContainer.appendChild(card);
        });
    }

    // Save Toggle Logic
    function toggleSaveJob(id, btn) {
        const icon = btn.querySelector("i");
        if (savedJobIds.includes(id)) {
            savedJobIds = savedJobIds.filter(x => x !== id);
            btn.classList.remove("active-save");
            icon.className = "fa-regular fa-bookmark";
        } else {
            savedJobIds.push(id);
            btn.classList.add("active-save");
            icon.className = "fa-solid fa-bookmark";
            if (discardedJobIds.includes(id)) {
                discardedJobIds = discardedJobIds.filter(x => x !== id);
                const card = document.getElementById(`card-${id}`);
                if (card) {
                    card.classList.remove("dimmed");
                    const discardBtn = card.querySelector(".discard-btn");
                    discardBtn.classList.remove("active-discard");
                    discardBtn.querySelector("i").className = "fa-solid fa-eye-slash";
                }
            }
        }
        localStorage.setItem("saved_jobs", JSON.stringify(savedJobIds));
        localStorage.setItem("discarded_jobs", JSON.stringify(discardedJobIds));
    }

    // Discard Toggle Logic
    function toggleDiscardJob(id, card, btn) {
        const icon = btn.querySelector("i");
        if (discardedJobIds.includes(id)) {
            discardedJobIds = discardedJobIds.filter(x => x !== id);
            card.classList.remove("dimmed");
            btn.classList.remove("active-discard");
            icon.className = "fa-solid fa-eye-slash";
        } else {
            discardedJobIds.push(id);
            card.classList.add("dimmed");
            btn.classList.add("active-discard");
            icon.className = "fa-solid fa-eye";
            if (savedJobIds.includes(id)) {
                savedJobIds = savedJobIds.filter(x => x !== id);
                const saveBtn = card.querySelector(".save-btn");
                saveBtn.classList.remove("active-save");
                saveBtn.querySelector("i").className = "fa-regular fa-bookmark";
            }
        }
        localStorage.setItem("saved_jobs", JSON.stringify(savedJobIds));
        localStorage.setItem("discarded_jobs", JSON.stringify(discardedJobIds));
    }

    // Show Details Modal
    function showJobDetails(job) {
        currentModalJob = job;
        resetModalTabs();
        modalTitle.textContent = job.title;
        modalCompany.textContent = job.company;
        modalLocation.textContent = job.location;
        modalSalary.textContent = job.salary;
        modalDate.textContent = job.date;
        modalScore.textContent = `${job.match_score}% de Coincidencia`;
        modalDescText.textContent = job.description;
        modalApplyLink.href = job.link;

        modalSourceBadge.textContent = job.source;
        modalSourceBadge.className = `badge platform-badge ${job.source.toLowerCase().replace(/\s+/g, '-')}`;

        // Matched Skills Badges
        modalMatchedSkills.innerHTML = "";
        if (job.matched_skills && job.matched_skills.length > 0) {
            job.matched_skills.forEach(skill => {
                const s = document.createElement("span");
                s.className = "skill-tag-matched";
                s.textContent = skill;
                modalMatchedSkills.appendChild(s);
            });
        } else {
            modalMatchedSkills.textContent = "Ninguna habilidad directa detectada en la pre-vista.";
        }

        jobModal.style.display = "block";
    }

    // Export CSV API Call
    async function exportJobsAction() {
        if (currentJobs.length === 0) return;

        try {
            const response = await fetch(`${API_URL}/api/export`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ jobs: currentJobs })
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `empleos_postulacion_${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } else {
                alert("Error al exportar los empleos a CSV");
            }
        } catch (error) {
            console.error("Error exporting jobs:", error);
            alert("No se pudo conectar al servicio de exportación.");
        }
    }

    // Client-side Filters & Stats Logic
    function initFilters() {
        const filterScore = document.getElementById("filter-score");
        const filterScoreVal = document.getElementById("filter-score-val");
        const filterSalary = document.getElementById("filter-salary");
        const platformFilters = document.querySelectorAll(".platform-filter");

        // Match Score Slider
        filterScore.addEventListener("input", (e) => {
            filterScoreVal.textContent = `${e.target.value}%`;
            applyClientFilters();
        });

        // Salary input listener
        filterSalary.addEventListener("input", () => {
            applyClientFilters();
        });

        // Platform checkboxes listener
        platformFilters.forEach(cb => {
            cb.addEventListener("change", () => {
                applyClientFilters();
            });
        });
    }

    function resetFilterInputs() {
        document.getElementById("filter-score").value = 0;
        document.getElementById("filter-score-val").textContent = "0%";
        document.getElementById("filter-salary").value = "";
        document.querySelectorAll(".platform-filter").forEach(cb => cb.checked = true);
    }

    function applyClientFilters() {
        const minScore = parseInt(document.getElementById("filter-score").value || 0);
        const minSalaryVal = parseFloat(document.getElementById("filter-salary").value || 0);
        
        const checkedPlatforms = [];
        document.querySelectorAll(".platform-filter:checked").forEach(cb => {
            checkedPlatforms.push(cb.value);
        });

        const filtered = currentJobs.filter(job => {
            // 1. Channel / Platform Filter
            const standardPlatforms = ["LinkedIn", "OCC Mundial", "Computrabajo", "Get on Board"];
            let platformMatch = checkedPlatforms.includes(job.source);
            
            // If the platform is a web platform scraped by Google Jobs (or starts with google_)
            if (!platformMatch && checkedPlatforms.includes("Google (Web)")) {
                if (!standardPlatforms.includes(job.source) || job.id.startsWith("google_")) {
                    platformMatch = true;
                }
            }
            if (!platformMatch) return false;

            // 2. Score Match Filter
            if (job.match_score < minScore) return false;

            // 3. Salary Filter
            if (minSalaryVal > 0) {
                const numSalary = parseSalaryAmount(job.salary);
                if (numSalary === 0) return false;
                if (numSalary < minSalaryVal) return false;
            }

            return true;
        });

        renderJobsList(filtered);
        updateStatistics(filtered);
    }

    function parseSalaryAmount(salStr) {
        if (!salStr || salStr.toLowerCase().includes("no especificado") || salStr.toLowerCase().includes("ver en portal")) {
            return 0;
        }

        // Clean string and keep only numbers
        let clean = salStr.toLowerCase().replace(/,/g, '').replace(/\s/g, '');
        const match = clean.match(/\d+/);
        if (!match) return 0;

        let num = parseFloat(match[0]);

        // Convert roughly USD to MXN if USD marker exists
        if (clean.includes("usd") || clean.includes("dolar") || clean.includes("dollar")) {
            num = num * 20; // 1 USD = 20 MXN exchange rate approximation
        }

        return num;
    }

    function updateStatistics(jobs) {
        const totalEl = document.getElementById("stat-total");
        const avgEl = document.getElementById("stat-avg-match");
        const barsContainer = document.getElementById("stats-dist-bars");

        totalEl.textContent = jobs.length;

        if (jobs.length > 0) {
            const totalScore = jobs.reduce((sum, j) => sum + j.match_score, 0);
            avgEl.textContent = `${Math.round(totalScore / jobs.length)}%`;
        } else {
            avgEl.textContent = "0%";
        }

        // Channels distribution counts
        const counts = {};
        jobs.forEach(j => {
            counts[j.source] = (counts[j.source] || 0) + 1;
        });

        // Draw progress bar stats dynamically
        barsContainer.innerHTML = "";
        const channels = ["LinkedIn", "OCC Mundial", "Computrabajo", "Get on Board"];
        
        channels.forEach(ch => {
            const count = counts[ch] || 0;
            const pct = jobs.length > 0 ? Math.round((count / jobs.length) * 100) : 0;
            
            const slug = ch.toLowerCase().replace(/\s+/g, '-');
            
            const barItem = document.createElement("div");
            barItem.className = "dist-bar-item";
            barItem.innerHTML = `
                <div class="dist-bar-meta">
                    <span class="dist-name">${ch}</span>
                    <span class="dist-count">${count} (${pct}%)</span>
                </div>
                <div class="dist-progress-bg">
                    <div class="dist-progress-fill ${slug}" style="width: ${pct}%"></div>
                </div>
            `;
            barsContainer.appendChild(barItem);
        });
    }

    // Setup CV Upload Drag & Drop and Click triggers
    function initUpload() {
        const uploadZone = document.getElementById("cv-upload-zone");
        const fileInput = document.getElementById("cv-file-input");
        const uploadText = uploadZone.querySelector(".upload-text");

        uploadZone.addEventListener("click", () => {
            if (!uploadZone.classList.contains("processing")) {
                fileInput.click();
            }
        });

        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) handleCVUpload(file);
        });

        // Drag events
        ["dragenter", "dragover"].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.add("dragover");
            }, false);
        });

        ["dragleave", "dragend", "drop"].forEach(eventName => {
            uploadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                uploadZone.classList.remove("dragover");
            }, false);
        });

        uploadZone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const file = dt.files[0];
            if (file) handleCVUpload(file);
        });

        async function handleCVUpload(file) {
            if (!file.name.toLowerCase().endsWith(".pdf")) {
                alert("Solo se permiten archivos en formato PDF.");
                return;
            }

            const formData = new FormData();
            formData.append("cv", file);

            uploadZone.classList.add("processing");
            uploadText.textContent = "Procesando CV por ATS...";
            
            try {
                const response = await fetch(`${API_URL}/api/upload-cv`, {
                    method: "POST",
                    body: formData
                });
                const json = await response.json();
                
                uploadZone.classList.remove("processing");
                uploadText.textContent = "Subir otro CV (Arrastra o haz clic aquí)";

                if (json.status === "success") {
                    alert("CV procesado exitosamente por el motor ATS.");
                    activeProfile = json.data;
                    localStorage.setItem("postulacion_candidate_profile", JSON.stringify(activeProfile));
                    updateProfileUI(json.data);
                } else {
                    alert(`Error: ${json.message}`);
                }
            } catch (error) {
                console.error("Error uploading CV:", error);
                uploadZone.classList.remove("processing");
                uploadText.textContent = "Subir otro CV (Arrastra o haz clic aquí)";
                alert("Error de conexión al subir el CV.");
            }
        }
    }

    function updateProfileUI(p) {
        activeProfile = p; // Keep profile in memory
        document.getElementById("cand-name").textContent = p.name;
        document.getElementById("cand-title").textContent = p.title;
        document.getElementById("cand-email").textContent = p.email;
        document.getElementById("cand-phone").textContent = p.phone;
        document.getElementById("cand-location").textContent = p.location;
        
        const linkedinLink = document.getElementById("cand-linkedin");
        linkedinLink.href = p.linkedin.startsWith("http") ? p.linkedin : `https://${p.linkedin}`;
        
        const githubLink = document.getElementById("cand-github");
        githubLink.href = p.github.startsWith("http") ? p.github : `https://${p.github}`;

        // Populate Skills
        const container = document.getElementById("skills-container");
        container.innerHTML = "";
        
        const categories = {
            "languages": "Lenguajes & Frameworks",
            "backend": "Backend & APIs",
            "infrastructure": "Infraestructura TI",
            "security": "Ciberseguridad",
            "iot": "IoT & Hardware",
            "management": "Gestión de Proyectos"
        };

        for (const [key, label] of Object.entries(categories)) {
            if (p.skills[key] && p.skills[key].length > 0) {
                const box = document.createElement("div");
                box.className = "skill-category-box";
                
                const title = document.createElement("div");
                title.className = "category-name";
                title.textContent = label;
                box.appendChild(title);
                
                const grid = document.createElement("div");
                grid.className = "skills-badges";
                
                p.skills[key].forEach(skill => {
                    const badge = document.createElement("span");
                    badge.className = "badge";
                    badge.textContent = skill;
                    
                    // Click handler to delete in edit mode
                    badge.addEventListener("click", async () => {
                        const skillsContainer = document.getElementById("skills-container");
                        if (skillsContainer.classList.contains("edit-mode")) {
                            activeProfile.skills[key] = activeProfile.skills[key].filter(s => s !== skill);
                            activeProfile.all_skills_flat = activeProfile.all_skills_flat.filter(s => s !== skill);
                            
                            await saveProfileLocallyAndRemotely();
                            updateProfileUI(activeProfile);
                            recalculateMatchScoresClientSide();
                            
                            // Keep edit UI open
                            document.getElementById("skills-container").classList.add("edit-mode");
                            document.getElementById("toggle-edit-skills").classList.add("active");
                            document.getElementById("toggle-edit-skills").innerHTML = '<i class="fa-solid fa-check"></i>';
                            document.getElementById("add-skill-form").classList.remove("hidden");
                        }
                    });
                    
                    grid.appendChild(badge);
                });
                
                box.appendChild(grid);
                container.appendChild(box);
            }
        }

        const flatSkills = p.all_skills_flat || [];
        if (flatSkills.length > 0) {
            document.getElementById("search-keywords").value = flatSkills.slice(0, 5).join(", ");
        }

        // Clear search results
        currentJobs = [];
        jobsContainer.innerHTML = "";
        jobsContainer.classList.add("hidden");
        resultsActionsBar.classList.add("hidden");
        filtersCard.classList.add("hidden");
        statsCard.classList.add("hidden");
        
        resultsSummary.textContent = "Perfil cargado. Modifica las palabras clave de búsqueda si lo deseas.";
        emptyState.querySelector("h3").textContent = "Nuevo Perfil Cargado";
        emptyState.querySelector("p").textContent = `El CV de ${p.name} ha sido procesado. Haz clic en "Buscar Empleos" para encontrar vacantes.`;
        emptyState.classList.remove("hidden");
    }

    // Recalculate match scores client-side instantly when skills change
    function recalculateMatchScoresClientSide() {
        if (!currentJobs || currentJobs.length === 0 || !activeProfile) return;
        
        currentJobs = currentJobs.map(job => {
            const title = job.title.toLowerCase();
            const description = (job.description || "").toLowerCase();
            
            const matched_skills = [];
            let score = 10;
            
            const flatSkills = activeProfile.all_skills_flat || [];
            
            flatSkills.forEach(skill => {
                const skillLower = skill.toLowerCase();
                let pattern;
                const escapedSkill = skillLower.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                if (['#', '+', '.', '/'].some(char => skillLower.includes(char))) {
                    pattern = new RegExp(escapedSkill, 'i');
                } else {
                    pattern = new RegExp('\\b' + escapedSkill + '\\b', 'i');
                }
                
                if (pattern.test(title)) {
                    score += 25;
                    matched_skills.push(skill);
                } else if (pattern.test(description)) {
                    score += 12;
                    matched_skills.push(skill);
                }
            });
            
            flatSkills.slice(0, 5).forEach(skill => {
                if (title.includes(skill.toLowerCase())) {
                    score += 15;
                }
            });
            
            job.match_score = Math.min(score, 100);
            job.matched_skills = Array.from(new Set(matched_skills));
            return job;
        });
        
        currentJobs.sort((a, b) => b.match_score - a.match_score);
        applyClientFilters();
    }

    // Modal Tabs & Cover Letter Generator
    function initModalTabs() {
        const tabBtns = document.querySelectorAll(".modal-tab-btn");
        const tabContents = document.querySelectorAll(".modal-tab-content");
        
        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                tabBtns.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.add("hidden"));
                
                btn.classList.add("active");
                const tabId = btn.getAttribute("data-tab");
                document.getElementById(tabId).classList.remove("hidden");
                
                if (tabId === "tab-cover-letter") {
                    generateCoverLetterContent();
                }
            });
        });
        
        document.getElementById("cl-tone-select").addEventListener("change", () => {
            generateCoverLetterContent();
        });
        
        const clCopyBtn = document.getElementById("cl-copy-btn");
        clCopyBtn.addEventListener("click", () => {
            const clTextOutput = document.getElementById("cl-text-output");
            clTextOutput.select();
            navigator.clipboard.writeText(clTextOutput.value).then(() => {
                const oldText = clCopyBtn.innerHTML;
                clCopyBtn.innerHTML = `<i class="fa-solid fa-check"></i> ¡Copiado!`;
                setTimeout(() => {
                    clCopyBtn.innerHTML = oldText;
                }, 2000);
            }).catch(err => {
                console.error("Could not copy text: ", err);
                alert("No se pudo copiar el texto automáticamente. Por favor selecciónalo manualmente.");
            });
        });
    }
    
    function resetModalTabs() {
        document.querySelectorAll(".modal-tab-btn").forEach(btn => {
            if (btn.getAttribute("data-tab") === "tab-details") {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });
        document.getElementById("tab-details").classList.remove("hidden");
        document.getElementById("tab-cover-letter").classList.add("hidden");
    }
    
    function generateCoverLetterContent() {
        if (!currentModalJob || !activeProfile) return;
        
        const tone = document.getElementById("cl-tone-select").value;
        const clTextOutput = document.getElementById("cl-text-output");
        const clEmailBtn = document.getElementById("cl-email-btn");
        
        const cName = activeProfile.name || "Candidato";
        const cTitle = activeProfile.title || "Profesional de TI";
        const cPhone = activeProfile.phone || "No especificado";
        const cEmail = activeProfile.email || "No especificado";
        const cLinkedin = activeProfile.linkedin || "linkedin.com";
        
        const jTitle = currentModalJob.title;
        const jCompany = currentModalJob.company;
        
        const matchedSkills = currentModalJob.matched_skills || [];
        let skillsText = "";
        if (matchedSkills.length > 0) {
            skillsText = matchedSkills.slice(0, 4).join(", ");
        } else {
            skillsText = (activeProfile.all_skills_flat || []).slice(0, 3).join(", ");
        }
        
        let letter = "";
        
        if (tone === "formal") {
            letter = `Estimado equipo de reclutamiento de ${jCompany},

Le escribo para expresar mi fuerte interés en la vacante de ${jTitle} publicada recientemente. Como ${cTitle}, considero que mi perfil se alinea estrechamente con las necesidades de su organización.

A lo largo de mi trayectoria profesional, he desarrollado competencias sólidas que coinciden directamente con su búsqueda. En particular, cuento con experiencia relevante trabajando con tecnologías y metodologías como ${skillsText}. Estoy convencido de que puedo aportar valor inmediato a sus proyectos de desarrollo e integración tecnológica.

Adjunto a esta postulación encontrará mi currículum detallado. Quedo a su entera disposición para mantener una entrevista y conversar sobre cómo mi experiencia puede contribuir al éxito continuo de ${jCompany}.

Agradeciendo de antemano su tiempo y consideración, le saluda atentamente,

${cName}
Teléfono: ${cPhone}
Email: ${cEmail}
LinkedIn: ${cLinkedin}`;
        } else if (tone === "enthusiastic") {
            letter = `¡Hola, equipo de ${jCompany}! 🚀

Me entusiasma muchísimo postularme a la oportunidad de ${jTitle}. Sigo de cerca el trabajo que realizan y me encantaría sumarme como ${cTitle} para crear soluciones de software innovadoras junto a ustedes.

Lo que más me llamó la atención de la vacante es la oportunidad de aplicar mis habilidades clave en ${skillsText}, las cuales considero que encajan perfectamente con el perfil que buscan para llevar el proyecto al siguiente nivel. Me considero una persona proactiva, enfocada en la resolución de problemas y apasionada por la tecnología.

Me encantaría tener la oportunidad de platicar con ustedes, conocer más sobre sus metas actuales y contarles cómo mi experiencia puede sumar valor al equipo.

¡Muchas gracias por la oportunidad y la consideración!

Un cordial saludo,

${cName}
Contacto: ${cPhone} | ${cEmail}
GitHub/LinkedIn: ${cLinkedin}`;
        } else if (tone === "technical") {
            letter = `Asunto: Candidatura para la posición de ${jTitle} - ${cName}

Estimados ingenieros / equipo técnico de ${jCompany},

Les presento mi postulación para el rol de ${jTitle}. Como ${cTitle}, poseo experiencia práctica en el desarrollo e implementación de sistemas informáticos complejos y arquitectura de software.

Mi perfil técnico abarca un dominio directo en el stack tecnológico solicitado, destacando competencias en: ${skillsText}. En mis proyectos anteriores he diseñado e implementado soluciones escalables, optimización de consultas, integraciones API seguras e infraestructura ágil. 

Estoy habituado a colaborar en equipos ágiles bajo estándares modernos de desarrollo de software (clean code, CI/CD, Git). Me interesa especialmente esta posición en ${jCompany} debido a los retos técnicos del puesto y la oportunidad de aportar mi experiencia de ingeniería.

Quedo a su disposición para discutir los detalles técnicos de mis proyectos previos en una entrevista de ingeniería.

Atentamente,

${cName}
Ingeniero de Software / Systems Developer
Móvil: ${cPhone} | Email: ${cEmail}`;
        } else { // short
            letter = `Estimado equipo de selección de ${jCompany},

Me pongo en contacto con ustedes para postularme al puesto de ${jTitle}. 

Cuento con experiencia comprobable como ${cTitle} y dominio práctico en habilidades clave como: ${skillsText}, lo que me permite adaptarme e incorporarme rápidamente a su flujo de trabajo.

Adjunto mi CV para su revisión. Estaré encantado de mantener una llamada breve para explorar cómo puedo colaborar en sus objetivos actuales.

Saludos cordiales,

${cName}
${cEmail} | ${cPhone}`;
        }
        
        clTextOutput.value = letter;
        
        const subject = encodeURIComponent(`Postulación - ${jTitle} - ${cName}`);
        const body = encodeURIComponent(letter);
        clEmailBtn.href = `mailto:?subject=${subject}&body=${body}`;
    }

    // Attach Event Listeners
    searchBtn.addEventListener("click", searchJobsAction);
    exportBtn.addEventListener("click", exportJobsAction);

    // Skills edit listeners
    const toggleEditSkills = document.getElementById("toggle-edit-skills");
    const addSkillForm = document.getElementById("add-skill-form");
    const addSkillBtn = document.getElementById("add-skill-btn");
    const newSkillName = document.getElementById("new-skill-name");
    const newSkillCategory = document.getElementById("new-skill-category");
    const skillsContainer = document.getElementById("skills-container");
    
    toggleEditSkills.addEventListener("click", () => {
        const isEdit = skillsContainer.classList.toggle("edit-mode");
        toggleEditSkills.classList.toggle("active");
        addSkillForm.classList.toggle("hidden");
        
        if (isEdit) {
            toggleEditSkills.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else {
            toggleEditSkills.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        }
    });
    
    addSkillBtn.addEventListener("click", async () => {
        const name = newSkillName.value.trim();
        const category = newSkillCategory.value;
        
        if (!name || !activeProfile) return;
        
        if (!activeProfile.skills[category]) {
            activeProfile.skills[category] = [];
        }
        
        if (!activeProfile.skills[category].includes(name)) {
            activeProfile.skills[category].push(name);
            if (!activeProfile.all_skills_flat) {
                activeProfile.all_skills_flat = [];
            }
            activeProfile.all_skills_flat.push(name);
            
            await saveProfileLocallyAndRemotely();
            newSkillName.value = "";
            updateProfileUI(activeProfile);
            
            recalculateMatchScoresClientSide();
            
            skillsContainer.classList.add("edit-mode");
            toggleEditSkills.classList.add("active");
            addSkillForm.classList.remove("hidden");
            toggleEditSkills.innerHTML = '<i class="fa-solid fa-check"></i>';
        } else {
            alert("Esta habilidad ya existe en tu perfil.");
        }
    });
    
    newSkillName.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            addSkillBtn.click();
        }
    });

    // Initializations
    loadProfile();
    initUpload();
    initFilters();
    initModalTabs();
});
