// 🚨 SAS REFRESH API - DISABLED (プロキシ実装により不要)
// refresh-token/index.ts - 既存の画像URLに新しいSASトークンを生成するAPI
// ❌ この機能は /api/image-proxy 実装により不要になりました

const httpTrigger = async function (context: any, req: any): Promise<void> {
  // SAS refresh機能は無効化済み - プロキシ使用のため不要
  context.log('🚨 refresh-token API は無効化されています - /api/image-proxy を使用してください');
  context.res = { 
    status: 410, 
    body: { 
      error: "この機能は無効化されました",
      message: "SASトークン更新は不要です。画像は /api/image-proxy 経由でアクセスしてください。"
    } 
  };
  return;
};

export default httpTrigger;

/* === 以下、元のコード（完全にコメントアウト） ===

import { getUserFromRequest, maskUserInfo } from "../shared/auth";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";

const httpTrigger = async function (context: any, req: any): Promise<void> {
  context.log('🔧 refresh-token関数開始');
  
  // ユーザー認証の確認
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('SASトークン更新要求 - 認証済みユーザー:', maskUserInfo(userInfo));
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

  try {
    context.log('🔧 リクエストボディ:', req.body);
    const { imageUrls } = req.body;
    
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      context.log.error('❌ imageUrlsが無効:', imageUrls);
      context.res = { 
        status: 400, 
        body: { error: "imageUrlsが必要です。画像URLの配列を送信してください。" } 
      };
      return;
    }

    context.log('🔧 処理する画像URL数:', imageUrls.length);

    // Blob Storage設定
    const outputStorageAccountKey = process.env.STORAGE_ACCOUNT_KEY;
    const outputStorageAccountName = process.env.STORAGE_ACCOUNT_NAME;
    const outputContainerName = process.env.STORAGE_CONTAINER_NAME || 'user-images';
    
    context.log('🔧 Blob Storage設定:', {
      accountName: outputStorageAccountName,
      containerName: outputContainerName,
      hasAccountKey: !!outputStorageAccountKey
    });
    
    if (!outputStorageAccountKey || !outputStorageAccountName) {
      context.log.error('❌ Blob Storage設定が不完全');
      throw new Error("Blob Storage設定が不完全です");
    }

    const outputBlobServiceClient = new BlobServiceClient(
      `https://${outputStorageAccountName}.blob.core.windows.net`,
      new StorageSharedKeyCredential(outputStorageAccountName, outputStorageAccountKey)
    );

    // 新しいSASトークンを生成（アカウントキー方式）
    const now = new Date();
    const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1時間有効
    const credential = new StorageSharedKeyCredential(outputStorageAccountName, outputStorageAccountKey);

    const refreshedUrls: { [key: string]: string } = {};

    for (const originalUrl of imageUrls) {
      try {
        // URLからblob pathを抽出
        const url = new URL(originalUrl);
        const pathParts = url.pathname.split('/');
        
        // パスの形式: /container-name/blob-path
        if (pathParts.length < 3) {
          context.log.warn(`無効なURL形式: ${originalUrl}`);
          continue;
        }

        const containerName = pathParts[1];
        const blobPath = pathParts.slice(2).join('/');
        
        // セキュリティチェック：ユーザーIDがパスに含まれているか確認
        if (!blobPath.includes(userInfo.userId)) {
          context.log.warn(`アクセス権限なし - ユーザーID不一致: ${blobPath}`);
          continue;
        }

        // 新しいSASトークン生成（アカウントキー方式）
        const sas = generateBlobSASQueryParameters({
          containerName: containerName,
          blobName: blobPath,
          permissions: BlobSASPermissions.parse("r"),
          startsOn: now,
          expiresOn: expiry,
        }, credential).toString();

        const refreshedUrl = `https://${outputStorageAccountName}.blob.core.windows.net/${containerName}/${blobPath}?${sas}`;
        
        refreshedUrls[originalUrl] = refreshedUrl;

        context.log(`SASトークン更新成功: ${blobPath}`);
        
      } catch (urlError: any) {
        context.log.error(`URL処理エラー (${originalUrl}):`, urlError.message);
        continue;
      }
    }

    context.res = {
      status: 200,
      body: {
        refreshedUrls,
        expiresAt: expiry.toISOString(),
        message: `${Object.keys(refreshedUrls).length}件のURLを更新しました`
      }
    };

  } catch (error: any) {
    context.log.error("SASトークン更新中にエラー:", error);
    context.res = { 
      status: 500, 
      body: { 
        error: "SASトークン更新中にエラーが発生しました",
        message: error.message 
      } 
    };
  }
};

=== コメントアウト終了 === */
