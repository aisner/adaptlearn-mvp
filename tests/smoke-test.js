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
          const json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (res.statusCode >= 400) {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(json);
        });
      }
    );
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function main() {
  const login = await request("/api/login", {
    method: "POST",
    body: { email: "laura@adaptlearn.local", password: "demo123" }
  });

  const start = await request("/api/diagnostic/start", {
    method: "POST",
    token: login.token,
    body: {}
  });

  let current = start;
  while (!current.done) {
    current = await request("/api/diagnostic/answer", {
      method: "POST",
      token: login.token,
      body: {
        attemptId: start.attemptId,
        itemId: current.nextItem.id,
        answer: 0
      }
    });
  }

  const activity = await request("/api/student/activity", { token: login.token });
  const result = await request("/api/student/activity/submit", {
    method: "POST",
    token: login.token,
    body: {
      answers: activity.items.map((item) => ({
        itemId: item.id,
        value:
          item.type === "multiple_choice"
            ? "1"
            : "Las funciones permiten reutilizar codigo, separar responsabilidades y mejorar el mantenimiento."
      }))
    }
  });

  const teacher = await request("/api/login", {
    method: "POST",
    body: { email: "carlos@adaptlearn.local", password: "demo123" }
  });
  const dashboard = await request("/api/teacher/dashboard", { token: teacher.token });

  console.log(
    JSON.stringify(
      {
        studentProfile: current.profile,
        activityScore: result.score,
        teacherMetrics: dashboard.metrics
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
