import React, { useState, useEffect } from 'react';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { getMsalConfig } from './msalConfig';
import { useVideoGeneration } from './hooks/useVideoGeneration';
import { useImageGeneration } from './hooks/useImageGeneration';
import { useImageEdit } from './hooks/useImageEdit';
import { usePresentationGeneration } from './hooks/usePresentationGeneration';
import { usePowerPointGeneration } from './hooks/usePowerPointGeneration';
import VideoGenerationPanel from './components/VideoGenerationPanel';
import ImageGenerationPanel from './components/ImageGenerationPanel';
import ImageEditPanel from './components/ImageEditPanel';
import ImageHistoryPanel from './components/ImageHistoryPanel';
import PresentationGenerationPanel from './components/PresentationGenerationPanel';
import PresentationPreviewPanel from './components/PresentationPreviewPanel';
import VideoJobPanel from './components/VideoJobPanel';
import VideoHistoryPanel from './VideoHistoryPanel';
import LoginPage from './components/LoginPage';
import './App.css';

// アプリモード定義（4つのモード統合！）
type AppMode = 'generate' | 'edit' | 'video' | 'presentation';

function AppContent() {
  // ===== 🎯 モード管理（4つのモード統合！） =====
  const [currentMode, setCurrentMode] = useState<AppMode>('generate');
  // ===== 🔌 フック統合 =====
  const videoHooks = useVideoGeneration();
  const imageHooks = useImageGeneration();
  const presentationHooks = usePresentationGeneration();
  const powerPointHooks = usePowerPointGeneration();
  // ✏️ 画像編集フック（履歴更新コールバック付き）
  const editHooks = useImageEdit(() => {
    // 編集成功時に画像履歴を自動更新
    console.log('🔄 編集完了！画像履歴を自動更新中...');
    imageHooks.handleImageHistoryRefresh();
  });
  // ===== 🔐 認証状態 =====
  const isAuthenticated = useIsAuthenticated();
  const { instance } = useMsal();
  // ===== 🎨 コンテンツフィルタエラー用state =====
  const [showContentFilterError, setShowContentFilterError] = useState<{show: boolean, message: string}>({show: false, message: ''});
  // ===== 📊 履歴パネル表示状態 =====
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  
  // ===== 🖼️ 画像履歴の画像を選択したとき、プロンプトも自動でセット =====
  const handleImageHistorySelect = (image: any) => {
    imageHooks.handleImageSelect(image);
    if (image && image.prompt) {
      imageHooks.setPrompt(image.prompt);
    }
  };

  // ===== 📜 画像履歴を初回自動取得（認証後のみ） =====
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAuthenticated) {
      imageHooks.handleImageHistoryRefresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // imageHooksの依存を削除

  // ===== 📜 プレゼンテーションモード時は履歴パネルを自動で閉じる =====
  useEffect(() => {
    if (currentMode === 'presentation') {
      setShowHistoryPanel(false);
    }
  }, [currentMode]);

  // ===== 🎨 キャンバスサイズ自動調整（編集モード用） =====
  useEffect(() => {
    console.log('🔍 useEffect実行チェック:', {
      currentMode,
      hasUploadedImage: !!editHooks.uploadedImage,
      hasCanvasRef: !!editHooks.canvasRef.current,
      uploadedImageUrl: editHooks.uploadedImage?.substring(0, 50) + '...',
      showHistoryPanel
    });
    
    if (currentMode === 'edit' && editHooks.uploadedImage && editHooks.canvasRef.current) {
      const canvas = editHooks.canvasRef.current;
      console.log('🔧 キャンバスサイズ調整開始... (履歴パネル:', showHistoryPanel ? '開' : '閉', ')');
      
      // 画像読み込み完了後にキャンバスサイズを調整
      const adjustCanvasSize = () => {
        console.log('🔍 画像要素を検索中...');
        const imgElement = document.querySelector('.edit-background-image') as HTMLImageElement;
        
        if (imgElement) {
          console.log('✅ 画像要素発見！', {
            complete: imgElement.complete,
            naturalWidth: imgElement.naturalWidth,
            naturalHeight: imgElement.naturalHeight,
            offsetWidth: imgElement.offsetWidth,
            offsetHeight: imgElement.offsetHeight
          });
          
          // 画像が完全に読み込まれるまで待つ
          if (imgElement.complete && imgElement.naturalWidth > 0) {
            const displayedWidth = imgElement.offsetWidth;
            const displayedHeight = imgElement.offsetHeight;
            
            if (displayedWidth > 0 && displayedHeight > 0) {
              // 🎨 既存のマスクデータを保存
              const ctx = canvas.getContext('2d');
              let imageData = null;
              try {
                if (canvas.width > 0 && canvas.height > 0) {
                  imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
                  console.log('💾 マスクデータを保存しました');
                }
              } catch (e) {
                console.log('⚠️ マスクデータの保存に失敗:', e);
              }
              
              // キャンバスサイズを変更
              canvas.width = displayedWidth;
              canvas.height = displayedHeight;
              canvas.style.width = `${displayedWidth}px`;
              canvas.style.height = `${displayedHeight}px`;
              
              // 🎨 マスクデータを復元（サイズが変わった場合はスケール調整）
              if (imageData && ctx) {
                try {
                  // 新しいサイズに合わせてスケール調整
                  const tempCanvas = document.createElement('canvas');
                  const tempCtx = tempCanvas.getContext('2d');
                  if (tempCtx) {
                    tempCanvas.width = imageData.width;
                    tempCanvas.height = imageData.height;
                    tempCtx.putImageData(imageData, 0, 0);
                    
                    // 新しいキャンバスにスケール調整して描画
                    ctx.drawImage(tempCanvas, 0, 0, imageData.width, imageData.height, 0, 0, displayedWidth, displayedHeight);
                    console.log('🔄 マスクデータを復元・スケール調整しました');
                  }
                } catch (e) {
                  console.log('⚠️ マスクデータの復元に失敗:', e);
                }
              }
              
              console.log(`🎨 キャンバスサイズ調整: ${displayedWidth}×${displayedHeight}`);
              console.log(`📐 画像実サイズ: ${imgElement.naturalWidth}×${imgElement.naturalHeight}`);
              console.log(`📐 キャンバス実サイズ: ${canvas.width}×${canvas.height}`);
              return true; // 調整完了
            } else {
              console.log('⚠️ 画像の表示サイズが0です');
            }
          } else {
            // 画像がまだ読み込み中の場合は少し待ってから再試行
            console.log('⏳ 画像読み込み待機中...');
            setTimeout(adjustCanvasSize, 50);
          }
        } else {
          console.log('❌ 画像要素が見つかりません (.edit-background-image)');
        }
        return false;
      };
      
      // 複数のタイミングで調整を試行（履歴パネル開閉時は少し長めに待つ）
      setTimeout(() => adjustCanvasSize(), 10);
      setTimeout(() => adjustCanvasSize(), 100);
      setTimeout(() => adjustCanvasSize(), 300);
      setTimeout(() => adjustCanvasSize(), 500); // 履歴パネルのアニメーション完了を待つ
      setTimeout(() => adjustCanvasSize(), 1000);
      
      // リサイズイベントにも対応（デバウンス付き）
      let resizeTimeout: NodeJS.Timeout;
      const resizeHandler = () => {
        console.log('🔄 リサイズイベント発生');
        // デバウンス：連続するリサイズイベントをまとめる
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          adjustCanvasSize();
        }, 100); // 100ms後に実行
      };
      window.addEventListener('resize', resizeHandler);
      
      // プレビュー領域のサイズ変更を監視（履歴パネル開閉を検知）
      const previewElement = document.querySelector('.preview-wrapper');
      let resizeObserver: ResizeObserver;
      if (previewElement) {
        resizeObserver = new ResizeObserver(() => {
          console.log('📐 プレビュー領域サイズ変更検知');
          clearTimeout(resizeTimeout);
          resizeTimeout = setTimeout(() => {
            adjustCanvasSize();
          }, 200); // レイアウト変更完了を待つ
        });
        resizeObserver.observe(previewElement);
      }
      
      return () => {
        window.removeEventListener('resize', resizeHandler);
        clearTimeout(resizeTimeout);
        if (resizeObserver) {
          resizeObserver.disconnect();
        }
      };
    } else {
      console.log('❌ useEffect条件不満足');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMode, editHooks.uploadedImage, showHistoryPanel]); // 履歴パネルの開閉も監視

  // ===== 🚪 ログインしていない場合のモーダル =====
  if (!isAuthenticated) {
    return <LoginPage onLogin={() => instance.loginPopup()} />;
  }

  // ===== 🎨 メインUI =====
  return (
    <div className="App">
      {/* ===== 🚨 コンテンツフィルタエラーポップアップ ===== */}
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
                setShowContentFilterError({show: false, message: ''});
              }}
            >
              プロンプトをクリア
            </button>
          </div>
        </div>
      )}

      {/* ===== 🏢 ヘッダー：モード切り替えタブ ===== */}
      <div className="header" style={{ 
        background: 'linear-gradient(90deg, #a8ff78 0%, #00e676 100%)',
        padding: '16px 24px',
        borderBottom: '2px solid rgba(0,230,118,0.2)',
        boxShadow: '0 4px 20px rgba(0,230,118,0.08)'
      }}>
        <div className="header-content" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          {/* ロゴ */}
          <h1 className="logo">
            🎨 ImageOne - AI画像・動画生成
          </h1>
          
          {/* モード切り替えタブ（3つのモード！） */}
          <div className="mode-tabs" style={{ display: 'flex', gap: '8px' }}>
            <button
              className={`mode-tab ${currentMode === 'generate' ? 'active' : ''}`}
              onClick={() => setCurrentMode('generate')}
              style={{
                background: currentMode === 'generate' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                color: currentMode === 'generate' ? '#155724' : '#155724',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: currentMode === 'generate' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)'
              }}
            >
              🎭 画像生成
            </button>
            <button
              className={`mode-tab ${currentMode === 'edit' ? 'active' : ''}`}
              onClick={() => {
                setCurrentMode('edit');
                // 編集モードに切り替えた時に前の編集結果をリセット
                if (editHooks.editedImage) {
                  console.log('🔄 編集モード切り替え: 前の編集結果をリセット');
                  editHooks.resetEditResult();
                }
              }}
              style={{
                background: currentMode === 'edit' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                color: currentMode === 'edit' ? '#155724' : '#155724',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: currentMode === 'edit' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)'
              }}
            >
              🖼️ 画像編集
            </button>
            <button
              className={`mode-tab ${currentMode === 'video' ? 'active' : ''}`}
              onClick={() => setCurrentMode('video')}
              style={{
                background: currentMode === 'video' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                color: currentMode === 'video' ? '#155724' : '#155724',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: currentMode === 'video' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)'
              }}
            >
              🎬 動画生成
            </button>
            <button
              className={`mode-tab ${currentMode === 'presentation' ? 'active' : ''}`}
              onClick={() => setCurrentMode('presentation')}
              style={{
                background: currentMode === 'presentation' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.2)',
                color: currentMode === 'presentation' ? '#155724' : '#155724',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontWeight: currentMode === 'presentation' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.3s ease',
                backdropFilter: 'blur(10px)'
              }}
            >
              📊 PowerPoint
            </button>
          </div>

          {/* ログアウトボタン */}
          <button 
            onClick={() => instance.logoutPopup()}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.3s ease'
            }}
          >
            🚪 ログアウト
          </button>
        </div>
      </div>

      {/* ===== 📱 メインコンテンツ：3カラムレイアウト ===== */}
      <div className="container" style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        minHeight: 'calc(100vh - 80px)',
        width: '100vw', 
        boxSizing: 'border-box'
      }}>
        {/* ===== 🎛️ 左側：操作パネル ===== */}
        <div className="left" style={{ 
          minWidth: 0, 
          maxWidth: '100%', 
          width: 'auto', 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column',
          background: '#fafafa',
          borderRight: '1px solid #e0e0e0'
        }}>
          {/* 現在のモードに応じてパネルを切り替え */}
          {currentMode === 'generate' && (
            <ImageGenerationPanel
              prompt={imageHooks.prompt}
              setPrompt={imageHooks.setPrompt}
              originalPrompt={imageHooks.originalPrompt}
              size={imageHooks.size}
              setSize={imageHooks.setSize}
              loading={imageHooks.loading}
              loadingRec={imageHooks.loadingRec}
              recommendedPrompt={imageHooks.recommendedPrompt}
              cameraSettings={imageHooks.cameraSettings}
              setCameraSettings={imageHooks.setCameraSettings}
              imageStyle={imageHooks.imageStyle}
              setImageStyle={imageHooks.setImageStyle}
              onImageGenerate={imageHooks.handleImageGenerate}
              onGenerateRecommended={imageHooks.generateRecommendedPrompt}
              onUseRecommendedPrompt={imageHooks.useRecommendedPrompt}
            />
          )}

          {currentMode === 'edit' && (
            <ImageEditPanel
              editPrompt={editHooks.editPrompt}
              setEditPrompt={editHooks.setEditPrompt}
              uploadedImage={editHooks.uploadedImage}
              editedImage={editHooks.editedImage}
              loading={editHooks.loading}
              detectedSize={editHooks.detectedSize}
              canvasRef={editHooks.canvasRef}
              isDrawing={editHooks.isDrawing}
              hasMask={editHooks.hasMask}
              onImageUpload={editHooks.handleImageUpload}
              onImageEdit={editHooks.handleImageEdit}
              onResetEdit={editHooks.resetEdit}
              startDrawing={editHooks.startDrawing}
              draw={editHooks.draw}
              stopDrawing={editHooks.stopDrawing}
              clearMask={editHooks.clearMask}
              maskData={editHooks.maskData} // 追加
            />
          )}

          {currentMode === 'video' && (
            <>
              <VideoGenerationPanel
                videoPrompt={videoHooks.videoPrompt}
                setVideoPrompt={videoHooks.setVideoPrompt}
                videoAspectRatio={videoHooks.videoAspectRatio}
                setVideoAspectRatio={videoHooks.setVideoAspectRatio}
                videoResolution={videoHooks.videoResolution}
                setVideoResolution={videoHooks.setVideoResolution}
                videoDuration={videoHooks.videoDuration}
                setVideoDuration={videoHooks.setVideoDuration}
                videoVariation={videoHooks.videoVariation}
                setVideoVariation={videoHooks.setVideoVariation}
                videoLoading={videoHooks.videoLoading}
                loadingRec={videoHooks.loadingRec}
                recommendedPrompt={videoHooks.recommendedPrompt}
                onVideoGenerate={videoHooks.handleVideoGenerate}
                onGenerateRecommended={videoHooks.generateRecommendedVideo}
                onUseRecommendedPrompt={videoHooks.useRecommendedPrompt}
              />
              
              {/* ===== 🎬 動画ジョブリスト（生成進行状況）===== */}
              <div style={{
                margin: '16px',
                padding: '16px',
                background: '#fff',
                borderRadius: '12px',
                border: '1px solid #e0e0e0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: '16px', 
                    fontWeight: 'bold',
                    color: '#333' 
                  }}>
                    🎬 動画ジョブ状況
                  </h3>
                  <button 
                    onClick={videoHooks.handleVideoJobsRefresh}
                    style={{
                      background: '#007acc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🔄 更新
                  </button>
                </div>
                
                <VideoJobPanel
                  videoJobs={videoHooks.activeVideoJobs}
                  onDeleteJob={(jobId: string) => {
                    const job = videoHooks.activeVideoJobs.find(j => j.id === jobId);
                    if (job) videoHooks.handleDeleteVideoJob(job);
                  }}
                  onProcessCompleted={(job) => videoHooks.handleProcessCompletedJobWithDelete(job)}
                />
              </div>
            </>
          )}

          {currentMode === 'presentation' && (
            <PresentationGenerationPanel
              prompt={presentationHooks.prompt}
              setPrompt={presentationHooks.setPrompt}
              generatedPlan={presentationHooks.generatedPlan}
              isAnalyzing={presentationHooks.isAnalyzing}
              error={presentationHooks.error}
              onAnalyze={presentationHooks.handleAnalyze}
              onReset={presentationHooks.resetPlan}
            />
          )}
        </div>

        {/* ===== 🖼️ 中央：プレビューエリア ===== */}
        <div className="preview-wrapper" style={{ 
          flex: 2,
          display: 'flex', 
          flexDirection: 'column',
          background: '#f5f5f5',
          minHeight: 0
        }}>
          <div className="preview" style={{
            flex: 1,
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            padding: currentMode === 'edit' ? '20px 20px 120px 20px' : '20px' // 編集モード時は下に大きな余白
          }}>
            {/* 現在のモードに応じて適切な画像/動画を表示 */}
            {currentMode === 'generate' && imageHooks.selectedImage && (
              <img
                src={imageHooks.selectedImage.imageUrl}
                alt="生成された画像"
                style={{ 
                  maxWidth: '90%', 
                  maxHeight: '90%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain', // 📐 比率を完全に維持
                  borderRadius: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
                }}
              />
            )}
            
            {currentMode === 'edit' && (
              <div className="edit-preview-area" style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                {/* 編集完了時は編集結果を表示 */}
                {editHooks.editedImage ? (
                  <div style={{
                    textAlign: 'center',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}>
                    <div style={{
                      fontSize: '20px',
                      fontWeight: 'bold',
                      color: '#2d5016',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}>
                      ✨ 編集完了！
                    </div>
                    <img
                      src={editHooks.editedImage}
                      alt="編集された画像"
                      style={{ 
                        maxWidth: '90%', 
                        maxHeight: '80%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain', // 📐 比率を完全に維持
                        borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(168,255,120,0.4)',
                        border: '3px solid #a8ff78'
                      }}
                    />
                    <div style={{
                      marginTop: '16px',
                      fontSize: '14px',
                      color: '#666',
                      background: 'rgba(168,255,120,0.15)',
                      padding: '8px 16px',
                      borderRadius: '8px'
                    }}>
                      💡 編集完了しました！履歴にも保存されています
                    </div>
                  </div>
                ) : (editHooks.uploadedImage || (currentMode === 'edit' && imageHooks.selectedImage)) ? (
                  // マスク描画エリア
                  <div className="canvas-container" style={{
                    position: 'relative',
                    maxWidth: '90%',
                    maxHeight: '90%'
                  }}>
                    {/* 背景画像 */}
                    <img 
                      src={editHooks.uploadedImage || imageHooks.selectedImage?.imageUrl} 
                      alt="編集対象" 
                      className="background-image edit-background-image"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '70vh',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain', // 📐 比率を維持
                        borderRadius: '8px'
                      }}
                    />
                    {/* マスク描画キャンバス */}
                    <canvas
                      ref={editHooks.canvasRef}
                      className="mask-canvas"
                      onMouseDown={editHooks.startDrawing}
                      onMouseMove={editHooks.draw}
                      onMouseUp={editHooks.stopDrawing}
                      onMouseLeave={editHooks.stopDrawing}
                      onTouchStart={editHooks.startTouchDrawing}
                      onTouchMove={editHooks.touchDraw}
                      onTouchEnd={editHooks.stopTouchDrawing}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        cursor: editHooks.isDrawing ? 'grabbing' : 'crosshair',
                        pointerEvents: editHooks.loading ? 'none' : 'auto',
                        touchAction: 'none' // タッチスクロールを無効化
                      }}
                    />
                    
                    {/* マスク操作ボタン */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-100px', // -60px から -100px に変更（さらに下に移動）
                      left: '50%',
                      transform: 'translateX(-50%)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      alignItems: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: '12px',
                        alignItems: 'center'
                      }}>
                        <button
                          onClick={editHooks.clearMask}
                          disabled={!editHooks.hasMask || editHooks.loading}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: editHooks.hasMask && !editHooks.loading ? '#ff6b6b' : '#ccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: editHooks.hasMask && !editHooks.loading ? 'pointer' : 'not-allowed'
                          }}
                        >
                          🧹 マスククリア
                        </button>
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          fontWeight: '500'
                        }}>
                          {editHooks.hasMask ? '✅ マスクあり（部分編集）' : '⭕ マスクなし（全体編集）'}
                        </div>
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#999',
                        textAlign: 'center',
                        maxWidth: '300px'
                      }}>
                        💡 画像上を赤いペンでドラッグして変更したい部分をマークしてください
                      </div>
                    </div>
                  </div>
                ) : (
                  // 画像未アップロード時の表示
                  <div style={{
                    textAlign: 'center',
                    color: '#999',
                    fontSize: '16px'
                  }}>
                    📁 画像をアップロードしてください
                  </div>
                )}
              </div>
            )}
            
            {currentMode === 'presentation' && presentationHooks.generatedPlan && (
              <div style={{ 
                textAlign: 'center', 
                width: '100%', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center', 
                alignItems: 'center',
                padding: '12px' // 20px → 12px に縮小！🎯
              }}>
                {/* 実際のスライド画像プレビュー */}
                <PresentationPreviewPanel
                  presentationPlan={presentationHooks.generatedPlan}
                  onUpdatePlan={(updatedPlan) => {
                    console.log('🔄 プレゼンテーション更新:', updatedPlan);
                    presentationHooks.updateGeneratedPlan(updatedPlan);
                  }}
                  onDownloadPowerPoint={(theme, masterStyle) => powerPointHooks.generatePowerPoint(presentationHooks.generatedPlan!, theme, masterStyle)}
                  isGenerating={powerPointHooks.isGenerating}
                />
              </div>
            )} 
            
            {currentMode === 'video' && videoHooks.selectedVideo && videoHooks.selectedVideo.videoUrl && (
              <div style={{ textAlign: 'center', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <video
                  src={videoHooks.selectedVideo.videoUrl}
                  controls
                  autoPlay
                  style={{ 
                    maxWidth: '90%', 
                    maxHeight: '70%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain', // 📐 比率を完全に維持
                    borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
                    marginBottom: '16px',
                    margin: '0 auto 16px auto'
                  }}
                />
                
                {/* 動画情報とダウンロードボタン */}
                <div style={{
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: '12px',
                  padding: '16px',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  maxWidth: '400px',
                  margin: '0 auto'
                }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#333',
                    marginBottom: '8px'
                  }}>
                    📝 {videoHooks.selectedVideo.prompt}
                  </div>
                  
                  <div style={{
                    fontSize: '12px',
                    color: '#666',
                    marginBottom: '12px'
                  }}>
                    📐 {videoHooks.selectedVideo.videoSettings?.width}×{videoHooks.selectedVideo.videoSettings?.height} • 
                    ⏱️ {videoHooks.selectedVideo.videoSettings?.n_seconds}秒
                    {videoHooks.selectedVideo.metadata?.fileSize && 
                      ` • 📦 ${(videoHooks.selectedVideo.metadata.fileSize / 1024 / 1024).toFixed(1)}MB`
                    }
                  </div>
                  
                  <button 
                    onClick={async () => {
                      console.log('🎯 ダウンロードボタンがクリックされました！', videoHooks.selectedVideo?.id);
                      
                      try {
                        // MSALから認証トークンを取得
                        const token = await videoHooks.getAuthToken();
                        console.log('🔐 トークンチェック:', token ? '✅ あり' : '❌ なし');
                        
                        if (!token) {
                          throw new Error('認証トークンが見つかりません。再ログインしてください。');
                        }
                        
                        // ダウンロードAPIを呼び出し
                        const response = await fetch(`/api/downloadVideo/${videoHooks.selectedVideo?.id}`, {
                          method: 'GET',
                          headers: {
                            'Authorization': `Bearer ${token}`
                          }
                        });

                        console.log('📡 API レスポンス:', response.status, response.statusText);

                        if (!response.ok) {
                          throw new Error(`ダウンロードエラー: ${response.status}`);
                        }

                        // ファイル名を取得（可能であれば）
                        const contentDisposition = response.headers.get('content-disposition');
                        let filename = `video_${videoHooks.selectedVideo?.id}.mp4`;
                        if (contentDisposition) {
                          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                          if (match && match[1]) {
                            filename = match[1].replace(/['"]/g, '');
                          }
                        }

                        // Blobを作成してダウンロード
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        
                        console.log('✅ ダウンロード完了:', filename);
                      } catch (error: any) {
                        console.error('❌ ダウンロードエラー:', error);
                        alert(`ダウンロードに失敗しました: ${error.message}`);
                      }
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #007acc 0%, #0056b3 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0,122,204,0.3)',
                      transition: 'all 0.3s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      margin: '0 auto'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,122,204,0.4)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,122,204,0.3)';
                    }}
                  >
                    📥 動画をダウンロード
                  </button>
                </div>
              </div>
            )}
            
            {/* デフォルト表示 */}
            {!imageHooks.selectedImage && 
             !editHooks.editedImage && 
             (!videoHooks.selectedVideo || !videoHooks.selectedVideo.videoUrl) &&
             !presentationHooks.generatedPlan && (
              <div style={{
                textAlign: 'center',
                color: '#666',
                fontSize: '18px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                  {currentMode === 'generate' && '🎭'}
                  {currentMode === 'video' && '🎬'}
                  {currentMode === 'presentation' && '📊'}
                </div>
                {currentMode === 'generate' && '画像生成を開始してください'}
                {currentMode === 'video' && '動画生成を開始してください'}
                {currentMode === 'presentation' && 'プレゼンテーション分析を開始してください'}
              </div>
            )}
          </div>
        </div>

        {/* ===== 📜 右側：履歴パネル ===== */}
        <div className="prompt-history-pane" style={{ 
          minWidth: showHistoryPanel ? 350 : 60, 
          maxWidth: showHistoryPanel ? 450 : 60,
          width: showHistoryPanel ? '25vw' : '60px', 
          background: showHistoryPanel ? 'linear-gradient(135deg, #e0ffe0 0%, #a8ff78 100%)' : 'rgba(255,255,255,0.7)',
            borderLeft: 'none',
            boxShadow: showHistoryPanel ? '0 4px 24px 0 rgba(0,230,118,0.10)' : 'none',
            borderRadius: showHistoryPanel ? '24px 0 0 24px' : '16px',
            margin: showHistoryPanel ? '16px 0 16px 8px' : '0',
            padding: showHistoryPanel ? 24 : 8, 
            boxSizing: 'border-box', 
            display: 'flex', 
            flexDirection: 'column',
            transition: 'all 0.3s cubic-bezier(.4,2,.6,1) 0.2s',
            position: 'relative',
            overflow: 'hidden',
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
            {showHistoryPanel 
              ? '✕' 
              : (currentMode === 'video' 
                  ? '🎬' 
                  : currentMode === 'presentation' 
                    ? '�' 
                    : '�📜'
                )
            }
          </button>

          {showHistoryPanel && (
            <>
              <div style={{ marginTop: 50 }}>
                <h3 style={{ 
                  margin: '0 0 18px 0', 
                  fontSize: 22, 
                  color: '#00c853',
                  fontWeight: 900,
                  letterSpacing: '1px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textShadow: '0 2px 8px #fff, 0 1px 0 #a8ff78'
                }}>
                  {/* 現在のモードに応じてタイトルとアイコンを動的に変更 */}
                  {currentMode === 'video' && (
                    <>
                      <span style={{fontSize: 28}}>🎬</span> 動画履歴
                    </>
                  )}
                  {currentMode === 'presentation' && (
                    <>
                      <span style={{fontSize: 28}}>📊</span> プレゼンテーション履歴
                    </>
                  )}
                  {(currentMode === 'generate' || currentMode === 'edit') && (
                    <>
                      <span style={{fontSize: 28}}>🖼️</span> 画像履歴
                    </>
                  )}
                </h3>
                <div style={{height: 2, background: 'linear-gradient(90deg,#a8ff78,#fff176 60%,#fff0)', borderRadius: 2, marginBottom: 18}} />
                {/* 現在のモードに応じて履歴を表示 */}
                {(currentMode === 'generate' || currentMode === 'edit') && (
                  <div style={{marginBottom: 24}}>
                    <ImageHistoryPanel
                      imageHistory={imageHooks.imageHistory}
                      selectedImage={imageHooks.selectedImage}
                      loading={imageHooks.imageHistoryLoading}
                      onRefresh={imageHooks.handleImageHistoryRefresh}
                      onImageSelect={handleImageHistorySelect}
                      onImageDelete={imageHooks.handleImageDelete}
                      editMode={true}
                      onImg2Img={img => {
                        // 編集モードに自動切り替え
                        setCurrentMode('edit');
                        
                        // 🔄 前の編集結果をリセットして新しい編集に移行
                        editHooks.resetEditResult();
                        
                        // 編集パネルに新しい画像をセット
                        editHooks.setUploadedImage(img.imageUrl);
                        editHooks.setEditPrompt(img.prompt || '');
                        
                        console.log('🖼️ img2imgボタン押下: 新しい画像で編集モード開始', img.imageUrl);
                        console.log('✨ 前の編集結果をリセットしました');
                      }}
                    />
                  </div>
                )}

                {currentMode === 'presentation' && (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: '#666',
                    fontSize: '14px'
                  }}>
                    📊 プレゼンテーション履歴
                    <div style={{
                      marginTop: '16px',
                      padding: '16px',
                      background: 'rgba(255,255,255,0.5)',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}>
                      💡 プレゼンテーション履歴機能は今後実装予定です
                    </div>
                  </div>
                )}

                {currentMode === 'video' && (
                  <div style={{marginBottom: 24}}>
                    <VideoHistoryPanel
                      videoHistory={videoHooks.videoHistory}
                      onVideoSelect={videoHooks.handleVideoSelect}
                      onDeleteVideoHistory={videoHooks.handleDeleteVideoHistory}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* 折りたたみ時の簡易表示 */}
          {!showHistoryPanel && isAuthenticated && (
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
              {currentMode === 'video' 
                ? '🎬' 
                : currentMode === 'presentation' 
                  ? '📊' 
                  : '📜'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    getMsalConfig().then(config => {
      setMsalInstance(new PublicClientApplication(config));
    });
  }, []);

  if (!msalInstance) return <div>MSAL初期化中だよ…</div>;

  return (
    <MsalProvider instance={msalInstance}>
      <AppContent />
    </MsalProvider>
  );
}
