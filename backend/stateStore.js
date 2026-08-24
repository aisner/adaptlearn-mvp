const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DEFAULT_ROLES = [
  { id: "student", name: "Estudiante", description: "Acceso a diagnostico, ruta, actividad y solicitudes de apoyo." },
  { id: "teacher", name: "Docente", description: "Acceso a panel docente, seguimiento e intervenciones." }
];

const DEFAULT_PERMISSIONS = [
  { id: "diagnostic:take", description: "Resolver el diagnostico adaptativo." },
  { id: "student:summary:read", description: "Consultar el resumen del estudiante." },
  { id: "student:activity:read", description: "Consultar la actividad breve." },
  { id: "student:activity:submit", description: "Enviar la actividad breve." },
  { id: "study_plan:update", description: "Actualizar el plan de estudio." },
  { id: "resource_progress:update", description: "Registrar avance en recursos." },
  { id: "support_request:create", description: "Crear solicitudes de apoyo." },
  { id: "teacher:dashboard:read", description: "Consultar el tablero docente." },
  { id: "teacher:student:read", description: "Consultar detalle de estudiantes." },
  { id: "teacher:intervention:create", description: "Registrar intervenciones docentes." }
];

const DEFAULT_ROLE_PERMISSIONS = {
  student: [
    "diagnostic:take",
    "student:summary:read",
    "student:activity:read",
    "student:activity:submit",
    "study_plan:update",
    "resource_progress:update",
    "support_request:create"
  ],
  teacher: ["teacher:dashboard:read", "teacher:student:read", "teacher:intervention:create"]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function inferResourceLinks(item, seedState) {
  const resources = seedState.resources || [];
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const competencyFallback = resources.filter((resource) => resource.competencyId === item.competencyId).slice(0, 2);
  const questionResourceMap = {
    "var-1": ["res-variables-video", "res-variables-bool"],
    "var-2": ["res-variables-conversion", "res-variables-lab"],
    "var-3": ["res-variables-operators", "res-variables-lab"],
    "var-4": ["res-variables-bool", "res-variables-video"],
    "var-5": ["res-variables-conversion", "res-variables-lab"],
    "var-6": ["res-variables-operators", "res-variables-lab"],
    "flow-1": ["res-flow-if-else", "res-flow-map"],
    "flow-2": ["res-flow-for-range", "res-flow-katas"],
    "flow-3": ["res-flow-break-continue", "res-flow-katas"],
    "flow-4": ["res-flow-if-else", "res-flow-map"],
    "flow-5": ["res-flow-loop-guards", "res-flow-katas"],
    "flow-6": ["res-flow-break-continue", "res-flow-katas"],
    "fun-1": ["res-functions-definition", "res-functions-guide"],
    "fun-2": ["res-functions-guide", "res-functions-clinic"],
    "fun-3": ["res-functions-design", "res-functions-clinic"],
    "fun-4": ["res-functions-definition", "res-functions-guide"],
    "fun-5": ["res-functions-defaults", "res-functions-clinic"],
    "fun-6": ["res-functions-returns", "res-functions-guide"],
    "alg-1": ["res-algorithms-problem-framing", "res-algorithms-canvas"],
    "alg-2": ["res-algorithms-canvas", "res-algorithms-lab"],
    "alg-3": ["res-algorithms-quality", "res-algorithms-lab"],
    "list-1": ["res-lists-guide", "res-lists-indexing"],
    "list-2": ["res-lists-indexing", "res-lists-guide"],
    "list-3": ["res-lists-mutation", "res-lists-katas"],
    "rec-1": ["res-recursion-base-case", "res-recursion-story"],
    "rec-2": ["res-recursion-story", "res-recursion-drills"],
    "rec-3": ["res-recursion-factorial", "res-recursion-drills"]
  };

  const linkedResources = (questionResourceMap[item.id] || [])
    .map((resourceId) => resourcesById.get(resourceId))
    .filter(Boolean);

  const selectedResources = linkedResources.length ? linkedResources : competencyFallback;
  return selectedResources.map((resource) => ({ resourceId: resource.id, title: resource.title }));
}

function inferQuestionMetadata(item, seedState) {
  const competency = (seedState.competencies || []).find((entry) => entry.id === item.competencyId);
  const topicMap = {
    variables: { topic: "Variables", subtopic: "Tipos y expresiones", module: "Unidad 1" },
    control_flow: { topic: "Control de flujo", subtopic: "Condicionales y ciclos", module: "Unidad 2" },
    functions: { topic: "Funciones", subtopic: "Parametros y reutilizacion", module: "Unidad 3" },
    algorithms: { topic: "Algoritmos", subtopic: "Diseno paso a paso", module: "Unidad 4" },
    arrays_lists: { topic: "Estructuras lineales", subtopic: "Listas y arreglos", module: "Unidad 5" },
    recursion: { topic: "Recursion", subtopic: "Casos base y llamadas recursivas", module: "Unidad 6" }
  };
  const defaults = topicMap[item.competencyId] || { topic: "Fundamentos", subtopic: "General", module: "Unidad base" };

  return {
    courseId: item.courseId || item.courseName?.replace(/\s+/g, "-").toLowerCase() || seedState.meta?.course?.replace(/\s+/g, "-").toLowerCase() || "programacion-i",
    courseName: item.courseName || seedState.meta?.course || "Programacion I",
    topic: defaults.topic,
    subtopic: defaults.subtopic,
    learningOutcome: competency?.description || "Aplicar el concepto evaluado en ejercicios basicos del curso.",
    moduleName: defaults.module,
    cognitiveLevel: item.difficulty >= 3 ? "aplicar" : item.difficulty === 2 ? "comprender" : "recordar",
    questionType: "multiple_choice",
    estimatedTimeMinutes: item.difficulty >= 3 ? 3 : 2,
    prerequisites: item.competencyId === "functions" ? ["variables", "control_flow"] : [],
    tags: [item.competencyId, defaults.topic.toLowerCase(), defaults.subtopic.toLowerCase()],
    status: "active",
    author: "equipo-adaptlearn",
    reviewedBy: "docencia-programacion",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-15T00:00:00.000Z",
    useCount: 0,
    successRate: 0,
    discrimination: Number((0.9 + (item.difficulty || 2) * 0.18).toFixed(2)),
    irtDifficulty: item.difficulty === 1 ? -0.9 : item.difficulty === 2 ? 0 : 0.9,
    commonMisconceptions:
      item.difficulty >= 3
        ? ["Aplica la sintaxis sin comprender el comportamiento del concepto."]
        : ["Confunde la estructura correcta o el resultado esperado del ejemplo."],
    feedbackByOption: (item.options || []).map((option, index) => ({
      optionIndex: index,
      option,
      feedback:
        index === item.correctOption
          ? "Seleccion correcta para el concepto evaluado."
          : `Revisa la explicacion del item: ${item.explanation}`
    })),
    resourceLinks: inferResourceLinks(item, seedState),
    curriculumAlignment: {
      competencyId: item.competencyId,
      competencyName: competency?.name || item.competencyId,
      course: seedState.meta?.course || "Programacion I"
    }
  };
}

function createStateStore({ rootDir }) {
  const dataDir = path.join(rootDir, "data");
  const seedPath = path.join(dataDir, "seed.json");
  const legacyStatePath = path.join(dataDir, "runtime-state.json");
  const dbPath = path.join(dataDir, "adaptlearn.db");

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");

  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      meta_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS competencies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      display_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      course TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS students (
      user_id TEXT PRIMARY KEY,
      cohort TEXT,
      study_plan_json TEXT NOT NULL,
      latest_profile_json TEXT,
      activity_submission_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS diagnostic_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      responses_json TEXT NOT NULL,
      competency_scores_json TEXT
    );

    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      competency_id TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      type TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      summary TEXT NOT NULL,
      display_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS activity_items (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      item_order INTEGER NOT NULL,
      type TEXT NOT NULL,
      competency_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT,
      correct_option INTEGER,
      reference_answer TEXT,
      key_concepts_json TEXT,
      points INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_recommendations (
      user_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      priority_score REAL NOT NULL,
      why TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (user_id, resource_id)
    );

    CREATE TABLE IF NOT EXISTS resource_progress (
      user_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      completed INTEGER NOT NULL,
      last_updated_at TEXT,
      reflection TEXT NOT NULL,
      PRIMARY KEY (user_id, resource_id)
    );

    CREATE TABLE IF NOT EXISTS support_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT,
      teacher_response_json TEXT
    );

    CREATE TABLE IF NOT EXISTS teacher_interventions (
      id TEXT PRIMARY KEY,
      student_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT NOT NULL,
      next_step TEXT NOT NULL,
      support_request_id TEXT
    );

    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      course_name TEXT NOT NULL,
      competency_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      subtopic TEXT NOT NULL,
      learning_outcome TEXT NOT NULL,
      module_name TEXT NOT NULL,
      cognitive_level TEXT NOT NULL,
      question_type TEXT NOT NULL,
      difficulty INTEGER NOT NULL,
      estimated_time_minutes INTEGER NOT NULL,
      prerequisites_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_option INTEGER NOT NULL,
      explanation TEXT NOT NULL,
      status TEXT NOT NULL,
      author TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      success_rate REAL NOT NULL DEFAULT 0,
      discrimination REAL NOT NULL,
      irt_difficulty REAL NOT NULL,
      common_misconceptions_json TEXT NOT NULL,
      feedback_by_option_json TEXT NOT NULL,
      resource_links_json TEXT NOT NULL,
      curriculum_alignment_json TEXT NOT NULL
    )
  `);

  ensureColumn("support_requests", "teacher_response_json", "TEXT");

  const countTable = (tableName) => db.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).get().total;
  const nowIso = () => new Date().toISOString();

  const selectLegacyState = db.prepare("SELECT payload FROM app_state WHERE state_key = ?");
  const selectQuestions = db.prepare("SELECT * FROM question_bank ORDER BY course_name, topic, difficulty, id");
  const selectQuestionStats = db.prepare("SELECT use_count, success_count FROM question_bank WHERE id = ?");
  const updateQuestionStats = db.prepare(`
    UPDATE question_bank
    SET use_count = ?, success_count = ?, success_rate = ?, updated_at = ?
    WHERE id = ?
  `);
  const insertQuestion = db.prepare(`
    INSERT OR REPLACE INTO question_bank (
      id, course_id, course_name, competency_id, topic, subtopic, learning_outcome, module_name, cognitive_level,
      question_type, difficulty, estimated_time_minutes, prerequisites_json, tags_json, prompt, options_json,
      correct_option, explanation, status, author, reviewed_by, created_at, updated_at, use_count, success_count,
      success_rate, discrimination, irt_difficulty, common_misconceptions_json, feedback_by_option_json,
      resource_links_json, curriculum_alignment_json
    ) VALUES (
      @id, @course_id, @course_name, @competency_id, @topic, @subtopic, @learning_outcome, @module_name, @cognitive_level,
      @question_type, @difficulty, @estimated_time_minutes, @prerequisites_json, @tags_json, @prompt, @options_json,
      @correct_option, @explanation, @status, @author, @reviewed_by, @created_at, @updated_at, @use_count, @success_count,
      @success_rate, @discrimination, @irt_difficulty, @common_misconceptions_json, @feedback_by_option_json,
      @resource_links_json, @curriculum_alignment_json
    )
  `);

  function hydrateQuestion(row) {
    return {
      id: row.id,
      courseId: row.course_id,
      courseName: row.course_name,
      competencyId: row.competency_id,
      topic: row.topic,
      subtopic: row.subtopic,
      learningOutcome: row.learning_outcome,
      module: row.module_name,
      cognitiveLevel: row.cognitive_level,
      questionType: row.question_type,
      difficulty: row.difficulty,
      estimatedTimeMinutes: row.estimated_time_minutes,
      prerequisites: safeJsonParse(row.prerequisites_json, []),
      tags: safeJsonParse(row.tags_json, []),
      prompt: row.prompt,
      options: safeJsonParse(row.options_json, []),
      correctOption: row.correct_option,
      explanation: row.explanation,
      status: row.status,
      author: row.author,
      reviewedBy: row.reviewed_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      useCount: row.use_count,
      successRate: row.success_rate,
      discrimination: row.discrimination,
      irtDifficulty: row.irt_difficulty,
      commonMisconceptions: safeJsonParse(row.common_misconceptions_json, []),
      feedbackByOption: safeJsonParse(row.feedback_by_option_json, []),
      resourceLinks: safeJsonParse(row.resource_links_json, []),
      curriculumAlignment: safeJsonParse(row.curriculum_alignment_json, {})
    };
  }

  function persistQuestionBank(items, seedState) {
    const now = nowIso();
    items.forEach((item) => {
      const metadata = inferQuestionMetadata(item, seedState);
      insertQuestion.run({
        id: item.id,
        course_id: metadata.courseId,
        course_name: metadata.courseName,
        competency_id: item.competencyId,
        topic: metadata.topic,
        subtopic: metadata.subtopic,
        learning_outcome: metadata.learningOutcome,
        module_name: metadata.moduleName,
        cognitive_level: metadata.cognitiveLevel,
        question_type: metadata.questionType,
        difficulty: item.difficulty,
        estimated_time_minutes: metadata.estimatedTimeMinutes,
        prerequisites_json: JSON.stringify(metadata.prerequisites),
        tags_json: JSON.stringify(metadata.tags),
        prompt: item.prompt,
        options_json: JSON.stringify(item.options || []),
        correct_option: item.correctOption,
        explanation: item.explanation || "",
        status: metadata.status,
        author: metadata.author,
        reviewed_by: metadata.reviewedBy,
        created_at: metadata.createdAt || now,
        updated_at: metadata.updatedAt || now,
        use_count: metadata.useCount || 0,
        success_count: 0,
        success_rate: metadata.successRate || 0,
        discrimination: metadata.discrimination,
        irt_difficulty: metadata.irtDifficulty,
        common_misconceptions_json: JSON.stringify(metadata.commonMisconceptions),
        feedback_by_option_json: JSON.stringify(metadata.feedbackByOption),
        resource_links_json: JSON.stringify(metadata.resourceLinks),
        curriculum_alignment_json: JSON.stringify(metadata.curriculumAlignment)
      });
    });
  }

  function getSourceState() {
    const legacy = selectLegacyState.get("current");
    if (legacy?.payload) {
      return JSON.parse(legacy.payload);
    }
    if (fs.existsSync(legacyStatePath)) {
      return readJson(legacyStatePath);
    }
    return readJson(seedPath);
  }

  function persistStaticCatalogs(state) {
    const upsertMeta = db.prepare(`
      INSERT INTO app_meta (meta_key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(meta_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `);
    const insertCompetency = db.prepare(`
      INSERT OR REPLACE INTO competencies (id, name, description, display_order)
      VALUES (@id, @name, @description, @display_order)
    `);
    const insertRole = db.prepare(`
      INSERT OR REPLACE INTO roles (id, name, description)
      VALUES (@id, @name, @description)
    `);
    const insertPermission = db.prepare(`
      INSERT OR REPLACE INTO permissions (id, description)
      VALUES (@id, @description)
    `);
    const insertRolePermission = db.prepare(`
      INSERT OR REPLACE INTO role_permissions (role_id, permission_id)
      VALUES (?, ?)
    `);
    const insertResource = db.prepare(`
      INSERT OR REPLACE INTO resources (id, title, competency_id, difficulty, type, duration_minutes, summary, display_order)
      VALUES (@id, @title, @competency_id, @difficulty, @type, @duration_minutes, @summary, @display_order)
    `);
    const insertActivity = db.prepare(`
      INSERT OR REPLACE INTO activities (id, title, instructions)
      VALUES (@id, @title, @instructions)
    `);
    const insertActivityItem = db.prepare(`
      INSERT OR REPLACE INTO activity_items (
        id, activity_id, item_order, type, competency_id, prompt, options_json, correct_option, reference_answer, key_concepts_json, points
      ) VALUES (
        @id, @activity_id, @item_order, @type, @competency_id, @prompt, @options_json, @correct_option, @reference_answer, @key_concepts_json, @points
      )
    `);
    const currentTime = nowIso();

    upsertMeta.run("meta", JSON.stringify(state.meta || {}), currentTime);

    db.prepare("DELETE FROM competencies").run();
    (state.competencies || []).forEach((competency, index) => {
      insertCompetency.run({
        id: competency.id,
        name: competency.name,
        description: competency.description || "",
        display_order: index
      });
    });

    db.prepare("DELETE FROM roles").run();
    db.prepare("DELETE FROM permissions").run();
    db.prepare("DELETE FROM role_permissions").run();
    DEFAULT_ROLES.forEach((role) => insertRole.run(role));
    DEFAULT_PERMISSIONS.forEach((permission) => insertPermission.run(permission));
    Object.entries(DEFAULT_ROLE_PERMISSIONS).forEach(([roleId, permissions]) => {
      permissions.forEach((permissionId) => insertRolePermission.run(roleId, permissionId));
    });

    db.prepare("DELETE FROM resources").run();
    (state.resources || []).forEach((resource, index) => {
      insertResource.run({
        id: resource.id,
        title: resource.title,
        competency_id: resource.competencyId,
        difficulty: resource.difficulty,
        type: resource.type,
        duration_minutes: resource.durationMinutes,
        summary: resource.summary || "",
        display_order: index
      });
    });

    db.prepare("DELETE FROM activity_items").run();
    db.prepare("DELETE FROM activities").run();
    if (state.activity) {
      insertActivity.run({
        id: state.activity.id,
        title: state.activity.title,
        instructions: state.activity.instructions || ""
      });
      (state.activity.items || []).forEach((item, index) => {
        insertActivityItem.run({
          id: item.id,
          activity_id: state.activity.id,
          item_order: index,
          type: item.type,
          competency_id: item.competencyId,
          prompt: item.prompt,
          options_json: JSON.stringify(item.options || []),
          correct_option: item.correctOption ?? null,
          reference_answer: item.referenceAnswer ?? null,
          key_concepts_json: JSON.stringify(item.keyConcepts || []),
          points: item.points || 0
        });
      });
    }
  }

  function persistUsers(state) {
    const insertUser = db.prepare(`
      INSERT OR REPLACE INTO users (id, name, email, password, course, status, created_at, updated_at)
      VALUES (@id, @name, @email, @password, @course, @status, @created_at, @updated_at)
    `);
    const insertUserRole = db.prepare(`
      INSERT OR REPLACE INTO user_roles (user_id, role_id)
      VALUES (?, ?)
    `);
    const currentTime = nowIso();

    db.prepare("DELETE FROM user_roles").run();
    db.prepare("DELETE FROM users").run();

    (state.users || []).forEach((user) => {
      insertUser.run({
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password || "",
        course: user.course || null,
        status: user.status || "active",
        created_at: user.createdAt || currentTime,
        updated_at: currentTime
      });

      const roleIds =
        user.roles?.length
          ? user.roles.map((role) => (typeof role === "string" ? role : role.id)).filter(Boolean)
          : [user.role || "student"];

      [...new Set(roleIds)].forEach((roleId) => insertUserRole.run(user.id, roleId));
    });
  }

  function persistStudentState(state) {
    const insertStudent = db.prepare(`
      INSERT OR REPLACE INTO students (user_id, cohort, study_plan_json, latest_profile_json, activity_submission_json, created_at, updated_at)
      VALUES (@user_id, @cohort, @study_plan_json, @latest_profile_json, @activity_submission_json, @created_at, @updated_at)
    `);
    const insertAttempt = db.prepare(`
      INSERT OR REPLACE INTO diagnostic_attempts (id, user_id, status, started_at, completed_at, responses_json, competency_scores_json)
      VALUES (@id, @user_id, @status, @started_at, @completed_at, @responses_json, @competency_scores_json)
    `);
    const insertRecommendation = db.prepare(`
      INSERT OR REPLACE INTO student_recommendations (user_id, resource_id, priority_score, why, assigned_at)
      VALUES (@user_id, @resource_id, @priority_score, @why, @assigned_at)
    `);
    const insertResourceProgress = db.prepare(`
      INSERT OR REPLACE INTO resource_progress (user_id, resource_id, completed, last_updated_at, reflection)
      VALUES (@user_id, @resource_id, @completed, @last_updated_at, @reflection)
    `);
    const insertSupportRequest = db.prepare(`
      INSERT OR REPLACE INTO support_requests (id, user_id, created_at, topic, message, status, updated_at, teacher_response_json)
      VALUES (@id, @user_id, @created_at, @topic, @message, @status, @updated_at, @teacher_response_json)
    `);
    const insertIntervention = db.prepare(`
      INSERT OR REPLACE INTO teacher_interventions (id, student_user_id, created_at, status, note, next_step, support_request_id)
      VALUES (@id, @student_user_id, @created_at, @status, @note, @next_step, @support_request_id)
    `);
    const currentTime = nowIso();

    db.prepare("DELETE FROM diagnostic_attempts").run();
    db.prepare("DELETE FROM student_recommendations").run();
    db.prepare("DELETE FROM resource_progress").run();
    db.prepare("DELETE FROM support_requests").run();
    db.prepare("DELETE FROM teacher_interventions").run();
    db.prepare("DELETE FROM students").run();

    (state.students || []).forEach((student) => {
      insertStudent.run({
        user_id: student.userId,
        cohort: student.cohort || null,
        study_plan_json: JSON.stringify(student.studyPlan || {}),
        latest_profile_json: student.latestProfile ? JSON.stringify(student.latestProfile) : null,
        activity_submission_json: student.activitySubmission ? JSON.stringify(student.activitySubmission) : null,
        created_at: currentTime,
        updated_at: currentTime
      });

      (student.diagnosticAttempts || []).forEach((attempt) => {
        insertAttempt.run({
          id: attempt.id,
          user_id: student.userId,
          status: attempt.status,
          started_at: attempt.startedAt || currentTime,
          completed_at: attempt.completedAt || null,
          responses_json: JSON.stringify(attempt.responses || []),
          competency_scores_json: attempt.competencyScores ? JSON.stringify(attempt.competencyScores) : null
        });
      });

      (student.recommendations || []).forEach((recommendation) => {
        insertRecommendation.run({
          user_id: student.userId,
          resource_id: recommendation.id,
          priority_score: recommendation.priorityScore || 0,
          why: recommendation.why || "",
          assigned_at: currentTime
        });
      });

      Object.entries(student.resourceProgress || {}).forEach(([resourceId, progress]) => {
        insertResourceProgress.run({
          user_id: student.userId,
          resource_id: resourceId,
          completed: progress.completed ? 1 : 0,
          last_updated_at: progress.lastUpdatedAt || null,
          reflection: progress.reflection || ""
        });
      });

      (student.supportRequests || []).forEach((request) => {
        insertSupportRequest.run({
          id: request.id,
          user_id: student.userId,
          created_at: request.createdAt || currentTime,
          topic: request.topic || "",
          message: request.message || "",
          status: request.status || "open",
          updated_at: request.updatedAt || null,
          teacher_response_json: request.teacherResponse ? JSON.stringify(request.teacherResponse) : null
        });
      });

      (student.teacherInterventions || []).forEach((intervention) => {
        insertIntervention.run({
          id: intervention.id,
          student_user_id: student.userId,
          created_at: intervention.createdAt || currentTime,
          status: intervention.status || "planificado",
          note: intervention.note || "",
          next_step: intervention.nextStep || "",
          support_request_id: intervention.supportRequestId || null
        });
      });
    });
  }

  function seedNormalizedData(sourceState) {
    const seedState = readJson(seedPath);
    db.exec("BEGIN");
    try {
      persistStaticCatalogs(sourceState);
      persistUsers(sourceState);
      persistStudentState(sourceState);
      if (!countTable("question_bank")) {
        persistQuestionBank(sourceState.diagnosticItems || seedState.diagnosticItems || [], seedState);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function ensureState() {
    const sourceState = getSourceState();
    const staticTablesReady =
      countTable("app_meta") &&
      countTable("competencies") &&
      countTable("roles") &&
      countTable("permissions") &&
      countTable("resources") &&
      countTable("activities");

    if (!staticTablesReady || !countTable("users") || !countTable("students")) {
      seedNormalizedData(sourceState);
      return;
    }

    if (!countTable("question_bank")) {
      const seedState = readJson(seedPath);
      db.exec("BEGIN");
      try {
        persistQuestionBank(sourceState.diagnosticItems || seedState.diagnosticItems || [], seedState);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  }

  function loadUsers() {
    const users = db.prepare("SELECT * FROM users ORDER BY id").all();
    const roles = db.prepare("SELECT * FROM roles ORDER BY id").all();
    const permissions = db.prepare("SELECT * FROM permissions ORDER BY id").all();
    const userRoles = db.prepare("SELECT * FROM user_roles ORDER BY user_id, role_id").all();
    const rolePermissions = db.prepare("SELECT * FROM role_permissions ORDER BY role_id, permission_id").all();

    const roleById = new Map(roles.map((role) => [role.id, role]));
    const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));
    const rolePermissionMap = new Map();

    rolePermissions.forEach((entry) => {
      if (!rolePermissionMap.has(entry.role_id)) {
        rolePermissionMap.set(entry.role_id, []);
      }
      rolePermissionMap.get(entry.role_id).push(entry.permission_id);
    });

    const userRoleMap = new Map();
    userRoles.forEach((entry) => {
      if (!userRoleMap.has(entry.user_id)) {
        userRoleMap.set(entry.user_id, []);
      }
      userRoleMap.get(entry.user_id).push(entry.role_id);
    });

    return users.map((user) => {
      const roleIds = userRoleMap.get(user.id) || [];
      const roleObjects = roleIds.map((roleId) => roleById.get(roleId)).filter(Boolean);
      const permissionIds = [...new Set(roleIds.flatMap((roleId) => rolePermissionMap.get(roleId) || []))];

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        password: user.password,
        role: roleIds[0] || null,
        roles: roleObjects.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description
        })),
        permissions: permissionIds.map((permissionId) => ({
          id: permissionId,
          description: permissionById.get(permissionId)?.description || ""
        })),
        course: user.course,
        status: user.status,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    });
  }

  function loadStudents(resources) {
    const students = db.prepare("SELECT * FROM students ORDER BY user_id").all();
    const attempts = db.prepare("SELECT * FROM diagnostic_attempts ORDER BY started_at").all();
    const recommendations = db.prepare(`
      SELECT sr.user_id, sr.priority_score, sr.why, sr.assigned_at, r.*
      FROM student_recommendations sr
      JOIN resources r ON r.id = sr.resource_id
      ORDER BY sr.user_id, r.display_order
    `).all();
    const progressRows = db.prepare("SELECT * FROM resource_progress ORDER BY user_id, resource_id").all();
    const supportRequests = db.prepare("SELECT * FROM support_requests ORDER BY created_at").all();
    const interventions = db.prepare("SELECT * FROM teacher_interventions ORDER BY created_at").all();

    const attemptsByUser = new Map();
    attempts.forEach((attempt) => {
      if (!attemptsByUser.has(attempt.user_id)) {
        attemptsByUser.set(attempt.user_id, []);
      }
      attemptsByUser.get(attempt.user_id).push({
        id: attempt.id,
        status: attempt.status,
        startedAt: attempt.started_at,
        completedAt: attempt.completed_at,
        responses: safeJsonParse(attempt.responses_json, []),
        competencyScores: safeJsonParse(attempt.competency_scores_json, null)
      });
    });

    const recommendationsByUser = new Map();
    recommendations.forEach((row) => {
      if (!recommendationsByUser.has(row.user_id)) {
        recommendationsByUser.set(row.user_id, []);
      }
      recommendationsByUser.get(row.user_id).push({
        id: row.id,
        title: row.title,
        competencyId: row.competency_id,
        difficulty: row.difficulty,
        type: row.type,
        durationMinutes: row.duration_minutes,
        summary: row.summary,
        priorityScore: row.priority_score,
        why: row.why,
        assignedAt: row.assigned_at
      });
    });

    const progressByUser = new Map();
    progressRows.forEach((row) => {
      if (!progressByUser.has(row.user_id)) {
        progressByUser.set(row.user_id, {});
      }
      progressByUser.get(row.user_id)[row.resource_id] = {
        completed: Boolean(row.completed),
        lastUpdatedAt: row.last_updated_at,
        reflection: row.reflection || ""
      };
    });

    const requestsByUser = new Map();
    supportRequests.forEach((row) => {
      if (!requestsByUser.has(row.user_id)) {
        requestsByUser.set(row.user_id, []);
      }
      requestsByUser.get(row.user_id).push({
        id: row.id,
        createdAt: row.created_at,
        topic: row.topic,
        message: row.message,
        status: row.status,
        updatedAt: row.updated_at,
        teacherResponse: safeJsonParse(row.teacher_response_json, null)
      });
    });

    const interventionsByUser = new Map();
    interventions.forEach((row) => {
      if (!interventionsByUser.has(row.student_user_id)) {
        interventionsByUser.set(row.student_user_id, []);
      }
      interventionsByUser.get(row.student_user_id).push({
        id: row.id,
        createdAt: row.created_at,
        status: row.status,
        note: row.note,
        nextStep: row.next_step,
        supportRequestId: row.support_request_id
      });
    });

    return students.map((student) => ({
      userId: student.user_id,
      cohort: student.cohort,
      diagnosticAttempts: attemptsByUser.get(student.user_id) || [],
      latestProfile: safeJsonParse(student.latest_profile_json, null),
      recommendations: recommendationsByUser.get(student.user_id) || [],
      activitySubmission: safeJsonParse(student.activity_submission_json, null),
      resourceProgress: progressByUser.get(student.user_id) || {},
      studyPlan: safeJsonParse(student.study_plan_json, {}),
      supportRequests: requestsByUser.get(student.user_id) || [],
      teacherInterventions: interventionsByUser.get(student.user_id) || []
    }));
  }

  function loadActivity() {
    const activity = db.prepare("SELECT * FROM activities ORDER BY id LIMIT 1").get();
    if (!activity) {
      return null;
    }
    const items = db.prepare("SELECT * FROM activity_items WHERE activity_id = ? ORDER BY item_order, id").all(activity.id);
    return {
      id: activity.id,
      title: activity.title,
      instructions: activity.instructions,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        competencyId: item.competency_id,
        prompt: item.prompt,
        options: safeJsonParse(item.options_json, []),
        correctOption: item.correct_option,
        referenceAnswer: item.reference_answer,
        keyConcepts: safeJsonParse(item.key_concepts_json, []),
        points: item.points
      }))
    };
  }

  function loadState() {
    ensureState();
    const metaRow = db.prepare("SELECT value_json FROM app_meta WHERE meta_key = ?").get("meta");
    const competencies = db.prepare("SELECT * FROM competencies ORDER BY display_order, id").all().map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description
    }));
    const resources = db.prepare("SELECT * FROM resources ORDER BY display_order, id").all().map((row) => ({
      id: row.id,
      title: row.title,
      competencyId: row.competency_id,
      difficulty: row.difficulty,
      type: row.type,
      durationMinutes: row.duration_minutes,
      summary: row.summary
    }));

    return {
      meta: safeJsonParse(metaRow?.value_json, {}),
      competencies,
      users: loadUsers(),
      students: loadStudents(resources),
      diagnosticItems: selectQuestions.all().map(hydrateQuestion),
      resources,
      activity: loadActivity()
    };
  }

  function saveState(state) {
    db.exec("BEGIN");
    try {
      persistStaticCatalogs(state);
      persistUsers(state);
      persistStudentState(state);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  function recordQuestionOutcome(questionId, correct) {
    const stats = selectQuestionStats.get(questionId);
    if (!stats) {
      return;
    }
    const nextUseCount = Number(stats.use_count || 0) + 1;
    const nextSuccessCount = Number(stats.success_count || 0) + (correct ? 1 : 0);
    const nextSuccessRate = nextUseCount ? Number((nextSuccessCount / nextUseCount).toFixed(2)) : 0;
    updateQuestionStats.run(nextUseCount, nextSuccessCount, nextSuccessRate, nowIso(), questionId);
  }

  return {
    dbPath,
    ensureState,
    loadState,
    saveState,
    recordQuestionOutcome
  };
}

module.exports = {
  createStateStore
};
