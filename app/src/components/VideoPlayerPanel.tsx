// components/VideoPlayerPanel.tsx - 動画プレイヤーパネルコンポーネント
import React from 'react';
import { VideoHistoryItem } from '../types';

interface VideoPlayerPanelProps {
  selectedVideo: VideoHistoryItem | null;
}

const VideoPlayerPanel: React.FC<VideoPlayerPanelProps> = ({ selectedVideo }) => {
  if (!selectedVideo || !selectedVideo.videoUrl) {
    return (
      <div className="right">
        <div style={{ textAlign: 'center', color: '#666', marginTop: '50px' }}>
          <h3>🎬 動画を選択してください</h3>
          <p>左側の動画履歴から動画を選択すると、ここで再生できます。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="right">
      <div>
        <h3>▶️ 動画再生</h3>
        <video 
          controls 
          style={{ width: '100%', maxWidth: '500px', borderRadius: '8px' }}
          key={selectedVideo.id}
        >
          <source src={selectedVideo.videoUrl} type="video/mp4" />
          お使いのブラウザは動画再生をサポートしていません。
        </video>
        <div style={{ marginTop: '12px', textAlign: 'left' }}>
          <p><strong>プロンプト:</strong> {selectedVideo.prompt}</p>
          <p><strong>設定:</strong> {selectedVideo.videoSettings.width}×{selectedVideo.videoSettings.height}, {selectedVideo.videoSettings.n_seconds}秒</p>
          <p><strong>生成日時:</strong> {new Date(selectedVideo.completedAt || selectedVideo.timestamp).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerPanel;
