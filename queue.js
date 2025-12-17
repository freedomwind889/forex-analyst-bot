// --- JOB QUEUE (D1) : FIFO sequential image processing ---

function makeJobId(userId, messageId) {
  // Stable-enough unique id without crypto UUID
  return `${Date.now()}_${userId.slice(-6)}_${messageId}`;
}

export async function enqueueAnalysisJob(userId, messageId, env) {
  if (!env.DB) throw new Error("No DB");
  const jobId = makeJobId(userId, messageId);
  const createdAt = Date.now();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO analysis_jobs
      (job_id, user_id, message_id, created_at, status, attempt, started_at, finished_at, result_tf, last_error)
    VALUES (?, ?, ?, ?, 'queued', 0, NULL, NULL, NULL, NULL)
  `).bind(jobId, userId, messageId, createdAt).run();
  return { jobId, createdAt };
}

export async function getUserQueueStats(userId, env) {
  if (!env.DB) throw new Error("No DB");
  const queued = await env.DB.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs WHERE user_id = ? AND status = 'queued'`)
    .bind(userId).first();
  const processing = await env.DB.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs WHERE user_id = ? AND status = 'processing'`)
    .bind(userId).first();
  return {
    queued_count: Number(queued?.c || 0),
    processing_count: Number(processing?.c || 0)
  };
}

function formatDurationTH(seconds) {
  const s = Math.max(0, Math.round(Number(seconds || 0)));
  if (s < 60) return `${s} วินาที`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} นาที`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours} ชม. ${remMins} นาที` : `${hours} ชม.`;
}

function shortMessageId(messageId) {
  if (!messageId) return "??????";
  const s = String(messageId);
  return s.length <= 6 ? s : s.slice(-6);
}

export async function estimateSecondsPerImage(userId, env) {
  const fallback = Math.max(10, Number(env.EST_SECONDS_PER_IMAGE || 45));
  if (!env.DB) return fallback;

  try {
    const { results } = await env.DB.prepare(`
      SELECT (finished_at - started_at) AS dur_ms
      FROM analysis_jobs
      WHERE user_id = ?
        AND status = 'done'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
      ORDER BY finished_at DESC
      LIMIT 5
    `).bind(userId).all();

    const durations = (results || [])
      .map(r => Number(r?.dur_ms || 0))
      .filter(n => Number.isFinite(n) && n > 0);

    if (durations.length === 0) return fallback;

    const avgMs = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgSec = avgMs / 1000;

    // clamp for stability
    return Math.min(180, Math.max(15, avgSec));
  } catch (_) {
    return fallback;
  }
}

export async function getQueueProgressForAck(userId, jobId, createdAt, env) {
  const stats = await getUserQueueStats(userId, env);

  const totalRow = await env.DB.prepare(`
    SELECT COUNT(*) AS c
    FROM analysis_jobs
    WHERE user_id = ? AND status IN ('queued','processing')
  `).bind(userId).first();

  const totalPending = Number(totalRow?.c || 0);

  const processing = await env.DB.prepare(`
    SELECT job_id, message_id, created_at, started_at
    FROM analysis_jobs
    WHERE user_id = ? AND status = 'processing'
    ORDER BY started_at ASC
    LIMIT 1
  `).bind(userId).first();

  let processingOrder = null;
  if (processing?.created_at != null) {
    const ord = await env.DB.prepare(`
      SELECT COUNT(*) AS c
      FROM analysis_jobs
      WHERE user_id = ?
        AND status IN ('queued','processing')
        AND created_at <= ?
    `).bind(userId, processing.created_at).first();
    processingOrder = Number(ord?.c || 1);
  }

  // your position in the combined pending list (processing + queued), ordered by created_at
  let yourPosition = null;
  try {
    let ca = createdAt;
    if (ca == null && jobId) {
      const r = await env.DB.prepare(`SELECT created_at FROM analysis_jobs WHERE job_id = ?`).bind(jobId).first();
      ca = r?.created_at ?? null;
    }
    if (ca != null) {
      const pos = await env.DB.prepare(`
        SELECT COUNT(*) AS c
        FROM analysis_jobs
        WHERE user_id = ?
          AND status IN ('queued','processing')
          AND created_at <= ?
      `).bind(userId, ca).first();
      yourPosition = Number(pos?.c || 0);
    }
  } catch (_) {
    yourPosition = null;
  }

  return {
    queued_count: stats.queued_count,
    processing_count: stats.processing_count,
    totalPending,
    processing,
    processingOrder,
    yourPosition
  };
}

export async function buildQueueAckMessage(userId, jobId, createdAt, env) {
  const perImageSec = await estimateSecondsPerImage(userId, env);
  const q = await getQueueProgressForAck(userId, jobId, createdAt, env);

  const total = q.totalPending || (q.queued_count + q.processing_count) || 1;
  const yourPos = q.yourPosition || null;

  const lines = [];
  lines.push("✅ ได้รับรูปแล้วครับ");
  lines.push("");
  lines.push(`📥 คิว: รอ ${q.queued_count} รูป (รวมรูปนี้) | กำลังประมวลผล ${q.processing_count} รูป`);

  if (q.processing?.message_id) {
    lines.push(`⚙️ กำลังทำ: รูปที่ ${(q.processingOrder || 1)}/${total} (ID …${shortMessageId(q.processing.message_id)})`);
  } else {
    lines.push(`⚙️ กำลังทำ: ยังไม่มีงานที่กำลังประมวลผล (กำลังเริ่มคิว)`);
  }

  lines.push(`🧮 ประมาณการ: ~${formatDurationTH(perImageSec)}/รูป`);

  if (yourPos) {
    const etaStart = Math.max(0, (yourPos - 1) * perImageSec);
    const etaDone = Math.max(0, yourPos * perImageSec);
    lines.push(`📌 รูปนี้อยู่ลำดับที่ ${yourPos}/${Math.max(total, yourPos)}`);
    lines.push(`⏱️ คาดเริ่ม ~${formatDurationTH(etaStart)} | เสร็จ ~${formatDurationTH(etaDone)}`);
  }

  lines.push("");
  lines.push("📌 เข้าเมนู **สรุปผลวิเคราะห์** เพื่อดูผลลัพธ์ครับ");

  return lines.join("\n");
}

export async function claimNextQueuedJob(userId, env) {
  if (!env.DB) throw new Error("No DB");

  // Enforce single processing job per-user
  const proc = await env.DB.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs WHERE user_id = ? AND status = 'processing'`)
    .bind(userId).first();
  if (Number(proc?.c || 0) > 0) return null;

  const next = await env.DB.prepare(`
    SELECT job_id, message_id, created_at, attempt
    FROM analysis_jobs
    WHERE user_id = ? AND status = 'queued'
    ORDER BY created_at ASC
    LIMIT 1
  `).bind(userId).first();

  if (!next?.job_id) return null;

  const startedAt = Date.now();
  const res = await env.DB.prepare(`
    UPDATE analysis_jobs
    SET status = 'processing', started_at = ?, last_error = NULL
    WHERE job_id = ? AND status = 'queued'
  `).bind(startedAt, next.job_id).run();

  // If update did not apply (race), return null
  // D1 meta may not always include changes; be defensive:
  if (res?.meta?.changes === 0) return null;

  return {
    job_id: next.job_id,
    message_id: next.message_id,
    created_at: next.created_at,
    attempt: Number(next.attempt || 0),
    started_at: startedAt
  };
}

