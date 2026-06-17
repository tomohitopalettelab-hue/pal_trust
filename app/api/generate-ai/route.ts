import { NextResponse } from "next/server";
import { checkDemoRateLimit, getClientIp } from "../_lib/rate-limit";

type SurveyItem = {
  id: number | string;
  text: string;
  type: string;
};

type GenerateAiRequestBody = {
  answers?: Record<string, string | number | string[]>;
  surveyItems?: SurveyItem[];
  settings?: {
    aiReviewTaste?: string;
    aiReviewLength?: string | number;
    aiUseEmoji?: boolean;
    aiBannedWords?: string;
    aiPreferredWords?: string;
    industry?: string;
  };
};

type OpenAIChoice = { message?: { content?: string } };
type OpenAIResponse = {
  choices?: OpenAIChoice[];
  error?: { message?: string };
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o";

const tasteMap: Record<string, string> = {
  friendly: "親しみやすく柔らかい敬語（〜でした！、〜ですね、〜してもらえました！など。ため口は禁止）",
  polite: "丁寧で誠実な、しっかりした敬語（〜でございます、感謝しております等）",
  energetic: "元気でポジティブな敬語（！を多用しつつも「〜でした！」「〜です！」など丁寧語を維持。ため口は禁止）",
  emotional: "感動が伝わるような心温まる敬語（感動しました、心に残りました等）",
  minimal: "短く端的に良さを伝える敬語（〜でした。また伺います。等。ため口は禁止）",
};

const lengthRangeMap: Record<string, { range: string; min: number; max: number }> = {
  short: { range: '80〜120文字', min: 80, max: 120 },
  medium: { range: '150〜200文字', min: 150, max: 200 },
  long: { range: '250〜350文字', min: 250, max: 350 },
};

const parseList = (raw: string | undefined): string[] => {
  if (!raw) return [];
  return raw.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
};

const formatAnswerVal = (v: unknown): string => {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).join('、');
  return String(v);
};

const buildContext = (answers: Record<string, string | number | string[]>, surveyItems: SurveyItem[]): string => {
  const lines: string[] = [];
  surveyItems.forEach((item) => {
    const ans = answers[String(item.id)];
    if (!ans && ans !== 0) return;
    const text = formatAnswerVal(ans);
    if (!text) return;
    if (item.type === 'rating') {
      lines.push(`- ${item.text}: ★${text}/5`);
    } else if (item.type === 'free') {
      // 自由記述は最重要 — 強調
      lines.push(`★【自由記述】${item.text}\n   お客様の生の声: 「${text}」`);
    } else {
      lines.push(`- ${item.text}: ${text}`);
    }
  });
  return lines.join('\n');
};

const buildPrompt = (params: {
  taste: string;
  lengthKey: string;
  useEmoji: boolean;
  preferredWords: string[];
  bannedWords: string[];
  industry?: string;
  context: string;
  variationHint?: string;
}): { system: string; user: string } => {
  const { taste, lengthKey, useEmoji, preferredWords, bannedWords, industry, context, variationHint } = params;
  const lengthInfo = lengthRangeMap[lengthKey] || lengthRangeMap.medium;

  let tasteInstruction = "";
  if (taste === "random") {
    tasteInstruction = "今回の回答内容に最も合うテイストを以下から1つ選んで作成：[親しみやすい / 丁寧 / 元気 / 感動的 / シンプル]（必ず敬語）";
  } else if (taste in tasteMap) {
    tasteInstruction = tasteMap[taste];
  } else {
    tasteInstruction = tasteMap.friendly;
  }

  const system = `あなたは「実際にこのお店を利用したお客様本人」として、Googleマップに投稿する自然な口コミを書くプロのライターです。

【絶対遵守ルール】
1. お客様本人の一人称視点（「私」「自分」など）で書く。第三者・お店側の視点は厳禁
2. 必ず敬語（です・ます調）。ため口・タメ語は絶対禁止
3. 高評価のお客様の口コミなので、ポジティブな内容のみ
4. AI臭・テンプレ感のある定型文は避け、人間味のある自然な文章にする
5. 業種名・サービス名から書き始めない。具体的な体験から自然に始める
6. 点数・評点（「5点満点」「満足度5」等）は直接書かない。「とても満足」など自然に表現
7. 文字数: ${lengthInfo.range}（厳守）
8. ${useEmoji ? '絵文字を1〜3個、自然な位置に挿入してOK（使いすぎない）' : '絵文字は使わない'}`;

  const preferredSection = preferredWords.length > 0
    ? `\n【積極的に使う表現】\n${preferredWords.map((w) => `- 「${w}」`).join('\n')}\n※ 上記の言葉を可能な範囲で文章に自然に取り込む（無理矢理は不可）`
    : '';

  const bannedSection = bannedWords.length > 0
    ? `\n【絶対に使わない言葉】\n${bannedWords.map((w) => `- 「${w}」`).join('、')}`
    : '';

  const industrySection = industry
    ? `\n【店舗の業種】\n${industry}\n※業種に合った自然な表現・用語を使う`
    : '';

  const user = `【テイスト】\n${tasteInstruction}\n${industrySection}${preferredSection}${bannedSection}

【アンケート回答内容】
${context}

${variationHint ? `\n【今回のバリエーション指示】\n${variationHint}\n` : ''}
【重要】
・自由記述（★マーク付き）はお客様の生の声なので、可能な限り内容や表現を活かす
・全質問を均等に取り上げる必要はなく、特に印象に残った点を中心に書く
・「特に印象に残った点はない」等のネガティブ・中立表現は禁止

【出力】
口コミ文章のみを出力。前置き・後書き・「」記号は不要。`;

  return { system, user };
};

