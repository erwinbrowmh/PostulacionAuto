import os
import time
import signal
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from backend.parser import parse_cv
from backend.latex_generator import generate_latex_from_image, LatexGenerationError
from backend.ats_cv_generator import generate_ats_docx, generate_ats_plain_text, generate_ats_pdf_from_profile
from backend.search_manager import search_jobs
from backend.job_analyzer import analyze_job_detail
from werkzeug.utils import secure_filename
import json
import csv
import io
import base64
import threading
import concurrent.futures

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

DEFAULT_PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cv", "CV_Erwin_Brow.pdf")

# Global state in memory for the currently active profile
CURRENT_PROFILE = parse_cv(DEFAULT_PDF_PATH)

# Timeout configuration
SEARCH_TIMEOUT = 45  # segundos

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "healthy",
        "timestamp": time.time(),
        "profile_loaded": bool(CURRENT_PROFILE)
    })

@app.route('/api/profile', methods=['GET', 'POST'])
def handle_profile():
    global CURRENT_PROFILE
    if request.method == 'POST':
        try:
            data = request.json
            if not data:
                return jsonify({"status": "error", "message": "No data provided"}), 400
            
            if "name" not in data or "skills" not in data:
                return jsonify({"status": "error", "message": "Formato de perfil inválido"}), 400
                
            CURRENT_PROFILE = data
            return jsonify({
                "status": "success",
                "message": "Perfil actualizado dinámicamente",
                "data": CURRENT_PROFILE
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": str(e)
            }), 500
            
    return jsonify({
        "status": "success",
        "data": CURRENT_PROFILE
    })

