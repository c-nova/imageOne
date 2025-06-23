// App-unified.tsx - 統合版: 画像生成・編集・動画生成の3モード切り替え
import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { getMsalConfig } from './msalConfig';
import { useVideoGeneration } from './hooks/useVideoGeneration';
import VideoGenerationPanel from './components/VideoGenerationPanel';
import { PromptHistoryItem } from './types';
import './App.css';

// アプリモード定義
type AppMode = 'generate' | 'edit' | 'video-generation';

function UnifiedApp() {
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    getMsalConfig().then(config => {
      setMsalInstance(new PublicClientApplication(config));
    });
  }, []);

  if (!msalInstance) return <div>MSAL初期化中だよ…</div>;

  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}

function AuthButtons() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [isLoginInProgress, setIsLoginInProgress] = useState(false);

  const handleLogin = async () => {
    if (isLoginInProgress) return; // 連打ガード
    setIsLoginInProgress(true);
    try {
      await instance.loginPopup();
    } catch (e) {
      console.error(e);
    }
    setIsLoginInProgress(false);
  };

  if (isAuthenticated) {
    return (
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000 
      }}>
        <button 
          onClick={() => instance.logoutPopup()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#d32f2f',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ログアウト
        </button>
      </div>
    );
  } else {
    return (
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000 
      }}>
        <button 
          onClick={handleLogin} 
          disabled={isLoginInProgress}
          style={{
            padding: '8px 16px',
            backgroundColor: '#1976d2',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: isLoginInProgress ? 0.6 : 1
          }}
        >
          {isLoginInProgress ? 'ログイン中...' : 'ログイン'}
        </button>
      </div>
    );
  }
}

