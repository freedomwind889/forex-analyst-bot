// --- DATABASE FUNCTIONS (D1) ---

export async function initDatabase(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_analysis_logs (
      user_id TEXT,
      tf TEXT,
      timestamp INTEGER,
      timestamp_readable TEXT,
      analysis_json TEXT,
      PRIMARY KEY (user_id, tf)
    )
  `).run();

  // FIFO queue for sequential image analysis (per-user)
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS analysis_jobs (
      job_id TEXT PRIMARY KEY,
      user_id TEXT,
      message_id TEXT,
      created_at INTEGER,
      status TEXT,
      attempt INTEGER,
      started_at INTEGER,
      finished_at INTEGER,
      result_tf TEXT,
      last_error TEXT
    )
  `).run();

  // Helpful index for fetching per-user queue quickly (SQLite/D1 supports CREATE INDEX IF NOT EXISTS)
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_analysis_jobs_user_status_created
    ON analysis_jobs(user_id, status, created_at)
  `).run();
}

export async function getAllAnalyses(userId, env) {
  if (!env.DB) throw new Error("No DB");
  const stmt = env.DB.prepare("SELECT * FROM user_analysis_logs WHERE user_id = ?");
  const { results } = await stmt.bind(userId).all();
  return results || [];
}

export async function saveAnalysis(userId, tf, timestamp, timestampReadable, dataObj, env) {
  if (!env.DB) throw new Error("No DB");
  const jsonStr = JSON.stringify(dataObj);
  const stmt = env.DB.prepare(`
    INSERT INTO user_analysis_logs (user_id, tf, timestamp, timestamp_readable, analysis_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, tf) DO UPDATE SET
      timestamp = excluded.timestamp,
      timestamp_readable = excluded.timestamp_readable,
      analysis_json = excluded.analysis_json
  `);
  await stmt.bind(userId, tf, timestamp, timestampReadable, jsonStr).run();
}

export async function deleteAnalysis(userId, tf, env) {
  if (!env.DB) throw new Error("No DB");
  await env.DB.prepare("DELETE FROM user_analysis_logs WHERE user_id = ? AND tf = ?")
    .bind(userId, tf).run();
}

export async function updateAnalysisTF(userId, oldTF, newTF, env) {
  if (!env.DB) throw new Error("No DB");

  const stmtGet = env.DB.prepare("SELECT * FROM user_analysis_logs WHERE user_id = ? AND tf = ?");
  const oldRow = await stmtGet.bind(userId, oldTF).first();

  if (!oldRow) return;

  await saveAnalysis(userId, newTF, oldRow.timestamp, oldRow.timestamp_readable, JSON.parse(oldRow.analysis_json), env);
  await deleteAnalysis(userId, oldTF, env);
}