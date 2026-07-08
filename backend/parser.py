import os
import re
import pypdf
from datetime import datetime
from backend.ocr_utils import extract_pdf_text_with_ocr, looks_like_low_quality_text

# Extends glossary of tech skills for dynamic ATS parsing
SKILLS_GLOSSARY = {
    "languages": [
        "PHP", "Java", "JavaScript", "JS", "TypeScript", "TS", "Python", "C#", "C++", 
        "Ruby", "Go", "Golang", "Rust", "Swift", "Kotlin", "Dart", "Flutter",
        "React Native", "HTML", "HTML5", "CSS", "CSS3", "HTML/CSS", "Sass", "Less", "SQL", "PL/SQL"
    ],
    "backend": [
        "Laravel", "Symfony", "Yii", "Spring", "Spring Boot", "Django", "Flask", 
        "FastAPI", "Node.js", "Express", "Ruby on Rails", "Rails", "ASP.NET", ".NET",
        "REST APIs", "REST", "SOAP", "GraphQL", "WebSockets", "Stripe API", "Stripe", "Clip Integration", "Clip",
        "Pasarelas de Pago",
        "MySQL", "PostgreSQL", "MongoDB", "MariaDB", "SQLite", "Angular", "React", "Vue.js",
        "Bootstrap", "Git", "GitHub", "GitLab"
    ],
    "infrastructure": [
        "Linux", "Ubuntu", "CentOS", "Debian", "RedHat", "Unix", "cPanel", "WHM",
        "Docker", "Kubernetes", "AWS", "Amazon Web Services", "Azure", "GCP", 
        "Google Cloud", "Nginx", "Apache", "IP/LAN", "LAN/WAN", "Wi-Fi 6", "Wi-Fi", 
        "Structured Cabling", "Cableado Estructurado", "Active Directory", "DNS", "DHCP",
        "Redes IP", "Alta Disponibilidad", "Infraestructura TI"
    ],
    "security": [
        "Ciberseguridad", "Cybersecurity", "Seguridad de la Informacion", "Pentesting", 
        "Hardening", "Risk Management", "Gestion de Riesgos", "Firewall", "IDS/IPS", 
        "OWASP", "ISO 27001", "Perimeter Security", "Seguridad Perimetral", "Data Privacy",
        "Privacidad de Datos"
    ],
    "iot": [
        "IoT", "NFC", "Smart cards", "Tarjetas inteligentes", "Arduino", "Raspberry Pi",
        "Access Control Systems", "Control de Accesos"
    ],
    "management": [
        "Scrum", "Agile", "Kanban", "Project Management", "Gestion de Proyectos", 
        "Scrum Master", "Product Owner", "SLA Management", "SLA", "Stakeholder Management",
        "Gestion de Stakeholders", "Liderazgo de Equipos", "KPIs", "ITIL"
    ]
}

SKILL_STOPWORDS = {
    "habilidades",
    "habilidades tecnicas",
    "skills",
    "stack",
    "stack tecnologico",
    "tecnologias",
    "herramientas",
    "metodologias",
    "relevantes",
}

SKILL_SECTION_CATEGORY_MAP = {
    "lenguajes & frameworks": "languages",
    "lenguajes": "languages",
    "frameworks": "languages",
    "backend & apis": "backend",
    "backend": "backend",
    "apis": "backend",
    "infraestructura & devops": "infrastructure",
    "infraestructura": "infrastructure",
    "devops": "infrastructure",
    "seguridad": "security",
    "iot/hardware": "iot",
    "iot": "iot",
    "hardware": "iot",
    "gestion de proyectos": "management",
}

def extract_skills_dynamically(text, sections=None):
    matched_skills = {cat: [] for cat in SKILLS_GLOSSARY}
    all_flat = []
    seen_flat = set()
    
    text_lower = text.lower()
    
    # Normalize text accents for better matching of Spanish terms
    normalized_text = normalize_text(text_lower)
    
    for category, skills in SKILLS_GLOSSARY.items():
        for skill in skills:
            skill_norm = normalize_text(skill.lower())
            
            # Use regex for word boundaries to avoid partial matches (e.g. 'go' in 'google', 'java' in 'javascript')
            # For special characters like .NET, C++, C#, we escape them
            escaped_skill = re.escape(skill_norm)
            
            # If skill has special chars like C#, C++, .NET, we match without strict \b boundary
            if any(char in skill_norm for char in ['#', '+', '.', '/']):
                pattern = rf'{escaped_skill}'
            else:
                pattern = rf'\b{escaped_skill}\b'
                
            if re.search(pattern, normalized_text):
                matched_skills[category].append(skill)
                lowered = normalize_text(skill.lower())
                if lowered not in seen_flat:
                    seen_flat.add(lowered)
                    all_flat.append(skill)

    for category, token in extract_raw_skill_tokens(sections or {}):
        lowered = normalize_text(token.lower())
        if lowered not in seen_flat:
            seen_flat.add(lowered)
            all_flat.append(token)
        if category and token not in matched_skills[category]:
            matched_skills[category].append(token)

    return matched_skills, all_flat

def normalize_text(text):
    # Replaces accented characters with standard ones
    a, b = 'áéíóúüñ', 'aeiouun'
    trans = str.maketrans(a, b)
    return text.translate(trans)


