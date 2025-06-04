import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { AzureOpenAI } from "openai";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { v4 as uuidv4 } from "uuid";
import { getUserFromRequest, generateUserBlobPath, maskUserInfo } from "../shared/auth";
import { savePromptHistory, PromptHistoryItem } from "../shared/cosmos";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

const OPENAI_IMAGE_DEPLOYMENT_NAME = "GPT-Image-1";
let openAIClient: AzureOpenAI | null = null;
async function getOpenAIClient() {
  if (openAIClient) return openAIClient;
  const endpointSecret = await secretClient.getSecret("OpenAI-Endpoint");
  const endpoint = endpointSecret.value!;
  openAIClient = new AzureOpenAI({
    endpoint,
    apiVersion: "2025-04-01-preview",
    deployment: OPENAI_IMAGE_DEPLOYMENT_NAME,
    azureADTokenProvider: async () => {
      const tokenResponse = await credential.getToken("https://cognitiveservices.azure.com/.default");
      return tokenResponse.token;
    }
  });
  return openAIClient;
}

const httpTrigger = async function (context: any, req: any): Promise<void> {
  if (!req.headers["content-type"]?.includes("application/json")) {
    context.res = { status: 400, body: { error: "application/jsonで送ってね！" } };
    return;
  }

  // ユーザー認証の確認
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('認証済みユーザー:', maskUserInfo(userInfo));
  } catch (error: any) {
    context.log.error('認証エラー:', error.message);
    context.res = { 
      status: 401, 
      body: { 
        error: "認証が必要です",
        message: "有効なアクセストークンを提供してください。"
      } 
    };
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body.prompt;
  const originalPrompt = body.originalPrompt || prompt; // フロントエンドから送信される元のプロンプト
  const cameraSettings = body.cameraSettings; // カメラ設定情報
  const sizeParam = body.size || "1024x1024";
  
  const startTime = Date.now(); // 処理時間計測開始
  try {
    const client = await getOpenAIClient();
    const generateParams: any = {
      prompt,
      n: 1,
      size: sizeParam
    };
    context.log('Image Generate APIリクエスト:', JSON.stringify(generateParams));
    const result = await client.images.generate(generateParams);
    context.log('Image Generate APIレスポンス:', JSON.stringify(result).slice(0, 1000));
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) {
      context.res = { status: 500, body: { error: '画像生成に失敗しました。' } };
      return;
    }
    // --- ユーザーごとのBlob Storageへの保存処理（Managed Identity/MSI） ---
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBlobName = `generated-${timestamp}-${uuidv4().slice(0, 8)}.png`;
    const userBlobPath = generateUserBlobPath(userInfo.userId, outputBlobName);
    const outputContainerName = "user-images";
    
    const outputBlobServiceClient = new BlobServiceClient(
      `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
    const outputContainerClient = outputBlobServiceClient.getContainerClient(outputContainerName);
    await outputContainerClient.createIfNotExists();
    
    const imageBuffer = Buffer.from(b64, 'base64');
    const outputBlobClient = outputContainerClient.getBlockBlobClient(userBlobPath);
    
    // ユーザー情報をBlobメタデータに追加（セキュリティ考慮）
    // メタデータヘッダー用にプロンプトをクリーンアップ（改行や特殊文字を削除）
    const cleanPrompt = prompt
      .replace(/[\r\n\t]/g, ' ')  // 改行、タブを空白に変換
      .replace(/[^\x20-\x7E]/g, '') // ASCII印刷可能文字以外を削除
      .substring(0, 100)
      .trim();
    
    await outputBlobClient.uploadData(imageBuffer, {
      blobHTTPHeaders: { blobContentType: "image/png" },
      metadata: {
        userId: userInfo.userId,
        prompt: cleanPrompt,
        generatedAt: new Date().toISOString(),
        size: sizeParam
      }
    });
    
    context.log(`ユーザー ${maskUserInfo(userInfo).userId} の画像を保存: ${userBlobPath}`);
    
    // SASトークン付きURLを生成（プライベートコンテナ対応）
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1時間有効
    const delegationKey = await outputBlobServiceClient.getUserDelegationKey(now, expiry);
    const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;
    if (!storageAccountName) {
      throw new Error("STORAGE_ACCOUNT_NAME環境変数が設定されていません");
    }
    
    const sas = generateBlobSASQueryParameters({
      containerName: outputContainerName,
      blobName: userBlobPath,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: now,
      expiresOn: expiry,
    }, delegationKey, storageAccountName).toString();
    const outputBlobUrl = `${outputBlobClient.url}?${sas}`;
    
    context.log(`画像をBlob Storageに保存しました: ${outputBlobUrl}`);
    
    // --- プロンプト履歴をCosmos DBに保存 ---
    try {
      const processingTime = Date.now() - startTime;
      const historyItem: PromptHistoryItem = {
        id: uuidv4(),
        userId: userInfo.userId,
        prompt: prompt,
        originalPrompt: originalPrompt,
        cameraSettings: cameraSettings,
        imageUrl: outputBlobUrl,
        imageBlobPath: userBlobPath,
        operationType: 'generate',
        size: sizeParam,
        timestamp: new Date().toISOString(),
        metadata: {
          userAgent: req.headers['user-agent'],
          processingTime: processingTime
        }
      };
      
      await savePromptHistory(historyItem);
      context.log(`プロンプト履歴を保存しました: ${historyItem.id}`);
    } catch (historyError: any) {
      // 履歴保存に失敗しても画像生成は成功として返す
      context.log.warn('プロンプト履歴の保存に失敗しました:', historyError.message);
    }
    
    context.res = {
      status: 200,
      body: {
        message: "画像生成が完了しました。",
        imageUrl: outputBlobUrl
      }
    };
  } catch (error: any) {
    context.log.error("画像生成中にエラー:", error);
    
    // OpenAIのコンテンツフィルタエラーをチェック
    if (error?.code === 'content_filter' || error?.code === 'moderation_blocked') {
      context.res = { 
        status: 400, 
        body: { 
          error: "コンテンツフィルタでブロックされました",
          errorType: "content_filter",
          message: "入力したプロンプトがコンテンツポリシーに違反している可能性があります。別の表現で試してみてください。"
        } 
      };
      return;
    }
    
    // HTTP応答エラーをチェック
    if (error?.response?.data) {
      const errorData = error.response.data;
      context.log("OpenAI API error response:", errorData);
      
      // エラー詳細からコンテンツフィルタを検出
      if (errorData.error?.code === 'content_filter' || 
          errorData.error?.code === 'moderation_blocked' ||
          (errorData.error?.message && errorData.error.message.includes('content policy')) ||
          (errorData.error?.message && errorData.error.message.includes('filtered'))) {
        context.res = { 
          status: 400, 
          body: { 
            error: "コンテンツフィルタでブロックされました",
            errorType: "content_filter",
            message: "入力したプロンプトがコンテンツポリシーに違反している可能性があります。暴力的、性的、差別的な内容は生成できません。"
          } 
        };
        return;
      }
    }
    
    // その他のエラー
    context.res = { 
      status: 500, 
      body: { 
        error: "画像生成中にエラーが発生しました。",
        errorType: "general",
        message: "予期しないエラーが発生しました。しばらく時間を置いてから再試行してください。"
      } 
    };
  }
};

export default httpTrigger;
