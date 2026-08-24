const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) => normalize(value).split(" ").filter(Boolean);

const sigmoid = (value) => {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
};

const clamp = (value, lower, upper) => Math.max(lower, Math.min(upper, value));

function calibrateMastery(rawMastery, asked) {
  if (!asked) {
    return 0.4;
  }

  const evidenceWeight = Math.min(asked / 3, 1);
  return Number((rawMastery * evidenceWeight + 0.45 * (1 - evidenceWeight)).toFixed(2));
}

function itemParameters(item) {
  const difficultyMap = { 1: -0.9, 2: 0, 3: 0.9 };
  return {
    difficulty: item.irtDifficulty ?? difficultyMap[item.difficulty || 2] ?? 0,
    discrimination: item.discrimination ?? Number((0.9 + (item.difficulty || 2) * 0.18).toFixed(2))
  };
}

function estimateTheta(items, responses) {
  if (!responses.length) {
    return { theta: 0, standardError: 1 };
  }

  const itemMap = new Map(items.map((item) => [item.id, item]));
  let theta = 0;
  let information = 0;

  for (let index = 0; index < 16; index += 1) {
    let gradient = -theta;
    let hessian = -1;
    information = 0;

    responses.forEach((response) => {
      const item = itemMap.get(response.itemId);
      if (!item) {
        return;
      }
      const { discrimination, difficulty } = itemParameters(item);
      const probability = sigmoid(discrimination * (theta - difficulty));
      const variance = probability * (1 - probability);
      gradient += discrimination * ((response.correct ? 1 : 0) - probability);
      hessian -= discrimination * discrimination * variance;
      information += discrimination * discrimination * variance;
    });

    if (Math.abs(hessian) < 1e-6) {
      break;
    }

    const nextTheta = theta - gradient / hessian;
    if (Math.abs(nextTheta - theta) < 1e-3) {
      theta = nextTheta;
      break;
    }

    theta = clamp(nextTheta, -3, 3);
  }

  return {
    theta: Number(clamp(theta, -3, 3).toFixed(2)),
    standardError: Number((1 / Math.sqrt(Math.max(information, 0.2))).toFixed(2))
  };
}

function buildCompetencyStats(competencies, items, responses) {
  return competencies.map((competency) => {
    const scopedResponses = responses.filter((response) => response.competencyId === competency.id);
    const scopedItems = items.filter((item) => item.competencyId === competency.id);
    const correct = scopedResponses.filter((response) => response.correct).length;
    const accuracy = scopedResponses.length ? correct / scopedResponses.length : 0;
    const thetaStats = estimateTheta(scopedItems, scopedResponses);
    const rawMastery = scopedResponses.length ? Number(sigmoid(thetaStats.theta).toFixed(2)) : 0.4;
    const mastery = calibrateMastery(rawMastery, scopedResponses.length);
    const evidenceLevel = scopedResponses.length >= 3 ? "stable" : scopedResponses.length === 2 ? "developing" : "preliminary";

    return {
      competencyId: competency.id,
      competencyName: competency.name,
      asked: scopedResponses.length,
      correct,
      accuracy: Number(accuracy.toFixed(2)),
      theta: thetaStats.theta,
      standardError: thetaStats.standardError,
      mastery,
      rawMastery,
      evidenceLevel
    };
  });
}

function chooseDiagnosticItem({ competencies, items, responses, maxItems }) {
  if (responses.length >= maxItems) {
    return {
      done: true,
      competencyScores: buildCompetencyStats(competencies, items, responses)
    };
  }

  const answeredIds = new Set(responses.map((response) => response.itemId));
  const competencyScores = buildCompetencyStats(competencies, items, responses);
  const ranked = [...competencyScores].sort((left, right) => {
    const leftPriority = left.mastery - (left.asked === 0 ? 0.12 : 0) - (left.standardError || 1) * 0.1;
    const rightPriority = right.mastery - (right.asked === 0 ? 0.12 : 0) - (right.standardError || 1) * 0.1;
    return leftPriority - rightPriority;
  });

  const activeCompetency = ranked.find((score) =>
    items.some((item) => item.competencyId === score.competencyId && !answeredIds.has(item.id))
  );

  if (!activeCompetency) {
    return {
      done: true,
      competencyScores
    };
  }

  const candidates = items
    .filter((item) => item.competencyId === activeCompetency.competencyId && !answeredIds.has(item.id))
    .map((item) => {
      const { discrimination, difficulty } = itemParameters(item);
      const probability = sigmoid(discrimination * (activeCompetency.theta - difficulty));
      return {
        ...item,
        __info: discrimination * discrimination * probability * (1 - probability)
      };
    })
    .sort((left, right) => right.__info - left.__info);

  const { __info, ...nextItem } = candidates[0];
  return {
    done: false,
    competencyScores,
    nextItem
  };
}

function buildQuestionSignals(items, responses) {
  const itemMap = new Map((items || []).map((item) => [item.id, item]));
  const resourceSignals = new Map();

  (responses || []).forEach((response) => {
    if (response.correct) {
      return;
    }

    const item = itemMap.get(response.itemId);
    if (!item) {
      return;
    }

    const linkedResources = item.resourceLinks || [];
    linkedResources.forEach((link, index) => {
      const current = resourceSignals.get(link.resourceId) || { boost: 0, prompts: [] };
      const difficultyWeight = 0.12 + (item.difficulty || 1) * 0.05;
      const positionWeight = index === 0 ? 0.08 : 0.04;
      const nextBoost = Math.min(0.42, current.boost + difficultyWeight + positionWeight);
      const prompts = current.prompts.includes(item.prompt) ? current.prompts : [...current.prompts, item.prompt];
      resourceSignals.set(link.resourceId, { boost: nextBoost, prompts });
    });
  });

  return resourceSignals;
}