def extract_raw_skill_tokens(sections):
    lines = []
    for raw_line in sections.get("skills", []) or []:
        clean_line = PAGE_MARKER_RE.sub("", str(raw_line or ""))
        clean_line = fix_common_ocr_artifacts(clean_line)
        clean_line = re.sub(r"\s+", " ", clean_line).strip()
        if clean_line:
            lines.append(clean_line)
    if not lines:
        return []

    bullets = []
    current = ""
    for line in lines:
        clean_line = re.sub(r"\s+", " ", line).strip()
        normalized = normalize_text(clean_line.lower()).lstrip("•-*+ ").strip()
        looks_like_new_item = bool(re.match(r"^[•\-\*+]", clean_line))
        if not looks_like_new_item and ":" in clean_line:
            prefix = normalized.split(":", 1)[0].strip()
            looks_like_new_item = prefix in SKILL_SECTION_CATEGORY_MAP
        if looks_like_new_item:
            if current:
                bullets.append(current.strip())
            current = re.sub(r"^[•\-\*+]\s*", "", clean_line)
        else:
            current = f"{current} {clean_line}".strip() if current else clean_line
    if current:
        bullets.append(current.strip())

    results = []
    seen = set()
    for bullet in bullets:
        raw_category = ""
        body = bullet
        if ":" in bullet:
            raw_category, body = bullet.split(":", 1)
        category = SKILL_SECTION_CATEGORY_MAP.get(normalize_text(raw_category.lower()).strip(), None)
        for token in split_skill_body_tokens(body):
            for alias in expand_skill_token(token):
                lowered = normalize_text(alias.lower())
                if lowered in SKILL_STOPWORDS or lowered in seen:
                    continue
                seen.add(lowered)
                results.append((category, alias))

    return results


def split_skill_body_tokens(body):
    clean_body = re.sub(r"\s+", " ", str(body or "")).strip(" \t.")
    if not clean_body:
        return []
    return [
        token.strip(" \t.")
        for token in re.split(r",\s*(?![^()]*\))|;\s*(?![^()]*\))", clean_body)
        if token.strip(" \t.")
    ]


def expand_skill_token(token):
    clean = re.sub(r"^\s*[\+\-•*]+\s*", "", str(token or "")).strip(" \t.")
    clean = re.sub(r"^(habilidades(?: tecnicas)?|skills?|stack(?: tecnologico)?|tecnologias?)\s*:?\s*", "", clean, flags=re.IGNORECASE)
    if not clean or clean.count("(") != clean.count(")"):
        return []
    if len(clean) < 2 or len(clean) > 100:
        return []
    if re.fullmatch(r"[\d\s.,%+-]+", clean):
        return []
    if normalize_text(clean.lower()).startswith("hasta "):
        return []

    aliases = [clean]
    match = re.match(r"^(.*?)\s*\((.*?)\)\s*$", clean)
    if match:
        base = match.group(1).strip(" \t.")
        inner = match.group(2).strip(" \t.")
        if base:
            aliases.append(base)
        if inner:
            aliases.extend(part.strip(" \t.") for part in re.split(r",\s*", inner) if part.strip(" \t."))
            if "/" in inner and normalize_text(inner.lower()) not in {"lan/wan"}:
                aliases.extend(part.strip(" \t.") for part in inner.split("/") if part.strip(" \t."))

    if "/" in clean and "(" not in clean and normalize_text(clean.lower()) not in {"lan/wan", "iot/hardware"}:
        aliases.extend(part.strip(" \t.") for part in clean.split("/") if part.strip(" \t."))

    output = []
    seen = set()
    for alias in aliases:
        normalized = normalize_text(alias.lower())
        if re.fullmatch(r"[\d\s.,%+-]+", alias):
            continue
        if normalized.startswith("hasta "):
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        output.append(alias)
    return output


SECTION_PATTERNS = {
    "summary": [
        r"^resumen(?: profesional)?$",
        r"^perfil(?: profesional)?$",
        r"^acerca de mi$",
        r"^sobre mi$",
        r"^professional summary$",
    ],
    "experience": [
        r"^experiencia(?: profesional| laboral)?$",
        r"^experience$",
        r"^work experience$",
    ],
    "education": [
        r"^educacion$",
        r"^formacion(?: academica)?$",
        r"^academic background$",
        r"^education$",
    ],
    "certifications": [
        r"^certificaciones?$",
        r"^courses?$",
        r"^cursos?$",
        r"^licenses?$",
    ],
    "languages_spoken": [
        r"^idiomas?$",
        r"^languages?$",
        r"^idiomas y disponibilidad$",
        r"^languages and availability$",
    ],
    "skills": [
        r"^habilidades(?: tecnicas)?$",
        r"^skills?$",
        r"^stack(?: tecnologico)?$",
        r"^tecnologias?$",
    ],
}

ROLE_KEYWORDS = [
    "devops", "developer", "desarrollador", "engineer", "ingeniero", "full stack",
    "backend", "frontend", "analista", "soporte", "administrador", "administrator",
    "security", "ciberseguridad", "sysadmin", "cloud", "infraestructura", "sre",
    "network", "redes", "qa", "data", "arquitecto", "architect"
]

