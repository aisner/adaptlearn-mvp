import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from os import getenv

from adapt_engine import choose_diagnostic_item, describe_ai_runtime, evaluate_activity, recommend_resources


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length else b"{}"
        body = json.loads(raw.decode("utf-8"))

        if self.path == "/diagnostic/next":
            if "competencies" not in body or "items" not in body:
                self._send(400, {"error": "Payload incompleto para diagnostico"})
                return
            payload = choose_diagnostic_item(
                body["competencies"], body["items"], body.get("responses", []), body.get("maxItems", 6)
            )
            self._send(200, payload)
            return

        if self.path == "/recommendations":
            if "resources" not in body:
                self._send(400, {"error": "Payload incompleto para recomendaciones"})
                return
            payload = {
                "recommendations": recommend_resources(
                    body["resources"], body.get("profile", []), body.get("items", []), body.get("responses", [])
                )
            }
            self._send(200, payload)
            return

        if self.path == "/evaluate":
            if "activity" not in body:
                self._send(400, {"error": "Payload incompleto para evaluacion"})
                return
            payload = evaluate_activity(body["activity"], body.get("answers", []))
            self._send(200, payload)
            return

        self._send(404, {"error": "Ruta no encontrada"})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    port = int(getenv("PORT", "8001"))
    server = HTTPServer(("127.0.0.1", port), Handler)
    runtime = describe_ai_runtime()
    print(f"AdaptLearn AI service escuchando en http://127.0.0.1:{port}")
    print(
        "Ollama activo:"
        f" {'si' if runtime['ollamaAvailable'] else 'no'}"
        f" | modelo feedback: {runtime['feedbackModel'] or 'sin modelo'}"
        f" | modelo embeddings: {runtime['embeddingModel'] or 'sin modelo'}"
    )
    server.serve_forever()
