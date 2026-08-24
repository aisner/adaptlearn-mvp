const state = {
  token: null,
  user: null,
  diagnosticAttemptId: null,
  activityLoaded: false,
  teacherFilter: "all",
  selectedStudentId: null,
  selectedSupportRequestId: null,
  teacherStudents: []
};

const elements = {
  loginView: document.querySelector("#login-view"),
  studentView: document.querySelector("#student-view"),
  teacherView: document.querySelector("#teacher-view"),
  loginForm: document.querySelector("#login-form"),
  loginError: document.querySelector("#login-error"),
  studentName: document.querySelector("#student-name"),
  teacherName: document.querySelector("#teacher-name"),
  studentStatus: document.querySelector("#student-status"),
  studentOverview: document.querySelector("#student-overview"),
  studentJourney: document.querySelector("#student-journey"),
  studentNextStep: document.querySelector("#student-next-step"),
  diagnosticBox: document.querySelector("#diagnostic-box"),
  profileCards: document.querySelector("#profile-cards"),
  recommendationsList: document.querySelector("#recommendations-list"),
  studentPlanBox: document.querySelector("#student-plan-box"),
  resourceProgressBox: document.querySelector("#resource-progress-box"),
  supportBox: document.querySelector("#support-box"),
  activityBox: document.querySelector("#activity-box"),
  teacherMetrics: document.querySelector("#teacher-metrics"),
  teacherJourney: document.querySelector("#teacher-journey"),
  teacherQueueSummary: document.querySelector("#teacher-queue-summary"),
  teacherFilters: document.querySelector("#teacher-filters"),
  teacherStudents: document.querySelector("#teacher-students"),
  teacherBreadcrumb: document.querySelector("#teacher-breadcrumb"),
  teacherDetail: document.querySelector("#teacher-detail")
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "No fue posible completar la solicitud");
  }
  return payload;
}

function showView(role) {
  elements.loginView.classList.toggle("hidden", role !== null);
  elements.studentView.classList.toggle("hidden", role !== "student");
  elements.teacherView.classList.toggle("hidden", role !== "teacher");
  document.body.dataset.view = role || "login";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToTarget(targetId) {
  const target = document.getElementById(targetId);
  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setActiveSectionLink(button) {
  const group = button.closest(".section-nav");
  if (!group) {
    return;
  }

  group.querySelectorAll(".section-nav-link").forEach((link) => {
    link.classList.toggle("is-active", link === button);
  });
}

function initializeSectionNav() {
  document.querySelectorAll(".section-nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveSectionLink(button);
      scrollToTarget(button.dataset.target);
    });
  });
}

function wireScrollTargets(root = document) {
  root.querySelectorAll("[data-scroll-target]").forEach((button) => {
    if (button.dataset.scrollBound === "true") {
      return;
    }

    button.dataset.scrollBound = "true";
    button.addEventListener("click", () => {
      scrollToTarget(button.dataset.scrollTarget);
    });
  });
}

function renderProfile(profile = []) {
  if (!profile?.length) {
    elements.profileCards.innerHTML =
      '<div class="metric-card"><p class="eyebrow">Sin perfil</p><strong>Aun no hay diagnostico.</strong><p class="muted">Inicia el flujo para estimar tus competencias.</p></div>';
    return;
  }

  const weakest = [...profile].sort((left, right) => left.mastery - right.mastery)[0];
  const profileCards = profile
    .map((entry) => {
      const score = Math.round(entry.mastery * 100);
      const standardError =
        typeof entry.standardError === "number" && Number.isFinite(entry.standardError) ? entry.standardError : null;
      const evidenceLevel =
        entry.evidenceLevel || (entry.asked >= 3 ? "stable" : entry.asked === 2 ? "developing" : "preliminary");
      const evidenceText =
        evidenceLevel === "preliminary"
          ? "Estimacion preliminar: conviene responder mas items para confirmar este nivel."
          : evidenceLevel === "developing"
            ? "Estimacion en desarrollo: ya hay senales utiles, pero aun falta consolidar evidencia."
            : `Estimacion estable. Incertidumbre actual: ${standardError ?? "no disponible"}.`;

      return `
        <article class="metric-card metric-card-compact">
          <p class="eyebrow">${entry.competencyName}</p>
          <h3>${score}%</h3>
          <div class="progress-bar"><span style="width:${score}%"></span></div>
          <p class="muted">Items respondidos: ${entry.asked}. Aciertos: ${entry.correct}.</p>
          <p class="profile-evidence">${evidenceText}</p>
        </article>
      `;
    })
    .join("");

  elements.profileCards.innerHTML = `
    <details class="student-disclosure" open>
      <summary>
        <div>
          <p class="eyebrow">Mapa de competencias</p>
          <h3>${profile.length} competencias medidas</h3>
          <p class="muted">La brecha mas visible hoy esta en ${weakest?.competencyName || "el perfil general"}.</p>
        </div>
        <span class="pill">Ver detalle</span>
      </summary>
      <div class="student-disclosure-body profile-grid">
        ${profileCards}
      </div>
    </details>
  `;
}

function renderRecommendations(recommendations = []) {
  if (!recommendations.length) {
    elements.recommendationsList.innerHTML =
      '<div class="resource-card"><p class="muted">La ruta aparecera despues del diagnostico.</p></div>';
    return;
  }

  elements.recommendationsList.innerHTML = recommendations
    .map(
      (resource) => `
      <article class="resource-card">
        <header>
          <div>
            <p class="eyebrow">${resource.type} / prioridad ${Math.round(resource.priorityScore * 100)}%</p>
            <h3>${resource.title}</h3>
          </div>
          <span class="pill">${resource.durationMinutes} min</span>
        </header>
        <p class="muted">${resource.summary}</p>
        <p>${resource.why}</p>
      </article>
    `
    )
    .join("");
}

function renderStudentOverview(summary) {
  const cards = [
    ["Riesgo", summary.risk?.level || "sin dato", "Estado academico actual"],
    [
      "Recursos completados",
      `${summary.insights?.completedResources || 0}/${summary.insights?.totalResources || 0}`,
      "Avance dentro de la ruta sugerida"
    ],
    [
      "Solicitudes abiertas",
      summary.insights?.supportOpen ?? 0,
      "Casos pendientes de respuesta docente"
    ],
    [
      "Competencia foco",
      summary.insights?.nextCompetency ? summary.insights.nextCompetency.competencyName : "Sin prioridad",
      "Area que mas conviene reforzar"
    ]
  ];

  elements.studentOverview.innerHTML = cards
    .map(
      ([label, value, text]) => `
      <article class="metric-card metric-card-compact">
        <p class="eyebrow">${label}</p>
        <h3>${value}</h3>
        <p class="muted">${text}.</p>
      </article>
    `
    )
    .join("");
}

