import PptxGenJS from "pptxgenjs";
import { getUserFromRequest } from "../shared/auth";
import { PresentationPlan, SlideData } from "../analyzePresentationPrompt";

// PowerPoint生成の設定
const PRESENTATION_CONFIG = {
  themes: {
    business: {
      background: { color: 'FFFFFF' },
      titleColor: '1F4E79',
      textColor: '44546A',
      accentColor: '5B9BD5'
    },
    creative: {
      background: { color: 'F8F9FA' },
      titleColor: 'E91E63',
      textColor: '424242',
      accentColor: 'FF5722'
    },
    academic: {
      background: { color: 'FFFFFF' },
      titleColor: '2E3B4E',
      textColor: '4A5568',
      accentColor: '3182CE'
    },
    modern: {
      background: { color: 'FFFFFF' },
      titleColor: '2D3748',
      textColor: '4A5568',
      accentColor: '667EEA'
    },
    minimal: {
      background: { color: 'FFFFFF' },
      titleColor: '1A202C',
      textColor: '2D3748',
      accentColor: '805AD5'
    },
    // 🚀 新しいクールなテーマを追加
    cyberpunk: {
      background: { color: '0F0F23' },
      titleColor: '00F5FF',
      textColor: 'E0E0E0',
      accentColor: 'FF1493',
      gradient: ['0F0F23', '1A1A3A']
    },
    neon: {
      background: { color: '1A1A2E' },
      titleColor: '39FF14',
      textColor: 'F0F0F0',
      accentColor: 'FF073A',
      gradient: ['1A1A2E', '16213E']
    },
    ocean: {
      background: { color: '001122' },
      titleColor: '00D4FF',
      textColor: 'B0E0E6',
      accentColor: '1E90FF',
      gradient: ['001122', '003366']
    },
    sunset: {
      background: { color: '2D1B69' },
      titleColor: 'FFD700',
      textColor: 'FFEAA7',
      accentColor: 'FF6B6B',
      gradient: ['2D1B69', '74B9FF']
    },
    matrix: {
      background: { color: '000000' },
      titleColor: '00FF41',
      textColor: '00FF41',
      accentColor: '00CCCC',
      gradient: ['000000', '001100']
    }
  }
};

// 🎨 スライドマスター風のテンプレートシステム
interface BackgroundElement {
  type: 'rect' | 'ellipse';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  transparency?: number;
  rotation?: number;
}

interface SlideTemplate {
  logoPosition?: { x: number; y: number; w: number; h: number };
  titlePosition?: { x: number; y: number; w: number; h: number };
  subtitlePosition?: { x: number; y: number; w: number; h: number };
  headerPosition?: { x: number; y: number; w: number; h: number };
  contentArea?: { x: number; y: number; w: number; h: number };
  footerPosition?: { x: number; y: number; w: number; h: number };
  backgroundElements: BackgroundElement[];
}

