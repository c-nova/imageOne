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
    context.res = { status: 400, body: 'url is required' };
    return;
  }
  try {
    const storageAccountName = await getStorageAccountName();
    // --- デバッグ用ログ出力 ---
    context.log('delete request url:', url);
    try {
      const urlObj = new URL(url);
      context.log('urlObj.pathname:', urlObj.pathname);
      const pathParts = urlObj.pathname.replace(/^\//, '').split('/');
      context.log('pathParts:', pathParts);
      const container = pathParts.shift() || '';
      const blob = pathParts.join('/');
      context.log('delete container:', container, 'blob:', blob);
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
      context.res = { status: 200, body: { ok: true } };
    } catch (parseErr) {
      context.log('delete url parse error:', parseErr);
      throw parseErr;
    }
  } catch (e: any) {
    context.log('delete error:', e);
    context.res = { status: 500, body: e.message };
  }
};

export default httpTrigger;