function recommendResources({ resources, profile, items = [], responses = [] }) {
  const profileMap = new Map(profile.map((entry) => [entry.competencyId, entry]));
  const resourceSignals = buildQuestionSignals(items, responses);
  return [...resources]
    .map((resource) => {
      const competencyProfile = profileMap.get(resource.competencyId);
      const mastery = competencyProfile?.mastery ?? 0.45;
      const weakness = 1 - mastery;
      const difficultyAlignment = Math.max(0, 1 - Math.abs(mastery * 3 - resource.difficulty) / 3);
      const uncertainty = (competencyProfile?.standardError ?? 1) / 3;
      const signal = resourceSignals.get(resource.id);
      const questionBoost = signal?.boost ?? 0;
      const priorityScore = Number(Math.min(1, weakness * 0.5 + difficultyAlignment * 0.2 + uncertainty * 0.15 + questionBoost).toFixed(2));
      const topicalReason = signal?.prompts?.length
        ? `Tambien se prioriza porque fallaste una pregunta relacionada: "${signal.prompts[0]}".`
        : "";
      return {
        ...resource,
        priorityScore,
        why: competencyProfile
          ? `Refuerza ${competencyProfile.competencyName} porque tu dominio estimado es ${Math.round(
              mastery * 100
            )}% con incertidumbre ${competencyProfile.standardError}. ${topicalReason}`.trim()
          : `Recurso sugerido por cobertura general del curso. ${topicalReason}`.trim()
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 4);
}

function localEmbedding(text) {
  return tokenize(text).reduce((vector, token) => {
    vector[token] = (vector[token] || 0) + 1;
    return vector;
  }, {});
}

function cosineSimilarity(left, right) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let numerator = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  keys.forEach((key) => {
    const leftValue = left[key] || 0;
    const rightValue = right[key] || 0;
    numerator += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  });

  if (!leftNorm || !rightNorm) {
    return 0;
  }
  return numerator / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function fallbackFeedback(coverage, similarity) {
  if (coverage >= 0.75 || similarity >= 0.75) {
    return "Tu respuesta recupera las ideas clave y muestra una explicacion funcional para esta etapa del curso.";
  }
  if (coverage >= 0.45 || similarity >= 0.55) {
    return "Hay una base correcta, pero conviene explicar con mas claridad la reutilizacion, la division del problema y el mantenimiento.";
  }
  return "Necesitas reforzar la idea central: las funciones ayudan a reutilizar codigo, separar tareas y hacer mas mantenible la solucion.";
}

function evaluateActivity({ activity, answers }) {
  const answerMap = new Map((answers || []).map((answer) => [answer.itemId, answer.value]));
  let totalScore = 0;

  const items = activity.items.map((item) => {
    if (item.type === "multiple_choice") {
      const value = Number(answerMap.get(item.id));
      const correct = value === item.correctOption;
      const score = correct ? item.points : 0;
      totalScore += score;
      return {
        itemId: item.id,
        competencyId: item.competencyId,
        type: item.type,
        score,
        maxScore: item.points,
        correct,
        semanticSimilarity: correct ? 1 : 0,
        feedback: correct
          ? "Respuesta correcta. Elegiste la estructura adecuada para una cantidad conocida de repeticiones."
          : "Revisa cuando usar ciclos for: funcionan mejor cuando conoces de antemano cuantas iteraciones necesitas."
      };
    }

    const raw = String(answerMap.get(item.id) || "");
    const normalized = normalize(raw);
    const concepts = item.keyConcepts.filter((concept) => normalized.includes(normalize(concept)));
    const coverage = concepts.length / item.keyConcepts.length;
    const similarity = cosineSimilarity(localEmbedding(raw), localEmbedding(item.referenceAnswer || ""));
    const blended = coverage * 0.55 + similarity * 0.45;
    const score = Math.round(item.points * blended);
    totalScore += score;
    return {
      itemId: item.id,
      competencyId: item.competencyId,
      type: item.type,
      score,
      maxScore: item.points,
      correct: blended >= 0.6,
      semanticSimilarity: Number(similarity.toFixed(2)),
      feedback: fallbackFeedback(coverage, similarity)
    };
  });

  const strength = totalScore >= 80 ? "alto" : totalScore >= 60 ? "medio" : "inicial";
  return {
    score: totalScore,
    level: strength,
    teacherReviewNeeded: items.some((item) => item.type === "short_answer" && item.score < item.maxScore),
    items,
    summary:
      totalScore >= 80
        ? "Mostraste un avance solido en el chequeo posterior a la ruta."
        : totalScore >= 60
          ? "Hay avance, aunque todavia conviene reforzar algunos conceptos antes de seguir."
          : "El resultado sugiere reforzar la ruta recomendada antes de pasar al siguiente bloque."
  };
}

module.exports = {
  chooseDiagnosticItem,
  buildCompetencyStats,
  buildQuestionSignals,
  recommendResources,
  evaluateActivity
};
