# AdaptLearn MVP

AdaptLearn es una aplicación web de aprendizaje adaptativo para el curso de Programación I. El MVP ofrece perfiles de estudiante y docente, diagnóstico inicial, recomendaciones de recursos, actividad evaluativa breve y seguimiento del progreso.

## Funcionalidades

- Diagnóstico adaptativo por competencias.
- Recomendación de recursos según los resultados del diagnóstico.
- Evaluación automática de preguntas cerradas y respuestas cortas.
- Plan de estudio y registro del avance del estudiante.
- Solicitudes de apoyo e intervenciones docentes.
- Panel docente con progreso, resultados y alertas básicas.

## Requisitos

- Node.js 22 o superior, con el módulo integrado `node:sqlite`.
- Python 3, solo si se desea ejecutar el servicio de evaluación y recomendación por separado.
- Ollama es opcional. Sin Ollama, la aplicación usa la lógica local de respaldo.

La aplicación no requiere instalar paquetes npm ni paquetes de Python para la ejecución básica.

## Inicio rápido

Desde la raíz del repositorio, inicia el backend:

```powershell
node backend/server.js
```

Abre [http://localhost:8000](http://localhost:8000). El backend sirve la interfaz web y las rutas de la API.

Para habilitar el servicio Python en otra terminal, ejecuta:

```powershell
python ai-services/server.py
```

El servicio Python escucha en `127.0.0.1:8001`. El backend recurre automáticamente a sus implementaciones locales si el servicio no está disponible.

## Cuentas de demostración

| Perfil | Usuario | Contraseña |
| --- | --- | --- |
| Estudiante | `laura@adaptlearn.local` | `demo123` |
| Docente | `carlos@adaptlearn.local` | `demo123` |

Estas cuentas y contraseñas son únicamente para demostración local.

## Configuración opcional de Ollama

Copia `infra/.env.example` como referencia y configura estas variables en la sesión donde ejecutarás el servicio Python:

```powershell
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:OLLAMA_MODEL="mistral:7b-instruct"
$env:OLLAMA_EMBED_MODEL="nomic-embed-text"
python ai-services/server.py
```

El archivo `infra/docker-compose.yml` permite iniciar servicios auxiliares como Ollama, Redis y PostgreSQL. La aplicación actual usa SQLite local; Redis y PostgreSQL no son necesarios para iniciar el MVP.

## Persistencia y datos

- `data/seed.json` contiene los datos iniciales de demostración.
- `data/adaptlearn.db` es la base SQLite local y se crea o inicializa al arrancar el backend.
- `data/runtime-state.json` puede conservar estado de versiones anteriores.

Los archivos de estado local no deben compartirse como código fuente. El archivo `.gitignore` excluye la base de datos y el estado runtime.

## Verificación

Con el backend activo, ejecuta la prueba de recorrido principal desde la raíz del repositorio:

```powershell
node tests/smoke-test.js
```

## Estructura

```text
ai-services/
  adapt_engine.py
  server.py
backend/
  adaptEngine.js
  server.js
  stateStore.js
data/
  seed.json
frontend/
  index.html
  assets/
    app.js
    styles.css
infra/
  .env.example
  docker-compose.yml
tests/
README.md
```

## Alcance

Este repositorio está preparado para ejecución local y demostraciones controladas. Las cuentas de demostración, el almacenamiento local y la autenticación simplificada no están configurados para producción. Antes de un despliegue real deben añadirse controles de seguridad, gestión de secretos, copias de seguridad y una estrategia de operación adecuada.
