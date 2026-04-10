# @heron/core

Heron 是基于 Egret 游戏引擎 API 的现代化重写。保持与 Egret 一致的显示对象模型和事件体系，同时在渲染架构、类型安全和工程规范上全面升级。

## 特性

**渲染引擎**
- WebGL 优先 + Canvas 2D 自动降级
- InstructionSet 指令驱动渲染，借鉴 Pixi.js 8 两阶段架构（Build → Execute）
- 多纹理批处理（8 张/批），减少 draw call
- RenderGroup 分层，静态子树零遍历开销
- 滤镜：Blur、Glow、DropShadow、ColorMatrix、自定义 WebGL 着色器（CustomFilter）
- 遮罩：scissor / stencil / 离屏合成三种策略自动选择
- WebGL Context Lost 恢复

**显示对象**
- 完整的场景图：DisplayObject → Container → Sprite → Stage
- Bitmap（含 scale9Grid）、Shape、Mesh、TextField、BitmapText、Video
- Graphics 矢量绘图（rect、circle、ellipse、arc、cubic bezier、虚线等）
- 离屏缓存（cacheAsBitmap）、tint 着色、skew 斜切、zIndex 排序

**事件系统**
- 与 Egret 一致的事件类：Event、TouchEvent、TimerEvent、ProgressEvent 等
- 捕获/冒泡两阶段分发、事件池、`once()` 一级支持
- 触摸/鼠标统一处理，支持多触点

**其他**
- 7 种屏幕适配模式（showAll / noScale / exactFit / noBorder 等）
- HttpRequest / ImageLoader 网络加载
- Sound（Web Audio + HTML Audio 降级）/ Video 媒体播放
- ByteArray / Timer / Logger / FontManager / LocalStorage
- 全量 `strict: true` TypeScript，零 `any`

**与 Egret 对比**

| 维度 | Egret | Heron |
|------|-------|-------|
| 代码量 | 42,340 行 | ~13,000 行 |
| 模块系统 | `namespace egret` | ES Module |
| 类型安全 | 大量 `any` | `strict: true` |
| 渲染架构 | RenderNode 树 | 扁平 InstructionSet |
| 批处理 | 同纹理 | 多纹理（8 张/批） |

## 快速开始

```typescript
import { createPlayer, Event, TextField } from '@heron/core';

const app = createPlayer({
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    frameRate: 60,
    scaleMode: 'showAll',
    contentWidth: 640,
    contentHeight: 1136,
});

const text = new TextField();
text.text = 'Hello Heron';
app.stage.addChild(text);

app.start();
```

## 文档

- [架构文档](./docs/architecture.md) — 渲染管线设计、API 对比、Breaking Changes、优化路线图

## 许可证

MIT
