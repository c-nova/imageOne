// shared/cosmos.ts - Cosmos DBでのプロンプト履歴管理
// 型エラー対策: importをany型に変更
// import { CosmosClient, Database, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

let cosmosClient: any | null = null;
let database: any | null = null;
let container: any | null = null;

// Cosmos DBクライアントを取得（シングルトンパターン）
async function getCosmosClient(): Promise<any> {
  if (cosmosClient) {
    console.log('✅ キャッシュされたCosmos DBクライアントを返します');
    return cosmosClient;
  }
  
  try {
    const endpoint = process.env.COSMOS_DB_ENDPOINT;
    const key = process.env.COSMOS_DB_KEY;
    
    console.log('🔍 環境変数確認:', { 
      hasEndpoint: !!endpoint, 
      hasKey: !!key,
      endpoint: endpoint 
    });
    
    if (!endpoint) {
      throw new Error("COSMOS_DB_ENDPOINT environment variable is required");
    }
    
    // 🔐 Entra認証を最初に試行（ローカル/Azure問わず）
    console.log('🔐 Entra認証でCosmos DBに接続を試行...');
    try {
      const credential = new DefaultAzureCredential();
      const { CosmosClient } = require('@azure/cosmos');
      
      cosmosClient = new CosmosClient({
        endpoint,
        aadCredentials: credential
      });
      
      // 接続テスト（軽量なオペレーション）
      console.log('🔍 Cosmos DB接続テスト中...');
      await cosmosClient.getDatabaseAccount();
      console.log('✅ Entra認証でCosmos DB接続成功');
      return cosmosClient;
      
    } catch (aadError: any) {
      console.log('❌ Entra認証失敗:', aadError.message);
      cosmosClient = null; // リセット
      
      // 🔑 フォールバック: キーベース認証
      if (key) {
        console.log('🔑 キーベース認証にフォールバック...');
        const { CosmosClient } = require('@azure/cosmos');
        cosmosClient = new CosmosClient({
          endpoint,
          key
        });
        console.log('🔍 キーベース認証での接続テスト中...');
        await cosmosClient.getDatabaseAccount();
        console.log('✅ キーベース認証でCosmos DB接続成功');
      } else {
        throw new Error('Entra認証もキー認証も利用できません。Azure CLIでログインするか、COSMOS_DB_KEYを設定してください。');
      }
    }
    
    return cosmosClient;
  } catch (error: any) {
    console.log('❌ Cosmos DBクライアント初期化エラー:', error.message);
    console.log('❌ エラー詳細:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    // Cosmos DBがデプロイされていない場合はnullを返す
    return null;
  }
}

// データベースとコンテナを取得
async function getContainer(): Promise<any> {
  if (container) {
    console.log('✅ キャッシュされたコンテナを返します');
    return container;
  }
  
  try {
    console.log('🔍 Cosmos DBクライアントを取得中...');
    const client = await getCosmosClient();
    if (!client) {
      console.log('❌ Cosmos DBが利用できません。履歴機能は無効化されています。');
      return null;
    }
    console.log('✅ Cosmos DBクライアント取得成功');
    
    const databaseId = process.env.COSMOS_DB_DATABASE || "ImageGenerationDB";
    const containerId = process.env.COSMOS_DB_CONTAINER || "PromptHistory";
    
    console.log('🔍 Cosmos DB データベースとコンテナを初期化中...', { databaseId, containerId });
    
    // データベースの作成（存在しない場合）
    console.log('🔍 データベースの作成または取得中...');
    const { database: db } = await client.databases.createIfNotExists({
      id: databaseId
    });
    database = db;
    console.log(`✅ データベース "${databaseId}" 準備完了`);
    
    // コンテナの作成（存在しない場合）
    console.log('🔍 コンテナの作成または取得中...');
    const { container: cont } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { paths: ["/userId"] }, // ユーザーIDでパーティション分割
      indexingPolicy: {
        includedPaths: [
          { path: "/*" }
        ],
        excludedPaths: [
          { path: "/imageBase64/*" }, // 大きなデータはインデックス対象外
          { path: "/metadata/*" }
        ]
      },
      // TTL設定（1年 = 31536000秒）
      defaultTtl: 31536000
    });
    container = cont;
    console.log(`✅ コンテナ "${containerId}" 準備完了`);
    
    return container;
  } catch (error: any) {
    console.log('❌ Cosmos DB初期化エラー:', error.message);
    console.log('❌ エラー詳細:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    console.log('履歴機能は利用できませんが、メイン機能は継続します。');
    return null;
  }
}

