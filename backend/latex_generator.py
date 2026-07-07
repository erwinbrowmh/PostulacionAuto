import os
import re
import tempfile
from pathlib import Path

import pypdf

from backend.ocr_utils import (
    OCRError,
    extract_pdf_text_with_ocr,
    looks_like_low_quality_text,
    normalize_ocr_text,
    ocr_image_bytes,
)

MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024
ALLOWED_INPUT_TYPES = {"image/png", "image/jpeg", "image/webp", "application/pdf"}


class LatexGenerationError(RuntimeError):
    """Represents a recoverable generation error during OCR or LaTeX building."""


def generate_latex_from_image(image_bytes: bytes, mime_type: str, filename: str = "") -> str:
    if not image_bytes:
        raise ValueError("El archivo está vacío.")

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("La imagen excede el tamaño máximo permitido de 15 MB.")

    normalized_name = (filename or "").lower()
    normalized_mime = (mime_type or "").lower()
    is_pdf = normalized_mime == "application/pdf" or normalized_name.endswith(".pdf")

    if normalized_mime not in ALLOWED_INPUT_TYPES and not is_pdf:
        raise ValueError("Formato no soportado. Usa PDF, PNG, JPG/JPEG o WEBP.")

    raw_text = _extract_source_text(
        file_bytes=image_bytes,
        filename=filename,
        is_pdf=is_pdf,
    )
    if not raw_text.strip():
        raise LatexGenerationError("No se pudo extraer texto útil del archivo.")

    return _build_latex_document(raw_text, filename=filename)


def _extract_source_text(
    file_bytes: bytes,
    filename: str,
    is_pdf: bool,
) -> str:
    if is_pdf:
        return _extract_pdf_text(file_bytes, filename)

    try:
        return ocr_image_bytes(file_bytes, filename=filename or "page.png", languages="spa+eng", psm=1)
    except OCRError as exc:
        raise LatexGenerationError(str(exc)) from exc


def _extract_pdf_text(file_bytes: bytes, filename: str) -> str:
    suffix = Path(filename).suffix or ".pdf"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_pdf:
        tmp_pdf.write(file_bytes)
        temp_pdf_path = Path(tmp_pdf.name)

    try:
        native_text = ""
        try:
            reader = pypdf.PdfReader(str(temp_pdf_path))
            for page in reader.pages[:4]:
                native_text += (page.extract_text() or "") + "\n"
        except Exception:
            native_text = ""

        try:
            ocr_text = extract_pdf_text_with_ocr(temp_pdf_path, max_pages=4)
        except OCRError as exc:
            raise LatexGenerationError(str(exc)) from exc

        if not native_text.strip():
            return normalize_ocr_text(ocr_text)
        if looks_like_low_quality_text(native_text):
            return normalize_ocr_text(ocr_text or native_text)
        return normalize_ocr_text(f"{native_text}\n\n{ocr_text}")
    finally:
        try:
            temp_pdf_path.unlink(missing_ok=True)
        except OSError:
            pass


def _build_latex_document(raw_text: str, filename: str = "") -> str:
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
