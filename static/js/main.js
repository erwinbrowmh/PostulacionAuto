document.addEventListener("DOMContentLoaded", () => {
    // API base URL (works relatively since we serve from the same Flask server)
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

    // Load Candidate Profile on Startup
    async function loadProfile() {
        try {
            const response = await fetch(`${API_URL}/api/profile`);
            const json = await response.json();
            
            if (json.status === "success") {
                updateProfileUI(json.data);
            }
        } catch (error) {
            console.error("Error loading profile:", error);
            document.getElementById("cand-name").textContent = "Erwin Brow M. Herrera";
            document.getElementById("cand-title").textContent = "Full Stack Developer";
        }
    }

    // Search Job Openings
    async function searchJobsAction() {
        const keywords = document.getElementById("search-keywords").value;
        const location = document.querySelector('input[name="search-location"]:checked').value;
        const maxResults = rangeSlider.value;

        // Show loading state
        searchBtn.disabled = true;
        searchBtn.querySelector(".btn-content").classList.add("hidden");
        searchBtn.querySelector(".btn-loader").classList.remove("hidden");
        
        jobsContainer.classList.add("hidden");
        emptyState.classList.add("hidden");
        searchLoader.classList.remove("hidden");
        resultsActionsBar.classList.add("hidden");

        resultsSummary.textContent = "Buscando en Computrabajo y OCC Mundial...";

        try {
            const queryParams = new URLSearchParams({
                keywords: keywords,
                location: location,
                max_results: maxResults
            });

            const response = await fetch(`${API_URL}/api/search?${queryParams.toString()}`);
            const json = await response.json();

            searchLoader.classList.add("hidden");
            searchBtn.disabled = false;
            searchBtn.querySelector(".btn-content").classList.remove("hidden");
            searchBtn.querySelector(".btn-loader").classList.add("hidden");

            if (json.status === "success" && json.data.length > 0) {
                currentJobs = json.data;
                resultsSummary.textContent = `Se encontraron ${currentJobs.length} empleos calificados en base a tu CV.`;
                resultsActionsBar.classList.remove("hidden");
                renderJobsList();
            } else {
                currentJobs = [];
                resultsSummary.textContent = "No se encontraron vacantes con las palabras clave especificadas.";
                emptyState.querySelector("h3").textContent = "Sin resultados";
                emptyState.querySelector("p").textContent = "Prueba agregando otros términos o modificando la ubicación (remoto/presencial).";
                emptyState.classList.remove("hidden");
            }
        } catch (error) {
            console.error("Error searching jobs:", error);
            searchLoader.classList.add("hidden");
            resultsSummary.textContent = "Error al conectar con los servidores de búsqueda.";
            emptyState.querySelector("h3").textContent = "Error de Conexión";
            emptyState.querySelector("p").textContent = "Asegúrate de que el servidor Flask esté activo en localhost:5000.";
            emptyState.classList.remove("hidden");
        }
    }

    // Render Jobs onto Grid
    function renderJobsList() {
        jobsContainer.innerHTML = "";
        jobsContainer.classList.remove("hidden");

        currentJobs.forEach(job => {
            const isSaved = savedJobIds.includes(job.id);
            const isDiscarded = discardedJobIds.includes(job.id);
            const highMatch = job.match_score >= 75;

            const card = document.createElement("div");
            card.className = `job-card ${highMatch ? 'high-match' : ''} ${isDiscarded ? 'dimmed' : ''}`;
            card.id = `card-${job.id}`;

            const sourceSlug = job.source.toLowerCase().replace(/\s+/g, '-');

            card.innerHTML = `
                <div class="job-card-header">
                    <div class="job-title-block">
                        <h4 class="job-card-title">${job.title}</h4>
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
            // View Details Modal on title or details click
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
            // Auto remove from discarded if saved
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
            // Auto remove from saved if discarded
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
                a.download = `empleos_veracruz_remoto_${new Date().toISOString().slice(0, 10)}.csv`;
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
                    // Update profile data in UI
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
                    grid.appendChild(badge);
                });
                
                box.appendChild(grid);
                container.appendChild(box);
            }
        }

        // Set keywords automatically with the first few flat skills (e.g. up to 5)
        const flatSkills = p.all_skills_flat || [];
        if (flatSkills.length > 0) {
            document.getElementById("search-keywords").value = flatSkills.slice(0, 5).join(", ");
        }

        // Clear search results state
        currentJobs = [];
        jobsContainer.innerHTML = "";
        jobsContainer.classList.add("hidden");
        resultsActionsBar.classList.add("hidden");
        resultsSummary.textContent = "Perfil cargado. Modifica las palabras clave de búsqueda si lo deseas.";
        emptyState.querySelector("h3").textContent = "Nuevo Perfil Cargado";
        emptyState.querySelector("p").textContent = `El CV de ${p.name} ha sido procesado. Haz clic en "Buscar Empleos" para encontrar vacantes.`;
        emptyState.classList.remove("hidden");
    }

    // Attach Event Listeners
    searchBtn.addEventListener("click", searchJobsAction);
    exportBtn.addEventListener("click", exportJobsAction);

    // Initializations
    loadProfile();
    initUpload();
});
