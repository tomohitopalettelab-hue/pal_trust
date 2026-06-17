import { sql } from '@vercel/postgres';

/**
 * 簡易レート制限（DB ベース・1時間あたりの上限）。
 *
 * Vercel のサーバーレスはインスタンスをまたいでメモリ状態を共有できないため、
 * Postgres にカウンタを持たせて制限する。バケットキーに「時間」を含めるので、
 * 各時間枠は別行となり、自動的にリセットされる（古い行は opportunistic に掃除）。
 *
 * 主目的: 公開・無認証の AI 生成エンドポイント（/api/generate-ai）への
 * 無制限アクセスによる OpenAI の過剰消費（不正利用）を抑止する。
 */

const DEFAULT_LIMIT = Number(process.env.DEMO_RATE_LIMIT_PER_HOUR || 30) || 30;

let tableReady = false;
const ensureTable = async () => {
  if (tableReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS demo_rate_limits (
      bucket TEXT PRIMARY KEY,
      count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  tableReady = true;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec: number;
};

/**
 * scope+key の組み合わせに対し、現在の時間枠（UTC時）での通数を +1 し、
 * limit を超えていれば allowed:false を返す。
 */
export const checkDemoRateLimit = async (
  scope: string,
  key: string,
  limit: number = DEFAULT_LIMIT,
): Promise<RateLimitResult> => {
  try {
    await ensureTable();

    const now = new Date();
    // UTC の年月日時 (例 2026061715) を時間枠に使う
    const hourKey =
      `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}`;
    const bucket = `${scope}:${key}:${hourKey}`;

    const result = await sql`
      INSERT INTO demo_rate_limits (bucket, count, created_at)
      VALUES (${bucket}, 1, NOW())
      ON CONFLICT (bucket) DO UPDATE SET count = demo_rate_limits.count + 1
      RETURNING count
    `;
    const count = Number(result.rows[0]?.count ?? 1);

    // 古いバケットを掃除（2時間より前）。失敗は無視。
    void sql`DELETE FROM demo_rate_limits WHERE created_at < NOW() - INTERVAL '2 hours'`.catch(() => {});

    const retryAfterSec = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
    return { allowed: count <= limit, count, limit, retryAfterSec };
  } catch (err: any) {
    // レート制限の障害でサービスを落とさない（フェイルオープン）
    console.warn('rate-limit check failed (fail-open):', err?.message || err);
    return { allowed: true, count: 0, limit, retryAfterSec: 0 };
  }
};

/** リクエストからクライアントIPを抽出（Vercel: x-forwarded-for 先頭ホップ）。 */
export const getClientIp = (req: Request): string => {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
};
