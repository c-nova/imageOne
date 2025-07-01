import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { getUserFromRequest, maskUserInfo } from "../shared/auth";

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

// 🎬 OpenAI Video Jobs API用のエンドポイント
const httpTrigger = async function (context: any, req: any): Promise<void> {
  context.log('🎬 [DEBUG] videoJobs関数開始');
  context.log('🎬 [DEBUG] Method:', req.method, 'URL:', req.url);

  // 🔐 認証チェック
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('✅ [DEBUG] ユーザー認証成功:', maskUserInfo(userInfo));
  } catch (authError: any) {
    context.log.error('❌ [ERROR] 認証エラー:', authError.message);
    context.res = { status: 401, body: { error: "認証が必要です", details: authError.message } };
    return;
  }

  try {
    if (req.method === 'GET' && req.url?.includes('/content/video')) {
      // GET /openai/v1/video/generations/{job-id}/content/video - 動画コンテンツ取得
      await getVideoContent(context, req);
    } else if (req.method === 'GET' && req.url?.includes('/content/thumbnail')) {
      // GET /openai/v1/video/generations/{job-id}/content/thumbnail - サムネイル取得
      await getVideoThumbnail(context, req);
    } else if (req.method === 'GET' && req.url?.includes('/jobs/')) {
      // GET /openai/v1/video/generations/jobs/{job-id} - 特定ジョブ詳細取得
      await getVideoJob(context, req);
    } else if (req.method === 'GET') {
      // GET /openai/v1/video/generations/jobs - ジョブ一覧取得
      await listVideoJobs(context, req);
    } else if (req.method === 'POST') {
      // POST /openai/v1/video/generations/jobs - ジョブ作成
      await createVideoJob(context, req);
    } else if (req.method === 'DELETE') {
      // DELETE /openai/v1/video/generations/jobs/{job-id} - ジョブ削除
      await deleteVideoJob(context, req);
    } else {
      context.res = { 
        status: 405, 
        body: { error: "Method not allowed. GET, POST, DELETE のみサポートしています。" } 
      };
    }
  } catch (error: any) {
    context.log.error('❌ [ERROR] videoJobs処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画ジョブ処理中にエラーが発生しました", details: error.message } 
    };
  }
};

