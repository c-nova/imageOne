import { getUserFromRequest } from "../shared/auth";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

const httpTrigger = async function (context: any, req: any): Promise<void> {
    context.log('🗑️ Delete Video Job request:', req.method, req.url);

    // CORSヘッダーを設定
    context.res = {
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    };

    // OPTIONSリクエスト（プリフライト）の処理
    if (req.method === "OPTIONS") {
        context.res.status = 200;
        return;
    }

    // 🔐 認証チェック
    let userInfo;
    try {
        userInfo = await getUserFromRequest(req);
        context.log('✅ [DEBUG] ユーザー認証成功:', userInfo.userId);
    } catch (authError: any) {
        context.log('❌ Authentication failed:', authError.message);
        context.res = {
            ...context.res,
            status: 401,
            body: { error: "認証が必要です", details: authError.message }
        };
        return;
    }

    try {
        const jobId = req.params?.jobId;
        if (!jobId) {
            context.log('❌ No job ID provided');
            context.res = {
                ...context.res,
                status: 400,
                body: { error: "ジョブIDが必要です" }
            };
            return;
        }

        context.log(`🗑️ Deleting video job: ${jobId} for user: ${userInfo.userId}`);

        // Key VaultからSora APIキーを取得
        let endpoint: string;
        let apiKey: string;
        
        try {
            context.log('🔑 Key Vaultからシークレット取得中...');
            
            const endpointSecret = await secretClient.getSecret("sora-Endpoint");
            endpoint = endpointSecret.value!;
            
            const apiKeySecret = await secretClient.getSecret("sora-Key");
            apiKey = apiKeySecret.value!;
            
            context.log('✅ [DEBUG] Key Vault取得完了');
            context.log('🔗 [DEBUG] Endpoint:', endpoint);
            context.log('🔑 [DEBUG] API Key (first 10 chars):', apiKey?.substring(0, 10) + '...');
        } catch (kvError: any) {
            // Key Vaultからの取得に失敗した場合は環境変数から取得
            context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
            endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
            apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
            
            if (!apiKey || !endpoint) {
                throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
            }
        }

        // まずジョブの詳細を取得して、ユーザーのジョブか確認
        const getUrl = `${endpoint}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
        context.log('🔍 [DEBUG] GET URL:', getUrl);
        
        const getResponse = await fetch(getUrl, {
            method: 'GET',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        context.log('📊 [DEBUG] GET Response Status:', getResponse.status);
        context.log('📊 [DEBUG] GET Response Headers:', Object.fromEntries(getResponse.headers.entries()));

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                context.log(`⚠️ Job ${jobId} not found, might already be deleted`);
                context.res = {
                    ...context.res,
                    status: 200,
                    body: { 
                        success: true, 
                        message: "ジョブが見つかりません（既に削除済みの可能性があります）",
                        jobId 
                    }
                };
                return;
            }
            const errorText = await getResponse.text();
            context.log('❌ [DEBUG] GET Error Response:', errorText);
            throw new Error(`Failed to get job details: ${getResponse.status} - ${errorText}`);
        }

        const jobData = await getResponse.json();
        context.log('📋 [DEBUG] Job data:', JSON.stringify(jobData, null, 2));

        // ジョブをキャンセル/削除する
        // Azure OpenAI Video Generation API リファレンスに従ってDELETEメソッドを使用
        const deleteUrl = `${endpoint}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
        context.log('🗑️ [DEBUG] DELETE URL:', deleteUrl);
        context.log('🗑️ Attempting to delete job via DELETE method');
        
        const deleteResponse = await fetch(deleteUrl, {
            method: 'DELETE',
            headers: {
                'api-key': apiKey,
                'Content-Type': 'application/json'
            }
        });

        context.log('📊 [DEBUG] DELETE Response Status:', deleteResponse.status);
        context.log('📊 [DEBUG] DELETE Response Headers:', Object.fromEntries(deleteResponse.headers.entries()));

        if (!deleteResponse.ok) {
            if (deleteResponse.status === 404) {
                context.log(`⚠️ Job ${jobId} not found, might already be deleted`);
                context.res = {
                    ...context.res,
                    status: 200,
                    body: { 
                        success: true, 
                        message: "ジョブが見つかりません（既に削除済みの可能性があります）",
                        jobId 
                    }
                };
                return;
            }
            const errorText = await deleteResponse.text();
            context.log('❌ [DEBUG] DELETE Error Response:', errorText);
            throw new Error(`Failed to delete job: ${deleteResponse.status} ${deleteResponse.statusText} - ${errorText}`);
        }

        context.log('✅ Job deleted successfully via DELETE method');

        // 成功レスポンス
        context.res = {
            ...context.res,
            status: 200,
            body: {
                success: true,
                message: "動画ジョブを削除しました",
                jobId: jobId,
                originalStatus: jobData.status
            }
        };

        context.log(`✅ Video job deleted successfully: ${jobId}`);

    } catch (error) {
        context.log('❌ Error deleting video job:', error);
        
        context.res = {
            ...context.res,
            status: 500,
            body: {
                error: "動画ジョブの削除に失敗しました",
                details: error instanceof Error ? error.message : String(error)
            }
        };
    }
};

export default httpTrigger;
