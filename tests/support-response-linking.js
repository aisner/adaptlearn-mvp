const http = require("http");

function request(path, { method = "GET", token, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
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
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const json = text ? JSON.parse(text) : {};
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        });
      }
    );

    req.setTimeout(5000, () => {
      req.destroy(new Error(`Timeout en ${method} ${path}`));
    });
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  const studentLogin = await request("/api/login", {
    method: "POST",
    body: { email: "laura@adaptlearn.local", password: "demo123" }
  });
  const teacherLogin = await request("/api/login", {
    method: "POST",
    body: { email: "carlos@adaptlearn.local", password: "demo123" }
  });

  const support = await request("/api/student/support-request", {
    method: "POST",
    token: studentLogin.token,
    body: {
      topic: "Duda con ciclos",
      message: "No entiendo cuando usar while y for."
    }
  });

  await request(`/api/teacher/student/student-01/intervention`, {
    method: "POST",
    token: teacherLogin.token,
    body: {
      status: "en seguimiento",
      note: "Revisa primero los ejemplos guiados y compara casos de uso.",
      nextStep: "Resolver dos ejercicios antes del jueves.",
      supportRequestId: support.supportRequest.id,
      resolveSupportRequest: false
    }
  });

  const summary = await request("/api/student/summary", { token: studentLogin.token });
  const linkedRequest = (summary.supportRequests || []).find((request) => request.id === support.supportRequest.id);

  if (!linkedRequest?.teacherResponse) {
    throw new Error("La solicitud no quedo vinculada con respuesta docente.");
  }

  if (linkedRequest.teacherResponse.note !== "Revisa primero los ejemplos guiados y compara casos de uso.") {
    throw new Error("La nota docente vinculada no coincide.");
  }

  console.log("Vinculo solicitud-respuesta verificado correctamente.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
