# Heron Core V2 架构文档

> 版本：0.2.1 | 更新日期：2026-04-10
>
> 本文档是 Heron Core 的完整技术文档，整合了翻新计划、Egret 对比分析、
> 渲染重构设计与实现、性能分析等所有已完成工作的记录。

---

## 一、项目概述

Heron 是对 Egret 游戏引擎的现代化翻新。在保持与 Egret 对外 API 一致性的前提下，
完成了模块系统现代化、类型安全升级、渲染架构重构三大目标。

| 指标     | 旧 Egret                    | Heron V2                                  |
| -------- | --------------------------- | ----------------------------------------- |
| 源文件数 | 166                         | ~97                                       |
| 代码行数 | 42,340                      | ~13,000                                   |
| 模块系统 | `namespace egret`           | ES Module                                 |
| 类型系统 | `strict` 未开启，大量 `any` | `strict: true`，全量类型安全              |
| 编译目标 | ES5/ES3                     | ES2022                                    |
| 渲染架构 | RenderNode 三阶段           | InstructionSet 指令驱动（借鉴 Pixi.js 8） |
| 批处理   | 同纹理合并                  | 多纹理批处理（8张/批）                    |
| 包管理   | 无 package.json（monolith） | `@heron/core` workspace 包                |

---

## 二、模块结构

```
packages/core/src/heron/
├── display/          # 显示对象层（场景图）
│   ├── DisplayObject.ts          # 基类，含 renderDirty/cacheDirty/renderMode
│   ├── DisplayObjectContainer.ts # 容器，含 isRenderGroup
│   ├── Bitmap.ts                 # 位图显示
│   ├── Sprite.ts                 # 精灵（容器 + Graphics）
│   ├── Shape.ts                  # 矢量图形
│   ├── Mesh.ts                   # 网格（vertices/indices/uvs）
│   ├── Stage.ts                  # 舞台根节点
│   ├── Graphics.ts               # 矢量绘图命令
│   ├── GraphicsPath.ts           # 命令类型定义（新增）
│   ├── enums/                    # BlendMode, BitmapFillMode 等
│   └── texture/                  # BitmapData, Texture, SpriteSheet, RenderTexture
├── player/           # 渲染管线 + 游戏循环
│   ├── Player.ts                 # 播放器（Stage + Renderer 绑定）
│   ├── SystemTicker.ts           # 帧循环（RAF + ENTER_FRAME）
│   ├── CanvasRenderer.ts         # Canvas 2D 渲染器
│   ├── RenderPipe.ts             # RenderPipe 接口定义
│   ├── InstructionSet.ts         # 指令集
│   ├── DisplayList.ts            # cacheAsBitmap 离屏缓存
│   ├── RenderBuffer.ts           # Canvas 2D 缓冲区
│   ├── TouchHandler.ts           # 触摸/鼠标输入
│   ├── ScreenAdapter.ts          # 屏幕适配（7种缩放模式）
│   ├── createPlayer.ts           # 统一创建入口（新增）
│   ├── HeronOptions.ts           # 配置接口（新增）
│   ├── pipes/                    # RenderPipe 实现
│   │   ├── BitmapPipe.ts
│   │   ├── GraphicsPipe.ts
│   │   ├── MeshPipe.ts
│   │   ├── FilterPipe.ts
│   │   └── MaskPipe.ts
│   └── webgl/                    # WebGL 渲染后端
│       ├── WebGLRenderer.ts      # 两阶段渲染器（build + execute）
│       ├── WebGLRenderContext.ts  # WebGL 状态管理 + draw 调度
│       ├── WebGLRenderBuffer.ts  # WebGL 缓冲区（含对象池）
│       ├── WebGLRenderTarget.ts  # FBO 管理
│       ├── WebGLVertexArrayObject.ts
│       ├── WebGLDrawCmdManager.ts
│       ├── WebGLProgram.ts
│       ├── ShaderLib.ts          # GLSL 着色器源码
│       ├── MultiTextureBatcher.ts # 多纹理批处理
│       └── WebGLUtils.ts
├── events/           # 事件系统（完整保留 Egret API）
├── geom/             # 几何工具（Matrix, Point, Rectangle）
├── filters/          # 滤镜（Blur, Glow, DropShadow, ColorMatrix, Custom）
├── text/             # 文本渲染（TextField, BitmapText, BitmapFont）
├── net/              # 网络加载（HttpRequest, ImageLoader）
├── media/            # 媒体（Sound, SoundChannel, Video）
├── utils/            # 工具类（HashObject, ByteArray, Timer, Logger, FontManager, DebugLog）
├── localStorage/     # 本地存储
└── external/         # 外部接口
```