function renderStudentJourney(summary) {
  const stages = [
    {
      label: "Diagnostico",
      target: "student-diagnostic-panel",
      status: summary.profile?.length ? "completado" : "pendiente",
      description: summary.profile?.length ? `${summary.profile.length} competencias medidas` : "Aun no inicias el recorrido"
    },
    {
      label: "Ruta",
      target: "student-route-panel",
      status: summary.recommendations?.length ? "activa" : "pendiente",
      description: `${summary.insights?.completedResources || 0}/${summary.insights?.totalResources || 0} recursos revisados`
    },
    {
      label: "Actividad",
      target: "student-activity-panel",
      status: summary.activitySubmission ? "completada" : "pendiente",
      description: summary.activitySubmission ? `Puntaje ${summary.activitySubmission.result.score}/100` : "Sin evidencia posterior"
    },
    {
      label: "Apoyo",
      target: "student-support-panel",
      status: summary.insights?.supportOpen ? "abierto" : "estable",
      description: summary.insights?.supportOpen ? `${summary.insights.supportOpen} solicitud(es) pendiente(s)` : "Sin solicitudes activas"
    }
  ];

  elements.studentJourney.innerHTML = stages
    .map(
      (stage, index) => `
      <button type="button" class="journey-card" data-scroll-target="${stage.target}">
        <span class="journey-index">0${index + 1}</span>
        <div class="journey-copy">
          <p class="eyebrow">${stage.label}</p>
          <strong>${stage.status}</strong>
          <span>${stage.description}</span>
        </div>
      </button>
    `
    )
    .join("");

  wireScrollTargets(elements.studentJourney);
}

function renderStudentNextStep(summary) {
  const hasDiagnostic = Boolean(summary.profile?.length);
  const hasRecommendations = Boolean(summary.recommendations?.length);
  const hasActivity = Boolean(summary.activitySubmission);
  let title = "Inicia tu diagnostico";
  let text = "Todavia no existe un perfil base. Responde el diagnostico para que el sistema pueda recomendar una ruta personalizada.";
  let actions = [
    { label: "Ir al diagnostico", target: "student-diagnostic-panel" },
    { label: "Ver resumen", target: "student-overview" }
  ];

  if (hasDiagnostic && hasRecommendations && !hasActivity) {
    title = "Revisa la ruta y completa la actividad";
    text = "Ya tienes un perfil inicial. Recorre los recursos sugeridos, registra tu avance y luego responde la actividad de verificacion.";
    actions = [
      { label: "Abrir ruta", target: "student-route-panel" },
      { label: "Ir a la actividad", target: "student-activity-panel" }
    ];
  } else if (hasActivity) {
    title = "Consolida tu seguimiento";
    text = "Ya cuentas con resultado de actividad. Actualiza tu plan semanal, completa recursos pendientes y solicita apoyo si aun tienes dudas.";
    actions = [
      { label: "Actualizar plan", target: "student-plan-panel" },
      { label: "Solicitar apoyo", target: "student-support-panel" }
    ];
  } else if (hasDiagnostic) {
    title = "Empieza la ruta sugerida";
    text = "Tu diagnostico ya esta listo. Revisa los recursos priorizados y marca el avance para organizar mejor tu estudio.";
    actions = [
      { label: "Ver ruta sugerida", target: "student-route-panel" },
      { label: "Ir al plan", target: "student-plan-panel" }
    ];
  }

  elements.studentNextStep.innerHTML = `
    <article class="resource-card callout-card student-focus-card">
      <div class="student-focus-copy">
        <p class="eyebrow">Accion recomendada</p>
        <h3>${title}</h3>
        <p class="muted">${text}</p>
      </div>
      <div class="student-focus-actions">
        <button type="button" class="primary-button" data-scroll-target="${actions[0].target}">${actions[0].label}</button>
        ${
          actions[1]
            ? `<button type="button" class="ghost-button" data-scroll-target="${actions[1].target}">${actions[1].label}</button>`
            : ""
        }
      </div>
    </article>
  `;

  wireScrollTargets(elements.studentNextStep);
}

function renderStudentPlan(summary) {
  const plan = summary.studyPlan || {};
  const nextCompetency = summary.insights?.nextCompetency;
  const shouldOpenPlan = !plan.weeklyGoal || !plan.personalNote;
  elements.studentPlanBox.innerHTML = `
    <article class="resource-card student-summary-card">
      <header>
        <div>
          <p class="eyebrow">Plan semanal</p>
          <h3>${plan.weeklyGoal || "Define tu objetivo de trabajo."}</h3>
        </div>
        <span class="pill">${plan.availableHours || 0} h</span>
      </header>
      <p class="muted">${plan.personalNote || "Sin nota personal registrada."}</p>
      <p>${nextCompetency ? `Competencia sugerida para reforzar: ${nextCompetency.competencyName}.` : "El sistema aun no propone una prioridad concreta."}</p>
    </article>
    <details class="student-disclosure" ${shouldOpenPlan ? "open" : ""}>
      <summary>
        <div>
          <p class="eyebrow">Planificacion personal</p>
          <h3>Organiza tu semana de estudio</h3>
          <p class="muted">Abre este panel solo cuando quieras ajustar objetivo, horas o nota de trabajo.</p>
        </div>
        <span class="pill">Editar plan</span>
      </summary>
      <div class="student-disclosure-body">
        <form id="study-plan-form" class="stack form-subgrid">
          <label>
            Objetivo semanal
            <input type="text" name="weeklyGoal" value="${plan.weeklyGoal || ""}" placeholder="Ej: completar la ruta de control de flujo" />
          </label>
          <label>
            Horas disponibles
            <input type="number" name="availableHours" value="${plan.availableHours || 0}" min="0" max="20" />
          </label>
          <label>
            Competencia foco
            <select name="focusCompetencyId">
              <option value="">Selecciona una competencia</option>
              ${(summary.profile || [])
                .map(
                  (entry) =>
                    `<option value="${entry.competencyId}" ${plan.focusCompetencyId === entry.competencyId ? "selected" : ""}>${entry.competencyName}</option>`
                )
                .join("")}
            </select>
          </label>
          <label>
            Nota personal
            <textarea name="personalNote" placeholder="Escribe una observacion de estudio...">${plan.personalNote || ""}</textarea>
          </label>
          <button type="submit" class="ghost-button">Guardar plan</button>
        </form>
      </div>
    </details>
  `;

  document.querySelector("#study-plan-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await api("/api/student/study-plan", {
      method: "POST",
      body: JSON.stringify({
        weeklyGoal: formData.get("weeklyGoal"),
        availableHours: Number(formData.get("availableHours")),
        focusCompetencyId: formData.get("focusCompetencyId"),
        personalNote: formData.get("personalNote")
      })
    });
    await loadStudentSummary();
  });
}

