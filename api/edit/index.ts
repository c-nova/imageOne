import axios from "axios";
import FormData from "form-data";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { v4 as uuidv4 } from "uuid";
import { BlobServiceClient } from "@azure/storage-blob";
import { getUserFromRequest, generateUserBlobPath, maskUserInfo } from "../shared/auth";
import { savePromptHistory, PromptHistoryItem } from "../shared/cosmos";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

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

  // --- JSONで受信 ---
  const { prompt, size, actualSize, actualWidth, actualHeight, imageBase64, maskBase64, originalPrompt, cameraSettings } = req.body || {};
  if (!imageBase64) {
    context.res = { status: 400, body: { error: "画像編集にはimageBase64が必須だよ！" } };
    return;
  }

  // OpenAI API対応サイズリスト
  const supportedSizes = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
  
  // 実際の画像サイズを優先使用、次にactualSize、最後にデフォルト
  let usedSize: string;
  let usedWidth: number;
  let usedHeight: number;
  let originalWidth: number;
  let originalHeight: number;

  if (actualWidth && actualHeight) {
    // 実際のピクセル値が提供された場合
    originalWidth = actualWidth;
    originalHeight = actualHeight;
    usedWidth = actualWidth;
    usedHeight = actualHeight;
    
    // OpenAI APIサポートサイズに変換
    const originalSize = `${usedWidth}x${usedHeight}`;
    if (supportedSizes.includes(originalSize)) {
      usedSize = originalSize;
      context.log(`📐 実際のピクセル値がサポート済み: ${usedSize}`);
    } else {
      // サポート外サイズの場合は'auto'を使用
      usedSize = 'auto';
      context.log(`📐 実際のピクセル値(${originalSize})はサポート外 → 'auto'に変換: ${usedSize}`);
    }
  } else if (actualSize) {
    // actualSizeが提供された場合
    const [w, h] = actualSize.split('x').map(Number);
    originalWidth = w;
    originalHeight = h;
    usedWidth = w;
    usedHeight = h;
    
    // OpenAI APIサポートサイズかチェック
    if (supportedSizes.includes(actualSize)) {
      usedSize = actualSize;
      context.log(`📐 actualSizeがサポート済み: ${usedSize}`);
    } else {
      // サポート外サイズの場合は'auto'を使用
      usedSize = 'auto';
      context.log(`📐 actualSize(${actualSize})はサポート外 → 'auto'に変換: ${usedSize}`);
    }
  } else {
    // デフォルト値（互換性のため）
    usedSize = "1024x1024";
    usedWidth = 1024;
    usedHeight = 1024;
    originalWidth = 1024;
    originalHeight = 1024;
    context.log(`📐 デフォルトサイズ使用: ${usedSize}`);
  }
  
  const startTime = Date.now(); // 処理時間計測開始
  
  context.log(`🎯 編集リクエスト受信詳細:`);
  context.log(`  - prompt: ${prompt}`);
  context.log(`  - size (フロントエンド): ${size || 'undefined'}`);
  context.log(`  - actualSize (検出値): ${actualSize}`);
  context.log(`  - actualWidth x actualHeight: ${actualWidth} x ${actualHeight}`);
  context.log(`  - originalWidth x originalHeight: ${originalWidth} x ${originalHeight}`);
  context.log(`  - usedSize (OpenAI API用): ${usedSize}`);
  context.log(`  - usedWidth x usedHeight: ${usedWidth} x ${usedHeight}`);
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
    
    // 画像サイズをログ出力（デバッグ用）
    context.log(`📊 送信画像データサイズ: ${imageBuffer.length} bytes`);
    
    // マスクを追加（必須パラメータ）
    if (maskBase64) {
      const maskBuffer = Buffer.from(maskBase64, 'base64');
      formData.append('mask', maskBuffer, { filename: 'mask.png', contentType: 'image/png' });
      context.log('🎭 マスクが提供されました');
      context.log(`📊 送信マスクデータサイズ: ${maskBuffer.length} bytes`);
    } else {
      context.log('⚠️ マスクが提供されていません - Azure OpenAI Image Edit APIにはマスクが必須です');
      context.res = { status: 400, body: { error: "画像編集にはマスクが必須です。フロントエンドでマスク生成を確認してください。" } };
      return;
    }
    
    // その他のパラメータを追加（最新仕様対応）
    if (prompt) {
      // 🎨 色調保持のための強化されたシステムプロンプトを追加
      const enhancedPrompt = `${prompt}

【CRITICAL COLOR PRESERVATION INSTRUCTIONS - MUST FOLLOW】:
- PRESERVE ORIGINAL COLORS: Maintain the exact color temperature, hue, saturation, and brightness of the original image
- NO COLOR FILTERS: Do not apply sepia, vintage, warm, cool, or any color filtering effects
- NO TONE MAPPING: Keep the original color palette intact - no sepia tones, yellow tints, or color shifts
- MAINTAIN VIBRANCY: Preserve the original vibrancy and color intensity
- EXACT COLOR MATCHING: New elements should match the color profile of the surrounding areas
- NO AGING EFFECTS: Avoid vintage, old photo, or weathered color effects
- NEUTRAL COLOR PROCESSING: Use neutral color processing without artistic color grading
- RGB PRESERVATION: Maintain the original RGB color space and values where possible
- COLOR CONSISTENCY: Ensure color consistency across the entire image
- NATURAL LIGHTING: Maintain the original lighting conditions and color temperature`;
      
      formData.append('prompt', enhancedPrompt);
      context.log('🎨 強化された色調保持プロンプトを追加しました');
    }
    formData.append('model', 'gpt-image-1'); // 必須パラメータ追加
    formData.append('n', '1');
    formData.append('size', usedSize); // 実際のサイズを使用
    // response_formatは削除（GPT-image-1では未サポート）
    formData.append('quality', 'high'); // オプション：高品質設定

    context.log("🎨 最新GPT-image-1での画像編集リクエスト送信開始");
    context.log(`  Endpoint: ${endpoint}/openai/deployments/${deploymentId}/images/edits`);
    context.log(`  Model: gpt-image-1`);
    context.log(`  Size: ${usedSize} (OpenAI API用サイズ - 元: ${originalWidth}x${originalHeight})`);
    context.log(`  Width x Height: ${usedWidth} x ${usedHeight}`);
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
    
    // --- ユーザーごとのBlob Storageへの保存処理 ---
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputBlobName = `edited-${timestamp}-${uuidv4().slice(0, 8)}.png`;
    const userBlobPath = generateUserBlobPath(userInfo.userId, outputBlobName);
    const outputContainerName = "user-images";
    
    const outputBlobServiceClient = new BlobServiceClient(
      `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
    const outputContainerClient = outputBlobServiceClient.getContainerClient(outputContainerName);
    await outputContainerClient.createIfNotExists();
    
    const imageDataBuffer = Buffer.from(imageBase64Data, 'base64');
    const outputBlobClient = outputContainerClient.getBlockBlobClient(userBlobPath);
    
    // ユーザー情報と編集情報をBlobメタデータに追加
    // メタデータヘッダー用にプロンプトをクリーンアップ（改行や特殊文字を削除）
    const cleanPrompt = (prompt || 'no-prompt')
      .replace(/[\r\n\t]/g, ' ')  // 改行、タブを空白に変換
      .replace(/[^\x20-\x7E]/g, '') // ASCII印刷可能文字以外を削除
      .substring(0, 100)
      .trim();
    
    await outputBlobClient.uploadData(imageDataBuffer, {
      blobHTTPHeaders: { blobContentType: "image/png" },
      metadata: {
        userId: userInfo.userId,
        prompt: cleanPrompt,
        editedAt: new Date().toISOString(),
        originalSize: `${originalWidth}x${originalHeight}`, // 元の実際のサイズを記録
        actualWidth: usedWidth.toString(),
        actualHeight: usedHeight.toString(),
        operationType: 'edit'
      }
    });
    
    context.log(`ユーザー ${maskUserInfo(userInfo).userId} の編集画像を保存: ${userBlobPath}`);
    
    // プロキシ経由でのURL生成（セキュア・SASトークン不要）
    const outputBlobUrl = `/api/image-proxy?path=${encodeURIComponent(userBlobPath)}`;
    
    context.log(`編集画像をBlob Storageに保存しました: ${userBlobPath} -> プロキシURL: ${outputBlobUrl}`);

    // --- プロンプト履歴をCosmos DBに保存 ---
    try {
      context.log('🔍 編集履歴保存を開始します...');
      const processingTime = Date.now() - startTime;
      const historyItem: PromptHistoryItem = {
        id: uuidv4(),
        userId: userInfo.userId,
        prompt: prompt || 'image-edit-no-prompt',
        originalPrompt: originalPrompt || prompt || 'image-edit',
        cameraSettings: cameraSettings,
        imageUrl: outputBlobUrl,
        imageBlobPath: userBlobPath,
        operationType: 'edit',
        size: `${originalWidth}x${originalHeight}`, // 元の実際のサイズを記録
        timestamp: new Date().toISOString(),
        metadata: {
          userAgent: req.headers['user-agent'],
          processingTime: processingTime,
          hasMask: !!maskBase64,
          actualWidth: usedWidth,
          actualHeight: usedHeight,
          originalDetectedSize: size // 元の検出サイズも保持
        }
      };
      
      context.log('🔍 履歴アイテム作成完了:', JSON.stringify(historyItem, null, 2));
      context.log('🔍 savePromptHistory 関数を呼び出します...');
      
      await savePromptHistory(historyItem);
      context.log(`✅ 編集履歴を保存しました: ${historyItem.id}`);
    } catch (historyError: any) {
      // 履歴保存に失敗しても画像編集は成功として返す
      context.log.error('❌ 編集履歴の保存に失敗しました:', historyError);
      context.log.error('❌ エラー詳細:', {
        message: historyError.message,
        stack: historyError.stack,
        name: historyError.name
      });
    }

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