---

## 三、渲染管线架构（核心设计）

### 3.1 架构演进

```
旧 Egret（三阶段）:
  DisplayObject.$getRenderNode() → RenderNode 树 → Renderer 遍历 → Canvas/WebGL

Heron V1（两阶段，直接渲染）:
  Renderer.drawDisplayObject() → instanceof 分发 → 直接 drawCall
  问题：每帧全量遍历，静态对象浪费 JS CPU

Heron V2（指令驱动两阶段，借鉴 Pixi.js 8）:
  Phase A — Build（仅 structureDirty 时）:
    遍历 DisplayObject 树 → 生成 Instruction（含 transform 快照）→ InstructionSet
  Phase A' — Update（仅 renderDirty 时）:
    遍历 dirtyRenderables → 刷新 transform 快照（O(1) 查找）
  Phase B — Execute（每帧）:
    按指令顺序分发到 Pipe → 无场景图遍历
```

### 3.2 设计思想对比

| 设计点   | Egret RenderNode             | Heron V2 InstructionSet                        | Pixi.js 8                                        |
| -------- | ---------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| 中间表示 | RenderNode 树                | 扁平 Instruction 数组                          | 扁平 Instruction 数组                            |
| 缓存粒度 | 每个 DisplayObject 一个 Node | 整棵树/RenderGroup 一个 Set                    | 每个 RenderGroup 一个                            |
| 脏检查   | $renderDirty 跳过子树重建    | structureDirty 全量重建 / renderDirty 局部更新 | structureDidChange + childrenRenderablesToUpdate |
| 分发方式 | node.type switch             | renderPipeId 字符串分发                        | renderPipeId 字符串分发                          |
| 批处理   | 同纹理合并                   | 多纹理批处理（8张/批）                         | Batcher 多纹理                                   |

InstructionSet 在语义上等价于 Egret 的 RenderNode 缓存——都是"场景不变时复用上一帧的渲染指令"。
区别在于 Egret 是树形缓存（每个节点独立），V2 是扁平缓存（整棵树一个数组），后者对 CPU cache 更友好。

### 3.3 RenderPipe 体系

```
RenderPipe<T extends DisplayObject>
├── addToInstructionSet(renderable, set)  — 结构变化时调用
├── updateRenderable(renderable)          — 数据变化时调用
└── destroyRenderable(renderable)         — 对象销毁时调用

实现：
├── BitmapPipe    → BitmapInstruction    → drawImage()
├── GraphicsPipe  → GraphicsInstruction  → Canvas光栅化 → 纹理上传 → drawTexture()
├── MeshPipe      → MeshInstruction      → drawMesh()
├── FilterPipe    → FilterPush/Pop       → 离屏FBO → 着色器滤镜
└── MaskPipe      → MaskPush/Pop         → stencil/scissor/离屏合成
```

### 3.4 RenderGroup 分层

```typescript
// 将静态背景层标记为独立渲染组
backgroundLayer.isRenderGroup = true;
```

- 每个 RenderGroup 拥有独立的 InstructionSet
- 父 set 只包含一条 `renderGroup` 指令
- 子树结构变化只触发自身 set 重建，不影响父 set
- 静态子树的 JS 遍历开销降为零

### 3.5 多纹理批处理

```
旧 Egret / V1：纹理切换 = 打断批处理
  Bitmap A (tex1) → drawCall 1
  Bitmap B (tex2) → drawCall 2
  Bitmap C (tex1) → drawCall 3

V2 多纹理批处理：一个 drawCall 绑定多张纹理
  Bitmap A (tex1, slot 0) ─┐
  Bitmap B (tex2, slot 1)  ├→ drawCall 1
  Bitmap C (tex1, slot 0) ─┘
```