// 📋 動画ジョブ一覧取得 - GET /openai/v1/video/generations/jobs
async function listVideoJobs(context: any, req: any): Promise<void> {
  context.log('🎬 [DEBUG] 動画ジョブ一覧取得');

  try {
    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      // Key Vaultからの取得に失敗した場合は環境変数から取得
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // 動画ジョブ一覧取得用のエンドポイントURLを構築
    // Azure OpenAI形式のエンドポイント構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      // Azure OpenAI形式: https://your-resource.openai.azure.com/openai/deployments/deployment-name/
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      // Azure OpenAI形式（シンプル）: https://your-resource.openai.azure.com
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      // 他の形式
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }
    
    const videoJobsUrl = `${baseUrl}/openai/v1/video/generations/jobs?api-version=preview`;
    context.log('🔍 [DEBUG] Base URL:', baseUrl);
    context.log('🔍 [DEBUG] Video Jobs URL:', videoJobsUrl);

    // OpenAI/Sora APIを呼び出し
    const response = await fetch(videoJobsUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        errorData = await response.text();
      }
      context.log.error('❌ ジョブ一覧取得 API エラー詳細:', {
        status: response.status,
        statusText: response.statusText,
        url: videoJobsUrl,
        headers: Object.fromEntries(response.headers.entries()),
        error: errorData
      });
      throw new Error(`API error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    const jobsData = await response.json();
    
    // 詳細なデバッグ情報を出力
    context.log('✅ [SUCCESS] 動画ジョブ一覧取得完了:', { 
      jobCount: jobsData.data?.length || 0,
      jobs: jobsData.data?.map((job: any) => ({
        id: job.id,
        status: job.status,
        prompt: job.prompt?.substring(0, 50) + '...',
        created: job.created_at
      })) || []
    });

    context.res = {
      status: 200,
      body: jobsData
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画ジョブ一覧取得エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画ジョブ一覧の取得に失敗しました", details: error.message } 
    };
  }
}

// 🔍 特定動画ジョブ詳細取得 - GET /openai/v1/video/generations/jobs/{job-id}
async function getVideoJob(context: any, req: any): Promise<void> {
  const pathSegments = req.url?.split('/') || [];
  const jobId = pathSegments[pathSegments.length - 1];

  if (!jobId) {
    context.res = { 
      status: 400, 
      body: { error: "ジョブIDが指定されていません" } 
    };
    return;
  }

  context.log('🎬 [DEBUG] 動画ジョブ詳細取得:', { jobId });

  try {
    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // エンドポイントURLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    const jobDetailUrl = `${baseUrl}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
    context.log('🔍 [DEBUG] Job Detail URL:', jobDetailUrl);

    const response = await fetch(jobDetailUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      context.log.error('❌ API エラー:', response.status, errorData);
      throw new Error(`API error: ${response.status} ${errorData}`);
    }

    const jobData = await response.json();
    
    // 🎬 動画URLとサムネイルURLを構築
    let videoUrl = null;
    let thumbnailUrl = null;
    
    if (jobData.status === 'completed' || jobData.status === 'succeeded') {
      const generationId = jobData.generations?.[0]?.id || jobData.id;
      if (generationId) {
        // 動画URLとサムネイルURLを構築
        videoUrl = `${baseUrl}/openai/v1/video/generations/${generationId}/content/video?api-version=preview`;
        thumbnailUrl = `${baseUrl}/openai/v1/video/generations/${generationId}/content/thumbnail?api-version=preview`;
      }
    }
    
    // フロントエンド用のレスポンス形式に変換
    const responseData = {
      ...jobData,
      videoUrl,
      thumbnailUrl
    };
    
    context.log('✅ [SUCCESS] 動画ジョブ詳細取得完了:', { 
      jobId, 
      hasVideoUrl: !!videoUrl, 
      hasThumbnailUrl: !!thumbnailUrl,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      status: jobData.status,
      generationId: jobData.generations?.[0]?.id || jobData.id
    });

    context.res = {
      status: 200,
      body: responseData
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画ジョブ詳細取得エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画ジョブ詳細の取得に失敗しました", details: error.message } 
    };
  }
}

