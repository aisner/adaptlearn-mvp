const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { chooseDiagnosticItem, recommendResources, evaluateActivity } = require("./adaptEngine");
const { createStateStore } = require("./stateStore");

const PORT = Number(process.env.PORT || 8000);
const AI_PORT = Number(process.env.AI_PORT || 8001);
const ROOT = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const TOKEN_SECRET = "adaptlearn-demo-secret";
const stateStore = createStateStore({ rootDir: ROOT });

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath);
  const contentType =
    extension === ".css"
      ? "text/css"
      : extension === ".js"
        ? "application/javascript"
        : "text/html";
  response.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(fs.readFileSync(filePath));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function createToken(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, issuedAt: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readToken(header) {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length);
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  if (signature !== expected) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function getAuthenticatedUser(request, state) {
  const token = readToken(request.headers.authorization);
  if (!token) {
    return null;
  }
  return state.users.find((user) => user.id === token.id) || null;
}

function withoutPassword(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function findStudentRecord(state, userId) {
  return state.students.find((student) => student.userId === userId);
}

function findUserById(state, userId) {
  return state.users.find((user) => user.id === userId) || null;
}

function sanitizeItem(item) {
  const { correctOption, ...safeItem } = item;
  return safeItem;
}

function computeRisk(studentRecord) {
  const masteryAverage = studentRecord.latestProfile?.length
    ? studentRecord.latestProfile.reduce((sum, entry) => sum + entry.mastery, 0) / studentRecord.latestProfile.length
    : 0.35;
  const activityScore = studentRecord.activitySubmission?.result?.score ?? 0;
  const reasons = [];
  if (masteryAverage < 0.55) {
    reasons.push("diagnostico con dominios bajos");
  }
  if (activityScore < 60) {
    reasons.push("resultado bajo en actividad posterior");
  }

  return {
    level: reasons.length >= 2 ? "alto" : reasons.length === 1 ? "medio" : "bajo",
    reasons
  };
}

function getCompetencyName(state, competencyId) {
  return state.competencies.find((competency) => competency.id === competencyId)?.name || competencyId;
}

function getCompetencyLabel(state, competencyId) {
  if (!competencyId) {
    return null;
  }
  return state.competencies.find((competency) => competency.id === competencyId)?.name || null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sendForbidden(response) {
  sendJson(response, 403, { error: "Acceso denegado" });
}

function validateActivityAnswers(activity, answers) {
  if (!Array.isArray(answers)) {
    return "Debes enviar las respuestas de la actividad.";
  }

  if (answers.length !== activity.items.length) {
    return "Debes responder todos los items de la actividad.";
  }

  const answerMap = new Map();
  for (const answer of answers) {
    if (!answer || typeof answer !== "object") {
      return "Formato de respuesta invalido.";
    }

    const itemId = normalizeText(answer.itemId);
    if (!itemId) {
      return "Cada respuesta debe indicar el item correspondiente.";
    }

    if (answerMap.has(itemId)) {
      return "No se permiten respuestas duplicadas para un mismo item.";
    }

    answerMap.set(itemId, answer.value);
  }

  for (const item of activity.items) {
    if (!answerMap.has(item.id)) {
      return "Debes responder todos los items de la actividad.";
    }

    const value = answerMap.get(item.id);
    if (item.type === "multiple_choice") {
      if (value === null || value === undefined || String(value).trim() === "") {
        return "Selecciona una opcion para cada pregunta de seleccion multiple.";
      }

      const optionIndex = Number(value);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= item.options.length) {
        return "Una de las opciones seleccionadas no es valida.";
      }
      continue;
    }

    if (!normalizeText(value)) {
      return "Completa las respuestas abiertas antes de enviar la actividad.";
    }
  }

  return null;
}

function buildStudentInsights(state, studentRecord) {
  const masteryAverage = studentRecord.latestProfile?.length
    ? studentRecord.latestProfile.reduce((sum, entry) => sum + entry.mastery, 0) / studentRecord.latestProfile.length
    : 0;
  const completedResources = Object.values(studentRecord.resourceProgress || {}).filter((entry) => entry.completed).length;
  const totalResources = studentRecord.recommendations?.length || 0;
  const supportOpen = (studentRecord.supportRequests || []).filter((request) => request.status !== "resolved").length;
  const nextCompetency =
    studentRecord.latestProfile?.slice().sort((left, right) => left.mastery - right.mastery)[0] || null;

  return {
    masteryAverage: Number(masteryAverage.toFixed(2)),
    completedResources,
    totalResources,
    supportOpen,
    nextCompetency: nextCompetency
      ? {
          competencyId: nextCompetency.competencyId,
          competencyName: nextCompetency.competencyName,
          mastery: nextCompetency.mastery
        }
      : null
  };
}

function formatStudentSummary(state, studentRecord) {
  const risk = computeRisk(studentRecord);
  const insights = buildStudentInsights(state, studentRecord);
  const recommendationProgress = (studentRecord.recommendations || []).map((resource) => ({
    ...resource,
    progress: studentRecord.resourceProgress?.[resource.id] || { completed: false, lastUpdatedAt: null, reflection: "" }
  }));
  const studyPlan = studentRecord.studyPlan
    ? {
        ...studentRecord.studyPlan,
        focusCompetencyName: getCompetencyLabel(state, studentRecord.studyPlan.focusCompetencyId)
      }
    : null;

  return {
    profile: studentRecord.latestProfile,
    recommendations: studentRecord.recommendations,
    recommendationProgress,
    activitySubmission: studentRecord.activitySubmission,
    risk,
    studyPlan,
    supportRequests: studentRecord.supportRequests || [],
    teacherInterventions: studentRecord.teacherInterventions || [],
    insights
  };
}

function formatTeacherStudent(state, studentRecord) {
  const user = findUserById(state, studentRecord.userId);
  const risk = computeRisk(studentRecord);
  const insights = buildStudentInsights(state, studentRecord);
  const studyPlan = studentRecord.studyPlan
    ? {
        ...studentRecord.studyPlan,
        focusCompetencyName: getCompetencyLabel(state, studentRecord.studyPlan.focusCompetencyId)
      }
    : null;

  return {
    studentId: studentRecord.userId,
    studentName: user?.name || studentRecord.userId,
    masteryAverage: insights.masteryAverage,
    diagnosticCompleted: Boolean(studentRecord.latestProfile),
    recommendedResources: studentRecord.recommendations.length,
    completedResources: insights.completedResources,
    activityScore: studentRecord.activitySubmission?.result?.score ?? null,
    activityLevel: studentRecord.activitySubmission?.result?.level ?? null,
    teacherReviewNeeded: studentRecord.activitySubmission?.result?.teacherReviewNeeded ?? false,
    risk,
    profile: studentRecord.latestProfile || [],
    studyPlan,
    supportRequests: studentRecord.supportRequests || [],
    latestSupportRequest: (studentRecord.supportRequests || []).slice(-1)[0] || null,
    teacherInterventions: studentRecord.teacherInterventions || [],
    traceability: {
      diagnostic: studentRecord.latestProfile ? "completado" : "pendiente",
      recommendation: studentRecord.recommendations.length ? "generada" : "pendiente",
      evaluation: studentRecord.activitySubmission ? "completada" : "pendiente"
    }
  };
}

function getRequestPathId(url, prefix) {
  if (!url.pathname.startsWith(prefix)) {
    return null;
  }
  return decodeURIComponent(url.pathname.slice(prefix.length));
}

async function callAiService(route, payload, fallback) {
  try {
    const result = await new Promise((resolve, reject) => {
      const serialized = JSON.stringify(payload);
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: AI_PORT,
          path: route,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(serialized)
          }
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            if (response.statusCode && response.statusCode >= 400) {
              reject(new Error(`AI service responded with ${response.statusCode}`));
              return;
            }
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          });
        }
      );
      request.on("error", reject);
      request.write(serialized);
      request.end();
    });
    return { ...result, engine: "python-service" };
  } catch {
    return { ...fallback(payload), engine: "local-fallback" };
  }
}

