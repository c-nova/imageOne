# Azure CLIでログイン（既にログイン済みなら何もしない）
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "Azureにログインしてないからaz loginするよ！"
  az login
fi

cd api

echo "🚀 APIサーバー起動スクリプト開始..."

# nvmを読み込み（Homebrewでインストールした場合）
echo "📦 nvmを読み込み中..."
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"  # This loads nvm
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"  # This loads nvm bash_completion

# 代替パス（curlでインストールした場合）
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# nvmコマンドが利用可能か確認
if command -v nvm > /dev/null 2>&1; then
    echo "✅ nvm が見つかりました"
    echo "🔄 Node.js v18に切り替え中..."
    nvm use 18
    if [ $? -eq 0 ]; then
        echo "✅ Node.js v18 に切り替え完了"
        node --version
    else
        echo "❌ Node.js v18への切り替えに失敗しました"
        exit 1
    fi
else
    echo "❌ nvmコマンドが見つかりません"
    echo "📋 現在のNode.jsバージョンを確認:"
    node --version
    echo "⚠️  Node.js v18でない場合は手動で切り替えてください"
fi

echo "🔨 TypeScriptコンパイル中..."
npx tsc
if [ $? -eq 0 ]; then
    echo "✅ TypeScriptコンパイル完了"
else
    echo "❌ TypeScriptコンパイルに失敗しました"
    exit 1
fi

echo "🎯 Azure Functions 起動中..."
func start --verbose

