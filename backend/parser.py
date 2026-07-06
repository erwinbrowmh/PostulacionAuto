import os
import re
import pypdf

# Extends glossary of tech skills for dynamic ATS parsing
SKILLS_GLOSSARY = {
    "languages": [
        "PHP", "Java", "JavaScript", "JS", "TypeScript", "TS", "Python", "C#", "C++", 
        "Ruby", "Go", "Golang", "Rust", "Swift", "Kotlin", "Dart", "Flutter", 
        "React Native", "HTML", "CSS", "HTML/CSS", "Sass", "Less", "SQL", "PL/SQL"
    ],
    "backend": [
        "Laravel", "Symfony", "Yii", "Spring", "Spring Boot", "Django", "Flask", 
        "FastAPI", "Node.js", "Express", "Ruby on Rails", "Rails", "ASP.NET", ".NET",
        "REST APIs", "REST", "SOAP", "GraphQL", "WebSockets", "Stripe API", "Clip Integration", 
        "Git", "GitHub", "GitLab"
    ],
    "infrastructure": [
        "Linux", "Ubuntu", "CentOS", "Debian", "RedHat", "Unix", "cPanel", "WHM",
        "Docker", "Kubernetes", "AWS", "Amazon Web Services", "Azure", "GCP", 
        "Google Cloud", "Nginx", "Apache", "IP/LAN", "LAN/WAN", "Wi-Fi 6", "Wi-Fi", 
        "Structured Cabling", "Cableado Estructurado", "Active Directory", "DNS", "DHCP"
    ],
    "security": [
        "Ciberseguridad", "Cybersecurity", "Seguridad de la Informacion", "Pentesting", 
        "Hardening", "Risk Management", "Gestion de Riesgos", "Firewall", "IDS/IPS", 
        "OWASP", "ISO 27001", "Perimeter Security", "Seguridad Perimetral", "Data Privacy",
        "Privacidad de Datos"
    ],
    "iot": [
        "IoT", "NFC", "Smart cards", "Tarjetas inteligentes", "Arduino", "Raspberry Pi",
        "Access Control Systems", "Control de Accesos"
    ],
    "management": [
        "Scrum", "Agile", "Kanban", "Project Management", "Gestion de Proyectos", 
        "Scrum Master", "Product Owner", "SLA Management", "SLA", "Stakeholder Management",
        "KPIs", "ITIL"
    ]
}

def extract_skills_dynamically(text):
    matched_skills = {cat: [] for cat in SKILLS_GLOSSARY}
    all_flat = []
    
    text_lower = text.lower()
    
    # Normalize text accents for better matching of Spanish terms
    normalized_text = normalize_text(text_lower)
    
    for category, skills in SKILLS_GLOSSARY.items():
        for skill in skills:
            skill_norm = normalize_text(skill.lower())
            
            # Use regex for word boundaries to avoid partial matches (e.g. 'go' in 'google', 'java' in 'javascript')
            # For special characters like .NET, C++, C#, we escape them
            escaped_skill = re.escape(skill_norm)
            
            # If skill has special chars like C#, C++, .NET, we match without strict \b boundary
            if any(char in skill_norm for char in ['#', '+', '.', '/']):
                pattern = rf'{escaped_skill}'
            else:
                pattern = rf'\b{escaped_skill}\b'
                
            if re.search(pattern, normalized_text):
                matched_skills[category].append(skill)
                all_flat.append(skill)
                
    return matched_skills, list(set(all_flat))

def normalize_text(text):
    # Replaces accented characters with standard ones
    a, b = 'áéíóúüñ', 'aeiouun'
    trans = str.maketrans(a, b)
    return text.translate(trans)