async function handleLogin(request, response, state) {
  const body = await parseBody(request);
  const user = state.users.find((entry) => entry.email === body.email && entry.password === body.password);
  if (!user) {
    sendJson(response, 401, { error: "Credenciales invalidas" });
    return;
  }
  sendJson(response, 200, {
    token: createToken(user),
    user: withoutPassword(user)
  });
}

async function handleDiagnosticStart(request, response, state, user) {
  const studentRecord = findStudentRecord(state, user.id);
  if (!studentRecord) {
    sendJson(response, 404, { error: "No se encontro registro del estudiante" });
    return;
  }

  const activeAttempt = studentRecord.diagnosticAttempts.find((attempt) => attempt.status === "in_progress");
  const attempt =
    activeAttempt ||
    {
      id: crypto.randomUUID(),
      status: "in_progress",
      startedAt: new Date().toISOString(),
      responses: []
    };

  if (!activeAttempt) {
    studentRecord.diagnosticAttempts.push(attempt);
    stateStore.saveState(state);
  }

  const next = await callAiService(
    "/diagnostic/next",
    {
      competencies: state.competencies,
      items: state.diagnosticItems,
      responses: attempt.responses,
      maxItems: state.meta.maxDiagnosticItems
    },
    ({ competencies, items, responses, maxItems }) => chooseDiagnosticItem({ competencies, items, responses, maxItems })
  );

  sendJson(response, 200, {
    attemptId: attempt.id,
    engine: next.engine,
    done: next.done,
    competencyScores: next.competencyScores,
    nextItem: next.nextItem ? sanitizeItem(next.nextItem) : null
  });
}

