import os
import re
import requests
import base64
from pathlib import Path

class LatexGenerationError(RuntimeError):
    """Represents a recoverable generation error during OCR or LaTeX building."""


def generate_latex_from_image(image_bytes: bytes, mime_type: str, filename: str = "") -> str:
    """Genera LaTeX a partir de una imagen usando OCR.space API."""
    if not image_bytes:
        raise ValueError("El archivo está vacío.")

    # Extraer texto usando OCR.space
    raw_text = _extract_text_with_ocr_space(image_bytes, filename)
    
    if not raw_text or not raw_text.strip():
        raise LatexGenerationError("No se pudo extraer texto útil del archivo.")

    return _build_latex_document(raw_text, filename=filename)


def _extract_text_with_ocr_space(image_bytes: bytes, filename: str = "") -> str:
    """Usa la API de OCR.space para extraer texto."""
    
    # Configuración de OCR.space
    API_KEY = os.getenv("OCR_SPACE_API_KEY", "K87490647888957")  # API Key gratuita
    API_URL = "https://api.ocr.space/parse/image"
    
    # Preparar la imagen en base64
    image_base64 = base64.b64encode(image_bytes).decode('utf-8')
    
    # Determinar el tipo de archivo
    if filename.lower().endswith('.pdf'):
        filetype = 'pdf'
    else:
        filetype = 'png'  # o jpg, dependiendo
    
    # Parámetros de la solicitud
    payload = {
        'apikey': API_KEY,
        'base64Image': f'data:image/{filetype};base64,{image_base64}',
        'language': 'spa',
        'OCREngine': 2,  # 1 = OCR Engine 1, 2 = OCR Engine 2 (más preciso)
        'scale': True,
        'isTable': False,
        'detectOrientation': True,
    }
    
    try:
        response = requests.post(API_URL, data=payload, timeout=60)
        response.raise_for_status()
        
        result = response.json()
        
        if result.get('OCRExitCode') != 1:
            error_msg = result.get('ErrorMessage', 'Error desconocido en OCR.space')
            raise LatexGenerationError(f"OCR.space error: {error_msg}")
        
        # Extraer el texto de todas las páginas
        text_parts = []
        for page in result.get('ParsedResults', []):
            if page.get('ParsedText'):
                text_parts.append(page['ParsedText'])
        
        full_text = "\n\n".join(text_parts)
        
        # Limpiar el texto
        full_text = _normalize_text(full_text)
        
        if not full_text.strip():
            raise LatexGenerationError("No se detectó texto en la imagen.")
        
        return full_text
        
    except requests.exceptions.Timeout:
        raise LatexGenerationError("Tiempo de espera agotado al conectar con OCR.space.")
    except requests.exceptions.RequestException as e:
        raise LatexGenerationError(f"Error de conexión con OCR.space: {str(e)}")
    except Exception as e:
        raise LatexGenerationError(f"Error en OCR.space: {str(e)}")


