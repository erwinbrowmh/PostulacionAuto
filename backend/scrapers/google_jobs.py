import requests
from bs4 import BeautifulSoup
import urllib.parse
import re

def scrape_google_jobs(keyword, location="veracruz", max_results=10):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
    }
    
    # Construct an advanced search query to find job postings on major portals or company websites
    site_filter = "site:linkedin.com/jobs OR site:indeed.com OR site:glassdoor.com OR site:occ.com.mx OR site:computrabajo.com OR site:empleo.gob.mx OR site:monster.com"
    
    if location.lower() == "remoto":
        query = f'"{keyword}" "remoto" ({site_filter})'
    else:
        query = f'"{keyword}" "{location}" ({site_filter})'
        
    encoded_query = urllib.parse.quote(query)
    url = f"https://www.google.com/search?q={encoded_query}"
    
    jobs = []
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Google Search scraper returned status {response.status_code}")
            return jobs
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Google search results usually have class 'g'
        search_results = soup.find_all('div', class_='g')
        
        for idx, result in enumerate(search_results):
            if len(jobs) >= max_results:
                break
                
            # Find the link
            a_tag = result.find('a')
            if not a_tag:
                continue
            href = a_tag.get('href')
            if not href or not href.startswith('http') or 'google.com' in href:
                continue
                
            # Find the title (usually in an h3 tag)
            h3_tag = result.find('h3')
            title_text = h3_tag.text.strip() if h3_tag else "Oferta de Empleo"
            
            # Clean title: often google titles end with " - Indeed", " - LinkedIn", etc.
            title_clean = re.sub(r'\s+-\s+.*$', '', title_text)
            
            # Find the snippet/description
            # Google snippets usually are in divs with class 'VwiC3b' or similar text elements
            snippet_div = result.find('div', class_=lambda x: x and ('VwiC3b' in x or 'aCOpRe' in x))
            snippet = snippet_div.text.strip() if snippet_div else "Ver descripción y requisitos en el sitio original."
            
            # Extract source name from URL
            source = "Web"
            domain_match = re.search(r'https?://(?:www\.)?([^/]+)', href)
            if domain_match:
                domain = domain_match.group(1).lower()
                if 'linkedin' in domain:
                    source = "LinkedIn"
                elif 'indeed' in domain:
                    source = "Indeed"
                elif 'glassdoor' in domain:
                    source = "Glassdoor"
                elif 'occ' in domain:
                    source = "OCC Mundial"
                elif 'computrabajo' in domain:
                    source = "Computrabajo"
                elif 'empleo.gob' in domain:
                    source = "Bolsa de Empleo Gob"
                else:
                    # e.g. "tecnoempleo.com" -> "Tecnoempleo"
                    source = domain.split('.')[0].capitalize()
                    
            # Try to guess company name from title or snippet
            company = "Confidencial"
            # Title might have: "Job Title - Company Name"
            if " en " in title_text:
                parts = title_text.split(" en ")
                if len(parts) > 1:
                    # "Desarrollador PHP en Veracruz - Softtek" -> parts[1] is "Veracruz - Softtek"
                    comp_parts = parts[1].split(" - ")
                    if len(comp_parts) > 1:
                        company = comp_parts[1].strip()
                    else:
                        company = comp_parts[0].strip()
            elif " - " in title_text:
                parts = title_text.split(" - ")
                # Check if second part is not a job board name
                possible_company = parts[1].strip()
                if possible_company.lower() not in ["indeed", "linkedin", "occ", "computrabajo", "glassdoor"]:
                    company = possible_company
                    
            # Guess salary if mentioned in snippet
            salary = "Ver en portal"
            salary_match = re.search(r'\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s?-\s?\$\s?\d{1,3}(?:,\d{3})*)?', snippet)
            if salary_match:
                salary = salary_match.group(0)
                if "mensual" in snippet.lower() or "mes" in snippet.lower():
                    salary += " (Mensual)"
                    
            # Guess date posted
            date = "Reciente"
            date_match = re.search(r'hace\s+\d+\s+(?:días|dia|semanas|semana|horas|hora)', snippet, re.IGNORECASE)
            if date_match:
                date = date_match.group(0).capitalize()
                
            jobs.append({
                "id": f"google_{idx}_{urllib.parse.urlparse(href).netloc.replace('.', '_')}",
                "title": title_clean,
                "company": company,
                "location": location.capitalize() if location.lower() == "remoto" else f"{location.capitalize()}, Veracruz",
                "salary": salary,
                "date": date,
                "link": href,
                "source": source,
                "description": snippet,
                "applicants": "No disponible (Google)"
            })
            
    except Exception as e:
        print(f"Error in Google Jobs scraper: {e}")
        
    return jobs

if __name__ == "__main__":
    import json
    res = scrape_google_jobs("flutter", "veracruz", 3)
    print(json.dumps(res, indent=2))
