import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { palDbGet, palDbPost } from '../_lib/pal-db-client';
import { ensureSurveysTable } from '../_lib/ensure-surveys-table';

type ReviewToSnsRequestBody = {
  surveyId: number | string;
  paletteId: string;
  platforms?: string[];
  theme?: string;
};

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const getPalOptOrigin = (): string => {
  const configured = process.env.PAL_OPT_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production'
    ? 'https://pal-opt.vercel.app'
    : 'http://localhost:3200';
};

/**
 * POST /api/review-to-sns
 * レビュー(survey)から画像を生成し、pal_opt_posts にSNS投稿ドラフトを作成する
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReviewToSnsRequestBody;
    const { surveyId, paletteId: rawPaletteId, platforms, theme } = body;

    if (!surveyId || !rawPaletteId) {
      return NextResponse.json(
        { success: false, error: 'surveyId と paletteId は必須です。' },
        { status: 400 },
      );
    }

    const paletteId = rawPaletteId.trim().toUpperCase();

    // 1. surveys テーブルからレビューデータを取得
    await ensureSurveysTable();
    const { rows } = await sql`
      SELECT * FROM surveys WHERE id = ${Number(surveyId)} LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: '指定されたアンケートが見つかりません。' },
        { status: 404 },
      );
    }

    const survey = rows[0];
    const reviewText = String(survey.comment || '');
    const rating = Number(survey.rating || 5);

    if (!reviewText) {
      return NextResponse.json(
        { success: false, error: 'アンケートにコメントがありません。' },
        { status: 400 },
      );
    }

    // 2. pal_opt_settings からビジネス名を取得
    let businessName = paletteId;
    try {
      const settingsRes = await palDbGet(`/api/pal-opt-settings?paletteId=${paletteId}`);
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        businessName = settings?.business_name || settings?.businessName || paletteId;
      }
    } catch {
      // ビジネス名取得失敗は致命的ではない
    }

    // 3. pal_opt の review-to-image API を呼んで画像を生成
    let imageUrl = '';
    try {
      const palOptOrigin = getPalOptOrigin();
      const imageRes = await fetch(`${palOptOrigin}/api/review-to-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText,
          rating,
          businessName,
          theme: theme || 'warm',
          paletteId,
        }),
      });

      if (imageRes.ok) {
        const imageData = await imageRes.json();
        imageUrl = (imageData as { imageUrl?: string }).imageUrl || '';
      } else {
        console.error('review-to-image API エラー:', await imageRes.text().catch(() => ''));
      }
    } catch (imgError) {
      console.error('review-to-image 呼び出し失敗:', imgError);
    }

    // 4. AI で SNS キャプションを生成
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { success: false, error: 'OpenAI APIキーが設定されていません。' },
        { status: 500 },
      );
    }

    const captionPrompt = `
あなたはSNSマーケティングの専門家です。
お客様からいただいたレビューを元に、各SNSプラットフォーム用の投稿文を作成してください。

【ビジネス名】${businessName}
【レビュー評価】${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}（${rating}/5）
【レビュー内容】${reviewText}

以下の3つのフォーマットで投稿文を生成してください。必ずJSONフォーマットで出力してください。

{
  "instagram": "Instagram用のキャプション（お客様の声をご紹介スタイル、ハッシュタグ5個付き、200文字程度）",
  "gbp": "Google ビジネスプロフィール用の投稿文（ビジネスの魅力を伝える、150文字程度）",
  "x": "X(Twitter)用のツイート（140文字以内、簡潔に）"
}

【ルール】
・お客様の声を紹介するスタイルで書くこと（「お客様の声をご紹介」「嬉しいお声をいただきました」等）
・レビュー内容の一部を引用しつつ、ビジネスの魅力を伝えること
・各プラットフォームの特性に合った文体にすること
・JSON形式のみを出力すること（他のテキストは不要）
`;

    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: captionPrompt }],
        temperature: 0.7,
      }),
    });

    const aiData = (await aiRes.json()) as OpenAIResponse;

    if (!aiRes.ok || !aiData.choices?.length) {
      return NextResponse.json(
        { success: false, error: 'SNSキャプションの生成に失敗しました。' },
        { status: 500 },
      );
    }

    const rawContent = aiData.choices[0]?.message?.content?.trim() || '';

    // JSON を抽出（```json ... ``` 形式にも対応）
    let captions: { instagram?: string; gbp?: string; x?: string } = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        captions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      console.error('キャプション JSON パース失敗:', rawContent);
      captions = {
        instagram: `お客様の声をご紹介\n\n「${reviewText.slice(0, 80)}...」\n\n${businessName}をご利用いただきありがとうございます。\n\n#お客様の声 #口コミ #${businessName}`,
        gbp: `嬉しいお声をいただきました。「${reviewText.slice(0, 60)}...」今後もお客様にご満足いただけるよう努めてまいります。`,
        x: `お客様の声をご紹介「${reviewText.slice(0, 60)}...」${businessName}`,
      };
    }

    // 5. pal_db 経由で pal_opt_posts にドラフトレコードを作成
    const requestedPlatforms = platforms || ['instagram', 'gbp', 'x'];

    const postData = {
      paletteId,
      title: `お客様の声 #${surveyId}`,
      topic: 'customer_review',
      keywords: ['お客様の声', '口コミ', businessName],
      status: 'draft',
      source: 'pal_trust',
      sourceType: 'review',
      instagramCaption: requestedPlatforms.includes('instagram') ? (captions.instagram || null) : null,
      instagramImageUrl: imageUrl || null,
      gbpSummary: requestedPlatforms.includes('gbp') ? (captions.gbp || null) : null,
      xText: requestedPlatforms.includes('x') ? (captions.x || null) : null,
    };

    // pal_db の pal_opt_posts に直接作成（pal_db 経由）
    const createRes = await palDbPost('/api/pal-opt-posts', postData);

    let postId = '';
    if (createRes.ok) {
      const createBody = await createRes.json();
      postId = (createBody as { post?: { id?: string }; id?: string })?.post?.id
        || (createBody as { id?: string })?.id
        || '';
    } else {
      // pal_db エンドポイントがない場合のフォールバック: pal_opt の API を直接呼ぶ
      console.warn('pal_db pal-opt-posts 作成失敗、pal_opt 直接呼び出しを試行');
      try {
        const palOptOrigin = getPalOptOrigin();
        const directRes = await fetch(`${palOptOrigin}/api/main/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postData),
        });
        if (directRes.ok) {
          const directBody = await directRes.json();
          postId = (directBody as { post?: { id?: string } })?.post?.id || '';
        }
      } catch (directErr) {
        console.error('pal_opt 直接呼び出しも失敗:', directErr);
      }
    }

    return NextResponse.json({
      success: true,
      postId,
      captions,
      imageUrl,
      platforms: requestedPlatforms,
    });
  } catch (error: unknown) {
    console.error('--- review-to-sns エラー ---', error);
    const message = error instanceof Error ? error.message : 'SNS投稿の作成に失敗しました。';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
