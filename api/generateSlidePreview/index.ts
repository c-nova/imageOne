import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
const puppeteer = require('puppeteer');

const credential = new DefaultAzureCredential();
const kvName = process.env.KeyVaultName!;
const secretClient = new SecretClient(`https://${kvName}.vault.azure.net`, credential);

// スライドHTMLテンプレートを生成
function generateSlideHTML(slide: any, slideIndex: number, theme: string = 'cyberpunk'): string {
  // テーマベースのスタイル設定
  const getThemeStyles = (theme: string) => {
    const themes: { [key: string]: any } = {
      cyberpunk: {
        background: 'linear-gradient(135deg, #0a0a23 0%, #1a1a3a 50%, #0a0a23 100%)',
        cardBg: 'linear-gradient(135deg, #1a1a3a 0%, #2a2a5a 100%)',
        textColor: '#ffffff',
        accentColor: '#ff006e',
        secondaryColor: '#00f5ff',
        headerBorder: '#ff006e'
      },
      neon: {
        background: 'linear-gradient(135deg, #000000 0%, #1a1a1a 50%, #000000 100%)',
        cardBg: 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)',
        textColor: '#00ff41',
        accentColor: '#ff0040',
        secondaryColor: '#00ff41',
        headerBorder: '#00ff41'
      },
      ocean: {
        background: 'linear-gradient(135deg, #001122 0%, #003366 50%, #0066cc 100%)',
        cardBg: 'linear-gradient(135deg, #003366 0%, #0066cc 100%)',
        textColor: '#ffffff',
        accentColor: '#66ccff',
        secondaryColor: '#0099cc',
        headerBorder: '#66ccff'
      },
      sunset: {
        background: 'linear-gradient(135deg, #2d1b69 0%, #5a2d8a 50%, #7b2d8a 100%)',
        cardBg: 'linear-gradient(135deg, #5a2d8a 0%, #7b2d8a 100%)',
        textColor: '#ffffff',
        accentColor: '#ffd700',
        secondaryColor: '#f72585',
        headerBorder: '#ffd700'
      },
      matrix: {
        background: 'linear-gradient(135deg, #000000 0%, #001100 50%, #000000 100%)',
        cardBg: 'linear-gradient(135deg, #001100 0%, #003300 100%)',
        textColor: '#00ff00',
        accentColor: '#00ff00',
        secondaryColor: '#66ff66',
        headerBorder: '#00ff00'
      }
    };
    
    return themes[theme] || themes.cyberpunk;
  };
  
  const themeStyles = getThemeStyles(theme);
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', sans-serif;
      background: ${themeStyles.background};
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    
    .slide-container {
      width: 1366px;  /* 16:9比率に最適化 */
      height: 768px;
      background: ${themeStyles.cardBg};
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 60px;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      color: ${themeStyles.textColor};
    }
    
    .slide-header {
      border-bottom: 4px solid ${themeStyles.headerBorder};
      padding-bottom: 20px;
      margin-bottom: 40px;
    }
    
    .slide-title {
      font-size: 42px;
      font-weight: bold;
      color: ${themeStyles.accentColor};
      margin-bottom: 10px;
      line-height: 1.2;
      text-align: center;
    }
    
    .slide-subtitle {
      font-size: 16px;
      color: ${themeStyles.secondaryColor};
      text-align: center;
    }
    
    .slide-content {
      flex: 1;
      font-size: 24px;
      line-height: 1.6;
      color: ${themeStyles.textColor};
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .content-text {
      margin-bottom: 30px;
      white-space: pre-line;
    }
    
    .suggested-image {
      position: absolute;
      top: 200px;
      right: 60px;
      width: 280px;
      height: 200px;
      background: linear-gradient(45deg, ${themeStyles.secondaryColor}30, ${themeStyles.accentColor}30);
      border: 3px dashed ${themeStyles.accentColor};
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    
    .image-icon {
      font-size: 48px;
      margin-bottom: 10px;
      color: ${themeStyles.accentColor};
    }
    
    .image-label {
      font-size: 14px;
      font-weight: bold;
      color: ${themeStyles.accentColor};
      text-align: center;
      margin-bottom: 8px;
    }
    
    .image-description {
      font-size: 11px;
      color: #555;
      text-align: center;
      line-height: 1.3;
    }
    
    .slide-number {
      position: absolute;
      bottom: 20px;
      right: 30px;
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: bold;
    }
    
    .decorative-element {
      position: absolute;
      top: 0;
      right: 0;
      width: 200px;
      height: 200px;
      background: linear-gradient(45deg, rgba(25,118,210,0.1), rgba(25,118,210,0.05));
      border-radius: 0 12px 0 100%;
    }
  </style>
</head>
<body>
  <div class="slide-container">
    <div class="decorative-element"></div>
    
    <div class="slide-header">
      <h1 class="slide-title">${slide.title || 'スライドタイトル'}</h1>
      <div class="slide-subtitle">スライド ${slideIndex + 1} • レイアウト: ${slide.layout || 'standard'}</div>
    </div>
    
    <div class="slide-content">
      <div class="content-text">${slide.content || ''}</div>
    </div>
    
    ${slide.suggestedImage ? `
    <div class="suggested-image">
      <div class="image-icon">🖼️</div>
      <div class="image-label">推奨画像</div>
      <div class="image-description">${slide.suggestedImage.substring(0, 80)}${slide.suggestedImage.length > 80 ? '...' : ''}</div>
    </div>
    ` : ''}
    
    <div class="slide-number">${slideIndex + 1}</div>
  </div>
</body>
</html>
  `;
}

const httpTrigger = async function(context: any, req: any): Promise<void> {
  context.log('🎯 [DEBUG] generateSlidePreview関数開始');
  
  let browser;
  
  try {
    // リクエストボディの解析
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { slide, slideIndex = 0, format = 'png', theme = 'cyberpunk' } = body;
    
    if (!slide) {
      context.res = {
        status: 400,
        body: { success: false, message: 'スライド情報が必要です' }
      };
      return;
    }

    context.log('🎯 [DEBUG] スライドプレビュー生成開始:', slide.title, 'テーマ:', theme);

    // HTMLテンプレートを生成
    const slideHTML = generateSlideHTML(slide, slideIndex, theme);
    
    // Puppeteerブラウザを起動
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // ページサイズを設定（16:9スライドサイズに最適化）
    await page.setViewport({ 
      width: 1366,  // 16:9比率 (1366x768)
      height: 768, 
      deviceScaleFactor: 2 // 高解像度
    });
    
    // HTMLコンテンツを設定
    await page.setContent(slideHTML, { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // スクリーンショットを撮影
    const screenshot = await page.screenshot({
      type: format === 'jpg' ? 'jpeg' : 'png',
      quality: format === 'jpg' ? 90 : undefined,
      fullPage: false,
      omitBackground: false
    });
    
    await browser.close();
    browser = null;
    
    // Base64エンコード
    const base64Image = screenshot.toString('base64');
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    
    context.log('✅ [SUCCESS] スライドプレビュー画像生成完了');

    context.res = {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        success: true,
        slidePreview: `data:${mimeType};base64,${base64Image}`,
        slideIndex: slideIndex,
        format: format,
        message: 'スライドプレビュー画像を生成しました'
      }
    };

  } catch (error: any) {
    context.log.error('❌ [ERROR] スライドプレビュー生成エラー:', error);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        context.log.error('❌ [ERROR] ブラウザクローズエラー:', closeError);
      }
    }
    
    context.res = {
      status: 500,
      body: {
        success: false,
        message: 'スライドプレビューの生成中にエラーが発生しました',
        error: error.message
      }
    };
  }
};

export default httpTrigger;
