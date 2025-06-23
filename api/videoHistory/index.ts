import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { CosmosClient } from "@azure/cosmos";
import { getUserFromRequest } from "../shared/auth";

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

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

let cosmosClient: CosmosClient | null = null;

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

const httpTrigger = async function (context: any, req: any): Promise<void> {
  context.log('🎬 [DEBUG] videoHistory関数開始');
  context.log('🎬 [DEBUG] Method:', req.method);

  try {
    if (req.method === 'GET') {
      // 📋 動画履歴一覧取得
      await getVideoHistory(context, req);
    } else if (req.method === 'POST') {
      // 💾 動画履歴保存/更新
      await saveVideoHistory(context, req);
    } else if (req.method === 'DELETE') {
      // 🗑️ 動画履歴削除
      await deleteVideoHistory(context, req);
    } else {
      context.res = { 
        status: 405, 
        body: { error: "Method not allowed. GET, POST, DELETE のみサポートしています。" } 
      };
    }
  } catch (error: any) {
    context.log.error('❌ [ERROR] videoHistory処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画履歴処理中にエラーが発生しました", details: error.message } 
    };
  }
};

// 📋 動画履歴一覧取得
async function getVideoHistory(context: any, req: any): Promise<void> {
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

  const userId = userInfo.userId; // 認証されたユーザーIDを使用
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;

  context.log('🎬 [DEBUG] 動画履歴取得:', { 
    userId, 
    userIdLength: userId.length,
    userIdType: typeof userId,
    limit, 
    offset 
  });

  try {
    const client = await getCosmosClient();
    const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
    const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
    const database = client.database(databaseId);
    const container = database.container(containerId);

    // 🔍 デバッグ用：ユーザーの全データを確認
    const debugQuerySpec = {
      query: `SELECT c.id, c.jobId, c.jobStatus, c.timestamp, c.prompt, c.userId FROM c WHERE c.userId = @userId ORDER BY c.timestamp DESC`,
      parameters: [{ name: '@userId', value: userId }]
    };
    
    const { resources: debugData } = await container.items.query(debugQuerySpec).fetchAll();
    context.log('🔍 [DEBUG] ユーザーの全データ:', debugData);
    
    // 🔍 デバッグ用：全てのjobIdを持つデータをチェック
    const allJobsQuerySpec = {
      query: `SELECT c.id, c.jobId, c.userId, c.timestamp FROM c WHERE IS_DEFINED(c.jobId) ORDER BY c.timestamp DESC`
    };
    
    const { resources: allJobsData } = await container.items.query(allJobsQuerySpec).fetchAll();
    context.log('🔍 [DEBUG] 全jobIdデータ:', allJobsData);

    // まずは基本的なクエリでユーザーの全履歴を取得
    const querySpec = {
      query: `
        SELECT * FROM c 
        WHERE c.userId = @userId 
        ORDER BY c.timestamp DESC 
        OFFSET @offset LIMIT @limit
      `,
      parameters: [
        { name: '@userId', value: userId },
        { name: '@offset', value: offset },
        { name: '@limit', value: limit }
      ]
    };

    const { resources: allHistory } = await container.items.query(querySpec).fetchAll();
    
    context.log('🔍 [DEBUG] 取得した全履歴:', allHistory.map(item => ({
      id: item.id,
      jobId: item.jobId,
      jobStatus: item.jobStatus,
      timestamp: item.timestamp,
      hasJobId: !!item.jobId,
      jobIdLength: item.jobId?.length || 0
    })));
    
    // JavaScriptでフィルタリング（jobIdがあるもののみ）
    const videoHistory = allHistory.filter((item: any) => {
      const hasJobId = item.jobId && item.jobId.length > 0;
      context.log(`🔍 [FILTER] ${item.id}: jobId="${item.jobId}", hasJobId=${hasJobId}`);
      return hasJobId;
    });

    // 統計情報を手動計算
    const totalCount = videoHistory.length;
    const completedCount = videoHistory.filter((item: any) => item.jobStatus === 'completed').length;
    const activeCount = videoHistory.filter((item: any) => item.jobStatus === 'pending' || item.jobStatus === 'running').length;
    const failedCount = videoHistory.filter((item: any) => item.jobStatus === 'failed').length;

    const stats = {
      totalCount,
      completedCount,
      activeCount,
      failedCount
    };

    context.log('✅ [SUCCESS] 動画履歴取得完了:', { 
      allHistoryCount: allHistory.length,
      videoHistoryCount: videoHistory.length, 
      stats: stats 
    });

    // 🔍 詳細ログで全メタデータを出力
    context.log('🔍 [DETAILED] 動画履歴詳細情報:');
    videoHistory.forEach((item: any, index: number) => {
      context.log(`📄 [${index + 1}] ${item.id}:`, {
        jobId: item.jobId,
        jobStatus: item.jobStatus,
        prompt: item.prompt,
        timestamp: item.timestamp,
        videoUrl: item.videoUrl || 'なし',
        thumbnailUrl: item.thumbnailUrl || 'なし',
        metadata: item.metadata || {}
      });
    });

    context.res = {
      status: 200,
      body: {
        videoHistory: videoHistory.map((item: any) => {
          // 🖼️ サムネイルURLをプロキシ形式に変換
          let proxyThumbnailUrl = item.thumbnailUrl;
          if (item.thumbnailUrl && !item.thumbnailUrl.startsWith('/api/image-proxy')) {
            try {
              const url = new URL(item.thumbnailUrl);
              const blobPath = url.pathname.substring(1); // 最初の'/'を削除
              proxyThumbnailUrl = `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
              context.log(`🔄 [PROXY] サムネイルURLを変換: ${item.thumbnailUrl} → ${proxyThumbnailUrl}`);
            } catch (urlError) {
              context.log(`⚠️ [WARNING] サムネイルURL変換失敗: ${item.thumbnailUrl}`);
              // 変換失敗時は元のURLを使用
            }
          }

          // 🎬 動画URLもプロキシ形式に変換
          let proxyVideoUrl = item.videoUrl;
          if (item.videoUrl && !item.videoUrl.startsWith('/api/image-proxy')) {
            try {
              const url = new URL(item.videoUrl);
              const blobPath = url.pathname.substring(1); // 最初の'/'を削除
              proxyVideoUrl = `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
              context.log(`🔄 [PROXY] 動画URLを変換: ${item.videoUrl} → ${proxyVideoUrl}`);
            } catch (urlError) {
              context.log(`⚠️ [WARNING] 動画URL変換失敗: ${item.videoUrl}`);
              // 変換失敗時は元のURLを使用
            }
          }

          return {
            ...item,
            thumbnailUrl: proxyThumbnailUrl, // プロキシURLに変換
            videoUrl: proxyVideoUrl, // プロキシURLに変換
            // メタデータを明示的に展開して表示
            fullMetadata: item.metadata,
            debugInfo: {
              hasJobId: !!item.jobId,
              hasGenerationId: !!(item.metadata?.generationId),
              hasVideoUrl: !!item.videoUrl,
              hasThumbnailUrl: !!item.thumbnailUrl,
              thumbnailProxyUrl: proxyThumbnailUrl,
              videoProxyUrl: proxyVideoUrl,
              allKeys: Object.keys(item),
              videoSettings: item.videoSettings // 🐛 videoSettingsも詳細ログに追加
            }
          };
        }).map((item: any, index: number) => {
          // 🐛 返す前にvideoSettingsをログ出力
          context.log(`🐛 [DEBUG] VideoSettings [${index}] ${item.id}:`, {
            videoSettings: item.videoSettings,
            width: item.videoSettings?.width,
            height: item.videoSettings?.height,
            n_seconds: item.videoSettings?.n_seconds,
            rawVideoSettings: JSON.stringify(item.videoSettings)
          });
          return item;
        }),
        stats: stats || { totalCount: 0, completedCount: 0, activeCount: 0, failedCount: 0 },
        pagination: { limit, offset, hasMore: videoHistory.length === limit },
        debugSummary: {
          totalItems: videoHistory.length,
          itemsWithGenerationId: videoHistory.filter((item: any) => item.metadata?.generationId).length,
          itemsWithVideoUrl: videoHistory.filter((item: any) => item.videoUrl).length,
          metadataKeys: [...new Set(videoHistory.flatMap((item: any) => Object.keys(item.metadata || {})))]
        }
      }
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画履歴取得エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画履歴の取得に失敗しました", details: error.message } 
    };
  }
}