LANGUAGE_KEYWORDS = [
    "Español", "Inglés", "English", "Spanish", "Francés", "French", "Portugués", "Portuguese",
    "Alemán", "German", "Italiano", "Italian"
]

MONTH_PATTERN = (
    r"(?:ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|"
    r"ago(?:sto)?|sep(?:t(?:iembre)?)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?|"
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
    r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
)
DATE_RANGE_RE = re.compile(
    rf"\b{MONTH_PATTERN}\s+\d{{4}}\s*[—–-]\s*(?:{MONTH_PATTERN}\s+\d{{4}}|actual(?:idad)?|presente|current)\b",
    re.IGNORECASE,
)
PAGE_MARKER_RE = re.compile(r"\[?\s*p[aá]gina\s+\d+\s*\]?", re.IGNORECASE)
EXPERIENCE_HEADER_SPLIT_RE = re.compile(
    r"[.!?]\s+([A-ZÁÉÍÓÚÑ][^.\n]{4,120}\|\s*[^|\n]{2,100}(?:\|\s*[^|\n]{2,100})?)"
)


def extract_experience(sections):
    lines = normalize_section_lines(sections.get("experience", []))
    if not lines:
        return []

    experience_list = []
    current_job = None

    for raw_line in lines:
        for line in split_embedded_experience_headers(raw_line):
            if not line:
                continue

            if looks_like_experience_header(line):
                if current_job and is_valid_experience_entry(current_job):
                    current_job["description"] = compact_description_items(current_job["description"])
                    experience_list.append(current_job)
                current_job = parse_experience_header(line)
                continue

            if looks_like_date_line(line):
                if not current_job:
                    current_job = {"title": "", "company": "", "dates": "", "description": []}
                current_job["dates"] = clean_date_line(line)
                continue

            if not current_job:
                continue

            description_line = clean_description_line(line)
            if not description_line:
                continue
            if should_append_to_previous_description(current_job["description"], description_line):
                current_job["description"][-1] += " " + description_line
            else:
                current_job["description"].append(description_line)

    if current_job and is_valid_experience_entry(current_job):
        current_job["description"] = compact_description_items(current_job["description"])
        experience_list.append(current_job)

    return experience_list


def parse_cv_text(text):
    if not text or not text.strip():
        return FALLBACK_PROFILE

    text = PAGE_MARKER_RE.sub("\n", text)
    text = fix_common_ocr_artifacts(text)
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    if not lines:
        return FALLBACK_PROFILE

    sections = extract_sections(lines)
    skills, all_skills_flat = extract_skills_dynamically(text, sections)
    summary = extract_summary(lines, sections)
    title = extract_title(lines, summary)
    experience_years = extract_experience_years(text)
    certifications = extract_certifications(sections)
    certification_entries = extract_certification_entries(sections)
    education = extract_education(sections)
    education_entries = extract_education_entries(sections)
    languages_spoken = extract_languages(text, sections)
    language_entries = extract_language_entries(text, sections)
    preferred_roles = extract_preferred_roles(lines, title, summary)
    experience = extract_experience(sections)
    if not experience_years:
        experience_years = estimate_experience_years(experience)

    profile = {
        "name": extract_name(lines),
        "email": extract_email(text),
        "phone": extract_phone(text),
        "location": extract_location(text),
        "title": title,
        "linkedin": extract_link(text, "linkedin"),
        "github": extract_link(text, "github"),
        "summary": summary,
        "experience_years": experience_years,
        "education": education,
        "education_entries": education_entries,
        "certifications": certifications,
        "certification_entries": certification_entries,
        "languages_spoken": languages_spoken,
        "language_entries": language_entries,
        "preferred_roles": preferred_roles,
        "experience": experience,
        "sections": sections,
        "skills": skills,
        "all_skills_flat": all_skills_flat,
    }
    profile["search_keywords"] = build_profile_keywords(profile)
    profile["analysis_meta"] = {
        "source": "text",
        "native_chars": len(text.strip()),
        "ocr_chars": 0,
        "used_ocr": False,
        "section_count": len(sections),
        "keyword_count": len(profile["search_keywords"]),
    }
    return profile


def normalize_section_lines(lines):
    normalized = []
    for line in lines or []:
        clean = PAGE_MARKER_RE.sub("", str(line or ""))
        clean = fix_common_ocr_artifacts(clean)
        clean = re.sub(r"\s+", " ", clean).strip(" \t•")
        if clean:
            normalized.append(clean)
    return normalized


def fix_common_ocr_artifacts(text):
    replacements = {
        r"\bTl\b": "TI",
        r"\bloT\b": "IoT",
        r"\bUl\b": "UI",
    }
    clean = text
    for pattern, replacement in replacements.items():
        clean = re.sub(pattern, replacement, clean)
    clean = re.sub(r"(?i)(nueva sintaxis)\s+Gif\b", r"\1 @if", clean)
    return clean


def looks_like_date_line(line):
    return bool(DATE_RANGE_RE.search(line))


def clean_date_line(line):
    match = DATE_RANGE_RE.search(line)
    return match.group(0).strip() if match else line.strip()


