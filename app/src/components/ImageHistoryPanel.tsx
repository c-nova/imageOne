// 📜 画像履歴表示パネルコンポーネント
import React from 'react';
import { ImageItem } from '../hooks/useImageGeneration';

interface ImageHistoryPanelProps {
  imageHistory: ImageItem[];
  selectedImage: ImageItem | null;
  loading: boolean;
  onRefresh: () => void;
  onImageSelect: (image: ImageItem | null) => void;
  onImageDelete: (image: ImageItem) => void;
  editMode?: boolean;
  onImg2Img?: (image: ImageItem) => void;
}

const ImageHistoryPanel: React.FC<ImageHistoryPanelProps> = ({
  imageHistory,
  selectedImage,
  loading,
  onRefresh,
  onImageSelect,
  onImageDelete,
  editMode,
  onImg2Img
}) => {
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return `${date.getFullYear()}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getDate().toString().padStart(2,'0')} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>
        <div style={{ marginBottom: 8 }}>🔄</div>
        <div>画像履歴を読み込み中...</div>
      </div>
    );
  }

  if (imageHistory.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 20, color: '#666', fontSize: 13 }}>
        <div style={{ marginBottom: 8 }}>🖼️</div>
        <div>まだ画像履歴がありません</div>
        <div style={{ fontSize: 11, marginTop: 4 }}>
          画像を生成すると<br/>ここに表示されます
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          onClick={onRefresh}
          style={{
            background: '#00c853',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            marginRight: 8
          }}
        >
          🔄 履歴を更新
        </button>
      </div>
      {imageHistory.map((image) => (
        <div 
          key={image.id}
          onClick={() => onImageSelect && onImageSelect(image)}
          style={{
            background: selectedImage?.id === image.id ? '#e0ffe0' : '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            fontSize: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative'
          }}
        >
          {image.imageUrl && (
            <div style={{ marginBottom: 8 }}>
              <img 
                src={image.imageUrl} 
                alt={image.prompt || '画像'}
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '120px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: '1px solid #ddd'
                }}
              />
            </div>
          )}
          <div style={{
            marginBottom: 8,
            fontSize: 11,
            lineHeight: 1.4,
            color: '#333',
            fontWeight: 'bold'
          }}>
            {image.prompt && image.prompt.length > 50 ? `${image.prompt.substring(0, 50)}...` : (image.prompt || '(プロンプトなし)')}
          </div>
          <div style={{
            fontSize: 10,
            color: '#666',
            marginBottom: 8
          }}>
            📐 {image.size || '-'}
          </div>
          <div style={{
            fontSize: 9,
            color: '#999'
          }}>
            📅 {formatTimestamp(image.timestamp)}
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              if (window.confirm('この画像を削除しますか？')) {
                onImageDelete(image);
              }
            }}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 10,
              cursor: 'pointer'
            }}
            title="画像を削除"
          >
            🗑️
          </button>
          {editMode && onImg2Img && (
            <button
              onClick={e => {
                e.stopPropagation();
                onImg2Img(image);
              }}
              style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                background: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: 10,
                cursor: 'pointer',
                marginTop: 4
              }}
              title="この画像でimg2img編集"
            >
              ✨ img2img
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export default ImageHistoryPanel;
