import os
from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
from backend.parser import parse_cv
from backend.latex_generator import generate_latex_from_image, LatexGenerationError
from backend.search_manager import search_jobs
from backend.job_analyzer import analyze_job_detail
from werkzeug.utils import secure_filename
import json
import csv
import io

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

DEFAULT_PDF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cv", "CV_Erwin_Brow.pdf")

# Global state in memory for the currently active profile
CURRENT_PROFILE = parse_cv(DEFAULT_PDF_PATH)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/profile', methods=['GET', 'POST'])
def handle_profile():
    global CURRENT_PROFILE
    if request.method == 'POST':
        try:
            data = request.json
            if not data:
                return jsonify({"status": "error", "message": "No data provided"}), 400
            
            # Simple validation to ensure it has basic fields
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
            
    # GET method
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
            # Parse the newly uploaded CV
            profile = parse_cv(filepath)
            CURRENT_PROFILE = profile
            analysis_meta = profile.get("analysis_meta", {})
            used_ocr = analysis_meta.get("used_ocr", False)
            
            # Clean up the file after parsing (optional, but good for keeping space clean)
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

@app.route('/api/search', methods=['GET'])
def search():
    global CURRENT_PROFILE
    keywords_raw = request.args.get('keywords', '')
    location = request.args.get('location', 'veracruz')
    modality = request.args.get('modality', 'any')
    max_results = request.args.get('max_results', 20, type=int)
    
    # Process keywords
    if keywords_raw:
        keywords = [k.strip() for k in keywords_raw.split(',') if k.strip()]
    else:
        keywords = None
        
    try:
        import time
        t0 = time.time()
        jobs = search_jobs(
            profile=CURRENT_PROFILE,
            keywords=keywords,
            location=location,
            modality=modality,
            max_results=max_results
        )
        elapsed = round(time.time() - t0, 2)
        avg_score = round(sum(j.get("match_score", 0) for j in jobs) / len(jobs), 1) if jobs else 0
        return jsonify({
            "status": "success",
            "count": len(jobs),
            "search_time_s": elapsed,
            "avg_match_score": avg_score,
            "modality": modality,
            "data": jobs
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route('/api/search/suggestions', methods=['GET'])
def search_suggestions():
    """Returns keyword suggestions based on the active profile's top skills."""
    global CURRENT_PROFILE
    suggestions = CURRENT_PROFILE.get("search_keywords") or CURRENT_PROFILE.get("all_skills_flat", [])
    return jsonify({"status": "success", "suggestions": suggestions})

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
    except LatexGenerationError as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Error interno al generar LaTeX: {str(e)}"
        }), 500

if __name__ == "__main__":
    print("Starting flask server on http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, debug=True)