function AppContent() {
  // State for prompt and histories
  const [prompt, setPrompt] = useState('');
  const [recommendedPrompt, setRecommendedPrompt] = useState('');
  const [size, setSize] = useState('1536x1024');
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  const [promptHistory, setPromptHistory] = useState<string[]>([]);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [loadingRec, setLoadingRec] = useState(false);
  const [loadingImg, setLoadingImg] = useState(false);
  const [uploadImagePreview, setUploadImagePreview] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<AppMode>('generate'); // 3つのモードに対応

  // 💾 ヒストリー関連の新しいstate
  const [userHistory, setUserHistory] = useState<PromptHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyStats, setHistoryStats] = useState<{
    totalCount: number;
    generateCount?: number;
    editCount?: number;
    favoriteStyles?: Array<{ style: string; count: number }>;
    lastGenerated?: string;
  } | null>(null);
  
  // 認証状態
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  
  // 認証トークンを取得する関数（useCallbackでメモ化）
  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (!isAuthenticated) return null;
    
    try {
      const accounts = instance.getAllAccounts();
      if (accounts.length === 0) return null;
      
      const tokenResponse = await instance.acquireTokenSilent({
        scopes: ['https://graph.microsoft.com/.default'],
        account: accounts[0]
      });
      
      return tokenResponse.accessToken;
    } catch (error) {
      console.error('トークン取得エラー:', error);
      return null;
    }
  }, [instance, isAuthenticated]);

  // 🎬 動画生成フック
  const videoHooks = useVideoGeneration();

  // 📸 カメラ設定のstate
  const [focalLength, setFocalLength] = useState(50);
  const [aperture, setAperture] = useState(2.8);
  const [colorTemp, setColorTemp] = useState(5500);
  const [imageStyle, setImageStyle] = useState('photo');

  // マスク関連のstate
  const [hasMaskContent, setHasMaskContent] = useState(false);

  // Blob画像取得
  const fetchBlobImages = useCallback(async (): Promise<Array<{url: string, blobPath?: string}>> => {
    if (!isAuthenticated) return [];
    
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('トークンがないためBlob画像取得をスキップ');
        return [];
      }
      
      const res = await fetch('/api/list', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('📊 Blob Storage画像データ:', data);
        return data.images || [];
      } else {
        console.error('Blob Storage画像取得エラー:', res.status);
        return [];
      }
    } catch (error) {
      console.error('Blob Storage画像取得エラー:', error);
      return [];
    }
  }, [isAuthenticated, getAuthToken]);

  // 統合画像履歴取得（Cosmos DB + Blob Storage）
  const fetchCombinedImageHistory = useCallback(async () => {
    if (!isAuthenticated) return;
    
    console.log('🔄 統合画像履歴取得開始...');
    
    try {
      // 1. Cosmos DBからユーザー履歴を取得
      const token = await getAuthToken();
      if (!token) {
        console.warn('トークンがないため統合履歴取得をスキップ');
        return;
      }
      
      // Cosmos DBから履歴を取得
      const historyRes = await fetch('/api/history', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      let cosmosImages: Array<{url: string, blobPath?: string}> = [];
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        console.log('📊 Cosmos DB履歴データ:', historyData);
        
        // 🔧 APIレスポンスの構造に合わせて修正
        const historyArray = historyData.history || [];
        
        // userHistoryステートを更新
        setUserHistory(historyArray);
        setHistoryStats({
          totalCount: historyArray.length,
          lastGenerated: historyArray.length > 0 ? historyArray[0].timestamp : undefined
        });
        
        // 画像URLとblobPathを抽出
        cosmosImages = historyArray
          .filter((item: any) => item.imageUrl)
          .map((item: any) => ({ url: item.imageUrl, blobPath: item.imageBlobPath }));
      } else {
        console.error('Cosmos DB履歴取得エラー:', historyRes.status);
      }
      
      // 2. Blob Storageから画像リストを取得
      const blobImages = await fetchBlobImages();
      
      console.log('📊 統合前の画像数:', {
        cosmosImages: cosmosImages.length,
        blobImages: blobImages.length
      });
      
      // 3. 重複排除して統合
      const allImages = [...cosmosImages, ...blobImages];
      const uniqueImages = Array.from(
        new Map(allImages.map(img => [img.url, img])).values()
      );
      
      console.log('📊 統合後の画像数:', uniqueImages.length);
      
      // 4. 画像履歴を更新
      const imageUrls = uniqueImages.map(img => img.url);
      setImageHistory(imageUrls);
      
      // 5. 最初の画像を選択
      if (imageUrls.length > 0 && !selectedImage) {
        setSelectedImage(imageUrls[0]);
      }
      
    } catch (error) {
      console.error('❌ 統合画像履歴取得エラー:', error);
    }
  }, [isAuthenticated, getAuthToken, fetchBlobImages, selectedImage]);

  // 認証状態変化時の処理
  useEffect(() => {
    if (isAuthenticated) {
      fetchCombinedImageHistory();
    } else {
      setUserHistory([]);
      setHistoryStats(null);
      setImageHistory([]); // 🔧 ログアウト時は画像履歴もクリア
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // 🔧 fetchCombinedImageHistoryを依存配列から削除して無限ループを防ぐ

  // サイズ変換関数
  const getSizeWH = (sizeStr: string) => {
    const [w, h] = sizeStr.split('x').map(Number);
    return { width: w, height: h };
  };

  // 推奨プロンプト生成
  const generateRecommended = async () => {
    setLoadingRec(true);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (!res.ok) {
        console.error('recommendation failed:', res.statusText);
        return;
      }
      const data = await res.json();
      setRecommendedPrompt(data.recommended);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRec(false);
    }
  };

  const useRecommendedPrompt = () => {
    setPrompt(recommendedPrompt);
    setRecommendedPrompt('');
  };

  // カメラ設定をプロンプトに統合する関数 📸
  const buildCameraPrompt = (basePrompt: string): string => {
    const cameraSettings = [
      `shot with ${focalLength}mm lens`,
      `aperture f/${aperture}`,
      `${colorTemp}K color temperature`
    ];
    
    // 画像スタイルに応じた suffix を決定
    const getStyleSuffix = () => {
      switch (imageStyle) {
        case 'photo':
          return ', professional photography';
        case 'snapshot':
          return ', casual snapshot photography';
        case 'portrait':
          return ', professional portrait photography';
        case 'cinematic':
          return ', cinematic photography, film grain';
        case '3dcg':
          return ', 3D rendered, photorealistic 3D CG';
        case 'digital':
          return ', digital art, concept art style';
        case 'concept':
          return ', concept art, matte painting';
        case 'photorealistic':
          return ', photorealistic render, unreal engine';
        case 'anime':
          return ', anime style, cel shading';
        case 'manga':
          return ', manga style, black and white manga art';
        case 'ghibli':
          return ', Studio Ghibli style, Miyazaki style';
        case 'character':
          return ', character design, anime character';
        case 'oil':
          return ', oil painting, classical painting';
        case 'watercolor':
          return ', watercolor painting, traditional watercolor';
        case 'sketch':
          return ', pencil sketch, hand drawn';
        case 'impressionist':
          return ', impressionist painting, impressionism';
        default:
          return ', professional photography';
      }
    };
    
    const styleSuffix = getStyleSuffix();
    const cameraString = cameraSettings.join(', ');
    
    return basePrompt.trim() 
      ? `${basePrompt}, ${cameraString}${styleSuffix}`
      : `${cameraString}${styleSuffix}`;
  };

  // 画像生成
  const generateImage = async () => {
    if (loadingImg) {
      console.log('🚫 既に処理中のため、重複リクエストをブロック');
      return;
    }
    
    console.log('🚀 generateImage開始 - モード:', mode);
    setLoadingImg(true);
    
    try {
      if (!isAuthenticated) {
        alert('画像生成にはログインが必要です');
        return;
      }
      
      const token = await getAuthToken();
      if (!token) {
        alert('認証トークンの取得に失敗しました。再ログインしてください。');
        return;
      }
      
      let res: Response;
      if (mode === 'generate') {
        // 画像生成
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: buildCameraPrompt(prompt),
            originalPrompt: prompt,
            cameraSettings: {
              focalLength,
              aperture,
              colorTemp,
              imageStyle
            },
            size
          })
        });
      } else if (mode === 'edit') {
        // 画像編集 - 実装は後で追加
        alert('画像編集機能は実装中です');
        return;
      } else {
        alert('不正なモードです');
        return;
      }
      
      if (!res.ok) {
        throw new Error(`API Error: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.imageUrl) {
        // 画像履歴に追加
        setImageHistory(prev => [data.imageUrl, ...prev]);
        setSelectedImage(data.imageUrl);
        
        // 統合履歴を再取得
        await fetchCombinedImageHistory();
        
        console.log('✅ 新しい画像の表示完了');
      }
      
    } catch (e) {
      console.error('❌ 画像生成失敗', e);
      alert('画像生成でエラーが発生しました: ' + e);
    } finally {
      console.log('🏁 generateImage処理完了');
      setLoadingImg(false);
    }
  };

  // ログインしてなければモーダル表示
  if (!isAuthenticated) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <h2>ログインが必要だよ！</h2>
          <p>このアプリを使うにはMicrosoft Entra IDでログインしてね！</p>
          <button className="login-modal-btn" onClick={() => instance.loginPopup()}>ログイン</button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="container" style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh', width: '100vw', boxSizing: 'border-box' }}>
        <div className="left" style={{ minWidth: 0, maxWidth: '100%', width: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          
          {/* 🎯 モード切替タブ（ヘッダー形式） */}
          <div className="mode-tabs" style={{ 
            display: 'flex', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '0 0 20px 20px',
            padding: '20px 16px 16px 16px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* キラキラエフェクト */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)',
              animation: 'shimmer 3s infinite'
            }} />
            
            <button
              onClick={() => setMode('generate')}
              className={`mode-tab ${mode === 'generate' ? 'active' : ''}`}
              style={{
                background: mode === 'generate' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: mode === 'generate' ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                padding: '12px 24px',
                marginRight: '12px',
                fontWeight: mode === 'generate' ? 'bold' : '500',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                position: 'relative',
                zIndex: 2,
                boxShadow: mode === 'generate' ? '0 4px 15px rgba(255,255,255,0.2)' : 'none'
              }}
            >
              🎭 画像生成
            </button>
            
            <button
              onClick={() => setMode('edit')}
              className={`mode-tab ${mode === 'edit' ? 'active' : ''}`}
              style={{
                background: mode === 'edit' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: mode === 'edit' ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                padding: '12px 24px',
                marginRight: '12px',
                fontWeight: mode === 'edit' ? 'bold' : '500',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                position: 'relative',
                zIndex: 2,
                boxShadow: mode === 'edit' ? '0 4px 15px rgba(255,255,255,0.2)' : 'none'
              }}
            >
              🖼️ 画像編集
            </button>
            
            <button
              onClick={() => setMode('video-generation')}
              className={`mode-tab ${mode === 'video-generation' ? 'active' : ''}`}
              style={{
                background: mode === 'video-generation' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                border: mode === 'video-generation' ? '2px solid rgba(255,255,255,0.6)' : '2px solid rgba(255,255,255,0.2)',
                borderRadius: '12px',
                padding: '12px 24px',
                fontWeight: mode === 'video-generation' ? 'bold' : '500',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)',
                position: 'relative',
                zIndex: 2,
                boxShadow: mode === 'video-generation' ? '0 4px 15px rgba(255,255,255,0.2)' : 'none'
              }}
            >
              🎬 動画生成
            </button>
          </div>

          <div className="top">
            {/* 🎭 画像生成モード */}
            {mode === 'generate' && (
              <>
                <textarea
                  placeholder="Promptを入力"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                />
                <button onClick={generateRecommended} disabled={loadingRec}>推奨プロンプト生成</button>
                {loadingRec && <div className="loading-bar"></div>}
                {recommendedPrompt && (
                  <div className="recommend-wrapper">
                    <div className="recommendation">{recommendedPrompt}</div>
                    <button onClick={useRecommendedPrompt}>推奨プロンプトを利用</button>
                  </div>
                )}
                <select value={size} onChange={e => setSize(e.target.value)}>
                  <option value="1024x1024">1024 × 1024</option>
                  <option value="1536x1024">1536 × 1024</option>
                  <option value="1024x1536">1024 × 1536</option>
                </select>
                
                {/* 📸 カメラ設定UI */}
                <div className="camera-settings" style={{ 
                  margin: '16px 0', 
                  padding: '16px', 
                  background: '#f8f9fa', 
                  borderRadius: '8px',
                  border: '1px solid #e0e0e0'
                }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#333', fontWeight: 'bold' }}>
                    📸 カメラ設定 (プロフェッショナル写真パラメータ)
                  </h4>
                  
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {/* 画像スタイル選択 */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        🎨 画像スタイル
                      </label>
                      <select 
                        value={imageStyle} 
                        onChange={e => setImageStyle(e.target.value)}
                        style={{ 
                          width: '100%', 
                          padding: '4px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid #ccc',
                          fontSize: '12px'
                        }}
                      >
                        <optgroup label="📸 写真系">
                          <option value="photo">Ultra Realistic Photo (超精細な写真調)</option>
                          <option value="snapshot">Casual Snapshot (スナップ写真調)</option>
                          <option value="portrait">Portrait Photography (ポートレート写真)</option>
                          <option value="cinematic">Cinematic Photography (映画的写真)</option>
                        </optgroup>
                        <optgroup label="🎨 CG・デジタルアート系">
                          <option value="3dcg">3D Rendered (3D CG調)</option>
                          <option value="digital">Digital Art (デジタルアート)</option>
                          <option value="concept">Concept Art (コンセプトアート)</option>
                          <option value="photorealistic">Photorealistic Render (フォトリアル)</option>
                        </optgroup>
                        <optgroup label="🎭 アニメ・マンガ系">
                          <option value="anime">Anime Style (アニメ調)</option>
                          <option value="manga">Manga Style (マンガ調)</option>
                          <option value="ghibli">Studio Ghibli Style (ジブリ風)</option>
                          <option value="character">Character Design (キャラデザ)</option>
                        </optgroup>
                        <optgroup label="🖼️ 絵画・アート系">
                          <option value="oil">Oil Painting (油絵)</option>
                          <option value="watercolor">Watercolor (水彩画)</option>
                          <option value="sketch">Sketch Drawing (スケッチ)</option>
                          <option value="impressionist">Impressionist (印象派風)</option>
                        </optgroup>
                      </select>
                    </div>
                    
                    {/* 焦点距離スライダー */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        焦点距離: {focalLength}mm
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="200"
                        value={focalLength}
                        onChange={e => setFocalLength(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                        10mm (超広角) ← → 200mm (望遠)
                      </div>
                    </div>
                    
                    {/* F値スライダー */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        絞り値 (F値): f/{aperture}
                      </label>
                      <input
                        type="range"
                        min="2"
                        max="10"
                        step="0.1"
                        value={aperture}
                        onChange={e => setAperture(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                        f/2 (ボケ大) ← → f/10 (パンフォーカス)
                      </div>
                    </div>
                    
                    {/* 色温度スライダー */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                        色温度: {colorTemp}K
                      </label>
                      <input
                        type="range"
                        min="2000"
                        max="10000"
                        step="100"
                        value={colorTemp}
                        onChange={e => setColorTemp(Number(e.target.value))}
                        style={{ width: '100%' }}
                      />
                      <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                        2000K (暖色・夕焼け) ← → 10000K (寒色・青空)
                      </div>
                    </div>
                  </div>
                </div>
                
                <button onClick={generateImage} disabled={loadingImg}>画像生成</button>
                {loadingImg && <div className="loading-bar"></div>}
              </>
            )}

            {/* 🖼️ 画像編集モード */}
            {mode === 'edit' && (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <h2>🖼️ 画像編集モード</h2>
                <p>画像編集機能は現在実装中です。</p>
                <p>近日中に高度なマスク編集機能を追加予定です！</p>
              </div>
            )}

            {/* 🎬 動画生成モード */}
            {mode === 'video-generation' && (
              <VideoGenerationPanel
                videoPrompt={videoHooks.videoPrompt}
                setVideoPrompt={videoHooks.setVideoPrompt}
                videoAspectRatio={videoHooks.videoAspectRatio}
                setVideoAspectRatio={videoHooks.setVideoAspectRatio}
                videoResolution={videoHooks.videoResolution}
                setVideoResolution={videoHooks.setVideoResolution}
                videoDuration={videoHooks.videoDuration}
                setVideoDuration={videoHooks.setVideoDuration}
                videoVariation={videoHooks.videoVariation}
                setVideoVariation={videoHooks.setVideoVariation}
                videoLoading={videoHooks.videoLoading}
                loadingRec={videoHooks.loadingRec}
                recommendedPrompt={videoHooks.recommendedPrompt}              onVideoGenerate={videoHooks.handleVideoGenerate}
              onGenerateRecommended={videoHooks.generateRecommendedVideo}
                onUseRecommendedPrompt={videoHooks.useRecommendedPrompt}
              />
            )}
          </div>

          {/* プレビューエリア */}
          <div className="bottom" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
            {mode === 'video-generation' ? (
              // 動画モードの場合はビデオプレビュー
              <div className="video-preview-wrapper" style={{ width: '100%', height: '100%', maxWidth: '1024px', maxHeight: '600px', margin: '0 auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {videoHooks.selectedVideo?.videoUrl ? (
                  <video 
                    src={videoHooks.selectedVideo.videoUrl}
                    controls
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      maxWidth: '100%', 
                      maxHeight: '100%',
                      borderRadius: '12px',
                      boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                    }}
                  />
                ) : (
                  <div style={{ 
                    width: '100%', 
                    height: '400px', 
                    background: '#f8f9fa',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666',
                    fontSize: '18px'
                  }}>
                    {videoHooks.videoLoading ? '🎬 動画生成中...' : '🎬 動画を生成してプレビューしよう！'}
                  </div>
                )}
              </div>
            ) : (
              // 画像モードの場合は画像プレビュー
              <div className="preview-wrapper" style={{ width: '100%', height: '100%', maxWidth: '1024px', maxHeight: '1024px', margin: '0 auto', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <div className="preview" style={{ position: 'relative', width: '90vw', height: '90vw', maxWidth: '1024px', maxHeight: '90vh', aspectRatio: '1/1', background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0001', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {selectedImage ? (
                    <img
                      src={selectedImage}
                      alt="プレビュー"
                      crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', left: 0, top: 0, zIndex: 1, borderRadius: 12, background: '#fff' }}
                    />
                  ) : (
                    <div style={{ color: '#999', fontSize: '18px' }}>
                      画像を生成してプレビューしよう！
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 履歴パネル */}
        <div className="prompt-history-pane" style={{ 
          minWidth: showHistoryPanel ? 350 : 60, 
          maxWidth: showHistoryPanel ? 450 : 60,
          width: showHistoryPanel ? '25vw' : '60px', 
          background: '#fafaff', 
          borderLeft: '1px solid #eee', 
          padding: showHistoryPanel ? 16 : 8, 
          boxSizing: 'border-box', 
          display: 'flex', 
          flexDirection: 'column',
          transition: 'all 0.3s ease',
          position: 'relative'
        }}>
          <button 
            onClick={() => setShowHistoryPanel(!showHistoryPanel)}
            style={{
              position: 'absolute',
              top: 8,
              left: showHistoryPanel ? 8 : 12,
              background: '#007acc',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              fontSize: 16,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              zIndex: 10
            }}
          >
            {showHistoryPanel ? '✕' : '📜'}
          </button>

          {showHistoryPanel && (
            <div style={{ marginTop: 50 }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#333' }}>
                {mode === 'video-generation' ? '🎬 動画履歴' : '💾 画像履歴'}
              </h3>
              
              {mode === 'video-generation' ? (
                // 動画履歴
                <div>
                  {videoHooks.videoHistory.length > 0 ? (
                    <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                      {videoHooks.videoHistory.map((video, idx) => (
                        <div 
                          key={video.id}
                          onClick={() => videoHooks.handleVideoSelect(video)}
                          style={{
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 12,
                            fontSize: 12,
                            cursor: 'pointer',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                          }}
                        >
                          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
                            {new Date(video.timestamp).toLocaleString()}
                          </div>
                          <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                            {video.jobStatus === 'completed' ? '✅' : '⏳'} {video.originalPrompt}
                          </div>
                          <div style={{ fontSize: 10, color: '#888' }}>
                            {video.videoSettings.width}x{video.videoSettings.height} • {video.videoSettings.n_seconds}秒
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#666', fontSize: 13 }}>
                      動画履歴はまだありません
                    </div>
                  )}
                </div>
              ) : (
                // 画像履歴
                <div>
                  {historyStats && (
                    <div style={{
                      background: '#e8f4fd',
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 16,
                      fontSize: 13,
                      color: '#333'
                    }}>
                      <div><strong>総生成数:</strong> {historyStats.totalCount}回</div>
                      {historyStats.lastGenerated && (
                        <div style={{ marginTop: 4 }}>
                          <strong>最新:</strong> {new Date(historyStats.lastGenerated).toLocaleDateString('ja-JP')}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {userHistory.length > 0 && (
                    <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: 8 }}>
                      {userHistory.map((item, idx) => (
                        <div 
                          key={item.id}
                          onClick={() => setPrompt(item.originalPrompt)}
                          style={{
                            background: '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: 8,
                            padding: 12,
                            marginBottom: 12,
                            fontSize: 12,
                            cursor: 'pointer',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                          }}
                        >
                          <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
                            {new Date(item.timestamp).toLocaleString()}
                          </div>
                          <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                            {item.originalPrompt}
                          </div>
                          {item.imageUrl && (
                            <img 
                              src={item.imageUrl}
                              alt="履歴画像"
                              style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 4 }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* サムネイルバー（画像モードのみ） */}
        {mode !== 'video-generation' && imageHistory.length > 0 && (
          <div className="thumbnails-bar" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: '1px solid #eee', zIndex: 10, padding: '8px 0', boxShadow: '0 -2px 8px #0001', display: 'flex', justifyContent: 'center' }}>
            <div className="thumbnails" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, overflowX: 'auto', padding: '0 16px', maxWidth: '100vw' }}>
              {imageHistory.map((url, idx) => (
                <div key={idx} className="thumbnail-wrapper" style={{ position: 'relative', width: 88, height: 88, flex: '0 0 auto' }}>
                  <img
                    src={url}
                    alt="サムネイル"
                    crossOrigin="anonymous"
                    style={{ width: 80, height: 80, objectFit: 'cover', border: selectedImage === url ? '2px solid #f0a' : '1px solid #ccc', borderRadius: 8, cursor: 'pointer' }}
                    onClick={() => setSelectedImage(url)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UnifiedApp;
