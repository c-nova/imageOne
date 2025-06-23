// 🖼️ 画像編集（img2img）専用hook
import { useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';

export interface EditImageItem {
  id: string;
  prompt: string;
  originalPrompt?: string;
  imageUrl: string;
  imageBlobPath?: string;
  operationType: 'edit';
  originalSize: string;
  timestamp: string;
  metadata?: {
    processingTime?: number;
    userAgent?: string;
  };
}

export const useImageEdit = (onEditSuccess?: () => void) => {
  // 画像編集の状態
  const [editPrompt, setEditPrompt] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageFile, setUploadedImageFile] = useState<File | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // マスク描画関連
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [maskData, setMaskData] = useState<string | null>(null);
  
  // 画像サイズ自動検出
  const [detectedSize, setDetectedSize] = useState<'1024x1024' | '1536x1024' | '1024x1536'>('1024x1024');
  
  const { getAuthToken } = useAuth();

  // 🖼️ 画像アップロード処理
  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedImageFile(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageUrl = e.target?.result as string;
        setUploadedImage(imageUrl);
        
        // 画像サイズを自動検出
        const img = new Image();
        img.onload = () => {
          const { width, height } = img;
          let size: '1024x1024' | '1536x1024' | '1024x1536';
          
          if (Math.abs(width - height) < 50) {
            size = '1024x1024';
          } else if (width > height) {
            size = '1536x1024';
          } else {
            size = '1024x1536';
          }
          
          setDetectedSize(size);
          console.log(`🔍 画像サイズ自動検出: ${width}×${height} → ${size}`);
        };
        img.src = imageUrl;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 🎨 マスク描画開始
  const startDrawing = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    // fillRectによる黒塗りは削除！
    // マスク初期化時のみ黒塗りする（clearMaskで実施）
    // 🎯 実際の画像表示サイズを使用した正確な座標変換
    const rect = canvas.getBoundingClientRect();
    const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
    if (!imgElement) return;
    // 実際の画像要素の表示サイズを取得（object-fit: contain で調整済み）
    const imgRect = imgElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    // キャンバス内での画像の位置とサイズを計算
    const imgOffsetX = imgRect.left - canvasRect.left;
    const imgOffsetY = imgRect.top - canvasRect.top;
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // クリック座標をキャンバス座標に変換
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    
    // 画像表示領域内での相対座標を計算
    const relativeX = (clickX - imgOffsetX) / imgDisplayWidth;
    const relativeY = (clickY - imgOffsetY) / imgDisplayHeight;
    
    // 画像領域外のクリックは無視
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
      console.log('⚠️ 画像領域外のクリックを無視');
      return;
    }
    
    // キャンバス座標に変換
    const x = relativeX * canvas.width;
    const y = relativeY * canvas.height;
    
    console.log(`🎨 描画開始: クリック座標(${clickX}, ${clickY}) → 相対座標(${relativeX.toFixed(3)}, ${relativeY.toFixed(3)}) → キャンバス座標(${x.toFixed(1)}, ${y.toFixed(1)})`);
    console.log(`📐 画像表示サイズ: ${imgDisplayWidth}×${imgDisplayHeight}, オフセット: (${imgOffsetX}, ${imgOffsetY})`);
    
    const ctx2 = canvas.getContext('2d');
    if (ctx2) {
      ctx2.beginPath();
      ctx2.moveTo(x, y);
      // 描画設定を初期化
      ctx2.strokeStyle = 'rgba(255,255,255,0)';
      ctx2.lineWidth = 12;
      ctx2.lineCap = 'round';
      ctx2.lineJoin = 'round';
    }
  }, []);

  // 🎨 マスク描画中
  const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // 🎯 実際の画像表示サイズを使用した正確な座標変換
    const rect = canvas.getBoundingClientRect();
    const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
    if (!imgElement) return;
    // 実際の画像要素の表示サイズを取得（object-fit: contain で調整済み）
    const imgRect = imgElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    // キャンバス内での画像の位置とサイズを計算
    const imgOffsetX = imgRect.left - canvasRect.left;
    const imgOffsetY = imgRect.top - canvasRect.top;
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    // クリック座標をキャンバス座標に変換
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;
    // 画像表示領域内での相対座標を計算
    const relativeX = (clickX - imgOffsetX) / imgDisplayWidth;
    const relativeY = (clickY - imgOffsetY) / imgDisplayHeight;
    // 画像領域外の描画は無視
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
      return;
    }
    // キャンバス座標に変換
    const x = relativeX * canvas.width;
    const y = relativeY * canvas.height;
    // 描画色を不透明赤に
    ctx.strokeStyle = 'rgba(255,0,0,1)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasMask(true);
  }, [isDrawing]);

  // 🎨 マスク保存処理（共通）
  const saveMaskData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasMask || !uploadedImage) {
      console.log('❌ saveMaskData: 条件チェック失敗', { canvas: !!canvas, hasMask, uploadedImage: !!uploadedImage });
      return;
    }

    console.log('🎨 saveMaskData: 開始');

    // 元画像のサイズを取得
    const img = new Image();
    img.onload = () => {
      console.log(`📐 元画像サイズ: ${img.width}×${img.height}`);
      
      // 新しいキャンバスを作成して元画像サイズでマスクを再描画
      const resizeCanvas = document.createElement('canvas');
      resizeCanvas.width = img.width;
      resizeCanvas.height = img.height;
      const resizeCtx = resizeCanvas.getContext('2d');
      
      if (resizeCtx) {
          // 🎯 リサイズキャンバスの設定を変更：透明背景で開始
          // resizeCtx.fillStyle = '#000000';
          // resizeCtx.fillRect(0, 0, img.width, img.height);
          // console.log('⚫ resizeCanvas: 黒で塗りつぶし完了');
          
          // 透明背景のままにしておく
          console.log('🌟 resizeCanvas: 透明背景で開始');
        
        // 元のキャンバスの内容を一時キャンバスに描画
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        console.log(`📋 tempCanvas作成: ${canvas.width}×${canvas.height}`);
        
        if (tempCtx) {
          // まず元キャンバスをコピー
          tempCtx.drawImage(canvas, 0, 0);
          console.log('📋 tempCanvas: 元キャンバスをコピー完了');
          
          // 赤い部分を透明に変換（編集対象として設定）
          const imageData = tempCtx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          let redPixelCount = 0;
          let totalPixelCount = data.length / 4;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];
            
            // 赤い色（描画された部分）を検出
            if (r > 200 && g < 100 && b < 100 && a > 0) {
              redPixelCount++;
              // 🎯 ユーザーが描画した部分→透明（編集対象）
              data[i] = 0;       // R
              data[i + 1] = 0;   // G
              data[i + 2] = 0;   // B
              data[i + 3] = 0;   // A（透明）
            } else {
              // 🎯 描画されてない部分→黒（保持対象）
              data[i] = 0;       // R
              data[i + 1] = 0;   // G
              data[i + 2] = 0;   // B
              data[i + 3] = 255; // A（不透明）
            }
          }
          
          console.log(`🔍 ピクセル解析: 赤いピクセル=${redPixelCount}, 総ピクセル=${totalPixelCount}`);
          
          tempCtx.putImageData(imageData, 0, 0);
          console.log('🎭 tempCanvas: 色変換完了');
          
          // 🎯 リサイズしてresizeCanvasに描画
          resizeCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, resizeCanvas.width, resizeCanvas.height);
          console.log('📏 resizeCanvas: tempCanvasをリサイズして描画完了');
          
          // 🎯 最後に不透明黒で背景を追加（透明でない部分のみ）
          const finalImageData = resizeCtx.getImageData(0, 0, resizeCanvas.width, resizeCanvas.height);
          const finalData = finalImageData.data;
          
          for (let i = 0; i < finalData.length; i += 4) {
            const a = finalData[i + 3]; // Alpha値をチェック
            
            if (a === 0) {
              // 透明ピクセル → そのまま透明（編集対象）
              // 何もしない
            } else {
              // 不透明ピクセル → 黒に統一（保持対象）
              finalData[i] = 0;       // R
              finalData[i + 1] = 0;   // G
              finalData[i + 2] = 0;   // B
              finalData[i + 3] = 255; // A（不透明）
            }
          }
          
          resizeCtx.putImageData(finalImageData, 0, 0);
          console.log('🎭 最終調整: 透明部分はそのまま、不透明部分は黒に統一');
          
          // リサイズされたマスクデータを保存
          const resizedMaskDataUrl = resizeCanvas.toDataURL('image/png');
          setMaskData(resizedMaskDataUrl);
          
          console.log(`🎨 マスクリサイズ＋色変換: ${canvas.width}×${canvas.height} → ${img.width}×${img.height}`);
          console.log('🎭 赤い描画 → 透明（編集対象）、それ以外 → 黒（保持対象）に変換完了');
          
          // 🚨 デバッグ用：中間段階のキャンバスもダウンロード（コメントアウト）
          // const tempMaskUrl = tempCanvas.toDataURL('image/png');
          // const debugLink = document.createElement('a');
          // debugLink.href = tempMaskUrl;
          // debugLink.download = `debug-temp-mask-${Date.now()}.png`;
          // document.body.appendChild(debugLink);
          // debugLink.click();
          // document.body.removeChild(debugLink);
          // console.log('🐛 デバッグ用tempMaskもダウンロード');
        }
      }
    };
    img.src = uploadedImage;
  }, [hasMask, uploadedImage]);

  // 🎨 マスク描画終了
  const stopDrawing = useCallback(() => {
    setIsDrawing(false);
    saveMaskData();
  }, [saveMaskData]);

  // 🎨 タッチ描画開始
  const startTouchDrawing = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const touch = event.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || !touch) return;
    
    setIsDrawing(true);
    
    // 🎯 object-fit: contain を考慮した正確な座標変換
    const rect = canvas.getBoundingClientRect();
    const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
    
    if (!imgElement) return;
    
    // 画像の自然サイズとキャンバスサイズを取得
    const imgNaturalWidth = imgElement.naturalWidth;
    const imgNaturalHeight = imgElement.naturalHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // object-fit: contain での実際の表示サイズを計算
    const imgAspectRatio = imgNaturalWidth / imgNaturalHeight;
    const canvasAspectRatio = canvasWidth / canvasHeight;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (imgAspectRatio > canvasAspectRatio) {
      // 画像が横長の場合：幅がキャンバス幅に合わせられる
      displayWidth = canvasWidth;
      displayHeight = canvasWidth / imgAspectRatio;
      offsetX = 0;
      offsetY = (canvasHeight - displayHeight) / 2;
    } else {
      // 画像が縦長の場合：高さがキャンバス高さに合わせられる
      displayHeight = canvasHeight;
      displayWidth = canvasHeight * imgAspectRatio;
      offsetX = (canvasWidth - displayWidth) / 2;
      offsetY = 0;
    }
    
    // タッチ座標をキャンバス座標に変換
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    
    // 画像表示領域内での相対座標を計算
    const relativeX = (touchX - offsetX) / displayWidth;
    const relativeY = (touchY - offsetY) / displayHeight;
    
    // キャンバス座標に変換
    const x = relativeX * canvasWidth;
    const y = relativeY * canvasHeight;
    
    console.log(`🎨 タッチ描画開始: タッチ座標(${touchX}, ${touchY}) → 相対座標(${relativeX.toFixed(3)}, ${relativeY.toFixed(3)}) → キャンバス座標(${x.toFixed(1)}, ${y.toFixed(1)})`);
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  // 🎨 タッチ描画中
  const touchDraw = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (!isDrawing) return;
    
    const touch = event.touches[0];
    const canvas = canvasRef.current;
    if (!canvas || !touch) return;
    
    // 🎯 実際の画像表示サイズを使用した正確な座標変換
    const rect = canvas.getBoundingClientRect();
    const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
    
    if (!imgElement) return;
    
    // 実際の画像要素の表示サイズを取得（object-fit: contain で調整済み）
    const imgRect = imgElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    // キャンバス内での画像の位置とサイズを計算
    const imgOffsetX = imgRect.left - canvasRect.left;
    const imgOffsetY = imgRect.top - canvasRect.top;
    const imgDisplayWidth = imgRect.width;
    const imgDisplayHeight = imgRect.height;
    
    // タッチ座標をキャンバス座標に変換
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    
    // 画像表示領域内での相対座標を計算
    const relativeX = (touchX - imgOffsetX) / imgDisplayWidth;
    const relativeY = (touchY - imgOffsetY) / imgDisplayHeight;
    
    // 画像領域外の描画は無視
    if (relativeX < 0 || relativeX > 1 || relativeY < 0 || relativeY > 1) {
      return;
    }
    
    // キャンバス座標に変換
    const x = relativeX * canvas.width;
    const y = relativeY * canvas.height;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasMask(true);
    }
  }, [isDrawing]);

  // 🎨 タッチ描画終了
  const stopTouchDrawing = useCallback((event: React.TouchEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    setIsDrawing(false);
    
    saveMaskData();
  }, [saveMaskData]);

  // 🧹 マスククリア
  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        setHasMask(false);
        setMaskData(null);
      }
    }
  }, []);

  // ✏️ 画像編集実行
  const handleImageEdit = useCallback(async () => {
    if (!editPrompt.trim() || !uploadedImage) {
      alert('画像とプロンプトの両方が必要です');
      return;
    }
    
    setLoading(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('認証トークンが見つかりません');
      }

      // 画像をBase64に変換
      let imageBase64: string;
      
      if (uploadedImage.startsWith('data:image/')) {
        // アップロード画像の場合：data URL形式
        imageBase64 = uploadedImage.split(',')[1]; // data:image/...の部分を除去
      } else {
        // img2img画像の場合：URLから画像を取得してBase64に変換
        console.log('🔄 URLから画像を取得してBase64に変換中...', uploadedImage);
        const response = await fetch(uploadedImage);
        if (!response.ok) {
          throw new Error('画像の取得に失敗しました');
        }
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // data:image/...の部分を除去
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        imageBase64 = base64;
        console.log('✅ Base64変換完了');
      }
      
      // マスクをBase64に変換（ある場合）または空の透明マスクを生成
      let maskBase64: string;
      let actualImageWidth: number;
      let actualImageHeight: number;
      
      // 元画像のサイズを取得（必須）
      const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
      if (!imgElement) {
        throw new Error('画像要素が見つかりません');
      }
      
      actualImageWidth = imgElement.naturalWidth;
      actualImageHeight = imgElement.naturalHeight;
      
      console.log(`📐 元画像の実際のサイズ: ${actualImageWidth}×${actualImageHeight}`);
      
      if (maskData && hasMask) {
        maskBase64 = maskData.split(',')[1];
        console.log('🎭 ユーザー描画マスクを使用');
        // ★API送信直前のマスク画像を自動ダウンロード（コメントアウト）
        // const downloadUrl = 'data:image/png;base64,' + maskBase64;
        // const link = document.createElement('a');
        // link.href = downloadUrl;
        // link.download = `api-mask-${Date.now()}.png`;
        // document.body.appendChild(link);
        // link.click();
        // document.body.removeChild(link);
      } else {
        // マスクなし編集の場合：元画像サイズで透明白マスクを生成
        console.log('🎭 マスクなし編集：元画像サイズで透明白マスクを生成');
        const emptyCanvas = document.createElement('canvas');
        emptyCanvas.width = actualImageWidth;
        emptyCanvas.height = actualImageHeight;
        const ctx = emptyCanvas.getContext('2d');
        if (ctx) {
          // 全体を透明白で塗りつぶし（編集対象領域として指定）
          const imageData = ctx.createImageData(actualImageWidth, actualImageHeight);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 255;     // R
            imageData.data[i + 1] = 255; // G
            imageData.data[i + 2] = 255; // B
            imageData.data[i + 3] = 0;   // A（透明）
          }
          ctx.putImageData(imageData, 0, 0);
          const emptyMaskDataURL = emptyCanvas.toDataURL('image/png');
          maskBase64 = emptyMaskDataURL.split(',')[1];
          console.log(`✅ 空の透明白マスク生成完了（${actualImageWidth}×${actualImageHeight}、全体編集用）`);
        } else {
          throw new Error('マスク生成に失敗しました');
        }
      }
      
      // 実際のサイズからAPIサイズを決定
      const actualSize = `${actualImageWidth}x${actualImageHeight}`;
      console.log(`🎯 API送信サイズ: ${actualSize} (実測値ベース)`);

      const response = await fetch('/api/edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: editPrompt.trim(),
          imageBase64,
          maskBase64,
          size: detectedSize, // 従来の検出サイズ（互換性のため）
          actualSize, // 実際の画像サイズ（API優先使用）
          actualWidth: actualImageWidth,
          actualHeight: actualImageHeight
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '画像編集に失敗しました');
      }

      setEditedImage(data.imageUrl);
      
      // 編集成功時に履歴を更新
      if (onEditSuccess) {
        console.log('🔄 編集成功！履歴を自動更新します');
        setTimeout(() => {
          onEditSuccess();
        }, 500); // 少し待ってから更新（API反映待ち）
      }
      
    } catch (error) {
      console.error('❌ 画像編集エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      alert(`画像編集に失敗しました: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }, [editPrompt, uploadedImage, maskData, hasMask, detectedSize, getAuthToken, onEditSuccess]);

  // 🔄 リセット
  const resetEdit = useCallback(() => {
    setEditPrompt('');
    setUploadedImage(null);
    setUploadedImageFile(null);
    setEditedImage(null);
    setDetectedSize('1024x1024');
    clearMask();
  }, [clearMask]);

  // 🔄 編集結果のみリセット（画像とプロンプトは保持）
  const resetEditResult = useCallback(() => {
    setEditedImage(null);
    clearMask();
    console.log('🔄 編集結果をリセットしました（画像・プロンプトは保持）');
  }, [clearMask]);

  return {
    // State
    editPrompt,
    setEditPrompt,
    uploadedImage,
    uploadedImageFile,
    editedImage,
    setEditedImage,
    setUploadedImage,
    loading,
    detectedSize,
    
    // マスク関連
    canvasRef,
    isDrawing,
    hasMask,
    maskData,
    
    // Actions
    handleImageUpload,
    handleImageEdit,
    resetEdit,
    resetEditResult,
    
    // マスク描画
    startDrawing,
    draw,
    stopDrawing,
    clearMask,
    
    // タッチ描画
    startTouchDrawing,
    touchDraw,
    stopTouchDrawing,
    
    // Auth
    getAuthToken
  };
};