// 🚀 動画ジョブ作成 - POST /openai/v1/video/generations/jobs
async function createVideoJob(context: any, req: any): Promise<void> {
  if (!req.headers["content-type"]?.includes("application/json")) {
    context.res = { status: 400, body: { error: "Content-Type: application/json が必要です" } };
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const { prompt, model, size, seconds } = body;

  if (!prompt) {
    context.res = { 
      status: 400, 
      body: { error: "prompt は必須項目です" } 
    };
    return;
  }

  context.log('🎬 [DEBUG] 動画ジョブ作成:', { prompt, model, size, seconds });

  try {
    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // エンドポイントURLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    const jobCreateUrl = `${baseUrl}/openai/v1/video/generations/jobs?api-version=preview`;
    context.log('🔍 [DEBUG] Job Create URL:', jobCreateUrl);

    const requestBody = {
      prompt,
      model: model || 'sora',
      size: size || '1280x720',
      seconds: seconds || 5
    };

    const response = await fetch(jobCreateUrl, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.text();
      context.log.error('❌ API エラー:', response.status, errorData);
      throw new Error(`API error: ${response.status} ${errorData}`);
    }

    const jobData = await response.json();
    
    context.log('✅ [SUCCESS] 動画ジョブ作成完了:', { jobId: jobData.id });

    context.res = {
      status: 200,
      body: jobData
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画ジョブ作成エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画ジョブの作成に失敗しました", details: error.message } 
    };
  }
}

// 🗑️ 動画ジョブ削除 - DELETE /openai/v1/video/generations/jobs/{job-id}
async function deleteVideoJob(context: any, req: any): Promise<void> {
  const pathSegments = req.url?.split('/') || [];
  const jobId = pathSegments[pathSegments.length - 1];

  if (!jobId) {
    context.res = { 
      status: 400, 
      body: { error: "削除するジョブIDが指定されていません" } 
    };
    return;
  }

  context.log('🎬 [DEBUG] 動画ジョブ削除:', { jobId });

  try {
    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // エンドポイントURLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    const jobDeleteUrl = `${baseUrl}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
    context.log('🔍 [DEBUG] Job Delete URL:', jobDeleteUrl);

    const response = await fetch(jobDeleteUrl, {
      method: 'DELETE',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      context.log.error('❌ API エラー:', response.status, errorData);
      throw new Error(`API error: ${response.status} ${errorData}`);
    }

    const result = await response.json();
    
    context.log('✅ [SUCCESS] 動画ジョブ削除完了:', { jobId });

    context.res = {
      status: 200,
      body: result
    };
  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画ジョブ削除エラー:', error);
    context.res = { 
      status: 500, 
      body: { error: "動画ジョブの削除に失敗しました", details: error.message } 
    };
  }
}

/**
 * 🎬 動画コンテンツを取得する
 */
async function getVideoContent(context: any, req: any) {
  try {
    // URLから job-id を抽出
    const pathSegments = req.url?.split('/');
    const jobIdIndex = pathSegments?.findIndex((segment: string) => segment === 'generations') + 1;
    const jobId = pathSegments?.[jobIdIndex];
    
    if (!jobId) {
      context.res = { 
        status: 400, 
        body: { error: "ジョブIDが指定されていません" }
      };
      return;
    }

    context.log('🎬 [INFO] 動画コンテンツ取得開始 - ジョブID:', jobId);

    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // エンドポイントURLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    // 1. まずJob詳細を取得してGeneration IDを取得
    const jobDetailUrl = `${baseUrl}/openai/v1/video/generations/jobs/${jobId}?api-version=preview`;
    context.log('🔍 [DEBUG] Job Detail URL:', jobDetailUrl);

    const jobResponse = await fetch(jobDetailUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!jobResponse.ok) {
      const jobError = await jobResponse.json();
      context.log.error('❌ [ERROR] Job詳細取得エラー:', jobError);
      context.res = { 
        status: jobResponse.status, 
        body: { error: "Job詳細の取得に失敗しました", details: jobError } 
      };
      return;
    }

    const jobData = await jobResponse.json();
    context.log('✅ [DEBUG] Job詳細取得成功:', jobData);

    // Job詳細からGeneration IDを取得
    const actualGenerationId = jobData.id || jobData.generation_id || jobId;
    if (!actualGenerationId) {
      context.log.error('❌ [ERROR] Generation IDが見つかりません:', jobData);
      context.res = { 
        status: 500, 
        body: { error: "Generation IDが見つかりません", details: jobData } 
      };
      return;
    }

    context.log('🎯 [DEBUG] 実際のGeneration ID:', actualGenerationId);

    // 2. 実際のGeneration IDで動画コンテンツを取得
    const videoContentUrl = `${baseUrl}/openai/v1/video/generations/${actualGenerationId}/content/video?api-version=preview`;
    context.log('🔍 [DEBUG] Video Content URL:', videoContentUrl);

    // Azure OpenAI APIに動画コンテンツ取得リクエスト
    const response = await fetch(videoContentUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        'Accept': 'video/mp4'
      }
    });

    if (!response.ok) {
      const errorData = await response.text();
      context.log.error('❌ [ERROR] Azure OpenAI動画取得エラー:', response.status, errorData);
      
      context.res = { 
        status: response.status, 
        body: { 
          error: "動画コンテンツの取得に失敗しました",
          details: errorData
        }
      };
      return;
    }

    // 動画データをバイナリで取得
    const videoBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'video/mp4';
    
    context.log('✅ [SUCCESS] 動画コンテンツ取得成功 - サイズ:', videoBuffer.byteLength, 'bytes');

    // バイナリデータとして返す
    context.res = {
      status: 200,
      body: Buffer.from(videoBuffer),
      headers: {
        'Content-Type': contentType,
        'Content-Length': videoBuffer.byteLength.toString(),
        'Content-Disposition': `attachment; filename="video_${jobId}.mp4"`
      }
    };

  } catch (error: any) {
    context.log.error('❌ [ERROR] 動画コンテンツ取得処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { 
        error: "動画コンテンツ取得中にエラーが発生しました",
        details: error.message
      }
    };
  }
}

