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

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🎯 [DEBUG] recommend関数開始');
  context.log('🎯 [DEBUG] Request body:', req.body);
  
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body?.prompt;
  const mode = body?.mode || 'image'; // 'image', 'video', or 'powerpoint'
  
  context.log('🎯 [DEBUG] Parsed body:', body);
  context.log('🎯 [DEBUG] Extracted prompt:', prompt);
  context.log('🎯 [DEBUG] Mode:', mode);
  
  // プロンプトのバリデーション
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    context.log('❌ [ERROR] 無効なプロンプト:', { prompt, type: typeof prompt });
    context.res = { 
      status: 400, 
      body: { error: 'プロンプトが指定されていません。有効な文字列を入力してください。' } 
    };
    return;
  }
  
  // モードに応じてシステムプロンプトを切り替え
  let systemPrompt: string;
  if (mode === 'video') {
    systemPrompt = `あなたはプロの動画プロンプトエンジニアです。ユーザーの入力からAzure OpenAI Soraで魅力的な動画を生成するための、1カットで一貫した動きやシーンを表現する日本語プロンプトを300文字以内で作成してください。

重要なポイント：
- 動きや変化を表現する動詞を多用する（流れる、舞う、輝く、変化する、移動する、回転する等）
- 時間軸を意識した表現を含める（始まり→変化→終わり）
- カメラワークを含める（パン、ズーム、追従、チルト等）
- 動画ならではの要素を強調する（アニメーション、トランジション、動的な光の変化等）
- 動作の速度や強弱を表現する（ゆっくりと、急に、リズミカルに等）

※複数カットやシーン切り替え、場面転換、複数の異なるシーンを構成するような内容は含めず、1つのシーン・カットで完結するプロンプトにしてください。`;
  } else if (mode === 'powerpoint') {
    systemPrompt = `あなたはプロのプレゼンテーションコンサルタントです。ユーザーの簡単な入力から、効果的で具体的なプレゼンテーション作成プロンプトを400文字以内で作成してください。

重要なポイント：
- 目的とターゲット聴衆を明確にする（投資家向け、社員研修用、顧客向けなど）
- 発表時間を具体的に指定する（5分、15分、30分など）
- 含めるべき要素を明記する（市場分析、競合比較、データ、事例、アクションプランなど）
- 期待する成果や反応を含める（意思決定、行動変容、理解促進など）
- 業界や専門分野があれば具体的に記載する
- プレゼンテーションのトーンやスタイルを指定する（データ重視、ストーリー重視、視覚的など）`;
  } else {
    systemPrompt = "あなたはプロのプロンプトエンジニアです。ユーザーの入力からAzure OpenAIで高品質な画像を生成するための具体的で魅力的な日本語プロンプトを300文字以内で作成してください。";
  }
  
  const client = await getChatClient();
  let recommended: string | null = null;
  try {
    context.log('🎯 [DEBUG] OpenAI APIを呼び出し中...');
    const completion = await client.chat.completions.create({
      model: "GPT-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt.trim() }
      ]
    });
    
    recommended = completion.choices[0].message?.content ?? null;
    context.log(`✅ [SUCCESS] ${mode}用プロンプト最適化完了:`, { recommended: recommended?.substring(0, 100) + '...' });
  } catch (err: any) {
    context.log.error('❌ [ERROR] recommend error:', err);
    const msg = err.message || '';
    if (msg.includes('filtered due to the prompt triggering')) {
      context.res = { status: 400, body: { error: 'プロンプトが内容ポリシーに抵触したため生成できませんでした。別の表現で試してね。' } };
      return;
    }
    context.res = { status: 500, body: { error: '推奨プロンプトの生成中にエラーが発生しました。' } };
    return;
  }
  // 正常応答
  context.res = { status: 200, body: { recommended } };
};

export default httpTrigger;
