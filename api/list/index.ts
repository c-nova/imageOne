import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { getUserFromRequest, maskUserInfo } from "../shared/auth";
import { getUserPromptHistory } from "../shared/cosmos";

const credential = new DefaultAzureCredential();

const httpTrigger = async function(context: any, req: any): Promise<void> {
  // ユーザー認証の確認
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('認証済みユーザー:', maskUserInfo(userInfo));
  } catch (error: any) {
    context.log.error('認証エラー:', error.message);
    context.res = { 
      status: 401, 
      body: { 
        error: "認証が必要です",
        message: "有効なアクセストークンを提供してください。"
      } 
    };
    return;
  }

  try {
    // Cosmos DBからユーザーの履歴を取得（プロキシURLで構成済み）
    const histories = await getUserPromptHistory(userInfo.userId);

    // ImageItem[]形式で返す（プロキシURL＋プロンプト等も含める）
    const imageItems = histories.map((history: any) => {
      let imageUrl = history.imageUrl;
      let imageBlobPath = history.imageBlobPath || '';
      // --- 修正: imageBlobPathを必ず'user-images/'で始める ---
      if (imageBlobPath && !imageBlobPath.startsWith('user-images/')) {
        imageBlobPath = `user-images/${imageBlobPath}`;
      }
      if (history.imageBlobPath) {
        imageUrl = `/api/image-proxy?path=${encodeURIComponent(imageBlobPath)}`;
      } else if (history.imageUrl && !history.imageUrl.startsWith('/api/image-proxy')) {
        try {
          const url = new URL(history.imageUrl);
          const blobPath = url.pathname.substring(1); // 最初の'/'を削除
          imageUrl = `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
          if (!imageBlobPath) imageBlobPath = blobPath;
        } catch {
          // URL解析に失敗した場合は元のURLをそのまま
        }
      }
      return {
        id: history.id,
        prompt: history.prompt || '',
        originalPrompt: history.originalPrompt || '',
        imageUrl,
        imageBlobPath,
        operationType: history.operationType || 'generate',
        size: history.size || '',
        timestamp: history.timestamp || '',
        metadata: history.metadata || {},
        cameraSettings: history.cameraSettings || undefined,
      };
    });

    // imageUrlがあるものだけにフィルタ
    const filteredImageItems = imageItems.filter(item => !!item.imageUrl);

    context.log(`ユーザー ${maskUserInfo(userInfo).userId} の画像履歴を取得: ${filteredImageItems.length}件`);
    context.res = {
      status: 200,
      body: {
        images: filteredImageItems,
        count: filteredImageItems.length,
        message: `${filteredImageItems.length}件の画像履歴を取得しました。`
      }
    };
  } catch (error: any) {
    context.log.error("画像履歴取得中にエラー:", error);
    context.res = { 
      status: 500, 
      body: { 
        error: '画像履歴の取得に失敗しました',
        message: error.message 
      } 
    };
  }
};

export default httpTrigger;
