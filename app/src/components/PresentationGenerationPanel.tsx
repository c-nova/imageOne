// 📊 プレゼンテーション生成パネルコンポーネント
import React from 'react';
import { PresentationPlan } from '../hooks/usePresentationGeneration';
import { usePromptRecommendation } from '../hooks/usePromptRecommendation';

interface PresentationGenerationPanelProps {
  prompt: string;
  setPrompt: (prompt: string) => void;
  generatedPlan: PresentationPlan | null;
  isAnalyzing: boolean;
  error: string | null;
  onAnalyze: () => void;
  onReset: () => void;
}

const PresentationGenerationPanel: React.FC<PresentationGenerationPanelProps> = ({
  prompt,
  setPrompt,
  generatedPlan,
  isAnalyzing,
  error,
  onAnalyze,
  onReset,
}) => {
  const { optimizePrompt, isOptimizing, error: optimizeError } = usePromptRecommendation();

  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) return;
    
    const result = await optimizePrompt(prompt, 'powerpoint');
    if (result) {
      setPrompt(result);
    }
  };

  // 常に入力モードを表示（スライド生成前後で画面を変えない）
  return (
    <div className="generation-panel" style={{
      width: '100%',
      height: '100%',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div className="input-section" style={{
        background: 'white',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
        border: '1px solid rgba(0,0,0,0.05)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'auto'
      }}>
        <div style={{ 
          textAlign: 'center', 
          marginBottom: '32px' 
        }}>
          <h2 style={{ 
            margin: '0 0 8px 0', 
            fontSize: '28px', 
            color: '#333',
            fontWeight: 'bold'
          }}>
            📊 PowerPoint生成
          </h2>
          <p style={{ 
            margin: 0, 
            fontSize: '16px', 
            color: '#666',
            lineHeight: '1.5'
          }}>
            あなたのアイデアを魅力的なプレゼンテーションに変えます
          </p>
        </div>

        <div className="prompt-container" style={{ 
          marginBottom: '24px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <label style={{
            display: 'block',
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#333',
            marginBottom: '12px'
          }}>
            💡 どんなプレゼンテーションを作りたいですか？
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例：&#10;• AI技術の未来について5分間のプレゼンテーション&#10;• 環境問題の解決策について会社の会議で発表する資料&#10;• 新商品の販売戦略について投資家向けピッチ資料&#10;• チーム研修用のリーダーシップ講座プレゼン"
            className="prompt-input"
            disabled={isAnalyzing}
            style={{
              width: '100%',
              flex: 1,
              minHeight: '200px',
              padding: '16px',
              border: '2px solid #e0e0e0',
              borderRadius: '12px',
              fontSize: '16px',
              lineHeight: '1.6',
              resize: 'vertical',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'border-color 0.3s ease',
              background: isAnalyzing ? '#f5f5f5' : 'white'
            }}
            onFocus={(e) => e.target.style.borderColor = '#2196F3'}
            onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
          />
          <div style={{
            fontSize: '14px',
            color: '#666',
            marginTop: '8px',
            textAlign: 'right'
          }}>
            {prompt.length}/500文字
          </div>
          
          {/* プロンプト最適化ボタン */}
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <button
              onClick={handleOptimizePrompt}
              disabled={!prompt.trim() || isOptimizing || isAnalyzing}
              style={{
                background: (!prompt.trim() || isOptimizing || isAnalyzing)
                  ? 'linear-gradient(135deg, #ccc 0%, #999 100%)'
                  : 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: (!prompt.trim() || isOptimizing || isAnalyzing) ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
                marginBottom: '8px'
              }}
            >
              {isOptimizing ? '🔄 最適化中...' : '✨ プロンプトを改善する'}
            </button>
            {optimizeError && (
              <div style={{
                color: '#f44336',
                fontSize: '12px',
                marginTop: '4px'
              }}>
                {optimizeError}
              </div>
            )}
          </div>
        </div>
        
        <div className="control-buttons" style={{ 
          display: 'flex', 
          justifyContent: 'center',
          marginBottom: '16px'
        }}>
          <button
            onClick={() => onAnalyze()}
            disabled={!prompt.trim() || isAnalyzing}
            className="generate-button"
            style={{
              background: isAnalyzing
                ? 'linear-gradient(135deg, #ccc 0%, #999 100%)'
                : 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              padding: '16px 32px',
              fontSize: '18px',
              fontWeight: 'bold',
              cursor: isAnalyzing ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 6px 20px rgba(76, 175, 80, 0.3)',
              minWidth: '200px'
            }}
            onMouseEnter={(e) => {
              if (!isAnalyzing && prompt.trim()) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(76, 175, 80, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(76, 175, 80, 0.3)';
            }}
          >
            {isAnalyzing ? '🔍 分析中...' : '✨ スライド案を生成'}
          </button>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="error-message" style={{
            background: 'rgba(244, 67, 54, 0.1)',
            border: '2px solid rgba(244, 67, 54, 0.3)',
            borderRadius: '12px',
            padding: '16px',
            color: '#d32f2f',
            fontSize: '16px',
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            ❌ {error}
          </div>
        )}

        {/* 推奨プロンプト例 */}
        <div style={{
          marginTop: '24px',
          marginBottom: '16px',
          padding: '20px',
          background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
          borderRadius: '12px',
          border: '1px solid #ffcc02'
        }}>
          <h4 style={{ 
            margin: '0 0 16px 0', 
            fontSize: '16px', 
            color: '#f57c00',
            fontWeight: 'bold'
          }}>
            🎯 推奨プロンプト例（クリックで入力）
          </h4>
          <div style={{
            display: 'grid',
            gap: '8px'
          }}>
            {[
              {
                title: "🚀 新商品発表",
                content: "革新的なAIアシスタントアプリの新商品発表会で、投資家と技術関係者向けに15分間のプレゼンテーションを作成してください。市場機会、技術的優位性、収益モデル、今後のロードマップを含めて、資金調達につながる説得力のある内容にしてください。"
              },
              {
                title: "🌱 環境・SDGs",
                content: "企業の環境への取り組みとSDGs達成に向けた戦略について、社員向け研修用に20分間のプレゼンテーションを作成してください。具体的なアクション、成果指標、個人でできることを含めて、社員のモチベーション向上につながる内容にしてください。"
              },
              {
                title: "📈 業績報告",
                content: "四半期業績報告を役員会で発表するための10分間のプレゼンテーションを作成してください。売上実績、主要KPI、課題と対策、次四半期の戦略を含めて、データに基づいた説得力のある報告書にしてください。"
              },
              {
                title: "🎓 教育・研修",
                content: "新人研修用のリーダーシップスキル向上セミナーで使用する30分間のプレゼンテーションを作成してください。理論的背景、実践的なスキル、ケーススタディ、アクションプランを含めて、参加者が即実践できる内容にしてください。"
              }
            ].map((example, index) => (
              <button
                key={index}
                onClick={() => setPrompt(example.content)}
                disabled={isAnalyzing}
                style={{
                  padding: '12px 16px',
                  background: 'white',
                  border: '1px solid #ffb74d',
                  borderRadius: '8px',
                  textAlign: 'left',
                  cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  color: '#ef6c00',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isAnalyzing) {
                    e.currentTarget.style.background = '#fff8e1';
                    e.currentTarget.style.borderColor = '#ff9800';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.borderColor = '#ffb74d';
                }}
              >
                {example.title}
              </button>
            ))}
          </div>
          <p style={{
            margin: '12px 0 0 0',
            fontSize: '12px',
            color: '#bf360c',
            fontStyle: 'italic'
          }}>
            💡 気になる例をクリックすると、テキストエリアに自動入力されます
          </p>
        </div>

        {/* ヒントセクション */}
        <div style={{
          marginTop: '32px',
          padding: '20px',
          background: 'linear-gradient(135deg, #f0f8ff 0%, #e3f2fd 100%)',
          borderRadius: '12px',
          border: '1px solid #bbdefb'
        }}>
          <h4 style={{ 
            margin: '0 0 12px 0', 
            fontSize: '16px', 
            color: '#1976D2',
            fontWeight: 'bold'
          }}>
            💡 より良いプレゼンテーションのコツ
          </h4>
          <ul style={{ 
            margin: 0, 
            paddingLeft: '20px',
            fontSize: '14px',
            color: '#424242',
            lineHeight: '1.6'
          }}>
            <li>目的とターゲット聴衆を明確に書く</li>
            <li>発表時間（5分、15分、30分など）を含める</li>
            <li>業界や専門分野を具体的に指定する</li>
            <li>求める成果やアクションを書く</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PresentationGenerationPanel;
