import re
import time
from typing import Any
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


_DETAIL_CACHE: dict[str, dict[str, Any]] = {}
_DETAIL_TTL = 1800

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

GENERIC_SKILLS = [
    "php", "laravel", "symfony", "python", "django", "flask", "fastapi", "java", "spring",
    "javascript", "typescript", "node", "node.js", "react", "vue", "angular", "flutter",
    "dart", "mysql", "postgresql", "sql", "mongodb", "redis", "docker", "kubernetes",
    "aws", "azure", "gcp", "linux", "git", "rest", "api", "graphql", "html", "css",
    "sass", "tailwind", "bootstrap", "c#", ".net", "ci/cd", "jenkins", "terraform",
    "ansible", "firebase", "supabase", "microservices", "scrum", "agile", "qa", "testing",
    "selenium", "cypress", "jira", "figma", "seo", "wordpress", "woocommerce", "oracle"
]

REMOTE_PATTERN = re.compile(r"\b(remoto|remote|home office|teletrabajo|work from home|100% remoto)\b", re.IGNORECASE)
HYBRID_PATTERN = re.compile(r"\b(hibrido|híbrido|hybrid|esquema mixto)\b", re.IGNORECASE)
ONSITE_PATTERN = re.compile(r"\b(presencial|onsite|on-site|en oficina|office-based)\b", re.IGNORECASE)
FULLTIME_PATTERN = re.compile(r"\b(tiempo completo|full time|full-time)\b", re.IGNORECASE)
PARTTIME_PATTERN = re.compile(r"\b(medio tiempo|part time|part-time)\b", re.IGNORECASE)
CONTRACT_PATTERN = re.compile(r"\b(contrato|contractor|freelance|por proyecto|outsourcing)\b", re.IGNORECASE)


def analyze_job_detail(job: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    link = (job.get("link") or "").strip()
    cache_key = link or job.get("id") or f"{job.get('source','job')}::{job.get('title','')}"
    cached = _get_cached(cache_key)
    if cached:
        return cached

    page_text = ""
    fetch_status = "fallback"
    fetch_error = ""
    if link:
        try:
            html = _fetch_url(link)
            page_text = _extract_relevant_text(html)
            if page_text:
                fetch_status = "fetched"
        except Exception as exc:
            fetch_error = str(exc)

    base_text = "\n".join(
        [
            job.get("title", ""),
            job.get("company", ""),
            job.get("location", ""),
            job.get("salary", ""),
            job.get("description", ""),
            page_text,
        ]
    ).strip()

    requirements = _extract_section_lines(base_text, "requisitos")
    benefits = _extract_section_lines(base_text, "beneficios")
    responsibilities = _extract_section_lines(base_text, "responsabilidades")
    detected_skills = _detect_skills(base_text, profile)

    profile_skills = [str(s).strip() for s in profile.get("all_skills_flat", []) if str(s).strip()]
    matched_skills = _merge_unique(job.get("matched_skills", []), [s for s in detected_skills if _contains_ignore_case(profile_skills, s)])
    missing_skills = [s for s in detected_skills if not _contains_ignore_case(profile_skills, s)]

    modality = _detect_modality(base_text, job.get("work_modality"))
    employment_type = _detect_employment_type(base_text)
    salary_hint = _extract_salary(base_text) or job.get("salary") or "No especificado"
    seniority = _detect_seniority(base_text)
    location_hint = _extract_location_hint(base_text) or job.get("location") or "No especificada"
    domain = _extract_domain(link)
    confidence = _estimate_confidence(fetch_status, page_text, requirements, detected_skills)

    summary = _build_summary(job, modality, seniority, matched_skills, missing_skills, requirements, benefits, fetch_status)
    recommendation = _build_recommendation(job, matched_skills, missing_skills, modality, seniority, profile)
    risk_flags = _build_risk_flags(fetch_status, fetch_error, missing_skills, benefits, salary_hint)

    result = {
        "fetch_status": fetch_status,
        "fetch_error": fetch_error,
        "detail_source": domain,
        "deep_description": _truncate_text(page_text or job.get("description", ""), 2600),
        "requirements": requirements[:12],
        "benefits": benefits[:10],
        "responsibilities": responsibilities[:10],
        "detected_skills": detected_skills[:20],
        "matched_skills_deep": matched_skills[:20],
        "missing_skills_deep": missing_skills[:20],
        "work_modality_deep": modality,
        "employment_type": employment_type,
        "seniority_deep": seniority,
        "salary_deep": salary_hint,
        "location_deep": location_hint,
        "confidence": confidence,
        "summary": summary,
        "recommendation": recommendation,
        "risk_flags": risk_flags,
        "signals": {
            "requirements_count": len(requirements),
            "benefits_count": len(benefits),
            "matched_count": len(matched_skills),
            "missing_count": len(missing_skills),
            "description_chars": len(page_text or ""),
        },
        "fetched_at": int(time.time()),
    }
    _set_cached(cache_key, result)
    return result


def _fetch_url(url: str) -> str:
    response = requests.get(
        url,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "es-MX,es;q=0.9,en;q=0.8"},
        timeout=15,
        allow_redirects=True,
    )
    response.raise_for_status()
    return response.text


