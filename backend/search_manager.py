import os
import sys
import concurrent.futures
import re
from backend.parser import parse_cv, FALLBACK_PROFILE
from backend.scrapers.computrabajo import scrape_computrabajo
from backend.scrapers.occ import scrape_occ
from backend.scrapers.getonbrd import scrape_getonbrd

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
        
    combined_jobs = {}
    
    # Query all three scrapers (Computrabajo, OCC, Getonbrd) in parallel!
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = []
        
        for kw in keywords:
            # Computrabajo
            futures.append(executor.submit(scrape_computrabajo, kw, location, max_results))
            # OCC
            futures.append(executor.submit(scrape_occ, kw, location, max_results))
            # Getonbrd
            futures.append(executor.submit(scrape_getonbrd, kw, location, max_results))
            
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
    
    return scored_jobs[:max_results]

if __name__ == "__main__":
    # Test with default profile
    print("Searching jobs with default profile...")
    res = search_jobs(keywords=["php"], location="remoto", max_results=5)
    for j in res:
        print(f"[{j['match_score']}%] {j['title']} - {j['company']} ({j['source']})")
