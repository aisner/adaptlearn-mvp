# AdaptLearn MVP

MVP demostrable del proyecto **AdaptLearn** alineado con el flujo definido en la propuesta del seminario:

- autenticacion por rol;
- diagnostico adaptativo;
- recomendacion personalizada;
- evaluacion breve automatizada;
- feedback contextualizado;
- dashboard docente con alertas simples.

## Funcionalidades ampliadas

- Estudiante:
  - plan de estudio editable con meta semanal, horas disponibles, competencia foco y nota personal;
  - seguimiento de recursos recomendados con marca de completado y reflexion breve;
  - solicitud de apoyo docente con estado visible.
- Docente:
  - filtros por estudiantes en riesgo, con apoyo pendiente o con revision requerida;
  - detalle por estudiante con plan, solicitudes, progreso y trazabilidad;
  - registro de intervenciones pedagogicas y cierre de solicitudes de apoyo.

## Estructura

- `frontend/`: interfaz web responsiva.
- `backend/`: servidor HTTP y orquestacion del flujo.
- `ai-services/`: servicio Python para logica adaptativa.
- `data/`: datos semilla para Programacion I.
- `tests/`: prueba de humo del flujo extremo a extremo.
- `docs/`: alcance funcional resumido.

## Persistencia

- La informacion operativa del MVP se guarda en una base de datos SQLite local: `data/adaptlearn.db`.
- En el primer arranque, si existe `data/runtime-state.json`, el backend migra ese estado a SQLite para conservar la demo actual.
- Si no existe estado previo, la base se inicializa desde `data/seed.json`.

## Alineacion con la propuesta

- El diagnostico adaptativo incorpora una estimacion mas cercana a IRT para priorizar competencias y seleccionar items segun informacion esperada.
- La evaluacion de respuestas cortas combina coincidencia conceptual con similitud semantica local.
- La retroalimentacion contextualizada puede apoyarse en un modelo local servido por Ollama mediante `OLLAMA_MODEL`.
- Si no hay modelo local disponible, el MVP mantiene un fallback verificable para no bloquear la demostracion.

## Infraestructura local preparada

- `infra/docker-compose.yml`: servicios base para PostgreSQL, Redis y Ollama en entorno local controlado.
- `infra/.env.example`: variables de ejemplo para conectar el servicio de IA local.

## Arranque local

En una terminal:

```powershell
python ai-services/server.py
```

En otra terminal:

```powershell
node backend/server.js
```

Luego abre [http://localhost:8000](http://localhost:8000).

Si deseas activar el modelo local para feedback y similitud semantica, define antes estas variables:

```powershell
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="mistral:7b-instruct"
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
```

En el estado actual del MVP, si Ollama ya esta disponible en `127.0.0.1:11434`, el servicio de IA intenta usarlo automaticamente y prioriza `mistral:7b` como modelo local de feedback cuando esta instalado.

## Credenciales demo

- `laura@adaptlearn.local` / `demo123`
- `carlos@adaptlearn.local` / `demo123`

## Verificacion rapida

Con ambos servicios activos:

```powershell
node tests/smoke-test.js
```

## Notas

- El backend usa SQLite embebido mediante `node:sqlite` y mantiene el flujo sin dependencias externas adicionales.
- Si el servicio Python no esta activo, el backend sigue operando con un motor local de respaldo para no bloquear la demostracion.
- Cuando Ollama esta disponible, el servicio Python puede producir feedback contextualizado con un modelo local del tipo Mistral y embeddings locales para respuestas cortas.
