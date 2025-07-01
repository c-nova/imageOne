import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { AzureOpenAI } from "openai";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const secretClient = new SecretClient(`https://${kvName}.vault.azure.net`, credential);

let chatClient: AzureOpenAI;
async function getChatClient() {
  if (!chatClient) {
    const endpoint = (await secretClient.getSecret("OpenAI-Endpoint")).value!;
    const apiKey = (await secretClient.getSecret("OpenAI-Key")).value!;
    chatClient = new AzureOpenAI({
      endpoint,
      apiVersion: "2024-04-01-preview",
      deployment: "GPT-4o",
      apiKey: apiKey
    });
  }
  return chatClient;
}

// Function Calling実行関数群
async function executeImproveReadability(presentationPlan: any, args: any, context: any): Promise<any> {
  context.log('🎯 executeImproveReadability開始:', args);
  
  const { targetSlides, slideNumbers, approach, originalInstruction } = args;
  
  let enhancedMessage = '';
  
  if (targetSlides === 'specific' && slideNumbers && slideNumbers.length > 0) {
    const targetSlideNumber = slideNumbers[0]; // 最初の指定スライド
    enhancedMessage = `スライド${targetSlideNumber}のみの内容をより読みやすく簡潔に改善してください。長い文章は短く、複雑な表現は分かりやすく変更してください。箇条書きを整理し、重要なポイントを強調してください。他のスライドは一切変更しないでください。

重要：実際のフォントサイズは変更できませんが、内容を簡潔にして読みやすさを向上させることで、視覚的に読みやすいスライドに改善してください。

元の指示: "${originalInstruction}"`;
  } else {
    enhancedMessage = `すべてのスライドの内容をより読みやすく簡潔に改善してください。長い文章は短く、複雑な表現は分かりやすく変更してください。元の指示: "${originalInstruction}"`;
  }
  
  // GPT-4oに改善指示を送信（Function Callingなしで）
  const client = await getChatClient();
  const completion = await client.chat.completions.create({
    model: "GPT-4o",
    messages: [
      { role: "system", content: getSystemPromptForFunction(presentationPlan) },
      { role: "user", content: enhancedMessage }
    ],
    temperature: 0.7
  });
  
  const responseContent = completion.choices[0].message?.content;
  if (!responseContent) {
    throw new Error('読みやすさ改善の応答が空です');
  }
  
  return JSON.parse(responseContent);
}

async function executeAdjustLayout(presentationPlan: any, args: any, context: any): Promise<any> {
  context.log('🎯 executeAdjustLayout開始:', args);
  
  const { targetSlides, slideNumbers, adjustmentType, originalInstruction } = args;
  
  let enhancedMessage = '';
  
  if (targetSlides === 'specific' && slideNumbers && slideNumbers.length > 0) {
    const targetSlideNumber = slideNumbers[0];
    enhancedMessage = `スライド${targetSlideNumber}のみの内容レイアウトを改善してください。箇条書きの構造を見直し、要点を明確に分離し、論理的な順序に整理してください。他のスライドは一切変更しないでください。元の指示: "${originalInstruction}"`;
  } else {
    enhancedMessage = `すべてのスライドのレイアウトを改善してください。箇条書きの構造を整理し、論理的な順序に整理してください。元の指示: "${originalInstruction}"`;
  }
  
  const client = await getChatClient();
  const completion = await client.chat.completions.create({
    model: "GPT-4o",
    messages: [
      { role: "system", content: getSystemPromptForFunction(presentationPlan) },
      { role: "user", content: enhancedMessage }
    ],
    temperature: 0.7
  });
  
  const responseContent = completion.choices[0].message?.content;
  if (!responseContent) {
    throw new Error('レイアウト調整の応答が空です');
  }
  
  return JSON.parse(responseContent);
}

async function executeModifySlideContent(presentationPlan: any, args: any, context: any): Promise<any> {
  context.log('🎯 executeModifySlideContent開始:', args);
  
  const { slideNumber, modificationType, newContent, originalInstruction } = args;
  
  let enhancedMessage = '';
  
  if (modificationType === 'title_change') {
    enhancedMessage = `スライド${slideNumber}のタイトルを「${newContent}」に変更してください。他のスライドは変更しないでください。元の指示: "${originalInstruction}"`;
  } else if (modificationType === 'content_addition') {
    enhancedMessage = `スライド${slideNumber}に以下の内容を追加してください：${newContent}。他のスライドは変更しないでください。元の指示: "${originalInstruction}"`;
  } else {
    enhancedMessage = `スライド${slideNumber}の内容を更新してください。元の指示: "${originalInstruction}"`;
  }
  
  const client = await getChatClient();
  const completion = await client.chat.completions.create({
    model: "GPT-4o",
    messages: [
      { role: "system", content: getSystemPromptForFunction(presentationPlan) },
      { role: "user", content: enhancedMessage }
    ],
    temperature: 0.7
  });
  
  const responseContent = completion.choices[0].message?.content;
  if (!responseContent) {
    throw new Error('スライド内容変更の応答が空です');
  }
  
  return JSON.parse(responseContent);
}

