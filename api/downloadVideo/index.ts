import { AzureCliCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";
import { getUserFromRequest } from "../shared/auth";
import fetch from "node-fetch";

// ローカル開発用：Azure CLI認証を使用
const credential = new AzureCliCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

let blobServiceClient: BlobServiceClient | null = null;
let cosmosClient: CosmosClient | null = null;

// 🎬 動画履歴アイテムの型定義
interface VideoHistoryItem {
  id: string;
  userId: string;
  prompt: string;
  originalPrompt: string;
  videoSettings: {
    height: number;
    width: number;
    n_seconds: number;
    n_variants: number;
    model: string;
  };
  jobId: string;
  jobStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  videoUrl?: string;
  videoBlobPath?: string;
  thumbnailUrl?: string;
  thumbnailBlobPath?: string;
  operationType: 'generate';
  timestamp: string;
  completedAt?: string;
  metadata: {
    userAgent?: string;
    processingTime?: number;
    generationId?: string;
    [key: string]: any;
  };
}

// Blob Storageクライアント取得（シングルトンパターン）
async function getBlobServiceClient(): Promise<BlobServiceClient> {
  if (blobServiceClient) return blobServiceClient;

  try {
    // Key VaultからStorage Account名を取得
    const storageAccountSecret = await secretClient.getSecret("StorageAccountName");
    const storageAccountName = storageAccountSecret.value!;
    
    if (!storageAccountName) {
      throw new Error("StorageAccountName secret is required");
    }

    // Managed Identity認証を使用
    const accountUrl = `https://${storageAccountName}.blob.core.windows.net`;
    blobServiceClient = new BlobServiceClient(accountUrl, credential);

    return blobServiceClient;
  } catch (error: any) {
    console.error('❌ Blob Storage接続エラー:', error);
    throw error;
  }
}

// Cosmos DBクライアント取得（シングルトンパターン）
async function getCosmosClient(): Promise<CosmosClient> {
  if (cosmosClient) return cosmosClient;

  try {
    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    if (!endpoint) {
      throw new Error("COSMOS_DB_ENDPOINT environment variable is required");
    }

    // Managed Identity認証を使用
    cosmosClient = new CosmosClient({
      endpoint,
      aadCredentials: credential
    });

    return cosmosClient;
  } catch (error: any) {
    console.error('❌ Cosmos DB接続エラー:', error);
    throw error;
  }
}

// 🎬 POST: 新しい動画をOpenAI APIからダウンロードしてBlob Storageに保存
async function handleVideoImport(context: any, req: any): Promise<void> {
  context.log('📥 [DEBUG] 動画取り込み処理開始');

  const { videoUrl, jobId, prompt } = req.body;
  
  if (!videoUrl) {
    context.res = { 
      status: 400, 
      body: { error: "videoUrl は必須パラメータです" } 
    };
    return;
  }

  // 🔐 ユーザー認証
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('🎬 動画取り込み処理 - 認証済みユーザー:', { userId: userInfo.userId.substring(0, 8) + '***' });
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

  const userId = userInfo.userId;

  try {
    // 🔑 Key Vaultからシークレット取得
    context.log('🔍 [DEBUG] Key Vaultからシークレット取得開始...');
    const endpoint = (await secretClient.getSecret("sora-Endpoint")).value!;
    const apiKey = (await secretClient.getSecret("sora-Key")).value!;

    // 🎯 OpenAI APIから動画をダウンロード
    context.log('📥 [DEBUG] OpenAI APIから動画ダウンロード開始:', videoUrl);
    const videoResponse = await fetch(videoUrl, {
      headers: { "api-key": apiKey }
    });

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      context.log.error('❌ [ERROR] 動画ダウンロードエラー:', errorText);
      context.res = { 
        status: videoResponse.status, 
        body: { error: "OpenAI APIから動画のダウンロードに失敗しました", details: errorText } 
      };
      return;
    }

    // 動画データをバッファとして取得
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    context.log('✅ [DEBUG] 動画ダウンロード完了:', { size: videoBuffer.length });

    // 🖼️ サムネイルもダウンロード（OpenAI APIから直接）
    let thumbnailBuffer: Buffer | null = null;
    let thumbnailBlobUrl: string | undefined = undefined;
    
    // jobIdから実際のOpenAI APIサムネイルURLを構築
    const jobId = req.body.jobId;
    if (jobId) {
      try {
        // OpenAI APIサムネイルURLを構築（例: gen_01jyzavb3ff3nvta75vhevxz59 の部分が必要）
        // まずジョブ詳細を取得してgenerationIdを探す
        const jobDetailUrl = `${endpoint}openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
        context.log('🔍 [DEBUG] ジョブ詳細取得:', jobDetailUrl);
        
        const jobDetailResponse = await fetch(jobDetailUrl, {
          headers: { "api-key": apiKey }
        });
        
        if (jobDetailResponse.ok) {
          const jobDetail = await jobDetailResponse.json();
          const generationId = jobDetail.generations?.[0]?.id;
          
          if (generationId) {
            const thumbnailUrl = `${endpoint}openai/v1/video/generations/${generationId}/content/thumbnail?api-version=preview`;
            context.log('🖼️ [DEBUG] サムネイルダウンロード開始:', thumbnailUrl);
            
            const thumbnailResponse = await fetch(thumbnailUrl, {
              headers: { "api-key": apiKey }
            });

            if (thumbnailResponse.ok) {
              thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
              context.log('✅ [DEBUG] サムネイルダウンロード完了:', { size: thumbnailBuffer.length });
            } else {
              context.log('⚠️ [WARN] サムネイルダウンロード失敗（続行）:', thumbnailResponse.status);
            }
          } else {
            context.log('⚠️ [WARN] generationId が見つかりません');
          }
        } else {
          context.log('⚠️ [WARN] ジョブ詳細取得失敗（続行）:', jobDetailResponse.status);
        }
      } catch (thumbnailError) {
        context.log('⚠️ [WARN] サムネイルダウンロードエラー（続行）:', thumbnailError);
      }
    }

    // 🗂️ Blob Storageに保存
    const blobServiceClient = await getBlobServiceClient();
    const containerName = 'user-videos'; // 動画専用コンテナ
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // コンテナが存在しない場合は作成（プライベートアクセス）
    await containerClient.createIfNotExists();

    // ファイル名を生成 (jobId_timestamp.mp4)
    const timestamp = Date.now();
    const blobName = `${userId}/${jobId}_${timestamp}.mp4`;
    const blobClient = containerClient.getBlockBlobClient(blobName);

    // 動画をBlob Storageにアップロード
    context.log('📤 [DEBUG] Blob Storageに動画アップロード開始:', blobName);
    await blobClient.upload(videoBuffer, videoBuffer.length, {
      blobHTTPHeaders: {
        blobContentType: 'video/mp4'
      }
    });

    // 🖼️ サムネイルも保存（あれば）
    let thumbnailBlobName: string | undefined = undefined;
    if (thumbnailBuffer) {
      thumbnailBlobName = `${userId}/${jobId}_${timestamp}_thumbnail.jpg`;
      const thumbnailBlobClient = containerClient.getBlockBlobClient(thumbnailBlobName);
      
      context.log('📤 [DEBUG] サムネイルアップロード開始:', thumbnailBlobName);
      await thumbnailBlobClient.upload(thumbnailBuffer, thumbnailBuffer.length, {
        blobHTTPHeaders: {
          blobContentType: 'image/jpeg'
        }
      });
      
      thumbnailBlobUrl = thumbnailBlobClient.url;
      context.log('✅ [DEBUG] サムネイルアップロード完了:', thumbnailBlobUrl);
    }

    // Blob StorageのURLを構築
    const blobUrl = blobClient.url;
    context.log('✅ [DEBUG] 動画アップロード完了:', blobUrl);

    // 🎬 Cosmos DBの動画履歴を更新（Blob Storage情報を追加）
    try {
      context.log('🔄 [DEBUG] Cosmos DB動画履歴更新開始...');
      const cosmosClient = await getCosmosClient();
      const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
      const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
      const database = cosmosClient.database(databaseId);
      const container = database.container(containerId);

      // jobIdで既存の履歴を検索
      const existingQuery = {
        query: "SELECT * FROM c WHERE c.jobId = @jobId",
        parameters: [{ name: '@jobId', value: jobId }]
      };

      const { resources: existing } = await container.items.query(existingQuery).fetchAll();

      if (existing.length > 0) {
        const existingItem = existing[0];
        
        // Blob Storage情報で更新
        existingItem.videoUrl = blobUrl;
        existingItem.videoBlobPath = blobName;
        existingItem.jobStatus = 'completed';
        existingItem.completedAt = new Date().toISOString();
        
        if (thumbnailBlobUrl && thumbnailBlobName) {
          existingItem.thumbnailUrl = thumbnailBlobUrl;
          existingItem.thumbnailBlobPath = thumbnailBlobName;
        }

        await container.items.upsert(existingItem);
        context.log('✅ [DEBUG] Cosmos DB動画履歴更新完了:', { 
          id: existingItem.id, 
          jobId,
          hasVideo: !!existingItem.videoUrl,
          hasThumbnail: !!existingItem.thumbnailUrl,
          videoBlobPath: existingItem.videoBlobPath,
          thumbnailBlobPath: existingItem.thumbnailBlobPath
        });
      } else {
        context.log('⚠️ [WARNING] 対応するjobIdの履歴が見つかりませんでした:', jobId);
      }
    } catch (cosmosError: any) {
      context.log.warn('⚠️ [WARNING] Cosmos DB更新エラー（動画取り込みは成功）:', cosmosError.message);
    }

    // 📊 レスポンスを返す
    context.res = {
      status: 200,
      body: {
        success: true,
        message: "動画の取り込み完了",
        videoUrl: blobUrl,
        thumbnailUrl: thumbnailBlobUrl, // サムネイルのBlob Storage URL
        blobPath: blobName,
        thumbnailBlobPath: thumbnailBlobName, // サムネイルのBlob Storage パス
        size: videoBuffer.length,
        originalVideoUrl: videoUrl,
        originalThumbnailUrl: req.body.thumbnailUrl
      }
    };

    context.log('✅ [SUCCESS] 動画取り込み処理完了:', { blobUrl, size: videoBuffer.length });

  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画取り込み処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { 
        error: "動画取り込み処理中にエラーが発生しました", 
        details: error.message 
      } 
    };
  }
}

// 🎬 GET: 既存の動画ダウンロード機能
async function handleVideoDownload(context: any, req: any): Promise<void> {
  context.log('🎬 [DEBUG] downloadVideo関数開始');

  // GETリクエストの場合、パラメータをURLから取得
  const videoId = req.params.videoId;
  
  if (!videoId) {
    context.res = { 
      status: 400, 
      body: { error: "videoId は必須パラメータです" } 
    };
    return;
  }
  
  // 🔍 リクエストヘッダーをデバッグ出力
  context.log('🔍 [DEBUG] リクエストヘッダー:', JSON.stringify(req.headers, null, 2));
  context.log('🔍 [DEBUG] 認証ヘッダー:', req.headers.authorization);
  
  // 🔐 ユーザー認証の確認
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('🎬 動画ダウンロード処理 - 認証済みユーザー:', { userId: userInfo.userId.substring(0, 8) + '***' });
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

  // 認証から取得したuserIdを使用
  const userId = userInfo.userId;
  context.log('🎬 [DEBUG] 動画ダウンロード処理開始:', { videoId, userId: userId.substring(0, 8) + '***' });

  try {
    // 1. Cosmos DBから動画情報を取得
    context.log('🔍 [DEBUG] Cosmos DBから動画情報取得開始...');
    const cosmosClient = await getCosmosClient();
    const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
    const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
    const database = cosmosClient.database(databaseId);
    const container = database.container(containerId);

    const query = {
      query: "SELECT * FROM c WHERE c.id = @videoId AND c.userId = @userId",
      parameters: [
        { name: "@videoId", value: videoId },
        { name: "@userId", value: userId }
      ]
    };

    const { resources: videos } = await container.items.query(query).fetchAll();
    
    if (videos.length === 0) {
      context.res = { 
        status: 404, 
        body: { error: "指定された動画が見つかりません" } 
      };
      return;
    }

    const video = videos[0];
    context.log('✅ [DEBUG] 動画情報取得完了:', { videoId, videoUrl: video.videoUrl ? '✅' : '❌' });

    // 2. 動画URLが存在する場合は、そのまま使用
    if (video.videoUrl) {
      context.log('📦 [DEBUG] 既存のvideoUrlを使用してダウンロード:', video.videoUrl);
      
      // Blob Storage URLからファイルをダウンロード
      const blobServiceClient = await getBlobServiceClient();
      
      // URLからcontainer名とblob pathを抽出
      const url = new URL(video.videoUrl);
      const pathParts = url.pathname.split('/');
      
      if (pathParts.length < 3) {
        throw new Error("無効なBlob Storage URL形式です");
      }
      
      const containerName = pathParts[1];
      const blobPath = pathParts.slice(2).join('/');
      
      context.log('🔍 [DEBUG] Blob情報:', { containerName, blobPath });
      
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(blobPath);
      
      const downloadResponse = await blobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        throw new Error("ファイルの読み取りに失敗しました");
      }
      
      // ストリームをバッファに変換
      const chunks: any[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      
      // ファイル名を生成
      const filename = `video_${videoId}.mp4`;
      
      context.res = {
        status: 200,
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': buffer.length.toString()
        },
        body: buffer
      };
      
      context.log('✅ [DEBUG] 動画ダウンロード成功:', { filename, size: buffer.length });
      return;
    }

    // 3. videoUrlがない場合は、jobIdからSora APIを使って取得
    const jobId = video.jobId;
    if (!jobId) {
      context.res = { 
        status: 404, 
        body: { error: "動画のジョブIDが見つかりません" } 
      };
      return;
    }

    // 🔑 Key Vaultからシークレット取得
    context.log('🔍 [DEBUG] Key Vaultからシークレット取得開始...');
    const endpoint = (await secretClient.getSecret("sora-Endpoint")).value!;
    const apiKey = (await secretClient.getSecret("sora-Key")).value!;
    context.log('✅ [DEBUG] Key Vault取得完了');

    // Azure OpenAI Sora APIの正しいエンドポイント構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      // Azure OpenAI形式: https://your-resource.openai.azure.com/openai/deployments/deployment-name/
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      // Azure OpenAI形式（シンプル）: https://your-resource.openai.azure.com
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      // 他の形式
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }
    
    // まずJob詳細を取得してGeneration IDを取得
    const jobDetailUrl = `${baseUrl}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
    context.log('🔍 [DEBUG] Base URL:', baseUrl);
    context.log('🔍 [DEBUG] Job Detail URL:', jobDetailUrl);

    const jobResponse = await fetch(jobDetailUrl, {
      method: "GET",
      headers: { 
        "api-key": apiKey,
        "Content-Type": "application/json"
      }
    });

    if (!jobResponse.ok) {
      const jobError = await jobResponse.json();
      context.log.error('❌ [ERROR] Job詳細取得エラー:', jobError);
      context.res = { 
        status: jobResponse.status, 
        body: { error: "Job詳細の取得に失敗しました", details: jobError } 
      };
      return;
    }

    const jobData = await jobResponse.json();
    context.log('✅ [DEBUG] Job詳細取得成功:', jobData);

    // Job詳細からGeneration IDを取得
    const actualGenerationId = jobData.generations?.[0]?.id || jobData.id;
    if (!actualGenerationId) {
      context.log.error('❌ [ERROR] Generation IDが見つかりません:', jobData);
      context.res = { 
        status: 500, 
        body: { error: "Generation IDが見つかりません", details: jobData } 
      };
      return;
    }

    context.log('🎯 [DEBUG] Job ID:', jobId);
    context.log('🎯 [DEBUG] 実際のGeneration ID:', actualGenerationId);

    // 動画ファイルをダウンロード
    const videoDownloadUrl = `${baseUrl}/openai/v1/video/generations/${actualGenerationId}/content/video?api-version=preview`;
    context.log('🔍 [DEBUG] Video Download URL:', videoDownloadUrl);

    const videoResponse = await fetch(videoDownloadUrl, {
      headers: { "api-key": apiKey }
    });

    if (!videoResponse.ok) {
      const videoError = await videoResponse.json();
      context.res = { 
        status: videoResponse.status, 
        body: { error: "動画ファイルのダウンロードに失敗しました", details: videoError } 
      };
      return;
    }

    // 動画データをバッファとして取得
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const filename = `video_${videoId}.mp4`;
    
    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': videoBuffer.length.toString()
      },
      body: videoBuffer
    };
    
    context.log('✅ [DEBUG] 動画ダウンロード成功:', { filename, size: videoBuffer.length });

  } catch (error: any) {
    context.log.error('❌ [ERROR] downloadVideo処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { 
        error: "動画ダウンロード処理中にエラーが発生しました", 
        details: error.message 
      } 
    };
  }
}

// 🎬 メイン関数：GETとPOSTリクエストを処理
const httpTrigger = async function (context: any, req: any): Promise<void> {
  context.log('🎬 downloadVideo API呼び出し:', { method: req.method, url: req.url });

  // 📝 メソッドに応じて処理を分岐
  if (req.method === "GET") {
    // 既存の動画ダウンロード機能
    return handleVideoDownload(context, req);
  }
  
  if (req.method === "POST") {
    // 新しい動画取り込み機能
    return handleVideoImport(context, req);
  }

  context.res = {
    status: 405,
    body: { error: "許可されていないHTTPメソッドです。GETまたはPOSTを使用してください。" }
  };
};

export default httpTrigger;
