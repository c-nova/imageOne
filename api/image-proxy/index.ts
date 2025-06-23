import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { SecretClient } from "@azure/keyvault-secrets";
import fetch from "node-fetch";

// 🔐 Managed Identityを使用したセキュアなBlob Storage画像プロキシAPI + OpenAI APIプロキシ
// SASトークンを使わずに、サーバーサイドでManaged Identityによる認証でアクセス

export default async function (context: any, req: any): Promise<void> {
  const startTime = Date.now();
  const path = req.query.path;
  
  try {
    // 📋 必須パラメータの検証
    if (!path) {
      context.res = {
        status: 400,
        body: { error: "パス（path）が必要です" }
      };
      return;
    }

    // 🔍 OpenAI APIパスかどうかを判定
    if (path.includes('openai/v1/video/generations/') && path.includes('/content/thumbnail')) {
      // OpenAI APIからサムネイルを取得
      return await handleOpenAIThumbnail(context, path, startTime);
    }

    // 通常のBlob Storageプロキシ処理
    return await handleBlobStorage(context, path, startTime);

  } catch (error: any) {
    const processTime = Date.now() - startTime;
    context.log.error(`❌ プロキシエラー (${processTime}ms):`, {
      error: error.message,
      path: path
    });

    context.res = {
      status: 500,
      body: { 
        error: "サーバーエラーが発生しました",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
  }
};

// 🖼️ OpenAI APIサムネイルプロキシ処理
async function handleOpenAIThumbnail(context: any, path: string, startTime: number): Promise<void> {
  context.log(`🖼️ [DEBUG] OpenAI APIサムネイル取得開始: ${path}`);

  try {
    // 🔑 Key Vaultからシークレット取得
    const credential = new DefaultAzureCredential();
    const kvName = process.env.KeyVaultName!;
    const kvUrl = `https://${kvName}.vault.azure.net`;
    const secretClient = new SecretClient(kvUrl, credential);

    const endpoint = (await secretClient.getSecret("sora-Endpoint")).value!;
    const apiKey = (await secretClient.getSecret("sora-Key")).value!;
    
    context.log(`🔑 [DEBUG] Sora Endpoint: ${endpoint}`);
    context.log(`🔑 [DEBUG] API Key取得完了`);

    // 🌐 OpenAI APIの完全URLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    const fullUrl = `${baseUrl}/${path}`;
    context.log(`🔍 [DEBUG] Base URL: ${baseUrl}`);
    context.log(`🔍 [DEBUG] Path: ${path}`);
    context.log(`🔍 [DEBUG] Full URL: ${fullUrl}`);

    // 🎯 OpenAI APIからサムネイルを取得
    const response = await fetch(fullUrl, {
      headers: { 
        "api-key": apiKey 
      }
    });

    context.log(`📡 [DEBUG] OpenAI API レスポンス: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorBody = await response.text();
      context.log.warn(`❌ OpenAI APIエラー詳細:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        url: fullUrl
      });
      context.res = {
        status: response.status,
        body: { error: "OpenAI APIからサムネイルを取得できませんでした", details: errorBody }
      };
      return;
    }

    // 📥 サムネイルデータを取得
    const thumbnailBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    const processTime = Date.now() - startTime;
    context.log(`✅ OpenAI APIサムネイル取得完了: ${path} (${processTime}ms, ${thumbnailBuffer.length} bytes)`);

    // 🖼️ サムネイルレスポンス返却
    context.res = {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': thumbnailBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: thumbnailBuffer,
      isRaw: true
    };

  } catch (error: any) {
    const processTime = Date.now() - startTime;
    context.log.error(`❌ OpenAI APIサムネイル取得エラー (${processTime}ms):`, error);
    
    context.res = {
      status: 500,
      body: { error: "OpenAI APIサムネイル取得に失敗しました" }
    };
  }
}

// 📂 Blob Storageプロキシ処理（既存の処理）
async function handleBlobStorage(context: any, path: string, startTime: number): Promise<void> {
  let containerName = 'user-images'; // デフォルト
  let sanitizedPath = '';

  // 🛡️ セキュリティ：パス注入攻撃の防止
  sanitizedPath = path.replace(/\.\./g, '').replace(/\/+/g, '/');
  
  // 🔧 パス重複の修正：コンテナプレフィックスを除去
  if (sanitizedPath.startsWith('user-images/')) {
    sanitizedPath = sanitizedPath.substring('user-images/'.length);
    containerName = 'user-images';
  } else if (sanitizedPath.startsWith('user-videos/')) {
    sanitizedPath = sanitizedPath.substring('user-videos/'.length);
    containerName = 'user-videos';
  }
  
  context.log(`🔍 [DEBUG] コンテナ: ${containerName}, パス: ${sanitizedPath}`);
  
  // セキュリティチェックを緩和（user-videos/も許可）
  if (sanitizedPath !== path && !path.startsWith('user-images/') && !path.startsWith('user-videos/')) {
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
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(sanitizedPath);

  // 🎬 ファイルタイプ判定（ログ用）
  const isVideoFile = sanitizedPath.toLowerCase().endsWith('.mp4') || 
                     sanitizedPath.toLowerCase().endsWith('.mov') || 
                     sanitizedPath.toLowerCase().endsWith('.avi') ||
                     sanitizedPath.toLowerCase().endsWith('.webm');

  context.log(`🔍 ${isVideoFile ? '動画' : '画像'}取得開始: コンテナ=${containerName}, パス=${sanitizedPath}`);

  // 🎯 Blobの存在確認（効率的）
  const blobExists = await blobClient.exists();
  if (!blobExists) {
    context.log.warn(`❌ ファイルが見つかりません: ${sanitizedPath}`);
    context.res = {
      status: 404,
      body: { error: "ファイルが見つかりません" }
    };
    return;
  }

  // 📥 Blob内容とメタデータを取得
  const downloadResponse = await blobClient.download();
  
  // 🗂️ メタデータとコンテンツタイプの取得
  const contentType = downloadResponse.contentType || 'application/octet-stream';
  const contentLength = downloadResponse.contentLength || 0;
  
  // 📊 ファイルサイズ制限（画像: 10MB、動画: 100MBまで）
  const maxSize = isVideoFile ? 100 * 1024 * 1024 : 10 * 1024 * 1024; // 動画100MB、画像10MB
  
  if (contentLength > maxSize) {
    context.log.warn(`📏 ファイルサイズが大きすぎます: ${contentLength} bytes (制限: ${maxSize} bytes)`);
    context.res = {
      status: 413,
      body: { error: `ファイルサイズが大きすぎます (制限: ${isVideoFile ? '100MB' : '10MB'})` }
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
  const fileBuffer = Buffer.concat(chunks);

  // ⚡ パフォーマンス測定
  const processTime = Date.now() - startTime;
  context.log(`✅ ${isVideoFile ? '動画' : 'ファイル'}取得完了: ${sanitizedPath} (${processTime}ms, ${fileBuffer.length} bytes)`);

  // 🖼️ ファイルレスポンス返却（適切なヘッダー付き）
  context.res = {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': fileBuffer.length.toString(),
      'Cache-Control': 'public, max-age=86400', // 24時間キャッシュ
      'ETag': downloadResponse.etag || '',
      'Last-Modified': downloadResponse.lastModified?.toUTCString() || '',
      // CORS設定（フロントエンドアクセス用）
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type'
    },
    body: fileBuffer,
    isRaw: true
  };
}
