import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";

// 🔐 Managed Identityを使用したセキュアなBlob Storage画像プロキシAPI
// SASトークンを使わずに、サーバーサイドでManaged Identityによる認証でアクセス

export default async function (context: any, req: any): Promise<void> {
  const startTime = Date.now();
  const path = req.query.path;
  
  try {
    // 📋 必須パラメータの検証
    if (!path) {
      context.res = {
        status: 400,
        body: { error: "画像パス（path）が必要です" }
      };
      return;
    }

    // 🛡️ セキュリティ：パス注入攻撃の防止
    let sanitizedPath = path.replace(/\.\./g, '').replace(/\/+/g, '/');
    
    // 🔧 パス重複の修正：user-images/ プレフィックスを除去
    if (sanitizedPath.startsWith('user-images/')) {
      sanitizedPath = sanitizedPath.substring('user-images/'.length);
    }
    
    if (sanitizedPath !== path && !path.startsWith('user-images/')) {
      context.log.warn(`⚠️ 不正なパスが検出されました: ${path}`);
      context.res = {
        status: 400,
        body: { error: "無効なパスです" }
      };
      return;
    }

    // 🔑 Managed Identityで認証（セキュア！）
    const credential = new DefaultAzureCredential();
    const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || 'imageonesa';
    const blobServiceClient = new BlobServiceClient(
      `https://${storageAccountName}.blob.core.windows.net`,
      credential
    );

    // 📂 Blob参照とアクセス権限チェック
    const containerName = 'user-images';
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(sanitizedPath);

    context.log(`🔍 画像取得開始: ${sanitizedPath}`);

    // 🎯 Blobの存在確認（効率的）
    const blobExists = await blobClient.exists();
    if (!blobExists) {
      context.log.warn(`❌ 画像が見つかりません: ${sanitizedPath}`);
      context.res = {
        status: 404,
        body: { error: "画像が見つかりません" }
      };
      return;
    }

    // 📥 Blob内容とメタデータを取得
    const downloadResponse = await blobClient.download();
    
    // 🗂️ メタデータとコンテンツタイプの取得
    const contentType = downloadResponse.contentType || 'application/octet-stream';
    const contentLength = downloadResponse.contentLength || 0;
    
    // 📊 ファイルサイズ制限（10MBまで）
    if (contentLength > 10 * 1024 * 1024) {
      context.log.warn(`📏 ファイルサイズが大きすぎます: ${contentLength} bytes`);
      context.res = {
        status: 413,
        body: { error: "ファイルサイズが大きすぎます" }
      };
      return;
    }

    // 🔄 ストリームをバッファに変換
    const chunks: Buffer[] = [];
    if (downloadResponse.readableStreamBody) {
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    }
    const imageBuffer = Buffer.concat(chunks);

    // ⚡ パフォーマンス測定
    const processTime = Date.now() - startTime;
    context.log(`✅ 画像取得完了: ${sanitizedPath} (${processTime}ms, ${imageBuffer.length} bytes)`);

    // 🖼️ 画像レスポンス返却（適切なヘッダー付き）
    context.res = {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length.toString(),
        'Cache-Control': 'public, max-age=86400', // 24時間キャッシュ
        'ETag': downloadResponse.etag || '',
        'Last-Modified': downloadResponse.lastModified?.toUTCString() || '',
        // CORS設定（フロントエンドアクセス用）
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: imageBuffer,
      isRaw: true
    };

  } catch (error: any) {
    const processTime = Date.now() - startTime;
    context.log.error(`❌ 画像プロキシエラー (${processTime}ms):`, {
      error: error.message,
      stack: error.stack,
      path: path
    });

    // 🔍 エラータイプ別の詳細レスポンス
    if (error.code === 'BlobNotFound') {
      context.res = {
        status: 404,
        body: { error: "画像が見つかりません" }
      };
    } else if (error.code === 'AuthenticationFailed') {
      context.res = {
        status: 403,
        body: { error: "認証に失敗しました" }
      };
    } else {
      context.res = {
        status: 500,
        body: { 
          error: "サーバーエラーが発生しました",
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }
      };
    }
  }
};