// プロンプト履歴のインターフェース
export interface PromptHistoryItem {
  id: string;
  userId: string;
  prompt: string;
  originalPrompt: string;
  cameraSettings?: {
    focalLength: number;
    aperture: number;
    colorTemp: number;
    imageStyle: string;
  };
  imageUrl: string;
  imageBlobPath: string;
  operationType: 'generate' | 'edit';
  size: string;
  timestamp: string;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    processingTime?: number;
    hasMask?: boolean;
    actualWidth?: number;
    actualHeight?: number;
    originalDetectedSize?: string;
  };
}

// プロンプト履歴を保存
export async function savePromptHistory(item: PromptHistoryItem): Promise<void> {
  try {
    console.log('🔍 savePromptHistory 開始:', { itemId: item.id, operationType: item.operationType });
    
    const container = await getContainer();
    if (!container) {
      console.log('❌ Cosmos DBが利用できないため、履歴保存をスキップします。');
      return; // 静かに無視
    }
    
    console.log('✅ Cosmos DB コンテナ取得成功');
    
    // TTL設定（1年後に自動削除）
    const itemWithTTL = {
      ...item,
      ttl: 365 * 24 * 60 * 60 // 1年 = 秒数
    };
    
    console.log('🔍 Cosmos DB へのアイテム保存を開始...');
    console.log('🔍 保存するアイテム:', JSON.stringify(itemWithTTL, null, 2));
    
    await container.items.create(itemWithTTL);
    console.log('✅ プロンプト履歴を保存しました:', item.id);
  } catch (error: any) {
    console.log('❌ プロンプト履歴の保存に失敗しました:', error.message);
    console.log('❌ エラー詳細:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    // エラーをthrowしない（メイン機能を妨げないため）
  }
}

// ユーザーのプロンプト履歴を取得
export async function getUserPromptHistory(
  userId: string, 
  limit: number = 50,
  offset: number = 0
): Promise<PromptHistoryItem[]> {
  try {
    const container = await getContainer();
    if (!container) {
      console.log('Cosmos DBが利用できないため、空の履歴を返します。');
      return []; // 空の配列を返す
    }
    
    const querySpec = {
      query: `
        SELECT * FROM c 
        WHERE c.userId = @userId 
        ORDER BY c.timestamp DESC
        OFFSET @offset LIMIT @limit
      `,
      parameters: [
        { name: "@userId", value: userId },
        { name: "@offset", value: offset },
        { name: "@limit", value: limit }
      ]
    };
    
    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources;
  } catch (error: any) {
    console.log('プロンプト履歴の取得に失敗しましたが、空の配列を返します:', error.message);
    return []; // エラー時も空の配列を返す
  }
}

// 特定のプロンプト履歴を取得
export async function getPromptHistoryById(id: string, userId: string): Promise<PromptHistoryItem | null> {
  try {
    const container = await getContainer();
    if (!container) {
      console.log('Cosmos DBが利用できないため、nullを返します。');
      return null;
    }
    
    const { resource } = await container.item(id, userId).read();
    return resource || null;
  } catch (error: any) {
    if (error.code === 404) {
      return null;
    }
    console.log('プロンプト履歴の取得に失敗しましたが、nullを返します:', error.message);
    return null; // エラー時もnullを返す
  }
}

// ユーザーの履歴統計を取得
export async function getUserHistoryStats(userId: string): Promise<{
  totalCount: number;
  generateCount: number;
  editCount: number;
  favoriteStyles: Array<{ style: string; count: number }>;
}> {
  try {
    const container = await getContainer();
    if (!container) {
      console.log('Cosmos DBが利用できないため、空の統計を返します。');
      return {
        totalCount: 0,
        generateCount: 0,
        editCount: 0,
        favoriteStyles: []
      };
    }
    
    // 総数取得
    const countQuery = {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: userId }]
    };
    const { resources: countResult } = await container.items.query(countQuery).fetchAll();
    const totalCount = countResult[0] || 0;
    
    // 操作タイプ別統計
    const typeQuery = {
      query: `
        SELECT c.operationType, COUNT(1) as count 
        FROM c 
        WHERE c.userId = @userId 
        GROUP BY c.operationType
      `,
      parameters: [{ name: "@userId", value: userId }]
    };
    const { resources: typeResult } = await container.items.query(typeQuery).fetchAll();
    
    let generateCount = 0;
    let editCount = 0;
    typeResult.forEach((item: any) => {
      if (item.operationType === 'generate') generateCount = item.count;
      if (item.operationType === 'edit') editCount = item.count;
    });
    
    // スタイル別統計
    const styleQuery = {
      query: `
        SELECT c.cameraSettings.imageStyle as style, COUNT(1) as count 
        FROM c 
        WHERE c.userId = @userId AND IS_DEFINED(c.cameraSettings.imageStyle)
        GROUP BY c.cameraSettings.imageStyle
      `,
      parameters: [{ name: "@userId", value: userId }]
    };
    const { resources: styleResult } = await container.items.query(styleQuery).fetchAll();
    
    // 結果をJavaScript側でソート（上位5つ）
    const sortedStyles = styleResult
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);
    
    return {
      totalCount,
      generateCount,
      editCount,
      favoriteStyles: sortedStyles // ソート済みの上位5つのスタイル
    };
  } catch (error: any) {
    console.log('履歴統計の取得に失敗しましたが、空の統計を返します:', error.message);
    return {
      totalCount: 0,
      generateCount: 0,
      editCount: 0,
      favoriteStyles: []
    };
  }
}

