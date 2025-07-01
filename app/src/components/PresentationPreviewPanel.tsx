import React, { useState, useRef, useEffect } from 'react';
import { PresentationPlan } from '../hooks/usePresentationGeneration';
import { useSlidePreview } from '../hooks/useSlidePreview';
import { usePresentationChat } from '../hooks/usePresentationChat';

// 🎨 テーマオプションの定義
const THEME_OPTIONS = [
  { 
    value: 'cyberpunk', 
    label: '🌌 Cyberpunk', 
    description: 'ダーク + ネオンカラー',
    colors: ['#0a0a23', '#ff006e', '#00f5ff']
  },
  { 
    value: 'neon', 
    label: '⚡ Neon', 
    description: 'グリーン + レッド',
    colors: ['#000000', '#00ff41', '#ff0040']
  },
  { 
    value: 'ocean', 
    label: '🌊 Ocean', 
    description: 'ブルー系グラデーション',
    colors: ['#001122', '#0099cc', '#66ccff']
  },
  { 
    value: 'sunset', 
    label: '🌅 Sunset', 
    description: 'パープル + ゴールド',
    colors: ['#2d1b69', '#f72585', '#ffd700']
  },
  { 
    value: 'matrix', 
    label: '💻 Matrix', 
    description: 'ブラック + グリーン',
    colors: ['#000000', '#00ff00', '#003300']
  }
];

// 🎨 スライドマスターの定義
const MASTER_STYLE_OPTIONS = [
  {
    value: 'corporate',
    label: '🏢 Corporate',
    description: 'ビジネス向けフォーマル',
    preview: 'ロゴ位置・サイドバー・構造化レイアウト'
  },
  {
    value: 'creative',
    label: '🎨 Creative',
    description: 'クリエイティブ・アート系',
    preview: '自由配置・装飾的要素・アシンメトリー'
  },
  {
    value: 'minimal',
    label: '✨ Minimal',
    description: 'ミニマル・シンプル',
    preview: 'クリーン・余白重視・要素最小限'
  }
];

