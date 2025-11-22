import React, { useState } from 'react';
import { X, BookOpen, Keyboard, Layers, Cpu, Download } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [lang, setLang] = useState<'en' | 'cn'>('cn'); // Default to CN based on user preference

  if (!isOpen) return null;

  const content = {
    en: {
      title: "Help & Documentation",
      sections: [
        {
          title: "Introduction",
          icon: <BookOpen size={20} />,
          text: "YOLOv11 Studio is a professional image annotation tool designed for computer vision workflows. It runs entirely in your browser and integrates Google Gemini for automated labeling."
        },
        {
          title: "Tools & Shortcuts",
          icon: <Keyboard size={20} />,
          items: [
            { key: "V", name: "Select Mode", desc: "Select, move, and resize bounding boxes. Click an annotation to select it." },
            { key: "R", name: "Draw Mode", desc: "Click and drag to create new bounding boxes." },
            { key: "H", name: "Pan Mode", desc: "Drag the canvas to move around (useful when zoomed in)." },
            { key: "Del", name: "Delete", desc: "Remove the currently selected annotation." },
            { key: "Scroll", name: "Zoom", desc: "Use mouse wheel or on-screen controls to zoom in/out." }
          ]
        },
        {
          title: "Classes & Management",
          icon: <Layers size={20} />,
          text: "Manage your object classes in the left sidebar. You can add new classes, change their colors, and rename them. The active class is highlighted and will be used for new drawings."
        },
        {
          title: "AI Auto-Labeling",
          icon: <Cpu size={20} />,
          text: "Uses Gemini 2.5 Flash to automatically detect objects based on your defined class names. Ensure your class names are descriptive (e.g., 'cat', 'person', 'red car') for best results."
        },
        {
          title: "Exporting",
          icon: <Download size={20} />,
          text: "Switch to the 'Train / Export' tab to download your dataset. The tool generates a standard YOLOv11 directory structure (train/val splits), data.yaml config, and a Python training script."
        }
      ],
      button: "Got it"
    },
    cn: {
      title: "使用说明与帮助",
      sections: [
        {
          title: "产品简介",
          icon: <BookOpen size={20} />,
          text: "YOLOv11 Studio 是一款专为计算机视觉工作流设计的专业图像标注工具。它完全在浏览器中运行，并集成了 Google Gemini 模型以实现自动化辅助标注。"
        },
        {
          title: "工具与快捷键",
          icon: <Keyboard size={20} />,
          items: [
            { key: "V", name: "选择模式 (Select)", desc: "选中、移动和调整标注框大小。点击标注框即可选中。" },
            { key: "R", name: "绘制模式 (Draw)", desc: "按住鼠标左键拖动以创建新的边界框。" },
            { key: "H", name: "平移模式 (Pan)", desc: "拖动画布以移动视图（在图片放大时非常有用）。" },
            { key: "Del", name: "删除 (Delete)", desc: "删除当前选中的标注框。" },
            { key: "滚轮", name: "缩放", desc: "使用鼠标滚轮或屏幕上方的按钮进行放大/缩小。" }
          ]
        },
        {
          title: "类别管理",
          icon: <Layers size={20} />,
          text: "在左侧侧边栏管理您的对象类别（Classes）。您可以添加新类别、修改颜色或重命名。当前高亮的类别将用于新绘制的标注。"
        },
        {
          title: "AI 自动标注",
          icon: <Cpu size={20} />,
          text: "使用 Gemini 2.5 Flash 模型，根据您定义的类别名称自动检测物体。请确保类别名称具有描述性（例如“猫”、“人”、“红色汽车”），以获得最佳效果。"
        },
        {
          title: "导出数据",
          icon: <Download size={20} />,
          text: "切换到“训练 / 导出 (Train / Export)”标签页以下载您的数据集。工具会自动生成标准的 YOLOv11 目录结构（训练集/验证集划分）、data.yaml 配置文件以及 Python 训练脚本。"
        }
      ],
      button: "我知道了"
    }
  };

  const t = content[lang];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 w-full max-w-2xl max-h-[85vh] rounded-xl border border-neutral-700 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
             {t.title}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex bg-neutral-800 rounded p-0.5 border border-neutral-700">
              <button 
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-medium rounded transition-all ${lang === 'en' ? 'bg-neutral-700 text-white shadow ring-1 ring-white/10' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                English
              </button>
              <button 
                onClick={() => setLang('cn')}
                className={`px-3 py-1 text-xs font-medium rounded transition-all ${lang === 'cn' ? 'bg-neutral-700 text-white shadow ring-1 ring-white/10' : 'text-neutral-400 hover:text-neutral-200'}`}
              >
                中文
              </button>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {t.sections.map((section, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                {section.icon} {section.title}
              </h3>
              {section.text && (
                <p className="text-neutral-300 leading-relaxed text-sm">
                  {section.text}
                </p>
              )}
              {section.items && (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {section.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 bg-neutral-800/40 p-2 rounded border border-neutral-800 hover:border-neutral-700 transition-colors">
                      <div className="min-w-[4rem] flex justify-center mt-0.5">
                        <kbd className="bg-neutral-700 text-neutral-200 px-2 py-0.5 rounded text-xs font-mono border border-neutral-600 shadow-sm">
                          {item.key}
                        </kbd>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-neutral-200">{item.name}</div>
                        <div className="text-xs text-neutral-400 mt-0.5">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 text-center">
          <button 
            onClick={onClose}
            className="px-8 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20"
          >
            {t.button}
          </button>
        </div>
      </div>
    </div>
  );
};
