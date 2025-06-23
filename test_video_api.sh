#!/bin/bash

# 🎬 動画API テスト用CLIスクリプト
# Usage: ./test_video_api.sh [command] [args...]

API_BASE="http://localhost:7071/api"
HEADERS="Content-Type: application/json"

# 色付きログ
log_info() { echo -e "\033[34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[32m[SUCCESS]\033[0m $1"; }
log_error() { echo -e "\033[31m[ERROR]\033[0m $1"; }
log_warn() { echo -e "\033[33m[WARN]\033[0m $1"; }

# 🔑 Azure CLI認証トークン取得
get_auth_token() {
    if ! command -v az &> /dev/null; then
        log_warn "Azure CLIが見つかりません。認証なしで実行します"
        return 1
    fi
    
    log_info "Azure CLIから認証トークンを取得中..."
    
    local token_result
    token_result=$(az account get-access-token --scope https://graph.microsoft.com/.default 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        local access_token
        access_token=$(echo "$token_result" | jq -r '.accessToken' 2>/dev/null)
        
        if [ "$access_token" != "null" ] && [ -n "$access_token" ]; then
            HEADERS="Content-Type: application/json"$'\n'"Authorization: Bearer $access_token"
            log_success "認証トークン取得成功"
            return 0
        fi
    fi
    
    log_warn "認証トークン取得失敗。認証なしで実行します"
    return 1
}

# 🧪 開発環境用：認証バイパス
use_dev_auth() {
    log_info "開発環境モード：認証ヘッダーに開発用ユーザーIDを設定"
    HEADERS="Content-Type: application/json"$'\n'"X-Dev-User-Id: dev-user-123"
}

# 🔄 認証ヘッダー初期化
init_auth() {
    # 環境変数でモードを制御
    if [ "$DEV_MODE" = "true" ]; then
        use_dev_auth
    elif [ "$NO_AUTH" = "true" ]; then
        log_info "認証なしモード"
        # HEADERSはデフォルトのまま
    else
        # 通常モード：Azure CLIから認証取得を試行
        get_auth_token
    fi
}

# 🌐 curlコマンド用ヘッダー生成
get_curl_headers() {
    local auth_header=""
    if echo "$HEADERS" | grep -q "Authorization:"; then
        auth_header=$(echo "$HEADERS" | grep "Authorization:" | sed 's/^/-H "/' | sed 's/$/"/')
    fi
    echo "-H \"Content-Type: application/json\" $auth_header"
}

# ヘルプ表示
show_help() {
    echo "🎬 動画API テストCLI"
    echo ""
    echo "使用方法:"
    echo "  $0 [オプション] <コマンド> [引数...]"
    echo ""
    echo "🔑 認証オプション:"
    echo "  DEV_MODE=true $0 <コマンド>      # 開発モード（認証バイパス）"
    echo "  NO_AUTH=true $0 <コマンド>       # 認証なしモード"
    echo "  デフォルト: Azure CLIトークン自動取得"
    echo ""
    echo "📋 コマンド:"
    echo "  list-jobs                    # 動画ジョブ一覧を取得"
    echo "  get-job <job-id>             # 特定のジョブ詳細を取得"
    echo "  get-video <generation-id>    # 動画コンテンツを取得"
    echo "  get-thumbnail <generation-id> # サムネイルを取得"
    echo "  video-history                # 動画履歴を取得"
    echo "  test-download <job-id> <gen-id> <user-id> # downloadVideo APIをテスト"
    echo ""
    echo "💡 例:"
    echo "  $0 list-jobs"
    echo "  $0 get-job task_01jxhmyzx3fpz9k70ah5njen15"
    echo "  DEV_MODE=true $0 video-history"
    echo "  NO_AUTH=true $0 test-download job123 gen456 user789"
}

# 動画ジョブ一覧取得
list_jobs() {
    log_info "動画ジョブ一覧を取得中..."
    
    local curl_headers
    curl_headers=$(get_curl_headers)
    
    response=$(eval "curl -s -w \"HTTP_STATUS:%{http_code}\" -X GET $curl_headers \"$API_BASE/videoJobs\"")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "動画ジョブ一覧取得成功"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        log_error "動画ジョブ一覧取得失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# 特定ジョブ詳細取得
get_job() {
    local job_id="$1"
    if [ -z "$job_id" ]; then
        log_error "Job IDが指定されていません"
        return 1
    fi
    
    log_info "ジョブ詳細を取得中: $job_id"
    
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" \
        -X GET \
        -H "$HEADERS" \
        "$API_BASE/videoJobs/generations/jobs/$job_id")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "ジョブ詳細取得成功"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        log_error "ジョブ詳細取得失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# 動画コンテンツ取得
get_video() {
    local generation_id="$1"
    if [ -z "$generation_id" ]; then
        log_error "Generation IDが指定されていません"
        return 1
    fi
    
    log_info "動画コンテンツを取得中: $generation_id"
    
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" \
        -X GET \
        -H "$HEADERS" \
        "$API_BASE/videoJobs/generations/$generation_id/content/video")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "動画コンテンツ取得成功"
        log_info "Content-Type: $(curl -s -I "$API_BASE/videoJobs/generations/$generation_id/content/video" | grep -i content-type)"
    else
        log_error "動画コンテンツ取得失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# サムネイル取得
get_thumbnail() {
    local generation_id="$1"
    if [ -z "$generation_id" ]; then
        log_error "Generation IDが指定されていません"
        return 1
    fi
    
    log_info "サムネイルを取得中: $generation_id"
    
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" \
        -X GET \
        -H "$HEADERS" \
        "$API_BASE/videoJobs/generations/$generation_id/content/thumbnail")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "サムネイル取得成功"
        log_info "Content-Type: $(curl -s -I "$API_BASE/videoJobs/generations/$generation_id/content/thumbnail" | grep -i content-type)"
    else
        log_error "サムネイル取得失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# 動画履歴取得
video_history() {
    log_info "動画履歴を取得中..."
    
    local curl_headers
    curl_headers=$(get_curl_headers)
    
    response=$(eval "curl -s -w \"HTTP_STATUS:%{http_code}\" -X GET $curl_headers \"$API_BASE/videoHistory\"")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "動画履歴取得成功"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        log_error "動画履歴取得失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# downloadVideo APIテスト
test_download() {
    local job_id="$1"
    local generation_id="$2"
    local user_id="$3"
    
    if [ -z "$job_id" ] || [ -z "$generation_id" ] || [ -z "$user_id" ]; then
        log_error "Job ID, Generation ID, User IDすべてが必要です"
        return 1
    fi
    
    log_info "downloadVideo APIをテスト中..."
    log_info "Job ID: $job_id"
    log_info "Generation ID: $generation_id"
    log_info "User ID: $user_id"
    
    payload=$(cat <<EOF
{
    "jobId": "$job_id",
    "generationId": "$generation_id",
    "userId": "$user_id"
}
EOF
)
    
    local curl_headers
    curl_headers=$(get_curl_headers)
    
    response=$(eval "curl -s -w \"HTTP_STATUS:%{http_code}\" -X POST $curl_headers -d '$payload' \"$API_BASE/downloadVideo\"")
    
    http_status=$(echo "$response" | grep -o 'HTTP_STATUS:[0-9]*' | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" = "200" ]; then
        log_success "downloadVideo API成功"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        log_error "downloadVideo API失敗 (HTTP $http_status)"
        echo "$body"
    fi
}

# メイン処理
# 🚀 認証ヘッダー初期化
init_auth

case "$1" in
    "list-jobs")
        list_jobs
        ;;
    "get-job")
        get_job "$2"
        ;;
    "get-video")
        get_video "$2"
        ;;
    "get-thumbnail")
        get_thumbnail "$2"
        ;;
    "video-history")
        video_history
        ;;
    "test-download")
        test_download "$2" "$3" "$4"
        ;;
    "help"|"-h"|"--help"|"")
        show_help
        ;;
    *)
        log_error "不明なコマンド: $1"
        show_help
        exit 1
        ;;
esac
