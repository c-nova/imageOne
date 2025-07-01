import { AzureOpenAI } from "openai";

let chatClient: AzureOpenAI;
async function getChatClient() {
  if (!chatClient) {
    // ローカル開発用: 環境変数から直接読み込み
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || "https://your-openai-endpoint.openai.azure.com/";
    const apiKey = process.env.AZURE_OPENAI_API_KEY || "your-api-key";
    
    chatClient = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion: "2024-04-01-preview",
      deployment: "GPT-4o"
    });
  }
  return chatClient;
}

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🤖 updatePresentationWithChat function processed a request.');
  context.log('🤖 Request body:', req.body);
  
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { chatMessage, presentationPlan } = body;
  
  context.log('🤖 Parsed data:', { 
    chatMessage: chatMessage?.substring(0, 100) + '...',
    presentationExists: !!presentationPlan,
    slideCount: presentationPlan?.slides?.length 
  });
  
  // バリデーション
  if (!chatMessage || typeof chatMessage !== 'string' || chatMessage.trim() === '') {
    context.log('❌ [ERROR] 無効なメッセージ:', { chatMessage, type: typeof chatMessage });
    context.res = { 
      status: 400, 
      body: { error: 'メッセージが指定されていません。' } 
    };
    return;
  }
  
  if (!presentationPlan || !presentationPlan.slides || !Array.isArray(presentationPlan.slides)) {
    context.log('❌ [ERROR] 無効なプレゼンテーションデータ:', presentationPlan);
    context.res = { 
      status: 400, 
      body: { error: 'プレゼンテーションデータが不正です。' } 
    };
    return;
  }

  const systemPrompt = `あなたはプロのプレゼンテーションデザイナーです。ユーザーからの指示に基づいて、既存のプレゼンテーション内容を更新してください。

現在のプレゼンテーション：
タイトル: ${presentationPlan.title}
対象者: ${presentationPlan.targetAudience}
スライド数: ${presentationPlan.slides.length}

各スライドの内容：
${presentationPlan.slides.map((slide: any, index: number) => `
スライド${index + 1}:
- タイトル: ${slide.title}
- 内容: ${slide.content}
`).join('')}

ユーザーの指示を踏まえて、以下のJSON形式で更新されたプレゼンテーションを返してください：
{
  "title": "更新されたタイトル",
  "slides": [
    {
      "title": "スライドタイトル",
      "content": "スライド内容（改行は\\nを使用）"
    }
  ],
  "designTheme": "${presentationPlan.designTheme}",
  "estimatedDuration": "${presentationPlan.estimatedDuration}",
  "targetAudience": "${presentationPlan.targetAudience}",
  "primaryGoal": "${presentationPlan.primaryGoal}"
}`;

  // Function Calling用のfunction定義
  const functions = [
    {
      name: "improveReadability",
      description: "スライドの読みやすさを改善する（フォント大きく指示への対応含む）",
      parameters: {
        type: "object",
        properties: {
          targetSlides: {
            type: "string",
            enum: ["all", "specific"],
            description: "対象スライド範囲"
          },
          slideNumbers: {
            type: "array",
            items: { type: "number" },
            description: "特定スライド番号（targetSlides='specific'の場合）"
          },
          approach: {
            type: "string",
            enum: ["simplify", "clarify", "restructure"],
            description: "改善アプローチ"
          },
          originalInstruction: {
            type: "string",
            description: "元のユーザー指示"
          }
        },
        required: ["targetSlides", "approach", "originalInstruction"]
      }
    },
    {
      name: "adjustLayout",
      description: "スライドのレイアウトや構造を調整する",
      parameters: {
        type: "object",
        properties: {
          targetSlides: {
            type: "string",
            enum: ["all", "specific"],
            description: "対象スライド範囲"
          },
          slideNumbers: {
            type: "array",
            items: { type: "number" },
            description: "特定スライド番号"
          },
          adjustmentType: {
            type: "string",
            enum: ["bullet_structure", "logical_order", "content_separation"],
            description: "調整タイプ"
          },
          originalInstruction: {
            type: "string",
            description: "元のユーザー指示"
          }
        },
        required: ["targetSlides", "adjustmentType", "originalInstruction"]
      }
    }
  ];

  let updatedPresentation: any;
  
  try {
    context.log('🤖 Function Callingでプレゼンテーション更新を依頼中...');
    context.log('🎯 ユーザー指示:', chatMessage.trim());
    
    // 🔥 テスト用: まずはFunction Callingなしで動作確認
    context.log('⚠️ [TEST MODE] Function Callingスキップ - 従来のJSON応答モードでテスト');
    
    const completion = await getChatClient().then(client => 
      client.chat.completions.create({
        model: "GPT-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `P.2のフォントを大きくして - スライド2のみの内容をより読みやすく簡潔に改善してください。他のスライドは変更しないでください。` }
        ],
        temperature: 0.7
      })
    );
    
    const responseContent = completion.choices[0].message?.content;
    context.log('🤖 GPT-4o応答（全文）:', responseContent);
    
    if (!responseContent) {
      throw new Error('GPT-4oからの応答が空です');
    }
    
    // JSONパース
    try {
      updatedPresentation = JSON.parse(responseContent);
      context.log('✅ [DEBUG] JSON解析成功！生成されたプレゼンテーションデータ:', JSON.stringify(updatedPresentation, null, 2));
    } catch (parseError) {
      context.log('❌ [ERROR] JSON解析エラー:', parseError);
      
      // JSONの前後の余計なテキストを削除して再試行
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        context.log('🛠️ [DEBUG] 正規表現で抽出したJSON部分:', jsonMatch[0]);
        updatedPresentation = JSON.parse(jsonMatch[0]);
        context.log('✅ [DEBUG] 再パース成功！');
      } else {
        throw new Error('有効なJSONが見つかりません');
      }
    }
    
    context.log('✅ [SUCCESS] プレゼンテーション更新完了:', {
      title: updatedPresentation.title,
      slideCount: updatedPresentation.slides.length
    });
    
  } catch (err: any) {
    context.log.error('❌ [ERROR] プレゼンテーション更新エラー:', err);
    context.res = { 
      status: 500, 
      body: { error: 'プレゼンテーション更新中にエラーが発生しました: ' + err.message } 
    };
    return;
  }
  
  context.res = { 
    status: 200, 
    body: { 
      data: updatedPresentation,
      debug: {
        testMode: true,
        message: "Function Callingテスト用のレスポンス"
      }
    } 
  };
};

export default httpTrigger;
