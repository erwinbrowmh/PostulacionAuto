import requests
import re
import concurrent.futures

COMPANY_CACHE = {}

def get_company_name(company_id):
    if company_id in COMPANY_CACHE:
        return COMPANY_CACHE[company_id]
        
    url = f"https://www.getonbrd.com/api/v0/companies/{company_id}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            name = resp.json().get('data', {}).get('attributes', {}).get('name', 'Confidencial')
            COMPANY_CACHE[company_id] = name
            return name
    except Exception as e:
        print(f"Error fetching company {company_id}: {e}")
        
    return "Confidencial"

def scrape_getonbrd(keyword, location="veracruz", max_results=20):
    # Getonbrd is primarily a tech portal
    # Search URL: https://www.getonbrd.com/api/v0/search/jobs?query=keyword
    url = f"https://www.getonbrd.com/api/v0/search/jobs?query={keyword}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    jobs = []
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            print(f"Getonbrd API returned status {resp.status_code}")
            return jobs
            
        data = resp.json()
        raw_jobs = data.get('data', [])
        
        # We will filter by location in memory because Getonbrd serves global jobs
        filtered_raw_jobs = []
        for rj in raw_jobs:
            attrs = rj.get('attributes', {})
            is_remote = attrs.get('remote', False)
            remote_modality = attrs.get('remote_modality', '')
            
            # Location matching
            match = False
            if location.lower() == "remoto":
                if is_remote or remote_modality in ['fully_remote', 'hybrid_remote']:
                    match = True
            else:
                # Veracruz or similar
                # Check description or location fields
                desc = attrs.get('description', '').lower()
                functions = attrs.get('functions', '').lower()
                desirable = attrs.get('desirable', '').lower()
                title = attrs.get('title', '').lower()
                
                # Check if Veracruz is mentioned anywhere
                if 'veracruz' in desc or 'veracruz' in title or 'veracruz' in functions or 'veracruz' in desirable:
                    match = True
                # Or check countries/regions if we want, but Veracruz is very specific
                
            if match:
                filtered_raw_jobs.append(rj)
                if len(filtered_raw_jobs) >= max_results:
                    break
                    
        # Now fetch company names in parallel to make it extremely fast!
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            company_ids = []
            for rj in filtered_raw_jobs:
                c_id = rj.get('attributes', {}).get('company', {}).get('data', {}).get('id')
                company_ids.append(c_id)
                
            company_names = list(executor.map(get_company_name, company_ids))
            
        for i, rj in enumerate(filtered_raw_jobs):
            attrs = rj.get('attributes', {})
            job_id = rj.get('id')
            title = attrs.get('title')
            link = rj.get('links', {}).get('public_url', f"https://www.getonbrd.com/jobs/{job_id}")
            
            # Format salary
            min_sal = attrs.get('min_salary')
            max_sal = attrs.get('max_salary')
            salary = "Ver en portal"
            if min_sal and max_sal:
                salary = f"${min_sal} - ${max_sal} USD"
            elif min_sal:
                salary = f"Desde ${min_sal} USD"
                
            # Date formatting (unix timestamp)
            pub_at = attrs.get('published_at')
            date_str = "Reciente"
            if pub_at:
                import datetime
                dt = datetime.datetime.fromtimestamp(pub_at)
                # calculate days ago
                days_ago = (datetime.datetime.now() - dt).days
                if days_ago == 0:
                    date_str = "Hoy"
                elif days_ago == 1:
                    date_str = "Ayer"
                else:
                    date_str = f"Hace {days_ago} días"
                    
            # Description (clean HTML tags)
            desc_html = attrs.get('description', '') + "\n" + attrs.get('functions', '')
            desc_clean = re.sub(r'<[^>]*>', ' ', desc_html)
            desc_clean = re.sub(r'\s+', ' ', desc_clean).strip()
            if len(desc_clean) > 250:
                desc_clean = desc_clean[:250] + "..."
                
            jobs.append({
                "id": f"getonbrd_{job_id}",
                "title": title,
                "company": company_names[i],
                "location": "Remoto" if location.lower() == "remoto" else "Veracruz, México",
                "salary": salary,
                "date": date_str,
                "link": link,
                "source": "Get on Board",
                "description": desc_clean,
                "applicants": f"{attrs.get('applications_count', 0)} postulantes"
            })
            
    except Exception as e:
        print(f"Error in Getonbrd scraper: {e}")
        
    return jobs

if __name__ == "__main__":
    import json
    # Let's search PHP remote jobs on Getonbrd
    res = scrape_getonbrd("php", "remoto", 3)
    print(json.dumps(res, indent=2))
