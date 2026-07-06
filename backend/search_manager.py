import os
import sys
import concurrent.futures
import re
from backend.parser import parse_cv, FALLBACK_PROFILE
from backend.scrapers.computrabajo import scrape_computrabajo
from backend.scrapers.occ import scrape_occ
from backend.scrapers.getonbrd import scrape_getonbrd
from backend.scrapers.linkedin import scrape_linkedin
from backend.scrapers.google_jobs import scrape_google_jobs

def calculate_match_score(job, profile):
    title = job["title"].lower()
    description = job.get("description", "").lower()
    
    matched_skills = []
    score = 10  # Base score
    
    # Check skills
    for skill in profile.get("all_skills_flat", []):
        skill_lower = skill.lower()
        # Escaping regex characters for C#, C++, .NET
        escaped_skill = re.escape(skill_lower)
        if any(char in skill_lower for char in ['#', '+', '.', '/']):
            pattern = rf'{escaped_skill}'
        else:
            pattern = rf'\b{escaped_skill}\b'
            
        if re.search(pattern, title):
            score += 25
            matched_skills.append(skill)
        elif re.search(pattern, description):
            score += 12
            matched_skills.append(skill)
                
    # Extra points for priority match of high-profile items
    # Check first 5 flat skills of profile (usually main skills)
    for skill in profile.get("all_skills_flat", [])[:5]:
        if skill.lower() in title:
            score += 15
            
    # Cap score at 100
    score = min(score, 100)
    
    return score, matched_skills

def search_jobs(profile=None, keywords=None, location="veracruz", max_results=20):
    # If no custom profile is provided, parse fallback Erwin's profile
    if not profile:
        pdf_path = r"c:\Users\siste\OneDrive\Documentos\PostulacionAuto\cv\CV_Erwin_Brow.pdf"
        profile = parse_cv(pdf_path)
        
    # Determine search queries based on profile skills
    if not keywords:
        # Get up to 4 major skills from profile
        skills = profile.get("all_skills_flat", [])
        if len(skills) >= 4:
            keywords = skills[:4]
        elif skills:
            keywords = skills
        else:
            keywords = ["PHP", "Sistemas", "Desarrollador"]
    elif isinstance(keywords, str):
        keywords = [keywords]
        
    # Normalize location for local Mexican scrapers vs Global scrapers
    loc_lower = location.lower()
    if "remoto" in loc_lower or "remote" in loc_lower:
        mexico_loc = "remoto"
    else:
        # Extract city (e.g. "Veracruz, México" -> "veracruz")
        mexico_loc = loc_lower.split(',')[0].strip()
        
    global_loc = location
    
    combined_jobs = {}
    
    # Query all scrapers in parallel!
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = []
        
        for kw in keywords:
            # Computrabajo (Mexico-only, uses mexico_loc)
            futures.append(executor.submit(scrape_computrabajo, kw, mexico_loc, max_results))
            # OCC (Mexico-only, uses mexico_loc)
            futures.append(executor.submit(scrape_occ, kw, mexico_loc, max_results))
            # Getonbrd (Global tech, uses global_loc)
            futures.append(executor.submit(scrape_getonbrd, kw, global_loc, max_results))
            # LinkedIn (Global, uses global_loc)
            futures.append(executor.submit(scrape_linkedin, kw, global_loc, max_results))
            # Google Jobs (Broad search, uses global_loc)
            futures.append(executor.submit(scrape_google_jobs, kw, global_loc, max_results))
            
        for future in concurrent.futures.as_completed(futures):
            try:
                results = future.result()
                for job in results:
                    # Deduplicate using link
                    link = job["link"]
                    if link not in combined_jobs:
                        combined_jobs[link] = job
            except Exception as e:
                print(f"Error in thread execution: {e}")
                
    # Calculate scores
    scored_jobs = []
    for job in combined_jobs.values():
        score, matched = calculate_match_score(job, profile)
        job["match_score"] = score
        job["matched_skills"] = list(set(matched))
        scored_jobs.append(job)
        
    # Sort by match score descending
    scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)
    
    # Mock data fallback in case scrapers return nothing due to offline/DNS/blocking issues
    if not scored_jobs:
        print("Scrapers returned no jobs. Loading offline mock jobs for demo.")
        keywords_str = " ".join(keywords) if keywords else "desarrollador"
        mock_candidates = [
            {
                "id": "mock_li_1",
                "title": f"Senior {keywords_str.title()} Developer (Python/DevOps/PHP)",
                "company": "BairesDev",
                "location": "Remoto (México)",
                "salary": "$45,000 - $65,000 MXN",
                "date": "Hace 2 días",
                "link": "https://mx.linkedin.com/jobs/view/mock-python-dev-bairesdev",
                "source": "LinkedIn",
                "description": "Buscamos un Ingeniero de Software para unirse a nuestro equipo. Requisitos: experiencia en Python, Django, Docker, APIs RESTful, SQL y Git. Trabajo 100% remoto con excelentes beneficios.",
                "applicants": "45 postulantes"
            },
            {
                "id": "mock_ct_1",
                "title": f"Desarrollador {keywords_str.title()} Jr",
                "company": "Tech Solutions Veracruz",
                "location": "Veracruz, Veracruz",
                "salary": "$18,000 - $22,000 MXN",
                "date": "Ayer",
                "link": "https://www.computrabajo.com.mx/oferta-mock-dev-veracruz",
                "source": "Computrabajo",
                "location": "Veracruz, México",
                "description": "Se solicita desarrollador junior. Conocimientos de HTML, CSS, JavaScript, PHP, bases de datos relacionales y Git. Ubicación presencial en Boca del Río / Veracruz.",
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
                "description": "Liderar el diseño e implementación de sistemas empresariales. Requisitos obligatorios: Arquitectura de software, DevOps, Docker, AWS, microservicios, metodologías ágiles Scrum.",
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
                "description": "Join our dynamic team building next-generation fintech solutions. Stack: Python, FastAPI, React, PostgreSQL, Docker, AWS, Git.",
                "applicants": "19 postulantes"
            }
        ]
        for mj in mock_candidates:
            score, matched = calculate_match_score(mj, profile)
            mj["match_score"] = score
            mj["matched_skills"] = list(set(matched))
            scored_jobs.append(mj)
        scored_jobs.sort(key=lambda x: x["match_score"], reverse=True)
        
    return scored_jobs[:max_results]

if __name__ == "__main__":
    # Test with default profile
    print("Searching jobs with default profile...")
    res = search_jobs(keywords=["php"], location="remoto", max_results=5)
    for j in res:
        print(f"[{j['match_score']}%] {j['title']} - {j['company']} ({j['source']})")
