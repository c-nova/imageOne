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
    
    // 履歴項目をプロキシURL形式に変換
    const proxyUrls = histories.map((history: any) => {
      // imageBlobPathが存在する場合はプロキシURLを生成
      if (history.imageBlobPath) {
        return `/api/image-proxy?path=${encodeURIComponent(history.imageBlobPath)}`;
      }
      // 既存のimageUrlがSAS形式の場合は変換、プロキシ形式の場合はそのまま
      if (history.imageUrl && !history.imageUrl.startsWith('/api/image-proxy')) {
        try {
          const url = new URL(history.imageUrl);
          const blobPath = url.pathname.substring(1); // 最初の'/'を削除
          return `/api/image-proxy?path=${encodeURIComponent(blobPath)}`;
        } catch {
          // URL解析に失敗した場合は元のURLを返す
          return history.imageUrl;
        }
      }
      return history.imageUrl;
    }).filter((url: any) => url); // nullやundefinedを除外

    context.log(`ユーザー ${maskUserInfo(userInfo).userId} の画像履歴を取得: ${proxyUrls.length}件`);
    
    context.res = { 
      status: 200, 
      body: { 
        urls: proxyUrls,
        count: proxyUrls.length,
        message: `${proxyUrls.length}件の画像履歴を取得しました。`
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