function renderResourceProgress(summary) {
  const progressItems = summary.recommendationProgress || [];
  if (!progressItems.length) {
    elements.resourceProgressBox.innerHTML = '<div class="resource-card"><p class="muted">Aun no hay recursos activos para gestionar.</p></div>';
    return;
  }

  elements.resourceProgressBox.innerHTML = progressItems
    .map((resource) => {
      const isCompleted = resource.progress.completed;
      const hasReflection = Boolean(resource.progress.reflection);
      return `
        <details class="student-disclosure resource-disclosure" ${!isCompleted && !hasReflection ? "open" : ""}>
          <summary>
            <div>
              <p class="eyebrow">${resource.competencyId}</p>
              <h3>${resource.title}</h3>
              <p class="muted">${resource.summary}</p>
            </div>
            <span class="pill ${isCompleted ? "" : "warning"}">${isCompleted ? "Completado" : "Pendiente"}</span>
          </summary>
          <div class="student-disclosure-body">
            <p>${resource.progress.reflection || "Sin reflexion registrada para este recurso."}</p>
            <form class="stack resource-progress-form" data-resource-id="${resource.id}">
              <label class="checkbox-row">
                <input type="checkbox" name="completed" ${isCompleted ? "checked" : ""} />
                Marcar como revisado
              </label>
              <label>
                Reflexion breve
                <textarea name="reflection" placeholder="Que aprendiste o que te falto practicar...">${resource.progress.reflection || ""}</textarea>
              </label>
              <button type="submit" class="ghost-button">Actualizar avance</button>
            </form>
          </div>
        </details>
      `;
    })
    .join("");

  document.querySelectorAll(".resource-progress-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await api("/api/student/resource-progress", {
        method: "POST",
        body: JSON.stringify({
          resourceId: event.currentTarget.dataset.resourceId,
          completed: formData.get("completed") === "on",
          reflection: formData.get("reflection")
        })
      });
      await loadStudentSummary();
    });
  });
}

function renderSupportBox(summary) {
  const requests = summary.supportRequests || [];
  const openRequests = requests.filter((request) => request.status !== "resolved").length;
  elements.supportBox.innerHTML = `
    <article class="resource-card student-summary-card">
      <header>
        <div>
          <p class="eyebrow">Acompanamiento</p>
          <h3>${openRequests ? `${openRequests} solicitud(es) activa(s)` : "Sin solicitudes abiertas"}</h3>
        </div>
        <span class="pill ${openRequests ? "warning" : ""}">${openRequests ? "Con seguimiento" : "Estable"}</span>
      </header>
      <p class="muted">Usa este espacio solo si necesitas aclarar dudas o pedir orientacion adicional al docente.</p>
    </article>
    <details class="student-disclosure" ${!requests.length ? "open" : ""}>
      <summary>
        <div>
          <p class="eyebrow">Nueva solicitud</p>
          <h3>Solicita apoyo docente</h3>
          <p class="muted">Abre este formulario cuando necesites explicar una dificultad concreta.</p>
        </div>
        <span class="pill">Escribir</span>
      </summary>
      <div class="student-disclosure-body">
        <form id="support-request-form" class="stack form-subgrid">
          <label>
            Tema de apoyo
            <input type="text" name="topic" placeholder="Ej: dudas con ciclos for y while" required />
          </label>
          <label>
            Mensaje
            <textarea name="message" placeholder="Describe la dificultad que necesitas trabajar..." required></textarea>
          </label>
          <button type="submit" class="primary-button">Enviar solicitud</button>
        </form>
      </div>
    </details>
    ${
      requests.length
        ? `
        <details class="student-disclosure">
          <summary>
            <div>
              <p class="eyebrow">Historial de apoyo</p>
              <h3>Revisa tus solicitudes previas</h3>
              <p class="muted">Consulta el estado de tus mensajes y el seguimiento docente.</p>
            </div>
            <span class="pill">${requests.length}</span>
          </summary>
          <div class="student-disclosure-body stack">
            ${requests
              .slice()
              .reverse()
              .map(
                (request) => `
                  <article class="resource-card resource-card-compact">
                    <header>
                      <div>
                        <p class="eyebrow">Solicitud ${new Date(request.createdAt).toLocaleDateString("es-CO")}</p>
                        <h3>${request.topic}</h3>
                      </div>
                      <span class="pill ${request.status === "resolved" ? "" : "warning"}">${formatSupportStatus(request.status)}</span>
                    </header>
                    <p class="muted">${request.message}</p>
                    ${
                      request.teacherResponse
                        ? `
                        <div class="detail-response-card">
                          <p class="eyebrow">Respuesta docente</p>
                          <strong>${escapeHtml(request.teacherResponse.teacherName || "Docente")}</strong>
                          <p class="muted">${escapeHtml(request.teacherResponse.note)}</p>
                          ${
                            request.teacherResponse.nextStep
                              ? `<p class="detail-history-foot"><strong>Siguiente paso:</strong> ${escapeHtml(request.teacherResponse.nextStep)}</p>`
                              : ""
                          }
                        </div>
                      `
                        : ""
                    }
                  </article>
                `
              )
              .join("")}
          </div>
        </details>
      `
        : ""
    }
  `;

  document.querySelector("#support-request-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await api("/api/student/support-request", {
      method: "POST",
      body: JSON.stringify({
        topic: formData.get("topic"),
        message: formData.get("message")
      })
    });
    await loadStudentSummary();
  });
}

