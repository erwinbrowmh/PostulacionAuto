# Plan: OCR Render Fallback

## Resumen
- Objetivo: eliminar los errores de arranque y de logs causados por la referencia fija a `Tesseract-OCR/tesseract.exe` en producción, sin perder OCR real en Render cuando la dependencia esté instalada.
- Resultado esperado:
  - En Windows local, el OCR sigue funcionando con la instalación local existente.
  - En Render/Linux, la app deja de registrar errores por buscar `tesseract.exe` en una ruta Windows.
  - Si Render tiene Tesseract instalado, el OCR funciona.
  - Si Render no tiene Tesseract disponible, el sistema degrada sin ruido y usa solo el texto nativo del PDF.

## Análisis del Estado Actual
- `backend/ocr_utils.py`
  - Define `DEFAULT_TESSERACT_EXE = PROJECT_ROOT / "Tesseract-OCR" / "tesseract.exe"`.
  - Define `DEFAULT_TESSDATA_DIR = PROJECT_ROOT / "Tesseract-OCR" / "tessdata"`.
  - `get_tesseract_config()` falla si no existen esas rutas.
  - La implementación actual es válida para Windows local, pero no para Linux/Render.
- `backend/parser.py`
  - `parse_cv()` siempre intenta OCR con `extract_pdf_text_with_ocr(pdf_path, max_pages=None)`, incluso cuando el PDF ya tiene texto nativo.
  - Cuando OCR falla, imprime `Error in PDF OCR fallback: ...`, que es justo el error visible en Render.
  - Como `app.py` ejecuta `CURRENT_PROFILE = parse_cv(DEFAULT_PDF_PATH)` al importar, ese intento ocurre durante el boot del servicio.
- `app.py`
  - La inicialización del perfil por defecto dispara parsing en arranque.
  - No es el origen del bug, pero sí hace visible el problema desde el arranque.
- `render.yaml`
  - Instala solo dependencias Python con `pip install -r requirements.txt`.
  - No instala paquetes del sistema para Tesseract en Render.
- Alcance confirmado por exploración:
  - El flujo local OCR depende solo de `backend/ocr_utils.py` y `backend/parser.py`.
  - `backend/latex_generator.py` no usa este OCR local; usa OCR.space y queda fuera de este cambio.

## Decisiones y Supuestos
- Decisión: soportar ambos escenarios solicitados:
  - OCR real en Render cuando Tesseract esté disponible.
  - degradación silenciosa cuando no esté disponible.
- Decisión: no eliminar el soporte actual de Windows local.
- Decisión: no tocar el flujo LaTeX/OCR.space en este cambio.
- Decisión: priorizar corrección del boot y del parsing del perfil por defecto, porque hoy ese flujo genera el error en deploy.
- Supuesto razonable: Render permitirá instalar Tesseract mediante paquetes Linux estándar en `buildCommand`; si eso falla en el entorno real, la degradación limpia seguirá cubriendo el caso.

## Cambios Propuestos

### 1. `backend/ocr_utils.py`
- Qué cambiar:
  - Reemplazar la configuración fija de Tesseract por una detección multiplataforma.
  - Añadir helpers separados para:
    - resolver ejecutable OCR (`env` -> ruta local Windows -> `PATH` del sistema),
    - resolver `tessdata` (`env` -> carpeta local Windows -> rutas comunes Linux).
  - Añadir una comprobación explícita de disponibilidad, reutilizable por el parser.
- Cómo:
  - Mantener prioridad de variables de entorno si existen.
  - En Windows:
    - seguir aceptando `PROJECT_ROOT/Tesseract-OCR/tesseract.exe`,
    - seguir aceptando `PROJECT_ROOT/Tesseract-OCR/tessdata`.
  - En Linux/Render:
    - buscar `tesseract` en `PATH`,
    - buscar `tessdata` en rutas típicas Linux como:
      - `/usr/share/tesseract-ocr/5/tessdata`
      - `/usr/share/tesseract-ocr/4.00/tessdata`
      - `/usr/share/tessdata`
  - Exponer una función tipo `get_ocr_runtime()` o `is_ocr_available()` para que el parser pueda decidir si intentar OCR.
- Por qué:
  - Elimina la referencia rígida a una ruta Windows en producción.
  - Permite que Render use el binario Linux instalado por sistema sin configuración manual extra.

