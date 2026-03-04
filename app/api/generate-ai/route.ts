import { NextResponse } from "next/server";

type SurveyItem = {
    id: number | string;
    text: string;
    type: string;
};

type GenerateAiRequestBody = {
    answers?: Record<string, string | number>;
    surveyItems?: SurveyItem[];
    settings?: {
        aiReviewTaste?: string;
        aiReviewLength?: string | number;
    };
};

type OpenAIResponse = {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
};

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as GenerateAiRequestBody;
        const answers = body.answers || {};
        const surveyItems = Array.isArray(body.surveyItems) ? body.surveyItems : [];
        const settings = body.settings || {};

        // 1. 回答内容をテキストにまとめる
        const context = surveyItems.map((item) => {
            const ans = answers[String(item.id)];
            if (!ans) return null;
            return `質問: ${item.text} / 回答: ${ans}${item.type === 'rating' ? '点' : ''}`;
        }).filter(Boolean).join("\n");

        // --- 2. テイストに応じた具体的な指示 ---
        const tasteMap: Record<string, string> = {
            friendly: "親しみやすく、話し言葉を交えた自然な口調（〜だよ、〜でした！など）",
            polite: "丁寧で誠実な、しっかりした敬語（〜でございます、感謝しております等）",
            energetic: "元気いっぱいでポジティブな、ワクワク感が伝わる口調（！を多用し、最高！という雰囲気に）",
            emotional: "感動が伝わるような、心温まるエモーショナルな表現（感動しました、心に残りました等）",
            minimal: "余計な装飾を省き、短く端的に良さを伝える口調（〜で良かった。また行きます。等）",
        };

        let selectedTasteInstruction = "";
        if (settings?.aiReviewTaste === "random") {
            selectedTasteInstruction = "以下の5つのテイストから、今回の回答内容に最も合うものを1つAIが選び、その口調で作成してください：[親しみやすい, 丁寧, 元気, 感動的, シンプル]";
        } else {
            selectedTasteInstruction = tasteMap[settings?.aiReviewTaste] || tasteMap.friendly;
        }

        // --- 3. AIへの命令書（プロンプト） ---
        const prompt = `
一般的なエンドユーザーです。アンケート結果を元に、Googleマップの口コミを作成してください。

【制約事項】
・口調: ${selectedTasteInstruction}
・文字数目安: ${settings?.aiReviewLength || "150"}文字程度
・構成: アンケートで具体的に触れられている点（回答内容）を必ず盛り込んでください。必ず敬語を使ってください。
・禁止: AIが書いたとバレるような定型文（「素晴らしい体験でした」の多用など）は避け、人間味のある文章にしてください。

【アンケート回答】
${context}

【出力ルール】
・文章のみを出力してください。
・「」などの記号は不要です。
`;

        // OpenAI API 呼び出し
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
            }),
        });

        const data = (await response.json()) as OpenAIResponse;

        // --- 修正ポイント：エラーハンドリングの強化 ---
        if (!response.ok) {
            console.error("OpenAI API Error Details:", data);
            throw new Error(data.error?.message || "OpenAI APIとの通信に失敗しました");
        }

        if (!data.choices || data.choices.length === 0) {
            throw new Error("AIからの回答が空でした。");
        }

        const aiText = data.choices?.[0]?.message?.content || '';
        if (!aiText) {
            throw new Error('AIからの回答が空でした。');
        }
        return NextResponse.json({ comment: aiText });

    } catch (error: unknown) {
        console.error("AI API Error:", error);
        const message = error instanceof Error ? error.message : '不明なエラー';
        // クライアント側へ具体的なエラー理由を（開発中は特に）返すと原因がすぐわかります
        return NextResponse.json(
            { comment: `文章の生成に失敗しました (${message})` }, 
            { status: 500 }
        );
    }
}