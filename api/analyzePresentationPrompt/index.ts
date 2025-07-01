import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { AzureOpenAI } from "openai";
import { getUserFromRequest, maskUserInfo } from "../shared/auth";

// Types for presentation analysis
export interface SlideData {
  id: number;
  title: string;
  content: string;
  suggestedImage?: string;
  suggestedVideo?: string;
  layout: 'title-image' | 'full-text' | 'comparison-table' | 'bullet-points' | 'chart';
  notes?: string;
}

export interface PresentationPlan {
  title: string;
  slides: SlideData[];
  designTheme: string; // 'cyberpunk' | 'neon' | 'ocean' | 'sunset' | 'matrix' など
  estimatedDuration: number;
  targetAudience: string;
  primaryGoal: string;
}

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const kvUrl = `https://${kvName}.vault.azure.net`;
const secretClient = new SecretClient(kvUrl, credential);

let openAIClient: AzureOpenAI | null = null;
let O3_DEPLOYMENT_NAME: string | null = null;
let O3_API_VERSION: string | null = null;

async function getOpenAIClient() {
  if (openAIClient) return openAIClient;
  
  // o3専用の設定を取得
  const endpointSecret = await secretClient.getSecret("OpenAI-O3-Endpoint");
  const endpoint = endpointSecret.value!;
  
  const keySecret = await secretClient.getSecret("OpenAI-O3-Key");
  const apiKey = keySecret.value!;
  
  if (!O3_DEPLOYMENT_NAME) {
    const deploymentSecret = await secretClient.getSecret("OpenAI-O3-Deployment");
    O3_DEPLOYMENT_NAME = deploymentSecret.value!;
  }
  
  if (!O3_API_VERSION) {
    const apiVersionSecret = await secretClient.getSecret("OpenAI-O3-ApiVersion");
    O3_API_VERSION = apiVersionSecret.value!;
  }

  openAIClient = new AzureOpenAI({
    endpoint,
    apiVersion: O3_API_VERSION,
    deployment: O3_DEPLOYMENT_NAME,
    apiKey: apiKey
  });
  
  return openAIClient;
}

async function analyzePresentationPrompt(userPrompt: string): Promise<PresentationPlan> {
  const client = await getOpenAIClient();
  
  const systemPrompt = `あなたは世界トップクラスのプレゼンテーション設計の専門家です。
ユーザーの指示から、情報量豊富で説得力のある魅力的なスライド構成を提案してください。

## 📊 重要な設計方針：
- **情報密度**: 各スライドに十分な情報を含める（箇条書きは3-5項目、詳細説明付き）
- **具体性**: 抽象的でなく、具体的な事例・数値・データを含める
- **論理構造**: Why（なぜ）→ What（何を）→ How（どのように）の流れ
- **視覚的要素**: 図表・グラフ・画像で情報を補強
- **ストーリーテリング**: 聴衆の心に響く物語性のある構成

## 🎯 各スライドの要件：
- **contentフィールド**: 最低150-300文字の詳細な内容
- **具体例**: 実際の事例や数値データを含める
- **行動喚起**: 聴衆への明確なメッセージ
- **視覚的提案**: 効果的な画像・グラフの詳細な指定

## 📝 コンテンツ生成のガイドライン：
- 専門用語は適切に説明を付ける
- 統計データや調査結果を積極的に活用
- 比較・対比で理解を深める
- 聴衆の関心を引く質問や問いかけを含める
- 次のスライドへの自然な流れを作る

出力は必ず以下のJSON形式で返してください：
{
  "title": "魅力的で具体的なプレゼンテーションタイトル",
  "slides": [
    {
      "id": 1,
      "title": "明確で興味を引くスライドタイトル",
      "content": "【重要】150-300文字以上の詳細な内容。箇条書きの場合は3-5項目で各項目に説明付き。具体例・数値データ・統計・事例を含める。抽象的でなく実用的な情報を提供する。",
      "suggestedImage": "このスライドに最適な画像の詳細な生成プロンプト（具体的なシーン、色彩、構図、要素を日本語で詳しく指定）",
      "suggestedVideo": "必要に応じて動画プロンプト（アニメーション、動きのある要素等）",
      "layout": "title-image | full-text | comparison-table | bullet-points | chart",
      "notes": "発表者向けの詳細な補足説明・話すポイント・想定される質問への回答例（100文字以上）"
    }
  ],
  "designTheme": "cyberpunk",
  "estimatedDuration": "発表時間（分単位で具体的に）",
  "targetAudience": "具体的な聴衆層（役職・業界・知識レベル等）",
  "primaryGoal": "このプレゼンテーションで達成したい具体的な目標・成果"
}`;

  const response = await client.chat.completions.create({
    model: O3_DEPLOYMENT_NAME!, // o3デプロイメント名を使用
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_completion_tokens: 8000 // 詳細なスライド内容生成のためトークン数を増加
    // o3モデルはtemperatureのデフォルト値(1)のみサポート
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("OpenAIからの応答が空です");
  }

  try {
    // JSONのみを抽出（markdown形式の場合があるため）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("有効なJSONが見つかりません");
    }
    
    const parsedPlan: PresentationPlan = JSON.parse(jsonMatch[0]);
    
    // テーマを確実に設定
    parsedPlan.designTheme = 'cyberpunk'; // デフォルトテーマを設定
    
    // バリデーション
    if (!parsedPlan.title || !parsedPlan.slides || !Array.isArray(parsedPlan.slides)) {
      throw new Error("無効なプレゼンテーション構成です");
    }
    
    return parsedPlan;
  } catch (error) {
    console.error("JSON解析エラー:", error);
    console.error("生のレスポンス:", content);
    throw new Error("プレゼンテーション分析結果の解析に失敗しました");
  }
}

export default async function httpTrigger(context: any, req: any) {
  try {
    // 認証チェック（一時的にスキップ - デバッグ用）
    // const user = await getUserFromRequest(req);
    // if (!user) {
    //   context.res = {
    //     status: 401,
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ error: "認証が必要です" })
    //   };
    //   return;
    // }

    console.log("認証チェックをスキップしています（デバッグ用）");

    // リクエストボディの検証
    if (!req.body || !req.body.prompt) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "プロンプトが必要です" })
      };
      return;
    }

    const { prompt } = req.body;
    
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "有効なプロンプトを入力してください" })
      };
      return;
    }

    context.log(`プレゼンテーション分析開始 - プロンプト: ${prompt.substring(0, 100)}...`);

    // プロンプト分析実行
    const presentationPlan = await analyzePresentationPrompt(prompt);

    context.log(`分析完了 - スライド数: ${presentationPlan.slides.length}`);

    const responseBody = {
      success: true,
      data: presentationPlan,
      message: "プレゼンテーション構成を分析しました"
    };

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(responseBody)
    };

  } catch (error: any) {
    context.log.error("プレゼンテーション分析エラー:", error);
    
    const errorBody = {
      error: "プレゼンテーション分析中にエラーが発生しました",
      details: error.message
    };

    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorBody)
    };
  }
}