- `MultiTextureBatcher` 管理最多 8 个纹理槽位
- 顶点格式扩展：增加 `aTextureId` float 属性（stride 24B）
- Fragment shader 使用 if/else 链采样（WebGL1 兼容）
- mesh、filter、blend 变化自动 flush 回退到单纹理路径

### 3.6 脏标记系统

```
DisplayObject 脏标记：
├── cacheDirty    — cacheAsBitmap 缓存失效，向上传播
├── renderDirty   — 视觉数据变化（位置/纹理/alpha/tint），向上传播
└── renderMode    — 渲染模式（NONE/FILTER/CLIP/SCROLLRECT）

通知机制：
├── markDirty()
│   ├── 更新 worldAlpha / worldTint 缓存（O(1) 读取，避免 execute 阶段遍历父链）
│   ├── 调用 _onRenderableDirty(this) → WebGLRenderer.markRenderableDirty()
│   └── 向上传播 cacheDirty + renderDirty
├── updateRenderMode()
│   └── 调用 _onStructureChange() → WebGLRenderer.markStructureDirty()
└── DisplayObjectContainer.markDirtyInternal()
    └── 调用 _onContainerStructureChange(this) → markStructureDirty(owner)
```

等价于 Egret 的 `$renderDirty` + `$cacheDirtyUp()`，但增加了结构/数据变化分离通知。

---

## 四、WebGL 渲染后端

### 4.1 渲染流程

```
Player.render()
  → WebGLRenderer.render(stage, buffer, matrix)
    → Phase A: _buildInstructions() / _updateDirtyRenderables()
    → Phase B: _executeInstructions()
      → Pipe.execute() → WebGLRenderContext.drawImage/drawMesh/drawTexture()
    → WebGLRenderContext.flush() → _flush()
      → 上传顶点 → 遍历 DrawCmdManager → 分发 draw batch
```

### 4.2 着色器体系

| 着色器                                   | 用途                               |
| ---------------------------------------- | ---------------------------------- |
| default_vert + texture_frag              | 标准纹理绘制                       |
| multi_vert + multi_frag                  | 多纹理批处理（8单元）              |
| default_vert + colorTransform_frag       | ColorMatrixFilter                  |
| default_vert + glow_frag                 | Glow/DropShadow                    |
| default_vert + blur_h_frag / blur_v_frag | 水平/垂直模糊（ping-pong 双 pass） |
| default_vert + primitive_frag            | 纯色矩形（stencil mask）           |

### 4.3 滤镜渲染

滤镜通过 FilterPipe 的 push/pop 指令对实现：

- **push 阶段**：分配离屏 FBO（含 filter padding 扩展），将后续 draw 重定向到离屏 buffer
- **pop 阶段**：调用 `compositeFilterResult()` 将离屏结果合成回父 buffer

合成流程（`compositeFilterResult`，参照 Egret `_drawWithFilter` 模式）：

1. `flush()` — 执行所有待处理的批处理命令，确保离屏 FBO 内容完整
2. BlurFilter ping-pong — 直接 GL 调用，不经过批处理队列
3. 显式激活父 buffer FBO — 防止批处理系统的 FBO 状态与实际 GL 状态不一致
4. `drawTexture()` — 通过批处理路径绘制，利用父 buffer 的 `globalMatrix` 正确定位
5. 立即 `flush()` — 在 FBO 状态已知正确时执行绘制，防止 feedback loop

各滤镜实现：

- **ColorMatrixFilter**：inline 优化路径，无离屏 FBO，直接设置 `activeFilter` 让叶子指令带滤镜绘制
- **BlurFilter**：ping-pong 双 pass 分离模糊（水平 → 临时 FBO → 垂直 → 离屏 FBO）
- **GlowFilter / DropShadowFilter**：单 pass `glow_frag` 着色器，共用同一 shader 程序

Filter padding：离屏 buffer 按 `Filter.getPadding()` 的 left/right/top/bottom 扩展尺寸，
确保 blur/glow 的溢出效果有足够空间渲染。`_setOffscreenOrigin` 计算世界坐标偏移，
使内容的 bounds 原点落在 buffer 的 `(padX, padY)` 位置。

