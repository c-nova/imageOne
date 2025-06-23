// 🎭 画像生成パネルコンポーネント
import React from 'react';
import { CameraSettings } from '../hooks/useImageGeneration';
import type { ImageStyle } from '../hooks/useImageGeneration';

interface ImageGenerationPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  originalPrompt: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
  setSize: (size: '1024x1024' | '1536x1024' | '1024x1536') => void;
  loading: boolean;
  loadingRec: boolean;
  recommendedPrompt: string;
  cameraSettings: CameraSettings;
  setCameraSettings: (settings: CameraSettings) => void;
  imageStyle: ImageStyle;
  setImageStyle: (style: ImageStyle) => void;
  onImageGenerate: () => void;
  onGenerateRecommended: () => void;
  onUseRecommendedPrompt: () => void;
}

const IMAGE_STYLES = [
  { label: '超リアル写真', value: 'Ultra Realistic Photo' },
  { label: 'スナップ写真', value: 'Casual Snapshot' },
  { label: 'ポートレート', value: 'Portrait' },
  { label: 'シネマ風', value: 'Cinematic' },
  { label: '3Dレンダリング', value: '3D Rendered' },
  { label: 'デジタルアート', value: 'Digital Art' },
  { label: 'コンセプトアート', value: 'Concept Art' },
  { label: '写実レンダー', value: 'Photorealistic Render' },
  { label: 'アニメ風', value: 'Anime Style' },
  { label: 'マンガ', value: 'Manga' },
  { label: 'ジブリ風', value: 'Studio Ghibli Style' },
  { label: 'キャラデザ', value: 'Character Design' },
  { label: '油絵', value: 'Oil Painting' },
  { label: '水彩画', value: 'Watercolor' },
  { label: 'スケッチ', value: 'Sketch Drawing' },
  { label: '印象派', value: 'Impressionist' },
];

