import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { SecretClient } from "@azure/keyvault-secrets";
import fetch from "node-fetch";

// 🔐 Managed Identityを使用したセキュアなBlob Storage画像プロキシAPI + OpenAI APIプロキシ
// SASトークンを使わずに、サーバーサイドでManaged Identityによる認証でアクセス

export default async function (context: any, req: any): Promise<void> {
  const startTime = Date.now();
  const path = req.query.path;
  const url = req.query.url; // 🆕 従来のOpenAI API URL用パラメータ
  
  try {
    // 📋 必須パラメータの検証
    if (!path && !url) {
      context.res = {
        status: 400,
        body: { error: "パス（path）またはURL（url）が必要です" }
      };
      return;
    }

    // 🆕 URLパラメータが指定されている場合（従来のOpenAI API URL用）
    if (url) {
      context.log(`🔗 [DEBUG] 外部URL経由取得: ${url}`);
      return await handleExternalUrl(context, url, startTime);
    }

    // 🔍 OpenAI APIパスかどうかを判定
    if (path.includes('openai/v1/video/generations/') && path.includes('/content/thumbnail')) {
      // 🎯 呼び出し元に応じて処理を分ける
      const referer = req.headers.referer || req.headers.referrer || '';
      const userAgent = req.headers['user-agent'] || '';
      const isFromVideoHistory = req.query.fromHistory === 'true';
      
      context.log(`� [DEBUG] OpenAI APIサムネイル取得要求:`, {
        path: path,
        referer: referer,
        userAgent: userAgent,
        isFromVideoHistory: isFromVideoHistory
      });
      
      // 📺 動画履歴からの呼び出しの場合は無効化（Blob Storageを使うべき）
      if (isFromVideoHistory) {
        context.log.warn(`🚫 [DISABLED] 動画履歴からのOpenAI APIサムネイル取得は無効化されました: ${path}`);
        context.res = {
          status: 404,
          body: { 
            error: "動画履歴のサムネイルはBlob Storageから取得してください。",
            message: "OpenAI APIサムネイルは動画ジョブ実行中のみ利用可能です。"
          }
        };
        return;
      }
      
      // 🔄 動画ジョブ実行中の場合はOpenAI APIから取得
      context.log(`✅ [ALLOW] 動画ジョブ実行中のOpenAI APIサムネイル取得を許可: ${path}`);
      return await handleOpenAIThumbnail(context, path, startTime);
    }

    // 通常のBlob Storageプロキシ処理
    return await handleBlobStorage(context, path, startTime);

  } catch (error: any) {
    const processTime = Date.now() - startTime;
    context.log.error(`❌ プロキシエラー (${processTime}ms):`, {
      error: error.message,
      path: path,
      url: url
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
  sanitizedPath = path.replace(/\.{2}/g, '').replace(/\/+/g, '/');

  // 🔧 パス重複の修正：コンテナプレフィックスを除去
  if (sanitizedPath.startsWith('user-images/')) {
    sanitizedPath = sanitizedPath.substring('user-images/'.length);
    containerName = 'user-images';
  } else if (sanitizedPath.startsWith('user-videos/')) {
    sanitizedPath = sanitizedPath.substring('user-videos/'.length);
    containerName = 'user-videos';
  } else {
    // �️ サムネイルファイル名に_thumbnailが含まれてたらuser-videos優先
    if (sanitizedPath.includes('_thumbnail')) {
      containerName = 'user-videos';
      context.log(`🖼️ [DEBUG] サムネイルファイル検出: ${sanitizedPath} → user-videos コンテナ`);
    } else {
      // �🎬 ファイル拡張子で動画コンテナを判定
      const isVideoFile = /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(sanitizedPath);
      if (isVideoFile) {
        containerName = 'user-videos';
        context.log(`🎬 [DEBUG] 動画ファイル検出: ${sanitizedPath} → user-videos コンテナ`);
      } else {
        containerName = 'user-images';
        context.log(`🖼️ [DEBUG] 画像ファイル検出: ${sanitizedPath} → user-images コンテナ`);
      }
    }
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

  // 🎬 ファイルタイプ判定（ログ用・既に上で設定済み）
  const isVideoFile = /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(sanitizedPath);

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

// 🌐 外部URL（従来のOpenAI API URL）取得処理
async function handleExternalUrl(context: any, url: string, startTime: number): Promise<void> {
  context.log(`🌐 [DEBUG] 外部URL取得開始: ${url}`);

  try {
    // 🔗 外部URLから直接取得
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ImageProxyAPI/1.0'
      }
    });

    if (!response.ok) {
      context.log.error(`❌ 外部URL取得失敗: ${response.status} ${response.statusText}`);
      context.res = {
        status: response.status,
        body: { error: "外部URLの取得に失敗しました" }
      };
      return;
    }

    // 📄 Content-Typeを決定
    let contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // 🎥 URLから拡張子を判定してContent-Typeを補正
    if (url.includes('.mp4')) {
      contentType = 'video/mp4';
    } else if (url.includes('.webm')) {
      contentType = 'video/webm';
    } else if (url.includes('.mov')) {
      contentType = 'video/quicktime';
    } else if (url.includes('.jpg') || url.includes('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (url.includes('.png')) {
      contentType = 'image/png';
    } else if (url.includes('.gif')) {
      contentType = 'image/gif';
    }

    // 📦 ファイルデータを取得
    const buffer = await response.buffer();
    
    // ⚡ パフォーマンス測定
    const processTime = Date.now() - startTime;
    context.log(`✅ 外部URL取得完了: ${url} (${processTime}ms, ${buffer.length} bytes, ${contentType})`);

    // 🖼️ ファイルレスポンス返却
    context.res = {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ（外部URLなので短め）
        // CORS設定
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: buffer,
      isRaw: true
    };

  } catch (error: any) {
    const processTime = Date.now() - startTime;
    context.log.error(`❌ 外部URL取得エラー (${processTime}ms):`, {
      error: error.message,
      url: url
    });

    context.res = {
      status: 500,
      body: { 
        error: "外部URLの取得に失敗しました",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
  }
}
