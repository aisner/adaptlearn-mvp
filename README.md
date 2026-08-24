# AdaptLearn MVP

AdaptLearn es un MVP funcional de una plataforma de aprendizaje adaptativo pensada para educación superior. En esta primera versión, el proyecto se concentra en una asignatura introductoria de programación y articula en un mismo flujo cinco componentes clave: diagnóstico inicial, recomendación personalizada, evaluación automática de actividades breves, retroalimentación contextualizada y seguimiento docente.

## Resumen

Este repositorio reúne la implementación técnica del MVP. Más que presentar una plataforma terminada, busca mostrar cómo puede llevarse a la práctica un flujo adaptativo completo en un contexto académico controlado, y observar si ese enfoque aporta valor pedagógico real sin aumentar la carga del docente.

En esta versión, el alcance del MVP se concentra en:

- una asignatura de `Programación I`
- usuarios `estudiante` y `docente`
- ejecución local o institucional controlada
- trazabilidad entre lo que hace el sistema y la revisión pedagógica posterior

## Funcionalidades del MVP

En su versión actual, AdaptLearn integra un conjunto de funciones orientadas a acompañar el proceso de aprendizaje desde el diagnóstico inicial hasta el seguimiento posterior:

- `Diagnóstico adaptativo`
  - identifica el nivel de entrada del estudiante
  - ayuda a reconocer competencias consolidadas y brechas de aprendizaje

- `Recomendación personalizada`
  - propone recursos y actividades según el perfil detectado
  - organiza una ruta de aprendizaje comprensible y justificable

- `Evaluación automática`
  - califica preguntas cerradas
  - analiza respuestas cortas con apoyo semántico local

- `Retroalimentación contextualizada`
  - ofrece orientación sobre errores, avances y siguientes pasos
  - deja espacio para validación o revisión docente antes de consolidarse

- `Dashboard docente`
  - presenta progreso, competencias e indicadores básicos de riesgo
  - facilita el seguimiento del recorrido de cada estudiante

## Alcance técnico

Esta versión implementa el flujo mínimo necesario para demostrar el funcionamiento del sistema de principio a fin. El foco está puesto en validar la lógica central del MVP, no en cubrir todavía todas las capacidades que podría tener una plataforma completa.

Por esa razón, en esta etapa aún no se incluyen:

- evaluación de ensayos extensos
- analítica predictiva avanzada de deserción
- generación automática de ítems
- integración completa con LMS o sistemas institucionales

## Arquitectura

El proyecto está organizado como una arquitectura ligera basada en servicios:

- `frontend/`
  - interfaz web para estudiantes y docentes

- `backend/`
  - orquesta el flujo principal, la autenticación, la persistencia y la comunicación con los servicios de IA

- `ai-services/`
  - servicios en Python para lógica adaptativa, recomendación, evaluación y retroalimentación

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

Si quieres usar un modelo local para embeddings y retroalimentación, puedes configurar Ollama antes de iniciar los servicios:

```powershell
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="mistral:7b-instruct"
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
```

Si Ollama no está disponible, el MVP puede seguir funcionando mediante rutas locales de respaldo para no bloquear la demostración.

## Persistencia local

La operación del MVP utiliza una base local SQLite:

- `data/adaptlearn.db`
- `data/runtime-state.json` como estado previo opcional
- `data/seed.json` como datos semilla

Dependiendo de la configuración local, el backend puede iniciar desde semilla o migrar un estado previo de demostración.

## Verificación rápida

Con los servicios activos:

```powershell
node tests/smoke-test.js
```

## Estado actual

AdaptLearn se encuentra en una etapa temprana de evolución. No busca presentarse todavía como una plataforma lista para producción, sino como una base funcional que permite demostrar el flujo principal del sistema, realizar pruebas controladas y orientar mejoras a partir de la evidencia recogida.

En su estado actual, este repositorio permite:

- mostrar un flujo funcional coherente desde el diagnóstico hasta la retroalimentación
- mantener una separación modular entre interfaz, backend y servicios de IA
- facilitar la ejecución local para demostraciones y pilotos tempranos
- conservar trazabilidad entre la interacción del usuario, las decisiones automáticas y la revisión docente

## Principios de diseño

- `trazabilidad pedagógica` por encima de automatización opaca
- `reproducibilidad local` por encima de complejidad innecesaria
- `validación incremental` por encima de una expansión temprana del alcance
- `supervisión docente` por encima de decisiones académicas totalmente autónomas

## Próximas líneas de evolución

- mejorar la calibración de competencias
- enriquecer la lógica de recomendación
- ampliar la cobertura de evaluación breve
- fortalecer la analítica docente
- incorporar mejor instrumentación para pilotos
- estudiar rutas de integración institucional

## Uso

Este repositorio se comparte con fines académicos, técnicos y de demostración. Su propósito principal es documentar y mostrar el MVP de AdaptLearn como base de trabajo para pruebas, discusión y evolución del proyecto.
