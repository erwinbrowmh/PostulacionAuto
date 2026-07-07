import requests
from bs4 import BeautifulSoup
import re

def clean_slug(text):
    # Convert to lowercase, replace spaces and non-alphanumeric chars with hyphens
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s]+', '-', text)
    return text

def scrape_occ(keyword, location="veracruz", modality="any", max_results=20):
    keyword_slug = clean_slug(keyword)
    
    if modality == "remoto":
        url = f"https://www.occ.com.mx/empleos/de-{keyword_slug}/tipo-home-office-remoto/"
    else:
        city_slug = clean_slug(location or "mexico")
        url = f"https://www.occ.com.mx/empleos/de-{keyword_slug}/en-{city_slug}/"
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    jobs = []
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"OCC scraper returned status {response.status_code} for {url}")
            return jobs
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Find all job cards. In OCC they have class "card-job-offer"
        cards = soup.find_all('div', class_=lambda x: x and 'card-job-offer' in x)
        
        # Fallback: if no class "card-job-offer" (maybe they changed class slightly or it's a different container)
        if not cards:
            # Look for divs with data-id or id starting with jobcard
            cards = soup.find_all('div', id=lambda x: x and x.startswith('jobcard-'))
            
        for card in cards:
            if len(jobs) >= max_results:
                break
                
            job_id = card.get('data-id')
            if not job_id and card.get('id'):
                # Extract id from jobcard-12345
                match = re.search(r'\d+', card.get('id'))
                if match:
                    job_id = match.group(0)
                    
            if not job_id:
                continue
                
            # Job Title
            h2 = card.find('h2')
            if not h2:
                continue
            title = h2.text.strip()
            
            # Reconstruct Link
            link = f"https://www.occ.com.mx/empleo/oferta/{job_id}"
            
            # Company
            company = "Confidencial"
            comp_a = card.find('a', href=lambda x: x and 'bolsa-de-trabajo-' in x)
            if comp_a:
                company = comp_a.text.strip()
                
            # Location
            loc_text = "Veracruz"
            loc_div = card.find('div', class_='no-alter-loc-text')
            if loc_div:
                loc_text = loc_div.text.strip()
            else:
                # Fallback: check spans inside col-span-10
                col10 = card.find('div', class_='col-span-10')
                if col10:
                    paragraphs = col10.find_all(['p', 'span'])
                    for p in paragraphs:
                        if not p.find('a') and p.text.strip() and p.text.strip() != company:
                            loc_text = p.text.strip()
                            break
                            
            # Salary
            salary = "No especificado"
            # Look for a span or div containing $ or Mensual in the card, excluding company and location
            # Usually the salary is a span directly under the card container
            spans = card.find_all('span')
            for s in spans:
                if '$' in s.text or 'Mensual' in s.text or 'Quincenal' in s.text:
                    if s.text.strip() != company and s.text.strip() != loc_text:
                        salary = s.text.strip()
                        break
                        
            # Date
            date = "Reciente"
            # Look for span with date (e.g. Hace X días)
            for s in spans:
                text = s.text.strip()
                if 'Hace' in text or 'Hoy' in text or 'Ayer' in text:
                    date = text
                    break
                    
            jobs.append({
                "id": f"occ_{job_id}",
                "title": title,
                "company": company,
                "location": loc_text,
                "salary": salary,
                "date": date,
                "link": link,
                "source": "OCC Mundial",
                "description": "Ver requisitos y detalles completos en la oferta original.",
                "applicants": "No disponible (OCC)"
            })
            
    except Exception as e:
        print(f"Error in OCC scraper: {e}")
        
    return jobs

if __name__ == "__main__":
    import json
    res = scrape_occ("php", "veracruz", "remoto", 3)
    print(json.dumps(res, indent=2))