**纹理坐标 Y 轴注意事项**：Heron 的顶点着色器通过 `projectionY = -h/2` 翻转 Y 轴，
使屏幕坐标系 Y 向下。但纹理坐标未翻转（WebGL 默认 Y=0 在底部）。对于普通渲染
这不影响（UV 在 `cacheArrays` 中已正确映射），但 shader 内部做纹理坐标偏移时
需要注意方向。DropShadowFilter 的 angle uniform 传入时取反（`-angle`）以补偿
`sin` 分量的 Y 方向差异。

### 4.4 遮罩渲染

- scrollRect/maskRect 无旋转：scissor 裁剪（GPU 硬件加速）
- scrollRect/maskRect 有旋转：stencil 裁剪
- DisplayObject mask：离屏 buffer + destination-in 合成

---

## 五、Canvas 2D 渲染后端

Canvas 2D 渲染器保持直接遍历模式，作为 WebGL 不可用时的降级方案。

已完成的优化：

- Graphics 离屏 Canvas 缓存（`canvasCacheDirty` 脏标记）
- CSS filter 快速路径（Blur → `blur()`，DropShadow → `drop-shadow()`）
- ColorMatrixFilter CPU 像素操作降级
- cacheAsBitmap 支持（通过 DisplayList）
- 像素级命中测试（3x3 离屏 buffer）

---

## 六、与 Egret 的 API 对比

### 6.1 显示对象 API

| Egret API                                                                | 状态                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| `x/y/scaleX/scaleY/rotation/alpha/visible/touchEnabled`                  | ✅ 完全一致                                    |
| `anchorOffsetX/Y`                                                        | ✅ 完全一致                                    |
| `width/height`                                                           | ⚠️ 行为变更：使用 explicitWidth/Height 模式    |
| `mask` (DisplayObject/Rectangle) / `scrollRect`                          | ✅ 完全一致                                    |
| `cacheAsBitmap` / `filters`                                              | ✅ 完全一致                                    |
| `getBounds()` / `globalToLocal()` / `localToGlobal()` / `hitTestPoint()` | ✅ 完全一致                                    |
| `addChild/removeChild/swapChildren/setChildIndex`                        | ✅ 完全一致                                    |
| `getChildAt`                                                             | ⚠️ 越界返回 `undefined`（Egret 可能抛异常）   |
| `removeChildAt`                                                          | ⚠️ 越界返回 `undefined`（Egret 可能抛异常）   |
| `removeChildren`                                                         | ⚠️ 返回 `void`（Egret 返回数组）              |
| `bitmap.texture/smoothing/fillMode/scale9Grid/pixelHitTest`              | ✅ 完全一致                                    |
| `bitmap.width/height`                                                    | ⚠️ 使用 explicitBitmapWidth/Height 模式        |
| `mesh.vertices/indices/uvs`                                              | ✅ 完全一致（Mesh extends Bitmap，非 Egret 原生类） |
| `graphics.beginFill/lineStyle/drawRect/drawCircle/...`                   | ✅ 完全一致                                    |
| `stage.stageWidth/stageHeight/frameRate/scaleMode/orientation`           | ✅ 完全一致                                    |
| `blendMode`                                                              | ⚠️ 值从 `"normal"` 改为 `"source-over"`       |
| `matrix` getter                                                          | ⚠️ 返回 clone（Egret 返回引用）               |

### 6.2 新增 API（Egret 无对应）

| 属性/方法                                        | 说明                              |
| ------------------------------------------------ | --------------------------------- |
| `displayObject.tint`                             | 着色（0xRRGGBB），Pixi 风格      |
| `displayObject.zIndex` / `sortableChildren`      | 排序                              |
| `displayObject.skewX/skewY`                      | 斜切变换                          |
| `displayObject.measuredWidth/measuredHeight`      | 内容测量尺寸（只读）              |
| `container.isRenderGroup`                        | 独立渲染组标记                    |
| `container.sortChildren()`                       | 按 zIndex 排序                    |
| `graphics.drawArc()`                             | 原生弧线绘制                      |
| `graphics.lineStyle(..., lineDash?)`             | 虚线参数                          |
| `CustomFilter`                                   | 自定义 WebGL 着色器滤镜          |
| `EventDispatcher.once()`                         | 一级公开方法（Egret 仅为内部）    |
| `Player.perf`                                    | 性能指标对象（fps/drawCalls 等）  |
| `createPlayer(options)` → `HeronApp`             | 统一创建入口                      |
| `SoundType` 枚举                                 | `'music'` / `'effect'`            |
| `FontManager` (registerFontMapping/cacheFontResource) | 字体注册与缓存              |
| `DebugLog`                                       | 帧级调试日志                      |
| `WordWrap` 模块                                  | 多语言自动换行                    |
| `TextMeasurer` (measureText/getFontString)       | 文本测量工具                      |

