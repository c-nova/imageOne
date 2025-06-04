// history/index.ts - プロンプト履歴取得・削除API
import { getUserFromRequest, maskUserInfo } from "../shared/auth";
import { getUserPromptHistory, getUserHistoryStats, getPromptHistoryById, deletePromptHistory } from "../shared/cosmos";

const httpTrigger = async function (context: any, req: any): Promise<void> {
  // ユーザー認証の確認
  let userInfo;
  try {
    userInfo = await getUserFromRequest(req);
    context.log('履歴取得要求 - 認証済みユーザー:', maskUserInfo(userInfo));
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
    // DELETEメソッドの場合は削除処理
    if (req.method === 'DELETE') {
      const pathSegments = req.url?.split('/') || [];
      const historyId = pathSegments[pathSegments.length - 1];
      
      if (!historyId) {
        context.res = { 
          status: 400, 
          body: { error: "削除する履歴IDが指定されていません" } 
        };
        return;
      }
      
      // まず削除対象が存在し、ユーザーのものかを確認
      const existingItem = await getPromptHistoryById(historyId, userInfo.userId);
      if (!existingItem) {
        context.res = { 
          status: 404, 
          body: { error: "指定された履歴が見つかりません" } 
        };
        return;
      }
      
      // 削除実行
      const success = await deletePromptHistory(historyId, userInfo.userId);
      if (!success) {
        context.res = { 
          status: 500, 
          body: { error: "履歴の削除に失敗しました" } 
        };
        return;
      }
      
      context.log('履歴削除成功:', { historyId, userId: userInfo.userId });
      context.res = {
        status: 200,
        body: { message: "履歴を削除しました", deletedId: historyId }
      };
      return;
    }
    
    const { action, id, limit, offset } = req.query;
    
    // 特定の履歴アイテムを取得
    if (action === 'get' && id) {
      const historyItem = await getPromptHistoryById(id, userInfo.userId);
      if (!historyItem) {
        context.res = { 
          status: 404, 
          body: { error: "指定された履歴が見つかりません" } 
        };
        return;
      }
      
      context.res = {
        status: 200,
        body: { historyItem }
      };
      return;
    }
    
    // 履歴統計を取得
    if (action === 'stats') {
      const stats = await getUserHistoryStats(userInfo.userId);
      context.res = {
        status: 200,
        body: { stats }
      };
      return;
    }
    
    // デフォルト: ユーザーの履歴一覧を取得
    const limitNum = parseInt(limit) || 50;
    const offsetNum = parseInt(offset) || 0;
    
    // 制限値のチェック
    if (limitNum > 100) {
      context.res = { 
        status: 400, 
        body: { error: "limitは100以下で指定してください" } 
      };
      return;
    }
    
    const history = await getUserPromptHistory(userInfo.userId, limitNum, offsetNum);
    const stats = await getUserHistoryStats(userInfo.userId);
    
    context.res = {
      status: 200,
      body: {
        history,
        stats,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          count: history.length
        }
      }
    };
    
  } catch (error: any) {
    context.log.error("履歴取得中にエラー:", error);
    context.res = { 
      status: 500, 
      body: { 
        error: "履歴取得中にエラーが発生しました",
        message: error.message 
      } 
    };
  }
};

export default httpTrigger;
