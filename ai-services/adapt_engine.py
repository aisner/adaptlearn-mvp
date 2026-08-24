import json
import math
import os
import re
from urllib import error, request

_OLLAMA_TAGS_CACHE = None


def normalize(value: str) -> str:
    text = (value or "").lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize(value: str):
    return [token for token in normalize(value).split(" ") if token]


def sigmoid(value: float) -> float:
    if value >= 0:
        exp = math.exp(-value)
        return 1 / (1 + exp)
    exp = math.exp(value)
    return exp / (1 + exp)


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def calibrate_mastery(raw_mastery: float, asked: int) -> float:
    if not asked:
        return 0.4

    evidence_weight = min(asked / 3, 1)
    return round(raw_mastery * evidence_weight + 0.45 * (1 - evidence_weight), 2)


def item_parameters(item):
    difficulty_map = {1: -0.9, 2: 0.0, 3: 0.9}
    difficulty = item.get("irtDifficulty", difficulty_map.get(item.get("difficulty", 2), 0.0))
    discrimination = item.get("discrimination", round(0.9 + item.get("difficulty", 2) * 0.18, 2))
    return discrimination, difficulty


def estimate_theta(items, responses):
    if not responses:
        return {"theta": 0.0, "standardError": 1.0}

    by_id = {item["id"]: item for item in items}
    theta = 0.0
    information = 0.0

    for _ in range(16):
        gradient = -theta
        hessian = -1.0
        information = 0.0

        for response in responses:
            item = by_id.get(response["itemId"])
            if not item:
                continue
            discrimination, difficulty = item_parameters(item)
            probability = sigmoid(discrimination * (theta - difficulty))
            variance = probability * (1 - probability)
            gradient += discrimination * ((1 if response["correct"] else 0) - probability)
            hessian -= discrimination * discrimination * variance
            information += discrimination * discrimination * variance

        if abs(hessian) < 1e-6:
            break

        next_theta = theta - (gradient / hessian)
        if abs(next_theta - theta) < 1e-3:
            theta = next_theta
            break

        theta = clamp(next_theta, -3.0, 3.0)

    standard_error = round(1 / math.sqrt(max(information, 0.2)), 2)
    return {"theta": round(clamp(theta, -3.0, 3.0), 2), "standardError": standard_error}


def build_competency_stats(competencies, items, responses):
    scoped_items = {}
    for item in items:
        scoped_items.setdefault(item["competencyId"], []).append(item)

    stats = []
    for competency in competencies:
        scoped_responses = [response for response in responses if response["competencyId"] == competency["id"]]
        correct = len([response for response in scoped_responses if response["correct"]])
        accuracy = correct / len(scoped_responses) if scoped_responses else 0
        theta_stats = estimate_theta(scoped_items.get(competency["id"], []), scoped_responses)
        raw_mastery = round(sigmoid(theta_stats["theta"]), 2) if scoped_responses else 0.4
        mastery = calibrate_mastery(raw_mastery, len(scoped_responses))
        evidence_level = "stable" if len(scoped_responses) >= 3 else "developing" if len(scoped_responses) == 2 else "preliminary"
        stats.append(
            {
                "competencyId": competency["id"],
                "competencyName": competency["name"],
                "asked": len(scoped_responses),
                "correct": correct,
                "accuracy": round(accuracy, 2),
                "theta": theta_stats["theta"],
                "standardError": theta_stats["standardError"],
                "rawMastery": raw_mastery,
                "mastery": mastery,
                "evidenceLevel": evidence_level,
            }
        )
    return stats


def choose_diagnostic_item(competencies, items, responses, max_items):
    if len(responses) >= max_items:
        return {"done": True, "competencyScores": build_competency_stats(competencies, items, responses)}

    answered_ids = {response["itemId"] for response in responses}
    competency_scores = build_competency_stats(competencies, items, responses)

    def priority(entry):
        novelty_bonus = 0.12 if entry["asked"] == 0 else 0
        uncertainty = entry.get("standardError", 1.0) * 0.1
        return entry["mastery"] - novelty_bonus - uncertainty

    active = None
    for score in sorted(competency_scores, key=priority):
        remaining = [
            item for item in items if item["competencyId"] == score["competencyId"] and item["id"] not in answered_ids
        ]
        if remaining:
            active = score
            break

    if not active:
        return {"done": True, "competencyScores": competency_scores}

    candidates = [
        item for item in items if item["competencyId"] == active["competencyId"] and item["id"] not in answered_ids
    ]
    theta = active.get("theta", 0.0)
    for candidate in candidates:
        discrimination, difficulty = item_parameters(candidate)
        probability = sigmoid(discrimination * (theta - difficulty))
        candidate["__info"] = discrimination * discrimination * probability * (1 - probability)

    candidates.sort(key=lambda item: item["__info"], reverse=True)
    next_item = dict(candidates[0])
    next_item.pop("__info", None)
    return {"done": False, "competencyScores": competency_scores, "nextItem": next_item}