function renderDiagnosticQuestion(payload) {
  elements.diagnosticBox.classList.remove("hidden");
  if (payload.done) {
    renderProfile(payload.profile);
    renderRecommendations(payload.recommendations);
    elements.diagnosticBox.innerHTML = `
      <article class="question-card">
        <p class="eyebrow">Diagnostico completado</p>
        <h3>Perfil estimado listo</h3>
        <p class="muted">Motor usado: ${payload.engine}. Ya puedes revisar la ruta recomendada y resolver la actividad breve.</p>
      </article>
    `;
    loadStudentSummary();
    loadActivity();
    return;
  }

  const item = payload.nextItem;
  elements.diagnosticBox.innerHTML = `
    <article class="question-card">
      <header>
        <div>
          <p class="eyebrow">Motor ${payload.engine}</p>
          <h3>${item.prompt}</h3>
        </div>
        <span class="pill">Dificultad ${item.difficulty}</span>
      </header>
      <div class="answer-grid">
        ${item.options
          .map(
            (option, index) => `
              <button class="option-button diagnostic-option" data-item="${item.id}" data-answer="${index}">
                ${String.fromCharCode(65 + index)}. ${option}
              </button>
            `
          )
          .join("")}
      </div>
    </article>
  `;

  document.querySelectorAll(".diagnostic-option").forEach((button) => {
    button.addEventListener("click", async () => {
      const result = await api("/api/diagnostic/answer", {
        method: "POST",
        body: JSON.stringify({
          attemptId: state.diagnosticAttemptId,
          itemId: button.dataset.item,
          answer: Number(button.dataset.answer)
        })
      });
      renderDiagnosticQuestion(result);
    });
  });
}

async function startDiagnostic() {
  const payload = await api("/api/diagnostic/start", { method: "POST", body: "{}" });
  state.diagnosticAttemptId = payload.attemptId;
  renderDiagnosticQuestion(payload);
}

async function loadStudentSummary() {
  const summary = await api("/api/student/summary");
  elements.studentStatus.textContent = summary.profile
    ? `Tu ultima ruta muestra ${summary.profile.length} competencias medidas. Nivel de riesgo academico: ${summary.risk.level}. Recursos completados: ${summary.insights.completedResources}/${summary.insights.totalResources}.`
    : "Aun no has iniciado el flujo adaptativo. Comienza con el diagnostico.";
  renderStudentOverview(summary);
  renderStudentJourney(summary);
  renderStudentNextStep(summary);
  renderProfile(summary.profile || []);
  renderRecommendations(summary.recommendations || []);
  renderStudentPlan(summary);
  renderResourceProgress(summary);
  renderSupportBox(summary);
  if (summary.activitySubmission) {
    renderActivityResult(summary.activitySubmission.result);
  } else {
    loadActivity();
  }
}

function renderActivityForm(activity) {
  elements.activityBox.innerHTML = `
    <article class="question-card">
      <header>
        <div>
          <p class="eyebrow">Actividad automatizada</p>
          <h3>${activity.title}</h3>
        </div>
      </header>
      <p class="muted">${activity.instructions}</p>
      <form id="activity-form" class="stack">
        <div>
          <p><strong>${activity.items[0].prompt}</strong></p>
          <div class="answer-grid">
            ${activity.items[0].options
              .map(
                (option, index) => `
                  <label class="option-button">
                    <input type="radio" name="${activity.items[0].id}" value="${index}" required />
                    ${option}
                  </label>
                `
              )
              .join("")}
          </div>
        </div>
        <label>
          <span><strong>${activity.items[1].prompt}</strong></span>
          <textarea name="${activity.items[1].id}" placeholder="Escribe tu explicacion breve..." required></textarea>
        </label>
        <button class="primary-button" type="submit">Enviar actividad</button>
      </form>
    </article>
  `;

  document.querySelector("#activity-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const answers = activity.items.map((item) => ({
      itemId: item.id,
      value: formData.get(item.id)
    }));
    const result = await api("/api/student/activity/submit", {
      method: "POST",
      body: JSON.stringify({ answers })
    });
    renderActivityResult(result);
    await loadTeacherDashboardSilently();
  });
}

function renderActivityResult(result) {
  elements.activityBox.innerHTML = `
    <article class="question-card">
      <header>
        <div>
          <p class="eyebrow">Feedback contextualizado</p>
          <h3>Puntaje ${result.score}/100 / nivel ${result.level}</h3>
        </div>
        <span class="pill ${result.teacherReviewNeeded ? "warning" : ""}">
          ${result.teacherReviewNeeded ? "Requiere revision docente" : "Sin revision adicional"}
        </span>
      </header>
      <p>${result.summary}</p>
      <details class="student-disclosure">
        <summary>
          <div>
            <p class="eyebrow">Detalle del feedback</p>
            <h3>Revisa item por item</h3>
            <p class="muted">Abre este panel solo si quieres leer la devolucion completa.</p>
          </div>
          <span class="pill">${result.items.length}</span>
        </summary>
        <div class="student-disclosure-body stack">
          ${result.items
            .map(
              (item) => `
              <div class="resource-card resource-card-compact">
                <p class="eyebrow">${item.type}</p>
                <h3>${item.score}/${item.maxScore}</h3>
                <p class="muted">${item.feedback}</p>
              </div>
            `
            )
            .join("")}
        </div>
      </details>
    </article>
  `;
}

async function loadActivity() {
  if (state.activityLoaded) {
    return;
  }
  try {
    const activity = await api("/api/student/activity");
    renderActivityForm(activity);
    state.activityLoaded = true;
  } catch (error) {
    elements.activityBox.innerHTML = `<div class="resource-card"><p class="muted">${error.message}</p></div>`;
  }
}

function renderTeacherMetrics(metrics) {
  elements.teacherMetrics.innerHTML = [
    ["Estudiantes", metrics.students],
    ["Diagnosticos", metrics.diagnosticsCompleted],
    ["En riesgo", metrics.studentsAtRisk],
    ["Promedio actividad", metrics.averageActivityScore ?? "Sin datos"],
    ["Solicitudes abiertas", metrics.supportOpen],
    ["Recursos completados", metrics.resourcesCompleted]
  ]
    .map(
      ([label, value]) => `
      <article class="metric-card">
        <p class="eyebrow">${label}</p>
        <h3>${value}</h3>
        <p class="muted">Indicador clave del recorrido actual.</p>
      </article>
    `
    )
    .join("");
}

