import os
import sys
import concurrent.futures
import re
import time
import hashlib
import json
from backend.parser import parse_cv, FALLBACK_PROFILE
from backend.scrapers.computrabajo import scrape_computrabajo
from backend.scrapers.occ import scrape_occ
from backend.scrapers.getonbrd import scrape_getonbrd
from backend.scrapers.linkedin import scrape_linkedin
from backend.scrapers.google_jobs import scrape_google_jobs

try:
    from backend.scrapers.infojobs import scrape_infojobs
    HAS_INFOJOBS = True
except ImportError:
    HAS_INFOJOBS = False

try:
    from backend.scrapers.talentcom import scrape_talentcom
    HAS_TALENTCOM = True
except ImportError:
    HAS_TALENTCOM = False

# ─────────────────────────────────────────────────────────────
# In-memory search cache with 30-minute TTL
# ─────────────────────────────────────────────────────────────
_SEARCH_CACHE = {}
_CACHE_TTL = 1800  # 30 minutes

def _cache_key(keywords, location, max_results):
    raw = f"{sorted(keywords)}|{location}|{max_results}"
    return hashlib.md5(raw.encode()).hexdigest()

def _get_cached(key):
    if key in _SEARCH_CACHE:
        entry = _SEARCH_CACHE[key]
        if time.time() - entry["ts"] < _CACHE_TTL:
            print(f"[CACHE HIT] Returning cached results for key {key[:8]}...")
            return entry["data"]
        else:
            del _SEARCH_CACHE[key]
    return None

def _set_cache(key, data):
    _SEARCH_CACHE[key] = {"ts": time.time(), "data": data}


# ─────────────────────────────────────────────────────────────
# ATS Match Score v2 — Weighted Scoring Engine
# ─────────────────────────────────────────────────────────────
def calculate_match_score(job, profile):
    title = (job.get("title") or "").lower()
    description = (job.get("description") or "").lower()
    location_field = (job.get("location") or "").lower()
    
    matched_skills = set()
    score = 5  # Base score

    all_skills = profile.get("all_skills_flat", [])
    
    # Primary skills are the first 6 in the flat list
    primary_skills = [s.lower() for s in all_skills[:6]]
    secondary_skills = [s.lower() for s in all_skills[6:]]

    def build_pattern(skill_lower):
        escaped = re.escape(skill_lower)
        if any(c in skill_lower for c in ['#', '+', '.', '/', '@']):
            return re.compile(escaped, re.IGNORECASE)
        return re.compile(r'\b' + escaped + r'\b', re.IGNORECASE)

    # ── Skill matching with weighted points ──────────────────
    for skill in all_skills:
        skill_lower = skill.lower()
        pattern = build_pattern(skill_lower)
        is_primary = skill_lower in primary_skills
        
        in_title = bool(pattern.search(title))
        in_desc = bool(pattern.search(description))
        
        if in_title:
            score += 30 if is_primary else 20
            matched_skills.add(skill)
        elif in_desc:
            score += 10 if is_primary else 6
            matched_skills.add(skill)

    # ── Modality bonus ───────────────────────────────────────
    job_source = (job.get("source") or "").lower()
    if "remoto" in location_field or "remote" in location_field or "home office" in location_field:
        score += 8

    # ── Seniority / Level detection bonus ───────────────────
    profile_title = (profile.get("title") or "").lower()
    senior_words = ["senior", "sr.", "lead", "líder", "principal", "architect"]
    junior_words = ["junior", "jr.", "trainee", "practicante", "entry"]
    
    job_is_senior = any(w in title for w in senior_words)
    job_is_junior = any(w in title for w in junior_words)
    profile_is_senior = any(w in profile_title for w in senior_words)
    profile_is_junior = any(w in profile_title for w in junior_words)

    if job_is_senior and profile_is_senior:
        score += 12
    elif job_is_junior and profile_is_junior:
        score += 8
    elif job_is_senior and profile_is_junior:
        score -= 8  # Penalize over-qualified mismatch

    # ── Skill density bonus (more total matches = richer match) ──
    match_count = len(matched_skills)
    if match_count >= 5:
        score += 10
    elif match_count >= 3:
        score += 5

    # ── Category coverage bonus ──────────────────────────────
    skill_cats = profile.get("skills", {})
    cats_hit = 0
    for cat_skills in skill_cats.values():
        cat_lower = [s.lower() for s in cat_skills]
        if any(ms.lower() in cat_lower for ms in matched_skills):
            cats_hit += 1
    if cats_hit >= 3:
        score += 8
    elif cats_hit >= 2:
        score += 4

    score = min(score, 100)
    return score, list(matched_skills)


