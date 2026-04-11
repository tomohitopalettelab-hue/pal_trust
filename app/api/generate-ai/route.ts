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
        industry?: string;
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
            friendly: "親しみやすく柔らかい敬語（〜でした！、〜ですね、〜してもらえました！など。ため口は禁止）",
            polite: "丁寧で誠実な、しっかりした敬語（〜でございます、感謝しております等）",
            energetic: "元気でポジティブな敬語（！を多用しつつも「〜でした！」「〜です！」など丁寧語を維持。ため口は禁止）",
            emotional: "感動が伝わるような心温まる敬語（感動しました、心に残りました等）",
            minimal: "短く端的に良さを伝える敬語（〜でした。また伺います。等。ため口は禁止）",
        };

        let selectedTasteInstruction = "";
        if (settings?.aiReviewTaste === "random") {
            selectedTasteInstruction = "以下の5つのテイストから、今回の回答内容に最も合うものを1つAIが選び、その口調で作成してください：[親しみやすい, 丁寧, 元気, 感動的, シンプル]（※どのテイストでも必ず敬語を使うこと）";
        } else {
            const selectedTasteKey = settings?.aiReviewTaste;
            selectedTasteInstruction = selectedTasteKey && selectedTasteKey in tasteMap
                ? tasteMap[selectedTasteKey]
                : tasteMap.friendly;
        }

        // --- 3. AIへの命令書（プロンプト） ---
        const prompt = `
あなたは「実際にこのお店を利用したお客様本人」として、Googleマップの口コミを書いてください。
以下のアンケート回答は、お客様が実体験に基づいて答えたものです。この回答内容を元に、お客様自身の言葉として自然な口コミを作成してください。

【最重要ルール】
・必ず「お客様本人が書いた文章」として書くこと。第三者やお店側の視点は絶対にNG。
・「〜してもらいました」「〜していただきました」「〜に行きました」など、お客様が体験を語る表現を使うこと。
・「お客様に〜」「ご来店いただき〜」「当店では〜」などお店側の表現は絶対に使わないこと。
・「おすすめです」「また行きたいです」など、他の人に薦める・自分がまた行きたいという気持ちを自然に含めてOK。
・【敬語必須】どのテイストであっても、必ず敬語（です・ます調）で書くこと。「〜だよ」「〜だった」「〜してくれた」などのため口は絶対に使わないこと。

【制約事項】
・口調: ${selectedTasteInstruction}
・文字数目安: ${settings?.aiReviewLength || "150"}文字程度
・構成: アンケートで具体的に触れられている点（回答内容）を必ず盛り込んでください。
・禁止: AIが書いたとバレるような定型文（「素晴らしい体験でした」「心温まるサービス」の多用など）は避け、人間味のある文章にしてください。
・禁止: 全ての回答を均等に取り上げる必要はありません。特に印象に残った点を中心に書いてください。
・禁止: 「特に印象に残った点はありませんでした」「特筆すべき点はない」等のネガティブ・中立的な表現は絶対に使わないこと。高評価のお客様の口コミなので、必ずポジティブな内容だけで構成すること。
・禁止: 文章の冒頭に業種名やサービス名（例:「WEBマーケティングの〜」「美容室の〜」）を入れないこと。いきなり業種名から始まる口コミは不自然です。具体的な体験やきっかけから自然に書き始めてください。
・禁止: 「満足度は5点です」「〇点をつけました」「5点満点で〜」など、点数や評点を直接記載しないこと。満足度の高さは「とても満足しています」「大変良かったです」など自然な表現で伝えてください。

${settings?.industry ? `【店舗の業種】\n${settings.industry}\n※この業種に合った自然な表現・用語を使ってください。\n` : ''}【アンケート回答】
${context}

【出力ルール】
・文章のみを出力してください。
・「」などの記号は不要です。
・最終チェック: 出力前に「この文章はお客様本人が書いたように読めるか？」を確認してください。
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