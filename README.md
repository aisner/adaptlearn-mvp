# AdaptLearn MVP

MVP funcional de una plataforma de aprendizaje adaptativo orientada a educación superior. AdaptLearn valida un flujo integrado para una asignatura introductoria de programación: diagnóstico inicial, recomendación personalizada, evaluación automática de actividades breves, retroalimentación contextualizada y seguimiento docente.

## Resumen

AdaptLearn fue diseñado como un prototipo técnico validable en un entorno académico controlado. Su objetivo es demostrar que un flujo integrado de diagnóstico, recomendación, evaluación y retroalimentación puede aportar valor pedagógico real sin aumentar la carga operativa del docente.

El alcance actual del MVP se centra en:

- una asignatura de `Programación I`
- usuarios `estudiante` y `docente`
- ejecución local o institucional controlada
- trazabilidad entre decisiones del sistema y supervisión pedagógica

## Funcionalidades del MVP

- `Diagnóstico adaptativo`
  - estima el nivel inicial del estudiante
  - prioriza competencias y brechas de aprendizaje

- `Recomendación personalizada`
  - sugiere recursos y actividades según el perfil detectado
  - organiza una ruta de aprendizaje explicable

- `Evaluación automática`
  - califica preguntas cerradas
  - evalúa respuestas cortas con apoyo semántico local

- `Retroalimentación contextualizada`
  - genera orientación sobre errores y siguientes pasos
  - permite revisión docente antes de consolidarse

- `Dashboard docente`
  - muestra progreso, competencias e indicadores simples de riesgo
  - ofrece trazabilidad del recorrido del estudiante

## Alcance técnico

Esta versión del repositorio implementa el flujo mínimo demostrable del sistema. No incluye todavía:

- evaluación de ensayos extensos
- analítica predictiva avanzada de deserción
- generación automática de ítems
- integración completa con LMS o sistemas institucionales

## Arquitectura

El proyecto está organizado como una arquitectura ligera basada en servicios:

- `frontend/`
  - interfaz web para estudiantes y docentes

- `backend/`
  - orquestación del flujo, autenticación, persistencia y coordinación con servicios de IA

- `ai-services/`
  - servicios Python para lógica adaptativa, recomendación, evaluación y retroalimentación

- `data/`
  - datos semilla y datos locales de demostración

- `infra/`
  - configuración de infraestructura local y variables de entorno de ejemplo

- `tests/`
  - pruebas del flujo crítico del MVP

- `docs/`
  - documentación técnica y funcional de apoyo

## Stack tecnológico

- `Frontend`: React, TypeScript, Vite
- `Backend`: Node.js, Express
- `Servicios IA`: Python, FastAPI
- `Persistencia`: SQLite
- `IA local opcional`: Ollama + modelo tipo Mistral
- `Infraestructura`: Docker Compose

## Estructura del repositorio

```text
.
├── ai-services/
├── backend/
├── data/
├── docs/
├── frontend/
├── infra/
├── tests/
└── README.md
```

## Ejecución local

### 1. Iniciar el servicio de IA

```powershell
python ai-services/server.py
```

### 2. Iniciar el backend

```powershell
node backend/server.js
```

### 3. Abrir la aplicación

```text
http://localhost:8000
```

## Configuración opcional de IA local

Si deseas usar un modelo local para embeddings y retroalimentación:

```powershell
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="mistral:7b-instruct"
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
```

Si Ollama no está disponible, el MVP puede seguir operando mediante rutas locales de respaldo para no bloquear la demostración.

## Persistencia local

La operación del MVP utiliza una base local SQLite:

- `data/adaptlearn.db`
- `data/runtime-state.json` como estado previo opcional
- `data/seed.json` como datos semilla

Según la configuración local, el backend puede inicializar desde semilla o migrar un estado previo de demostración.

## Verificación rápida

Con los servicios activos:

```powershell
node tests/smoke-test.js
```

## Estado actual

AdaptLearn debe entenderse como un `MVP en validación controlada`, no como una plataforma lista para producción.

Este repositorio busca demostrar:

- un flujo funcional coherente de diagnóstico a retroalimentación
- separación modular entre interfaz, backend y servicios de IA
- reproducibilidad local para demostraciones y pilotos tempranos
- trazabilidad entre interacción del usuario, decisiones automáticas y revisión docente

## Principios de diseño

- `trazabilidad pedagógica` sobre automatización opaca
- `reproducibilidad local` sobre complejidad innecesaria
- `validación incremental` sobre expansión temprana del alcance
- `supervisión docente` sobre decisiones académicas totalmente autónomas

## Próximas líneas de evolución

- mejorar calibración de competencias
- enriquecer la lógica de recomendación
- ampliar cobertura de evaluación breve
- fortalecer la analítica docente
- incorporar mejor instrumentación para pilotos
- estudiar rutas de integración institucional

## Uso

Este repositorio se comparte con fines académicos, técnicos y de demostración asociados al MVP de AdaptLearn.
