import React from 'react';
import { VideoHistoryItem } from './types';

interface VideoHistoryPanelProps {
  videoHistory?: VideoHistoryItem[];
  onVideoSelect?: (video: VideoHistoryItem) => void;
  onDeleteVideoHistory?: (videoId: string) => void;
}

const VideoHistoryPanel: React.FC<VideoHistoryPanelProps> = ({
  videoHistory = [],
  onVideoSelect,
  onDeleteVideoHistory
}) => {
  
  // 🎬 動画履歴のみ表示（videoJobsは無視）
  if (videoHistory.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: 20,
        color: '#666',
        fontSize: 13
      }}>
        <div style={{ marginBottom: 8 }}>🎬</div>
        <div>まだ動画履歴がありません</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          動画を取り込むと<br/>ここに表示されます
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      maxHeight: 'calc(100vh - 350px)', 
      overflowY: 'auto',
      paddingRight: 8 
    }}>
      {videoHistory.map((video) => (
        <div 
          key={video.id}
          onClick={() => onVideoSelect && onVideoSelect(video)}
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            cursor: onVideoSelect ? 'pointer' : 'default',
            transition: 'all 0.2s ease'
          }}
        >
          {video.thumbnailUrl && (
            <div style={{ marginBottom: 8 }}>
              <img 
                src={video.thumbnailUrl} 
                alt="Video thumbnail"
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '200px', // パネル高さ最大に拡大
                  objectFit: 'cover',
                  borderRadius: '8px', // 角丸も少し大きく
                  border: '1px solid #ddd',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)' // 影も追加してより立体感
                }}
                onLoad={() => console.log('🖼️ サムネイル画像読み込み成功:', video.thumbnailUrl)}
                onError={(e) => console.error('🖼️ サムネイル画像読み込み失敗:', video.thumbnailUrl, e)}
              />
            </div>
          )}
          {!video.thumbnailUrl && (
            <div style={{ 
              marginBottom: 8, 
              padding: '60px 20px', // 高さを大きく
              background: '#f5f5f5', 
              borderRadius: 8, // 角丸も合わせる
              textAlign: 'center',
              fontSize: 12,
              color: '#999',
              border: '1px solid #ddd'
            }}>
              📷 サムネイルなし
            </div>
          )}
          
          <div style={{
            marginBottom: 8,
            fontSize: 11,
            lineHeight: 1.4,
            color: '#333',
            fontWeight: 'bold'
          }}>
            {video.prompt.length > 50 ? `${video.prompt.substring(0, 50)}...` : video.prompt}
          </div>
          
          {/* 🆔 ジョブID表示（デバッグ用） */}
          {video.jobId && (
            <div style={{
              fontSize: 9,
              color: '#888',
              marginBottom: 6,
              fontFamily: 'monospace',
              backgroundColor: '#f8f9fa',
              padding: '2px 4px',
              borderRadius: 3,
              border: '1px solid #e9ecef'
            }}>
              Job ID: {video.jobId}
            </div>
          )}
          
          <div style={{
            fontSize: 10,
            color: '#666',
            marginBottom: 8
          }}>
            📐 {video.videoSettings?.width}×{video.videoSettings?.height} • 
            ⏱️ {video.videoSettings?.n_seconds}秒
            {video.metadata?.fileSize && ` • 📦 ${(video.metadata.fileSize / 1024 / 1024).toFixed(1)}MB`}
          </div>
          
          <div style={{
            fontSize: 9,
            color: '#999'
          }}>
            📅 {new Date(video.timestamp).toLocaleString('ja-JP', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
          
          {video.videoUrl && (
            <div style={{
              marginTop: 8,
              fontSize: 10,
              color: '#28a745',
              fontWeight: 'bold'
            }}>
              ✅ 再生可能
            </div>
          )}
          
          {/* 🗑️ 削除ボタン */}
          {onDeleteVideoHistory && (
            <div style={{ 
              marginTop: 8,
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button 
                onClick={() => onDeleteVideoHistory(video.id)}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c82333'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#dc3545'}
              >
                🗑️ 削除
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default VideoHistoryPanel;