// 🖼️ 動画サムネイル取得 - GET /openai/v1/video/generations/{job-id}/content/thumbnail
async function getVideoThumbnail(context: any, req: any) {
  try {
    // URLから job-id を抽出
    const pathSegments = req.url?.split('/');
    const jobIdIndex = pathSegments?.findIndex((segment: string) => segment === 'generations') + 1;
    const jobId = pathSegments?.[jobIdIndex];
    
    if (!jobId) {
      context.res = { 
        status: 400, 
        body: { error: "ジョブIDが指定されていません" }
      };
      return;
    }

    context.log('🖼️ [INFO] サムネイル取得開始 - ジョブID:', jobId);

    // Key VaultからSoraエンドポイントとAPIキーを取得
    let endpoint: string;
    let apiKey: string;
    
    try {
      const endpointSecret = await secretClient.getSecret("sora-Endpoint");
      endpoint = endpointSecret.value!;
      
      const apiKeySecret = await secretClient.getSecret("sora-Key");
      apiKey = apiKeySecret.value!;
      
      context.log('✅ [DEBUG] Key Vault取得完了');
    } catch (kvError: any) {
      context.log.error('❌ [ERROR] Key Vaultアクセスエラー:', kvError);
      endpoint = process.env.SORA_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT || "";
      apiKey = process.env.SORA_API_KEY || process.env.AZURE_OPENAI_API_KEY || "";
      
      if (!apiKey || !endpoint) {
        throw new Error("Sora APIキー/エンドポイントまたはAzure OpenAI APIキー/エンドポイントが設定されていません");
      }
    }

    // エンドポイントURLを構築
    let baseUrl: string;
    if (endpoint.includes('/openai/deployments/')) {
      const match = endpoint.match(/(https:\/\/[^\/]+\.openai\.azure\.com)/);
      baseUrl = match ? match[1] : endpoint.split('/openai/')[0];
    } else if (endpoint.includes('.openai.azure.com')) {
      baseUrl = endpoint.replace(/\/$/, '');
    } else {
      baseUrl = endpoint.split('/v1/')[0] || endpoint.replace(/\/$/, '');
    }

    const thumbnailUrl = `${baseUrl}/openai/v1/video/generations/${jobId}/content/thumbnail?api-version=preview`;
    context.log('🔍 [DEBUG] Thumbnail URL:', thumbnailUrl);

    // Azure OpenAI APIにサムネイル取得リクエスト
    const response = await fetch(thumbnailUrl, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
      }
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (parseError) {
        errorData = await response.text();
      }
      context.log.error('❌ サムネイル取得 API エラー詳細:', {
        status: response.status,
        statusText: response.statusText,
        url: thumbnailUrl,
        headers: Object.fromEntries(response.headers.entries()),
        error: errorData
      });
      throw new Error(`API error: ${response.status} ${JSON.stringify(errorData)}`);
    }

    // レスポンスがバイナリデータの場合
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const thumbnailBuffer = Buffer.from(await response.arrayBuffer());
    
    context.log('✅ [SUCCESS] サムネイル取得完了:', { 
      contentType,
      size: thumbnailBuffer.byteLength 
    });

    context.res = {
      status: 200,
      body: Buffer.from(thumbnailBuffer),
      headers: {
        'Content-Type': contentType,
        'Content-Length': thumbnailBuffer.byteLength.toString(),
        'Content-Disposition': `attachment; filename="thumbnail_${jobId}.jpg"`
      }
    };

  } catch (error: any) {
    context.log.error('❌ [ERROR] サムネイル取得処理エラー:', error);
    context.res = { 
      status: 500, 
      body: { 
        error: "サムネイル取得中にエラーが発生しました",
        details: error.message
      }
    };
  }
}

export default httpTrigger;