// 💾 動画履歴保存/更新
async function saveVideoHistory(context: any, req: any): Promise<void> {
  if (!req.headers["content-type"]?.includes("application/json")) {
    context.res = { status: 400, body: { error: "Content-Type: application/json が必要です" } };
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

  // 🔐 常に認証ヘッダーからユーザー情報を取得（セキュリティ強化）
  let userId;
  try {
    const userInfo = await getUserFromRequest(req);
    userId = userInfo.userId;
    context.log('✅ [DEBUG] 認証からユーザーID取得:', { userId: userInfo.userId.substring(0, 8) + '***' });
  } catch (authError: any) {
    context.log.error('❌ [ERROR] 認証エラー:', authError.message);
    context.res = { status: 401, body: { error: "認証が必要です", details: authError.message } };
    return;
  }

  const {
    prompt,
    originalPrompt,
    videoSettings,
    jobId,
    jobStatus,
    videoUrl,
    videoBlobPath,
    thumbnailUrl,
    thumbnailBlobPath,
    metadata = {}
  } = body;

  if (!userId || !prompt || !jobId) {
    context.res = { 
      status: 400, 
      body: { error: "userId, prompt, jobId は必須項目です" } 
    };
    return;
  }

  context.log('🎬 [DEBUG] 動画履歴保存:', { userId, jobId, jobStatus });

  try {
    const client = await getCosmosClient();
    const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
    const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
    const database = client.database(databaseId);
    const container = database.container(containerId);

    // 既存の履歴があるかチェック（jobIdベース）
    const existingQuery = {
      query: "SELECT * FROM c WHERE c.jobId = @jobId",
      parameters: [{ name: '@jobId', value: jobId }]
    };

    const { resources: existing } = await container.items.query(existingQuery).fetchAll();

    const videoHistoryItem: VideoHistoryItem = {
      id: existing.length > 0 ? existing[0].id : `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      prompt,
      originalPrompt: originalPrompt || prompt,
      videoSettings: {
        // 🎯 より適切なデフォルト値に修正
        height: videoSettings?.height || 720,
        width: videoSettings?.width || 1280, 
        n_seconds: videoSettings?.n_seconds || 5,
        n_variants: videoSettings?.n_variants || 1,
        model: videoSettings?.model || 'sora',
        ...videoSettings
      },
      jobId,
      jobStatus: jobStatus || 'pending',
      videoUrl,
      videoBlobPath,
      thumbnailUrl,
      thumbnailBlobPath,
      operationType: 'generate',
      timestamp: existing.length > 0 ? existing[0].timestamp : new Date().toISOString(),
      completedAt: jobStatus === 'completed' ? new Date().toISOString() : existing[0]?.completedAt,
      metadata: {
        userAgent: req.headers['user-agent'],
        ...metadata
      }
    };

    // Upsert操作（存在する場合は更新、しない場合は新規作成）
    const result = await container.items.upsert(videoHistoryItem);

    context.log('✅ [SUCCESS] 動画履歴保存完了:', { 
      id: videoHistoryItem.id, 
      jobId, 
      jobStatus: videoHistoryItem.jobStatus 
    });

    context.res = { 
      status: 200, 
      body: { 
        message: "動画履歴が正常に保存されました", 
        item: videoHistoryItem,
        isUpdate: existing.length > 0
      } 
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画履歴保存エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画履歴の保存に失敗しました", details: error.message } 
    };
  }
}

// 🗑️ 動画履歴削除
async function deleteVideoHistory(context: any, req: any): Promise<void> {
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

  const userId = userInfo.userId; // 認証されたユーザーIDを使用
  const videoId = req.query.id || req.body?.id;

  if (!videoId) {
    context.res = { 
      status: 400, 
      body: { error: "動画ID (id) が必要です" } 
    };
    return;
  }

  context.log('🗑️ [DEBUG] 動画履歴削除:', { userId, videoId });

  try {
    const client = await getCosmosClient();
    const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
    const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
    const database = client.database(databaseId);
    const container = database.container(containerId);

    // まず削除対象の動画履歴を取得（所有者確認のため）
    const querySpec = {
      query: "SELECT * FROM c WHERE c.id = @videoId AND c.userId = @userId",
      parameters: [
        { name: '@videoId', value: videoId },
        { name: '@userId', value: userId }
      ]
    };

    const { resources: existingItems } = await container.items.query(querySpec).fetchAll();

    if (existingItems.length === 0) {
      context.res = { 
        status: 404, 
        body: { error: "指定された動画履歴が見つかりません" } 
      };
      return;
    }

    const item = existingItems[0];
    context.log('🔍 [DEBUG] 削除対象動画履歴:', { 
      id: item.id, 
      jobId: item.jobId, 
      prompt: item.prompt?.substring(0, 50) + '...'
    });

    // Cosmos DBから削除
    await container.item(videoId, userId).delete();

    context.log('✅ [SUCCESS] 動画履歴削除完了:', { videoId, userId });

    context.res = {
      status: 200,
      body: { 
        message: "動画履歴を削除しました", 
        deletedId: videoId,
        deletedItem: {
          id: item.id,
          jobId: item.jobId,
          prompt: item.prompt
        }
      } 
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画履歴削除エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画履歴の削除に失敗しました", details: error.message } 
    };
  }
}

export default httpTrigger;