const SLIDE_MASTERS = {
  corporate: {
    titleSlide: {
      logoPosition: { x: 1, y: 0.5, w: 2, h: 1 },
      titlePosition: { x: 1.7, y: 3, w: 10, h: 1.5 },
      subtitlePosition: { x: 1.7, y: 4.5, w: 10, h: 1 },
      backgroundElements: [
        { type: 'rect' as const, x: 0, y: 0, w: 0.2, h: 7.5, color: 'accentColor' },
        { type: 'ellipse' as const, x: 10, y: -1, w: 5, h: 5, color: 'titleColor', transparency: 90 }
      ]
    },
    contentSlide: {
      headerPosition: { x: 0.3, y: 0.2, w: 12.8, h: 0.9 },
      contentArea: { x: 0.3, y: 1.4, w: 12.8, h: 5.7 },
      footerPosition: { x: 0.5, y: 6.7, w: 12.5, h: 0.7 },
      backgroundElements: [
        { type: 'rect' as const, x: 0, y: 0, w: 0.15, h: 7.5, color: 'accentColor' }
      ]
    }
  },
  
  creative: {
    titleSlide: {
      logoPosition: { x: 0.5, y: 0.5, w: 1.5, h: 1.5 },
      titlePosition: { x: 2, y: 2.5, w: 9.33, h: 2 },
      subtitlePosition: { x: 2, y: 4.8, w: 9.33, h: 1 },
      backgroundElements: [
        { type: 'ellipse' as const, x: -3, y: -2, w: 8, h: 8, color: 'accentColor', transparency: 85 },
        { type: 'rect' as const, x: 8, y: 4, w: 6, h: 4, color: 'titleColor', transparency: 75, rotation: 15 }
      ]
    },
    contentSlide: {
      headerPosition: { x: 0.5, y: 0.3, w: 12.3, h: 1 },
      contentArea: { x: 0.5, y: 1.5, w: 12.3, h: 5.5 },
      footerPosition: { x: 0.7, y: 6.8, w: 12, h: 0.6 },
      backgroundElements: [
        { type: 'ellipse' as const, x: 11, y: 1, w: 3, h: 3, color: 'accentColor', transparency: 90 }
      ]
    }
  },

  minimal: {
    titleSlide: {
      titlePosition: { x: 1, y: 2.8, w: 11.33, h: 1.5 },
      subtitlePosition: { x: 1, y: 4.5, w: 11.33, h: 1 },
      backgroundElements: [
        { type: 'rect' as const, x: 1, y: 6, w: 11.33, h: 0.05, color: 'accentColor' }
      ]
    },
    contentSlide: {
      headerPosition: { x: 0.5, y: 0.5, w: 12.3, h: 0.8 },
      contentArea: { x: 0.5, y: 1.5, w: 12.3, h: 5.5 },
      backgroundElements: []
    }
  }
};

// 🏗️ スライドマスターを適用する関数
function applyMaster(slide: any, masterType: string, slideType: 'title' | 'content', theme: any) {
  const master = SLIDE_MASTERS[masterType as keyof typeof SLIDE_MASTERS];
  if (!master) return;

  const config = slideType === 'title' ? master.titleSlide : master.contentSlide;
  
  // 背景要素を追加
  config.backgroundElements.forEach((element: any) => {
    const color = element.color === 'accentColor' ? theme.accentColor : 
                  element.color === 'titleColor' ? theme.titleColor : element.color;
    
    if (element.type === 'rect') {
      slide.addShape(slide.ShapeType?.rect || 'rect', {
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
        fill: { 
          color: color,
          transparency: element.transparency || 0
        },
        line: { width: 0 }
      });
    } else if (element.type === 'ellipse') {
      slide.addShape(slide.ShapeType?.ellipse || 'ellipse', {
        x: element.x,
        y: element.y,
        w: element.w,
        h: element.h,
        fill: { 
          color: color,
          transparency: element.transparency || 0
        },
        line: { width: 0 }
      });
    }
  });
}

