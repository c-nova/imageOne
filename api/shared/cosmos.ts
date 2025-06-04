// shared/cosmos.ts - Cosmos DBでのプロンプト履歴管理
// 型エラー対策: importをany型に変更
// import { CosmosClient, Database, Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

let cosmosClient: any | null = null;
let database: any | null = null;
let container: any | null = null;

// Cosmos DBクライアントを取得（シングルトンパターン）
async function getCosmosClient(): Promise<any> {
  if (cosmosClient) return cosmosClient;
  
  try {
    const endpointSecret = await secretClient.getSecret("CosmosDB-Endpoint");
    const endpoint = endpointSecret.value!;
    
    // Managed Identityを使用してCosmos DBに接続
    const { CosmosClient } = require('@azure/cosmos');
    cosmosClient = new CosmosClient({
      endpoint,
      aadCredentials: credential
    });
    
    return cosmosClient;
  } catch (error: any) {
    console.log('Cosmos DBクライアント初期化エラー:', error.message);
    // Cosmos DBがデプロイされていない場合はnullを返す
    return null;
  }
}

// データベースとコンテナを取得
async function getContainer(): Promise<any> {
  if (container) return container;
  
  try {
    const client = await getCosmosClient();
    if (!client) {
      console.log('Cosmos DBが利用できません。履歴機能は無効化されています。');
      return null;
    }
    
    const databaseId = "ImageGenerationDB";
    const containerId = "PromptHistory";
    
    console.log('Cosmos DB データベースとコンテナを初期化中...');
    
    // データベースの作成（存在しない場合）
    const { database: db } = await client.databases.createIfNotExists({
      id: databaseId
    });
    database = db;
    console.log(`データベース "${databaseId}" 準備完了`);
    
    // コンテナの作成（存在しない場合）
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
    console.log(`コンテナ "${containerId}" 準備完了`);
    
    return container;
  } catch (error: any) {
    console.log('Cosmos DB初期化エラー:', error.message);
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
  };
}

// プロンプト履歴を保存
export async function savePromptHistory(item: PromptHistoryItem): Promise<void> {
  try {
    const container = await getContainer();
    if (!container) {
      console.log('Cosmos DBが利用できないため、履歴保存をスキップします。');
      return; // 静かに無視
    }
    
    // TTL設定（1年後に自動削除）
    const itemWithTTL = {
      ...item,
      ttl: 365 * 24 * 60 * 60 // 1年 = 秒数
    };
    
    await container.items.create(itemWithTTL);
    console.log('プロンプト履歴を保存しました。');
  } catch (error: any) {
    console.log('プロンプト履歴の保存に失敗しましたが、メイン処理は継続します:', error.message);
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
        ORDER BY COUNT(1) DESC
      `,
      parameters: [{ name: "@userId", value: userId }]
    };
    const { resources: styleResult } = await container.items.query(styleQuery).fetchAll();
    
    return {
      totalCount,
      generateCount,
      editCount,
      favoriteStyles: styleResult.slice(0, 5) // 上位5つのスタイル
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