def _extract_relevant_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "footer", "header", "nav", "form"]):
        tag.decompose()

    candidates = []
    selectors = [
        "[class*='description']",
        "[class*='job-description']",
        "[class*='jobDescription']",
        "[class*='details']",
        "[class*='content']",
        "article",
        "main",
    ]
    for selector in selectors:
        for node in soup.select(selector):
            text = _normalize_text(node.get_text("\n", strip=True))
            if len(text) >= 250:
                candidates.append(text)
    if candidates:
        candidates.sort(key=len, reverse=True)
        return candidates[0]
    return _normalize_text(soup.get_text("\n", strip=True))


def _extract_section_lines(text: str, section_name: str) -> list[str]:
    normalized_text = _normalize_text(text)
    lines = [line.strip(" -•\t") for line in normalized_text.split("\n") if line.strip()]
    collected: list[str] = []
    active = False
    headings = {
        "requisitos": ("requisitos", "requirements", "perfil", "what you need", "skills"),
        "beneficios": ("beneficios", "ofrecemos", "benefits", "perks", "prestaciones"),
        "responsabilidades": ("responsabilidades", "responsibilities", "actividades", "funciones", "what you will do"),
    }
    stop_words = ("beneficios", "responsabilidades", "requisitos", "about us", "nosotros", "empresa", "salario")

    for line in lines:
        lower = line.lower()
        if any(word in lower for word in headings.get(section_name, ())):
            active = True
            continue
        if active and any(word in lower for word in stop_words if word not in headings.get(section_name, ())):
            if len(collected) >= 2:
                break
        if active and 4 <= len(line) <= 180:
            collected.append(line)
            if len(collected) >= 12:
                break

    if collected:
        return _dedupe_preserve(collected)

    inline = _extract_inline_section(normalized_text, section_name)
    if inline:
        return inline

    fallback = []
    for line in lines:
        if len(line) < 5 or len(line) > 160:
            continue
        if section_name == "requisitos" and re.search(r"\b(experiencia|conocimiento|manejo|dominio|skill|requisito|plus|deseable)\b", line, re.IGNORECASE):
            fallback.append(line)
        elif section_name == "beneficios" and re.search(r"\b(prestaciones|beneficio|seguro|vales|bono|vacaciones|sueldo|horario|home office)\b", line, re.IGNORECASE):
            fallback.append(line)
        elif section_name == "responsabilidades" and re.search(r"\b(desarrollar|implementar|colaborar|mantener|diseñar|coordinar|gestionar)\b", line, re.IGNORECASE):
            fallback.append(line)
        if len(fallback) >= 10:
            break
    return _dedupe_preserve(fallback)