function createTitleSlide(pres: PptxGenJS, title: string, subtitle: string, theme: any, masterStyle: string = 'corporate') {
  const slide = pres.addSlide();
  
  // 🎨 スライドマスターを適用
  applyMaster(slide, masterStyle, 'title', theme);
  
  // 🌌 グラデーション背景（対応している場合）
  if (theme.gradient) {
    slide.background = { 
      fill: theme.gradient[0] 
    };
  } else {
    slide.background = theme.background;
  }
  
  // 🎨 大きな装飾図形（背景エフェクト）16:9完全対応
  slide.addShape(pres.ShapeType.ellipse, {
    x: -2,
    y: -1,
    w: 7,     // 16:9に合わせて拡張
    h: 7,
    fill: { 
      color: theme.accentColor,
      transparency: 85
    },
    line: { width: 0 }
  });
  
  slide.addShape(pres.ShapeType.ellipse, {
    x: 10,    // 16:9の右端に最適化
    y: 2,
    w: 6,     // サイズも16:9に調整
    h: 6,
    fill: { 
      color: theme.titleColor,
      transparency: 90
    },
    line: { width: 0 }
  });
  
  // 🎯 カードスタイルのメインエリア（16:9完全対応）
  slide.addShape(pres.ShapeType.rect, {
    x: 1.5,   // 16:9中央配置
    y: 1.8,
    w: 10.33, // 16:9フル幅活用
    h: 3.5,
    fill: { 
      color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
      transparency: 10
    },
    line: { 
      color: theme.accentColor, 
      width: 2
    },
    // 角丸効果（対応している場合）
    rectRadius: 0.2
  });
  
  // ✨ メインタイトル（16:9最適化）
  slide.addText(title, {
    x: 1.7,   // 16:9中央配置
    y: 2.2,
    w: 10,    // 16:9フル幅活用
    h: 1.2,
    fontSize: 40,  // 16:9で見やすくサイズアップ
    bold: true,
    color: theme.titleColor,
    align: 'center',
    fontFace: 'Arial'
  });
  
  // 📝 サブタイトル（16:9最適化）
  slide.addText(subtitle, {
    x: 1.7,   // 16:9中央配置
    y: 3.8,
    w: 10,    // 16:9フル幅活用
    h: 0.8,
    fontSize: 18,
    color: theme.textColor,
    align: 'center',
    fontFace: 'Arial'
  });
  
  // 🚀 モダンなアクセントライン（16:9最適化）
  slide.addShape(pres.ShapeType.rect, {
    x: 4.7,   // 16:9中央配置
    y: 5,
    w: 4,
    h: 0.05,
    fill: { color: theme.accentColor }
  });
  
  // ⭐ 小さなアクセント点（16:9最適化）
  for (let i = 0; i < 3; i++) {
    slide.addShape(pres.ShapeType.ellipse, {
      x: 6.2 + (i * 0.3),  // 16:9中央配置
      y: 5.2,
      w: 0.1,
      h: 0.1,
      fill: { color: theme.accentColor }
    });
  }
}

