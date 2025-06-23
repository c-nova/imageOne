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
    chatClient = new AzureOpenAI({
      endpoint,
      apiVersion: "2024-04-01-preview",
      deployment: "GPT-4o",
      azureADTokenProvider: async () => {
        const token = (await credential.getToken("https://cognitiveservices.azure.com/.default")).token;
        return token;
      }
    });
  }
  return chatClient;
}

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🎯 [DEBUG] recommend関数開始');
  context.log('🎯 [DEBUG] Request body:', req.body);
  
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body?.prompt;
  const mode = body?.mode || 'image'; // 'image' or 'video'
  
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
    systemPrompt = `あなたはプロの動画プロンプトエンジニアです。ユーザーの入力からAzure OpenAI Soraで魅力的な動画を生成するための具体的で動きのある日本語プロンプトを300文字以内で作成してください。

重要なポイント：
- 動きや変化を表現する動詞を多用する（流れる、舞う、輝く、変化する、移動する、回転する等）
- 時間軸を意識した表現を含める（始まり→変化→終わり）
- カメラワークを含める（パン、ズーム、追従、チルト等）
- 動画ならではの要素を強調する（アニメーション、トランジション、動的な光の変化等）
- 動作の速度や強弱を表現する（ゆっくりと、急に、リズミカルに等）`;
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
    context.log(`✅ [SUCCESS] ${mode}用レコメンド生成完了:`, { recommended: recommended?.substring(0, 100) + '...' });
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