export async function requeueJob(jobId, env, attempt, lastError) {
  if (!env.DB) throw new Error("No DB");
  await env.DB.prepare(`
    UPDATE analysis_jobs
    SET status = 'queued',
        attempt = ?,
        started_at = NULL,
        last_error = ?
    WHERE job_id = ?
  `).bind(attempt, lastError ? String(lastError).slice(0, 800) : null, jobId).run();
}

export async function pruneDoneJobHistory(userId, env, keepCount = 5) {
  if (!env.DB) return;
  const keep = Math.max(1, Math.floor(Number(keepCount || 5)));

  // Keep only the most recent N completed jobs (status='done') per user.
  // This keeps DB small and stabilizes ETA estimation.
  try {
    const sql = `
      DELETE FROM analysis_jobs
      WHERE user_id = ?
        AND status = 'done'
        AND job_id NOT IN (
          SELECT job_id FROM analysis_jobs
          WHERE user_id = ?
            AND status = 'done'
          ORDER BY finished_at DESC
          LIMIT ${keep}
        )
    `;
    await env.DB.prepare(sql).bind(userId, userId).run();
  } catch (e) {
    console.warn('[pruneDoneJobHistory] ' + e);
  }
}

export async function markJobDone(jobId, env, resultTF) {
  if (!env.DB) throw new Error("No DB");
  const finishedAt = Date.now();
  await env.DB.prepare(`
    UPDATE analysis_jobs
    SET status = 'done',
        finished_at = ?,
        result_tf = ?
    WHERE job_id = ?
  `).bind(finishedAt, resultTF || null, jobId).run();

  // Prune completed job history: keep only the latest 5 'done' jobs for ETA averaging.
  try {
    const row = await env.DB.prepare(`SELECT user_id FROM analysis_jobs WHERE job_id = ?`).bind(jobId).first();
    if (row?.user_id) {
      await pruneDoneJobHistory(row.user_id, env, 5);
    }
  } catch (e) {
    console.warn('[markJobDone prune] ' + e);
  }
}

export async function markJobError(jobId, env, errMsg) {
  if (!env.DB) throw new Error("No DB");
  const finishedAt = Date.now();
  await env.DB.prepare(`
    UPDATE analysis_jobs
    SET status = 'error',
        finished_at = ?,
        last_error = ?
    WHERE job_id = ?
  `).bind(finishedAt, String(errMsg || '').slice(0, 800), jobId).run();
}

export async function hasQueuedJobs(userId, env) {
  if (!env.DB) throw new Error("No DB");
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM analysis_jobs WHERE user_id = ? AND status = 'queued'`)
    .bind(userId).first();
  return Number(row?.c || 0) > 0;
}