async function executeAddSlide(presentationPlan: any, args: any, context: any): Promise<any> {
  context.log('🎯 executeAddSlide開始:', args);
  
  const { position, afterSlideNumber, title, content, originalInstruction } = args;
  const updatedPresentation = JSON.parse(JSON.stringify(presentationPlan)); // ディープコピー
  
  const newSlide = {
    title: title,
    content: content
  };
  
  if (position === 'end') {
    updatedPresentation.slides.push(newSlide);
  } else if (position === 'after' && afterSlideNumber) {
    updatedPresentation.slides.splice(afterSlideNumber, 0, newSlide);
  }
  
  context.log('✅ スライド追加完了:', {
    position,
    afterSlideNumber,
    newSlideTitle: title,
    totalSlides: updatedPresentation.slides.length
  });
  
  return updatedPresentation;
}

function getSystemPromptForFunction(presentationPlan: any): string {
  return `あなたはプロのプレゼンテーションデザイナーです。ユーザーからの指示に基づいて、既存のプレゼンテーション内容を更新してください。

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
}

重要な注意事項：
- 【フォント調整】【デザイン変更】などのメタ的な説明文の追加は絶対禁止
- 元の内容を完全に削除することは禁止
- 指示と無関係な大幅な内容変更は禁止
- 特定のスライド番号が指定されている場合、他のスライドを変更することは絶対禁止`;
}

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🤖 [REAL] updatePresentationWithChat function processed a request.');
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

  const systemPrompt = `あなたはプロのプレゼンテーションデザイナーです。ユーザーからの指示に基づいて、適切な関数を呼び出してください。

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

重要な注意事項：
- 【フォント調整】【デザイン変更】などのメタ的な説明文の追加は絶対禁止
- 元の内容を完全に削除することは禁止
- 指示と無関係な大幅な内容変更は禁止
- 特定のスライド番号が指定されている場合、他のスライドを変更することは絶対禁止

**重要：必ず適切な関数を呼び出してください。Function Callingを使用してください。**`;

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
    },
    {
      name: "modifySlideContent",
      description: "スライドの内容を直接変更する",
      parameters: {
        type: "object",
        properties: {
          slideNumber: {
            type: "number",
            description: "対象スライド番号"
          },
          modificationType: {
            type: "string",
            enum: ["title_change", "content_addition", "content_replacement"],
            description: "変更タイプ"
          },
          newContent: {
            type: "string",
            description: "新しい内容"
          },
          originalInstruction: {
            type: "string",
            description: "元のユーザー指示"
          }
        },
        required: ["slideNumber", "modificationType", "originalInstruction"]
      }
    },
    {
      name: "addSlide",
      description: "新しいスライドを追加する",
      parameters: {
        type: "object",
        properties: {
          position: {
            type: "string",
            enum: ["end", "after"],
            description: "追加位置"
          },
          afterSlideNumber: {
            type: "number",
            description: "この番号の後に追加（position='after'の場合）"
          },
          title: {
            type: "string",
            description: "新しいスライドのタイトル"
          },
          content: {
            type: "string",
            description: "新しいスライドの内容"
          },
          originalInstruction: {
            type: "string",
            description: "元のユーザー指示"
          }
        },
        required: ["position", "title", "content", "originalInstruction"]
      }
    }
  ];

  const client = await getChatClient();
  let updatedPresentation: any;
  
  try {
    context.log('🤖 [REAL] Function Callingでプレゼンテーション更新を依頼中...');
    context.log('🎯 ユーザー指示:', chatMessage.trim());
    
    const completion = await client.chat.completions.create({
      model: "GPT-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: chatMessage.trim() }
      ],
      functions: functions,
      function_call: "auto",
      temperature: 0.7
    });
    
    const responseContent = completion.choices[0].message?.content ?? null;
    const functionCall = completion.choices[0].message?.function_call;
    
    context.log('🤖 GPT-4o応答（全文）:', responseContent);
    context.log('🔧 Function Call:', functionCall);
    
    if (functionCall) {
      // Function Callingの場合の処理
      context.log('🎯 [REAL] Function Callingによる処理開始');
      const functionName = functionCall.name;
      const functionArgs = JSON.parse(functionCall.arguments || '{}');
      
      context.log('📞 呼び出された関数:', functionName);
      context.log('📋 関数の引数:', functionArgs);
      
      // 各functionの処理を実行
      switch (functionName) {
        case 'improveReadability':
          updatedPresentation = await executeImproveReadability(
            presentationPlan, 
            functionArgs, 
            context
          );
          break;
          
        case 'adjustLayout':
          updatedPresentation = await executeAdjustLayout(
            presentationPlan, 
            functionArgs, 
            context
          );
          break;
          
        case 'modifySlideContent':
          updatedPresentation = await executeModifySlideContent(
            presentationPlan, 
            functionArgs, 
            context
          );
          break;
          
        case 'addSlide':
          updatedPresentation = await executeAddSlide(
            presentationPlan, 
            functionArgs, 
            context
          );
          break;
          
        default:
          throw new Error(`サポートされていない関数: ${functionName}`);
      }
      
      context.log('✅ [REAL] Function実行完了！更新されたプレゼンテーション:', JSON.stringify(updatedPresentation, null, 2));
      
    } else if (responseContent) {
      // 従来のJSON応答の場合の処理（フォールバック）
      context.log('📄 従来のJSON応答モードで処理');
      
      try {
        updatedPresentation = JSON.parse(responseContent);
        context.log('✅ [DEBUG] JSON解析成功！生成されたプレゼンテーションデータ:', JSON.stringify(updatedPresentation, null, 2));
      } catch (parseError) {
        context.log('❌ [ERROR] JSON解析エラー:', parseError);
        context.log('🔍 [DEBUG] 解析に失敗した生の応答:', responseContent);
        
        // JSONの前後の余計なテキストを削除して再試行
        const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          context.log('🛠️ [DEBUG] 正規表現で抽出したJSON部分:', jsonMatch[0]);
          updatedPresentation = JSON.parse(jsonMatch[0]);
          context.log('✅ [DEBUG] 再パース成功！修復されたプレゼンテーションデータ:', JSON.stringify(updatedPresentation, null, 2));
        } else {
          context.log('💥 [ERROR] 正規表現でもJSONが見つかりませんでした');
          throw new Error('有効なJSONが見つかりません');
        }
      }
    } else {
      throw new Error('GPT-4oからの応答が空です');
    }
    
    // レスポンス形式の検証
    if (!updatedPresentation.title || !updatedPresentation.slides || !Array.isArray(updatedPresentation.slides)) {
      context.log('💥 [ERROR] 生成されたJSONの形式が不正です:', {
        hasTitle: !!updatedPresentation.title,
        hasSlides: !!updatedPresentation.slides,
        slidesIsArray: Array.isArray(updatedPresentation.slides),
        actualStructure: Object.keys(updatedPresentation)
      });
      throw new Error('更新されたプレゼンテーションの形式が不正です');
    }
    
    context.log('✅ [REAL] プレゼンテーション更新完了:', {
      title: updatedPresentation.title,
      slideCount: updatedPresentation.slides.length
    });
    
  } catch (err: any) {
    context.log.error('❌ [REAL ERROR] プレゼンテーション更新エラー:', err);
    const msg = err.message || '';
    if (msg.includes('filtered due to the prompt triggering')) {
      context.res = { 
        status: 400, 
        body: { error: 'メッセージが内容ポリシーに抵触したため処理できませんでした。' } 
      };
      return;
    }
    context.res = { 
      status: 500, 
      body: { error: '[REAL] プレゼンテーション更新中にエラーが発生しました: ' + err.message } 
    };
    return;
  }
  
  // スライドの変更を詳細に追跡
  const slideChanges = presentationPlan.slides.map((originalSlide: any, index: number) => {
    const updatedSlide = updatedPresentation.slides[index];
    if (!updatedSlide) return { index, status: 'deleted' };
    
    return {
      index: index + 1,
      titleChanged: originalSlide.title !== updatedSlide.title,
      contentChanged: originalSlide.content !== updatedSlide.content,
      originalTitle: originalSlide.title,
      updatedTitle: updatedSlide.title,
      originalContent: originalSlide.content?.substring(0, 200) + (originalSlide.content?.length > 200 ? '...' : ''),
      updatedContent: updatedSlide.content?.substring(0, 200) + (updatedSlide.content?.length > 200 ? '...' : '')
    };
  });
  
  const debugInfo = slideChanges.filter((change: any) => 
    change.titleChanged || change.contentChanged || change.status === 'deleted'
  );
  
  context.res = { 
    status: 200, 
    body: { 
      data: updatedPresentation,
      debug: {
        realMode: true,
        changesDetected: debugInfo.length > 0,
        changes: debugInfo,
        totalSlides: updatedPresentation.slides.length,
        requestMessage: chatMessage,
        functionCalled: "realFunctionCalling"
      }
    } 
  };
};

export default httpTrigger;