def looks_like_experience_header(line):
    clean = line.strip()
    if looks_like_date_line(clean):
        return False
    if len(clean) < 12 or len(clean) > 140:
        return False
    if clean.startswith(("+", "•", "-", "*")):
        return False
    if "|" not in clean:
        return False
    head = clean.split("|", 1)[0].strip().lower()
    return any(keyword in head for keyword in ROLE_KEYWORDS) or len(head.split()) >= 3


def parse_experience_header(line):
    parts = [part.strip(" -") for part in line.split("|") if part.strip()]
    title = parts[0] if parts else line.strip()
    company = " | ".join(parts[1:]) if len(parts) > 1 else ""
    return {
        "title": title,
        "company": company,
        "dates": "",
        "description": []
    }


def split_embedded_experience_headers(line):
    clean = line.strip()
    if not clean:
        return []

    results = []
    while True:
        match = EXPERIENCE_HEADER_SPLIT_RE.search(clean)
        if not match:
            results.append(clean.strip())
            break
        prefix = clean[:match.start()].strip()
        if prefix:
            results.append(prefix)
        clean = match.group(1).strip()
    return [item for item in results if item]


def clean_description_line(line):
    clean = PAGE_MARKER_RE.sub("", line)
    clean = re.sub(r"^\s*[\+\-•*]+\s*", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip(" \t")
    return clean


def should_append_to_previous_description(description_items, new_line):
    if not description_items:
        return False
    previous = description_items[-1].strip()
    if not previous:
        return False
    if not re.search(r"[.!?]$", previous):
        return True
    if new_line[:1].islower():
        return True
    if len(new_line.split()) <= 3:
        return True
    return False


def compact_description_items(items):
    cleaned = []
    for item in items:
        text = re.sub(r"\s+", " ", item).strip()
        if text and text not in cleaned:
            cleaned.append(text)
    return cleaned


def is_valid_experience_entry(entry):
    title = (entry.get("title") or "").strip()
    dates = (entry.get("dates") or "").strip()
    description = entry.get("description") or []
    return bool(title and (dates or description))


def extract_education_entries(sections):
    lines = normalize_section_lines(sections.get("education", []))
    entries = []
    current = None

    for line in lines:
        if current and DATE_RANGE_RE.search(line):
            current["date"] = clean_date_line(line)
            extra = DATE_RANGE_RE.sub("", line).strip(" |-")
            if extra:
                current["degree"] = " | ".join([part for part in [current["degree"], extra] if part])
            continue

        if looks_like_date_line(line):
            if not current:
                current = {"degree": "", "school": "", "date": ""}
            current["date"] = clean_date_line(line)
            continue

        if current and current.get("date"):
            entries.append(current)
            current = None

        if not current:
            current = {"degree": "", "school": "", "date": ""}

        parts = [part.strip() for part in line.split("|") if part.strip()]
        current["degree"] = parts[0] if parts else line.strip()
        current["school"] = " | ".join(parts[1:]) if len(parts) > 1 else current.get("school", "")

    if current and any(current.values()):
        entries.append(current)
    return entries


def extract_certification_entries(sections):
    raw_lines = normalize_section_lines(sections.get("certifications", []))
    lines = []
    for line in raw_lines:
        if re.search(r"\b(disponibilidad|idiomas?)\b", line, re.IGNORECASE):
            continue
        clean = re.sub(r"^\s*[\+\-•*]+\s*", "", line).strip()
        if not clean:
            continue
        if lines and (re.fullmatch(r"\d{4}\)?", clean) or clean[:1].islower()):
            lines[-1] = f"{lines[-1]} {clean}".strip()
        elif lines and re.fullmatch(r"\(?[A-Za-z]{3,9}\s+\d{4}\)?", clean):
            lines[-1] = f"{lines[-1]} {clean}".strip()
        else:
            lines.append(clean)

    entries = []
    for line in lines:
        date_match = re.search(r"\(([^()]{3,40})\)\s*$", line)
        date = date_match.group(1).strip() if date_match else ""
        base = line[:date_match.start()].strip() if date_match else line.strip()
        if " - " in base:
            name, issuer = base.split(" - ", 1)
        else:
            name, issuer = base, ""
        entry = {
            "name": name.strip(),
            "issuer": issuer.strip(),
            "date": date,
        }
        if entry["name"]:
            entries.append(entry)
    return entries


def extract_language_entries(text, sections):
    entries = []
    seen = set()
    for line in normalize_section_lines(sections.get("languages_spoken", [])):
        clean = re.sub(r"^\s*[\+\-•*]+\s*", "", line).strip()
        if not clean or re.search(r"\bdisponibilidad\b", clean, re.IGNORECASE):
            continue
        if ":" in clean:
            language, level = clean.split(":", 1)
            language = language.strip()
            level = level.strip()
            if language and normalize_text(language.lower()) not in seen:
                entries.append({"language": language, "level": level})
                seen.add(normalize_text(language.lower()))

    if entries:
        return entries

    for language in LANGUAGE_KEYWORDS:
        if re.search(rf'\b{re.escape(language)}\b', text, re.IGNORECASE):
            key = normalize_text(language.lower())
            if key in seen:
                continue
            entries.append({"language": language, "level": ""})
            seen.add(key)
    return entries


def extract_sections(lines):
    sections = {key: [] for key in SECTION_PATTERNS}
    current_section = None

    for line in lines:
        normalized_line = normalize_text(line.lower()).strip(": ")
        matched_section = None
        for section_name, patterns in SECTION_PATTERNS.items():
            if any(re.match(pattern, normalized_line) for pattern in patterns):
                matched_section = section_name
                break

        if matched_section:
            current_section = matched_section
            continue

        if current_section:
            sections[current_section].append(line)

    return {key: value for key, value in sections.items() if value}


def extract_name(lines):
    for line in lines[:8]:
        clean = line.strip()
        if '@' in clean or '/' in clean or re.search(r'\d', clean):
            continue
        if 5 < len(clean) < 50:
            return clean
    return "Candidato Extraído"


def extract_email(text):
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
    return email_match.group(0) if email_match else "No especificado"


def extract_phone(text):
    matches = re.findall(r'(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{3,4}', text)
    candidates = []
    for match in matches:
        clean = re.sub(r'\s+', ' ', match).strip(" |,.;")
        digits = re.sub(r'\D', '', clean)
        if 10 <= len(digits) <= 13:
            candidates.append(clean)
    return candidates[0] if candidates else "No especificado"


def extract_location(text):
    location = "México"
    cities = ["Veracruz", "Puebla", "Monterrey", "Guadalajara", "Queretaro", "Merida", "Cancun", "Xalapa", "Orizaba", "Boca del Rio", "CDMX", "Ciudad de Mexico"]
    for city in cities:
        if re.search(rf'\b{city}\b', text, re.IGNORECASE):
            return f"{city}, México"
    return location


def extract_title(lines, summary):
    title = "Especialista TI"
    title_keywords = [
        "ingeniero", "developer", "desarrollador", "programador", "analista",
        "consultor", "administrator", "soporte", "systems", "devops",
        "backend", "frontend", "full stack", "cloud", "security", "network"
    ]

    for line in lines[:8]:
        lowered = line.lower()
        if any(keyword in lowered for keyword in title_keywords):
            clean = line.strip()
            if len(clean) <= 80:
                return clean
            short = clean.split(" con perfil ", 1)[0].strip()
            if len(short) >= 10:
                return short

    if summary:
        lowered_summary = summary.lower()
        if "ingeniero en sistemas computacionales" in lowered_summary:
            if "full stack" in lowered_summary:
                return "Ingeniero en Sistemas Computacionales / Full Stack Developer"
            return "Ingeniero en Sistemas Computacionales"
        for sentence in re.split(r'[.!?]\s+', summary):
            lowered = sentence.lower()
            if any(keyword in lowered for keyword in title_keywords):
                clean = sentence.strip()
                if len(clean) <= 80:
                    return clean
                short = clean.split(" con perfil ", 1)[0].strip()
                if len(short) >= 10:
                    return short[:80]

    return title


def extract_link(text, link_type):
    if link_type == "linkedin":
        match = re.search(r'linkedin\.com/in/[\w\.-]+', text, re.IGNORECASE)
        return match.group(0) if match else ""
    if link_type == "github":
        match = re.search(r'github\.com/[\w\.-]+', text, re.IGNORECASE)
        return match.group(0) if match else ""
    return ""


def extract_summary(lines, sections):
    if sections.get("summary"):
        return finalize_summary(" ".join(sections["summary"]))

    candidate_lines = []
    for line in lines[1:10]:
        lower = line.lower()
        if '@' in line or re.search(r'linkedin|github|www\.|http', lower):
            continue
        if any(keyword in lower for keyword in ROLE_KEYWORDS) or len(line.split()) >= 6:
            candidate_lines.append(line)
        if len(candidate_lines) >= 2:
            break
    return finalize_summary(" ".join(candidate_lines))


def finalize_summary(text, max_chars=650, max_sentences=3):
    clean = re.sub(r"\s+", " ", str(text or "")).strip()
    if not clean:
        return ""

    sentences = re.split(r'(?<=[.!?])\s+', clean)
    selected = []
    total = 0
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        projected = total + len(sentence) + (1 if selected else 0)
        if projected > max_chars and selected:
            break
        selected.append(sentence)
        total = projected
        if len(selected) >= max_sentences:
            break

    result = " ".join(selected).strip() or clean[:max_chars].strip()
    if result and result[-1] not in ".!?":
        result = re.sub(r"\s+[^\s]+$", "", result).strip()
        if result and result[-1] not in ".!?":
            result = result.rstrip(",;:-") + "."
    return result[:max_chars]


def extract_experience_years(text):
    matches = re.findall(r'(\d{1,2})\+?\s*(?:anos|año|años|years?)\s+(?:de\s+)?experiencia', normalize_text(text.lower()))
    years = [int(value) for value in matches if 0 < int(value) <= 50]
    return max(years) if years else 0


def extract_certifications(sections):
    entries = extract_certification_entries(sections)
    values = []
    for entry in entries:
        parts = [entry.get("name", "").strip()]
        if entry.get("issuer"):
            parts.append(entry["issuer"].strip())
        if entry.get("date"):
            parts[-1] = f"{parts[-1]} ({entry['date'].strip()})" if len(parts) > 1 else f"{parts[-1]} ({entry['date'].strip()})"
        label = " - ".join([part for part in parts[:2] if part]).strip()
        if not label and entry.get("date"):
            label = entry["date"].strip()
        if label and label not in values:
            values.append(label)
    return values


def extract_education(sections):
    entries = extract_education_entries(sections)
    values = []
    for entry in entries:
        parts = [entry.get("degree", "").strip()]
        if entry.get("school"):
            parts.append(entry["school"].strip())
        label = " | ".join([part for part in parts if part]).strip()
        if entry.get("date"):
            label = f"{label} ({entry['date'].strip()})" if label else entry["date"].strip()
        if label and label not in values:
            values.append(label)
    return values


def extract_languages(text, sections):
    entries = extract_language_entries(text, sections)
    if entries:
        return [entry["language"] for entry in entries if entry.get("language")]

    results = []
    corpus = " ".join(sections.get("languages_spoken", [])) + "\n" + text
    for language in LANGUAGE_KEYWORDS:
        if re.search(rf'\b{re.escape(language)}\b', corpus, re.IGNORECASE) and language not in results:
            results.append(language)
    return results


def extract_preferred_roles(lines, title, summary=""):
    roles = []
    role_sources = [title] + lines[:12]
    for line in role_sources:
        lowered = line.lower()
        if any(keyword in lowered for keyword in ROLE_KEYWORDS):
            clean = re.sub(r'\s+', ' ', line).strip()
            if not clean or len(clean) > 70:
                continue
            if re.search(r"[.,;:]", clean):
                continue
            if clean not in roles:
                roles.append(clean)
        if len(roles) >= 4:
            break

    summary_lower = normalize_text((summary or "").lower())
    derived_roles = []
    if "full stack" in summary_lower:
        derived_roles.append("Full Stack Developer")
    if "infraestructura ti" in summary_lower or "infraestructura" in summary_lower:
        derived_roles.append("Especialista en Infraestructura TI")
    if "ciberseguridad" in summary_lower or "cybersecurity" in summary_lower:
        derived_roles.append("Especialista en Ciberseguridad")
    if "gestion de proyectos" in summary_lower or "project management" in summary_lower:
        derived_roles.append("Project Manager TI")

    for role in derived_roles:
        if role not in roles:
            roles.append(role)
        if len(roles) >= 4:
            break
    return roles


def estimate_experience_years(experience):
    date_ranges = [parse_date_range(entry.get("dates", "")) for entry in (experience or [])]
    valid_ranges = [(start, end) for start, end in date_ranges if start and end and end >= start]
    if not valid_ranges:
        return 0

    earliest = min(start for start, _ in valid_ranges)
    latest = max(end for _, end in valid_ranges)
    total_months = (latest.year - earliest.year) * 12 + (latest.month - earliest.month) + 1
    years = total_months // 12
    if total_months % 12 >= 6:
        years += 1
    return max(years, 1)


def parse_date_range(date_text):
    clean = normalize_text(str(date_text or "").lower())
    match = re.search(
        rf"({MONTH_PATTERN})\s+(\d{{4}})\s*[—–-]\s*(({MONTH_PATTERN})\s+(\d{{4}})|actual(?:idad)?|presente|current)",
        clean,
        re.IGNORECASE,
    )
    if not match:
        return None, None

    start_month = month_to_number(match.group(1))
    start_year = int(match.group(2))
    end_text = match.group(3)

    if re.match(r"actual(?:idad)?|presente|current", end_text, re.IGNORECASE):
        now = datetime.now()
        return datetime(start_year, start_month, 1), datetime(now.year, now.month, 1)

    end_month = month_to_number(match.group(4))
    end_year = int(match.group(5))
    return datetime(start_year, start_month, 1), datetime(end_year, end_month, 1)


def month_to_number(month_text):
    normalized = normalize_text(str(month_text or "").lower())
    month_map = {
        "ene": 1, "enero": 1, "jan": 1, "january": 1,
        "feb": 2, "febrero": 2, "february": 2,
        "mar": 3, "marzo": 3, "march": 3,
        "abr": 4, "abril": 4, "apr": 4, "april": 4,
        "may": 5, "mayo": 5,
        "jun": 6, "junio": 6, "june": 6,
        "jul": 7, "julio": 7, "july": 7,
        "ago": 8, "agosto": 8, "aug": 8, "august": 8,
        "sep": 9, "sept": 9, "septiembre": 9, "september": 9,
        "oct": 10, "octubre": 10, "october": 10,
        "nov": 11, "noviembre": 11, "november": 11,
        "dic": 12, "diciembre": 12, "dec": 12, "december": 12,
    }
    return month_map.get(normalized, 1)


def build_profile_keywords(profile):
    title = [profile.get("title", "").strip()] if profile.get("title") else []
    experience_titles = [exp.get("title", "").strip() for exp in profile.get("experience", []) if exp.get("title")]
    combined = (
        profile.get("preferred_roles", [])
        + profile.get("all_skills_flat", [])
        + experience_titles
        + title
    )

    keywords = []
    seen = set()
    for item in combined:
        for clean in to_search_keyword_candidates(item):
            lowered = normalize_text(clean.lower())
            if lowered in seen:
                continue
            seen.add(lowered)
            keywords.append(clean)
    return keywords


def to_search_keyword_candidates(item):
    raw = re.sub(r"\s+", " ", str(item or "")).strip(" \t,.;")
    if not raw:
        return []
    if "|" in raw:
        return []
    if raw.count("(") != raw.count(")"):
        return []
    if re.search(r"\b(?:19|20)\d{2}\b", raw):
        return []
    if re.search(DATE_RANGE_RE, raw):
        return []

    candidates = [raw]
    if " - " in raw:
        candidates.extend(part.strip() for part in raw.split(" - ") if part.strip())

    if raw.count("(") == raw.count(")") and "(" in raw:
        match = re.match(r"^(.*?)\s*\((.*?)\)\s*$", raw)
        if match:
            base = match.group(1).strip()
            inner = match.group(2).strip()
            if base:
                candidates.append(base)
            if inner and len(inner) <= 24 and not re.search(r"\b(?:19|20)\d{2}\b", inner):
                candidates.extend(part.strip() for part in re.split(r",\s*|/\s*", inner) if part.strip())

    if "/" in raw and "(" not in raw and normalize_text(raw.lower()) not in {"lan/wan", "cpanel/whm", "flutter/dart"}:
        candidates.extend(part.strip() for part in raw.split("/") if part.strip())

    output = []
    seen = set()
    for candidate in candidates:
        for numeric_clean in numeric_free_keyword_variants(candidate):
            for clean in semantic_keyword_variants(numeric_clean):
                if "|" in clean or "," in clean or ":" in clean:
                    continue
                if clean.count("(") != clean.count(")"):
                    continue
                if re.search(r"\b(?:19|20)\d{2}\b", clean):
                    continue
                if re.search(r"\d", clean):
                    continue
                if re.fullmatch(r"[\d\s.%+-]+", clean):
                    continue
                if normalize_text(clean.lower()).startswith("hasta "):
                    continue
                if len(clean) < 2 or len(clean) > 40:
                    continue
                if len(clean.split()) > 4:
                    continue
                lowered = normalize_text(clean.lower())
                if lowered in seen:
                    continue
                seen.add(lowered)
                output.append(clean)
    return output


def numeric_free_keyword_variants(candidate):
    clean = re.sub(r"\s+", " ", str(candidate or "")).strip(" \t,.;:-")
    if not clean:
        return []

    variants = [clean]
    if re.search(r"\d", clean):
        no_numeric_paren = re.sub(r"\((?=[^)]*\d)[^)]*\)", "", clean)
        no_digits = re.sub(r"\d+(?:[.,]\d+)*%?", "", no_numeric_paren)
        no_digits = re.sub(r"\s+", " ", no_digits)
        no_digits = re.sub(r"\s*([()/\-])\s*$", "", no_digits)
        no_digits = no_digits.strip(" \t,.;:-")
        if no_digits:
            variants.append(no_digits)

    output = []
    seen = set()
    for value in variants:
        normalized = normalize_text(value.lower())
        if normalized in seen:
            continue
        seen.add(normalized)
        output.append(value)
    return output


def semantic_keyword_variants(candidate):
    clean = re.sub(r"\s+", " ", str(candidate or "")).strip(" \t,.;:-")
    if not clean:
        return []

    lowered = normalize_text(clean.lower())
    if lowered in {"freelance", "autonomo", "autónomo", "lider de proyecto", "project lead"}:
        return []

    variants = []
    keep_original = True

    wrapper_patterns = [
        r"^especialista en (.+)$",
        r"^ingeniero en (.+)$",
        r"^desarrollador(?:a)? (.+)$",
        r"^developer (.+)$",
        r"^becario de (.+)$",
        r"^lider de proyecto\s*[-:]\s*(.+)$",
        r"^(.+?)\s+developer$",
    ]
    for pattern in wrapper_patterns:
        match = re.match(pattern, clean, re.IGNORECASE)
        if match:
            keep_original = False
            inner = match.group(1).strip(" \t,.;:-")
            if inner:
                variants.append(inner)
            break

    combo_match = re.match(r"^(frontend|backend)\s+(.+)$", clean, re.IGNORECASE)
    if combo_match:
        keep_original = False
        variants.append(combo_match.group(1).title())
        second = combo_match.group(2).strip(" \t,.;:-")
        if second:
            variants.append(second)

    if keep_original:
        variants.append(clean)

    feature_map = [
        (r"\bfull stack\b", "Full Stack"),
        (r"\bfrontend\b", "Frontend"),
        (r"\bbackend\b", "Backend"),
        (r"\bjava\b", "Java"),
        (r"\bangular\b", "Angular"),
        (r"\bflutter\b", "Flutter"),
        (r"\bciberseguridad\b", "Ciberseguridad"),
        (r"\binfraestructura ti\b", "Infraestructura TI"),
    ]
    for pattern, label in feature_map:
        if re.search(pattern, lowered, re.IGNORECASE):
            variants.append(label)

    output = []
    seen = set()
    normalized_variants = []
    for value in variants:
        combo_match = re.match(r"^(frontend|backend)\s+(.+)$", value, re.IGNORECASE)
        if combo_match:
            normalized_variants.append(combo_match.group(1).title())
            second = combo_match.group(2).strip(" \t,.;:-")
            if second:
                normalized_variants.append(second)
            continue
        normalized_variants.append(value)

    for value in normalized_variants:
        normalized = normalize_text(value.lower())
        if normalized in seen:
            continue
        seen.add(normalized)
        output.append(value)
    return output

def parse_cv(pdf_path):
    if not os.path.exists(pdf_path):
        return FALLBACK_PROFILE
        
    try:
        reader = pypdf.PdfReader(pdf_path)
        native_text = ""
        for page in reader.pages:
            native_text += page.extract_text() or ""

        native_text = native_text.strip()
        ocr_text = ""
        used_ocr = False
        try:
            ocr_text = extract_pdf_text_with_ocr(pdf_path, max_pages=None)
            used_ocr = bool(ocr_text.strip())
        except Exception as ocr_error:
            print(f"Error in PDF OCR fallback: {ocr_error}")

        if not native_text and not ocr_text:
            return FALLBACK_PROFILE

        combined_text = native_text
        if used_ocr and ocr_text:
            if not native_text or looks_like_low_quality_text(native_text):
                combined_text = ocr_text
            else:
                combined_text = f"{native_text}\n\n{ocr_text}".strip()

        if not combined_text.strip():
            fallback = dict(FALLBACK_PROFILE)
            fallback["analysis_meta"] = {
                "source": "fallback",
                "native_chars": 0,
                "ocr_chars": 0,
                "used_ocr": False,
                "section_count": 0,
                "keyword_count": len(fallback.get("search_keywords", [])),
            }
            return fallback

        profile = parse_cv_text(combined_text)
        profile["analysis_meta"] = {
            "source": "pdf",
            "native_chars": len(native_text),
            "ocr_chars": len(ocr_text),
            "used_ocr": used_ocr,
            "section_count": len(profile.get("sections", {})),
            "keyword_count": len(profile.get("search_keywords", [])),
        }
        return profile
    except Exception as e:
        print(f"Error in dynamic parsing: {e}")
        return FALLBACK_PROFILE

# Fallback definition for backwards compatibility
FALLBACK_PROFILE = {
    "name": "Erwin Brow Martínez Herrera",
    "title": "Ingeniero en Sistemas Computacionales / Full Stack Developer",
    "email": "erwinbrowmh@gmail.com",
    "phone": "229-232-4707",
    "location": "Veracruz, México",
    "linkedin": "linkedin.com/in/erwin-brow-martinez-herrera",
    "github": "github.com/erwinbrowmh",
    "summary": "Ingeniero en sistemas con experiencia en desarrollo full stack, infraestructura y ciberseguridad.",
    "experience_years": 5,
    "education": ["Ingeniería en Sistemas Computacionales"],
    "certifications": [],
    "languages_spoken": ["Español", "English"],
    "preferred_roles": ["Full Stack Developer", "Ingeniero en Sistemas", "Especialista TI"],
    "experience": [],
    "sections": {},
    "search_keywords": [
        "Full Stack Developer", "Ingeniero en Sistemas", "PHP", "Java", "JavaScript",
        "Flutter", "SQL", "REST APIs", "MySQL", "Git", "Linux Servers", "Ciberseguridad"
    ],
    "analysis_meta": {
        "source": "fallback",
        "native_chars": 0,
        "ocr_chars": 0,
        "used_ocr": False,
        "section_count": 0,
        "keyword_count": 12,
    },
    "skills": {
        "languages": ["PHP", "Java", "JavaScript", "Flutter", "SQL", "HTML/CSS", "HTML", "CSS"],
        "backend": ["REST APIs", "Stripe API", "Clip Integration", "MySQL", "Git", "APIs"],
        "infrastructure": ["Linux Servers", "cPanel", "IP/LAN Networks", "Wi-Fi 6", "Structured Cabling"],
        "security": ["Perimeter Security", "Hardening", "Risk Management", "Data Privacy", "Cybersecurity", "Ciberseguridad"],
        "iot": ["NFC", "Smart cards", "Access Control Systems", "IoT"],
        "management": ["Scrum", "Kanban", "SLA Management", "Stakeholder Management", "Project Management"]
    },
    "all_skills_flat": [
        "PHP", "Java", "JavaScript", "Flutter", "SQL", "HTML", "CSS", "HTML/CSS",
        "REST APIs", "Stripe API", "Clip Integration", "MySQL", "Git", "APIs",
        "Linux Servers", "cPanel", "IP/LAN Networks", "Wi-Fi 6", "Structured Cabling",
        "Perimeter Security", "Hardening", "Risk Management", "Data Privacy", "Cybersecurity", "Ciberseguridad",
        "NFC", "Smart cards", "Access Control Systems", "IoT",
        "Scrum", "Kanban", "SLA Management", "Stakeholder Management", "Project Management"
    ]
}

if __name__ == "__main__":
    import json
    path = r"c:\Users\siste\OneDrive\Documentos\PostulacionAuto\cv\CV_Erwin_Brow.pdf"
    res = parse_cv(path)
    print(json.dumps(res, indent=2))