// プロンプト履歴を削除
export async function deletePromptHistory(id: string, userId: string): Promise<boolean> {
  try {
    const container = await getContainer();
    if (!container) {
      console.log('Cosmos DBが利用できないため、削除をスキップします。');
      return false;
    }
    
    await container.item(id, userId).delete();
    return true;
  } catch (error: any) {
    if (error.code === 404) {
      return false; // 既に削除済み
    }
    console.log('プロンプト履歴の削除に失敗しましたが、falseを返します:', error.message);
    return false; // エラー時もfalseを返す
  }
}

// 指定blobパスで履歴を削除（user-images/は除去して検索）
export async function deletePromptHistoryByBlobPath(blobPath: string): Promise<number> {
  try {
    const container = await getContainer();
    if (!container) return 0;
    // blobPathは "userId/年月日/ファイル名" 形式
    const query = {
      query: "SELECT c.id, c.userId FROM c WHERE c.imageBlobPath = @blobPath OR c.imageBlobPath = @blobPathWithPrefix",
      parameters: [
        { name: "@blobPath", value: blobPath },
        { name: "@blobPathWithPrefix", value: `user-images/${blobPath}` }
      ]
    };
    const { resources } = await container.items.query(query).fetchAll();
    let deleted = 0;
    for (const item of resources) {
      await container.item(item.id, item.userId).delete();
      deleted++;
    }
    return deleted;
  } catch (err) {
    console.log('deletePromptHistoryByBlobPath error:', err);
    return 0;
  }
}