function renderTeacherJourney(metrics) {
  const stages = [
    {
      label: "Lectura del curso",
      target: "teacher-metrics",
      status: "indicadores",
      description: `${metrics.students} estudiante(s) y promedio ${metrics.averageActivityScore ?? "sin datos"}`
    },
    {
      label: "Priorizacion",
      target: "teacher-queue-panel",
      status: metrics.studentsAtRisk ? "activa" : "estable",
      description: `${metrics.studentsAtRisk} caso(s) en riesgo y ${metrics.supportOpen} apoyo(s) abierto(s)`
    },
    {
      label: "Expediente",
      target: "teacher-detail-panel",
      status: state.selectedStudentId ? "listo" : "pendiente",
      description: state.selectedStudentId ? "Detalle del caso seleccionado" : "Selecciona un estudiante para revisar evidencia"
    },
    {
      label: "Intervencion",
      target: "teacher-intervention-panel",
      status: "accion",
      description: "Registra orientaciones, seguimiento y cierre de apoyos"
    }
  ];

  elements.teacherJourney.innerHTML = stages
    .map(
      (stage, index) => `
      <button type="button" class="journey-card teacher-journey-card" data-scroll-target="${stage.target}">
        <span class="journey-index">0${index + 1}</span>
        <div class="journey-copy">
          <p class="eyebrow">${stage.label}</p>
          <strong>${stage.status}</strong>
          <span>${stage.description}</span>
        </div>
      </button>
    `
    )
    .join("");

  wireScrollTargets(elements.teacherJourney);
}

function renderTeacherBreadcrumb(student = null) {
  if (!student) {
    elements.teacherBreadcrumb.innerHTML = `
      <div class="breadcrumb-track">
        <button type="button" class="breadcrumb-link" data-scroll-target="teacher-queue-panel">Bandeja</button>
        <span class="breadcrumb-separator">></span>
        <span class="breadcrumb-current">Selecciona un estudiante en el panel superior</span>
      </div>
    `;
    wireScrollTargets(elements.teacherBreadcrumb);
    return;
  }

  elements.teacherBreadcrumb.innerHTML = `
    <div class="breadcrumb-track">
      <button type="button" class="breadcrumb-link" data-scroll-target="teacher-queue-panel">Bandeja</button>
      <span class="breadcrumb-separator">></span>
      <button type="button" class="breadcrumb-link" data-scroll-target="teacher-detail-panel">${student.studentName}</button>
      <span class="breadcrumb-separator">></span>
      <button type="button" class="breadcrumb-link" data-scroll-target="teacher-intervention-panel">Intervencion</button>
    </div>
  `;
  wireScrollTargets(elements.teacherBreadcrumb);
}

function getStudentPriority(student) {
  const openSupport = (student.supportRequests || []).filter((request) => request.status !== "resolved").length;
  const riskWeight = student.risk.level === "alto" ? 5 : student.risk.level === "medio" ? 3 : 1;
  const reviewWeight = student.teacherReviewNeeded ? 3 : 0;
  const activityPendingWeight = student.activityScore == null ? 2 : 0;
  const resourceGap = Math.max((student.recommendedResources || 0) - (student.completedResources || 0), 0);
  return riskWeight + reviewWeight + activityPendingWeight + openSupport * 2 + resourceGap * 0.35;
}

function getFilteredStudents() {
  const filter = state.teacherFilter;
  const ranked = [...state.teacherStudents].sort((left, right) => getStudentPriority(right) - getStudentPriority(left));
  if (filter === "risk") {
    return ranked.filter((student) => student.risk.level !== "bajo");
  }
  if (filter === "support") {
    return ranked.filter((student) => (student.supportRequests || []).some((request) => request.status !== "resolved"));
  }
  if (filter === "review") {
    return ranked.filter((student) => student.teacherReviewNeeded);
  }
  return ranked;
}

function renderTeacherQueueSummary() {
  const openSupport = state.teacherStudents.filter((student) =>
    (student.supportRequests || []).some((request) => request.status !== "resolved")
  ).length;
  const atRisk = state.teacherStudents.filter((student) => student.risk.level !== "bajo").length;
  const pendingReview = state.teacherStudents.filter((student) => student.teacherReviewNeeded).length;
  const noActivity = state.teacherStudents.filter((student) => student.activityScore == null).length;

  elements.teacherQueueSummary.innerHTML = [
    ["Casos en riesgo", atRisk, "Seguimiento inmediato"],
    ["Apoyos abiertos", openSupport, "Mensajes sin cerrar"],
    ["Revision docente", pendingReview, "Actividades por revisar"],
    ["Sin actividad", noActivity, "Estudiantes sin evidencia reciente"]
  ]
    .map(
      ([label, value, text]) => `
      <article class="queue-card">
        <p class="eyebrow">${label}</p>
        <strong>${value}</strong>
        <span>${text}</span>
      </article>
    `
    )
    .join("");
}

function renderTeacherFilters() {
  const filters = [
    { id: "all", label: "Todos" },
    { id: "risk", label: "En riesgo" },
    { id: "support", label: "Con apoyo pendiente" },
    { id: "review", label: "Requieren revision" }
  ];

  elements.teacherFilters.innerHTML = filters
    .map(
      (filter) => `
      <button class="ghost-button teacher-filter ${state.teacherFilter === filter.id ? "is-active" : ""}" data-filter="${filter.id}">
        ${filter.label}
      </button>
    `
    )
    .join("");

  document.querySelectorAll(".teacher-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.teacherFilter = button.dataset.filter;
      renderTeacherFilters();
      renderTeacherStudents();
    });
  });
}

async function selectTeacherStudent(studentId, target = "teacher-detail-panel") {
  if (state.selectedStudentId !== studentId) {
    state.selectedSupportRequestId = null;
  }
  state.selectedStudentId = studentId;
  renderTeacherStudents();
  await loadTeacherStudentDetail(studentId);
  scrollToTarget(target);
}