const callOpenAI = async (system: string, user: string, opts: { temperature?: number; presence?: number; frequency?: number } = {}): Promise<string> => {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature ?? 0.85,
      presence_penalty: opts.presence ?? 0.6,
      frequency_penalty: opts.frequency ?? 0.3,
    }),
  });
  const data = (await res.json()) as OpenAIResponse;
  if (!res.ok) {
    throw new Error(data.error?.message || "OpenAI APIとの通信に失敗しました");
  }
  return data.choices?.[0]?.message?.content?.trim() || '';
};

// 自己評価＆ブラッシュアップ
const refineComment = async (originalComment: string, lengthKey: string): Promise<string> => {
  const lengthInfo = lengthRangeMap[lengthKey] || lengthRangeMap.medium;
  const system = `あなたは口コミ文章のレビュアーです。以下の口コミを、お客様本人が実際に書いた文章として違和感がないか厳しくチェックし、必要なら自然に書き直してください。`;
  const user = `【チェック観点】
1. AI生成っぽい定型文・お決まりフレーズ（「素晴らしい体験でした」「心温まるサービス」等の使い回し）になっていないか
2. お客様本人の一人称視点で書かれているか（お店側の視点が混じっていないか）
3. 全体が敬語で統一されているか
4. 文字数が${lengthInfo.range}に収まっているか（超過/不足は調整）
5. ネガティブな表現が紛れていないか

【元の口コミ】
${originalComment}

【出力】
問題があれば自然に書き直した最終版の口コミ文章のみを出力。前置き・「」記号不要。問題なければそのまま出力。`;

  try {
    const refined = await callOpenAI(system, user, { temperature: 0.6, presence: 0.3, frequency: 0.2 });
    return refined || originalComment;
  } catch {
    return originalComment;
  }
};

export async function POST(req: Request) {
  try {
    // 公開・無認証エンドポイントのため、IP 単位で1時間あたりの生成回数を制限し
    // OpenAI の過剰消費（不正利用）を防ぐ。1回の生成で複数回の API 呼び出しが走る。
    const ip = getClientIp(req);
    const rl = await checkDemoRateLimit('generate-ai', ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'ご利用が混み合っています。しばらく時間をおいてからお試しください。', variants: [] },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = (await req.json()) as GenerateAiRequestBody;
    const answers = body.answers || {};
    const surveyItems = Array.isArray(body.surveyItems) ? body.surveyItems : [];
    const settings = body.settings || {};

    const context = buildContext(answers, surveyItems);
    const lengthKey = String(settings.aiReviewLength || 'medium');
    const taste = String(settings.aiReviewTaste || 'friendly');
    const useEmoji = Boolean(settings.aiUseEmoji);
    const preferredWords = parseList(settings.aiPreferredWords);
    const bannedWords = parseList(settings.aiBannedWords);
    const industry = settings.industry;

    // 3案を異なるバリエーション指示で並行生成
    const variations = [
      { hint: "1案目：オーソドックスで読みやすい、王道スタイル", temperature: 0.75 },
      { hint: "2案目：少し情緒的で、感情の動きを丁寧に描写するスタイル", temperature: 0.95 },
      { hint: "3案目：具体的なエピソードや細かいディテールを盛り込むスタイル", temperature: 0.85 },
    ];

    const variants = await Promise.all(
      variations.map(async (v) => {
        const { system, user } = buildPrompt({
          taste,
          lengthKey,
          useEmoji,
          preferredWords,
          bannedWords,
          industry,
          context,
          variationHint: v.hint,
        });
        try {
          const draft = await callOpenAI(system, user, { temperature: v.temperature });
          // 自己評価ループでブラッシュアップ
          const refined = await refineComment(draft, lengthKey);
          return refined;
        } catch (e) {
          console.error('variation error:', e);
          return '';
        }
      })
    );

    const results = variants.filter((v) => v && v.length > 20);

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'AI生成に失敗しました。再度お試しください。', variants: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ variants: results });
  } catch (error: unknown) {
    console.error("AI API Error:", error);
    const message = error instanceof Error ? error.message : '不明なエラー';
    return NextResponse.json(
      { error: message, variants: [] },
      { status: 500 }
    );
  }
}