def parse_cv(pdf_path):
    if not os.path.exists(pdf_path):
        return FALLBACK_PROFILE
        
    try:
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
            
        if not text.strip():
            return FALLBACK_PROFILE
            
        profile = {}
        
        # 1. Parse Name
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        name = "Candidato Extraído"
        for line in lines[:4]: # Check first 4 lines for a candidate name
            # A valid name shouldn't have email symbols, slash path indicators, numbers, or be too long
            if '@' not in line and '/' not in line and not re.search(r'\d', line) and 5 < len(line) < 40:
                name = line
                break
        profile["name"] = name
        
        # 2. Parse Email
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', text)
        profile["email"] = email_match.group(0) if email_match else "No especificado"
        
        # 3. Parse Phone
        # Match standard phone numbers (e.g. 229-232-4707 or +52 229 232 4707)
        phone_match = re.search(r'(\+?\d{1,3}[\s-]?)?\(?\d{2,3}\)?[\s-]?\d{3,4}[\s-]?\d{4}', text)
        profile["phone"] = phone_match.group(0).strip() if phone_match else "No especificado"
        
        # 4. Parse Location
        location = "México"
        # Match cities like Veracruz, Puebla, CDMX, Monterrey, Guadalajara
        cities = ["Veracruz", "Puebla", "Monterrey", "Guadalajara", "Queretaro", "Merida", "Cancun", "Xalapa", "Orizaba", "Boca del Rio"]
        for city in cities:
            if re.search(rf'\b{city}\b', text, re.IGNORECASE):
                location = f"{city}, México"
                break
        profile["location"] = location
        
        # 5. Extract Title
        # Look for titles in first 5 lines
        title = "Especialista TI"
        for line in lines[1:5]:
            if any(keyword in line.lower() for keyword in ["ingeniero", "developer", "desarrollador", "programador", "analista", "consultor", "administrator", "soporte", "systems"]):
                title = line
                break
        profile["title"] = title
        
        profile["linkedin"] = "linkedin.com"
        # Look for linkedin link
        li_match = re.search(r'linkedin\.com/in/[\w\.-]+', text, re.IGNORECASE)
        if li_match:
            profile["linkedin"] = li_match.group(0)
            
        profile["github"] = "github.com"
        # Look for github link
        gh_match = re.search(r'github\.com/[\w\.-]+', text, re.IGNORECASE)
        if gh_match:
            profile["github"] = gh_match.group(0)
            
        # 6. Extract Skills Dynamically (ATS feature)
        skills, all_skills_flat = extract_skills_dynamically(text)
        profile["skills"] = skills
        profile["all_skills_flat"] = all_skills_flat
        
        return profile
    except Exception as e:
        print(f"Error in dynamic parsing: {e}")
        return FALLBACK_PROFILE

# Fallback definition for backwards compatibility
FALLBACK_PROFILE = {
    "name": "Erwin Brow Martínez Herrera",
    "title": "Ingeniero en Sistemas Computacionales / Full Stack Developer",
    "email": "erwinbrowmh@gmail.com",
    "phone": "229-232-4707",
    "location": "Veracruz, México",
    "linkedin": "linkedin.com/in/erwin-brow-martinez-herrera",
    "github": "github.com/erwinbrowmh",
    "skills": {
        "languages": ["PHP", "Java", "JavaScript", "Flutter", "SQL", "HTML/CSS", "HTML", "CSS"],
        "backend": ["REST APIs", "Stripe API", "Clip Integration", "MySQL", "Git", "APIs"],
        "infrastructure": ["Linux Servers", "cPanel", "IP/LAN Networks", "Wi-Fi 6", "Structured Cabling"],
        "security": ["Perimeter Security", "Hardening", "Risk Management", "Data Privacy", "Cybersecurity", "Ciberseguridad"],
        "iot": ["NFC", "Smart cards", "Access Control Systems", "IoT"],
        "management": ["Scrum", "Kanban", "SLA Management", "Stakeholder Management", "Project Management"]
    },
    "all_skills_flat": [
        "PHP", "Java", "JavaScript", "Flutter", "SQL", "HTML", "CSS", "HTML/CSS",
        "REST APIs", "Stripe API", "Clip Integration", "MySQL", "Git", "APIs",
        "Linux Servers", "cPanel", "IP/LAN Networks", "Wi-Fi 6", "Structured Cabling",
        "Perimeter Security", "Hardening", "Risk Management", "Data Privacy", "Cybersecurity", "Ciberseguridad",
        "NFC", "Smart cards", "Access Control Systems", "IoT",
        "Scrum", "Kanban", "SLA Management", "Stakeholder Management", "Project Management"
    ]
}

if __name__ == "__main__":
    import json
    path = r"c:\Users\siste\OneDrive\Documentos\PostulacionAuto\cv\CV_Erwin_Brow.pdf"
    res = parse_cv(path)
    print(json.dumps(res, indent=2))