### 2. `backend/parser.py`
- Qué cambiar:
  - Cambiar la secuencia de `parse_cv()` para no intentar OCR siempre.
  - OCR debe ejecutarse solo cuando realmente haga falta:
    - si no hay texto nativo, o
    - si el texto nativo existe pero es de mala calidad según `looks_like_low_quality_text(...)`.
  - Si OCR no está disponible, no imprimir un error ruidoso de arranque.
- Cómo:
  - Leer primero el texto nativo del PDF.
  - Evaluar calidad del texto nativo.
  - Solo si el texto es insuficiente o pobre:
    - consultar disponibilidad OCR con el nuevo helper de `ocr_utils.py`,
    - intentar OCR solo si está disponible,
    - si no está disponible, omitir OCR silenciosamente.
  - Sustituir el `print(f"Error in PDF OCR fallback: {ocr_error}")` por manejo controlado:
    - registrar un estado interno no fatal,
    - no emitir error de boot por un caso esperado de dependencia opcional ausente.
  - Extender `analysis_meta` para reflejar estado OCR con algo como:
    - `ocr_available`
    - `ocr_attempted`
    - `ocr_status`
- Por qué:
  - Evita el error visible al arrancar en Render.
  - Reduce trabajo innecesario en PDFs ATS que ya contienen texto seleccionable.
  - Mantiene OCR para CVs escaneados cuando exista soporte real.

### 3. `render.yaml`
- Qué cambiar:
  - Extender `buildCommand` para instalar Tesseract y los idiomas necesarios antes del `pip install`.
- Cómo:
  - Cambiar la fase de build para instalar paquetes del sistema equivalentes a:
    - `tesseract-ocr`
    - `tesseract-ocr-spa`
    - `tesseract-ocr-eng`
  - Mantener los env vars actuales de búsqueda.
  - No depender de una ruta hardcodeada en variables de entorno si el código ya descubre `PATH` y `tessdata`.
- Por qué:
  - Habilita OCR real en Render/Linux.
  - Mantiene la app utilizable aunque la instalación del sistema falle, gracias a la degradación limpia del parser.

### 4. `app.py`
- Qué cambiar:
  - Mantener la carga inicial de `CURRENT_PROFILE`, pero depender del nuevo parser tolerante.
  - No introducir lógica adicional salvo que sea necesaria para exponer metadatos sanos del arranque.
- Por qué:
  - El bug principal no está en `app.py`; se corrige dejando de fallar el parser en condiciones esperables de producción.

## Fuera de Alcance
- Cambiar el flujo de OCR.space en `backend/latex_generator.py`.
- Rediseñar el parser completo de CV.
- Cambiar la UI o el flujo de búsqueda de trabajo.

## Riesgos y Manejo
- Riesgo: Render no permita instalar paquetes del sistema tal como se espera.
  - Mitigación: el parser no debe romper ni loggear error fatal cuando OCR no esté disponible.
- Riesgo: una detección demasiado agresiva de “texto nativo suficiente” omita OCR en un PDF que aún lo necesita.
  - Mitigación: conservar `looks_like_low_quality_text(...)` como puerta de decisión y reflejar el estado en `analysis_meta`.
- Riesgo: diferencias entre rutas Linux de `tessdata`.
  - Mitigación: probar múltiples rutas comunes y mantener soporte por `TESSDATA_PREFIX`.

## Verificación
- Verificación local Windows:
  - Arrancar la app.
  - Confirmar que el perfil por defecto se genera sin regressions.
  - Confirmar que un PDF escaneado sigue usando OCR local si `Tesseract-OCR` existe.
- Verificación local sin OCR:
  - Simular entorno sin Tesseract.
  - Confirmar que `parse_cv()` no imprime error fatal y sigue procesando PDFs con texto nativo.
- Verificación Render:
  - Deploy con el nuevo `render.yaml`.
  - Confirmar que el arranque ya no muestra `No se encontró tesseract.exe ...`.
  - Confirmar que `GET /` y `HEAD /` arrancan limpios.
  - Probar un PDF con texto nativo y uno escaneado.
  - Validar en respuesta o logs que:
    - con Tesseract instalado, OCR funciona;
    - sin Tesseract disponible, el sistema degrada sin ruido ni fallo de servicio.

## Orden de Implementación
1. Refactor de detección OCR en `backend/ocr_utils.py`.
2. Ajuste de decisión/uso OCR en `backend/parser.py`.
3. Ajuste de build en `render.yaml`.
4. Validación local y luego validación de deploy en Render.
