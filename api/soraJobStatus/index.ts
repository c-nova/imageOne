import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import fetch from 'node-fetch';

const keyVaultUrl = process.env.KEY_VAULT_URL;

async function getSecret(secretName: string): Promise<string> {
  if (!keyVaultUrl) throw new Error('KEY_VAULT_URL is not set');
  const credential = new DefaultAzureCredential();
  const client = new SecretClient(keyVaultUrl, credential);
  const secret = await client.getSecret(secretName);
  return secret.value || '';
}

const httpTrigger = async function (context: any, req: any): Promise<void> {
  if (req.method !== 'GET') {
    context.res = { status: 405, body: { error: 'Method not allowed' } };
    return;
  }
  const jobIdRaw = req.query.jobId;
  const jobId = Array.isArray(jobIdRaw) ? jobIdRaw[0] : jobIdRaw;
  if (typeof jobId !== 'string') {
    context.res = { status: 400, body: { error: 'jobId is required and must be a string' } };
    return;
  }
  try {
    const soraEndpoint = await getSecret('sora-Endpoint');
    const soraKey = await getSecret('sora-Key');
    
    // ジョブステータス確認用のエンドポイントを構築
    // sora-Endpointは: https://openaidemomo10.openai.azure.com/
    // ジョブステータス確認は: https://openaidemomo10.openai.azure.com/openai/v1/video/generations/jobs/{jobId}?api-version=preview
    const url = `${soraEndpoint.replace(/\/$/, '')}/openai/v1/video/generations/jobs/${encodeURIComponent(jobId)}?api-version=preview`;
    
    console.log(`🔍 [DEBUG] Job Status URL: ${url}`);
    
    const soraRes = await fetch(url, {
      method: 'GET',
      headers: {
        'api-key': soraKey,
        'Content-Type': 'application/json',
      },
    });
    
    const data = await soraRes.json();
    console.log(`🔍 [DEBUG] Sora API Response Status: ${soraRes.status}`);
    console.log(`🔍 [DEBUG] Sora API Response Data:`, JSON.stringify(data, null, 2));
    
    if (!soraRes.ok) {
      console.log(`❌ [ERROR] Sora API Error:`, data);
      context.res = { status: soraRes.status, body: { error: data.error || 'Sora API error', ...data } };
      return;
    }
    
    console.log(`✅ [SUCCESS] Job Status Retrieved:`, data);
    context.res = { status: 200, body: data };
  } catch (err: any) {
    context.res = { status: 500, body: { error: err.message || 'Internal server error' } };
  }
};

export default httpTrigger;