async function handleDiagnosticAnswer(request, response, state, user) {
  const body = await parseBody(request);
  const studentRecord = findStudentRecord(state, user.id);
  const attempt = studentRecord?.diagnosticAttempts.find((entry) => entry.id === body.attemptId && entry.status === "in_progress");
  if (!attempt) {
    sendJson(response, 404, { error: "Intento de diagnostico no disponible" });
    return;
  }

  const item = state.diagnosticItems.find((entry) => entry.id === body.itemId);
  if (!item) {
    sendJson(response, 404, { error: "Item no encontrado" });
    return;
  }

  if (attempt.responses.some((entry) => entry.itemId === item.id)) {
    sendJson(response, 409, { error: "El item ya fue respondido" });
    return;
  }

  const selectedOption = Number(body.answer);
  attempt.responses.push({
    itemId: item.id,
    competencyId: item.competencyId,
    difficulty: item.difficulty,
    selectedOption,
    correct: selectedOption === item.correctOption
  });
  stateStore.recordQuestionOutcome(item.id, selectedOption === item.correctOption);

  const next = await callAiService(
    "/diagnostic/next",
    {
      competencies: state.competencies,
      items: state.diagnosticItems,
      responses: attempt.responses,
      maxItems: state.meta.maxDiagnosticItems
    },
    ({ competencies, items, responses, maxItems }) => chooseDiagnosticItem({ competencies, items, responses, maxItems })
  );

  if (next.done) {
    attempt.status = "completed";
    attempt.completedAt = new Date().toISOString();
    attempt.competencyScores = next.competencyScores;
    studentRecord.latestProfile = next.competencyScores;

    const recommendations = await callAiService(
      "/recommendations",
      {
        competencies: state.competencies,
        resources: state.resources,
        profile: next.competencyScores,
        items: state.diagnosticItems,
        responses: attempt.responses
      },
      ({ resources, profile, items, responses }) => ({ recommendations: recommendResources({ resources, profile, items, responses }) })
    );

    studentRecord.recommendations = recommendations.recommendations;
    stateStore.saveState(state);

    sendJson(response, 200, {
      done: true,
      engine: next.engine,
      profile: next.competencyScores,
      recommendations: recommendations.recommendations
    });
    return;
  }

  stateStore.saveState(state);
  sendJson(response, 200, {
    done: false,
    engine: next.engine,
    nextItem: sanitizeItem(next.nextItem),
    competencyScores: next.competencyScores
  });
}

function handleStudentSummary(response, state, user) {
  const studentRecord = findStudentRecord(state, user.id);
  sendJson(response, 200, formatStudentSummary(state, studentRecord));
}

function handleActivity(response, state) {
  const activity = {
    ...state.activity,
    items: state.activity.items.map((item) =>
      item.type === "multiple_choice" ? { ...item, correctOption: undefined } : { ...item, referenceAnswer: undefined, keyConcepts: undefined }
    )
  };
  sendJson(response, 200, activity);
}

async function handleActivitySubmit(request, response, state, user) {
  const body = await parseBody(request);
  const studentRecord = findStudentRecord(state, user.id);
  const answers = Array.isArray(body.answers) ? body.answers : null;
  const answersError = validateActivityAnswers(state.activity, answers);

  if (answersError) {
    sendJson(response, 400, { error: answersError });
    return;
  }

  const evaluation = await callAiService(
    "/evaluate",
    {
      activity: state.activity,
      answers
    },
    ({ activity, answers }) => evaluateActivity({ activity, answers })
  );

  studentRecord.activitySubmission = {
    submittedAt: new Date().toISOString(),
    answers,
    result: evaluation
  };
  stateStore.saveState(state);

  sendJson(response, 200, evaluation);
}

