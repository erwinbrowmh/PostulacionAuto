import os
import re
import subprocess
import tempfile
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TESSERACT_EXE = PROJECT_ROOT / "Tesseract-OCR" / "tesseract.exe"
DEFAULT_TESSDATA_DIR = PROJECT_ROOT / "Tesseract-OCR" / "tessdata"
MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


class LatexGenerationError(RuntimeError):
    """Represents a recoverable generation error during OCR or LaTeX building."""


def generate_latex_from_image(image_bytes: bytes, mime_type: str, filename: str = "") -> str:
    if not image_bytes:
        raise ValueError("La imagen está vacía.")

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("La imagen excede el tamaño máximo permitido de 15 MB.")

    if mime_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Formato de imagen no soportado. Usa PNG, JPG/JPEG o WEBP.")

    tesseract_exe = Path(os.getenv("TESSERACT_EXE", str(DEFAULT_TESSERACT_EXE)))
    tessdata_dir = Path(os.getenv("TESSDATA_PREFIX", str(DEFAULT_TESSDATA_DIR)))

    if not tesseract_exe.exists():
        raise LatexGenerationError(
            f"No se encontró tesseract.exe en '{tesseract_exe}'."
        )

    if not tessdata_dir.exists():
        raise LatexGenerationError(
            f"No se encontró la carpeta tessdata en '{tessdata_dir}'."
        )

    raw_text = _run_tesseract_ocr(
        image_bytes=image_bytes,
        filename=filename,
        tesseract_exe=tesseract_exe,
        tessdata_dir=tessdata_dir,
    )
    if not raw_text.strip():
        raise LatexGenerationError("Tesseract no pudo extraer texto de la imagen.")

    return _build_latex_document(raw_text, filename=filename)


def _run_tesseract_ocr(
    image_bytes: bytes,
    filename: str,
    tesseract_exe: Path,
    tessdata_dir: Path,
) -> str:
    suffix = Path(filename).suffix or ".png"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_image:
        tmp_image.write(image_bytes)
        temp_image_path = Path(tmp_image.name)

    env = os.environ.copy()
    env["TESSDATA_PREFIX"] = str(tessdata_dir)

    command = [
        str(tesseract_exe),
        str(temp_image_path),
        "stdout",
        "-l",
        "spa+eng",
        "--psm",
        "1",
        "-c",
        "preserve_interword_spaces=1",
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
            timeout=120,
            check=False,
        )
    finally:
        try:
            temp_image_path.unlink(missing_ok=True)
        except OSError:
            pass

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise LatexGenerationError(
            f"Error ejecutando Tesseract OCR: {stderr or 'salida vacía del proceso'}"
        )

    return _normalize_ocr_text(result.stdout)


def _normalize_ocr_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\x0c", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _build_latex_document(raw_text: str, filename: str = "") -> str:
    body = _latex_body_from_ocr(raw_text)
    title = _derive_title(filename, raw_text)
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
        "\\title{" + _escape_latex(title) + "}\n"
        "\\date{}\n"
        "\\begin{document}\n"
        "\\maketitle\n\n"
        + body
        + "\n\\end{document}\n"
    )


def _latex_body_from_ocr(raw_text: str) -> str:
    lines = [line.strip() for line in raw_text.split("\n")]
    blocks: list[str] = []
    paragraph_lines: list[str] = []
    bullet_lines: list[str] = []

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

    for line in lines:
        if not line:
            flush_paragraph()
            flush_bullets()
            continue

        if _is_bullet_line(line):
            flush_paragraph()
            bullet_lines.append(_clean_bullet_line(line))
            continue

        if _looks_like_section_heading(line):
            flush_paragraph()
            flush_bullets()
            blocks.append(f"\\section{{{_escape_latex(_clean_heading(line))}}}")
            continue

        if _looks_like_subsection_heading(line):
            flush_paragraph()
            flush_bullets()
            blocks.append(f"\\subsection{{{_escape_latex(_clean_heading(line))}}}")
            continue

        paragraph_lines.append(line)

    flush_paragraph()
    flush_bullets()

    if not blocks:
        blocks.append(_render_paragraph(raw_text.strip()))

    return "\n\n".join(blocks)


def _derive_title(filename: str, raw_text: str) -> str:
    base_name = Path(filename).stem.strip()
    if base_name:
        return base_name.replace("_", " ")

    for line in raw_text.splitlines():
        cleaned = line.strip()
        if 3 <= len(cleaned) <= 80:
            return cleaned
    return "Documento OCR"


def _is_bullet_line(line: str) -> bool:
    return bool(re.match(r"^\s*([\-*•▪‣◦]|[0-9]+[.)])\s+", line))


def _clean_bullet_line(line: str) -> str:
    return re.sub(r"^\s*([\-*•▪‣◦]|[0-9]+[.)])\s+", "", line).strip()


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
    if re.search(r"[.!?]$", clean):
        return False
    words = clean.split()
    if len(words) < 2 or len(words) > 8:
        return False
    return clean[:1].isupper() and not clean.isupper()


def _clean_heading(line: str) -> str:
    return re.sub(r"\s+", " ", line.replace(":", "")).strip()


def _render_paragraph(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return _escape_latex(text)


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
