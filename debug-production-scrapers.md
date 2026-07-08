# Debug Session: production-scrapers
- **Status**: [OPEN]
- **Issue**: En producción no funcionan los scrapers, aparecen puestos inexistentes y no funciona bien el orden/filtrado; en local sí funciona.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-production-scrapers.ndjson

## Reproduction Steps
1. Abrir la app en producción.
2. Ejecutar una búsqueda de vacantes.
3. Observar que aparecen puestos inexistentes o fallback.
4. Observar que el orden/filtro no coincide con lo esperado.
5. Comparar con local, donde sí se obtienen resultados reales.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Producción recibe bloqueos HTTP o timeouts en scrapers y cae a fallback | High | Med | Strongly suspected |
| B | Falta dependencia/configuración en producción y algunos scrapers no ejecutan | High | Med | Pending |
| C | El frontend en producción no aplica orden/filtros correctamente sobre la respuesta | Med | Med | Rejected as primary cause |
| D | Producción está desplegada con una versión vieja del código | Med | Low | Pending |
| E | Headers/IP del servidor de producción están siendo bloqueados por portales externos | High | Med | Strongly suspected |

## Log Evidence
- Local pre-fix good path: `.dbg/trae-debug-log-production-scrapers.ndjson`
  - `search_jobs called`
  - multiple `scraper returned results`
  - `search_jobs returning` with `returned_count=20`, `combined_jobs=76`, `used_backend_fallback=false`
  - frontend `/api/search` response `status=200`, `data_count=20`
- Static evidence in code:
  - Backend fabricated vacancies when `scored_jobs` was empty.
  - Backend cached fabricated vacancies because `_set_cache(...)` ran even after fallback.
  - Frontend fabricated vacancies on `fetch` failure through `getFallbackJobs(...)`.
  - These two paths explain “puestos que ya no existen” and misleading sorting/filtering in production.

## Verification Conclusion
- Root cause confirmed in code: the application had two independent fallback mechanisms that generated fake vacancies.
- Root cause strongly suspected in production runtime: real scrapers likely fail there due to network/HTTP blocking/timeouts/deployment constraints, activating one of the fallback paths.
- Minimal fix applied:
  1. Backend mock fallback is disabled by default unless `PAH_ENABLE_SEARCH_FALLBACK` is explicitly enabled.
  2. Backend no longer caches fallback/mock results.
  3. Frontend fallback jobs are now restricted to localhost/127.0.0.1 only.
  4. Production now shows an explicit “fuentes no disponibles” state instead of invented vacancies.
