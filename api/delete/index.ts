// 型エラー対策: importをany型に変更
// import { AzureFunction, Context, HttpRequest } from '@azure/functions';

const getStorageAccountName = async () => {
  const keyVaultUrl = process.env.KEY_VAULT_URL;
  const secretName = 'StorageAccountName'; // Key Vaultのシークレット名を統一
  if (keyVaultUrl) {
    const credential = new (require('@azure/identity').DefaultAzureCredential)();
    const client = new (require('@azure/keyvault-secrets').SecretClient)(keyVaultUrl, credential);
    const secret = await client.getSecret(secretName);
    return secret.value;
  }
  return process.env.STORAGE_ACCOUNT_NAME;
};

const httpTrigger = async function (context: any, req: any): Promise<void> {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const url = body?.url;
  if (!url) {
    context.res = { status: 400, body: { error: 'url is required' } };
    return;
  }
  try {
    const storageAccountName = await getStorageAccountName();
    // --- デバッグ用ログ出力 ---
    context.log('delete request url:', url);
    let container = '';
    let blob = '';
    const path = url.replace(/^\//, '');
    if (path.startsWith('user-images/')) {
      container = 'user-images';
      blob = path.substring('user-images/'.length);
    } else {
      const pathParts = path.split('/');
      container = pathParts.shift() || '';
      blob = pathParts.join('/');
    }
    // --- バリデーション追加 ---
    if (container !== 'user-images') {
      context.res = { status: 400, body: { error: 'container名が不正です（user-imagesのみ許可）' } };
      return;
    }
    if (!blob || /[\\#?]/.test(blob)) {
      context.res = { status: 400, body: { error: 'blob名が不正です' } };
      return;
    }
    context.log('delete container:', container, 'blob:', blob);
    try {
      const credential = new (require('@azure/identity').DefaultAzureCredential)();
      const { BlobServiceClient } = require('@azure/storage-blob');
      const blobServiceClient = new BlobServiceClient(
        `https://${storageAccountName}.blob.core.windows.net`,
        credential
      );
      const containerClient = blobServiceClient.getContainerClient(container);
      const blockBlobClient = containerClient.getBlockBlobClient(blob);
      const delResult = await blockBlobClient.deleteIfExists();
      context.log('deleteIfExists result:', delResult);
      // --- Cosmos DBの履歴も削除 ---
      try {
        const { deletePromptHistoryByBlobPath } = require('../shared/cosmos');
        const deleted = await deletePromptHistoryByBlobPath(blob); // blobはuserId/年月日/ファイル名
        context.log('deletePromptHistoryByBlobPath result:', deleted);
      } catch (cosmosErr) {
        context.log('Cosmos履歴削除エラー:', cosmosErr);
      }
      context.res = { status: 200, body: { ok: true } };
    } catch (parseErr) {
      context.log('delete url parse error:', parseErr);
      let errorMsg = (parseErr instanceof Error) ? parseErr.message : String(parseErr);
      context.res = { status: 400, body: { error: errorMsg } };
      return;
    }
  } catch (e: any) {
    context.log('delete error:', e);
    context.res = { status: 500, body: { error: e.message || String(e) } };
  }
};

export default httpTrigger;