interface PresentationPreviewPanelProps {
  presentationPlan: PresentationPlan;
  onUpdatePlan: (updatedPlan: PresentationPlan) => void;
  onDownloadPowerPoint: (theme?: string, masterStyle?: string) => void;
  isGenerating: boolean;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const PresentationPreviewPanel: React.FC<PresentationPreviewPanelProps> = ({
  presentationPlan,
  onUpdatePlan,
  onDownloadPowerPoint,
  isGenerating
}) => {
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [selectedTheme, setSelectedTheme] = useState(presentationPlan.designTheme || 'cyberpunk');
  const [selectedMasterStyle, setSelectedMasterStyle] = useState('corporate'); // 🎨 スライドマスター選択
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'assistant',
      content: `こんにちは！「${presentationPlan.title}」のプレゼンテーション作成をお手伝いします✨

以下のようなご指示をお気軽にどうぞ：
• "3枚目のタイトルを〇〇に変更して"
• "もっと具体的な内容にして"
• "スライドを1枚追加して"
• "P.2の内容を読みやすくして"
• "全体のトーンを明るくして"

📝 **フォントサイズについて:** 「フォントを大きく」等の指示では、内容を簡潔にして読みやすさを向上させます。実際のフォントサイズはPowerPointダウンロード後に手動で調整してください。`,
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  const [isComposing, setIsComposing] = useState(false); // 日本語入力中かどうか
  const [slideImages, setSlideImages] = useState<{ [key: number]: string }>({});
  const [previewMode, setPreviewMode] = useState<'html' | 'image'>('image');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // スライドプレビューフック
  const { generatePreview, isGenerating: isGeneratingPreview, error: previewError } = useSlidePreview();
  
  // AIチャットフック
  const { updatePresentationWithChat, isProcessing: isChatProcessing, error: chatError } = usePresentationChat();

  // スライドマスター変更ハンドラー
  const handleMasterStyleChange = (masterStyle: string) => {
    setSelectedMasterStyle(masterStyle);
    console.log('🏗️ スライドマスター変更:', masterStyle);
    // 画像プレビューをクリア（新しいマスタースタイルで再生成）
    setSlideImages({});
  };
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // スライドが変更されたときに画像プレビューを生成
  useEffect(() => {
    const generateSlideImage = async () => {
      if (previewMode === 'image' && !slideImages[selectedSlideIndex]) {
        const currentSlide = presentationPlan.slides[selectedSlideIndex];
        if (currentSlide) {
          console.log('🎯 スライド画像プレビュー生成中...', selectedSlideIndex, 'テーマ:', selectedTheme);
          const imageUrl = await generatePreview(currentSlide, selectedSlideIndex, selectedTheme);
          if (imageUrl) {
            setSlideImages(prev => ({
              ...prev,
              [selectedSlideIndex]: imageUrl
            }));
            console.log('✅ スライド画像プレビュー生成完了');
          }
        }
      }
    };

    generateSlideImage();
  }, [selectedSlideIndex, previewMode, slideImages, presentationPlan.slides, generatePreview, selectedTheme]);

  // テーマ変更処理
  const handleThemeChange = (newTheme: string) => {
    setSelectedTheme(newTheme);
    
    // プレゼンテーション案のテーマを更新
    const updatedPlan = {
      ...presentationPlan,
      designTheme: newTheme
    };
    
    onUpdatePlan(updatedPlan);
    
    // スライド画像をクリアして再生成
    setSlideImages({});
    
    console.log('🎨 テーマ変更:', newTheme);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isProcessingChat || isChatProcessing) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    const currentMessage = inputMessage;
    setInputMessage('');
    setIsProcessingChat(true);

    try {
      console.log('🤖 AIアシスタントでプレゼンテーション更新中...', currentMessage);
      
      // 実際にAPIを呼び出してプレゼンテーションを更新
      const result = await updatePresentationWithChat(
        presentationPlan,
        currentMessage,
        chatMessages
      );

      if (result && result.data) {
        // プレゼンテーション案を更新
        onUpdatePlan(result.data);
        
        // スライド画像をクリアして再生成
        setSlideImages({});
        
        // デバッグ情報を含むAIの返答をチャットに追加
        let responseContent = 'プレゼンテーションを更新しました✨ 変更内容がプレビューに反映されます。';
        
        // フォント指示の場合は説明を追加
        if (inputMessage.includes('フォント') && (inputMessage.includes('大きく') || inputMessage.includes('小さく'))) {
          responseContent += '\n\n💡 **フォントサイズについて:** 実際のフォントサイズは変更できませんが、内容を簡潔にして読みやすさを向上させました。PowerPointダウンロード後に手動でフォントサイズを調整してください。';
        }
        
        // デバッグ情報がある場合は詳細を表示
        if (result.debug && result.debug.changesDetected) {
          responseContent += '\n\n🔍 **変更詳細:**\n';
          result.debug.changes.forEach((change: any) => {
            if (change.titleChanged) {
              responseContent += `\n📝 **スライド${change.index} - タイトル変更:**\n`;
              responseContent += `❌ 変更前: "${change.originalTitle}"\n`;
              responseContent += `✅ 変更後: "${change.updatedTitle}"\n`;
            }
            if (change.contentChanged) {
              responseContent += `\n📄 **スライド${change.index} - 内容変更:**\n`;
              responseContent += `❌ 変更前: ${change.originalContent}\n`;
              responseContent += `✅ 変更後: ${change.updatedContent}\n`;
            }
          });
        } else if (result.debug && !result.debug.changesDetected) {
          responseContent += '\n\n🤔 **変更なし:** GPT-4oからレスポンスを受け取りましたが、実際のスライド内容に変更は検出されませんでした。';
        }
        
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: responseContent,
          timestamp: new Date()
        };

        setChatMessages(prev => [...prev, assistantMessage]);
        
        console.log('✅ プレゼンテーション更新完了', result.debug);
      } else {
        throw new Error(chatError || 'プレゼンテーションの更新に失敗しました');
      }
    } catch (error) {
      console.error('❌ チャット処理エラー:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: `申し訳ありません。エラーが発生しました：${error instanceof Error ? error.message : '不明なエラー'}`,
        timestamp: new Date()
      };

      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 日本語入力の開始を検知
  const handleCompositionStart = () => {
    setIsComposing(true);
  };

  // 日本語入力の終了を検知
  const handleCompositionEnd = () => {
    setIsComposing(false);
  };

  return (
    <div className="presentation-preview-panel" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '85vh', // 100vh → 85vh でより適切なサイズに�
      background: 'white',
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
    }}>
      
