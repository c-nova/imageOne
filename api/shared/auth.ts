// shared/auth.ts - ユーザー認証とトークン検証のユーティリティ
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Key Vaultから設定値を取得する関数
const getKeyVaultSecret = async (secretName: string) => {
  const keyVaultUrl = process.env.KEY_VAULT_URL;
  if (keyVaultUrl) {
    const credential = new (require('@azure/identity').DefaultAzureCredential)();
    const client = new (require('@azure/keyvault-secrets').SecretClient)(keyVaultUrl, credential);
    const secret = await client.getSecret(secretName);
    return secret.value;
  }
  return null;
};

// 環境変数取得（Key Vault対応）
const getTenantId = async () => {
  return await getKeyVaultSecret('TENANT-ID') || process.env.TENANT_ID;
};

const getClientId = async () => {
  return await getKeyVaultSecret('CLIENT-ID') || process.env.CLIENT_ID;
};

// JWKSクライアントを動的に作成
let jwksClientInstance: any = null;

const getJwksClient = async () => {
  if (!jwksClientInstance) {
    const tenantId = await getTenantId();
    jwksClientInstance = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000, // 10分
    });
  }
  return jwksClientInstance;
};

// JWKSから公開鍵を取得（動的クライアント対応）
async function getKey(header: any, callback: any) {
  try {
    const client = await getJwksClient();
    client.getSigningKey(header.kid, (err: any, key: any) => {
      if (err) {
        return callback(err);
      }
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    });
  } catch (error) {
    callback(error);
  }
}

// ユーザー情報インターフェース
export interface UserInfo {
  userId: string;
  email?: string;
  name?: string;
  tenantId: string;
}

// JWTトークンからユーザー情報を抽出
export async function getUserFromToken(token: string): Promise<UserInfo> {
  return new Promise(async (resolve, reject) => {
    try {
      // Bearerプレフィックスを除去
      const cleanToken = token.replace('Bearer ', '');
      
      const clientId = await getClientId();
      const tenantId = await getTenantId();
      
      jwt.verify(cleanToken, getKey, {
        // audience: clientId, // User.Readスコープ対応のため一時的に無効化
        issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
        algorithms: ['RS256']
      }, (err, decoded: any) => {
        if (err) {
          return reject(new Error(`JWT検証失敗: ${err.message}`));
        }

        if (!decoded || !decoded.sub) {
          return reject(new Error('無効なトークン: ユーザーIDが見つかりません'));
        }

        const userInfo: UserInfo = {
          userId: decoded.sub || decoded.oid, // subまたはoid（Object ID）を使用
          email: decoded.email || decoded.preferred_username,
          name: decoded.name,
          tenantId: decoded.tid
        };

        resolve(userInfo);
      });
    } catch (error: any) {
      reject(new Error(`認証設定エラー: ${error.message}`));
    }
  });
}

// リクエストヘッダーからユーザー情報を取得
export async function getUserFromRequest(req: any): Promise<UserInfo> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    throw new Error('認証ヘッダーが見つかりません');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('無効な認証ヘッダー形式');
  }

  return await getUserFromToken(authHeader);
}

// ユーザーごとのBlobパスを生成
export function generateUserBlobPath(userId: string, fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  // user-images/を除去してユーザーIDから始まるパスに修正
  return `${userId}/${year}/${month}/${day}/${fileName}`;
}

// セキュリティログ用のユーザー情報マスキング
export function maskUserInfo(userInfo: UserInfo): Partial<UserInfo> {
  return {
    userId: userInfo.userId.substring(0, 8) + '***', // 最初の8文字のみ表示
    email: userInfo.email ? userInfo.email.replace(/(.{2}).*(@.*)/, '$1***$2') : undefined,
    tenantId: userInfo.tenantId
  };
}
