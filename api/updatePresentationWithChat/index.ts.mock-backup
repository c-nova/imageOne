// Function Callingテスト用のモックバージョン

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🤖 [MOCK] updatePresentationWithChat function processed a request.');
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

  // 🎯 Function Calling実行関数群（モック版）
  async function executeImproveReadability(presentationPlan: any, args: any, context: any): Promise<any> {
    context.log('🎯 [MOCK] executeImproveReadability開始:', args);
    
    const { targetSlides, slideNumbers, approach, originalInstruction } = args;
    const updatedPresentation = JSON.parse(JSON.stringify(presentationPlan)); // ディープコピー
    
    // モック処理: スライド2のみ内容を簡潔化
    if (targetSlides === 'specific' && slideNumbers?.includes(2)) {
      const slide2 = updatedPresentation.slides[1]; // インデックス1がスライド2
      if (slide2) {
        // 元の複雑な内容を簡潔版に変更
        slide2.content = "Function Callingの概要\n• GPT-4oの関数呼び出し機能活用\n• if-else分岐からの脱却\n• 型安全性と拡張性の実現\n• デバッグ性能の向上";
        context.log('✅ [MOCK] スライド2の内容を簡潔化しました');
      }
    }
    
    context.log('✅ [MOCK] executeImproveReadability完了');
    return updatedPresentation;
  }

  async function executeAdjustLayout(presentationPlan: any, args: any, context: any): Promise<any> {
    context.log('🎯 [MOCK] executeAdjustLayout開始:', args);
    // モック実装...
    return presentationPlan;
  }

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
    }
  ];

  let updatedPresentation: any;
  
  try {
    context.log('🤖 [MOCK] Function Callingシミュレーション開始...');
    context.log('🎯 ユーザー指示:', chatMessage.trim());
    
    // 🎭 モック: GPT-4oの代わりにFunction Callingをシミュレート
    let mockFunctionCall: any = null;
    
    // 簡単なパターンマッチングでFunction Callingをシミュレート
    if (chatMessage.includes('フォント') && chatMessage.includes('大きく')) {
      // スライド番号を抽出
      const slideNumberMatch = chatMessage.match(/P\.?(\d+)|スライド\s*(\d+)|(\d+)枚目/i);
      const targetSlideNumber = slideNumberMatch ? 
        parseInt(slideNumberMatch[1] || slideNumberMatch[2] || slideNumberMatch[3]) : null;
      
      mockFunctionCall = {
        name: "improveReadability",
        arguments: JSON.stringify({
          targetSlides: targetSlideNumber ? "specific" : "all",
          slideNumbers: targetSlideNumber ? [targetSlideNumber] : [],
          approach: "simplify",
          originalInstruction: chatMessage.trim()
        })
      };
    }
    
    context.log('🔧 [MOCK] Function Call:', mockFunctionCall);
    
    if (mockFunctionCall) {
      // Function Callingの場合の処理
      context.log('🎯 [MOCK] Function Callingによる処理開始');
      const functionName = mockFunctionCall.name;
      const functionArgs = JSON.parse(mockFunctionCall.arguments || '{}');
      
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
          
        default:
          throw new Error(`[MOCK] サポートされていない関数: ${functionName}`);
      }
      
      context.log('✅ [MOCK] Function実行完了！更新されたプレゼンテーション:', JSON.stringify(updatedPresentation, null, 2));
      
    } else {
      context.log('📄 [MOCK] Function Calling対象外の指示');
      updatedPresentation = presentationPlan; // 変更なし
    }
    
    context.log('✅ [MOCK] プレゼンテーション更新完了:', {
      title: updatedPresentation.title,
      slideCount: updatedPresentation.slides.length
    });
    
  } catch (err: any) {
    context.log.error('❌ [MOCK ERROR] プレゼンテーション更新エラー:', err);
    context.res = { 
      status: 500, 
      body: { error: '[MOCK] プレゼンテーション更新中にエラーが発生しました: ' + err.message } 
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
        mockMode: true,
        changesDetected: debugInfo.length > 0,
        changes: debugInfo,
        totalSlides: updatedPresentation.slides.length,
        requestMessage: chatMessage,
        functionCalled: updatedPresentation !== presentationPlan ? "improveReadability" : "none"
      }
    } 
  };
};

export default httpTrigger;
