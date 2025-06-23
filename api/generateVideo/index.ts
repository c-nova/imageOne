import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { getUserFromRequest } from "../shared/auth";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

const httpTrigger = async function (context: any, req: any): Promise<void> {
  // 詳細なデバッグログを追加
  context.log('🔍 [DEBUG] generateVideo関数開始');
  context.log('🔍 [DEBUG] Key Vault URL:', kvUrl);
  context.log('🔍 [DEBUG] Key Vault Name環境変数:', process.env.KeyVaultName);
  
  if (!req.headers["content-type"]?.includes("application/json")) {
    context.res = { status: 400, body: { error: "application/jsonで送ってね！" } };
    return;
  }

  // 🔐 認証ヘッダーからユーザー情報を取得
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('✅ [DEBUG] ユーザー認証成功:', { userId: userInfo.userId, email: userInfo.email });
  } catch (authError: any) {
    context.log.error('❌ [ERROR] 認証エラー:', authError.message);
    context.res = { status: 401, body: { error: "認証が必要です", details: authError.message } };
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body.prompt;
  const height = body.height || 1080;
  const width = body.width || 1080;
  const n_seconds = body.n_seconds || 5;
  const n_variants = body.n_variants || 1;
  const userId = userInfo.userId; // 認証されたユーザーIDを使用
  
  context.log('🔍 [DEBUG] リクエストパラメータ:', { prompt, height, width, n_seconds, n_variants, userId });

  try {
    // Key VaultからSoraエンドポイントとAPIキーを取得（フォールバック付き）
    let endpoint: string;
    let apiKey: string;
    
    try {
      context.log('🔍 [DEBUG] Key Vaultからシークレット取得開始...');
      context.log('🔍 [DEBUG] 取得対象: sora-Endpoint, sora-Key');
      
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      context.log('✅ [DEBUG] sora-Endpoint取得成功');
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      context.log('✅ [DEBUG] sora-Key取得成功');
      apiKey = apiKeySecret.value!;
      
      context.log('🔍 [DEBUG] Key Vault取得完了 - endpoint length:', endpoint?.length || 0);
      context.log('🔍 [DEBUG] Key Vault取得完了 - apiKey length:', apiKey?.length || 0);
      
    } catch (kvError: any) {
      // Key Vaultからの取得に失敗した場合は環境変数から取得
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      context.log.error('❌ [ERROR] エラー詳細:', {
        name: kvError?.name,
        message: kvError?.message,
        code: kvError?.code,
        statusCode: kvError?.statusCode,
        details: kvError?.details
      });
      
      context.log('🔄 [DEBUG] 環境変数フォールバックを試行...');
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || "";
      
      context.log('🔍 [DEBUG] 環境変数 SORA_ENDPOINT:', process.env.SORA_ENDPOINT ? '設定済み' : '未設定');
      context.log('🔍 [DEBUG] 環境変数 SORA_API_KEY:', process.env.SORA_API_KEY ? '設定済み' : '未設定');
      
      if (!apiKey || !endpoint) {
        context.res = { status: 500, body: { 
          error: "Sora APIキー/エンドポイントが設定されていません。Key VaultまたはAzure OpenAI環境変数を設定してください。",
          details: {
            kvError: kvError?.message,
            kvUrl: kvUrl,
            hasEnvEndpoint: !!process.env.SORA_ENDPOINT,
            hasEnvApiKey: !!process.env.SORA_API_KEY,
            hasAzureEndpoint: !!process.env.AZURE_OPENAI_ENDPOINT
          }
        }};
        return;
      }
    }

    // 動画生成用のエンドポイントURLを構築
    const videoGenerationUrl = `${endpoint.replace(/\/$/, '')}/openai/v1/video/generations/jobs?api-version=preview`;
    context.log('🔍 [DEBUG] Video Generation URL:', videoGenerationUrl);

    // Sora APIへリクエスト
    const fetchRes = await fetch(videoGenerationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-key": apiKey
      },
      body: JSON.stringify({
        model: "sora",
        prompt,
        height,
        width,
        n_seconds,
        n_variants
      })
    });

    const result = await fetchRes.json();
    if (!fetchRes.ok) {
      context.res = { status: fetchRes.status, body: { error: "動画生成ジョブの作成に失敗したっぽい！", details: result } };
      return;
    }

    // 🎬 動画履歴を保存（非同期で実行、エラーが出てもメイン処理に影響しない）
    try {
      const historyData = {
        userId,
        prompt,
        originalPrompt: body.originalPrompt || prompt,
        videoSettings: {
          height,
          width,
          n_seconds,
          n_variants,
          model: "sora"
        },
        jobId: result.id, // Sora APIから返されるジョブID
        jobStatus: 'pending',
        metadata: {
          userAgent: req.headers['user-agent'],
          createdAt: new Date().toISOString(),
          soraJobResponse: result
        }
      };

      // videoHistory APIを呼び出し（内部API呼び出し）
      const historyResponse = await fetch(`${req.headers.host}/api/videoHistory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(historyData)
      });

      if (historyResponse.ok) {
        context.log('✅ [DEBUG] 動画履歴保存成功');
      } else {
        context.log('⚠️ [WARNING] 動画履歴保存失敗:', await historyResponse.text());
      }
    } catch (historyError: any) {
      context.log('⚠️ [WARNING] 動画履歴保存エラー:', historyError.message);
    }

    context.res = { status: 200, body: result };
  } catch (error: any) {
    context.log.error("Sora動画生成中にエラー:", error);
    context.res = { status: 500, body: { error: "Sora動画生成中にエラーが発生したよ！", details: error?.message || error } };
  }
};

export default httpTrigger;
