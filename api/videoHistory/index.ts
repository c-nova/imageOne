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
      jobIdLength: item.jobId?.length || 0,
      videoBlobPath: item.videoBlobPath || 'なし',
      thumbnailBlobPath: item.thumbnailBlobPath || 'なし',
      videoUrl: item.videoUrl ? 'あり' : 'なし',
      thumbnailUrl: item.thumbnailUrl ? 'あり' : 'なし'
    })));
    
    // 🔍 特別デバッグ：jobIdを持つものだけ詳しく確認
    const itemsWithJobId = allHistory.filter(item => item.jobId);
    context.log('🎯 [DEBUG] jobIdがあるアイテム詳細:', itemsWithJobId.map(item => ({
      id: item.id,
      jobId: item.jobId,
      jobStatus: item.jobStatus,
      videoBlobPath: item.videoBlobPath,
      thumbnailBlobPath: item.thumbnailBlobPath,
      videoUrl: item.videoUrl?.substring(0, 100) + '...',
      thumbnailUrl: item.thumbnailUrl?.substring(0, 100) + '...',
      metadata: item.metadata
    })));
    
    // 🎬 履歴フィルタリング：完了した動画ジョブのみ表示
    const videoHistory = allHistory.filter((item: any) => {
      const hasJobId = item.jobId && item.jobId.length > 0;
      const isCompleted = item.jobStatus === 'completed' || item.jobStatus === 'succeeded'; // succeededも追加
      
      // 🔄 Blob Storageへの移行は任意（古い履歴は未移行でもOK）
      const hasBlobStorage = !!(item.videoBlobPath || item.thumbnailBlobPath);
      const hasLegacyUrls = !!(item.videoUrl || item.thumbnailUrl); // 従来のURL形式もOK
      
      // 動画ジョブで完了していれば表示（Blob移行の有無は問わない）
      const shouldInclude = hasJobId && isCompleted;
      
      context.log(`🔍 [FILTER] ${item.id}:`, {
        jobId: item.jobId || 'なし',
        jobStatus: item.jobStatus || 'なし',
        hasJobId,
        isCompleted,
        hasBlobStorage: hasBlobStorage,
        hasLegacyUrls: hasLegacyUrls,
        videoBlobPath: item.videoBlobPath || 'なし',
        thumbnailBlobPath: item.thumbnailBlobPath || 'なし',
        videoUrl: item.videoUrl ? 'あり' : 'なし',
        thumbnailUrl: item.thumbnailUrl ? 'あり' : 'なし',
        shouldInclude: shouldInclude
      });
      
      return shouldInclude;
    });
    
    // 🚨 一時的デバッグ：フィルタリングした結果が空の場合は、jobIdがあるものを全部返す
    const finalVideoHistory = videoHistory.length > 0 ? videoHistory : allHistory.filter(item => !!item.jobId);
    
    context.log('🚨 [DEBUG] フィルタリング結果:', {
      originalCount: allHistory.length,
      filteredCount: videoHistory.length,
      finalCount: finalVideoHistory.length,
      usingFallback: videoHistory.length === 0
    });

    // 📊 統計情報を履歴データベースで計算（全データから算出）
    const completedWithBlobCount = allHistory.filter((item: any) => 
      (item.jobStatus === 'completed' || item.jobStatus === 'succeeded') && (item.videoBlobPath || item.thumbnailBlobPath)
    ).length;
    const activeCount = allHistory.filter((item: any) => 
      item.jobStatus === 'pending' || item.jobStatus === 'running'
    ).length;
    const failedCount = allHistory.filter((item: any) => 
      item.jobStatus === 'failed'
    ).length;
    const cancelledCount = allHistory.filter((item: any) => 
      item.jobStatus === 'cancelled'
    ).length;

    const stats = {
      totalHistoryCount: finalVideoHistory.length, // 実際の履歴件数（修正済み）
      totalJobCount: allHistory.filter((item: any) => item.jobId).length, // 全ジョブ件数
      completedWithBlobCount, // 完了＆Blob保存済み
      activeCount, // 進行中
      failedCount, // 失敗
      cancelledCount // キャンセル
    };

    context.log('✅ [SUCCESS] 動画履歴取得完了:', { 
      allHistoryCount: allHistory.length,
      videoHistoryCount: finalVideoHistory.length, // 修正済み
      filteredOutCount: allHistory.length - finalVideoHistory.length, // 修正済み
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
        videoHistory: finalVideoHistory.map((item: any) => {
          // 🖼️ サムネイルURL生成（Blob Storage優先、従来URLもプロキシ経由でOK）
          let proxyThumbnailUrl = null;
          
          // thumbnailBlobPathがある場合はそれを使用（優先）
          if (item.thumbnailBlobPath) {
            proxyThumbnailUrl = `/api/image-proxy?path=${encodeURIComponent(item.thumbnailBlobPath)}`;
            context.log(`🔄 [PROXY] BlobPathからサムネイルURL生成: ${item.thumbnailBlobPath} → ${proxyThumbnailUrl}`);
          }
          // thumbnailBlobPathがなく、thumbnailUrlがBlob Storage URLの場合
          else if (item.thumbnailUrl && (item.thumbnailUrl.includes('.blob.core.windows.net') || item.thumbnailUrl.startsWith('/api/image-proxy'))) {
            if (item.thumbnailUrl.startsWith('/api/image-proxy')) {
              proxyThumbnailUrl = item.thumbnailUrl; // 既にプロキシ形式
            } else {
              try {
                const url = new URL(item.thumbnailUrl);
                const blobPath = url.pathname.substring(1); // 最初の'/'を削除
                proxyThumbnailUrl = `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
                context.log(`🔄 [PROXY] Blob StorageサムネイルURLを変換: ${item.thumbnailUrl} → ${proxyThumbnailUrl}`);
              } catch (urlError) {
                context.log(`⚠️ [WARNING] Blob StorageサムネイルURL変換失敗: ${item.thumbnailUrl}`);
              }
            }
          }
          // 🆕 従来のOpenAI APIサムネイルもプロキシ経由で表示（古い履歴のため）
          else if (item.thumbnailUrl) {
            proxyThumbnailUrl = `/api/image-proxy?url=${encodeURIComponent(item.thumbnailUrl)}`;
            context.log(`� [PROXY] 従来サムネイルURLをプロキシ経由で表示: ${item.thumbnailUrl} → ${proxyThumbnailUrl}`);
          }

          // 🎬 動画URL生成（Blob Storage優先、従来URLもプロキシ経由でOK）
          let proxyVideoUrl = null;
          
          // videoBlobPathがある場合はそれを使用（優先）
          if (item.videoBlobPath) {
            proxyVideoUrl = `/api/image-proxy?path=${encodeURIComponent(item.videoBlobPath)}`;
            context.log(`🔄 [PROXY] BlobPathから動画URL生成: ${item.videoBlobPath} → ${proxyVideoUrl}`);
          }
          // videoBlobPathがなく、videoUrlがBlob Storage URLの場合
          else if (item.videoUrl && (item.videoUrl.includes('.blob.core.windows.net') || item.videoUrl.startsWith('/api/image-proxy'))) {
            if (item.videoUrl.startsWith('/api/image-proxy')) {
              proxyVideoUrl = item.videoUrl; // 既にプロキシ形式
            } else {
              try {
                const url = new URL(item.videoUrl);
                const blobPath = url.pathname.substring(1); // 最初の'/'を削除
                proxyVideoUrl = `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
                context.log(`🔄 [PROXY] Blob Storage動画URLを変換: ${item.videoUrl} → ${proxyVideoUrl}`);
              } catch (urlError) {
                context.log(`⚠️ [WARNING] Blob Storage動画URL変換失敗: ${item.videoUrl}`);
              }
            }
          }
          // 🆕 従来のOpenAI API動画URLもプロキシ経由で表示（古い履歴のため）
          else if (item.videoUrl) {
            proxyVideoUrl = `/api/image-proxy?url=${encodeURIComponent(item.videoUrl)}`;
            context.log(`� [PROXY] 従来動画URLをプロキシ経由で表示: ${item.videoUrl} → ${proxyVideoUrl}`);
          }

          return {
            ...item,
            thumbnailUrl: proxyThumbnailUrl, // Blob StorageベースのプロキシURLまたはnull
            videoUrl: proxyVideoUrl, // Blob StorageベースのプロキシURLまたはnull
            // メタデータを明示的に展開して表示
            fullMetadata: item.metadata,
            debugInfo: {
              hasJobId: !!item.jobId,
              hasGenerationId: !!(item.metadata?.generationId),
              hasVideoUrl: !!proxyVideoUrl, // Blob Storageベースのみ
              hasThumbnailUrl: !!proxyThumbnailUrl, // Blob Storageベースのみ
              hasBlobPaths: {
                video: !!item.videoBlobPath,
                thumbnail: !!item.thumbnailBlobPath
              },
              originalUrls: {
                video: item.videoUrl,
                thumbnail: item.thumbnailUrl
              },
              proxyUrls: {
                video: proxyVideoUrl,
                thumbnail: proxyThumbnailUrl
              },
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
        stats: stats || { 
          totalHistoryCount: 0, 
          totalJobCount: 0, 
          completedWithBlobCount: 0, 
          activeCount: 0, 
          failedCount: 0, 
          cancelledCount: 0 
        },
        pagination: { limit, offset, hasMore: videoHistory.length === limit },
        debugSummary: {
          totalItems: finalVideoHistory.length,
          itemsWithGenerationId: finalVideoHistory.filter((item: any) => item.metadata?.generationId).length,
          itemsWithVideoUrl: finalVideoHistory.filter((item: any) => item.videoUrl).length,
          itemsWithBlobPaths: {
            video: finalVideoHistory.filter((item: any) => item.videoBlobPath).length,
            thumbnail: finalVideoHistory.filter((item: any) => item.thumbnailBlobPath).length,
            both: finalVideoHistory.filter((item: any) => item.videoBlobPath && item.thumbnailBlobPath).length
          },
          filteringResults: {
            originalCount: allHistory.length,
            filteredCount: finalVideoHistory.length,
            excludedCount: allHistory.length - finalVideoHistory.length,
            usingFallback: videoHistory.length === 0
          },
          metadataKeys: [...new Set(finalVideoHistory.flatMap((item: any) => Object.keys(item.metadata || {})))]
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
