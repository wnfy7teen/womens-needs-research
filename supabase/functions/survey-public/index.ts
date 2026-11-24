import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigin = "https://womens-needs-research.csgoidelka.workers.dev";
const corsHeaders = (origin: string | null) => ({
  ...(origin === allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
});
const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });

const tokenHash = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const createSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
const validUuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
const validToken = (value: string) => /^[0-9a-f]{64}$/i.test(value);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function loadSurvey(versionId: string) {
  const [{ data: sections, error: sectionError }, { data: questions, error: questionError }] =
    await Promise.all([
      supabase.from("survey_sections")
        .select("id,slug,title,description,position")
        .eq("version_id", versionId).eq("is_active", true).order("position"),
      supabase.from("survey_questions")
        .select("id,section_id,slug,prompt,help_text,question_type,is_required,allow_other,position,config")
        .eq("version_id", versionId).eq("is_active", true).order("position"),
    ]);
  if (sectionError || questionError) throw new Error("Не удалось загрузить вопросы исследования");

  const ids = (questions ?? []).map((q) => q.id);
  const { data: options, error: optionsError } = ids.length
    ? await supabase.from("survey_options")
      .select("id,question_id,value,label,position")
      .in("question_id", ids).eq("is_active", true).order("position")
    : { data: [], error: null };
  if (optionsError) throw new Error("Не удалось загрузить варианты ответов");

  return {
    sections: sections ?? [],
    questions: (questions ?? []).map((q) => ({
      ...q,
      options: (options ?? []).filter((option) => option.question_id === q.id),
    })),
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (origin && origin !== allowedOrigin) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Vary": "Origin" },
    });
  }
  if (req.method === "OPTIONS") {
    if (origin !== allowedOrigin) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method === "GET") {
    const { data: version, error } = await supabase.from("survey_versions")
      .select("id,slug,title,intro").eq("is_active", true).maybeSingle();
    if (error || !version) return json({ error: "Активная версия опроса не найдена" }, 503, origin);
    try {
      return json({ ...(await loadSurvey(version.id)), version: version.slug, intro: version.intro }, 200, origin);
    } catch {
      return json({ error: "Не удалось загрузить опрос" }, 500, origin);
    }
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 48_000) return json({ error: "Слишком большой запрос" }, 413, origin);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Некорректный JSON" }, 400, origin);
  }

  const action = body.action;
  if (action === "start") {
    if (body.consent !== true) return json({ error: "Требуется согласие на участие" }, 400, origin);
    const { data: version, error: versionError } = await supabase.from("survey_versions")
      .select("id,slug").eq("is_active", true).maybeSingle();
    if (versionError || !version) return json({ error: "Активная версия опроса не найдена" }, 503, origin);
    const locale = body.locale === "en" ? "en" : "ru";
    const sessionToken = createSessionToken();
    const { data, error } = await supabase.from("survey_submissions").insert({
      version_id: version.id,
      consent_version: version.slug,
      locale,
      session_token_hash: await tokenHash(sessionToken),
    }).select("id").single();
    if (error) return json({ error: "Не удалось начать анкету" }, 500, origin);
    return json({ submissionId: data.id, sessionToken, version: version.slug }, 200, origin);
  }

  if (action === "load") {
    const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
    if (!validUuid(submissionId) || !validToken(sessionToken))
      return json({ error: "Недействительная сессия" }, 401, origin);
    const { data: submission } = await supabase.from("survey_submissions")
      .select("id,status,version_id,session_token_hash")
      .eq("id", submissionId).maybeSingle();
    if (!submission || !["in_progress", "completed"].includes(submission.status))
      return json({ error: "Анкета недоступна" }, 404, origin);
    if (!submission.session_token_hash || submission.session_token_hash !== await tokenHash(sessionToken))
      return json({ error: "Нет доступа к этой анкете" }, 403, origin);
    try {
      const survey = await loadSurvey(submission.version_id);
      return json({ ...survey, versionId: submission.version_id }, 200, origin);
    } catch {
      return json({ error: "Не удалось восстановить версию анкеты" }, 500, origin);
    }
  }

  if (action === "save") {
    const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
    if (!validUuid(submissionId) || !validUuid(questionId))
      return json({ error: "Некорректные идентификаторы" }, 400, origin);
    if (!validToken(sessionToken)) return json({ error: "Недействительная сессия" }, 401, origin);
    const answer = body.answer;
    if (answer === undefined || answer === null) return json({ error: "Пустой ответ" }, 400, origin);
    if (JSON.stringify(answer).length > 4_000) return json({ error: "Ответ слишком длинный" }, 413, origin);

    const [{ data: submission }, { data: question }] = await Promise.all([
      supabase.from("survey_submissions")
        .select("id,status,version_id,session_token_hash").eq("id", submissionId).maybeSingle(),
      supabase.from("survey_questions")
        .select("id,version_id,is_required,is_active,question_type,config")
        .eq("id", questionId).maybeSingle(),
    ]);
    if (!submission || submission.status !== "in_progress" || !question?.is_active ||
        question.version_id !== submission.version_id)
      return json({ error: "Анкета или вопрос недоступны для этой версии" }, 404, origin);
    if (!submission.session_token_hash || submission.session_token_hash !== await tokenHash(sessionToken))
      return json({ error: "Нет доступа к этой анкете" }, 403, origin);

    if (typeof answer === "string" && answer.trim() === "")
      return json({ error: "Пустой ответ" }, 400, origin);
    if (Array.isArray(answer) && (answer.length === 0 || answer.some((item) => typeof item !== "string")))
      return json({ error: "Некорректный список ответов" }, 400, origin);

    const questionType = question.question_type;
    if (questionType === "textarea" || questionType === "text" || questionType === "country") {
      if (typeof answer !== "string" || answer.length > 4_000)
        return json({ error: "Ожидается текстовый ответ" }, 400, origin);
    } else if (questionType === "scale") {
      const min = Number(question.config?.min ?? 1);
      const max = Number(question.config?.max ?? 5);
      if (typeof answer !== "number" || !Number.isInteger(answer) || answer < min || answer > max)
        return json({ error: "Ответ вне допустимой шкалы" }, 400, origin);
    } else if (questionType === "number" || questionType === "currency") {
      if (typeof answer !== "number" || !Number.isFinite(answer))
        return json({ error: "Ожидается числовой ответ" }, 400, origin);
    } else if (questionType === "single_choice" || questionType === "multiple_choice") {
      const values = Array.isArray(answer) ? answer : [answer];
      if ((questionType === "single_choice" && typeof answer !== "string") ||
          (questionType === "multiple_choice" && !Array.isArray(answer)))
        return json({ error: "Некорректный формат выбранных вариантов" }, 400, origin);
      if (new Set(values).size !== values.length)
        return json({ error: "Повторяющиеся варианты ответа недопустимы" }, 400, origin);
      if (questionType === "multiple_choice") {
        const maxSelected = Number(question.config?.max_selected ?? 0);
        const exclusiveValues = Array.isArray(question.config?.exclusive_values)
          ? question.config.exclusive_values as string[] : [];
        if (maxSelected > 0 && values.length > maxSelected)
          return json({ error: "Можно выбрать не более " + maxSelected + " вариантов" }, 400, origin);
        if (values.some((value) => exclusiveValues.includes(String(value))) && values.length > 1)
          return json({ error: "Этот вариант нельзя сочетать с другими ответами" }, 400, origin);
      }
      const { data: options, error: optionError } = await supabase.from("survey_options")
        .select("value").eq("question_id", questionId).eq("is_active", true);
      if (optionError) return json({ error: "Не удалось проверить варианты ответа" }, 500, origin);
      const allowed = new Set((options ?? []).map((option) => option.value));
      if (values.some((value) => typeof value !== "string" || !allowed.has(value)))
        return json({ error: "Выбран недопустимый вариант ответа" }, 400, origin);
    } else {
      return json({ error: "Неподдерживаемый тип вопроса" }, 400, origin);
    }

    const { error } = await supabase.from("survey_answers").upsert(
      { submission_id: submissionId, question_id: questionId, answer, updated_at: new Date().toISOString() },
      { onConflict: "submission_id,question_id" },
    );
    if (error) return json({ error: "Не удалось сохранить ответ" }, 500, origin);
    return json({ saved: true }, 200, origin);
  }

  if (action === "complete") {
    const submissionId = typeof body.submissionId === "string" ? body.submissionId : "";
    const sessionToken = typeof body.sessionToken === "string" ? body.sessionToken : "";
    if (!validUuid(submissionId) || !validToken(sessionToken))
      return json({ error: "Недействительная сессия" }, 401, origin);
    const { data: submission } = await supabase.from("survey_submissions")
      .select("id,status,version_id,session_token_hash").eq("id", submissionId).maybeSingle();
    if (!submission || submission.status !== "in_progress")
      return json({ error: "Анкета недоступна" }, 404, origin);
    if (!submission.session_token_hash || submission.session_token_hash !== await tokenHash(sessionToken))
      return json({ error: "Нет доступа к этой анкете" }, 403, origin);

    const { data: required, error: requiredError } = await supabase.from("survey_questions")
      .select("id").eq("version_id", submission.version_id).eq("is_active", true).eq("is_required", true);
    const { data: answered, error: answeredError } = await supabase.from("survey_answers")
      .select("question_id").eq("submission_id", submissionId);
    if (requiredError || answeredError) return json({ error: "Не удалось проверить полноту анкеты" }, 500, origin);
    const answeredIds = new Set((answered ?? []).map((item) => item.question_id));
    if ((required ?? []).some((item) => !answeredIds.has(item.id)))
      return json({ error: "Ответьте на обязательные вопросы" }, 400, origin);
    const { data, error } = await supabase.from("survey_submissions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", submissionId).eq("status", "in_progress").select("id").maybeSingle();
    if (error || !data) return json({ error: "Не удалось завершить анкету" }, 500, origin);
    return json({ completed: true }, 200, origin);
  }

  return json({ error: "Неизвестное действие" }, 400, origin);
});