function createContentSlide(pres: PptxGenJS, slideData: SlideData, theme: any, masterStyle: string = 'corporate') {
  const slide = pres.addSlide();
  
  // 🎨 スライドマスターを適用
  applyMaster(slide, masterStyle, 'content', theme);
  
  // 🌌 背景設定
  if (theme.gradient) {
    slide.background = { 
      fill: theme.gradient[0] 
    };
  } else {
    slide.background = theme.background;
  }
  
  // 🎨 サイドアクセント（16:9最適化）
  slide.addShape(pres.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.15,
    h: 7.5,   // 16:9の高さフル活用
    fill: { color: theme.accentColor }
  });
  
  // ✨ タイトルエリア（カードスタイル・16:9最適化）
  slide.addShape(pres.ShapeType.rect, {
    x: 0.3,
    y: 0.2,
    w: 12.8,  // 16:9フル幅活用
    h: 0.9,
    fill: { 
      color: theme.background.color === '000000' ? '222222' : 'F8F9FA',
      transparency: 20
    },
    line: { 
      color: theme.accentColor, 
      width: 1
    }
  });
  
  // 🏷️ スライドタイトル（16:9最適化）
  slide.addText(slideData.title, {
    x: 0.5,
    y: 0.35,
    w: 12.5,  // 16:9フル幅活用
    h: 0.6,
    fontSize: 30, // 16:9で見やすくサイズアップ
    bold: true,
    color: theme.titleColor,
    fontFace: 'Arial'
  });
  
  // レイアウトに応じた内容配置
  switch (slideData.layout) {
    case 'title-image':
      // 🖼️ 左側にテキスト、右側に画像プレースホルダー
      
      // テキストエリアの背景（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 0.3,
        y: 1.4,
        w: 6.2,   // 16:9で左半分を拡張
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
          transparency: 15
        },
        line: { 
          color: theme.textColor, 
          width: 1
        }
      });
      
      slide.addText(slideData.content, {
        x: 0.5,
        y: 1.6,
        w: 5.8,   // 16:9で左半分を拡張
        h: 5.3,   // 16:9の高さを活用
        fontSize: 16, // 16:9で見やすくサイズアップ
        color: theme.textColor,
        valign: 'top',
        fontFace: 'Arial'
      });
      
      // 🎨 クールな画像プレースホルダー（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 6.8,   // 16:9で右半分を最適化
        y: 1.4,
        w: 6.2,   // 16:9で右半分を拡張
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.accentColor,
          transparency: 80
        },
        line: { 
          color: theme.accentColor, 
          width: 3
        }
      });
      
      // 📷 画像アイコン風エフェクト（16:9最適化）
      slide.addShape(pres.ShapeType.ellipse, {
        x: 9.5,   // 16:9中央配置
        y: 3.6,
        w: 1,     // 16:9で見やすくサイズアップ
        h: 1,
        fill: { color: theme.titleColor }
      });
      
      slide.addText('�', {
        x: 6.8,
        y: 2.8,
        w: 0.8,
        h: 0.8,
        fontSize: 24,
        align: 'center',
        valign: 'middle'
      });
      
      slide.addText('画像エリア\n\n' + (slideData.suggestedImage || '画像を配置してください'), {
        x: 7,     // 16:9配置調整
        y: 5.2,
        w: 5.8,   // 16:9幅調整
        h: 1.5,
        fontSize: 14, // 16:9で見やすくサイズアップ
        color: theme.textColor,
        align: 'center',
        valign: 'middle',
        fontFace: 'Arial'
      });
      break;
      
    case 'bullet-points':
      // 🎯 クールな箇条書きレイアウト
      
      // コンテンツエリアの背景（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 0.3,
        y: 1.4,
        w: 12.8,  // 16:9フル幅活用
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
          transparency: 15
        },
        line: { 
          color: theme.textColor, 
          width: 1
        }
      });
      
      const bulletPoints = slideData.content.split('\n').filter(line => line.trim());
      bulletPoints.forEach((point, index) => {
        // 🔥 カスタム bullet アイコン
        slide.addShape(pres.ShapeType.ellipse, {
          x: 0.7,
          y: 1.7 + (index * 0.8),  // 16:9で間隔を広げ
          w: 0.15,
          h: 0.15,
          fill: { color: theme.accentColor }
        });
        
        slide.addText(point, {
          x: 1,
          y: 1.65 + (index * 0.8), // 16:9で間隔を広げ
          w: 11.8,  // 16:9フル幅活用
          h: 0.7,   // 16:9で高さ調整
          fontSize: 18, // 16:9で見やすくサイズアップ
          color: theme.textColor,
          fontFace: 'Arial'
        });
      });
      break;
      
    case 'comparison-table':
      // 🆚 クールな比較テーブル
      
      // テーブル背景（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 0.3,
        y: 1.4,
        w: 12.8,  // 16:9フル幅活用
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
          transparency: 15
        },
        line: { 
          color: theme.accentColor, 
          width: 2
        }
      });
      
      slide.addText(slideData.content, {
        x: 0.5,
        y: 1.6,
        w: 12.4,  // 16:9フル幅活用
        h: 5.3,   // 16:9の高さを活用
        fontSize: 16, // 16:9で見やすくサイズアップ
        color: theme.textColor,
        valign: 'top',
        fontFace: 'Arial'
      });
      break;
      
    case 'chart':
      // 📊 超クールなチャート用レイアウト
      
      // テキストエリア（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 0.3,
        y: 1.4,
        w: 6.2,   // 16:9で左半分を拡張
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
          transparency: 15
        },
        line: { 
          color: theme.textColor, 
          width: 1
        }
      });
      
      slide.addText(slideData.content, {
        x: 0.5,
        y: 1.6,
        w: 5.8,   // 16:9で左半分を拡張
        h: 5.3,   // 16:9の高さを活用
        fontSize: 16, // 16:9で見やすくサイズアップ
        color: theme.textColor,
        valign: 'top',
        fontFace: 'Arial'
      });
      
      // 🎨 ネオンスタイルのチャートプレースホルダー（16:9最適化）
      slide.addShape(pres.ShapeType.rect, {
        x: 6.8,   // 16:9で右半分を最適化
        y: 1.4,
        w: 6.2,   // 16:9で右半分を拡張
        h: 5.7,   // 16:9の高さを活用
        fill: { 
          color: theme.accentColor,
          transparency: 85
        },
        line: { 
          color: theme.accentColor, 
          width: 3
        }
      });
      
      // 📊 チャートアイコン（16:9最適化）
      slide.addShape(pres.ShapeType.ellipse, {
        x: 9.5,   // 16:9中央配置
        y: 3.6,
        w: 1,     // 16:9で見やすくサイズアップ
        h: 1,
        fill: { color: theme.titleColor }
      });
      
      slide.addText('📊', {
        x: 9.5,   // 16:9中央配置
        y: 3.6,
        w: 1,
        h: 1,
        fontSize: 28, // 16:9で見やすくサイズアップ
        align: 'center',
        valign: 'middle'
      });
      
      slide.addText('チャートエリア\n\nグラフを配置してください', {
        x: 7,     // 16:9配置調整
        y: 5.2,
        w: 5.8,   // 16:9幅調整
        h: 1.5,
        fontSize: 14, // 16:9で見やすくサイズアップ
        color: theme.textColor,
        align: 'center',
        valign: 'middle',
        fontFace: 'Arial'
      });
      break;
      
    default:
      // 🌟 クールなフルテキストレイアウト
      
      // コンテンツエリアの背景
      slide.addShape(pres.ShapeType.rect, {
        x: 0.3,
        y: 1.4,
        w: 9.4,
        h: 3.8,
        fill: { 
          color: theme.background.color === '000000' ? '111111' : 'FFFFFF',
          transparency: 15
        },
        line: { 
          color: theme.accentColor, 
          width: 2
        }
      });
      
      slide.addText(slideData.content, {
        x: 0.5,
        y: 1.6,
        w: 9,
        h: 3.4,
        fontSize: 16,
        color: theme.textColor,
        valign: 'top',
        fontFace: 'Arial'
      });
  }
  
  // ノートがある場合は下部に追加（スタイリッシュに・16:9最適化）
  if (slideData.notes) {
    // ノートエリアの背景（16:9最適化）
    slide.addShape(pres.ShapeType.rect, {
      x: 0.5,
      y: 6.7,   // 16:9の下部に配置
      w: 12.5,  // 16:9フル幅活用
      h: 0.7,   // 高さも調整
      fill: { 
        color: theme.accentColor,
        transparency: 90
      },
      line: { width: 0 }
    });
    
    slide.addText('💡 発表のポイント: ' + slideData.notes, {
      x: 0.7,
      y: 6.8,   // 16:9の下部に配置
      w: 12.3,  // 16:9フル幅活用
      h: 0.6,   // 高さも調整
      fontSize: 12, // 16:9で見やすくサイズアップ
      color: theme.textColor,
      italic: true,
      fontFace: 'Arial'
    });
  }
}