# ─────────────────────────────────────────────────────────────
# Multi-dimensional keyword expansion
# ─────────────────────────────────────────────────────────────
def _expand_keywords(keywords, profile):
    """
    Generate multi-dimensional search queries from the profile.
    For each primary keyword, generate role-based and stack-based variants.
    Returns a de-duplicated flat list of search strings.
    """
    expanded = list(keywords)  # start with the explicit keywords
    
    profile_title = profile.get("title", "")
    
    # Add job title words as standalone queries (e.g. "Desarrollador", "Full Stack")
    title_keywords = []
    for word in re.split(r'[\s/|,]+', profile_title):
        word = word.strip()
        if len(word) >= 4 and word not in expanded:
            title_keywords.append(word)
    expanded.extend(title_keywords[:2])
    
    # Combine top skills into stack-based queries (e.g. "PHP Laravel")
    primary = profile.get("all_skills_flat", [])[:4]
    if len(primary) >= 2:
        stack_q = " ".join(primary[:2])
        if stack_q not in expanded:
            expanded.append(stack_q)
    
    # Add Spanish/English variants for common terms
    es_en_map = {
        "desarrollador": "developer",
        "developer": "desarrollador",
        "programador": "programmer",
        "sistemas": "systems",
        "redes": "network",
        "seguridad": "security",
        "ciberseguridad": "cybersecurity",
        "infraestructura": "infrastructure",
    }
    variants = []
    for kw in list(expanded):
        kw_lower = kw.lower()
        if kw_lower in es_en_map and es_en_map[kw_lower] not in [k.lower() for k in expanded]:
            variants.append(es_en_map[kw_lower])
    expanded.extend(variants[:2])
    
    # Deduplicate while preserving order and limit to 8 queries max
    seen = set()
    result = []
    for k in expanded:
        k_lower = k.lower()
        if k_lower not in seen:
            seen.add(k_lower)
            result.append(k)
    return result[:8]


