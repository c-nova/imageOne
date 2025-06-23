// 🖼️ 画像編集（img2img）パネルコンポーネント
import React, { useEffect, useState, useRef } from 'react';

interface ImageEditPanelProps {
  editPrompt: string;
  setEditPrompt: (prompt: string) => void;
  uploadedImage: string | null;
  editedImage: string | null;
  loading: boolean;
  detectedSize: '1024x1024' | '1536x1024' | '1024x1536';
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isDrawing: boolean;
  hasMask: boolean;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImageEdit: () => void;
  onResetEdit: () => void;
  startDrawing: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  draw: (event: React.MouseEvent<HTMLCanvasElement>) => void;
  stopDrawing: () => void;
  clearMask: () => void;
  renderPreviewArea?: () => React.ReactNode;
  maskData?: string | null; // 追加: 送信マスク画像のbase64
}

const ImageEditPanel: React.FC<ImageEditPanelProps> = ({
  editPrompt,
  setEditPrompt,
  uploadedImage,
  editedImage,
  loading,
  detectedSize,
  canvasRef,
  isDrawing,
  hasMask,
  onImageUpload,
  onImageEdit,
  onResetEdit,
  startDrawing,
  draw,
  stopDrawing,
  clearMask,
  renderPreviewArea,
  maskData,
}) => {
  // キャンバスのサイズを画像に合わせて調整
  useEffect(() => {
    if (uploadedImage && canvasRef.current) {
      const canvas = canvasRef.current;
      const img = new Image();
      img.onload = () => {
        // キャンバスのサイズを画像に合わせる
        const maxSize = 400; // 表示用の最大サイズ
        let canvasWidth = img.width;
        let canvasHeight = img.height;
        
        if (img.width > maxSize || img.height > maxSize) {
          const scale = Math.min(maxSize / img.width, maxSize / img.height);
          canvasWidth = img.width * scale;
          canvasHeight = img.height * scale;
        }
        
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
      };
      img.src = uploadedImage;
    }
  }, [uploadedImage, canvasRef]);

  // 🩸 マスクプレビュー用: 透明白部分を半透明赤で可視化するDataURLを生成（state管理）
  const [maskPreviewUrl, setMaskPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!maskData) {
      setMaskPreviewUrl(null);
      return;
    }
    const img = new window.Image();
    img.src = maskData;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setMaskPreviewUrl(maskData);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        // 透明白（編集部分）→半透明赤で可視化
        if (data[i] === 255 && data[i+1] === 255 && data[i+2] === 255 && data[i+3] === 0) {
          data[i] = 255;   // R
          data[i+1] = 0;   // G
          data[i+2] = 0;   // B
          data[i+3] = 128; // A（半透明）
        }
      }
      ctx.putImageData(imageData, 0, 0);
      setMaskPreviewUrl(canvas.toDataURL('image/png'));
    };
    img.onerror = () => setMaskPreviewUrl(maskData);
  }, [maskData]);

  return (
    <div className="edit-panel">
      <div className="panel-header">
        <h2>🖼️ 画像編集（img2img）</h2>
        <p>既存画像をAIで編集・変換</p>
      </div>

      {/* 画像アップロード */}
      <div className="upload-section" style={{ marginBottom: '20px' }}>
        <label htmlFor="image-upload" style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: '600',
          color: '#4a5568'
        }}>
          📁 編集する画像をアップロード
        </label>
        <input
          id="image-upload"
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            border: '2px dashed #007acc',
            borderRadius: '8px',
            backgroundColor: '#f8f9ff',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        />
        
        {uploadedImage && (
          <div style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#e8f5e8',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#2e7d32',
            fontWeight: '500'
          }}>
            ✅ 画像アップロード完了 (自動検出サイズ: {detectedSize})
          </div>
        )}
      </div>

      {/* 画像とマスク編集エリア：プレビュー領域に移動 */}
      {uploadedImage && (
        <div className="edit-info" style={{
          marginBottom: '20px',
          padding: '16px',
          backgroundColor: '#f0f8ff',
          borderRadius: '8px',
          border: '2px solid #007acc'
        }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#007acc' }}>🎨 マスク描画について</h3>
          <p style={{ 
            margin: '0 0 12px 0', 
            fontSize: '14px', 
            color: '#333',
            lineHeight: '1.5'
          }}>
            右側のプレビュー領域で、変更したい部分を黒いペンでマークしてください（オプション）
          </p>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '13px'
          }}>
            <span style={{ color: '#666' }}>
              {hasMask ? '✅ マスクあり（部分編集）' : '⭕ マスクなし（全体編集）'}
            </span>
          </div>
        </div>
      )}

      {/* 編集プロンプト */}
      <div className="prompt-section" style={{ marginBottom: '20px' }}>
        <label htmlFor="edit-prompt" style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600',
          color: '#4a5568'
        }}>
          ✨ 編集プロンプト
        </label>
        <textarea
          id="edit-prompt"
          value={editPrompt}
          onChange={(e) => setEditPrompt(e.target.value)}
          placeholder="どのように編集したいかを詳しく説明してください..."
          rows={4}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '14px',
            lineHeight: '1.5',
            borderRadius: '8px',
            border: '2px solid #e0e0e0',
            resize: 'vertical',
            fontFamily: 'inherit'
          }}
        />
        <div style={{
          marginTop: '12px',
          padding: '12px',
          backgroundColor: '#f8f9ff',
          borderRadius: '6px',
          border: '1px solid #e0e0f0'
        }}>
          <h4 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '14px',
            color: '#4a5568'
          }}>💡 プロンプト例:</h4>
          <ul style={{ 
            margin: 0, 
            paddingLeft: '18px',
            fontSize: '13px',
            color: '#666'
          }}>
            <li>"猫を犬に変更"</li>
            <li>"背景を夕焼けの海に変更"</li>
            <li>"服の色を赤に変更"</li>
            <li>"表情を笑顔に変更"</li>
          </ul>
        </div>
      </div>

      {/* 編集実行・リセットボタン */}
      <div className="action-section" style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <button
          onClick={onImageEdit}
          disabled={!editPrompt.trim() || !uploadedImage || loading}
          style={{
            flex: 1,
            padding: '14px',
            backgroundColor: loading ? '#ccc' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {loading ? '✏️ 編集中...' : hasMask ? '🎯 部分編集実行' : '🌍 全体編集実行'}
        </button>
        
        <button
          onClick={onResetEdit}
          disabled={loading}
          style={{
            padding: '14px 20px',
            backgroundColor: loading ? '#ccc' : '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          🔄 リセット
        </button>
      </div>
      {/* 送信画像・マスクプレビュー */}
      {(uploadedImage || maskData) && (
        <div style={{
          marginBottom: '20px',
          padding: '16px',
          background: '#eaffea',
          borderRadius: '8px',
          border: '2px dashed #00c853',
        }}>
          <h4 style={{margin: '0 0 8px 0', color: '#00c853'}}>🚀 API送信プレビュー</h4>
          <div style={{display: 'flex', gap: '24px', alignItems: 'flex-start'}}>
            {uploadedImage && (
              <div>
                <div style={{fontSize: '13px', color: '#333', marginBottom: 4}}>送信画像</div>
                <img src={uploadedImage} alt="送信画像" style={{maxWidth: 180, maxHeight: 120, border: '1px solid #ccc', borderRadius: 6}} />
              </div>
            )}
            {maskData && (
              <div>
                <div style={{fontSize: '13px', color: '#333', marginBottom: 4}}>送信マスク画像（白:編集/黒:非編集）</div>
                <img src={maskPreviewUrl || maskData} alt="送信マスク" style={{maxWidth: 180, maxHeight: 120, border: '1px solid #333', borderRadius: 6, background: '#222'}} />
              </div>
            )}
          </div>
          <div style={{fontSize: '12px', color: '#666', marginTop: 8}}>
            ※このマスク画像がAPIに送信されるよ！白い部分だけ編集される仕様だよ〜
          </div>
        </div>
      )}
      {loading && (
        <div style={{
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '100%',
            height: '4px',
            backgroundColor: '#e0e0e0',
            borderRadius: '2px',
            overflow: 'hidden',
            marginBottom: '8px'
          }}>
            <div style={{
              width: '30%',
              height: '100%',
              backgroundColor: '#007acc',
              borderRadius: '2px',
              animation: 'loading-slide 2s ease-in-out infinite alternate'
            }}></div>
          </div>
          <p style={{ 
            margin: 0, 
            fontSize: '13px', 
            color: '#666'        }}>
            AI画像編集を実行中です...
          </p>
        </div>
      )}
    </div>
  );
};

export default ImageEditPanel;
