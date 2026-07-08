import os
import sys
import concurrent.futures
import re
import time
import hashlib
import json
import urllib.request
from backend.parser import parse_cv, FALLBACK_PROFILE, normalize_text
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

# #region debug-point A:prod-search-debug
def _debug_emit(hypothesis_id, message, data=None):
    try:
        _p = '.dbg/production-scrapers.env'
        _u, _s = 'http://127.0.0.1:7777/event', 'production-scrapers'
        try:
            with open(_p, encoding='utf-8') as f:
                c = f.read()
            _u = next((l.split('=', 1)[1] for l in c.splitlines() if l.startswith('DEBUG_SERVER_URL=')), _u)
            _s = next((l.split('=', 1)[1] for l in c.splitlines() if l.startswith('DEBUG_SESSION_ID=')), _s)
        except Exception:
            pass
        payload = {
            "sessionId": _s,
            "runId": "pre",
            "hypothesisId": hypothesis_id,
            "location": "backend/search_manager.py",
            "msg": f"[DEBUG] {message}",
            "data": data or {},
            "ts": int(time.time() * 1000),
        }
        urllib.request.urlopen(
            urllib.request.Request(
                _u,
                data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json"},
            ),
            timeout=2,
        ).read()
    except Exception:
        pass
# #endregion

def _cache_key(keywords, location, modality, max_results):
    raw = f"{sorted(keywords)}|{location}|{modality}|{max_results}"
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


def allow_search_mock_fallback():
    return os.environ.get("PAH_ENABLE_SEARCH_FALLBACK", "").strip().lower() in {"1", "true", "yes", "on"}


REMOTE_PATTERN = re.compile(r"\b(remoto|remote|home office|teletrabajo|work from home|100% remoto)\b", re.IGNORECASE)
HYBRID_PATTERN = re.compile(r"\b(hibrido|híbrido|hybrid|esquema mixto)\b", re.IGNORECASE)
ONSITE_PATTERN = re.compile(r"\b(presencial|onsite|on-site|en oficina|office-based)\b", re.IGNORECASE)
SENIOR_PATTERN = re.compile(r"\b(senior|sr\.?|lead|líder|principal|architect)\b", re.IGNORECASE)
JUNIOR_PATTERN = re.compile(r"\b(junior|jr\.?|trainee|practicante|entry)\b", re.IGNORECASE)
SEMI_PATTERN = re.compile(r"\b(semi|semi senior|mid|pleno|ssr)\b", re.IGNORECASE)


def normalize_modality(value):
    value = (value or "").strip().lower()
    if value in ("remoto", "remote"):
        return "remoto"
    if value in ("hibrido", "híbrido", "hybrid"):
        return "hibrido"
    if value in ("presencial", "onsite", "on-site"):
        return "presencial"
    return "any"


def detect_job_modality(job):
    text = " ".join([
        job.get("title", ""),
        job.get("location", ""),
        job.get("description", ""),
        job.get("source", ""),
    ]).lower()

    if HYBRID_PATTERN.search(text):
        return "hibrido"
    if REMOTE_PATTERN.search(text):
        return "remoto"
    if ONSITE_PATTERN.search(text):
        return "presencial"
    return "presencial"


def detect_job_seniority(job):
    text = " ".join([job.get("title", ""), job.get("description", "")]).lower()
    if SENIOR_PATTERN.search(text):
        return "senior"
    if JUNIOR_PATTERN.search(text):
        return "junior"
    if SEMI_PATTERN.search(text):
        return "semi"
    return "general"


def normalize_job(job, requested_location="México"):
    normalized = dict(job)
    normalized["work_modality"] = detect_job_modality(normalized)
    normalized["seniority"] = detect_job_seniority(normalized)
    normalized["location"] = (normalized.get("location") or requested_location or "México").strip()
    return normalized


def job_matches_requested_modality(job, requested_modality):
    modality = normalize_modality(requested_modality)
    if modality == "any":
        return True
    job_modality = job.get("work_modality") or detect_job_modality(job)
    if modality == "remoto":
        return job_modality == "remoto"
    if modality == "hibrido":
        return job_modality == "hibrido"
    if modality == "presencial":
        return job_modality == "presencial"
    return True


