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
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body.prompt;
  const client = await getChatClient();
  let recommended: string | null = null;
  try {
    const completion = await client.chat.completions.create({
      model: "GPT-4o",
      messages: [
        { role: "system", content: "あなたはプロのプロンプトエンジニアです。ユーザーの入力からAzure OpenAIで高品質な画像を生成するための具体的で魅力的な日本語プロンプトを300文字以内で作成してください。" },
        { role: "user", content: prompt }
      ]
    });
    recommended = completion.choices[0].message?.content ?? null;
  } catch (err: any) {
    console.error('recommend error:', err);
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
