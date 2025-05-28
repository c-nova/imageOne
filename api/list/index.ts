import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } from "@azure/storage-blob";

// Azure Functions 型定義を any として扱う
// import types removed to avoid TS errors

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const secretClient = new SecretClient(`https://${kvName}.vault.azure.net`, credential);

async function getStorageSasUrls(): Promise<string[]> {
  // ストレージアカウント名をKey Vaultまたは環境変数から取得
  let storageAccount = process.env.STORAGE_ACCOUNT_NAME;
  if (!storageAccount) {
    storageAccount = (await secretClient.getSecret("StorageAccountName")).value!;
  }
  const containerName = "generated-images";
  const blobService = new BlobServiceClient(
    `https://${storageAccount}.blob.core.windows.net`,
    credential
  );
  const containerClient = blobService.getContainerClient(containerName);

  // ユーザーデリゲーションキーを取得（有効期限は10分）
  const now = new Date();
  const expiry = new Date(now.getTime() + 10 * 60 * 1000);
  const delegationKey = await blobService.getUserDelegationKey(now, expiry);

  // Collect blobs with timestamp
  const items: { url: string; lastModified: Date }[] = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    const lastModified = blob.properties.lastModified ?? new Date(0);
    const blobClient = containerClient.getBlockBlobClient(blob.name);
    // SASトークン生成
    const sas = generateBlobSASQueryParameters({
      containerName,
      blobName: blob.name,
      permissions: BlobSASPermissions.parse("r"),
      startsOn: now,
      expiresOn: expiry,
    }, delegationKey, storageAccount).toString();
    const sasUrl = `${blobClient.url}?${sas}`;
    items.push({ url: sasUrl, lastModified });
  }
  // 新しいものが先に来るようにソート
  items.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return items.map(item => item.url);
}

const httpTrigger = async function(context: any, req: any): Promise<void> {
  try {
    const urls = await getStorageSasUrls();
    context.res = { status: 200, body: { urls } };
  } catch (err: any) {
    console.error(err);
    context.res = { status: 500, body: { error: 'Failed to list blobs' } };
  }
};

export default httpTrigger;