# ─────────────────────────────────────────────────────────────
# ATS Match Score v2 — Weighted Scoring Engine
# ─────────────────────────────────────────────────────────────
def calculate_match_score(job, profile, requested_modality="any"):
    title = (job.get("title") or "").lower()
    description = (job.get("description") or "").lower()
    location_field = (job.get("location") or "").lower()
    
    matched_skills = set()
    score = 5  # Base score
    breakdown = {
        "skills": 0,
        "modality": 0,
        "seniority": 0,
        "profile_strength": 0,
    }

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
            delta = 30 if is_primary else 20
            score += delta
            breakdown["skills"] += delta
            matched_skills.add(skill)
        elif in_desc:
            delta = 10 if is_primary else 6
            score += delta
            breakdown["skills"] += delta
            matched_skills.add(skill)

    # ── Modality bonus / penalty ─────────────────────────────
    requested_modality = normalize_modality(requested_modality)
    job_modality = job.get("work_modality") or detect_job_modality(job)
    if requested_modality == "remoto":
        if job_modality == "remoto":
            score += 12
            breakdown["modality"] += 12
        else:
            score -= 12
            breakdown["modality"] -= 12
    elif requested_modality == "hibrido":
        if job_modality == "hibrido":
            score += 10
            breakdown["modality"] += 10
        elif job_modality == "remoto":
            score += 3
            breakdown["modality"] += 3
        else:
            score -= 6
            breakdown["modality"] -= 6
    elif requested_modality == "presencial":
        if job_modality == "presencial":
            score += 10
            breakdown["modality"] += 10
        elif job_modality == "hibrido":
            score += 3
            breakdown["modality"] += 3
        else:
            score -= 4
            breakdown["modality"] -= 4

    # ── Seniority / Level detection bonus ───────────────────
    profile_title = (profile.get("title") or "").lower()
    profile_years = profile.get("experience_years", 0) or 0
    job_is_senior = bool(SENIOR_PATTERN.search(title))
    job_is_junior = bool(JUNIOR_PATTERN.search(title))
    profile_is_senior = bool(SENIOR_PATTERN.search(profile_title)) or profile_years >= 5
    profile_is_junior = bool(JUNIOR_PATTERN.search(profile_title)) or (0 < profile_years <= 2)

    if job_is_senior and profile_is_senior:
        score += 12
        breakdown["seniority"] += 12
    elif job_is_junior and profile_is_junior:
        score += 8
        breakdown["seniority"] += 8
    elif job_is_senior and profile_is_junior:
        score -= 8
        breakdown["seniority"] -= 8

    # ── Skill density bonus (more total matches = richer match) ──
    match_count = len(matched_skills)
    if match_count >= 5:
        score += 10
        breakdown["skills"] += 10
    elif match_count >= 3:
        score += 5
        breakdown["skills"] += 5

    # ── Category coverage bonus ──────────────────────────────
    skill_cats = profile.get("skills", {})
    cats_hit = 0
    for cat_skills in skill_cats.values():
        cat_lower = [s.lower() for s in cat_skills]
        if any(ms.lower() in cat_lower for ms in matched_skills):
            cats_hit += 1
    if cats_hit >= 3:
        score += 8
        breakdown["profile_strength"] += 8
    elif cats_hit >= 2:
        score += 4
        breakdown["profile_strength"] += 4

    # ── Preferred roles / summary signal ─────────────────────
    role_signals = [role.lower() for role in profile.get("preferred_roles", [])]
    summary_text = (profile.get("summary") or "").lower()
    for role in role_signals[:3]:
        role_words = [part for part in re.split(r"[\s/|,]+", role) if len(part) >= 4]
        if role_words and all(word in (title + " " + description) for word in role_words[:2]):
            score += 6
            breakdown["profile_strength"] += 6
            break
    if summary_text and any(word in description for word in re.findall(r"\b[a-z]{5,}\b", normalize_text(summary_text))[:6]):
        score += 3
        breakdown["profile_strength"] += 3

    score = min(score, 100)
    score = max(score, 0)
    return score, list(matched_skills), breakdown


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
    preferred_roles = profile.get("preferred_roles", [])
    
    # Add job title words as standalone queries (e.g. "Desarrollador", "Full Stack")
    title_keywords = []
    for word in re.split(r'[\s/|,]+', profile_title):
        word = word.strip()
        if len(word) >= 4 and word not in expanded:
            title_keywords.append(word)
    expanded.extend(title_keywords[:2])
    expanded.extend(preferred_roles[:2])
    
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
    return result[:10]