async function generatePowerPointFile(
  presentationPlan: PresentationPlan, 
  themeName: string = 'cyberpunk',
  masterStyle: string = 'corporate'
): Promise<Buffer> {
  const pres = new PptxGenJS();
  
  // 📐 スライドサイズを16:9に設定
  pres.layout = 'LAYOUT_16x9';
  
  // プレゼンテーション設定
  pres.author = 'ImageOne PowerPoint Generator';
  pres.title = presentationPlan.title;
  pres.subject = `${presentationPlan.targetAudience}向けプレゼンテーション`;
  
  // テーマ設定（APIパラメータからテーマを選択）
  const themeKey = themeName as keyof typeof PRESENTATION_CONFIG.themes;
  const theme = PRESENTATION_CONFIG.themes[themeKey] || PRESENTATION_CONFIG.themes.cyberpunk;
  
  // タイトルスライド（スライドマスター対応）
  createTitleSlide(
    pres, 
    presentationPlan.title, 
    `${presentationPlan.targetAudience} | ${presentationPlan.estimatedDuration}分`,
    theme,
    masterStyle
  );
  
  // 各コンテンツスライドを生成（スライドマスター対応）
  presentationPlan.slides.forEach(slideData => {
    createContentSlide(pres, slideData, theme, masterStyle);
  });
  
  // まとめスライド（16:9最適化）
  const summarySlide = pres.addSlide();
  summarySlide.addText('ありがとうございました', {
    x: 1.7,   // 16:9中央配置
    y: 2.8,
    w: 10,    // 16:9フル幅活用
    h: 1.5,
    fontSize: 36, // 16:9で見やすくサイズアップ
    bold: true,
    color: theme.titleColor,
    align: 'center'
  });
  
  summarySlide.addText('ご質問・ご相談はお気軽にどうぞ', {
    x: 1.7,   // 16:9中央配置
    y: 4.5,
    w: 10,    // 16:9フル幅活用
    h: 1,
    fontSize: 20, // 16:9で見やすくサイズアップ
    color: theme.textColor,
    align: 'center'
  });
  
  // PowerPointファイルをバイナリとして生成
  const buffer = await pres.write({ outputType: 'base64' });
  return Buffer.from(buffer as string, 'base64');
}

