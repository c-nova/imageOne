import React from 'react';
import { VideoJob } from '../types';

interface VideoJobPanelProps {
  videoJobs?: VideoJob[];
  onDeleteJob?: (jobId: string) => void;
  onProcessCompleted?: (job: VideoJob) => void;
}

const VideoJobPanel: React.FC<VideoJobPanelProps> = ({
  videoJobs = [],
  onDeleteJob,
  onProcessCompleted
}) => {
  
  // 📋 動画ジョブがない場合の表示
  if (videoJobs.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: 20,
        color: '#666',
        fontSize: 13
      }}>
        <div style={{ marginBottom: 8 }}>🎬</div>
        <div>動画ジョブがありません</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          動画を生成すると<br/>ここに表示されます
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
      {videoJobs.map((job) => (
        <div 
          key={job.id}
          style={{
            background: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            position: 'relative'
          }}
        >
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{
                background: (job.status === 'completed' || job.status === 'succeeded') ? '#e8f5e8' : 
                           job.status === 'running' ? '#fff3e0' :
                           job.status === 'failed' ? '#ffebee' : '#f5f5f5',
                color: (job.status === 'completed' || job.status === 'succeeded') ? '#2e7d32' : 
                       job.status === 'running' ? '#f57f17' :
                       job.status === 'failed' ? '#c62828' : '#757575',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 'bold'
              }}>
                {job.status === 'pending' && '⏳ 待機中'}
                {job.status === 'running' && '🔄 生成中'}
                {(job.status === 'completed' || job.status === 'succeeded') && '✅ 完成'}
                {job.status === 'failed' && '❌ 失敗'}
                {job.status === 'cancelled' && '🚫 キャンセル'}
              </span>
            </div>
          </div>
          
          {/* 🖼️ 動画ジョブのサムネイル表示 */}
          {job.thumbnailUrl && (
            <div style={{ marginBottom: 12, width: '100%' }}>
              <img 
                src={job.thumbnailUrl} 
                alt="Video job thumbnail"
                style={{
                  width: '100%',
                  height: '150px', // 固定高さで大きく表示
                  objectFit: 'cover',
                  borderRadius: '8px',
                  border: '2px solid #ddd',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  display: 'block' // ブロック要素として確実に表示
                }}
                onLoad={() => console.log('🖼️ ジョブサムネイル画像読み込み成功:', job.thumbnailUrl)}
                onError={(e) => console.error('🖼️ ジョブサムネイル画像読み込み失敗:', job.thumbnailUrl, e)}
              />
            </div>
          )}
          
          <div style={{
            marginBottom: 8,
            fontSize: 11,
            lineHeight: 1.4,
            color: '#333'
          }}>
            {job.prompt.length > 60 ? `${job.prompt.substring(0, 60)}...` : job.prompt}
          </div>
          
          {/* 🆔 ジョブID表示（デバッグ用） */}
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
            ID: {job.id}
          </div>
          
          <div style={{
            fontSize: 10,
            color: '#666',
            marginBottom: 8
          }}>
            📐 {job.videoSettings?.width}×{job.videoSettings?.height} • 
            ⏱️ {job.videoSettings?.n_seconds}秒 • 
            📅 {job.startTime ? new Date(job.startTime).toLocaleTimeString() : ''}
          </div>
          
          {/* 🔄 完成ジョブの取り込みボタン */}
          {(job.status === 'completed' || job.status === 'succeeded') && onProcessCompleted && (
            <div style={{ marginBottom: 8 }}>
              <button 
                onClick={() => onProcessCompleted(job)}
                style={{
                  background: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '6px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                  marginRight: 8
                }}
              >
                📥 履歴に取り込み
              </button>
            </div>
          )}
          
          {/* 🗑️ 削除ボタン */}
          {onDeleteJob && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button 
                onClick={() => onDeleteJob(job.id)}
                style={{
                  background: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 10,
                  cursor: 'pointer'
                }}
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

export default VideoJobPanel;
