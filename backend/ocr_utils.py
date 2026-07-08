import os
import re
import subprocess
import tempfile
from pathlib import Path

import fitz


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TESSERACT_EXE = PROJECT_ROOT / "Tesseract-OCR" / "tesseract.exe"
DEFAULT_TESSDATA_DIR = PROJECT_ROOT / "Tesseract-OCR" / "tessdata"


class OCRError(RuntimeError):
    """Raised when OCR tooling is unavailable or fails."""


def get_tesseract_config() -> tuple[Path, Path]:
    tesseract_exe = Path(os.getenv("TESSERACT_EXE", str(DEFAULT_TESSERACT_EXE)))
    tessdata_dir = Path(os.getenv("TESSDATA_PREFIX", str(DEFAULT_TESSDATA_DIR)))

    if not tesseract_exe.exists():
        raise OCRError(f"No se encontró tesseract.exe en '{tesseract_exe}'.")
    if not tessdata_dir.exists():
        raise OCRError(f"No se encontró la carpeta tessdata en '{tessdata_dir}'.")

    return tesseract_exe, tessdata_dir


def ocr_image_bytes(
    image_bytes: bytes,
    filename: str = "page.png",
    languages: str = "spa+eng",
    psm: int = 1,
) -> str:
    tesseract_exe, tessdata_dir = get_tesseract_config()
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
        languages,
        "--psm",
        str(psm),
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
            timeout=180,
            check=False,
        )
    finally:
        try:
            temp_image_path.unlink(missing_ok=True)
        except OSError:
            pass

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise OCRError(f"Error ejecutando Tesseract OCR: {stderr or 'salida vacía del proceso'}")

    return normalize_ocr_text(result.stdout)


def render_pdf_pages_to_png_bytes(
    pdf_path: str | Path,
    max_pages: int | None = 3,
    zoom: float = 2.2,
) -> list[tuple[int, bytes]]:
    pdf_path = Path(pdf_path)
    document = fitz.open(pdf_path)
    pages: list[tuple[int, bytes]] = []

    try:
        matrix = fitz.Matrix(zoom, zoom)
        page_limit = len(document) if max_pages is None else min(len(document), max_pages)
        for page_index in range(page_limit):
            page = document.load_page(page_index)
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            pages.append((page_index + 1, pixmap.tobytes("png")))
    finally:
        document.close()

    return pages


def extract_pdf_text_with_ocr(
    pdf_path: str | Path,
    max_pages: int | None = 3,
    languages: str = "spa+eng",
) -> str:
    ocr_chunks: list[str] = []
    for page_number, image_bytes in render_pdf_pages_to_png_bytes(pdf_path, max_pages=max_pages):
        page_text = ocr_image_bytes(
            image_bytes,
            filename=f"page_{page_number}.png",
            languages=languages,
            psm=1,
        )
        if page_text.strip():
            ocr_chunks.append(f"[Página {page_number}]\n{page_text.strip()}")
    return normalize_ocr_text("\n\n".join(ocr_chunks))


def normalize_ocr_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x0c", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def looks_like_low_quality_text(text: str) -> bool:
    cleaned = normalize_ocr_text(text or "")
    if len(cleaned) < 350:
        return True

    alpha_chars = sum(ch.isalpha() for ch in cleaned)
    if alpha_chars < 180:
        return True

    weird_ratio = cleaned.count("�") + cleaned.count("|") + cleaned.count("¦")
    if weird_ratio >= 12:
        return True

    long_unbroken = re.findall(r"\S{45,}", cleaned)
    return len(long_unbroken) >= 4