def _normalize_text(text: str) -> str:
    """Normaliza el texto extraído."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _build_latex_document(raw_text: str, filename: str = "") -> str:
    """Construye un documento LaTeX a partir del texto extraído."""
    body = _latex_body_from_ocr(raw_text)
    
    return (
        "\\documentclass{article}\n"
        "\\usepackage[utf8]{inputenc}\n"
        "\\usepackage[T1]{fontenc}\n"
        "\\usepackage[spanish]{babel}\n"
        "\\usepackage{amsmath}\n"
        "\\usepackage{amssymb}\n"
        "\\usepackage{graphicx}\n"
        "\\usepackage{booktabs}\n"
        "\\usepackage{geometry}\n"
        "\\usepackage{hyperref}\n"
        "\\usepackage{parskip}\n"
        "\\geometry{margin=1in}\n"
        "\\begin{document}\n"
        + body
        + "\n\\end{document}\n"
    )


def _latex_body_from_ocr(raw_text: str) -> str:
    """Convierte el texto OCR en cuerpo LaTeX."""
    lines = [line.strip() for line in raw_text.split("\n")]
    blocks: list[str] = []
    paragraph_lines: list[str] = []
    bullet_lines: list[str] = []
    numbered_lines: list[str] = []

    def flush_paragraph() -> None:
        nonlocal paragraph_lines
        if paragraph_lines:
            paragraph = " ".join(part for part in paragraph_lines if part).strip()
            if paragraph:
                blocks.append(_render_paragraph(paragraph))
            paragraph_lines = []

    def flush_bullets() -> None:
        nonlocal bullet_lines
        if bullet_lines:
            items = "\n".join(f"\\item {_escape_latex(item)}" for item in bullet_lines if item)
            if items:
                blocks.append("\\begin{itemize}\n" + items + "\n\\end{itemize}")
            bullet_lines = []

    def flush_numbered() -> None:
        nonlocal numbered_lines
        if numbered_lines:
            items = "\n".join(f"\\item {_escape_latex(item)}" for item in numbered_lines if item)
            if items:
                blocks.append("\\begin{enumerate}\n" + items + "\n\\end{enumerate}")
            numbered_lines = []

    for line in lines:
        if not line:
            flush_paragraph()
            flush_bullets()
            flush_numbered()
            continue

        if _is_bullet_line(line):
            flush_paragraph()
            flush_numbered()
            bullet_lines.append(_clean_bullet_line(line))
            continue

        if _is_numbered_line(line):
            flush_paragraph()
            flush_bullets()
            numbered_lines.append(_clean_numbered_line(line))
            continue

        if _looks_like_section_heading(line):
            flush_paragraph()
            flush_bullets()
            flush_numbered()
            blocks.append(f"\\section{{{_escape_latex(_clean_heading(line))}}}")
            continue

        if _looks_like_subsection_heading(line):
            flush_paragraph()
            flush_bullets()
            flush_numbered()
            blocks.append(f"\\subsection{{{_escape_latex(_clean_heading(line))}}}")
            continue

        if _looks_like_label_value(line):
            flush_paragraph()
            flush_bullets()
            flush_numbered()
            label, value = _split_label_value(line)
            blocks.append(f"\\textbf{{{_escape_latex(label)}:}} {_escape_latex(value)}")
            continue

        paragraph_lines.append(line)

    flush_paragraph()
    flush_bullets()
    flush_numbered()

    if not blocks:
        blocks.append(_render_paragraph(raw_text.strip()))

    return "\n\n".join(blocks)


def _is_bullet_line(line: str) -> bool:
    return bool(re.match(r"^\s*([\-*•▪‣◦])\s+", line))


def _clean_bullet_line(line: str) -> str:
    return re.sub(r"^\s*([\-*•▪‣◦])\s+", "", line).strip()


def _is_numbered_line(line: str) -> bool:
    return bool(re.match(r"^\s*[0-9]+[.)]\s+", line))


def _clean_numbered_line(line: str) -> str:
    return re.sub(r"^\s*[0-9]+[.)]\s+", "", line).strip()


def _looks_like_section_heading(line: str) -> bool:
    clean = _clean_heading(line)
    if not (3 <= len(clean) <= 55):
        return False
    if re.search(r"[.!?]$", clean):
        return False
    alpha_count = sum(char.isalpha() for char in clean)
    return alpha_count >= 3 and (clean.isupper() or clean.istitle())


def _looks_like_subsection_heading(line: str) -> bool:
    clean = _clean_heading(line)
    if not (3 <= len(clean) <= 65):
        return False
    if re.search(r"[.!?]$", clean) and not clean.endswith(":"):
        return False
    words = clean.split()
    if len(words) < 2 or len(words) > 8:
        return False
    return clean.endswith(":") or (clean[:1].isupper() and not clean.isupper())


def _clean_heading(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace(":", "")).strip()


def _render_paragraph(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return _escape_latex(text)


def _looks_like_label_value(line: str) -> bool:
    if line.count(":") != 1:
        return False
    label, value = _split_label_value(line)
    return 1 <= len(label) <= 30 and len(value) >= 2


def _split_label_value(line: str) -> tuple[str, str]:
    label, value = line.split(":", 1)
    return label.strip(), value.strip()


def _escape_latex(text: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in text)