### 6.3 事件系统

12 个事件类完整保留，导出名称与 Egret 一致，通过 ES Module 包名隔离：

```typescript
import { Event, TouchEvent } from '@heron/core';  // 直接用原名
import * as H from '@heron/core';                   // 需要隔离时用命名空间
```

| 类名                  | 差异                       |
| --------------------- | -------------------------- |
| `Event`               | 新增 `Event.dispatch()`    |
| `TouchEvent`          | 无差异                     |
| `TimerEvent`          | 无差异                     |
| `ProgressEvent`       | 无差异                     |
| `IOErrorEvent`        | 无差异                     |
| `HTTPStatusEvent`     | 无差异                     |
| `FocusEvent`          | ⚠️ 缺少 `relatedObject`    |
| `TextEvent`           | 无差异                     |
| `StageOrientationEvent` | 无差异                  |
| `EventDispatcher`     | 新增 `once()` 一级方法     |
| `IEventDispatcher`    | 新增 `once()` 接口方法     |
| `EventPhase`          | 改为 `const enum`          |

内部优化：存储改为 `Map`，对象池改为 `WeakMap`，移除 `thisObject` 参数。

### 6.4 其他模块对比

| 模块                                              | 状态                                    | 差异说明                                     |
| ------------------------------------------------- | --------------------------------------- | -------------------------------------------- |
| geom (Matrix/Point/Rectangle)                     | ✅ API 兼容                             | 对象池 `create()/release()`，严格等号 `===`  |
| filters (Blur/Glow/DropShadow/ColorMatrix)        | ✅ API 兼容                             |                                              |
| filters (CustomFilter)                            | 🆕 全新                                 | 自定义 WebGL 着色器滤镜                     |
| net (HttpRequest/ImageLoader)                     | ✅ API 兼容                             | 新增 `HttpMethod`/`HttpResponseType` 常量    |
| media (Sound/SoundChannel/Video)                  | ✅ API 兼容                             | 新增 `SoundType`，串行解码队列               |
| text (TextField/BitmapText/BitmapFont)            | ✅ API 兼容                             | `BitmapText` 新增 `letterSpacing/smoothing`  |
| text (HtmlTextParser)                             | ✅ API 兼容                             | 新增 `parse()` 替代废弃的 `parser()`         |
| localStorage                                      | ✅ API 兼容                             | 导出为 `localStorage` 命名空间               |
| ExternalInterface                                 | ✅ API 兼容                             | 使用 `window.__heronCallback` 调度           |
| utils (ByteArray/Timer/HashObject)                | ✅ API 兼容                             | ByteArray 用 DataView 替代手动 ArrayBuffer    |
| utils (Base64Util)                                | ⚠️ 签名变更                             | `encode(ArrayBuffer)` 替代 `encode(string)`  |

---

## 七、架构级变更（相对 Egret）

### 7.1 渲染架构

- RenderNode 中间层 → InstructionSet 指令驱动
- 12 个 nodes/paths 文件完全移除
- Graphics 从 `sys.GraphicsNode` + `sys.Path2D` → `GraphicsCommand[]` 扁平命令数组

### 7.2 接口/实现分离 → 统一实现

旧代码的"接口 + Web 实现 + Native 实现"三文件模式全部合并为单一实现。
每个模块平均减少 60-85% 代码量。

### 7.3 Native 渲染路径移除

`egret.nativeRender`、`egret_native.*` 分支全部移除，仅支持 Web 平台。

### 7.4 全局变量消除

| 旧全局                              | 新方案                                     |
| ----------------------------------- | ------------------------------------------ |
| `global.egret` / `egret.*`          | ES Module 导入                             |
| `egret.$TextureScaleFactor`         | 模块级导出                                 |
| `egret.$TempPoint/Rectangle/Matrix` | `sharedPoint/sharedRectangle/sharedMatrix` |
| `sys.$requestRenderingFlag`         | `setRequestRenderingFlag()` 函数           |

