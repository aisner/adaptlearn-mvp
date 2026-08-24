const http = require("http");

function rawRequest(path, { method = "GET", token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: 8000,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": payload.length } : {})
        }
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const json = text ? JSON.parse(text) : {};
          resolve({ status: response.statusCode, body: json });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(5000, () => {
      request.destroy(new Error(`Timeout en ${method} ${path}`));
    });
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

async function expectStatus(label, expectedStatus, path, options) {
  const response = await rawRequest(path, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: esperaba ${expectedStatus} y recibio ${response.status} con ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function login(email, password) {
  const body = await expectStatus("login", 200, "/api/login", {
    method: "POST",
    body: { email, password }
  });
  return body.token;
}

async function main() {
  const studentToken = await login("laura@adaptlearn.local", "demo123");
  const teacherToken = await login("carlos@adaptlearn.local", "demo123");

  const activity = await expectStatus("actividad", 200, "/api/student/activity", { token: studentToken });
  const dashboard = await expectStatus("dashboard docente", 200, "/api/teacher/dashboard", { token: teacherToken });
  const studentId = dashboard.students[0]?.studentId;

  if (!studentId) {
    throw new Error("No se encontro un estudiante de prueba para validar intervenciones.");
  }

  await expectStatus("actividad vacia", 400, "/api/student/activity/submit", {
    method: "POST",
    token: studentToken,
    body: { answers: [] }
  });

  await expectStatus("actividad incompleta", 400, "/api/student/activity/submit", {
    method: "POST",
    token: studentToken,
    body: {
      answers: [{ itemId: activity.items[0].id, value: "1" }]
    }
  });

  await expectStatus("solicitud de apoyo vacia", 400, "/api/student/support-request", {
    method: "POST",
    token: studentToken,
    body: { topic: "", message: "" }
  });

  await expectStatus("plan invalido por horas", 400, "/api/student/study-plan", {
    method: "POST",
    token: studentToken,
    body: { weeklyGoal: "Practicar", availableHours: -2, focusCompetencyId: "", personalNote: "" }
  });

  await expectStatus("plan invalido por competencia", 400, "/api/student/study-plan", {
    method: "POST",
    token: studentToken,
    body: { weeklyGoal: "Practicar", availableHours: 4, focusCompetencyId: "inventada", personalNote: "" }
  });

  await expectStatus("intervencion vacia", 400, `/api/teacher/student/${studentId}/intervention`, {
    method: "POST",
    token: teacherToken,
    body: { status: "planificado", note: "", nextStep: "" }
  });

  await expectStatus("acceso estudiante a docente", 403, "/api/teacher/dashboard", {
    token: studentToken
  });

  await expectStatus("acceso docente a estudiante", 403, "/api/student/summary", {
    token: teacherToken
  });

  console.log("Validaciones criticas verificadas correctamente.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