def _extract_inline_section(text: str, section_name: str) -> list[str]:
    section_markers = {
        "requisitos": ("requisitos", "requirements", "perfil", "skills"),
        "beneficios": ("beneficios", "ofrecemos", "benefits", "prestaciones"),
        "responsabilidades": ("responsabilidades", "responsibilities", "actividades", "funciones"),
    }
    stop_markers = {
        "requisitos": ("beneficios", "ofrecemos", "prestaciones", "responsabilidades"),
        "beneficios": ("requisitos", "responsabilidades", "perfil"),
        "responsabilidades": ("requisitos", "beneficios", "ofrecemos"),
    }
    lowered = text.lower()
    start_index = -1
    marker_used = ""
    for marker in section_markers.get(section_name, ()):
        idx = lowered.find(marker)
        if idx != -1 and (start_index == -1 or idx < start_index):
            start_index = idx
            marker_used = marker
    if start_index == -1:
        return []

    chunk = text[start_index + len(marker_used):]
    end_index = len(chunk)
    chunk_lower = chunk.lower()
    for stop in stop_markers.get(section_name, ()):
        idx = chunk_lower.find(stop)
        if idx != -1:
            end_index = min(end_index, idx)
    chunk = chunk[:end_index]
    chunk = chunk.lstrip(":.- ")
    parts = [part.strip(" -•\t") for part in re.split(r"[.;•\n]+", chunk) if part.strip()]
    return _dedupe_preserve([part for part in parts if 4 <= len(part) <= 180][:10])


def _detect_skills(text: str, profile: dict[str, Any]) -> list[str]:
    haystack = f" {_normalize_text(text).lower()} "
    universe = _merge_unique(profile.get("search_keywords", []), GENERIC_SKILLS)
    detected = []
    for skill in universe:
        skill_str = str(skill).strip()
        if len(skill_str) < 2:
            continue
        pattern = _build_skill_pattern(skill_str)
        if pattern.search(haystack):
            detected.append(skill_str)
    return detected


def _build_skill_pattern(skill: str) -> re.Pattern[str]:
    escaped = re.escape(skill.lower())
    if any(ch in skill for ch in "#+./"):
        return re.compile(escaped, re.IGNORECASE)
    return re.compile(r"\b" + escaped + r"\b", re.IGNORECASE)


def _detect_modality(text: str, fallback: str | None = None) -> str:
    if HYBRID_PATTERN.search(text):
        return "hibrido"
    if REMOTE_PATTERN.search(text):
        return "remoto"
    if ONSITE_PATTERN.search(text):
        return "presencial"
    return (fallback or "presencial").lower()


def _detect_employment_type(text: str) -> str:
    if FULLTIME_PATTERN.search(text):
        return "Tiempo completo"
    if PARTTIME_PATTERN.search(text):
        return "Medio tiempo"
    if CONTRACT_PATTERN.search(text):
        return "Contrato / Proyecto"
    return "No especificado"


def _detect_seniority(text: str) -> str:
    if re.search(r"\b(senior|sr\.?|lead|líder|principal|architect)\b", text, re.IGNORECASE):
        return "senior"
    if re.search(r"\b(junior|jr\.?|trainee|practicante|entry)\b", text, re.IGNORECASE):
        return "junior"
    if re.search(r"\b(semi|ssr|mid|pleno)\b", text, re.IGNORECASE):
        return "semi"
    return "general"


def _extract_salary(text: str) -> str:
    matches = re.findall(r"(\$[\d,]+(?:\.\d+)?(?:\s*(?:mxn|usd|mensuales|al mes|mensual|por mes))?)", text, re.IGNORECASE)
    if matches:
        return matches[0]
    return ""


def _extract_location_hint(text: str) -> str:
    lines = [line.strip() for line in _normalize_text(text).split("\n") if line.strip()]
    for line in lines[:35]:
        if re.search(r"\b(mexico|méxico|veracruz|cdmx|guadalajara|monterrey|puebla|querétaro|remoto|híbrido|hibrido)\b", line, re.IGNORECASE):
            return line[:120]
    return ""


def _estimate_confidence(fetch_status: str, page_text: str, requirements: list[str], detected_skills: list[str]) -> int:
    score = 35
    if fetch_status == "fetched":
        score += 25
    if len(page_text) >= 800:
        score += 15
    if len(requirements) >= 4:
        score += 15
    if len(detected_skills) >= 4:
        score += 10
    return min(score, 100)