### 7.5 命名规范

| 旧                                  | 新                                |
| ----------------------------------- | --------------------------------- |
| `$field`（public + @private）       | `_field`（private）               |
| `$method()`                         | `private method()` 或 `@internal` |
| `class X { public static A = "a" }` | `const X = { A: 'a' } as const`   |

### 7.6 移除的遗留代码

`Function.prototype.bind` polyfill、手写 UTF-8 编解码器、`egret.$error(code)` 错误码、
MSPointer/IE 兼容、vendor 前缀 CSS、`WebCapability.detect()` 浏览器嗅探、
typescript-plus 魔改编译器、resourcemanager 黑盒插件管道等。

---

## 八、Breaking Changes

| 变更                        | 影响                           | 迁移方式                                          |
| --------------------------- | ------------------------------ | ------------------------------------------------- |
| `thisObject` 参数移除       | 所有事件监听代码               | 使用箭头函数                                      |
| `BlendMode` 值变化          | `"normal"` → `"source-over"`   | 使用常量                                          |
| `Point.polar()` 参数单位    | 弧度 → 角度                    | 检查调用方                                        |
| `width/height` 行为变更     | Egret 通过 scaleX/scaleY 模拟  | 使用 explicitWidth/Height 或直接设 scaleX/scaleY  |
| `matrix` getter 返回 clone  | 依赖引用修改 matrix 的代码     | 改用 `setMatrix()` 或解构赋值                     |
| `removeChildren()` 返回值   | `DisplayObject[]` → `void`     | 不依赖返回值                                      |
| `getChildAt()` 越界         | 可能抛异常 → 返回 `undefined`  | 检查返回值                                        |
| `stopPropagation()` 行为    | 非冒泡事件也可停止             | 测试非冒泡事件逻辑                                |
| hitTest 返回值              | `null` → `undefined`           | 检查 `=== null`                                   |
| 命名空间                    | `egret.xxx` → ES Module import | 全量替换                                          |
| `FocusEvent.relatedObject`  | 属性不存在                     | 自行追踪焦点相关对象                              |
| `Texture.getPixel32/getPixels/toDataURL` | 已废弃，调用抛异常 | 仅 `RenderTexture.getPixel32` 可用                |
| `Base64Util.encode` 签名    | `string` → `ArrayBuffer`       | `encode(new TextEncoder().encode(str))`           |

---

## 九、渲染重构完成度

| Phase   | 名称                                                                   | 状态          |
| ------- | ---------------------------------------------------------------------- | ------------- |
| Phase 1 | 热修复（静态 Matrix、Graphics 脏标记、renderDirty 传播）               | ✅ 完成       |
| Phase 2 | RenderPipe 分发层（5 个 Pipe + InstructionSet + 两阶段 WebGLRenderer） | ✅ 完成       |
| Phase 3 | 多纹理批处理（MultiTextureBatcher + multi shader + stride 24B）        | ✅ 完成       |
| Phase 4 | RenderGroup 分层（isRenderGroup + 独立 InstructionSet + 定向 dirty）   | ✅ 完成       |
| Phase 5 | Canvas 2D 路径对齐                                                     | ⬜ 已确认跳过 |

已修复的性能问题：

- Player.render() 每帧 new Matrix() → 静态复用
- Graphics 每帧重执行 Canvas API → canvasCacheDirty + 离屏缓存
- instanceof 热路径 → renderObjectType 枚举
- BlurFilter 单 pass → ping-pong 双 pass
- worldAlpha/worldTint 遍历父链 → markDirty 时预计算
- GraphicsPipe.execute() 每次 new Rectangle() → 模块级 scratch
- Canvas 2D 滤镜 CPU 像素操作 → CSS filter 快速路径
- WebGL Context Lost 无恢复 → 已实现恢复逻辑

已修复的渲染 bug（0.2.0 → 0.2.1）：

