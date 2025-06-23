// components/VideoGenerationPanel.tsx - 動画生成パネルコンポーネント
import React from 'react';
import { VideoAspectRatio, VideoResolution, VideoDuration, VideoVariation } from '../types';

interface VideoGenerationPanelProps {
  videoPrompt: string;
  setVideoPrompt: (value: string) => void;
  videoAspectRatio: VideoAspectRatio;
  setVideoAspectRatio: (value: VideoAspectRatio) => void;
  videoResolution: VideoResolution;
  setVideoResolution: (value: VideoResolution) => void;
  videoDuration: VideoDuration;
  setVideoDuration: (value: VideoDuration) => void;
  videoVariation: VideoVariation;
  setVideoVariation: (value: VideoVariation) => void;
  videoLoading: boolean;
  loadingRec: boolean;
  recommendedPrompt: string;
  onVideoGenerate: () => void;
  onGenerateRecommended: () => void;
  onUseRecommendedPrompt: () => void;
}

const VideoGenerationPanel: React.FC<VideoGenerationPanelProps> = ({
  videoPrompt,
  setVideoPrompt,
  videoAspectRatio,
  setVideoAspectRatio,
  videoResolution,
  setVideoResolution,
  videoDuration,
  setVideoDuration,
  videoVariation,
  setVideoVariation,
  videoLoading,
  loadingRec,
  recommendedPrompt,
  onVideoGenerate,
  onGenerateRecommended,
  onUseRecommendedPrompt,
}) => {
  return (
    <div className="top">
      <h2>🎬 ImageOne - 動画生成</h2>
      
      {/* 動画プロンプト入力 */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600',
          color: '#4a5568'
        }}>
          ✨ 動画プロンプト
        </label>
        <textarea 
          value={videoPrompt}
          onChange={(e) => setVideoPrompt(e.target.value)}
          placeholder="動画生成のプロンプトを入力してください..."
          rows={4}
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
      </div>
      
      {/* 動画設定 */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ 
          margin: '0 0 12px 0', 
          fontSize: '16px', 
          fontWeight: '600',
          color: '#4a5568'
        }}>⚙️ 動画設定</h3>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
          gap: '12px' 
        }}>
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontSize: '13px',
              fontWeight: '500',
              color: '#666'
            }}>
              📐 アスペクト比
            </label>
            <select 
              value={videoAspectRatio} 
              onChange={(e) => setVideoAspectRatio(e.target.value as VideoAspectRatio)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '2px solid #e0e0e0',
                fontSize: '13px'
              }}
            >
              <option value="1:1">1:1 (正方形)</option>
              <option value="16:9">16:9 (横長)</option>
              <option value="9:16">9:16 (縦長)</option>
            </select>
          </div>
          
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontSize: '13px',
              fontWeight: '500',
              color: '#666'
            }}>
              🎬 解像度
            </label>
            <select 
              value={videoResolution} 
              onChange={(e) => setVideoResolution(e.target.value as VideoResolution)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '2px solid #e0e0e0',
                fontSize: '13px'
              }}
            >
              <option value="480p">480p</option>
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </div>
          
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontSize: '13px',
              fontWeight: '500',
              color: '#666'
            }}>
              ⏱️ 再生時間
            </label>
            <select 
              value={videoDuration} 
              onChange={(e) => setVideoDuration(Number(e.target.value) as VideoDuration)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '2px solid #e0e0e0',
                fontSize: '13px'
              }}
            >
              <option value={5}>5秒</option>
              <option value={10}>10秒</option>
              <option value={15}>15秒</option>
              <option value={20}>20秒</option>
            </select>
          </div>
          
          <div>
            <label style={{ 
              display: 'block', 
              marginBottom: '4px', 
              fontSize: '13px',
              fontWeight: '500',
              color: '#666'
            }}>
              🎭 バリエーション
            </label>
            <select 
              value={videoVariation} 
              onChange={(e) => setVideoVariation(Number(e.target.value) as VideoVariation)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '2px solid #e0e0e0',
                fontSize: '13px'
              }}
            >
              <option value={1}>1つ</option>
              <option value={2}>2つ</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* 推奨プロンプト生成ボタン */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={onGenerateRecommended}
          disabled={loadingRec}
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
        
        {/* 推奨プロンプト表示 */}
        {recommendedPrompt && (
          <div style={{ 
            marginTop: '12px', 
            padding: '16px', 
            backgroundColor: '#f8f9ff', 
            borderRadius: '8px',
            border: '1px solid #d0d7ff'
          }}>
            <strong style={{ color: '#4a5568' }}>💡 推奨プロンプト:</strong>
            <p style={{ 
              margin: '8px 0', 
              fontSize: '14px',
              color: '#2d3748',
              lineHeight: '1.5'
            }}>
              {recommendedPrompt}
            </p>
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
              ✅ 使用する
            </button>
          </div>
        )}
      </div>

      {/* 動画生成ボタン */}
      <button 
        onClick={onVideoGenerate}
        disabled={videoLoading || !videoPrompt.trim()}
        style={{ 
          width: '100%', 
          padding: '14px', 
          backgroundColor: videoLoading ? '#ccc' : '#007acc',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: videoLoading ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        {videoLoading ? '🔄 生成中...' : '🎬 動画生成'}
      </button>
    </div>
  );
};

export default VideoGenerationPanel;