# ─────────────────────────────────────────────────────────────
# Main search orchestrator
# ─────────────────────────────────────────────────────────────
def search_jobs(profile=None, keywords=None, location="veracruz", max_results=20):
    if not profile:
        pdf_path = r"c:\Users\siste\OneDrive\Documentos\PostulacionAuto\cv\CV_Erwin_Brow.pdf"
        profile = parse_cv(pdf_path)

    # ── Keyword resolution ───────────────────────────────────
    if not keywords:
        skills = profile.get("all_skills_flat", [])
        if len(skills) >= 4:
            keywords = skills[:4]
        elif skills:
            keywords = skills
        else:
            keywords = ["PHP", "Sistemas", "Desarrollador"]
    elif isinstance(keywords, str):
        keywords = [k.strip() for k in keywords.split(',') if k.strip()]

    # Expand keywords for deeper coverage
    expanded_keywords = _expand_keywords(keywords, profile)

    # ── Location normalization ───────────────────────────────
    loc_lower = location.lower()
    if "remoto" in loc_lower or "remote" in loc_lower:
        mexico_loc = "remoto"
    else:
        mexico_loc = loc_lower.split(',')[0].strip()
    global_loc = location

    # ── Cache check ──────────────────────────────────────────
    cache_key = _cache_key(expanded_keywords, location, max_results)
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    # ── Parallel scraping ────────────────────────────────────
    combined_jobs = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = []

        for kw in expanded_keywords:
            futures.append(executor.submit(scrape_computrabajo, kw, mexico_loc, max_results))
            futures.append(executor.submit(scrape_occ, kw, mexico_loc, max_results))
            futures.append(executor.submit(scrape_getonbrd, kw, global_loc, max_results))
            futures.append(executor.submit(scrape_linkedin, kw, global_loc, max_results))
            futures.append(executor.submit(scrape_google_jobs, kw, global_loc, max_results))
            if HAS_INFOJOBS:
                futures.append(executor.submit(scrape_infojobs, kw, mexico_loc, max_results))
            if HAS_TALENTCOM:
                futures.append(executor.submit(scrape_talentcom, kw, global_loc, max_results))

        for future in concurrent.futures.as_completed(futures):
            try:
                results = future.result(timeout=20)
                for job in results:
                    link = job.get("link", "")
                    if link and link not in combined_jobs:
                        combined_jobs[link] = job
            except Exception as e:
                print(f"[SCRAPER ERROR] {e}")

    # ── ATS Scoring ──────────────────────────────────────────
    scored_jobs = []
    for job in combined_jobs.values():
        score, matched = calculate_match_score(job, profile)
        job["match_score"] = score
        job["matched_skills"] = list(set(matched))
        # Score breakdown for UI display
        job["score_breakdown"] = {
            "skills_matched": len(set(matched)),
            "total_skills": len(profile.get("all_skills_flat", [])),
        }
        scored_jobs.append(job)

    scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)

    # ── Fallback mock data ───────────────────────────────────
    if not scored_jobs:
        print("[WARNING] Scrapers returned no jobs. Loading offline mock jobs.")
        keywords_str = " ".join(keywords[:2]) if keywords else "desarrollador"
        mock_candidates = [
            {
                "id": "mock_li_1",
                "title": f"Senior {keywords_str.title()} Developer (Full Stack)",
                "company": "BairesDev",
                "location": "Remoto (México)",
                "salary": "$45,000 - $65,000 MXN",
                "date": "Hace 2 días",
                "link": "https://mx.linkedin.com/jobs/view/mock-python-dev-bairesdev",
                "source": "LinkedIn",
                "description": f"Buscamos un Ingeniero de Software para unirse a nuestro equipo. Requisitos: experiencia en {keywords_str}, APIs RESTful, SQL y Git. Trabajo 100% remoto con excelentes beneficios.",
                "applicants": "45 postulantes"
            },
            {
                "id": "mock_ct_1",
                "title": f"Desarrollador {keywords_str.title()} Jr — Veracruz",
                "company": "Tech Solutions Veracruz",
                "location": "Veracruz, Veracruz",
                "salary": "$18,000 - $22,000 MXN",
                "date": "Ayer",
                "link": "https://www.computrabajo.com.mx/oferta-mock-dev-veracruz",
                "source": "Computrabajo",
                "description": f"Se solicita desarrollador junior. Conocimientos de {keywords_str}, HTML, CSS, JavaScript y Git. Ubicación presencial en Boca del Río.",
                "applicants": "12 postulantes"
            },
            {
                "id": "mock_occ_1",
                "title": f"Software Engineer Lead ({keywords_str.title()})",
                "company": "Softtek México",
                "location": "Remoto (Monterrey)",
                "salary": "$55,000 MXN",
                "date": "Hace 5 días",
                "link": "https://www.occ.com.mx/empleo/oferta-mock-softtek",
                "source": "OCC Mundial",
                "description": f"Liderar el diseño e implementación de sistemas empresariales. Requisitos: {keywords_str}, Docker, AWS, microservicios, Scrum.",
                "applicants": "8 postulantes"
            },
            {
                "id": "mock_gb_1",
                "title": f"Full Stack Developer ({keywords_str.title()})",
                "company": "Niuro LatAm",
                "location": "Remoto (Chile/México)",
                "salary": "$2,500 - $3,500 USD",
                "date": "Hace 1 semana",
                "link": "https://www.getonbrd.com/jobs/mock-fullstack-niuro",
                "source": "Get on Board",
                "description": f"Join our dynamic team building next-generation fintech solutions. Stack: {keywords_str}, React, PostgreSQL, Docker, AWS.",
                "applicants": "19 postulantes"
            },
            {
                "id": "mock_ij_1",
                "title": f"Desarrollador {keywords_str.title()} — Empresa Líder TI",
                "company": "Grupo Empresarial Digital MX",
                "location": "Ciudad de México (Híbrido)",
                "salary": "$30,000 - $40,000 MXN",
                "date": "Hoy",
                "link": "https://www.infojobs.com.mx/oferta-mock-digital",
                "source": "Infojobs",
                "description": f"Empresa de tecnología solicita desarrollador con experiencia en {keywords_str}. Modalidad híbrida, prestaciones superiores, bono anual.",
                "applicants": "5 postulantes"
            }
        ]
        for mj in mock_candidates:
            score, matched = calculate_match_score(mj, profile)
            mj["match_score"] = score
            mj["matched_skills"] = list(set(matched))
            mj["score_breakdown"] = {"skills_matched": len(set(matched)), "total_skills": len(profile.get("all_skills_flat", []))}
            scored_jobs.append(mj)
        scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)

    result = scored_jobs[:max_results]
    _set_cache(cache_key, result)
    return result


if __name__ == "__main__":
    print("Testing search_manager v2 with default profile...")
    res = search_jobs(keywords=["php"], location="remoto", max_results=5)
    for j in res:
        print(f"[{j['match_score']}%] {j['title']} — {j['company']} ({j['source']})")
