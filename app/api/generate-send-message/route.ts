import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(req: Request) {
  try {
    const { customerId, title, channel } = await req.json();

    // 顧客設定を取得
    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${customerId} LIMIT 1;
    `;
    const settings = rows[0]?.data?.settings || {};
    const appName = String(settings.appName || 'お店');
    const industry = String(settings.industry || '');

    const surveyUrl = `https://trust.palette-lab.com/survey?customerId=${encodeURIComponent(customerId)}`;

    const isShort = channel === 'sms' || channel === 'line_broadcast' || channel === 'line_push';
    const maxChars = isShort ? 100 : 300;

    const prompt = `
あなたはお店からお客様へアンケートの依頼メッセージを作成するアシスタントです。

【店舗情報】
・店舗名: ${appName}
${industry ? `・業種: ${industry}` : ''}

【送信チャネル】${channel === 'sms' ? 'SMS' : channel === 'email' ? 'メール' : 'LINE'}

${title ? `【タイトル/テーマ】\n${title}\nこのタイトルに合わせた内容で書いてください。` : '【指示】\n来店後のお客様にアンケート回答をお願いする内容で書いてください。'}

【制約】
・${maxChars}文字以内
・敬語で丁寧に
・アンケートURLは「{url}」というプレースホルダーで記載（実際のURLは後で自動挿入されます）
・メールの場合は件名と本文を「件名:」「本文:」で分けて出力
・SMS/LINEの場合は本文のみ出力
・押しつけがましくない自然な文面
・絵文字は控えめに

【出力ルール】
・文章のみを出力してください
`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'AI生成に失敗しました');
    }

    let generatedText = data.choices?.[0]?.message?.content || '';
    // {url}プレースホルダーを実際のURLに置換
    generatedText = generatedText.replace(/\{url\}/g, surveyUrl);

    return NextResponse.json({ message: generatedText });
  } catch (error) {
    console.error('generate-send-message error:', error);
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