def _build_summary(
    job: dict[str, Any],
    modality: str,
    seniority: str,
    matched_skills: list[str],
    missing_skills: list[str],
    requirements: list[str],
    benefits: list[str],
    fetch_status: str,
) -> str:
    parts = [
        f"La vacante de {job.get('company', 'la empresa')} se perfila como {modality}",
        f"con nivel {seniority}" if seniority != "general" else "sin seniority claro",
        f"y {len(requirements)} requisitos detectados.",
    ]
    if matched_skills:
        parts.append(f"Tus coincidencias más claras son: {', '.join(matched_skills[:4])}.")
    if missing_skills:
        parts.append(f"Las principales brechas son: {', '.join(missing_skills[:4])}.")
    if benefits:
        parts.append(f"También se identificaron {len(benefits)} beneficios o condiciones relevantes.")
    if fetch_status != "fetched":
        parts.append("El análisis usa texto parcial del portal, por lo que conviene revisar la vacante original.")
    return " ".join(parts)


def _build_recommendation(
    job: dict[str, Any],
    matched_skills: list[str],
    missing_skills: list[str],
    modality: str,
    seniority: str,
    profile: dict[str, Any],
) -> str:
    profile_years = int(profile.get("experience_years", 0) or 0)
    score = int(job.get("match_score", 0) or 0)
    if score >= 78 and len(missing_skills) <= 3:
        return f"Alta prioridad. Postúlate resaltando {', '.join(matched_skills[:3]) or 'tu stack principal'} y confirma la modalidad {modality}."
    if score >= 55:
        gap_text = ", ".join(missing_skills[:3]) or "algunos requisitos específicos"
        return f"Buena opción si ajustas tu CV y carta hacia {', '.join(matched_skills[:3]) or 'tu experiencia relevante'}. Antes de aplicar, prepara respuesta para {gap_text}."
    if seniority == "senior" and profile_years < 4:
        return "Compatibilidad limitada por seniority. Úsala como referencia para mejorar tu perfil o aplica solo si la descripción admite flexibilidad."
    return "Prioridad baja. Revisa la vacante, pero conviene enfocarte primero en puestos con mejor coincidencia técnica y menor brecha."


def _build_risk_flags(fetch_status: str, fetch_error: str, missing_skills: list[str], benefits: list[str], salary_hint: str) -> list[str]:
    flags = []
    if fetch_status != "fetched":
        flags.append("No se pudo leer todo el detalle del portal; el análisis usa texto parcial.")
    if fetch_error:
        flags.append(f"Error de lectura del portal: {fetch_error[:140]}")
    if len(missing_skills) >= 6:
        flags.append("La vacante menciona varias habilidades que hoy no están fuertes en tu perfil.")
    if not benefits:
        flags.append("No se detectaron beneficios claros en la oferta.")
    if not salary_hint or "no especificado" in salary_hint.lower():
        flags.append("No se detectó salario claro.")
    return flags[:5]


def _extract_domain(url: str) -> str:
    try:
        return urlparse(url).netloc or "portal"
    except Exception:
        return "portal"


def _normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _truncate_text(text: str, limit: int) -> str:
    text = _normalize_text(text)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def _contains_ignore_case(values: list[str], needle: str) -> bool:
    needle_lower = needle.lower()
    return any(str(value).lower() == needle_lower for value in values)


def _merge_unique(*lists: list[Any]) -> list[Any]:
    output = []
    seen = set()
    for values in lists:
        for value in values or []:
            key = str(value).strip().lower()
            if not key or key in seen:
                continue
            seen.add(key)
            output.append(value)
    return output


def _dedupe_preserve(values: list[str]) -> list[str]:
    return _merge_unique(values)


def _get_cached(key: str) -> dict[str, Any] | None:
    entry = _DETAIL_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > _DETAIL_TTL:
        _DETAIL_CACHE.pop(key, None)
        return None
    return entry["data"]


def _set_cached(key: str, data: dict[str, Any]) -> None:
    _DETAIL_CACHE[key] = {"ts": time.time(), "data": data}