# ─────────────────────────────────────────────────────────────
# Main search orchestrator
# ─────────────────────────────────────────────────────────────
def search_jobs(profile=None, keywords=None, location="México", modality="any", max_results=20):
    # #region debug-point A:search-entry
    _debug_emit("A", "search_jobs called", {
        "location": location,
        "modality": modality,
        "max_results": max_results,
        "keywords_input_type": type(keywords).__name__,
        "profile_has_keywords": bool((profile or {}).get("search_keywords")) if isinstance(profile, dict) else False,
    })
    # #endregion
    if not profile:
        pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cv", "CV_Erwin_Brow.pdf")
        profile = parse_cv(pdf_path)

    # ── Keyword resolution ───────────────────────────────────
    if not keywords:
        suggested_keywords = profile.get("search_keywords", [])
        skills = profile.get("all_skills_flat", [])
        if suggested_keywords:
            keywords = suggested_keywords[:18]
        elif len(skills) >= 4:
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
    modality = normalize_modality(modality)
    loc_lower = (location or "México").lower()
    mexico_loc = loc_lower.split(',')[0].strip() if loc_lower else "mexico"
    global_loc = location or "México"

    # ── Cache check ──────────────────────────────────────────
    cache_key = _cache_key(expanded_keywords, location, modality, max_results)
    cached = _get_cached(cache_key)
    if cached is not None:
        # #region debug-point D:cache-hit
        _debug_emit("D", "search cache hit", {"cache_key": cache_key[:8], "cached_count": len(cached)})
        # #endregion
        return cached

    # ── Parallel scraping ────────────────────────────────────
    combined_jobs = {}
    scraper_stats = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = {}

        for kw in expanded_keywords:
            futures[executor.submit(scrape_computrabajo, kw, mexico_loc, modality, max_results)] = {"scraper": "computrabajo", "keyword": kw}
            futures[executor.submit(scrape_occ, kw, mexico_loc, modality, max_results)] = {"scraper": "occ", "keyword": kw}
            futures[executor.submit(scrape_getonbrd, kw, global_loc, modality, max_results)] = {"scraper": "getonbrd", "keyword": kw}
            futures[executor.submit(scrape_linkedin, kw, global_loc, modality, max_results)] = {"scraper": "linkedin", "keyword": kw}
            futures[executor.submit(scrape_google_jobs, kw, global_loc, modality, max_results)] = {"scraper": "google_jobs", "keyword": kw}
            if HAS_INFOJOBS:
                futures[executor.submit(scrape_infojobs, kw, mexico_loc, modality, max_results)] = {"scraper": "infojobs", "keyword": kw}
            if HAS_TALENTCOM:
                futures[executor.submit(scrape_talentcom, kw, global_loc, modality, max_results)] = {"scraper": "talentcom", "keyword": kw}

        for future in concurrent.futures.as_completed(futures):
            future_meta = futures.get(future, {})
            scraper_name = future_meta.get("scraper", "unknown")
            scraper_keyword = future_meta.get("keyword", "")
            try:
                results = future.result(timeout=20)
                scraper_stats[scraper_name] = scraper_stats.get(scraper_name, 0) + len(results or [])
                # #region debug-point B:scraper-result
                _debug_emit("B", "scraper returned results", {
                    "scraper": scraper_name,
                    "keyword": scraper_keyword,
                    "count": len(results or []),
                })
                # #endregion
                for job in results:
                    link = job.get("link", "")
                    if link and link not in combined_jobs:
                        normalized_job = normalize_job(job, requested_location=location)
                        if job_matches_requested_modality(normalized_job, modality):
                            combined_jobs[link] = normalized_job
            except Exception as e:
                # #region debug-point B:scraper-error
                _debug_emit("B", "scraper raised exception", {
                    "scraper": scraper_name,
                    "keyword": scraper_keyword,
                    "error": str(e),
                })
                # #endregion
                print(f"[SCRAPER ERROR] {e}")

    # ── ATS Scoring ──────────────────────────────────────────
    scored_jobs = []
    for job in combined_jobs.values():
        score, matched, breakdown = calculate_match_score(job, profile, requested_modality=modality)
        job["match_score"] = score
        job["matched_skills"] = list(set(matched))
        job["score_breakdown"] = {
            "score_parts": breakdown,
            "skills_matched": len(set(matched)),
            "total_skills": len(profile.get("all_skills_flat", [])),
            "work_modality": job.get("work_modality", "presencial"),
            "seniority": job.get("seniority", "general"),
        }
        scored_jobs.append(job)

    scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)

    # ── Fallback mock data ───────────────────────────────────
    used_backend_fallback = False
    if not scored_jobs and allow_search_mock_fallback():
        used_backend_fallback = True
        # #region debug-point C:backend-fallback
        _debug_emit("C", "backend fallback activated", {
            "expanded_keywords": expanded_keywords[:10],
            "scraper_stats": scraper_stats,
            "combined_jobs": len(combined_jobs),
        })
        # #endregion
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
            mj = normalize_job(mj, requested_location=location)
            if not job_matches_requested_modality(mj, modality):
                continue
            score, matched, breakdown = calculate_match_score(mj, profile, requested_modality=modality)
            mj["match_score"] = score
            mj["matched_skills"] = list(set(matched))
            mj["score_breakdown"] = {
                "score_parts": breakdown,
                "skills_matched": len(set(matched)),
                "total_skills": len(profile.get("all_skills_flat", [])),
                "work_modality": mj.get("work_modality", "presencial"),
                "seniority": mj.get("seniority", "general"),
            }
            scored_jobs.append(mj)
        scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)

    # ── Automatic Enrichment of Top 3 vacancies ──────────────
    top_jobs_to_enrich = scored_jobs[:3]
    if top_jobs_to_enrich:
        print(f"[ENRICHMENT] Automatically enriching top {len(top_jobs_to_enrich)} vacancies...")
        from backend.job_analyzer import analyze_job_detail
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as enrich_executor:
            future_to_job = {enrich_executor.submit(analyze_job_detail, job, profile): job for job in top_jobs_to_enrich}
            for future in concurrent.futures.as_completed(future_to_job):
                job = future_to_job[future]
                try:
                    deep_analysis = future.result()
                    job["deep_analysis"] = deep_analysis
                    if deep_analysis.get("work_modality_deep"):
                        job["work_modality"] = deep_analysis["work_modality_deep"]
                    if deep_analysis.get("seniority_deep"):
                        job["seniority"] = deep_analysis["seniority_deep"]
                    if deep_analysis.get("salary_deep") and deep_analysis["salary_deep"] != "No especificado":
                        job["salary"] = deep_analysis["salary_deep"]
                except Exception as e:
                    print(f"[ENRICHMENT ERROR] Failed to enrich job '{job.get('title')}': {e}")

    result = scored_jobs[:max_results]
    # #region debug-point D:return-summary
    _debug_emit("D", "search_jobs returning", {
        "returned_count": len(result),
        "combined_jobs": len(combined_jobs),
        "used_backend_fallback": used_backend_fallback,
        "scraper_stats": scraper_stats,
    })
    # #endregion
    if result and not used_backend_fallback:
        _set_cache(cache_key, result)
    return result


if __name__ == "__main__":
    print("Testing search_manager v2 with default profile...")
    res = search_jobs(keywords=["php"], location="remoto", max_results=5)
    for j in res:
        print(f"[{j['match_score']}%] {j['title']} — {j['company']} ({j['source']})")
