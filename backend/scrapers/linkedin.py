import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

def scrape_linkedin(keyword, location="veracruz", modality="any", max_results=20):
    keyword_encoded = urllib.parse.quote(keyword)
    
    # Format location
    if modality == "remoto":
        loc_str = "Mexico"
    else:
        loc_str = f"{location}, Mexico"
        
    loc_encoded = urllib.parse.quote(loc_str)
    
    # LinkedIn guest job search API URL
    url = f"https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords={keyword_encoded}&location={loc_encoded}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "es-MX,es;q=0.9"
    }
    
    jobs = []
    try:
        response = requests.get(url, headers=headers, timeout=12)
        if response.status_code != 200:
            print(f"LinkedIn Guest API returned status {response.status_code}")
            return jobs
            
        soup = BeautifulSoup(response.text, 'html.parser')
        lis = soup.find_all('li')
        
        for li in lis:
            if len(jobs) >= max_results:
                break
                
            # Get job link & title
            title_a = li.find('a', class_=lambda x: x and ('result-card__title-link' in x or 'base-card__full-link' in x))
            if not title_a:
                continue
                
            title = title_a.text.strip()
            link = title_a.get('href')
            
            # Clean link (remove query parameters for cleaner presentation)
            if link and '?' in link:
                link = link.split('?')[0]
                
            # Extract job ID from link
            job_id_match = re.search(r'-(\d+)$', link)
            job_id = job_id_match.group(1) if job_id_match else f"card_{len(jobs)}"
            
            # Get company
            company = "Confidencial"
            company_a = li.find('a', class_=lambda x: x and ('result-card__subtitle-link' in x or 'hidden-nested-link' in x))
            if company_a:
                company = company_a.text.strip()
            else:
                company_span = li.find('span', class_='base-card__subtitle') or li.find('span', class_='job-search-card__company-name')
                if company_span:
                    company = company_span.text.strip()
                    
            # Get location
            loc_text = "Veracruz"
            location_span = li.find('span', class_=lambda x: x and ('job-result-card__location' in x or 'job-search-card__location' in x))
            if location_span:
                loc_text = location_span.text.strip()
                
            # Check if we should filter out remote/onsite
            if modality == "remoto":
                # LinkedIn guest search doesn't guarantee remote unless we filter title
                title_lower = title.lower()
                # Check for remote indicators
                if not any(r_word in title_lower or r_word in loc_text.lower() for r_word in ['remoto', 'remote', 'teletrabajo', 'home office', 'desde casa', 'work from home']):
                    # Check if the location is literally just "Mexico" (common for remote jobs)
                    if loc_text.lower() != "mexico" and loc_text.lower() != "méxico":
                        continue # Skip onsite local jobs if searching remote
            elif modality == "hibrido":
                if not any(word in (title + " " + loc_text).lower() for word in ['híbrido', 'hibrido', 'hybrid']):
                    continue
                        
            # Get date
            time_tag = li.find('time')
            date = "Reciente"
            if time_tag:
                date = time_tag.text.strip()
                # Translate dates to Spanish
                date = date.replace("ago", "atrás").replace("weeks", "semanas").replace("week", "semana").replace("days", "días").replace("day", "día").replace("hours", "horas").replace("hour", "hora").replace("minutes", "minutos").replace("yesterday", "ayer")
                
            # Snippet / Description
            # LinkedIn guest API doesn't show descriptions, so we set a guide
            desc = "Vacante en LinkedIn. Abre la oferta original para consultar el perfil completo de la vacante, requisitos de postulación y rango salarial."
            
            jobs.append({
                "id": f"linkedin_{job_id}",
                "title": title,
                "company": company,
                "location": loc_text,
                "salary": "Ver en portal",
                "date": date,
                "link": link,
                "source": "LinkedIn",
                "description": desc,
                "applicants": "Ver en LinkedIn"
            })
            
    except Exception as e:
        print(f"Error in LinkedIn scraper: {e}")
        
    return jobs

if __name__ == "__main__":
    import json
    res = scrape_linkedin("php", "veracruz", "presencial", 3)
    print(json.dumps(res, indent=2))