- `glDrawElements` index offset 计算错误（`indexOffset * 2` → `* 6`），导致多 draw call 时顶点偏移
- multi-texture 命令合并时 `cmd.count` 未同步更新，导致后续 draw 的 index offset 错误
- `compositeFilterResult` 使用批处理 `drawTexture` 但 FBO 状态不一致，导致 feedback loop（256 个 GL 错误）
- GlowFilter 未清零 `dist`/`angle`/`hideObject` uniform，导致与 DropShadowFilter 共用 shader 时 uniform 泄漏
- DropShadowFilter padding 方向错误（左右/上下都加同一个偏移值 → 按阴影方向分别扩展）
- DropShadowFilter angle 传入 shader 时未取反，导致 Y 方向阴影偏移反转（WebGL 纹理坐标 Y 轴与屏幕 Y 轴相反）
- `buffer.transform` 每帧累积浮点误差 → 改用 `setTransform` 直接设置 + 帧末重置为单位矩阵
- `_applyTransform` 未减去 `offscreenOriginX/Y`，导致 filter/mask 离屏 buffer 中内容位置错误
- premultiplyTint 运行时判断纹理是否预乘 → 统一预乘（所有纹理均以 `UNPACK_PREMULTIPLY_ALPHA_WEBGL=1` 上传）

---

## 九.五、快速启动 API

### `createPlayer(options)`

统一入口，一行代码完成 Player + Stage + TouchHandler + ScreenAdapter 的创建和绑定：

```typescript
import { createPlayer, Event } from '@heron/core';

const app = createPlayer({
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    frameRate: 60,
    scaleMode: 'showAll',
    contentWidth: 640,
    contentHeight: 1136,
});

app.stage.addEventListener(Event.ENTER_FRAME, onEnterFrame);
app.start(root);
```

### `HeronOptions` 接口

| 属性            | 类型              | 默认值      | 说明                 |
| --------------- | ----------------- | ----------- | -------------------- |
| `canvas`        | `HTMLCanvasElement` | （必填）  | 渲染画布             |
| `frameRate`     | `number`          | `60`        | 目标帧率             |
| `scaleMode`     | `StageScaleMode`  | `'showAll'` | 屏幕适配模式         |
| `contentWidth`  | `number`          | `canvas.width` | 逻辑内容宽度     |
| `contentHeight` | `number`          | `canvas.height` | 逻辑内容高度    |
| `orientation`   | `OrientationMode` | `'auto'`    | 屏幕方向             |
| `maxTouches`    | `number`          | `99`        | 最大触点数           |
| `background`    | `string`          | —           | CSS 背景色           |

### `HeronApp` 返回值

| 属性            | 类型              | 说明           |
| --------------- | ----------------- | -------------- |
| `player`        | `Player`          | 渲染播放器     |
| `stage`         | `Stage`           | 舞台根节点     |
| `touchHandler`  | `TouchHandler`    | 触摸/鼠标处理  |
| `screenAdapter` | `ScreenAdapter`   | 屏幕适配器     |
| `start(root?)`  | `() => void`      | 启动游戏循环   |
| `stop()`        | `() => void`      | 停止游戏循环   |

### `Player.perf` 性能指标

| 属性              | 类型     | 说明                   |
| ----------------- | -------- | ---------------------- |
| `fps`             | `number` | 当前帧率（每秒采样）   |
| `avgFps`          | `number` | 平均帧率               |
| `minFps`          | `number` | 最低帧率               |
| `maxFps`          | `number` | 最高帧率               |
| `drawCalls`       | `number` | 当前帧 draw call 数    |
| `avgDrawCalls`    | `number` | 平均 draw call 数      |
| `renderTimeMs`    | `number` | 当前帧渲染耗时（ms）   |
| `avgRenderTimeMs` | `number` | 平均渲染耗时           |
| `maxRenderTimeMs` | `number` | 最大渲染耗时           |
| `totalRenderTimeMs` | `number` | 累计渲染耗时         |
| `frameCount`      | `number` | 总帧数                 |

---

## 十、移植完成度

### 已完成

