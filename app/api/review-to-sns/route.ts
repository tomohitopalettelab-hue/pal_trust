import { NextResponse } from 'next/server';

// 旧pal_opt(SNS自動投稿)の完全リセット(2026-07)に伴い、口コミ→SNS投稿機能は廃止。
export async function POST() {
  return NextResponse.json(
    { success: false, error: 'pal_opt連携は終了しました。' },
    { status: 410 },
  );
}
