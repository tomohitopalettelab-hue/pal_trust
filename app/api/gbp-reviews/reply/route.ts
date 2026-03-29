import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { randomUUID } from 'crypto';
import { palDbGet } from '../../_lib/pal-db-client';
import { ensureReviewRepliesTable } from '../../_lib/ensure-review-replies-table';

type ReplyRequestBody = {
  reviewName: string;
  reviewText: string;
  rating: number;
  paletteId: string;
  reviewerName?: string;
};

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

/**
 * POST /api/gbp-reviews/reply
 * レビューに対してAIで返信を生成し、GBP APIに投稿する
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReplyRequestBody;
    const { reviewName, reviewText, rating, paletteId: rawPaletteId, reviewerName } = body;

    if (!reviewName || !rawPaletteId) {
      return NextResponse.json(
        { success: false, error: 'reviewName と paletteId は必須です。' },
        { status: 400 },
      );
    }

    const paletteId = rawPaletteId.trim().toUpperCase();
    await ensureReviewRepliesTable();

    // 既に返信済みか確認
    const { rows: existingRows } = await sql`
      SELECT id FROM pal_trust_review_replies WHERE review_id = ${reviewName} LIMIT 1
    `;
    if (existingRows.length > 0) {
      return NextResponse.json(
        { success: false, error: 'このレビューには既に返信済みです。' },
        { status: 409 },
      );
    }

    // GBP設定を取得
    const settingsRes = await palDbGet(`/api/pal-opt-settings?paletteId=${paletteId}`);
    if (!settingsRes.ok) {
      return NextResponse.json(
        { success: false, error: 'GBP設定の取得に失敗しました。' },
        { status: 502 },
      );
    }
    const settings = await settingsRes.json();
    const gbpAccessToken = settings?.gbp_access_token || settings?.gbpAccessToken;

    if (!gbpAccessToken) {
      return NextResponse.json(
        { success: false, error: 'GBPアクセストークンが設定されていません。' },
        { status: 400 },
      );
    }

    // ビジネス名を取得（設定から、なければ paletteId を使用）
    const businessName = settings?.business_name || settings?.businessName || paletteId;

    // AI で返信文を生成
    const isPositive = (rating || 0) >= 4;
    const isNeutral = (rating || 0) === 3;

    const prompt = `
あなたはビジネスオーナーとして、Google ビジネスプロフィールに寄せられたお客様のレビューに返信を書いてください。

【ビジネス名】${businessName}
【レビュー投稿者名】${reviewerName || 'お客様'}
【レビュー評価】${rating || '不明'}点（5点満点）
【レビュー内容】${reviewText || '(テキストなし)'}

【返信のルール】
・プロフェッショナルで誠実な敬語（です・ます調）で書くこと
・投稿者名を冒頭で呼びかけに使うこと（例：「○○様、」）
・レビュー内容に具体的に触れて返信すること
${isPositive ? `・感謝の気持ちを伝え、またのご来店を歓迎する内容にすること
・お褒めの言葉に対して具体的に喜びを表現すること` : ''}
${isNeutral ? `・感謝の気持ちを伝えつつ、改善への意欲を示すこと
・より良いサービスを目指す姿勢を伝えること` : ''}
${!isPositive && !isNeutral ? `・まずお詫びの気持ちを伝えること
・具体的な改善策や対応を示すこと
・再度のご来店をお願いする姿勢を見せること` : ''}
・150〜250文字程度で簡潔にまとめること
・定型文っぽくならないよう、自然な表現を心がけること

【出力ルール】
・返信文のみを出力してください
・「」や"などの引用記号は不要です
`;

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません。' },
        { status: 500 },
      );
    }

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    const aiData = (await aiRes.json()) as OpenAIResponse;

    if (!aiRes.ok || !aiData.choices?.length) {
      const errMsg = aiData.error?.message || 'AI返信の生成に失敗しました。';
      return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
    }

    const replyText = aiData.choices[0]?.message?.content?.trim() || '';
    if (!replyText) {
      return NextResponse.json(
        { success: false, error: 'AIからの返信が空でした。' },
        { status: 500 },
      );
    }

    // GBP API に返信を投稿
    const gbpReplyUrl = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`;
    const gbpReplyRes = await fetch(gbpReplyUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gbpAccessToken}`,
      },
      body: JSON.stringify({ comment: replyText }),
    });

    if (!gbpReplyRes.ok) {
      const errBody = await gbpReplyRes.json().catch(() => ({}));
      const errMsg = (errBody as { error?: { message?: string } })?.error?.message || 'GBP返信投稿エラー';
      return NextResponse.json(
        { success: false, error: `レビューへの返信に失敗しました: ${errMsg}`, generatedReply: replyText },
        { status: gbpReplyRes.status },
      );
    }

    // 返信記録を保存
    const replyId = randomUUID();
    await sql`
      INSERT INTO pal_trust_review_replies (id, palette_id, review_id, review_text, review_rating, reply_text)
      VALUES (${replyId}, ${paletteId}, ${reviewName}, ${reviewText || null}, ${rating || null}, ${replyText})
    `;

    return NextResponse.json({
      success: true,
      replyId,
      replyText,
    });
  } catch (error: unknown) {
    console.error('--- gbp-reviews/reply エラー ---', error);
    const message = error instanceof Error ? error.message : 'レビュー返信に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