| 模块                         | 文件数                  | 测试覆盖 | 状态 |
| ---------------------------- | ----------------------- | -------- | ---- |
| events/                      | 13                      | ✅ 3 文件 | ✅   |
| geom/                        | 3                       | ✅ 3 文件 | ✅   |
| utils/                       | 10 (含 FontManager 新增) | ✅ 4 文件 | ✅   |
| display/ + enums/ + texture/ | 20 + GraphicsPath 新增  | ✅ 3 文件 | ✅   |
| net/                         | 4                       | —        | ✅   |
| filters/                     | 6 (含 CustomFilter 新增) | ✅ 1 文件 | ✅   |
| localStorage/                | 1                       | —        | ✅   |
| external/                    | 1                       | —        | ✅   |
| media/                       | 3                       | —        | ✅   |
| player/ + pipes/ + webgl/    | 20+                     | ✅ 1 文件 | ✅   |
| text/                        | 8 + WordWrap 新增       | —        | ✅   |

**测试总计：14 个测试文件，225 个测试用例，全部通过。**

### 搁置项

| 项目                                | 原因                      |
| ----------------------------------- | ------------------------- |
| KTXContainer（压缩纹理）            | 待 WebGL 层完善           |
| Geolocation/Motion/Orientation 事件 | 传感器，待评估            |
| web/ 平台适配层                     | 用 packages/runtime/ 替代 |
| 3d/ (EgretPro)                      | 独立处理                  |
| registerClass / getDefinitionByName | 反射机制，不需要          |

---

## 十一、优化空间

以下按优先级排列，所有优化均不影响对外 API 一致性。

### P1: TextField WebGL 渲染优化

- 当前文本通过 Canvas 2D 光栅化 → 上传纹理
- Egret 有 TextAtlasRender（文字图集）优化
- 建议：对频繁更新文本引入文字图集缓存

### P1: Context Lost 恢复完善

- 当前已实现基础恢复（GL 状态 + shader 缓存清除）
- 缺少：纹理重上传、InstructionSet 重建

### P2: Bitmap scale9Grid WebGL 路径

- 已实现：BitmapPipe 中的 `_drawScale9` 方法，将九宫格拆分为 9 个 drawImage 调用
- 自动降级：当目标尺寸小于角块总和时回退为普通拉伸

### P2: 顶点数据优化

- 当前每帧 `gl.bufferData(STREAM_DRAW)` 全量上传
- 可用 `gl.bufferSubData()` 局部更新或双缓冲 VBO

### P2: 单元测试补充

- 已有：14 文件 225 用例（geom/events/utils/display/filters/player）
- 待补充：net（HttpRequest/ImageLoader）、media（Sound/Video）、text（TextField/BitmapText）、WebGL 集成

### P3: 压缩纹理支持（KTX/ASTC/ETC2）

### P3: WebGPU 后端（架构已预留扩展点）

---

## 十二、CLI 工具链

### 12.1 项目结构

```
packages/cli/
├── src/
│   ├── index.ts              # 入口（commander.js）
│   ├── commands/
│   │   ├── build.ts          # heron build（esbuild 编译）
│   │   ├── create.ts         # heron create（模板拷贝）
│   │   └── clean.ts          # heron clean
│   ├── core/
│   │   ├── config.ts         # heron.config.ts 读取
│   │   ├── compiler.ts       # TS 编译编排（esbuild）
│   │   ├── exml-compiler.ts  # EXML 转换
│   │   └── template.ts       # 模板处理
│   └── utils/
└── templates/game/           # 项目模板
```

### 12.2 配置文件

`heron.config.ts` 替代旧的 `egretProperties.json` + `index.html data-*`：

```typescript
import { defineConfig } from '@heron/cli';
export default defineConfig({
	target: 'html5',
	entry: 'src/Main.ts',
	stage: { width: 640, height: 1136, scaleMode: 'showAll', frameRate: 60 },
});
```

### 12.3 与旧 Egret CLI 对比

| 维度      | 旧 Egret                                  | Heron                     |
| --------- | ----------------------------------------- | ------------------------- |
| CLI 框架  | 手写参数解析                              | commander.js              |
| TS 编译器 | typescript-plus（魔改 tsc）               | esbuild                   |
| 配置文件  | egretProperties.json + index.html data-\* | heron.config.ts           |
| 插件管道  | resourcemanager（闭源）                   | 纯函数管道                |
| EXML 编译 | 内嵌在 tools/lib/eui/                     | 独立包 @heron/exml-parser |
| 模块系统  | CommonJS                                  | ESM                       |
