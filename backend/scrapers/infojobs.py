import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
}


def _clean_text(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def scrape_infojobs(keyword, location="veracruz", max_results=20):
    """Scrapes Infojobs.com.mx for job listings."""
    keyword_enc = urllib.parse.quote(keyword)

    if location.lower() == "remoto":
        url = f"https://www.infojobs.com.mx/ofertas-trabajo/{keyword_enc}/teletrabajo"
    else:
        city = location.split(',')[0].strip()
        url = f"https://www.infojobs.com.mx/ofertas-trabajo/{keyword_enc}/{urllib.parse.quote(city)}"

    jobs = []
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code != 200:
            print(f"[Infojobs] Status {response.status_code} for {url}")
            return jobs

        soup = BeautifulSoup(response.text, 'html.parser')

        # Infojobs card selectors — try multiple possible structures
        cards = soup.select('li.offer-item') or soup.select('div.offer') or soup.select('[class*="OfferCard"]') or soup.select('article.job')

        for card in cards:
            if len(jobs) >= max_results:
                break

            # Title link
            title_tag = card.find('a', class_=lambda c: c and ('title' in c.lower() or 'job' in c.lower())) or card.find('h2') or card.find('h3')
            if not title_tag:
                continue

            title = _clean_text(title_tag.get_text())
            href = title_tag.get('href') or (title_tag.find('a') and title_tag.find('a').get('href'))
            if not href:
                continue
            if not href.startswith('http'):
                href = f"https://www.infojobs.com.mx{href}"

            # Company
            company = "Confidencial"
            for sel in ['span.company', 'a.company', '[class*="company"]', '[class*="empresa"]']:
                el = card.select_one(sel)
                if el:
                    company = _clean_text(el.get_text())
                    break

            # Location
            loc_text = location.title()
            for sel in ['span.location', 'li.location', '[class*="location"]', '[class*="ubicaci"]']:
                el = card.select_one(sel)
                if el:
                    loc_text = _clean_text(el.get_text())
                    break

            # Salary
            salary = "No especificado"
            for sel in ['span.salary', 'li.salary', '[class*="salary"]', '[class*="salario"]']:
                el = card.select_one(sel)
                if el:
                    txt = _clean_text(el.get_text())
                    if txt:
                        salary = txt
                    break

            # Date
            date = "Reciente"
            for sel in ['span.date', 'time', '[class*="date"]', '[class*="fecha"]']:
                el = card.select_one(sel)
                if el:
                    date = _clean_text(el.get_text())
                    break

            # Description snippet
            desc = "Ver detalles completos en la oferta original."
            for sel in ['div.description', 'p.description', '[class*="description"]', '[class*="descripci"]']:
                el = card.select_one(sel)
                if el:
                    desc = _clean_text(el.get_text())[:300]
                    break

            job_id = re.search(r'(\d{5,})', href)
            job_id = job_id.group(1) if job_id else f"ij_{len(jobs)}"

            jobs.append({
                "id": f"infojobs_{job_id}",
                "title": title,
                "company": company,
                "location": loc_text,
                "salary": salary,
                "date": date,
                "link": href,
                "source": "Infojobs",
                "description": desc,
                "applicants": "Ver en Infojobs",
            })

    except Exception as e:
        print(f"[Infojobs ERROR] {e}")

    return jobs


if __name__ == "__main__":
    import json
    res = scrape_infojobs("php", "veracruz", 3)
    print(json.dumps(res, indent=2, ensure_ascii=False))