def build_question_signals(items, responses):
    by_id = {item["id"]: item for item in items or []}
    resource_signals = {}

    for response in responses or []:
      if response.get("correct"):
          continue

      item = by_id.get(response["itemId"])
      if not item:
          continue

      for index, link in enumerate(item.get("resourceLinks", [])):
          current = resource_signals.get(link["resourceId"], {"boost": 0.0, "prompts": []})
          difficulty_weight = 0.12 + item.get("difficulty", 1) * 0.05
          position_weight = 0.08 if index == 0 else 0.04
          next_boost = min(0.42, current["boost"] + difficulty_weight + position_weight)
          prompts = current["prompts"]
          if item["prompt"] not in prompts:
              prompts = [*prompts, item["prompt"]]
          resource_signals[link["resourceId"]] = {"boost": next_boost, "prompts": prompts}

    return resource_signals


def recommend_resources(resources, profile, items=None, responses=None):
    profile_map = {entry["competencyId"]: entry for entry in profile}
    resource_signals = build_question_signals(items or [], responses or [])
    enriched = []
    for resource in resources:
        competency_profile = profile_map.get(resource["competencyId"])
        mastery = competency_profile["mastery"] if competency_profile else 0.45
        weakness = 1 - mastery
        difficulty_alignment = max(0, 1 - abs(mastery * 3 - resource["difficulty"]) / 3)
        uncertainty = competency_profile.get("standardError", 1.0) / 3 if competency_profile else 0.25
        signal = resource_signals.get(resource["id"], {})
        question_boost = signal.get("boost", 0.0)
        topical_reason = (
            f' Tambien se prioriza porque fallaste una pregunta relacionada: "{signal["prompts"][0]}".'
            if signal.get("prompts")
            else ""
        )
        enriched.append(
            {
                **resource,
                "priorityScore": round(min(1, weakness * 0.5 + difficulty_alignment * 0.2 + uncertainty * 0.15 + question_boost), 2),
                "why": (
                    f"Refuerza {competency_profile['competencyName']} porque tu dominio estimado es {round(mastery * 100)}% "
                    f"con incertidumbre {competency_profile.get('standardError', 1.0)}.{topical_reason}"
                    if competency_profile
                    else f"Recurso sugerido por cobertura general del curso.{topical_reason}"
                ),
            }
        )
    enriched.sort(key=lambda entry: entry["priorityScore"], reverse=True)
    return enriched[:4]


def build_local_embedding(text: str):
    vector = {}
    for token in tokenize(text):
        vector[token] = vector.get(token, 0) + 1
    return vector