const ImageGenerationPanel: React.FC<ImageGenerationPanelProps> = ({
  prompt,
  setPrompt,
  originalPrompt,
  size,
  setSize,
  loading,
  loadingRec,
  recommendedPrompt,
  cameraSettings,
  setCameraSettings,
  imageStyle,
  setImageStyle,
  onImageGenerate,
  onGenerateRecommended,
  onUseRecommendedPrompt
}) => {
  return (
    <div className="generation-panel">
      <div className="panel-header">
        <h2>🎭 画像生成</h2>
        <p>AIによる高品質画像生成</p>
      </div>

      {/* プロンプト入力 */}
      <div className="input-section">
        <label htmlFor="prompt">✨ プロンプト</label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="生成したい画像を詳しく説明してください..."
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
        
        {originalPrompt && originalPrompt !== prompt && (
          <div className="original-prompt-info">
            💡 元のプロンプト: {originalPrompt}
          </div>
        )}
      </div>

      {/* 推奨プロンプト機能 */}
      <div className="recommended-section" style={{ marginBottom: '20px' }}>
        <button
          onClick={onGenerateRecommended}
          disabled={!prompt.trim() || loadingRec || loading}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: loadingRec ? '#ccc' : '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loadingRec ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          {loadingRec ? '⏳ 生成中...' : '💡 推奨プロンプト生成'}
        </button>
        
        {recommendedPrompt && (
          <div style={{
            marginTop: '12px',
            padding: '16px',
            backgroundColor: '#f8f9ff',
            borderRadius: '8px',
            border: '1px solid #d0d7ff'
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#4a5568' }}>💫 AI推奨プロンプト:</h4>
            <div style={{ 
              marginBottom: '12px', 
              fontSize: '14px', 
              color: '#2d3748',
              lineHeight: '1.5'
            }}>
              {recommendedPrompt}
            </div>
            <button 
              onClick={onUseRecommendedPrompt}
              style={{
                padding: '6px 12px',
                backgroundColor: '#007acc',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '500'
              }}
            >
              ✅ この推奨プロンプトを使用
            </button>
          </div>
        )}
      </div>

      {/* 画像サイズ選択 */}
      <div className="size-section" style={{ marginBottom: '20px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600',
          color: '#4a5568'
        }}>
          📐 画像サイズ
        </label>
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap' 
        }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            border: '2px solid',
            borderColor: size === '1024x1024' ? '#007acc' : '#e0e0e0',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: size === '1024x1024' ? '#f0f8ff' : 'white',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="radio"
              value="1024x1024"
              checked={size === '1024x1024'}
              onChange={(e) => setSize(e.target.value as any)}
              disabled={loading}
              style={{ margin: 0 }}
            />
            <span>🟩 正方形 (1024×1024)</span>
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            border: '2px solid',
            borderColor: size === '1536x1024' ? '#007acc' : '#e0e0e0',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: size === '1536x1024' ? '#f0f8ff' : 'white',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="radio"
              value="1536x1024"
              checked={size === '1536x1024'}
              onChange={(e) => setSize(e.target.value as any)}
              disabled={loading}
              style={{ margin: 0 }}
            />
            <span>📺 横長 (1536×1024)</span>
          </label>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            border: '2px solid',
            borderColor: size === '1024x1536' ? '#007acc' : '#e0e0e0',
            borderRadius: '6px',
            cursor: 'pointer',
            backgroundColor: size === '1024x1536' ? '#f0f8ff' : 'white',
            fontSize: '13px',
            fontWeight: '500'
          }}>
            <input
              type="radio"
              value="1024x1536"
              checked={size === '1024x1536'}
              onChange={(e) => setSize(e.target.value as any)}
              disabled={loading}
              style={{ margin: 0 }}
            />
            <span>📱 縦長 (1024×1536)</span>
          </label>
        </div>
      </div>

      {/* 画像スタイル選択 */}
      <div className="style-section" style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontWeight: '600',
          color: '#4a5568'
        }}>
          🎨 画像スタイル
        </label>
        <select
          value={imageStyle}
          onChange={e => setImageStyle(e.target.value as ImageStyle)}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: '6px',
            border: '2px solid #e0e0e0',
            fontSize: '14px',
            fontWeight: '500',
            background: '#f8f9ff',
            color: '#333',
            marginBottom: '4px'
          }}
        >
          {IMAGE_STYLES.map(style => (
            <option key={style.value} value={style.value}>{style.label}</option>
          ))}
        </select>
      </div>

      {/* プロフェッショナルカメラ設定 */}
      <div className="camera-section">
        <h3>📸 プロフェッショナルカメラ設定</h3>
        
        <div className="camera-settings">
          <div className="setting-group">
            <label>🔍 焦点距離: {cameraSettings.focalLength}mm</label>
            <input
              type="range"
              min="10"
              max="200"
              value={cameraSettings.focalLength}
              onChange={(e) => setCameraSettings({
                ...cameraSettings,
                focalLength: parseInt(e.target.value)
              })}
              disabled={loading}
            />
            <div className="range-labels">
              <span>10mm (超広角)</span>
              <span>200mm (望遠)</span>
            </div>
          </div>

          <div className="setting-group">
            <label>📷 絞り値: f/{cameraSettings.aperture}</label>
            <input
              type="range"
              min="2"
              max="10"
              step="0.1"
              value={cameraSettings.aperture}
              onChange={(e) => setCameraSettings({
                ...cameraSettings,
                aperture: parseFloat(e.target.value)
              })}
              disabled={loading}
            />
            <div className="range-labels">
              <span>f/2.0 (浅い被写界深度)</span>
              <span>f/10 (深い被写界深度)</span>
            </div>
          </div>

          <div className="setting-group">
            <label>🌡️ 色温度: {cameraSettings.colorTemp}K</label>
            <input
              type="range"
              min="2000"
              max="10000"
              step="100"
              value={cameraSettings.colorTemp}
              onChange={(e) => setCameraSettings({
                ...cameraSettings,
                colorTemp: parseInt(e.target.value)
              })}
              disabled={loading}
            />
            <div className="range-labels">
              <span>2000K (温かい)</span>
              <span>10000K (涼しい)</span>
            </div>
          </div>
        </div>
      </div>

      {/* 生成ボタン */}
      <div className="generate-section">
        <button
          onClick={onImageGenerate}
          disabled={!prompt.trim() || loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: loading ? '#ccc' : '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s'
          }}
        >
          {loading ? '🎨 生成中...' : '🚀 画像生成'}
        </button>
        
        {loading && (
          <div style={{
            marginTop: '12px',
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
              color: '#666'
            }}>
              高品質AI画像を生成中です...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageGenerationPanel;
