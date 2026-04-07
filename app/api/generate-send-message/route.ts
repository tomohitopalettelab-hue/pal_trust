import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(req: Request) {
  try {
    const { customerId, title, channel, targetType, taste, campaign } = await req.json();

    const { rows } = await sql`
      SELECT data FROM customer_app_settings WHERE customer_id = ${customerId} LIMIT 1;
    `;
    const settings = rows[0]?.data?.settings || {};
    const industry = String(settings.industry || '');

    const surveyUrl = `https://trust.palette-lab.com/survey?customerId=${encodeURIComponent(customerId)}`;

    const isEmail = channel === 'email';
    const isShort = channel === 'sms' || channel === 'line_broadcast' || channel === 'line_push';
    const maxChars = isShort ? 100 : 300;

    const targetMap: Record<string, string> = {
      new: '初めて来店・利用したお客様',
      existing: '何度か来店・利用している既存のお客様',
      past: 'しばらく来店・利用がない過去のお客様',
    };

    const tasteMap: Record<string, string> = {
      aftercare: 'ご来店・ご利用後のアフターフォローとして、感謝を伝えつつアンケートをお願いする温かい文面',
      survey: 'シンプルにアンケート回答をお願いする丁寧な文面',
      campaign: 'キャンペーン・特典感のあるワクワクする文面',
    };

    const targetInstruction = targetMap[targetType] || targetMap.existing;
    const tasteInstruction = tasteMap[taste] || tasteMap.survey;

    const prompt = `
あなたはお店からお客様へアンケート依頼メッセージを作成するアシスタントです。

${industry ? `【業種】${industry}` : ''}

【ターゲット】${targetInstruction}
【テイスト】${tasteInstruction}
${campaign ? `【キャンペーン/お礼】アンケート回答者への特典: ${campaign}\nこの特典内容を自然に文面に盛り込んでください。` : ''}
${title ? `【タイトル/テーマ】${title}\nこのテーマに合わせた内容で書いてください。` : ''}

【制約】
・${maxChars}文字以内（${isEmail ? '本文のみ' : '全体'}）
・敬語で丁寧に
・店舗名やサービス名は文中に含めないこと（宛先で分かるため不要）
・アンケートURLは「${surveyUrl}」をそのまま記載
・押しつけがましくない自然な文面
・絵文字は控えめに

${isEmail ? `【出力形式】以下のJSON形式のみを出力してください。他のテキストは不要です。
{"subject":"件名をここに","body":"本文をここに"}` : '【出力ルール】本文のみを出力してください。'}
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

    const raw = data.choices?.[0]?.message?.content || '';

    if (isEmail) {
      // JSONパース試行
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            subject: String(parsed.subject || ''),
            body: String(parsed.body || ''),
          });
        }
      } catch { /* fall through */ }
      // パース失敗時はそのまま返す
      return NextResponse.json({ subject: '', body: raw });
    }

    return NextResponse.json({ message: raw });
  } catch (error) {
    console.error('generate-send-message error:', error);
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