function renderTeacherStudents() {
  const students = getFilteredStudents();
  if (!students.length) {
    elements.teacherStudents.innerHTML = '<div class="student-card"><p class="muted">No hay estudiantes para el filtro seleccionado.</p></div>';
    return;
  }

  elements.teacherStudents.innerHTML = students
    .map(
      (student) => `
      <article class="student-card ${state.selectedStudentId === student.studentId ? "is-selected" : ""}" data-student-id="${student.studentId}">
        <header>
          <div>
            <p class="eyebrow">${student.studentId}</p>
            <h3>${student.studentName}</h3>
          </div>
          <span class="pill ${student.risk.level !== "bajo" ? "warning" : ""}">Riesgo ${student.risk.level}</span>
        </header>
        ${
          state.selectedStudentId === student.studentId
            ? '<div class="selection-banner">Expediente activo en el panel inferior</div>'
            : ""
        }
        <div class="tag-row">
          <span class="mini-tag">Diagnostico ${student.traceability.diagnostic}</span>
          <span class="mini-tag">Ruta ${student.traceability.recommendation}</span>
          <span class="mini-tag">Actividad ${student.traceability.evaluation}</span>
        </div>
        <div class="progress-bar"><span style="width:${Math.round(student.masteryAverage * 100)}%"></span></div>
        <div class="teacher-student-meta">
          <p><strong>Dominio</strong> ${Math.round(student.masteryAverage * 100)}%</p>
          <p><strong>Actividad</strong> ${student.activityScore ?? "pendiente"} ${student.activityLevel ? `/ ${student.activityLevel}` : ""}</p>
          <p><strong>Recursos</strong> ${student.completedResources}/${student.recommendedResources}</p>
          <p><strong>Apoyos</strong> ${(student.supportRequests || []).filter((request) => request.status !== "resolved").length}</p>
        </div>
        <div class="student-card-actions">
          <button type="button" class="mini-action teacher-quick-open" data-student-id="${student.studentId}" data-target="teacher-detail-panel">Abrir detalle</button>
          <button type="button" class="mini-action teacher-quick-open" data-student-id="${student.studentId}" data-target="teacher-intervention-panel">Ir a intervencion</button>
        </div>
        <p class="student-card-note">
          ${
            student.teacherReviewNeeded
              ? "Conviene revisar la evidencia reciente y definir una orientacion docente."
              : "El caso mantiene trazabilidad al dia y puede seguir en monitoreo."
          }
        </p>
        <button class="ghost-button teacher-select" data-student-id="${student.studentId}">Abrir expediente</button>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".teacher-select").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectTeacherStudent(button.dataset.studentId, "teacher-detail-panel");
    });
  });

  document.querySelectorAll(".teacher-quick-open").forEach((button) => {
    button.addEventListener("click", async () => {
      await selectTeacherStudent(button.dataset.studentId, button.dataset.target);
    });
  });
}

function formatInterventionStatus(status) {
  if (!status) {
    return "Sin registro docente previo";
  }

  if (status === "en seguimiento") {
    return "En seguimiento";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function selectTeacherSupportRequest(studentId, supportRequestId, target = "teacher-intervention-panel") {
  if (state.selectedStudentId !== studentId) {
    state.selectedStudentId = studentId;
  }
  state.selectedSupportRequestId = supportRequestId || null;
  renderTeacherStudents();
  loadTeacherStudentDetail(studentId).then(() => {
    scrollToTarget(target);
  });
}

function formatSupportStatus(status) {
  if (status === "open") {
    return "Abierta";
  }
  if (status === "in_review") {
    return "En revision";
  }
  if (status === "resolved") {
    return "Resuelta";
  }
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Sin estado";
}

function formatShortDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTeacherDetail(student) {
  if (!student) {
    renderTeacherBreadcrumb(null);
    elements.teacherDetail.innerHTML = `
      <div class="resource-card empty-detail-state">
        <p class="eyebrow">Sin expediente activo</p>
        <h3>Abre una ficha desde la bandeja superior</h3>
        <p class="muted">El detalle del estudiante y el formulario de intervencion aparecen aqui solo despues de que selecciones un caso concreto en el panel de atencion.</p>
      </div>
    `;
    return;
  }
  renderTeacherBreadcrumb(student);

  const supportRequests = (student.supportRequests || []).filter(
    (request) => String(request.topic || "").trim() || String(request.message || "").trim()
  );
  const openSupportRequests = supportRequests.filter((request) => request.status !== "resolved");
  const teacherInterventions = (student.teacherInterventions || []).filter(
    (item) => String(item.note || "").trim() || String(item.nextStep || "").trim()
  );
  const selectedSupportRequest =
    supportRequests.find((request) => request.id === state.selectedSupportRequestId) ||
    supportRequests.find((request) => request.status !== "resolved") ||
    null;
  state.selectedSupportRequestId = selectedSupportRequest?.id || null;
  const latestIntervention = teacherInterventions.length
    ? teacherInterventions[teacherInterventions.length - 1]
    : null;
  const focusCompetency = student.studyPlan?.focusCompetencyName || "Sin foco declarado";
  const showFollowUpGuide = latestIntervention?.status === "en seguimiento";
  const actionSummary =
    latestIntervention?.status === "cerrado"
      ? "La ultima intervencion quedo cerrada. Verifica si el estudiante mantiene estabilidad o si conviene reabrir seguimiento."
      : student.risk.level === "alto"
        ? "Caso prioritario: conviene revisar evidencia, responder apoyos abiertos y dejar una intervencion con siguiente paso."
        : student.teacherReviewNeeded
          ? "Hay evidencia que necesita validacion docente. Revisa la actividad y registra una orientacion breve."
          : "El estudiante mantiene un recorrido estable. Puedes usar esta vista para seguimiento y cierre de apoyos.";
  const supportSummary = openSupportRequests.length
    ? `${openSupportRequests.length} apoyo(s) abierto(s) por revisar`
    : "Sin apoyos abiertos en este momento";
  const studentNote = student.studyPlan?.personalNote || "Sin nota registrada.";
  const weeklyGoal = student.studyPlan?.weeklyGoal || "Sin meta semanal registrada.";
  const activitySummary = student.activityScore == null ? "Pendiente" : `${student.activityScore}/100 / ${student.activityLevel || "sin nivel"}`;

  elements.teacherDetail.innerHTML = `
    <article class="resource-card active-student-banner detail-context-card">
      <div class="active-student-main">
        <div>
          <p class="eyebrow">Expediente activo</p>
          <h3>${student.studentName}</h3>
          <p class="muted">Todo lo que registres en esta vista quedara asociado a este expediente (${student.studentId}). ${supportSummary}.</p>
        </div>
        <div class="active-student-badges">
          <span class="pill ${student.risk.level !== "bajo" ? "warning" : ""}">Riesgo ${student.risk.level}</span>
          <span class="pill">Expediente ${student.studentId}</span>
        </div>
      </div>
    </article>
    <article class="resource-card callout-card detail-reading-card">
      <header>
        <div>
          <p class="eyebrow">Lectura actual del caso</p>
          <h3>Que necesita este estudiante ahora</h3>
        </div>
        <span class="pill ${student.risk.level !== "bajo" ? "warning" : ""}">Riesgo ${student.risk.level}</span>
      </header>
      <p class="muted">${actionSummary}</p>
      <div class="teacher-summary-grid">
        <div class="plain-block">
          <strong>Meta semanal</strong>
          <p class="muted">${weeklyGoal}</p>
        </div>
        <div class="plain-block">
          <strong>Competencia foco</strong>
          <p class="muted">${focusCompetency}</p>
        </div>
        <div class="plain-block">
          <strong>Actividad</strong>
          <p class="muted">${activitySummary}</p>
        </div>
        <div class="plain-block">
          <strong>Estado docente</strong>
          <p class="muted">${formatInterventionStatus(latestIntervention?.status)}</p>
        </div>
      </div>
      <p><strong>Nota del estudiante:</strong> ${studentNote}</p>
    </article>
    ${
      showFollowUpGuide
        ? `
        <article class="resource-card followup-guide">
          <header>
            <div>
              <p class="eyebrow">Caso en seguimiento</p>
              <h3>Que debe hacer ahora el docente</h3>
            </div>
            <span class="pill warning">Revision activa</span>
          </header>
          <div class="stack action-list">
            <div class="plain-block">
              <strong>1. Revisar la evidencia mas reciente</strong>
              <p class="muted">Confirma cambios en diagnostico, recursos completados y actividad posterior antes de mantener o cerrar el caso.</p>
            </div>
            <div class="plain-block">
              <strong>2. Verificar el proximo paso acordado</strong>
              <p class="muted">${latestIntervention?.nextStep || "No hay proximo paso registrado. Conviene definir uno en esta revision."}</p>
            </div>
            <div class="plain-block">
              <strong>3. Decidir si continua o se cierra</strong>
              <p class="muted">Si hubo avance suficiente, cambia el estado a cerrado. Si no, registra una nueva orientacion y deja seguimiento activo.</p>
            </div>
          </div>
        </article>
      `
        : ""
    }
    ${
      supportRequests.length || teacherInterventions.length
        ? `
        <div class="content-grid detail-grid">
          ${
            supportRequests.length
              ? `
              <section class="resource-card">
                <header class="detail-section-head">
                  <div>
                    <p class="eyebrow">Solicitudes de apoyo</p>
                    <h3>Mensajes que requieren lectura docente</h3>
                  </div>
                  <span class="pill warning">${supportRequests.length}</span>
                </header>
                <div class="stack">
                  ${supportRequests
                    .slice()
                    .reverse()
                    .map(
                      (request) => {
                        const createdAt = formatShortDate(request.createdAt);
                        const updatedAt = formatShortDate(request.updatedAt);
                        return `
                          <article class="plain-block detail-history-card">
                            <div class="detail-history-head">
                              <div>
                                <strong>${request.topic}</strong>
                                <p class="detail-history-meta">${createdAt ? `Creada ${createdAt}` : "Solicitud registrada"}</p>
                              </div>
                              <span class="pill ${request.status === "resolved" ? "" : "warning"}">${formatSupportStatus(request.status)}</span>
                            </div>
                            <p class="muted">${request.message}</p>
                            ${
                              request.teacherResponse
                                ? `
                                <div class="detail-response-card">
                                  <p class="eyebrow">Respuesta docente vinculada</p>
                                  <strong>${escapeHtml(request.teacherResponse.teacherName || "Docente")}</strong>
                                  <p class="muted">${escapeHtml(request.teacherResponse.note)}</p>
                                  ${
                                    request.teacherResponse.nextStep
                                      ? `<p class="detail-history-foot"><strong>Siguiente paso:</strong> ${escapeHtml(request.teacherResponse.nextStep)}</p>`
                                      : ""
                                  }
                                </div>
                              `
                                : ""
                            }
                            ${
                              request.status !== "resolved"
                                ? `<button type="button" class="ghost-button support-response-button" data-support-request-id="${request.id}">Responder esta solicitud</button>`
                                : ""
                            }
                            ${
                              updatedAt && updatedAt !== createdAt
                                ? `<p class="detail-history-foot">Ultima actualizacion: ${updatedAt}</p>`
                                : ""
                            }
                          </article>
                        `;
                      }
                    )
                    .join("")}
                </div>
              </section>
            `
              : ""
          }
          ${
            teacherInterventions.length
              ? `
              <section class="resource-card">
                <header class="detail-section-head">
                  <div>
                    <p class="eyebrow">Intervenciones docentes</p>
                    <h3>Orientaciones ya registradas</h3>
                  </div>
                  <span class="pill">${teacherInterventions.length}</span>
                </header>
                <div class="stack">
                  ${teacherInterventions
                    .slice()
                    .reverse()
                    .map(
                      (item) => {
                        const createdAt = formatShortDate(item.createdAt);
                        return `
                          <article class="plain-block detail-history-card">
                            <div class="detail-history-head">
                              <div>
                                <strong>${formatInterventionStatus(item.status)}</strong>
                                <p class="detail-history-meta">${createdAt ? `Registrada ${createdAt}` : "Intervencion registrada"}</p>
                              </div>
                              <span class="pill ${item.status === "cerrado" ? "" : "warning"}">${formatInterventionStatus(item.status)}</span>
                            </div>
                            <p class="muted">${item.note}</p>
                            ${
                              item.nextStep
                                ? `<p class="detail-history-foot"><strong>Siguiente paso:</strong> ${item.nextStep}</p>`
                                : ""
                            }
                          </article>
                        `;
                      }
                    )
                    .join("")}
                </div>
              </section>
            `
              : ""
          }
        </div>
      `
        : ""
    }
    <article class="resource-card">
      <header>
        <div>
          <p class="eyebrow">Resumen accionable</p>
          <h3>Que conviene hacer ahora</h3>
        </div>
        <span class="pill ${openSupportRequests.length ? "warning" : ""}">
          ${openSupportRequests.length ? `${openSupportRequests.length} apoyo(s) abierto(s)` : "Sin apoyos abiertos"}
        </span>
      </header>
      <div class="stack action-list">
        <div class="plain-block">
          <strong>1. Revisar la evidencia actual</strong>
          <p class="muted">Diagnostico ${student.traceability.diagnostic}, ruta ${student.traceability.recommendation} y actividad ${student.traceability.evaluation}.</p>
        </div>
        <div class="plain-block">
          <strong>2. Confirmar prioridad academica</strong>
          <p class="muted">Dominio promedio ${Math.round(student.masteryAverage * 100)}% con ${student.completedResources}/${student.recommendedResources} recursos completados.</p>
        </div>
        <div class="plain-block">
          <strong>3. Registrar la decision docente</strong>
          <p class="muted">Deja una nota breve, define proximo paso y, si aplica, cierra la solicitud de apoyo asociada.</p>
        </div>
      </div>
    </article>
    <form id="teacher-intervention-form" class="stack form-subgrid intervention-form-card">
      <div id="teacher-intervention-panel" class="section-heading compact">
        <p class="eyebrow">Intervencion docente</p>
        <h3>Registra orientacion y siguiente paso</h3>
        <p class="intervention-student-label">Estudiante activo: <strong>${student.studentName}</strong> (${student.studentId})</p>
      </div>
      ${
        selectedSupportRequest
          ? `
          <article class="plain-block linked-support-card">
            <p class="eyebrow">Responder solicitud del estudiante</p>
            <strong>${selectedSupportRequest.topic}</strong>
            <p class="muted">${selectedSupportRequest.message}</p>
            <div class="linked-support-actions">
              <span class="pill warning">${formatSupportStatus(selectedSupportRequest.status)}</span>
              <button type="button" class="mini-action" id="clear-support-selection">Responder sin vincular</button>
            </div>
          </article>
        `
          : ""
      }
      <label>
        Estado de la intervencion
        <select name="status">
          <option value="planificado">Planificado</option>
          <option value="en seguimiento">En seguimiento</option>
          <option value="cerrado">Cerrado</option>
        </select>
      </label>
      <label>
        Nota docente
        <textarea name="note" placeholder="Describe la orientacion o decision pedagogica..." required></textarea>
      </label>
      <label>
        Proximo paso
        <input type="text" name="nextStep" placeholder="Ej: revisar nueva entrega el lunes" />
      </label>
      <label>
        Vincular a solicitud de apoyo
        <select name="supportRequestId">
          <option value="">Sin vincular</option>
          ${(student.supportRequests || [])
            .filter((request) => request.status !== "resolved")
            .map(
              (request) =>
                `<option value="${request.id}" ${request.id === selectedSupportRequest?.id ? "selected" : ""}>${request.topic}</option>`
            )
            .join("")}
        </select>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" name="resolveSupportRequest" />
        Marcar solicitud vinculada como resuelta
      </label>
      <button type="submit" class="primary-button">Registrar intervencion para ${student.studentName}</button>
    </form>
  `;

  document.querySelectorAll(".support-response-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSupportRequestId = button.dataset.supportRequestId;
      renderTeacherDetail(student);
      scrollToTarget("teacher-intervention-panel");
    });
  });

  document.querySelector("#clear-support-selection")?.addEventListener("click", () => {
    state.selectedSupportRequestId = null;
    renderTeacherDetail(student);
  });

  document.querySelector('#teacher-intervention-form select[name="supportRequestId"]')?.addEventListener("change", (event) => {
    state.selectedSupportRequestId = event.currentTarget.value || null;
    renderTeacherDetail(student);
  });

  document.querySelector("#teacher-intervention-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    await api(`/api/teacher/student/${student.studentId}/intervention`, {
      method: "POST",
      body: JSON.stringify({
        status: formData.get("status"),
        note: formData.get("note"),
        nextStep: formData.get("nextStep"),
        supportRequestId: formData.get("supportRequestId"),
        resolveSupportRequest: formData.get("resolveSupportRequest") === "on"
      })
    });
    state.selectedSupportRequestId = null;
    await loadTeacherDashboard();
    await loadTeacherStudentDetail(student.studentId);
  });
}

async function loadTeacherStudentDetail(studentId) {
  const student = await api(`/api/teacher/student/${studentId}`);
  renderTeacherDetail(student);
}

async function loadTeacherDashboard() {
  const dashboard = await api("/api/teacher/dashboard");
  state.teacherStudents = dashboard.students || [];
  const selectedStillExists = state.teacherStudents.some((student) => student.studentId === state.selectedStudentId);
  if (!selectedStillExists) {
    state.selectedStudentId = null;
  }
  renderTeacherMetrics(dashboard.metrics);
  renderTeacherJourney(dashboard.metrics);
  renderTeacherQueueSummary();
  renderTeacherFilters();
  renderTeacherStudents();
  if (state.selectedStudentId) {
    await loadTeacherStudentDetail(state.selectedStudentId);
  } else {
    renderTeacherDetail(null);
  }
}

async function loadTeacherDashboardSilently() {
  if (state.user?.role === "teacher") {
    await loadTeacherDashboard();
  }
}

function resetUi() {
  state.token = null;
  state.user = null;
  state.diagnosticAttemptId = null;
  state.activityLoaded = false;
  state.teacherFilter = "all";
  state.selectedStudentId = null;
  state.selectedSupportRequestId = null;
  state.teacherStudents = [];
  elements.loginForm.reset();
  elements.loginError.textContent = "";
  elements.studentOverview.innerHTML = "";
  elements.studentJourney.innerHTML = "";
  elements.studentNextStep.innerHTML = "";
  elements.diagnosticBox.innerHTML = "";
  elements.diagnosticBox.classList.add("hidden");
  elements.activityBox.innerHTML = "";
  elements.studentPlanBox.innerHTML = "";
  elements.resourceProgressBox.innerHTML = "";
  elements.supportBox.innerHTML = "";
  elements.teacherMetrics.innerHTML = "";
  elements.teacherJourney.innerHTML = "";
  elements.teacherQueueSummary.innerHTML = "";
  elements.teacherFilters.innerHTML = "";
  elements.teacherStudents.innerHTML = "";
  elements.teacherBreadcrumb.innerHTML = "";
  elements.teacherDetail.innerHTML = "";
  showView(null);
}

async function handleLogin(email, password) {
  const payload = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  state.token = payload.token;
  state.user = payload.user;

  if (payload.user.role === "student") {
    elements.studentName.textContent = payload.user.name;
    showView("student");
    await loadStudentSummary();
    return;
  }

  elements.teacherName.textContent = payload.user.name;
  showView("teacher");
  await loadTeacherDashboard();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.loginError.textContent = "";
  const formData = new FormData(event.currentTarget);
  try {
    await handleLogin(formData.get("email"), formData.get("password"));
  } catch (error) {
    elements.loginError.textContent = error.message;
  }
});

document.querySelectorAll("[data-demo-email]").forEach((button) => {
  button.addEventListener("click", async () => {
    const credentials = {
      email: button.dataset.demoEmail,
      password: button.dataset.demoPassword || "demo123"
    };
    try {
      await handleLogin(credentials.email, credentials.password);
    } catch (error) {
      elements.loginError.textContent = error.message;
    }
  });
});

document.querySelector("#start-diagnostic").addEventListener("click", startDiagnostic);
document.querySelector("#logout-student").addEventListener("click", resetUi);
document.querySelector("#logout-teacher").addEventListener("click", resetUi);
document.querySelector("#refresh-teacher").addEventListener("click", loadTeacherDashboard);
initializeSectionNav();
wireScrollTargets();
