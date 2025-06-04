import React, { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './msalConfig';
import './App.css';

// 💾 ヒストリーアイテムの型定義
interface PromptHistoryItem {
  id: string;
  userId: string;
  prompt: string;
  originalPrompt: string;
  cameraSettings: {
    focalLength: number;
    aperture: number;
    colorTemp: number;
    imageStyle: string;
  };
  imageUrl: string;
  imageBlobPath: string;
  operationType: 'generate' | 'edit';
  size: string;
  timestamp: string;
  metadata: {
    userAgent?: string;
    processingTime?: number;
    [key: string]: any;
  };
}

const msalInstance = new PublicClientApplication(msalConfig);

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
    return <button onClick={() => instance.logout()}>ログアウト</button>;
  } else {
    return <button onClick={handleLogin} disabled={isLoginInProgress}>ログイン</button>;
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
  const [mode, setMode] = useState<'generate' | 'edit'>('generate');
  
  // 💾 ヒストリー関連の新しいstate
  const [userHistory, setUserHistory] = useState<PromptHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyStats, setHistoryStats] = useState<{totalItems: number, lastGenerated?: string} | null>(null);
  
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
        scopes: [`${process.env.REACT_APP_CLIENT_ID}/.default`],
        account: accounts[0]
      });
      
      return tokenResponse.accessToken;
    } catch (error) {
      console.error('トークン取得エラー:', error);
      return null;
    }
  }, [isAuthenticated, instance]);

  // 💾 ヒストリーを取得する関数（useCallbackでメモ化）
  const fetchUserHistory = useCallback(async (limit: number = 20, offset: number = 0) => {
    if (!isAuthenticated) return;
    
    setHistoryLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('トークンがないためヒストリー取得をスキップ');
        return;
      }
      
      const res = await fetch(`/api/history?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log('📜 ヒストリー取得成功:', data);
        
        if (offset === 0) {
          // 新規取得の場合は全て置き換え
          setUserHistory(data.history || []);
        } else {
          // 追加読み込みの場合は追加
          setUserHistory(prev => [...prev, ...(data.history || [])]);
        }
        
        setHistoryStats(data.stats || null);
      } else {
        const errorText = await res.text();
        console.error('ヒストリー取得失敗:', res.status, errorText);
        
        // Cosmos DBが利用できない場合のメッセージ
        if (res.status === 500 && errorText.includes('Cosmos')) {
          console.warn('Cosmos DBが利用できません。ヒストリー機能は一時的に無効です。');
          setUserHistory([]);
          setHistoryStats(null);
        }
      }
    } catch (error) {
      console.error('ヒストリー取得エラー:', error);
      // ネットワークエラーの場合は履歴をクリア
      setUserHistory([]);
      setHistoryStats(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [isAuthenticated, getAuthToken]);

  // 💾 ヒストリーアイテムを削除する関数
  const deleteHistoryItem = async (historyId: string) => {
    if (!isAuthenticated) return;
    
    try {
      const token = await getAuthToken();
      if (!token) {
        alert('認証トークンの取得に失敗しました。');
        return;
      }
      
      const res = await fetch(`/api/history/${historyId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        console.log('🗑️ ヒストリーアイテム削除成功:', historyId);
        // ローカル状態からも削除
        setUserHistory(prev => prev.filter(item => item.id !== historyId));
        // 統計も更新
        if (historyStats) {
          setHistoryStats({
            ...historyStats,
            totalItems: Math.max(0, historyStats.totalItems - 1)
          });
        }
      } else {
        console.error('ヒストリーアイテム削除失敗:', await res.text());
        alert('履歴の削除に失敗しました。');
      }
    } catch (error) {
      console.error('ヒストリーアイテム削除エラー:', error);
      alert('履歴の削除中にエラーが発生しました。');
    }
  };

  // 💾 認証状態変化時にヒストリーを自動取得
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserHistory();
    } else {
      setUserHistory([]);
      setHistoryStats(null);
    }
  }, [isAuthenticated, fetchUserHistory]);
  
  const [lastEditImageBase64, setLastEditImageBase64] = useState<string | null>(null);
  const [lastEditError, setLastEditError] = useState<any>(null);
  // マスクcanvasサイズをstateで管理
  const [maskCanvasSize, setMaskCanvasSize] = useState<{width:number, height:number}>({width:1024, height:1024});
  // コンテンツフィルタエラー用state
  const [showContentFilterError, setShowContentFilterError] = useState<{show: boolean, message: string}>({show: false, message: ''});
  // マスクが描かれているかどうかを検出する state
  const [hasMaskContent, setHasMaskContent] = useState<boolean>(false);
  
  // カメラ設定用の状態変数 📸
  const [focalLength, setFocalLength] = useState<number>(50); // 10mm-200mm
  const [aperture, setAperture] = useState<number>(2.8); // f/2-f/10
  const [colorTemp, setColorTemp] = useState<number>(5500); // 2000K-10000K
  const [imageStyle, setImageStyle] = useState<string>('photo'); // 画像スタイル

  // sizeセレクトの値からwidth/heightを取得する関数
  const getSizeWH = (sizeStr: string) => {
    const [w, h] = sizeStr.split('x').map(Number);
    return { width: w, height: h };
  };

  // マスクの内容をチェックする関数
  const checkMaskContent = () => {
    if (!canvasRef.current) {
      setHasMaskContent(false);
      return;
    }
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      setHasMaskContent(false);
      return;
    }
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // 🔍 より厳密なマスク検知：真っ白（255,255,255）以外を検出
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      
      // 完全に透明なピクセルは無視
      if (a === 0) continue;
      
      // 真っ白（255,255,255）でないピクセルがあればマスクありと判定
      if (r !== 255 || g !== 255 || b !== 255) {
        console.log(`🖌️ マスク検出: RGB(${r},${g},${b}) at position ${Math.floor((i/4) % canvasRef.current.width)},${Math.floor((i/4) / canvasRef.current.width)}`);
        setHasMaskContent(true);
        return;
      }
    }
    console.log('🎨 マスクなし: すべてのピクセルが白(255,255,255)です');
    setHasMaskContent(false);
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
          return ', 3D rendered, high quality CGI';
        case 'digital':
          return ', digital art, high resolution';
        case 'concept':
          return ', concept art, detailed illustration';
        case 'photorealistic':
          return ', photorealistic rendering, raytracing';
        case 'anime':
          return ', anime style, cel shading';
        case 'manga':
          return ', manga illustration, black and white';
        case 'ghibli':
          return ', Studio Ghibli style, hand-drawn animation';
        case 'character':
          return ', character design, illustration';
        case 'oil':
          return ', oil painting, canvas texture';
        case 'watercolor':
          return ', watercolor painting, soft colors';
        case 'sketch':
          return ', pencil sketch, hand-drawn';
        case 'impressionist':
          return ', impressionist painting, visible brushstrokes';
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

  // useEffectなどのHooksはここで全部呼ぶ！
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/list');
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.urls)) {
          setImageHistory(data.urls);
          if (data.urls.length > 0) setSelectedImage(data.urls[0]);
        }
      } catch (e) {
        console.error('Failed to fetch blob list', e);
      }
    })();
  }, []);

  // sizeセレクト変更時にmaskCanvasSizeも必ずリサイズ
  useEffect(() => {
    setMaskCanvasSize(getSizeWH(size));
  }, [size]);

  // Generate recommended prompt using GPT-4o
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
  
  // Generate image and update histories
  // 画像生成・img2img・マスク送信（モードごとに送信方式を分岐！）
  const generateImage = async () => {
    // 連打防止ガード
    if (loadingImg) {
      console.log('🚫 既に処理中のため、重複リクエストをブロック');
      return;
    }
    
    console.log('🚀 generateImage開始 - モード:', mode);
    setLoadingImg(true);
    
    // 変数を関数の最初で宣言（スコープ問題回避）
    let actualSize: string = '1024x1024';
    let imageBase64: string | null = null;
    let maskBase64: string | null = null;
    
    try {
      let res: Response | undefined;
      if (mode === 'generate') {
        // 認証チェック
        if (!isAuthenticated) {
          alert('画像生成にはログインが必要です');
          return;
        }
        
        const token = await getAuthToken();
        if (!token) {
          alert('認証トークンの取得に失敗しました。再ログインしてください。');
          return;
        }
        
        // 画像生成は/api/generateにapplication/jsonで送信！
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: buildCameraPrompt(prompt), // 📸 カメラ設定を組み込んだプロンプト
            originalPrompt: prompt, // 元のユーザー入力プロンプト
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
        console.log('🖼️ 画像編集モード開始');
        // 画像編集は/api/editにapplication/json＋base64で送信！
        // まず元画像のアスペクト比を検出してサイズを決定
        actualSize = size; // デフォルトは選択されたサイズ
        
        // --- canvas生成＆リサイズ描画 ---
        if (uploadImagePreview) {
          // 元画像のサイズを検出
          const img = new window.Image();
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const originalWidth = img.width;
              const originalHeight = img.height;
              console.log(`📐 元画像サイズ: ${originalWidth}x${originalHeight}`);
              
              // アスペクト比に基づいて動的にサイズを計算（バックエンドと同じロジック）
              if (originalWidth === originalHeight) {
                // 正方形の場合
                actualSize = '1024x1024';
                console.log('🔲 正方形の画像なので1024x1024で編集');
              } else if (originalWidth > originalHeight) {
                // 横長の場合：高さを1024に固定し、幅をアスペクト比で計算
                const newWidth = Math.round(1024 * (originalWidth / originalHeight));
                actualSize = `${newWidth}x1024`;
                console.log(`📏 横長の画像なので${actualSize}で編集（元:${originalWidth}x${originalHeight}）`);
              } else {
                // 縦長の場合：幅を1024に固定し、高さをアスペクト比で計算
                const newHeight = Math.round(1024 * (originalHeight / originalWidth));
                actualSize = `1024x${newHeight}`;
                console.log(`📐 縦長の画像なので${actualSize}で編集（元:${originalWidth}x${originalHeight}）`);
              }
              resolve();
            };
            img.src = uploadImagePreview;
          });
          
          // actualSizeに基づいてcanvasサイズを決定
          let width = 1024, height = 1024;
          if (actualSize === '1536x1024') { width = 1536; height = 1024; }
          else if (actualSize === '1024x1536') { width = 1024; height = 1536; }
          
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            let imgLoadError = false;
            await new Promise<void>((resolve, reject) => {
              img.onload = () => {
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);
                // --- 画像内容チェック（全部透明/白なら警告） ---
                const imageData = ctx.getImageData(0, 0, width, height);
                let hasContent = false;
                for (let i = 0; i < imageData.data.length; i += 4) {
                  const alpha = imageData.data[i + 3];
                  if (alpha > 0) {
                    hasContent = true;
                    break;
                  }
                }
                if (!hasContent) {
                  alert('アップロード画像が空（透明or真っ白）だよ！CORSエラーや画像内容を確認して！');
                  imgLoadError = true;
                }
                resolve();
              };
              img.onerror = () => {
                alert('画像の読み込みに失敗したよ！（CORSエラーの可能性大）\nBlob StorageのCORS設定を確認して！');
                imgLoadError = true;
                resolve();
              };
              img.src = uploadImagePreview;
            });
            if (imgLoadError) {
              setLoadingImg(false);
              return;
            }
            // --- PNGをbase64化 ---
            imageBase64 = await new Promise<string | null>(resolve => tempCanvas.toBlob(b => {
              if (!b) return resolve(null);
              const reader = new FileReader();
              reader.onloadend = () => {
                // data:image/png;base64,xxxx なのでカンマ以降を抽出
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(b);
            }, 'image/png'));
          }
        }
        if (!imageBase64) {
          alert('画像編集には元画像が必要だよ！（PNG変換失敗）');
          setLoadingImg(false);
          return;
        }
        // マスクもbase64化（マスクは常に送信！canvasがあればOK）
        // 💡 重要：マスクcanvasを actualSize と同じサイズにリサイズしてから送信！
        let maskHasContent = false;
        if (canvasRef.current) {
          // まず現在のマスクcanvasに内容があるかチェック
          const currentCtx = canvasRef.current.getContext('2d', { willReadFrequently: true });
          if (currentCtx) {
            const currentImageData = currentCtx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
            // 🔍 統一されたマスク検知ロジック：真っ白以外のピクセルがあるかチェック
            for (let i = 0; i < currentImageData.data.length; i += 4) {
              const r = currentImageData.data[i];
              const g = currentImageData.data[i + 1];
              const b = currentImageData.data[i + 2];
              const a = currentImageData.data[i + 3];
              
              // 完全に透明なピクセルは無視
              if (a === 0) continue;
              
              // 真っ白（255,255,255）でないピクセルがあればマスクありと判定
              if (r !== 255 || g !== 255 || b !== 255) {
                maskHasContent = true;
                console.log(`🖌️ 編集API用マスク検出: RGB(${r},${g},${b})`);
                break;
              }
            }
          }
          
          // マスクを actualSize と同じサイズにリサイズしてからbase64化
          const [actualWidth, actualHeight] = actualSize.split('x').map(Number);
          console.log(`🎭 マスクcanvasを ${actualSize} にリサイズして送信`);
          
          const resizedMaskCanvas = document.createElement('canvas');
          resizedMaskCanvas.width = actualWidth;
          resizedMaskCanvas.height = actualHeight;
          const resizedCtx = resizedMaskCanvas.getContext('2d', { willReadFrequently: true });
          
          if (resizedCtx) {
            // 元のマスクcanvasを actualSize にリサイズして描画
            resizedCtx.clearRect(0, 0, actualWidth, actualHeight);
            resizedCtx.drawImage(canvasRef.current, 0, 0, actualWidth, actualHeight);
            
            // 🎨 実験：マスクを逆転してテスト（白→透明、黒→黒）
            const imageData = resizedCtx.getImageData(0, 0, actualWidth, actualHeight);
            
            // === デバッグ用：反転前の状態をログ出力 ===
            let blackPixels = 0, whitePixels = 0, totalPixels = imageData.data.length / 4;
            let sampleCount = 0;
            for (let i = 0; i < imageData.data.length; i += 4) {
              const r = imageData.data[i];
              const g = imageData.data[i + 1];
              const b = imageData.data[i + 2];
              const brightness = (r + g + b) / 3;
              if (brightness < 128) {
                blackPixels++;
                if (sampleCount < 3) {
                  console.log(`📝 黒ピクセル発見 at (${(i/4)%actualWidth}, ${Math.floor((i/4)/actualWidth)}) brightness=${brightness} → 黒のまま保持`);
                  sampleCount++;
                }
              } else whitePixels++;
            }
            console.log(`🔍 マスク変換前: 黒ピクセル=${blackPixels}, 白ピクセル=${whitePixels}, 総ピクセル=${totalPixels}`);
            console.log(`📊 白い部分（編集対象予定）の割合: ${(whitePixels/totalPixels*100).toFixed(1)}%`);
            
            for (let i = 0; i < imageData.data.length; i += 4) {
              const r = imageData.data[i];
              const g = imageData.data[i + 1];
              const b = imageData.data[i + 2];
              const brightness = (r + g + b) / 3;
              
              if (brightness >= 128) {
                // 🔥 実験：白い部分→透明に（編集対象）
                imageData.data[i + 3] = 0; // alpha = 0
              } else {
                // 🔥 実験：黒い部分→黒のまま（保持）
                imageData.data[i] = 0;     // R = 0
                imageData.data[i + 1] = 0; // G = 0
                imageData.data[i + 2] = 0; // B = 0
                imageData.data[i + 3] = 255; // alpha = 255
              }
            }
            resizedCtx.putImageData(imageData, 0, 0);
            
            // リサイズ＆反転したマスクcanvasをbase64化
            maskBase64 = await new Promise<string | null>(resolve => resizedMaskCanvas.toBlob(b => {
              if (!b) return resolve(null);
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(b);
            }, 'image/png'));
          }
        }
        // マスクが空の場合は全体編集用の透明マスクを生成
        if (!maskHasContent) {
          console.log('🎨 マスクが描かれていないため、画像全体を編集するための透明マスクを生成');
          
          // 完全透明な画像を生成（全体が編集対象）
          const [actualWidth, actualHeight] = actualSize.split('x').map(Number);
          const transparentMaskCanvas = document.createElement('canvas');
          transparentMaskCanvas.width = actualWidth;
          transparentMaskCanvas.height = actualHeight;
          const transparentCtx = transparentMaskCanvas.getContext('2d', { willReadFrequently: true });
          
          if (transparentCtx) {
            // 完全透明で塗りつぶし（全体が編集対象）
            transparentCtx.clearRect(0, 0, actualWidth, actualHeight);
            // 透明なImageDataを作成
            const imageData = transparentCtx.createImageData(actualWidth, actualHeight);
            for (let i = 0; i < imageData.data.length; i += 4) {
              imageData.data[i] = 0;     // R = 0
              imageData.data[i + 1] = 0; // G = 0
              imageData.data[i + 2] = 0; // B = 0
              imageData.data[i + 3] = 0; // alpha = 0 (完全透明)
            }
            transparentCtx.putImageData(imageData, 0, 0);
            
            // 透明マスクをbase64化
            maskBase64 = await new Promise<string | null>(resolve => transparentMaskCanvas.toBlob(b => {
              if (!b) return resolve(null);
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
              };
              reader.readAsDataURL(b);
            }, 'image/png'));
          }
        } else {
          console.log('🖌️ マスクが描かれているため、指定範囲のみを編集対象として送信します');
        }
        // ========== ここに追加！API送信直前のデバッグログ ==========
        console.log('=== API送信直前のサイズチェック ===');
        console.log('size選択値:', size);
        console.log('maskCanvasSize:', maskCanvasSize);
        console.log('canvasRef.current.width:', canvasRef.current?.width, 'height:', canvasRef.current?.height);
        // imageBase64のピクセルサイズを確認
        if (imageBase64) {
          const img = new window.Image();
          img.onload = () => {
            console.log('★★★ imageBase64 actual size:', img.width, 'x', img.height);
          };
          img.src = 'data:image/png;base64,' + imageBase64;
        }
        // maskBase64のピクセルサイズを確認
        if (maskBase64) {
          const img = new window.Image();
          img.onload = () => {
            console.log('★★★ maskBase64 actual size:', img.width, 'x', img.height);
          };
          img.src = 'data:image/png;base64,' + maskBase64;
        }
        console.log('maskBase64が存在?:', !!maskBase64);
        console.log('🎯 送信予定サイズ:', actualSize, '(元画像のアスペクト比に基づく)');
        console.log('📤 編集APIに送信: actualSize のみ、size は送信しない');
        // ========== デバッグログここまで ==========
        
        // 認証チェック
        if (!isAuthenticated) {
          alert('画像編集にはログインが必要です');
          return;
        }
        
        const token = await getAuthToken();
        if (!token) {
          alert('認証トークンの取得に失敗しました。再ログインしてください。');
          return;
        }
        
        res = await fetch('/api/edit', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            prompt: buildCameraPrompt(prompt), // 📸 カメラ設定を組み込んだプロンプト
            originalPrompt: prompt, // 元のユーザー入力プロンプト
            cameraSettings: {
              focalLength,
              aperture,
              colorTemp,
              imageStyle
            },
            // 編集モードではactualSizeのみ送信（sizeは送信しない）
            actualSize, // 元画像のアスペクト比に基づくサイズ
            imageBase64,
            maskBase64
          })
        });
      } else {
        alert('不正なモードだよ！');
        setLoadingImg(false);
        return;
      }
      console.log('📡 APIリクエスト送信完了、レスポンス待機中...');
      if (!res) {
        console.error('❌ APIリクエストが実行されませんでした');
        alert('APIリクエストが実行されなかったよ！');
        setLoadingImg(false);
        return;
      }
      
      console.log('📨 レスポンス受信:', res.status, res.statusText);
      
      // レスポンスbodyを一度だけ読み取り
      const responseText = await res.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
        console.log('📋 レスポンスデータ:', data);
      } catch (parseError) {
        console.error('JSONパースエラー:', parseError);
        console.error('生レスポンステキスト:', responseText);
        data = { error: responseText };
      }
      
      // 🔍 400エラーの場合は詳細な診断ログを出力
      if (res.status === 400) {
        console.error('🚨 400 Bad Request 詳細診断:');
        console.error('リクエストURL:', res.url);
        console.error('レスポンスヘッダー:', Array.from(res.headers.entries()));
        console.error('生レスポンステキスト:', responseText);
        console.error('パース済みエラーデータ:', data);
        
        // 400エラーの詳細分析
        console.error('❌ 400エラー詳細分析:', {
          status: res.status,
          statusText: res.statusText,
          contentType: res.headers.get('content-type'),
          errorData: data,
          requestSize: JSON.stringify({
            prompt,
            actualSize,
            imageBase64: imageBase64 ? `${imageBase64.length} chars` : 'null',
            maskBase64: maskBase64 ? `${maskBase64.length} chars` : 'null'
          })
        });
      }
      
      // 🔍 エラー時の詳細ログ
      if (!res.ok) {
        console.error('❌ APIエラー詳細:', {
          status: res.status,
          statusText: res.statusText,
          errorData: data,
          url: res.url
        });
      }
      
      if (!res.ok) {
        // コンテンツフィルタエラーかどうかをチェック
        if (data.errorType === 'content_filter') {
          setShowContentFilterError({
            show: true,
            message: data.error || 'コンテンツポリシーに違反する内容が検出されました。'
          });
        } else {
          // 通常のエラーは従来通りalertで表示
          console.error('画像編集APIエラー:', data);
          let alertMsg = '画像編集APIエラー:\n' + JSON.stringify(data, null, 2);
          if (data.errorDetails) {
            alertMsg += '\n--- errorDetails ---\n' + JSON.stringify(data.errorDetails, null, 2);
          }
          alert(alertMsg);
        }
        // --- エラー時もbase64画像があれば保存 ---
        if (data.imageBase64) {
          setLastEditImageBase64(data.imageBase64);
        } else {
          setLastEditImageBase64(null);
        }
        setLastEditError(data);
        setLoadingImg(false);
        return;
      }
      
      console.log('✅ APIリクエスト成功！データ処理開始');
      // 🔧 編集APIと生成APIの両方に対応（editはimageUrl、generateはurl）
      const imageUrl = data.imageUrl || data.url;
      if (imageUrl) {
        console.log('🖼️ 新しい画像URL受信:', imageUrl);
        setImageHistory([imageUrl, ...imageHistory]);
        setPromptHistory([prompt, ...promptHistory]);
        setSelectedImage(imageUrl);
        
        // 💾 ヒストリーを更新（最新の画像生成が履歴に反映される）
        console.log('📜 ヒストリーを更新中...');
        setTimeout(() => fetchUserHistory(), 1000); // 1秒後にヒストリーを再取得
      } else if (data.imageUrl) {
        console.log('🖼️ 新しい画像URL受信(imageUrl):', data.imageUrl);
        setImageHistory([data.imageUrl, ...imageHistory]);
        setPromptHistory([prompt, ...promptHistory]);
        setSelectedImage(data.imageUrl);
        
        // 💾 ヒストリーを更新（最新の画像生成が履歴に反映される）
        console.log('📜 ヒストリーを更新中...');
        setTimeout(() => fetchUserHistory(), 1000); // 1秒後にヒストリーを再取得
      }
      // --- 成功時もbase64画像があれば保存 ---
      if (data.imageBase64) {
        console.log('💾 base64画像データを保存');
        setLastEditImageBase64(data.imageBase64);
      } else {
        setLastEditImageBase64(null);
      }
      setLastEditError(null);
      
      // 🎨 編集完了後の後処理
      if (mode === 'edit') {
        console.log('🧹 画像編集完了！マスクをクリアして次の編集に備えます');
        clearMask(); // マスクを自動クリア
        // 注意: img2img画像はそのまま保持（編集結果と比較できるように）
      }
      
      // ✅ 新しい画像はすでにsetImageHistory/setSelectedImageで設定済み
      // 画像リスト更新は不要（競合を避けるため削除）
      console.log('✅ 新しい画像の表示完了（リスト更新はスキップ）');
    } catch (e) {
      console.error('❌ 画像生成失敗', e);
      alert('画像生成でエラーが発生しました: ' + e);
    } finally {
      console.log('🏁 generateImage処理完了 - loadingImg状態をfalseに設定');
      setLoadingImg(false);
    }
  };

  // 画像アップロード時のプレビュー生成
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        // 元画像のサイズを検出してマスクcanvasサイズを決定
        const img = new window.Image();
        img.onload = () => {
          const originalWidth = img.width;
          const originalHeight = img.height;
          console.log(`📐 元画像サイズ: ${originalWidth}x${originalHeight}`);
          
          // アスペクト比に基づいて動的にマスクcanvasサイズを決定（編集時と同じロジック）
          let maskWidth = 1024, maskHeight = 1024;
          if (originalWidth === originalHeight) {
            // 正方形の場合
            maskWidth = 1024;
            maskHeight = 1024;
            console.log('🔲 正方形の画像なのでマスクcanvasを1024x1024で設定');
          } else if (originalWidth > originalHeight) {
            // 横長の場合：高さを1024に固定し、幅をアスペクト比で計算
            maskWidth = Math.round(1024 * (originalWidth / originalHeight));
            maskHeight = 1024;
            console.log(`📏 横長の画像なのでマスクcanvasを${maskWidth}x${maskHeight}で設定（元:${originalWidth}x${originalHeight}）`);
          } else {
            // 縦長の場合：幅を1024に固定し、高さをアスペクト比で計算
            maskWidth = 1024;
            maskHeight = Math.round(1024 * (originalHeight / originalWidth));
            console.log(`📐 縦長の画像なのでマスクcanvasを${maskWidth}x${maskHeight}で設定（元:${originalWidth}x${originalHeight}）`);
          }
          
          // プレビュー用にsizeセレクトのピクセル数でリサイズ
          const { width, height } = getSizeWH(size);
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            tempCanvas.toBlob(blob => {
              if (!blob) return;
              const r = new FileReader();
              r.onloadend = () => {
                setUploadImagePreview(r.result as string);
                // 実際のアスペクト比に基づいてマスクcanvasサイズを設定
                setMaskCanvasSize({ width: maskWidth, height: maskHeight });
                console.log(`🎨 マスクcanvasサイズを${maskWidth}x${maskHeight}に設定完了`);
              };
              r.readAsDataURL(blob);
            }, 'image/png');
          }
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      setUploadImagePreview('');
      setMaskCanvasSize(getSizeWH(size));
    }
  };

  // 推奨プロンプトを入力欄にセットする
  const useRecommendedPrompt = () => {
    const cleaned = recommendedPrompt.replace(/[「」『』“”"']/g, '');
    setPrompt(cleaned);
  };



  // マスク描画イベント
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    // --- canvas外クリックは無視（小数点誤差も考慮してMath.floor/ceilで判定） ---
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (
      x < 0 ||
      x >= rect.width ||
      y < 0 ||
      y >= rect.height
    ) {
      return;
    }
    setDrawing(true);
    drawOnCanvas(e);
  };
  const handleCanvasMouseUp = () => {
    setDrawing(false);
    // マスクの描画が終わったらチェック
    setTimeout(checkMaskContent, 50);
  };
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (
      x < 0 ||
      x >= rect.width ||
      y < 0 ||
      y >= rect.height
    ) {
      setDrawing(false);
      return;
    }
    drawOnCanvas(e);
  };
  const drawOnCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * maskCanvasSize.width;
    const y = ((e.clientY - rect.top) / rect.height) * maskCanvasSize.height;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    // 🎨 ユーザビリティ改善：黒いペンで編集範囲を描画（わかりやすい）
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'black';
    ctx.globalAlpha = 1.0;
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, 2 * Math.PI); // ペンサイズ24px
    ctx.fill();
    // 描画中もリアルタイムでチェック
    checkMaskContent();
  };
  // マスククリア
  const clearMask = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // 🎨 修正: canvasを完全に透明にクリア（背景画像が見えるように）
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    
    // ついでにコンポジット設定もリセット
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    
    console.log('🧹 マスクをクリアしました（透明化）');
    
    // マスククリア後にチェック
    checkMaskContent();
  };

  // img2img用画像のリセット
  const clearUploadImage = () => {
    setUploadImagePreview('');
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        // 🎨 修正: canvasを透明でリセット（背景が見えるように）
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // 画像クリア後にマスクもリセット
    setHasMaskContent(false);
  };

  // img2img用プレビュー画像をcanvas下に1024x1024でリサイズ描画
  useEffect(() => {
    // ここは「canvasに元画像を描画しない」＝マスク専用canvasにする
    if (!uploadImagePreview || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    // 💡 既存のマスク内容を直接チェック（統一されたロジック）
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hasExistingMask = false;
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const a = imageData.data[i + 3];
      
      // 完全に透明なピクセルは無視
      if (a === 0) continue;
      
      // 真っ白（255,255,255）でないピクセルがあればマスクありと判定
      if (r !== 255 || g !== 255 || b !== 255) {
        hasExistingMask = true;
        console.log(`🖌️ useEffect: 既存マスク検出 RGB(${r},${g},${b})`);
        break;
      }
    }
    
    if (!hasExistingMask) {
      // マスクが無い場合は透明で初期化（背景画像が見えるように）
      console.log('🎨 新しい画像設定：マスクキャンバスを透明で初期化');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      // マスクがある場合は既存の描画を保持
      console.log('🖌️ 新しい画像設定：既存のマスクを保持');
    }
    
    // canvas初期化後にマスクチェック
    checkMaskContent();
  }, [uploadImagePreview]);

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
      {/* コンテンツフィルタエラーポップアップ */}
      {showContentFilterError.show && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{color: '#e74c3c', marginBottom: '16px'}}>⚠️ コンテンツポリシー違反</h2>
            <p style={{lineHeight: '1.6', marginBottom: '20px'}}>
              {showContentFilterError.message}
            </p>
            <div style={{background: '#f8f9fa', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', color: '#6c757d'}}>
              <strong>ヒント:</strong><br/>
              • 暴力的、性的、差別的な表現を避けてください<br/>
              • より具体的で建設的な表現に変更してみてください<br/>
              • 創作物やフィクションの場合は、そのことを明示してください
            </div>
            <button 
              className="login-modal-btn"
              style={{background: '#007bff', marginRight: '12px'}}
              onClick={() => setShowContentFilterError({show: false, message: ''})}
            >
              わかりました
            </button>
            <button 
              className="login-modal-btn"
              style={{background: '#6c757d'}}
              onClick={() => {
                setPrompt('');
                setShowContentFilterError({show: false, message: ''});
              }}
            >
              プロンプトをクリア
            </button>
          </div>
        </div>
      )}
      <div className="container" style={{ display: 'flex', flexDirection: 'row', minHeight: '100vh', width: '100vw', boxSizing: 'border-box' }}>
        <div className="left" style={{ minWidth: 0, maxWidth: '100%', width: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* モード切替ボタン */}
          <div style={{ padding: '22px 16px 12px 16px', borderBottom: '1px solid #eee', background: '#f7f7fa' }}>
            <button
              onClick={() => setMode('generate')}
              style={{
                background: mode === 'generate' ? '#f0a' : '#fff',
                color: mode === 'generate' ? '#fff' : '#333',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                marginRight: 8,
                fontWeight: mode === 'generate' ? 'bold' : 'normal',
                cursor: 'pointer',
                boxShadow: mode === 'generate' ? '0 2px 8px #f0a2' : 'none'
              }}
            >画像生成</button>
            <button
              onClick={() => setMode('edit')}
              style={{
                background: mode === 'edit' ? '#f0a' : '#fff',
                color: mode === 'edit' ? '#fff' : '#333',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontWeight: mode === 'edit' ? 'bold' : 'normal',
                cursor: 'pointer',
                boxShadow: mode === 'edit' ? '0 2px 8px #f0a2' : 'none'
              }}
            >画像編集（img2img）</button>
          </div>
          <div className="top">
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
                          <option value="photorealistic">Photorealistic Render (フォトリアルレンダー)</option>
                        </optgroup>
                        <optgroup label="🎭 アニメ・イラスト系">
                          <option value="anime">Anime Style (アニメ絵調)</option>
                          <option value="manga">Manga Illustration (マンガイラスト)</option>
                          <option value="ghibli">Studio Ghibli Style (ジブリ風)</option>
                          <option value="character">Character Design (キャラクターデザイン)</option>
                        </optgroup>
                        <optgroup label="🖼️ アート系">
                          <option value="oil">Oil Painting (油絵調)</option>
                          <option value="watercolor">Watercolor (水彩画調)</option>
                          <option value="sketch">Sketch Drawing (スケッチ調)</option>
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
            {mode === 'edit' && (
              <>
                <div className="upload-block">
                  <label>画像アップロード（img2img用）
                    <input type="file" accept="image/*" onChange={handleImageUpload} />
                  </label>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button onClick={clearMask}>マスククリア</button>
                    <button onClick={clearUploadImage}>img2img選択解除</button>
                  </div>
                  {/* マスクの使い方ガイド */}
                  <div style={{ 
                    marginTop: '12px', 
                    padding: '12px', 
                    backgroundColor: '#e8f4fd', 
                    borderRadius: '8px',
                    border: '1px solid #b3d9ff',
                    fontSize: '14px'
                  }}>
                    <div style={{ fontWeight: 'bold', color: '#0066cc', marginBottom: '6px' }}>
                      💡 マスクの使い方
                    </div>
                    <div style={{ color: '#333', lineHeight: '1.4' }}>
                      <strong>黒で塗った部分</strong>がプロンプトに従って編集されます<br/>
                      <strong>それ以外の部分</strong>はそのまま保持されます<br/>
                      変更したい部分をマウスでドラッグして黒く塗ってください✨
                    </div>
                  </div>
                </div>
                {/* プロンプト入力欄と編集ボタンは常に表示！ */}
                <textarea
                  placeholder="Promptを入力"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  style={{ marginTop: 16 }}
                />
                {/* マスクの状態を表示 */}
                {uploadImagePreview && (
                  <div style={{ 
                    marginTop: 8, 
                    padding: 8, 
                    background: hasMaskContent ? '#e8f5e8' : '#fff8e8', 
                    border: `1px solid ${hasMaskContent ? '#4caf50' : '#ff9800'}`,
                    borderRadius: 4,
                    fontSize: 14
                  }}>
                    {hasMaskContent 
                      ? '🖌️ マスクが描かれています - 指定した範囲のみ編集されます' 
                      : '📝 マスクが描かれていません - 画像全体が編集されます'}
                  </div>
                )}
                <button 
                  onClick={() => { 
                    if (loadingImg) {
                      console.log('既に処理中のため、リクエストをスキップ');
                      return;
                    }
                    console.log('画像編集ボタン押された - マスク状態:', hasMaskContent); 
                    generateImage(); 
                  }} 
                  disabled={loadingImg || !uploadImagePreview}
                  style={{
                    background: loadingImg ? '#ccc' : (hasMaskContent ? '#4caf50' : '#ff9800'),
                    color: '#fff',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: 8,
                    fontSize: 16,
                    fontWeight: 'bold',
                    cursor: loadingImg ? 'not-allowed' : 'pointer',
                    opacity: loadingImg ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                    marginTop: '10px'
                  }}
                >
                  {loadingImg 
                    ? '処理中...' 
                    : (hasMaskContent ? '部分編集（マスク指定あり）' : '全体編集（マスク指定なし）')
                  }
                </button>
                {loadingImg && <div className="loading-bar"></div>}
              </>
            )}
          </div>
          <div className="bottom" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 0 }}>
            <div className="preview-wrapper" style={{ width: '100%', height: '100%', maxWidth: '1024px', maxHeight: '1024px', margin: '0 auto', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div className="preview" style={{ position: 'relative', width: '90vw', height: '90vw', maxWidth: '1024px', maxHeight: '90vh', aspectRatio: '1/1', background: '#fff', borderRadius: 12, boxShadow: '0 2px 16px #0001', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {selectedImage && (
                  <>
                    {/* ベース画像（大きいプレビュー） */}
                    <img
                      src={selectedImage}
                      alt="プレビュー"
                      crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', left: 0, top: 0, zIndex: 1, borderRadius: 12, background: '#fff' }}
                    />
                    {/* 編集モード時のimg2img元画像オーバーレイ（小さく表示） */}
                    {mode === 'edit' && uploadImagePreview && uploadImagePreview !== selectedImage && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '8px', 
                        left: '8px', 
                        zIndex: 4, 
                        background: 'rgba(255,255,255,0.9)', 
                        borderRadius: '8px', 
                        padding: '4px',
                        border: '1px solid #ccc'
                      }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>元画像:</div>
                        <img
                          src={uploadImagePreview}
                          alt="元画像"
                          crossOrigin="anonymous"
                          style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                      </div>
                    )}
                    {/* マスクcanvas（上レイヤー） - 編集モードかつimg2img画像がある時のみ */}
                    {mode === 'edit' && uploadImagePreview && (
                      <canvas
                        ref={canvasRef}
                        width={maskCanvasSize.width}
                        height={maskCanvasSize.height}
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          position: 'absolute', 
                          left: 0, 
                          top: 0, 
                          pointerEvents: 'auto', 
                          zIndex: 2, 
                          borderRadius: 12, 
                          background: 'transparent', // 背景を透明に戻す
                          touchAction: 'none' 
                        }}
                        onMouseDown={handleCanvasMouseDown}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseMove={handleCanvasMouseMove}
                      />
                    )}
                  </>
                )}
                {/* --- 画像編集APIのbase64画像ダウンロードボタン --- */}
                {(lastEditImageBase64 || (lastEditError && lastEditError.imageBase64)) && (
                  <button style={{marginTop:8, position:'absolute', right:0, bottom:0, zIndex:3}} onClick={() => {
                    const base64 = lastEditImageBase64 || (lastEditError && lastEditError.imageBase64);
                    const a = document.createElement('a');
                    a.href = 'data:image/png;base64,' + base64;
                    a.download = 'edited-image.png';
                    a.click();
                  }}>編集画像ダウンロード</button>
                )}
                {/* --- マスクcanvasのPNGダウンロードボタン（デバッグ用） --- */}
                {mode === 'edit' && (
                  <button style={{marginTop:8, position:'absolute', left:0, bottom:0, zIndex:3}} onClick={() => {
                    if (!canvasRef.current) return;
                    canvasRef.current.toBlob(blob => {
                      if (!blob) return;
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'mask-debug.png';
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }, 'image/png');
                  }}>マスクPNGダウンロード</button>
                )}
                {/* --- エラー時は警告も表示 --- */}
                {lastEditError && (
                  <div style={{color:'#f44', marginTop:8, fontSize:13, position:'absolute', left:0, top:0, zIndex:4, background:'#fff8', borderRadius:8, padding:8}}>
                    <b>編集APIエラー:</b><br/>
                    <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all'}}>{JSON.stringify(lastEditError, null, 2)}</pre>
                    {lastEditError.errorDetails && (
                      <>
                        <b>errorDetails:</b><br/>
                        <pre style={{whiteSpace:'pre-wrap',wordBreak:'break-all', background:'#fee', border:'1px solid #faa', borderRadius:4, padding:4}}>{JSON.stringify(lastEditError.errorDetails, null, 2)}</pre>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
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
          {/* ヒストリーパネルの開閉ボタン */}
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
            <>
              <div style={{ marginTop: 50 }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: 16, color: '#333' }}>
                  💾 プロンプト履歴
                </h3>
                
                {/* ヒストリー統計 */}
                {historyStats && (
                  <div style={{
                    background: '#e8f4fd',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 13,
                    color: '#333'
                  }}>
                    <div><strong>総生成数:</strong> {historyStats.totalItems}回</div>
                    {historyStats.lastGenerated && (
                      <div style={{ marginTop: 4 }}>
                        <strong>最新:</strong> {new Date(historyStats.lastGenerated).toLocaleDateString('ja-JP')}
                      </div>
                    )}
                  </div>
                )}

                {/* ローディング状態 */}
                {historyLoading && (
                  <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
                    <div>📜 履歴読み込み中...</div>
                  </div>
                )}

                {/* 認証していない場合 */}
                {!isAuthenticated && (
                  <div style={{
                    background: '#fff3cd',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#856404',
                    textAlign: 'center'
                  }}>
                    🔒 ログインして履歴を確認
                  </div>
                )}

                {/* ヒストリーリスト */}
                {isAuthenticated && userHistory.length > 0 && (
                  <div style={{ 
                    maxHeight: 'calc(100vh - 350px)', 
                    overflowY: 'auto',
                    paddingRight: 8 
                  }}>
                    {userHistory.map((item, idx) => (
                      <div 
                        key={item.id} 
                        style={{
                          background: '#fff',
                          border: '1px solid #e0e0e0',
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 12,
                          fontSize: 12,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
                        }}
                        onClick={() => {
                          // ヒストリーアイテムをクリックしたらプロンプトをセット
                          setPrompt(item.originalPrompt);
                          // カメラ設定も復元
                          setFocalLength(item.cameraSettings.focalLength);
                          setAperture(item.cameraSettings.aperture);
                          setColorTemp(item.cameraSettings.colorTemp);
                          setImageStyle(item.cameraSettings.imageStyle);
                          setSize(item.size);
                          // 画像があれば表示
                          if (item.imageUrl) {
                            setSelectedImage(item.imageUrl);
                            // サムネイル履歴にも追加（重複チェック）
                            if (!imageHistory.includes(item.imageUrl)) {
                              setImageHistory([item.imageUrl, ...imageHistory]);
                            }
                          }
                          console.log('📜 ヒストリーアイテムから設定を復元:', item);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)';
                        }}
                      >
                        {/* タイムスタンプと操作タイプ */}
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8
                        }}>
                          <span style={{ 
                            fontSize: 10, 
                            color: '#666',
                            fontWeight: 'bold'
                          }}>
                            {new Date(item.timestamp).toLocaleString('ja-JP', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              background: item.operationType === 'generate' ? '#e8f5e8' : '#fff3e0',
                              color: item.operationType === 'generate' ? '#2e7d32' : '#f57c00',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 'bold'
                            }}>
                              {item.operationType === 'generate' ? '🎨 生成' : '✏️ 編集'}
                            </span>
                            {/* 削除ボタン */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('この履歴を削除しますか？')) {
                                  deleteHistoryItem(item.id);
                                }
                              }}
                              style={{
                                background: '#ff4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: 3,
                                padding: '2px 4px',
                                fontSize: 8,
                                cursor: 'pointer',
                                fontWeight: 'bold'
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        {/* プロンプトテキスト（省略表示） */}
                        <div style={{
                          color: '#333',
                          lineHeight: 1.4,
                          marginBottom: 8,
                          maxHeight: 40,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {item.originalPrompt}
                        </div>

                        {/* サムネイル画像 */}
                        {item.imageUrl && (
                          <div style={{ textAlign: 'center', marginBottom: 8, position: 'relative' }}>
                            <img 
                              src={item.imageUrl}
                              alt="履歴画像"
                              crossOrigin="anonymous"
                              style={{
                                width: '100%',
                                maxWidth: 120,
                                height: 80,
                                objectFit: 'cover',
                                borderRadius: 4,
                                border: '1px solid #ddd'
                              }}
                            />
                            {/* img2imgボタン */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // 親のクリックイベントを防ぐ
                                if (hasMaskContent && !window.confirm('マスクが描かれています。新しい画像を設定するとマスクがクリアされますが、よろしいですか？')) {
                                  return;
                                }
                                setUploadImagePreview(item.imageUrl);
                                setSelectedImage(item.imageUrl);
                                setMode('edit');
                                console.log('🎨 ヒストリーからimg2img対象を設定:', item.imageUrl);
                              }}
                              style={{
                                position: 'absolute',
                                bottom: 2,
                                right: 2,
                                background: uploadImagePreview === item.imageUrl ? '#ff4444' : 'rgba(255,255,255,0.9)',
                                color: uploadImagePreview === item.imageUrl ? '#fff' : '#333',
                                border: '1px solid #ccc',
                                borderRadius: 3,
                                padding: '2px 4px',
                                fontSize: 8,
                                fontWeight: 'bold',
                                cursor: 'pointer'
                              }}
                            >
                              {uploadImagePreview === item.imageUrl ? '選択中' : 'img2img'}
                            </button>
                          </div>
                        )}

                        {/* カメラ設定の概要 */}
                        <div style={{
                          fontSize: 10,
                          color: '#888',
                          display: 'flex',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 4
                        }}>
                          <span>📷 {item.cameraSettings.focalLength}mm</span>
                          <span>⚪ f/{item.cameraSettings.aperture}</span>
                          <span>🌡️ {item.cameraSettings.colorTemp}K</span>
                          <span>📐 {item.size}</span>
                        </div>
                        
                        <div style={{
                          fontSize: 10,
                          color: '#888',
                          marginTop: 4,
                          fontStyle: 'italic'
                        }}>
                          🎨 {item.cameraSettings.imageStyle}
                        </div>
                      </div>
                    ))}

                    {/* もっと読み込むボタン */}
                    {userHistory.length >= 20 && (
                      <button
                        onClick={() => fetchUserHistory(20, userHistory.length)}
                        disabled={historyLoading}
                        style={{
                          width: '100%',
                          padding: 8,
                          background: '#f8f9fa',
                          border: '1px solid #dee2e6',
                          borderRadius: 6,
                          fontSize: 12,
                          color: '#666',
                          cursor: 'pointer'
                        }}
                      >
                        {historyLoading ? '読み込み中...' : 'さらに読み込む'}
                      </button>
                    )}
                  </div>
                )}

                {/* ヒストリーがない場合 */}
                {isAuthenticated && !historyLoading && userHistory.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: 20,
                    color: '#666',
                    fontSize: 13
                  }}>
                    <div style={{ marginBottom: 8 }}>📝</div>
                    <div>まだ履歴がありません</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      画像を生成すると<br/>ここに履歴が表示されます
                    </div>
                    <div style={{
                      marginTop: 12,
                      padding: 8,
                      background: '#fff3cd',
                      borderRadius: 4,
                      fontSize: 10,
                      color: '#856404'
                    }}>
                      💡 履歴機能を使うには<br/>Cosmos DBのデプロイが必要です
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 折りたたみ時の簡易表示 */}
          {!showHistoryPanel && isAuthenticated && historyStats && (
            <div style={{
              position: 'absolute',
              top: 55,
              left: 8,
              right: 8,
              background: '#007acc',
              color: 'white',
              borderRadius: 4,
              padding: '4px 6px',
              fontSize: 9,
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              {historyStats.totalItems}
            </div>
          )}
        </div>
        {/* サムネイルリストを画面下部に固定 */}
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
                <button className="use-as-img2img" style={{ 
                  position: 'absolute', 
                  left: 0, 
                  bottom: 0, 
                  fontSize: 10, 
                  padding: '2px 4px', 
                  background: uploadImagePreview === url ? '#ff4444' : '#fff8', 
                  color: uploadImagePreview === url ? '#fff' : '#000',
                  border: 'none', 
                  borderRadius: 4, 
                  cursor: 'pointer',
                  fontWeight: uploadImagePreview === url ? 'bold' : 'normal'
                }} onClick={() => {
                  // マスクが描かれている場合は確認
                  if (hasMaskContent && !window.confirm('マスクが描かれています。新しい画像を設定するとマスクがクリアされますが、よろしいですか？')) {
                    return;
                  }
                  setUploadImagePreview(url);
                  // 🎯 img2imgボタンを押したらプレビューも自動変更！
                  setSelectedImage(url);
                  console.log('🎨 img2img対象を設定＆プレビューも変更:', url);
                }}>img2img</button>
                <button className="delete-thumb" style={{ position: 'absolute', right: 0, top: 0, fontSize: 12, padding: '2px 4px', background: '#f44', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }} onClick={async () => {
                  if (!window.confirm('この画像を削除する？')) return;
                  try {
                    const res = await fetch('/api/delete', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url })
                    });
                    if (res.ok) {
                      setImageHistory(imageHistory.filter((u) => u !== url));
                      if (selectedImage === url) setSelectedImage(imageHistory.find((u) => u !== url) || '');
                    } else {
                      alert('削除失敗！');
                    }
                  } catch (e) {
                    alert('削除エラー！');
                  }
                }}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthButtons />
      <AppContent />
    </MsalProvider>
  );
}

export default App;
