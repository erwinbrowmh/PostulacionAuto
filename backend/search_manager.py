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


def get_search_keyword_budget():
    try:
        return max(1, min(int(os.environ.get("PAH_SEARCH_KEYWORD_BUDGET", "6")), 12))
    except Exception:
        return 6


def get_search_worker_budget():
    try:
        return max(2, min(int(os.environ.get("PAH_SEARCH_WORKERS", "4")), 8))  # Reduced for stability
    except Exception:
        return 4


def get_auto_enrich_limit():
    try:
        return max(0, min(int(os.environ.get("PAH_AUTO_ENRICH_TOP_N", "0")), 3))
    except Exception:
        return 0


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

    # ── Skill density bonus ──────────────────────────────────
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

    score = min(score, 100)
    score = max(score, 0)
    return score, list(matched_skills), breakdown


# ─────────────────────────────────────────────────────────────
# Multi-dimensional keyword expansion
# ─────────────────────────────────────────────────────────────
def _expand_keywords(keywords, profile):
    expanded = list(keywords) if keywords else []
    
    profile_title = profile.get("title", "")
    preferred_roles = profile.get("preferred_roles", [])
    
    title_keywords = []
    for word in re.split(r'[\s/|,]+', profile_title):
        word = word.strip()
        if len(word) >= 4 and word not in expanded:
            title_keywords.append(word)
    expanded.extend(title_keywords[:2])
    expanded.extend(preferred_roles[:2])
    
    primary = profile.get("all_skills_flat", [])[:4]
    if len(primary) >= 2:
        stack_q = " ".join(primary[:2])
        if stack_q not in expanded:
            expanded.append(stack_q)
    
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
    
    seen = set()
    result = []
    for k in expanded:
        k_lower = k.lower()
        if k_lower not in seen:
            seen.add(k_lower)
            result.append(k)
    return result[:8]  # Limit to 8 keywords


# ─────────────────────────────────────────────────────────────
# Main search orchestrator
# ─────────────────────────────────────────────────────────────
def search_jobs(profile=None, keywords=None, location="México", modality="any", max_results=20):
    if not profile:
        pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "cv", "CV_Erwin_Brow.pdf")
        profile = parse_cv(pdf_path)

    # ── Keyword resolution ───────────────────────────────────
    if not keywords:
        suggested_keywords = profile.get("search_keywords", [])
        skills = profile.get("all_skills_flat", [])
        if suggested_keywords:
            keywords = suggested_keywords[:get_search_keyword_budget()]
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
    expanded_keywords = expanded_keywords[:get_search_keyword_budget()]

    if not expanded_keywords:
        return []

    # ── Location normalization ───────────────────────────────
    modality = normalize_modality(modality)
    loc_lower = (location or "México").lower()
    mexico_loc = loc_lower.split(',')[0].strip() if loc_lower else "mexico"
    global_loc = location or "México"

    # ── Cache check ──────────────────────────────────────────
    cache_key = _cache_key(expanded_keywords, location, modality, max_results)
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    # ── Parallel scraping ────────────────────────────────────
    combined_jobs = {}
    scraper_stats = {}
    
    # Use fewer workers for stability
    max_workers = min(get_search_worker_budget(), len(expanded_keywords) * 2 + 2)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
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

        for future in concurrent.futures.as_completed(futures, timeout=30):
            future_meta = futures.get(future, {})
            scraper_name = future_meta.get("scraper", "unknown")
            scraper_keyword = future_meta.get("keyword", "")
            try:
                results = future.result(timeout=10)
                if results:
                    scraper_stats[scraper_name] = scraper_stats.get(scraper_name, 0) + len(results)
                    for job in results:
                        link = job.get("link", "")
                        if link and link not in combined_jobs:
                            normalized_job = normalize_job(job, requested_location=location)
                            if job_matches_requested_modality(normalized_job, modality):
                                combined_jobs[link] = normalized_job
            except Exception as e:
                print(f"[SCRAPER ERROR] {scraper_name}: {str(e)[:100]}")
                continue

    # ── ATS Scoring ──────────────────────────────────────────
    scored_jobs = []
    for job in combined_jobs.values():
        score, matched, breakdown = calculate_match_score(job, profile, requested_modality=modality)
        job["match_score"] = score
        job["matched_skills"] = list(set(matched))[:10]
        job["score_breakdown"] = {
            "score_parts": breakdown,
            "skills_matched": len(set(matched)),
            "total_skills": len(profile.get("all_skills_flat", [])),
            "work_modality": job.get("work_modality", "presencial"),
            "seniority": job.get("seniority", "general"),
        }
        scored_jobs.append(job)

    scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)
    
    # Limit results
    result = scored_jobs[:max_results]
    
    # Cache if we have results
    if result:
        _set_cache(cache_key, result)
    
    return result