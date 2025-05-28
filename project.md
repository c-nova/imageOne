- [x] 要件整理
   * テキスト＋画像→新モデル GPT‑image‑1 で画像生成
   * フロントはブラウザから入力、生成結果を表示＆DL
   * バックエンドで OpenAI 呼び出し＆認証まわり
- [x] プロジェクト構成イメージ
   * infra/ …Bicep でリソース定義（Static Web Apps, Function, Key Vault, Storage）
   * api/ …Azure Functions (Node.js/TS)
   * app/ …React（or Vue）フロント
- [ ] .azure/ …azd 環境設定
- [ ] インフラ設計
   * Azure Static Web Apps: フロント＆API 連携
   * Azure Functions: GPT‑image‑1 呼び出しエンドポイント
   * Azure Key Vault: OpenAI エンドポイント＆キー格納
   * Azure Storage Blob: 生成画像の一時保存／配信
   * Managed Identity: Function から Key Vault への安全アクセス
- [ ] 認証・セキュリティ
   * Managed Identity で Key Vault 参照
   * Key Vault にクライアントシークレットを置かない
   * 必要最小限の RBAC（Function → Key Vault／Storage）
- [ ] 開発→デプロイワークフロー
   * azd up で infra プレビュー（azd provision --preview）→本番
   * ローカル：npm run start で SWA エミュレータ＆関数エミュレータ起動
   * CI/CD：GitHub Actions + Azure SWA 用 workflow (azure-static-web-apps-deploy)
- [ ] 関数実装のポイント
   * axios＋@azure/identity で Managed Identity トークン取得
   * OpenAI SDK（最新バージョンを参照）で GPT‑image‑1 呼び出し
   * 再試行ロジック（指数バックオフ）／エラーハンドリング
   * 生成画像は Blob へアップ → URL を返却
- [ ] フロント実装のポイント
   * 入力フォーム：テキスト＋ファイル選択（ドラッグ＆ドロップもアリ）
   * SWA API 呼び出し → 画像 URL を受け取ってプレビュー
   * ローディング／エラー表示
- [ ] モニタリング＆運用
   * App Insights（関数ロギング）
   * Storage ライフサイクル設定（生成画像の自動削除）
   * コスト監視／スケール設定
