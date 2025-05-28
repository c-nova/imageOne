import axios from "axios";
import FormData from "form-data";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { v4 as uuidv4 } from "uuid";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } from "@azure/storage-blob";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

const httpTrigger = async function (context: any, req: any): Promise<void> {
  if (!req.headers["content-type"]?.includes("application/json")) {
    context.res = { status: 400, body: { error: "application/jsonで送ってね！" } };
    return;
  }

  // --- JSONで受信 ---
  const { prompt, size, actualSize, imageBase64, maskBase64 } = req.body || {};
  if (!imageBase64) {
    context.res = { status: 400, body: { error: "画像編集にはimageBase64が必須だよ！" } };
    return;
  }

  // 実際に使用するサイズを決定（actualSizeが優先、なければsizeを使用）
  const usedSize = actualSize || size || "1024x1024";
  
  context.log(`🎯 編集リクエスト受信詳細:`);
  context.log(`  - prompt: ${prompt}`);
  context.log(`  - size (ユーザー選択): ${size}`);
  context.log(`  - actualSize (検出値): ${actualSize}`);
  context.log(`  - usedSize (最終使用): ${usedSize}`);
  context.log(`  - hasMask: ${!!maskBase64}`);

  try {
    // Azure Key Vaultから認証情報を取得
    const endpointSecret = await secretClient.getSecret("OpenAI-Endpoint");
    const apiKeySecret = await secretClient.getSecret("OpenAI-Key");
    const deploymentSecret = await secretClient.getSecret("OpenAI-Deployment"); // 新規追加：デプロイメント名
    const endpoint = endpointSecret.value!;
    const apiKey = apiKeySecret.value!;
    const deploymentId = deploymentSecret.value! || "gpt-image-1"; // デフォルトはgpt-image-1

    // FormData形式でリクエストを構築（最新GPT-image-1対応）
    const formData = new FormData();
    
    // 画像データをBufferに変換してformDataに追加
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    formData.append('image', imageBuffer, { filename: 'image.png', contentType: 'image/png' });
    
    // マスクがある場合は追加
    if (maskBase64) {
      const maskBuffer = Buffer.from(maskBase64, 'base64');
      formData.append('mask', maskBuffer, { filename: 'mask.png', contentType: 'image/png' });
    }
    
    // その他のパラメータを追加（最新仕様対応）
    if (prompt) {
      formData.append('prompt', prompt);
    }
    formData.append('model', 'gpt-image-1'); // 必須パラメータ追加
    formData.append('n', '1');
    formData.append('size', usedSize);
    // response_formatは削除（GPT-image-1では未サポート）
    formData.append('quality', 'high'); // オプション：高品質設定

    context.log("🎨 最新GPT-image-1での画像編集リクエスト送信開始");
    context.log(`  Endpoint: ${endpoint}/openai/deployments/${deploymentId}/images/edits`);
    context.log(`  Model: gpt-image-1`);
    context.log(`  Size: ${usedSize}`);
    context.log(`  Has mask: ${!!maskBase64}`);

    // 最新HTTP API（GPT-image-1 編集API）を使用
    const response = await axios.post(
      `${endpoint}/openai/deployments/${deploymentId}/images/edits?api-version=2025-04-01-preview`,
      formData,
      {
        headers: {
          'api-key': apiKey,
          ...formData.getHeaders()
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    context.log('最新GPT-image-1 Image Edit APIレスポンス取得成功');
    // GPT-image-1ではデフォルトでbase64形式で返される
    const imageData = response.data?.data?.[0];
    const b64 = imageData?.b64_json || imageData?.url; // URLの場合もあるかもしれない
    if (!b64) {
      context.log('APIレスポンス詳細:', JSON.stringify(response.data, null, 2));
      context.res = { status: 500, body: { error: 'GPT-image-1での画像編集に失敗しました。' } };
      return;
    }

    // URLが返された場合はfetchしてbase64に変換
    let imageBase64Data: string;
    if (b64.startsWith('http')) {
      context.log('画像URLが返されました。Base64に変換中...');
      const imageResponse = await axios.get(b64, { responseType: 'arraybuffer' });
      imageBase64Data = Buffer.from(imageResponse.data).toString('base64');
    } else {
      imageBase64Data = b64;
    }
    
    // --- Blob Storageへの保存処理 ---
    const outputBlobName = `edit-${uuidv4()}.png`;
    const outputContainerName = "generated-images";
    const outputBlobServiceClient = new BlobServiceClient(
      `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
    const outputContainerClient = outputBlobServiceClient.getContainerClient(outputContainerName);
    await outputContainerClient.createIfNotExists();
    
    const imageDataBuffer = Buffer.from(imageBase64Data, 'base64');
    const outputBlobClient = outputContainerClient.getBlockBlobClient(outputBlobName);
    await outputBlobClient.uploadData(imageDataBuffer, {
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
    
    context.log(`編集画像をBlob Storageに保存しました: ${outputBlobUrl}`);

    context.res = {
      status: 200,
      body: {
        message: "画像編集が完了しました。",
        imageUrl: outputBlobUrl,
        imageBase64: imageBase64Data
      }
    };

  } catch (error: any) {
    context.log.error("画像編集中にエラー:", error);
    
    // Axiosのレスポンスエラーをチェック
    if (error?.response?.data) {
      const errorData = error.response.data;
      context.log("OpenAI API error response:", errorData);
      
      // コンテンツフィルタエラーを検出
      if (errorData.error?.code === 'content_filter' || 
          errorData.error?.code === 'moderation_blocked' ||
          (errorData.error?.message && errorData.error.message.includes('content policy')) ||
          (errorData.error?.message && errorData.error.message.includes('filtered'))) {
        context.res = { 
          status: 400, 
          body: {
            error: "コンテンツポリシーに違反する内容が検出されました。",
            errorType: "content_filter"
          }
        };
        return;
      }
    }
    
    // OpenAIのコンテンツフィルタエラーをチェック（SDKスタイル）
    if (error?.code === 'content_filter' || error?.code === 'moderation_blocked') {
      context.res = { 
        status: 400, 
        body: {
          error: "コンテンツポリシーに違反する内容が検出されました。",
          errorType: "content_filter"
        }
      };
    } else {
      context.res = { 
        status: 500, 
        body: { 
          error: "画像編集中にエラーが発生しました。",
          errorDetails: error?.message || String(error)
        }
      };
    }
  }
};

export default httpTrigger;