      {/* テーマ選択エリア */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #eee',
        background: '#f8f9fa'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
              🎨 デザインテーマ
            </h3>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
              🏗️ スライドマスター
            </h3>
          </div>
          <button
            onClick={() => onDownloadPowerPoint(selectedTheme, selectedMasterStyle)}
            disabled={isGenerating}
            style={{
              background: isGenerating ? '#ccc' : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: isGenerating ? 'not-allowed' : 'pointer'
            }}
          >
            {isGenerating ? '⏳ 生成中...' : '📊 PowerPointダウンロード'}
          </button>
        </div>
        
        {/* テーマ選択 */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px'
        }}>
          {THEME_OPTIONS.map((theme) => (
            <button
              key={theme.value}
              onClick={() => handleThemeChange(theme.value)}
              style={{
                padding: '8px 12px',
                border: selectedTheme === theme.value ? '2px solid #2196F3' : '2px solid #e0e0e0',
                borderRadius: '8px',
                background: selectedTheme === theme.value ? '#f3f9ff' : 'white',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px'
              }}
            >
              <span>{theme.label}</span>
              <div style={{
                display: 'flex',
                gap: '2px'
              }}>
                {theme.colors.map((color, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: '12px',
                      height: '12px',
                      background: color,
                      borderRadius: '50%',
                      border: '1px solid rgba(255,255,255,0.3)'
                    }}
                  />
                ))}
              </div>
            </button>
          ))}
        </div>
        
        {/* スライドマスター選択 */}
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap'
        }}>
          {MASTER_STYLE_OPTIONS.map((master) => (
            <button
              key={master.value}
              onClick={() => handleMasterStyleChange(master.value)}
              style={{
                padding: '8px 12px',
                border: selectedMasterStyle === master.value ? '2px solid #FF9800' : '2px solid #e0e0e0',
                borderRadius: '8px',
                background: selectedMasterStyle === master.value ? '#fff8f0' : 'white',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '4px',
                fontSize: '13px',
                minWidth: '140px'
              }}
            >
              <span style={{ fontWeight: 'bold' }}>{master.label}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{master.description}</span>
              <span style={{ fontSize: '10px', color: '#999' }}>{master.preview}</span>
            </button>
          ))}
        </div>
      </div>
      
      {/* 上部: スライド一覧とプレビュー */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden'
      }}>
        {/* 左側: スライド一覧（サイドバー） */}
        <div className="slides-sidebar" style={{
          width: '180px',
          background: '#f8f9fa',
          borderRight: '1px solid #e0e0e0',
          overflow: 'auto'
        }}>
        <div style={{ padding: '8px', borderBottom: '1px solid #e0e0e0' }}>
          <h4 style={{ margin: 0, fontSize: '13px', color: '#333', fontWeight: 'bold' }}>
            📊 スライド ({presentationPlan.slides.length})
          </h4>
        </div>
        
        <div style={{ padding: '3px' }}>
          {presentationPlan.slides.map((slide, index) => (
            <div
              key={slide.id}
              onClick={() => setSelectedSlideIndex(index)}
              style={{
                padding: '6px',
                margin: '1px 0',
                borderRadius: '4px',
                cursor: 'pointer',
                background: selectedSlideIndex === index ? '#e3f2fd' : 'white',
                border: selectedSlideIndex === index ? '2px solid #2196F3' : '1px solid #e0e0e0',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ fontSize: '9px', color: '#666', marginBottom: '1px' }}>
                {index + 1}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#333', lineHeight: '1.2' }}>
                {slide.title.length > 18 ? slide.title.substring(0, 18) + '...' : slide.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 中央: メインコンテンツエリア（スライドプレビュー） */}
      <div className="main-content" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'white'
      }}>
        <div style={{ 
          padding: '16px', 
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>
              📄 スライドプレビュー
            </h3>
            
            {/* プレビューモード切り替え */}
            <div style={{ display: 'flex', background: '#f0f0f0', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                onClick={() => setPreviewMode('image')}
                style={{
                  background: previewMode === 'image' ? '#2196F3' : 'transparent',
                  color: previewMode === 'image' ? 'white' : '#666',
                  border: 'none',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🖼️ 画像
              </button>
              <button
                onClick={() => setPreviewMode('html')}
                style={{
                  background: previewMode === 'html' ? '#2196F3' : 'transparent',
                  color: previewMode === 'html' ? 'white' : '#666',
                  border: 'none',
                  padding: '6px 12px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                📝 HTML
              </button>
            </div>
          </div>

          <button
            onClick={() => onDownloadPowerPoint(selectedTheme, selectedMasterStyle)}
            disabled={isGenerating}
            style={{
              background: isGenerating 
                ? 'linear-gradient(135deg, #ccc 0%, #999 100%)'
                : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
            }}
          >
            {isGenerating ? '🔧 生成中...' : '💾 PowerPointダウンロード'}
          </button>
        </div>

        <div style={{ 
          flex: 1, 
          padding: '12px', // さらに縮小して最適化✨
          overflow: 'auto',
          background: '#f5f7fa'
        }}>
          {presentationPlan.slides[selectedSlideIndex] && (
            <>
              {/* 画像プレビューモード */}
              {previewMode === 'image' && (
                <div style={{
                  background: 'white',
                  borderRadius: '8px', // 12px → 8px でコンパクトに
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)', // 影を少し軽く
                  maxWidth: '750px', // 800px → 750px でより理想的なサイズに📐
                  margin: '0 auto',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {isGeneratingPreview && (
                    <div style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(255,255,255,0.9)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      zIndex: 10
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎨</div>
                        <div style={{ fontSize: '14px', color: '#666' }}>スライド画像を生成中...</div>
                      </div>
                    </div>
                  )}
                  
                  {slideImages[selectedSlideIndex] ? (
                    <img 
                      src={slideImages[selectedSlideIndex]} 
                      alt={`スライド ${selectedSlideIndex + 1}`}
                      style={{
                        width: '100%',
                        height: 'auto',
                        display: 'block'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '420px', // 450px → 420px でよりコンパクトに📏 (750x420 ≈ 16:9)
                      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontSize: '16px', // 18px → 16px
                      color: '#666'
                    }}>
                      {isGeneratingPreview ? '画像生成中...' : '画像プレビューを生成します...'}
                    </div>
                  )}
                  
                  {previewError && (
                    <div style={{
                      position: 'absolute',
                      bottom: '20px',
                      left: '20px',
                      right: '20px',
                      background: '#ffebee',
                      border: '1px solid #f44336',
                      borderRadius: '8px',
                      padding: '12px',
                      color: '#d32f2f',
                      fontSize: '14px'
                    }}>
                      ❌ エラー: {previewError}
                    </div>
                  )}
                </div>
              )}

              {/* HTMLプレビューモード */}
              {previewMode === 'html' && (
                <div className="slide-content" style={{
                  background: 'white',
                  borderRadius: '8px', // 12px → 8px でコンパクトに
                  padding: '32px', // 40px → 32px でよりコンパクト
                  boxShadow: '0 4px 16px rgba(0,0,0,0.06)', // 影を軽く
                  maxWidth: '750px', // 900px → 750px で画像プレビューと統一📏
                  margin: '0 auto',
                  minHeight: '420px' // 500px → 420px で画像プレビューと同じ高さに📐
                }}>
                  <div className="slide-header" style={{
                    borderBottom: '3px solid #2196F3',
                    paddingBottom: '16px',
                    marginBottom: '24px'
                  }}>
                    <h1 style={{
                      margin: 0,
                      fontSize: '32px',
                      color: '#1976D2',
                      fontWeight: 'bold',
                      lineHeight: '1.2'
                    }}>
                      {presentationPlan.slides[selectedSlideIndex].title}
                    </h1>
                    <div style={{
                      fontSize: '12px',
                      color: '#666',
                      marginTop: '8px'
                    }}>
                      スライド {selectedSlideIndex + 1} / {presentationPlan.slides.length} • レイアウト: {presentationPlan.slides[selectedSlideIndex].layout}
                    </div>
                  </div>

                  <div className="slide-body" style={{
                    fontSize: '18px',
                    lineHeight: '1.7',
                    color: '#333',
                    marginBottom: '32px',
                    whiteSpace: 'pre-line'
                  }}>
                    {presentationPlan.slides[selectedSlideIndex].content}
                  </div>

                  {presentationPlan.slides[selectedSlideIndex].suggestedImage && (
                    <div className="suggested-image" style={{
                      background: '#f0f8ff',
                      border: '2px dashed #2196F3',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '16px'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1976D2', marginBottom: '8px' }}>
                        🖼️ 推奨画像
                      </div>
                      <div style={{ fontSize: '13px', color: '#555' }}>
                        {presentationPlan.slides[selectedSlideIndex].suggestedImage}
                      </div>
                    </div>
                  )}

                  {presentationPlan.slides[selectedSlideIndex].notes && (
                    <div className="speaker-notes" style={{
                      background: '#fff3e0',
                      border: '1px solid #ffb74d',
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#ef6c00', marginBottom: '8px' }}>
                        💡 発表のコツ
                      </div>
                      <div style={{ fontSize: '13px', color: '#555' }}>
                        {presentationPlan.slides[selectedSlideIndex].notes}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      {/* 下部: AIアシスタント（チャット） */}
      <div className="chat-panel" style={{
        height: '350px', // 450px → 350px でより適度なサイズに✨
        borderTop: '1px solid #e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        background: 'white'
      }}>
        <div style={{ 
          padding: '12px', 
          borderBottom: '1px solid #e0e0e0',
          background: '#f8f9fa'
        }}>
          <h4 style={{ margin: 0, fontSize: '14px', color: '#333', fontWeight: 'bold' }}>
            💬 AIアシスタント
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
            プレゼンテーションの改善提案をお話しください
          </p>
        </div>

        <div 
          ref={chatContainerRef}
          className="chat-messages" 
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '16px'
          }}
        >
          {chatMessages.map(message => (
            <div
              key={message.id}
              style={{
                marginBottom: '16px',
                display: 'flex',
                flexDirection: message.type === 'user' ? 'row-reverse' : 'row'
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '12px',
                  borderRadius: '16px',
                  background: message.type === 'user' 
                    ? 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)'
                    : '#f0f0f0',
                  color: message.type === 'user' ? 'white' : '#333',
                  fontSize: '14px',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-line'
                }}
              >
                {message.content}
              </div>
            </div>
          ))}
          
          {isProcessingChat && (
            <div style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
              🤔 考え中...
            </div>
          )}
        </div>

        <div style={{ 
          padding: '16px', 
          borderTop: '1px solid #e0e0e0',
          background: '#f8f9fa'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="プレゼンテーションの改善案を入力..."
              disabled={isProcessingChat}
              style={{
                flex: 1,
                minHeight: '40px',
                maxHeight: '100px',
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical'
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || isProcessingChat}
              style={{
                padding: '8px 12px',
                background: (!inputMessage.trim() || isProcessingChat) 
                  ? '#ccc' 
                  : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (!inputMessage.trim() || isProcessingChat) ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              送信
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresentationPreviewPanel;