export default async function httpTrigger(context: any, req: any) {
  try {
    // 認証チェック（一時的にスキップ - デバッグ用）
    // const user = await getUserFromRequest(req);
    // if (!user) {
    //   context.res = {
    //     status: 401,
    //     headers: { "Content-Type": "application/json" },
    //     body: JSON.stringify({ error: "認証が必要です" })
    //   };
    //   return;
    // }

    console.log("認証チェックをスキップしています（デバッグ用）");

    // リクエストボディの検証
    if (!req.body || !req.body.presentationPlan) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "プレゼンテーション計画が必要です" })
      };
      return;
    }

    const { presentationPlan, theme = 'cyberpunk', masterStyle = 'corporate' } = req.body;
    
    // プレゼンテーション計画の基本検証
    if (!presentationPlan.title || !presentationPlan.slides || !Array.isArray(presentationPlan.slides)) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "有効なプレゼンテーション計画を入力してください" })
      };
      return;
    }

    context.log(`PowerPoint生成開始 - タイトル: ${presentationPlan.title}, スライド数: ${presentationPlan.slides.length}`);

    // PowerPointファイル生成（テーマとマスタースタイルを渡す）
    const pptxBuffer = await generatePowerPointFile(presentationPlan, theme, masterStyle);

    context.log(`PowerPoint生成完了 - ファイルサイズ: ${pptxBuffer.length} bytes`);

    // ファイル名を生成（日本語タイトルを安全なファイル名に変換）
    const safeFileName = presentationPlan.title
      .replace(/[^\w\s-]/g, '') // 特殊文字を除去
      .replace(/\s+/g, '_') // スペースをアンダースコアに
      .substring(0, 50); // 長さ制限

    const fileName = `${safeFileName}_${new Date().toISOString().slice(0, 10)}.pptx`;

    // PowerPointファイルをバイナリで返す
    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": pptxBuffer.length.toString()
      },
      body: pptxBuffer,
      isRaw: true
    };

  } catch (error: any) {
    context.log.error("PowerPoint生成エラー:", error);
    
    const errorBody = {
      error: "PowerPoint生成中にエラーが発生しました",
      details: error.message
    };

    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(errorBody)
    };
  }
}