async function handleStudyPlanUpdate(request, response, state, user) {
  const body = await parseBody(request);
  const studentRecord = findStudentRecord(state, user.id);
  const availableHours = Number(body.availableHours);
  const focusCompetencyId = normalizeText(body.focusCompetencyId);

  if (!Number.isFinite(availableHours) || availableHours < 0 || availableHours > 20) {
    sendJson(response, 400, { error: "Las horas disponibles deben estar entre 0 y 20." });
    return;
  }

  if (focusCompetencyId && !state.competencies.some((competency) => competency.id === focusCompetencyId)) {
    sendJson(response, 400, { error: "La competencia foco seleccionada no existe." });
    return;
  }

  studentRecord.studyPlan = {
    weeklyGoal: normalizeText(body.weeklyGoal),
    availableHours,
    focusCompetencyId: focusCompetencyId || null,
    personalNote: normalizeText(body.personalNote)
  };
  stateStore.saveState(state);
  sendJson(response, 200, { studyPlan: studentRecord.studyPlan });
}

async function handleResourceProgressUpdate(request, response, state, user) {
  const body = await parseBody(request);
  const studentRecord = findStudentRecord(state, user.id);
  const resource = state.resources.find((entry) => entry.id === body.resourceId);
  if (!resource) {
    sendJson(response, 404, { error: "Recurso no encontrado" });
    return;
  }

  studentRecord.resourceProgress = studentRecord.resourceProgress || {};
  studentRecord.resourceProgress[resource.id] = {
    completed: Boolean(body.completed),
    lastUpdatedAt: new Date().toISOString(),
    reflection: String(body.reflection || "").trim()
  };
  stateStore.saveState(state);
  sendJson(response, 200, { progress: studentRecord.resourceProgress[resource.id] });
}

async function handleSupportRequestCreate(request, response, state, user) {
  const body = await parseBody(request);
  const studentRecord = findStudentRecord(state, user.id);
  const topic = normalizeText(body.topic);
  const message = normalizeText(body.message);

  if (!topic || !message) {
    sendJson(response, 400, { error: "La solicitud de apoyo debe incluir tema y mensaje." });
    return;
  }

  const supportRequest = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    topic,
    message,
    status: "open",
    teacherResponse: null
  };
  studentRecord.supportRequests = studentRecord.supportRequests || [];
  studentRecord.supportRequests.push(supportRequest);
  stateStore.saveState(state);
  sendJson(response, 200, { supportRequest });
}

function handleTeacherDashboard(response, state) {
  const students = state.students.map((student) => formatTeacherStudent(state, student));

  const completedDiagnostics = students.filter((student) => student.diagnosticCompleted).length;
  const atRisk = students.filter((student) => student.risk.level !== "bajo").length;
  const averageScore = students.filter((student) => typeof student.activityScore === "number");
  const averageActivityScore = averageScore.length
    ? Number((averageScore.reduce((sum, student) => sum + student.activityScore, 0) / averageScore.length).toFixed(1))
    : null;
  const supportOpen = students.reduce((sum, student) => sum + student.supportRequests.filter((request) => request.status !== "resolved").length, 0);
  const resourcesCompleted = students.reduce((sum, student) => sum + student.completedResources, 0);

  sendJson(response, 200, {
    metrics: {
      students: students.length,
      diagnosticsCompleted: completedDiagnostics,
      studentsAtRisk: atRisk,
      averageActivityScore,
      supportOpen,
      resourcesCompleted
    },
    students
  });
}

function handleTeacherStudentDetail(response, state, studentId) {
  const studentRecord = findStudentRecord(state, studentId);
  if (!studentRecord) {
    sendJson(response, 404, { error: "Estudiante no encontrado" });
    return;
  }
  sendJson(response, 200, formatTeacherStudent(state, studentRecord));
}

