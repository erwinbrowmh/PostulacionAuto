import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

def clean_slug(text):
    # Convert to lowercase, replace spaces and non-alphanumeric chars with hyphens
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s]+', '-', text)
    return text

def scrape_computrabajo(keyword, location="veracruz", max_results=20):
    keyword_slug = clean_slug(keyword)
    
    if location.lower() == "remoto":
        url = f"https://mx.computrabajo.com/trabajo-de-{keyword_slug}-remoto"
    else:
        # Defaults to veracruz city
        url = f"https://mx.computrabajo.com/trabajo-de-{keyword_slug}-en-veracruz"
        
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    jobs = []
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Computrabajo scraper returned status {response.status_code} for {url}")
            return jobs
            
        soup = BeautifulSoup(response.text, 'html.parser')
        articles = soup.find_all('article')
        
        for art in articles:
            if len(jobs) >= max_results:
                break
                
            job_id = art.get('data-id') or art.get('id')
            if not job_id:
                continue
                
            h2 = art.find('h2')
            if not h2:
                continue
                
            a_title = h2.find('a', class_='js-o-link') or h2.find('a')
            if not a_title:
                continue
                
            title = a_title.text.strip()
            # Clean title (remove "Postulado" / "Vista" tags if they are in the text)
            title = re.sub(r'\s+Postulado\s+Vista', '', title)
            title = re.sub(r'\s+Postulado', '', title)
            title = re.sub(r'\s+Vista', '', title)
            title = title.strip()
            
            href = a_title.get('href')
            if not href.startswith('http'):
                href = f"https://mx.computrabajo.com{href}"
                
            # Company
            company = "Confidencial"
            comp_a = art.find('a', href=lambda x: x and ('computrabajo.com' in x or 'modelo-especializado' in x))
            if not comp_a:
                # Check for company URL marker
                comp_a = art.find('a', attrs={"offer-grid-article-company-url": ""})
            if comp_a:
                company = comp_a.text.strip()
            else:
                # Fallback to the dFlex paragraph
                comp_p = art.find('p', class_='dFlex')
                if comp_p:
                    company = comp_p.text.strip()
                    
            # Location
            loc_text = "Veracruz"
            # Find the paragraph that contains the location. 
            # In Computrabajo, it is a <p class="fs16 fc_base mt5"> without an 'a' tag and typically contains a span.
            p_tags = art.find_all('p', class_='fc_base')
            for p in p_tags:
                if not p.find('a') and 'mt5' in (p.get('class') or []):
                    # Clean up rating numbers if they somehow leaked in
                    txt = p.text.strip()
                    if txt and not any(kw in txt for kw in ["Postulado", "Vista"]):
                        loc_text = txt
                        break
            
            # If loc_text is still Veracruz, try to look at all spans in mt5
            if loc_text == "Veracruz":
                for span in art.find_all('span'):
                    parent = span.parent
                    if parent and parent.name == 'p' and 'mt5' in (parent.get('class') or []):
                        if not parent.find('a') and not span.get('class'):
                            loc_text = span.text.strip()
                            break
                        
            # Salary
            salary = "No especificado"
            salary_span = art.find('span', class_='icon i_salary')
            if salary_span and salary_span.parent:
                salary = salary_span.parent.text.strip()
            else:
                # search for $ sign in text
                for s in art.find_all('span'):
                    if '$' in s.text:
                        salary = s.text.strip()
                        break
                        
            # Date
            date_p = art.find('p', class_='fc_aux')
            date = date_p.text.strip() if date_p else "Reciente"
            
            # Simple snippet/description
            # Some cards have description text
            desc_div = art.find('p', class_='fc_desc') or art.find('div', class_='box_show_offer')
            desc = desc_div.text.strip() if desc_div else "Ver detalles en la oferta original."
            if "Oferta oculta" in desc or "Mostrar oferta" in desc:
                desc = "Haz clic en el enlace para ver los requisitos completos del puesto."
                
            jobs.append({
                "id": f"computrabajo_{job_id}",
                "title": title,
                "company": company,
                "location": loc_text,
                "salary": salary,
                "date": date,
                "link": href,
                "source": "Computrabajo",
                "description": desc,
                "applicants": "No disponible (Computrabajo)"
            })
            
    except Exception as e:
        print(f"Error in Computrabajo scraper: {e}")
        
    return jobs

if __name__ == "__main__":
    import json
    res = scrape_computrabajo("php", "veracruz", 3)
    print(json.dumps(res, indent=2))