@app.route('/api/upload-cv', methods=['POST'])
def upload_cv():
    global CURRENT_PROFILE
    if 'cv' not in request.files:
        return jsonify({
            "status": "error",
            "message": "Falta el archivo del CV en la petición"
        }), 400
        
    file = request.files['cv']
    if file.filename == '':
        return jsonify({
            "status": "error",
            "message": "Nombre de archivo vacío"
        }), 400
        
    if file and file.filename.lower().endswith('.pdf'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            profile = parse_cv(filepath)
            CURRENT_PROFILE = profile
            analysis_meta = profile.get("analysis_meta", {})
            used_ocr = analysis_meta.get("used_ocr", False)
            
            try:
                os.remove(filepath)
            except Exception:
                pass
                
            return jsonify({
                "status": "success",
                "message": "CV subido y procesado exitosamente por ATS con OCR local." if used_ocr else "CV subido y procesado exitosamente por ATS",
                "data": profile
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Error al procesar el PDF: {str(e)}"
            }), 500
    else:
        return jsonify({
            "status": "error",
            "message": "Tipo de archivo no permitido. Solo se permiten PDFs."
        }), 400

def _normalize_search_keywords(raw_keywords, max_keywords=12):
    if isinstance(raw_keywords, str):
        keywords = [k.strip() for k in raw_keywords.split(',') if k.strip()]
    elif isinstance(raw_keywords, list):
        keywords = [str(k).strip() for k in raw_keywords if str(k).strip()]
    else:
        keywords = []
    seen = set()
    output = []
    for keyword in keywords:
        lowered = keyword.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        output.append(keyword)
        if len(output) >= max_keywords:
            break
    return output or None

@app.route('/api/search', methods=['GET', 'POST'])
def search():
    global CURRENT_PROFILE
    
    # Parse request
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
        keywords = _normalize_search_keywords(payload.get('keywords'))
        location = str(payload.get('location') or 'México').strip() or 'México'
        modality = str(payload.get('modality') or 'any').strip() or 'any'
        try:
            max_results = int(payload.get('max_results', 20))
        except (TypeError, ValueError):
            max_results = 20
    else:
        keywords = _normalize_search_keywords(request.args.get('keywords', ''))
        location = request.args.get('location', 'México')
        modality = request.args.get('modality', 'any')
        max_results = request.args.get('max_results', 20, type=int)

    max_results = max(5, min(max_results or 20, 50))  # Limit to 50 max
    
    # Validate keywords
    if not keywords:
        return jsonify({
            "status": "error",
            "message": "Se requieren palabras clave para la búsqueda."
        }), 400
    
    try:
        # Execute search with timeout
        result = []
        search_error = None
        
        def run_search():
            nonlocal result, search_error
            try:
                result = search_jobs(
                    profile=CURRENT_PROFILE,
                    keywords=keywords,
                    location=location,
                    modality=modality,
                    max_results=max_results
                )
            except Exception as e:
                search_error = e
        
        # Run with timeout
        search_thread = threading.Thread(target=run_search)
        search_thread.daemon = True
        search_thread.start()
        search_thread.join(timeout=SEARCH_TIMEOUT)
        
        if search_thread.is_alive():
            # Timeout occurred
            return jsonify({
                "status": "error",
                "message": f"La búsqueda tomó demasiado tiempo. Intenta con menos palabras clave o reduce el número de resultados.",
                "timeout": True
            }), 504
            
        if search_error:
            raise search_error
        
        if not result:
            return jsonify({
                "status": "success",
                "count": 0,
                "search_time_s": 0,
                "avg_match_score": 0,
                "modality": modality,
                "requested_max_results": max_results,
                "has_more_possible": False,
                "data": [],
                "message": "No se encontraron vacantes. Prueba con otras palabras clave."
            })
        
        elapsed = 0
        avg_score = round(sum(j.get("match_score", 0) for j in result) / len(result), 1) if result else 0
        
        return jsonify({
            "status": "success",
            "count": len(result),
            "search_time_s": elapsed,
            "avg_match_score": avg_score,
            "modality": modality,
            "requested_max_results": max_results,
            "has_more_possible": len(result) >= max_results,
            "data": result
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/search/suggestions', methods=['GET'])
def search_suggestions():
    global CURRENT_PROFILE
    suggestions = CURRENT_PROFILE.get("search_keywords") or CURRENT_PROFILE.get("all_skills_flat", [])
    return jsonify({"status": "success", "suggestions": suggestions[:12]})

@app.route('/api/export', methods=['POST'])
def export_jobs():
    try:
        data = request.json
        jobs = data.get('jobs', [])
        
        if not jobs:
            return jsonify({"status": "error", "message": "No jobs to export"}), 400
            
        output = io.StringIO()
        output.write('\ufeff')
        
        writer = csv.writer(output, delimiter=',', quotechar='"', quoting=csv.QUOTE_MINIMAL)
        writer.writerow(['Título', 'Empresa', 'Ubicación', 'Salario', 'Fecha', 'Plataforma', 'Match %', 'Habilidades Coincidentes', 'Enlace'])
        
        for job in jobs:
            skills_str = ", ".join(job.get('matched_skills', []))
            writer.writerow([
                job.get('title', ''),
                job.get('company', ''),
                job.get('location', ''),
                job.get('salary', ''),
                job.get('date', ''),
                job.get('source', ''),
                f"{job.get('match_score', 0)}%",
                skills_str,
                job.get('link', '')
            ])
            
        csv_data = output.getvalue()
        output.close()
        
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-disposition": "attachment; filename=empleos_postulacion.csv"}
        )
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/job-analysis', methods=['POST'])
def job_analysis():
    global CURRENT_PROFILE
    try:
        data = request.json or {}
        job = data.get('job')
        if not isinstance(job, dict) or not job:
            return jsonify({
                "status": "error",
                "message": "Debes enviar una vacante válida."
            }), 400

        analysis = analyze_job_detail(job, CURRENT_PROFILE)
        return jsonify({
            "status": "success",
            "message": "Análisis profundo generado correctamente.",
            "data": analysis
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/generate-cv-latex', methods=['POST'])
def generate_cv_latex():
    if 'image' not in request.files:
        return jsonify({
            "status": "error",
            "message": "Falta la imagen de la página PDF en la petición."
        }), 400

    image = request.files['image']
    if image.filename == '':
        return jsonify({
            "status": "error",
            "message": "Nombre de archivo vacío."
        }), 400

    filename = secure_filename(image.filename)
    mime_type = image.mimetype or ""
    image_bytes = image.read()

    try:
        latex = generate_latex_from_image(
            image_bytes=image_bytes,
            mime_type=mime_type,
            filename=filename,
        )
        suggested_name = f"{os.path.splitext(filename)[0] or 'cv_latex'}.tex"
        return jsonify({
            "status": "success",
            "message": "Código LaTeX generado correctamente con OCR local.",
            "data": {
                "latex": latex,
                "suggested_filename": suggested_name
            }
        })
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Error interno al generar LaTeX: {str(e)}"
        }), 500

@app.route('/api/generate-latex-from-text', methods=['POST'])
def generate_from_text():
    try:
        data = request.get_json(force=True) or {}
        raw_text = data.get('text', '').strip()

        if not raw_text:
            return jsonify({'status': 'error', 'message': 'No se recibió texto del CV.'}), 400

        plain = generate_ats_plain_text(raw_text)

        try:
            docx_bytes = generate_ats_docx(raw_text)
            docx_b64 = base64.b64encode(docx_bytes).decode('utf-8')
        except RuntimeError:
            docx_b64 = None

        return jsonify({
            'status': 'success',
            'message': 'CV ATS generado correctamente.',
            'data': {
                'latex': plain,
                'plain_text': plain,
                'docx_base64': docx_b64,
                'suggested_filename': 'cv_ats_optimizado.docx'
            }
        })

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/generate-ats-cv', methods=['POST'])
def generate_ats_cv_endpoint():
    try:
        data = request.get_json(force=True) or {}
        raw_text = data.get('text', '').strip()
        if not raw_text:
            return jsonify({'status': 'error', 'message': 'Sin texto.'}), 400

        docx_bytes = generate_ats_docx(raw_text)
        return Response(
            docx_bytes,
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={'Content-Disposition': 'attachment; filename=cv_ats_optimizado.docx'}
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/generate-ats-pdf-from-profile', methods=['POST'])
def generate_ats_pdf_from_profile_endpoint():
    try:
        global CURRENT_PROFILE
        # Use current profile or override with POST data
        data = request.json or {}
        profile_to_use = data if data else CURRENT_PROFILE
        
        pdf_bytes = generate_ats_pdf_from_profile(profile_to_use)
        return Response(
            pdf_bytes,
            mimetype='application/pdf',
            headers={'Content-Disposition': f'attachment; filename=cv_{profile_to_use.get("name", "candidato").replace(" ", "_")}_ats.pdf'}
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == "__main__":
    print("Starting flask server on http://localhost:5000")
    print("API endpoints:")
    print("  /health - Health check")
    print("  /api/profile - Get/update profile")
    print("  /api/search - Search jobs")
    print("  /api/upload-cv - Upload CV")
    print("  /api/generate-ats-pdf-from-profile - Generate ATS PDF")
    app.run(host="127.0.0.1", port=5000, debug=False)  # debug=False for better performance