def cosine_similarity(left, right):
    if not left or not right:
        return 0.0

    if isinstance(left, dict):
        numerator = sum(left.get(key, 0) * right.get(key, 0) for key in set(left) | set(right))
        left_norm = math.sqrt(sum(value * value for value in left.values()))
        right_norm = math.sqrt(sum(value * value for value in right.values()))
        if not left_norm or not right_norm:
            return 0.0
        return numerator / (left_norm * right_norm)

    numerator = sum(l * r for l, r in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return numerator / (left_norm * right_norm)


def ollama_request(path_name, payload=None, method="POST"):
    base_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = request.Request(
        f"{base_url}{path_name}",
        method=method,
        headers={"Content-Type": "application/json"},
        data=data,
    )
    with request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def get_ollama_tags():
    global _OLLAMA_TAGS_CACHE
    if _OLLAMA_TAGS_CACHE is not None:
        return _OLLAMA_TAGS_CACHE

    try:
        payload = ollama_request("/api/tags", method="GET")
        _OLLAMA_TAGS_CACHE = payload.get("models", [])
    except (error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        _OLLAMA_TAGS_CACHE = []
    return _OLLAMA_TAGS_CACHE


def resolve_ollama_model(preferred=None):
    candidates = [preferred, os.getenv("OLLAMA_MODEL"), "mistral:7b", "gpt-oss:20b", "gemma4:latest"]
    available = {entry.get("name"): entry for entry in get_ollama_tags()}
    for candidate in candidates:
        if candidate and candidate in available:
            return candidate
    return None


def resolve_embed_model():
    preferred = os.getenv("OLLAMA_EMBED_MODEL")
    if preferred:
        return preferred

    selected = resolve_ollama_model()
    if selected:
        return selected
    return None


def get_semantic_embedding(text: str):
    embed_model = resolve_embed_model()
    if embed_model:
        try:
            payload = {"model": embed_model, "input": normalize(text)}
            response = ollama_request("/api/embed", payload)
            embeddings = response.get("embeddings") or []
            if embeddings:
                return embeddings[0]
        except (error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
            pass

    return build_local_embedding(text)


def generate_feedback_with_model(prompt: str):
    model_name = resolve_ollama_model()
    if not model_name:
        return None

    try:
        response = ollama_request(
            "/api/generate",
            {"model": model_name, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}},
        )
        return (response.get("response") or "").strip() or None
    except (error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError):
        return None


def fallback_feedback(item, coverage, similarity):
    if coverage >= 0.75 or similarity >= 0.75:
        return "Tu respuesta recupera las ideas clave y muestra una explicacion funcional para esta etapa del curso."
    if coverage >= 0.45 or similarity >= 0.55:
        return "Hay una base correcta, pero conviene explicar con mas claridad la reutilizacion, la division del problema y el mantenimiento."
    return "Necesitas reforzar la idea central: las funciones ayudan a reutilizar codigo, separar tareas y hacer mas mantenible la solucion."


def contextual_feedback(item, student_answer, score, max_score, coverage, similarity):
    prompt = (
        "Eres un asistente pedagogico de Programacion I. "
        "Genera retroalimentacion breve, concreta y verificable en espanol. "
        "No inventes conceptos y orienta el siguiente paso.\n"
        f"Pregunta: {item['prompt']}\n"
        f"Respuesta del estudiante: {student_answer or 'Sin respuesta'}\n"
        f"Respuesta de referencia: {item.get('referenceAnswer', '')}\n"
        f"Conceptos esperados: {', '.join(item.get('keyConcepts', []))}\n"
        f"Puntaje: {score}/{max_score}\n"
        f"Cobertura de conceptos: {round(coverage, 2)}\n"
        f"Similitud semantica: {round(similarity, 2)}\n"
        "Responde en maximo 55 palabras y termina con una recomendacion concreta."
    )
    generated = generate_feedback_with_model(prompt)
    return generated or fallback_feedback(item, coverage, similarity)


def evaluate_activity(activity, answers):
    answer_map = {answer["itemId"]: answer["value"] for answer in answers}
    total_score = 0
    results = []
    for item in activity["items"]:
        if item["type"] == "multiple_choice":
            selected = int(answer_map.get(item["id"], -1))
            correct = selected == item["correctOption"]
            score = item["points"] if correct else 0
            total_score += score
            results.append(
                {
                    "itemId": item["id"],
                    "competencyId": item["competencyId"],
                    "type": item["type"],
                    "score": score,
                    "maxScore": item["points"],
                    "correct": correct,
                    "semanticSimilarity": 1.0 if correct else 0.0,
                    "feedback": (
                        "Respuesta correcta. Elegiste la estructura adecuada para una cantidad conocida de repeticiones."
                        if correct
                        else "Revisa cuando usar ciclos for: funcionan mejor cuando conoces de antemano cuantas iteraciones necesitas."
                    ),
                }
            )
        else:
            raw = str(answer_map.get(item["id"], ""))
            normalized = normalize(raw)
            concepts = [concept for concept in item["keyConcepts"] if normalize(concept) in normalized]
            coverage = len(concepts) / len(item["keyConcepts"])
            similarity = cosine_similarity(
                get_semantic_embedding(raw), get_semantic_embedding(item.get("referenceAnswer", ""))
            )
            blended = coverage * 0.55 + similarity * 0.45
            score = round(item["points"] * blended)
            total_score += score
            results.append(
                {
                    "itemId": item["id"],
                    "competencyId": item["competencyId"],
                    "type": item["type"],
                    "score": score,
                    "maxScore": item["points"],
                    "correct": blended >= 0.6,
                    "semanticSimilarity": round(similarity, 2),
                    "feedback": contextual_feedback(item, raw, score, item["points"], coverage, similarity),
                }
            )

    level = "alto" if total_score >= 80 else "medio" if total_score >= 60 else "inicial"
    active_model = resolve_ollama_model()
    return {
        "score": total_score,
        "level": level,
        "feedbackEngine": f"ollama:{active_model}" if active_model else "local-fallback",
        "teacherReviewNeeded": any(item["type"] == "short_answer" and item["score"] < item["maxScore"] for item in results),
        "items": results,
        "summary": (
            "Mostraste un avance solido en el chequeo posterior a la ruta."
            if total_score >= 80
            else "Hay avance, aunque todavia conviene reforzar algunos conceptos antes de seguir."
            if total_score >= 60
            else "El resultado sugiere reforzar la ruta recomendada antes de pasar al siguiente bloque."
        ),
    }


def describe_ai_runtime():
    active_model = resolve_ollama_model()
    embed_model = resolve_embed_model()
    return {
        "ollamaAvailable": bool(get_ollama_tags()),
        "feedbackModel": active_model,
        "embeddingModel": embed_model,
    }
