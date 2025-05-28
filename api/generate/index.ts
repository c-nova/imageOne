import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { AzureOpenAI } from "openai";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } from "@azure/storage-blob";
import { v4 as uuidv4 } from "uuid";

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
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const prompt = body.prompt;
  const sizeParam = body.size || "1024x1024";
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
    // --- Blob Storageへの保存処理（Managed Identity/MSIで直接アップロード！） ---
    const outputBlobName = `output-${uuidv4()}.png`;
    const outputContainerName = "generated-images";
    const outputBlobServiceClient = new BlobServiceClient(
      `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
    const outputContainerClient = outputBlobServiceClient.getContainerClient(outputContainerName);
    await outputContainerClient.createIfNotExists();
    const imageBuffer = Buffer.from(b64, 'base64');
    const outputBlobClient = outputContainerClient.getBlockBlobClient(outputBlobName);
    await outputBlobClient.uploadData(imageBuffer, {
      blobHTTPHeaders: { blobContentType: "image/png" }
    });
    
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
      blobName: outputBlobName,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: now,
      expiresOn: expiry,
    }, delegationKey, storageAccountName).toString();
    const outputBlobUrl = `${outputBlobClient.url}?${sas}`;
    
    context.log(`画像をBlob Storageに保存しました: ${outputBlobUrl}`);
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
