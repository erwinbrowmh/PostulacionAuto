import requests
from bs4 import BeautifulSoup
import re
import urllib.parse

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


def _clean_text(text):
    return re.sub(r'\s+', ' ', text or '').strip()


def scrape_talentcom(keyword, location="veracruz", max_results=20):
    """Scrapes talent.com for aggregated job listings across many portals."""
    keyword_enc = urllib.parse.quote(keyword)

    if location.lower() in ("remoto", "remote", "remoto (méxico)"):
        loc_enc = urllib.parse.quote("remote")
        url = f"https://mx.talent.com/jobs?k={keyword_enc}&l=remote"
    else:
        city = location.split(',')[0].strip()
        loc_enc = urllib.parse.quote(city)
        url = f"https://mx.talent.com/jobs?k={keyword_enc}&l={loc_enc}"

    jobs = []
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        if response.status_code != 200:
            print(f"[Talent.com] Status {response.status_code} for {url}")
            return jobs

        soup = BeautifulSoup(response.text, 'html.parser')

        # Talent.com card selectors
        cards = soup.select('div.card') or soup.select('[class*="jobCard"]') or soup.select('article') or soup.select('[data-job-id]')

        for card in cards:
            if len(jobs) >= max_results:
                break

            # Title
            title_tag = card.find(['h2', 'h3'], class_=lambda c: c and ('title' in c.lower() or 'job' in c.lower()))
            if not title_tag:
                title_tag = card.find('a', class_=lambda c: c and 'title' in c.lower())
            if not title_tag:
                title_tag = card.find('h2') or card.find('h3') or card.find('a')
            if not title_tag:
                continue

            title = _clean_text(title_tag.get_text())
            if not title or len(title) < 4:
                continue

            # Link
            href_el = title_tag if title_tag.name == 'a' else title_tag.find('a')
            if not href_el:
                href_el = card.find('a')
            href = href_el.get('href', '') if href_el else ''
            if not href:
                continue
            if not href.startswith('http'):
                href = f"https://mx.talent.com{href}"

            # Company
            company = "Confidencial"
            for sel in ['[class*="company"]', '[class*="employer"]', 'span.company', 'div.company']:
                el = card.select_one(sel)
                if el:
                    company = _clean_text(el.get_text())
                    break

            # Location
            loc_text = location.title()
            for sel in ['[class*="location"]', '[class*="city"]', 'span.location']:
                el = card.select_one(sel)
                if el:
                    loc_text = _clean_text(el.get_text())
                    break

            # Salary
            salary = "No especificado"
            for sel in ['[class*="salary"]', '[class*="pay"]', 'span.salary']:
                el = card.select_one(sel)
                if el:
                    txt = _clean_text(el.get_text())
                    if '$' in txt or 'MXN' in txt or 'USD' in txt or 'k' in txt.lower():
                        salary = txt
                        break

            # Date
            date = "Reciente"
            time_el = card.find('time') or card.select_one('[class*="date"]') or card.select_one('[class*="ago"]')
            if time_el:
                date = _clean_text(time_el.get_text())

            # Description
            desc = "Ver vacante completa en Talent.com"
            for sel in ['[class*="description"]', 'p.snippet', 'div.snippet']:
                el = card.select_one(sel)
                if el:
                    desc = _clean_text(el.get_text())[:300]
                    break

            # Source site detection
            source = "Talent.com"
            source_el = card.select_one('[class*="source"]') or card.select_one('[class*="portal"]')
            if source_el:
                source_txt = _clean_text(source_el.get_text())
                if source_txt:
                    source = f"Talent ({source_txt})"

            job_id = re.search(r'(\d{5,})', href)
            job_id = job_id.group(1) if job_id else f"tc_{len(jobs)}"

            jobs.append({
                "id": f"talentcom_{job_id}",
                "title": title,
                "company": company,
                "location": loc_text,
                "salary": salary,
                "date": date,
                "link": href,
                "source": source,
                "description": desc,
                "applicants": "Ver en Talent.com",
            })

    except Exception as e:
        print(f"[Talent.com ERROR] {e}")

    return jobs


if __name__ == "__main__":
    import json
    res = scrape_talentcom("php", "veracruz", 3)
    print(json.dumps(res, indent=2, ensure_ascii=False))