async function handleTeacherInterventionCreate(request, response, state, user, studentId) {
  const studentRecord = findStudentRecord(state, studentId);
  if (!studentRecord) {
    sendJson(response, 404, { error: "Estudiante no encontrado" });
    return;
  }
  const body = await parseBody(request);
  const status = normalizeText(body.status || "planificado");
  const note = normalizeText(body.note);
  const nextStep = normalizeText(body.nextStep);
  const supportRequestId = normalizeText(body.supportRequestId);
  const validStatuses = new Set(["planificado", "en seguimiento", "cerrado"]);

  if (!validStatuses.has(status)) {
    sendJson(response, 400, { error: "El estado de la intervencion no es valido." });
    return;
  }

  if (!note) {
    sendJson(response, 400, { error: "La intervencion docente debe incluir una nota." });
    return;
  }

  if (status !== "cerrado" && !nextStep) {
    sendJson(response, 400, { error: "Debes definir un proximo paso para intervenciones abiertas o en seguimiento." });
    return;
  }

  let requestToUpdate = null;
  if (supportRequestId) {
    requestToUpdate = (studentRecord.supportRequests || []).find((request) => request.id === supportRequestId);
    if (!requestToUpdate) {
      sendJson(response, 400, { error: "La solicitud de apoyo vinculada no existe." });
      return;
    }
  }

  const intervention = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status,
    note,
    nextStep,
    supportRequestId: supportRequestId || null
  };
  studentRecord.teacherInterventions = studentRecord.teacherInterventions || [];
  studentRecord.teacherInterventions.push(intervention);

  if (requestToUpdate) {
    requestToUpdate.status = body.resolveSupportRequest ? "resolved" : "in_review";
    requestToUpdate.updatedAt = new Date().toISOString();
    requestToUpdate.teacherResponse = {
      note,
      nextStep,
      status,
      respondedAt: requestToUpdate.updatedAt,
      interventionId: intervention.id,
      teacherId: user.id,
      teacherName: user.name
    };
  }

  stateStore.saveState(state);
  sendJson(response, 200, { intervention });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    sendFile(response, path.join(FRONTEND_DIR, "index.html"));
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
    sendFile(response, path.join(FRONTEND_DIR, url.pathname));
    return;
  }

  const state = stateStore.loadState();
  const user = getAuthenticatedUser(request, state);

  try {
    if (request.method === "POST" && url.pathname === "/api/login") {
      await handleLogin(request, response, state);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      if (!user) {
        sendJson(response, 401, { error: "Sesion no valida" });
        return;
      }
      sendJson(response, 200, { user: withoutPassword(user) });
      return;
    }

    if (!user) {
      sendJson(response, 401, { error: "Autenticacion requerida" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/diagnostic/start") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleDiagnosticStart(request, response, state, user);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/diagnostic/answer") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleDiagnosticAnswer(request, response, state, user);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/student/summary") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      handleStudentSummary(response, state, user);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/student/activity") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      handleActivity(response, state);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/student/activity/submit") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleActivitySubmit(request, response, state, user);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/student/study-plan") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleStudyPlanUpdate(request, response, state, user);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/student/resource-progress") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleResourceProgressUpdate(request, response, state, user);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/student/support-request") {
      if (user.role !== "student") {
        sendForbidden(response);
        return;
      }
      await handleSupportRequestCreate(request, response, state, user);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/teacher/dashboard") {
      if (user.role !== "teacher") {
        sendForbidden(response);
        return;
      }
      handleTeacherDashboard(response, state);
      return;
    }

    const teacherStudentDetailId = getRequestPathId(url, "/api/teacher/student/");
    if (request.method === "GET" && teacherStudentDetailId && !teacherStudentDetailId.includes("/")) {
      if (user.role !== "teacher") {
        sendForbidden(response);
        return;
      }
      handleTeacherStudentDetail(response, state, teacherStudentDetailId);
      return;
    }

    const interventionPrefix = "/api/teacher/student/";
    if (request.method === "POST" && url.pathname.endsWith("/intervention")) {
      if (user.role !== "teacher") {
        sendForbidden(response);
        return;
      }
      const studentId = url.pathname.slice(interventionPrefix.length, -"/intervention".length);
      await handleTeacherInterventionCreate(request, response, state, user, decodeURIComponent(studentId));
      return;
    }

    sendJson(response, 404, { error: "Ruta no encontrada" });
  } catch (error) {
    sendJson(response, 500, {
      error: "Error interno del servidor",
      detail: error.message
    });
  }
});

server.listen(PORT, () => {
  console.log(`AdaptLearn backend escuchando en http://localhost:${PORT}`);
  console.log(`Persistencia SQLite activa en ${stateStore.dbPath}`);
});
