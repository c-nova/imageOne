import React, { useState, useEffect, ChangeEvent, useRef } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './msalConfig';
import './App.css';

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
  // 認証状態
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  const [lastEditImageBase64, setLastEditImageBase64] = useState<string | null>(null);
  const [lastEditError, setLastEditError] = useState<any>(null);
  // マスクcanvasサイズをstateで管理
  const [maskCanvasSize, setMaskCanvasSize] = useState<{width:number, height:number}>({width:1024, height:1024});
  // コンテンツフィルタエラー用state
  const [showContentFilterError, setShowContentFilterError] = useState<{show: boolean, message: string}>({show: false, message: ''});
  // マスクが描かれているかどうかを検出する state
  const [hasMaskContent, setHasMaskContent] = useState<boolean>(false);

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
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) {
      setHasMaskContent(false);
      return;
    }
    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i + 3] > 0) { // alpha>0
        setHasMaskContent(true);
        return;
      }
    }
    setHasMaskContent(false);
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
    
    setLoadingImg(true);
    try {
      let res: Response | undefined;
      if (mode === 'generate') {
        // 画像生成は/api/generateにapplication/jsonで送信！
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            size
          })
        });
      } else if (mode === 'edit') {
        console.log('🖼️ 画像編集モード開始');
        // 画像編集は/api/editにapplication/json＋base64で送信！
        // まず元画像のアスペクト比を検出してサイズを決定
        let imageBase64: string | null = null;
        let actualSize = size; // デフォルトは選択されたサイズ
        
        // --- canvas生成＆リサイズ描画 ---
        if (uploadImagePreview) {
          // 元画像のサイズを検出
          const img = new window.Image();
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const originalWidth = img.width;
              const originalHeight = img.height;
              console.log(`📐 元画像サイズ: ${originalWidth}x${originalHeight}`);
              
              // アスペクト比に基づいてサイズを決定
              if (originalWidth === originalHeight) {
                // 正方形の場合
                actualSize = '1024x1024';
                console.log('🔲 正方形の画像なので1024x1024で編集');
              } else if (originalWidth > originalHeight) {
                // 横長の場合
                actualSize = '1536x1024';
                console.log('📏 横長の画像なので1536x1024で編集');
              } else {
                // 縦長の場合
                actualSize = '1024x1536';
                console.log('📐 縦長の画像なので1024x1536で編集');
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
        let maskBase64: string | null = null;
        let maskHasContent = false;
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
              if (imageData.data[i + 3] > 0) { // alpha>0
                maskHasContent = true;
                break;
              }
            }
          }
          maskBase64 = await new Promise<string | null>(resolve => canvasRef.current!.toBlob(b => {
            if (!b) return resolve(null);
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(b);
          }, 'image/png'));
        }
        // マスクが空の場合は警告を出すが、そのまま送信する（マスク無し編集）
        if (!maskHasContent) {
          console.log('🎨 マスクが描かれていないため、画像全体を編集対象として送信します');
          // マスクが無い場合はnullにする
          maskBase64 = null;
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
        // ========== デバッグログここまで ==========
        res = await fetch('/api/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            size, // ユーザー選択サイズ
            actualSize, // 元画像のアスペクト比に基づくサイズ（バックエンドで優先使用）
            imageBase64,
            maskBase64
          })
        });
      } else {
        alert('不正なモードだよ！');
        setLoadingImg(false);
        return;
      }
      if (!res) {
        alert('APIリクエストが実行されなかったよ！');
        setLoadingImg(false);
        return;
      }
      const data = await res.json();
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
      if (data.url) {
        setImageHistory([data.url, ...imageHistory]);
        setPromptHistory([prompt, ...promptHistory]);
        setSelectedImage(data.url);
      } else if (data.imageUrl) {
        setImageHistory([data.imageUrl, ...imageHistory]);
        setPromptHistory([prompt, ...promptHistory]);
        setSelectedImage(data.imageUrl);
      }
      // --- 成功時もbase64画像があれば保存 ---
      if (data.imageBase64) {
        setLastEditImageBase64(data.imageBase64);
      } else {
        setLastEditImageBase64(null);
      }
      setLastEditError(null);
      // 画像リストを最新化
      try {
        const resList = await fetch('/api/list');
        if (resList.ok) {
          const listData = await resList.json();
          if (Array.isArray(listData.urls)) {
            setImageHistory(listData.urls);
            if (listData.urls.length > 0) setSelectedImage(listData.urls[0]);
          }
        }
      } catch (e) {
        console.error('画像リストの再取得に失敗', e);
      }
    } catch (e) {
      console.error('画像生成失敗', e);
    }
    setLoadingImg(false);
  };

  // 画像アップロード時のプレビュー生成
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const reader = new FileReader();
      reader.onload = ev => {
        // 画像をsizeセレクトのピクセル数でリサイズしてプレビュー用base64を作る
        const img = new window.Image();
        img.onload = () => {
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
                setMaskCanvasSize({ width, height });
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

  // マスク描画用canvasの初期化
  useEffect(() => {
    if (!uploadImagePreview || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 透明で初期化
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
  }, [uploadImagePreview]);

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
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
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
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    // マスククリア後にチェック
    checkMaskContent();
  };

  // img2img用画像のリセット
  const clearUploadImage = () => {
    setUploadImagePreview('');
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    // 画像クリア後にマスクもリセット
    setHasMaskContent(false);
  };

  // img2img用プレビュー画像をcanvas下に1024x1024でリサイズ描画
  useEffect(() => {
    // ここは「canvasに元画像を描画しない」＝マスク専用canvasにする
    if (!uploadImagePreview || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 透明で初期化（マスクだけ描画）
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1.0;
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
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #eee', background: '#f7f7fa' }}>
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
                    transition: 'all 0.2s ease'
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
                      src={mode === 'edit' && uploadImagePreview ? uploadImagePreview : selectedImage}
                      alt="プレビュー"
                      crossOrigin="anonymous"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', position: 'absolute', left: 0, top: 0, zIndex: 1, borderRadius: 12, background: '#fff' }}
                    />
                    {/* マスクcanvas（上レイヤー） - 編集モードかつimg2img画像がある時のみ */}
                    {mode === 'edit' && uploadImagePreview && (
                      <canvas
                        ref={canvasRef}
                        width={maskCanvasSize.width}
                        height={maskCanvasSize.height}
                        style={{ width: '100%', height: '100%', position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', zIndex: 2, borderRadius: 12, background: 'transparent', touchAction: 'none' }}
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
        <div className="prompt-history-pane" style={{ minWidth: 220, maxWidth: 320, width: '22vw', background: '#fafaff', borderLeft: '1px solid #eee', padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
          <h3>プロンプト履歴</h3>
          <ul style={{ maxHeight: 200, overflowY: 'auto', paddingRight: 8 }}>
            {promptHistory.slice(0, 10).map((p, idx) => <li key={idx}>{p}</li>)}
          </ul>
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
                <button className="use-as-img2img" style={{ position: 'absolute', left: 0, bottom: 0, fontSize: 10, padding: '2px 4px', background: '#fff8', border: 'none', borderRadius: 4, cursor: 'pointer' }} onClick={() => {
                  setUploadImagePreview(url);
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
