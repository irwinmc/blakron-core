# Blakron Core 测试规划

> 最后更新：2026-05-05 (P1 第三轮)
> 当前状态：37 test files, 621 tests, all passing

---

## 1. 现状概述

### 1.1 测试统计

| 指标 | 数值 |
|---|---|
| 测试文件数 | 37 |
| 测试用例数 | 621 |
| 源文件总数（含类型/枚举/索引） | ~120 |
| 有实际逻辑的源文件 | ~60 |
| 测试覆盖率（按文件） | ~62% |
| 测试覆盖率（按核心逻辑） | ~80% |

### 1.2 已有测试按模块分布

| 模块 | 测试文件 | 覆盖内容 |
|---|---|---|
| `geom/` | `Point.test.ts`, `Rectangle.test.ts`, `Matrix.test.ts` | 所有公开方法、边界条件、对象池、chaining |
| `events/` | `Event.test.ts`, `EventDispatcher.test.ts`, `EventPropagation.test.ts`, `TouchEvent.test.ts`, `ProgressEvent.test.ts`, `HTTPStatusEvent.test.ts` | 事件创建/池化、监听器管理、capture→bubble 传播链、触摸/进度/HTTP 状态事件 |
| `display/` | `DisplayObject.test.ts`, `DisplayObjectContainer.test.ts`, `DisplayObjectIntegration.test.ts`, `Bitmap.test.ts`, `Shape.test.ts`, `Sprite.test.ts`, `Stage.test.ts`, `Graphics.test.ts`, `BlendMode.test.ts`, `Mesh.test.ts`, `Texture.test.ts`, `BitmapData.test.ts`, `SpriteSheet.test.ts` | 基础属性、容器管理、空间变换、Bitmap 核心渲染、纹理管理、图集、图形绘制 |
| `filters/` | `filters.test.ts`, `CustomFilter.test.ts`, `Filter.test.ts` | 五种滤镜参数 + Filter 基类 |
| `utils/` | `Base64Util.test.ts`, `ByteArray.test.ts`, `NumberUtils.test.ts`, `toColorString.test.ts`, `HashObject.test.ts`, `Logger.test.ts`, `DebugLog.test.ts` | 工具函数全覆盖 |
| `media/` | `Sound.test.ts`, `SoundChannel.test.ts`, `Video.test.ts` | 音频加载/播放、视频基本操作 |
| `player/` | `InstructionSet.test.ts` | 指令集增删改 |
| `benchmark/` | `benchmark.test.ts` | 性能测试基础设施 |

---

## 2. 测试缺口分析

### 2.1 🔴 P0 — 核心渲染对象 ✅ 已解决

| 文件 | 测试文件 | 测试数 |
|---|---|---|
| `display/Bitmap.ts` | `Bitmap.test.ts` | 20 |
| `display/texture/Texture.ts` | `Texture.test.ts` | 14 |
| `display/texture/BitmapData.ts` | `BitmapData.test.ts` | 15 |
| `display/Mesh.ts` | `Mesh.test.ts` | 8 |
| `events/TouchEvent.ts` | `TouchEvent.test.ts` | 10 |
| `display/texture/SpriteSheet.ts` | `SpriteSheet.test.ts` | 10 |

### 2.2 🔴 P0 — DisplayObject 遗漏方法 ✅ 已解决

| 方法 | 状态 |
|---|---|
| `sortableChildren` getter/setter | ✅ |
| `tint` 边界值（溢出/负值/NaN） | ✅ |
| `setMatrix()` 位置更新 + `needUpdateProperties` | ✅ |
| `cacheAsBitmap` toggle | ✅ |
| `ENTER_FRAME` / `RENDER` 静态回调列表 | ✅ |
| `mask=self` 拒绝 | ✅ |
| `scrollRect` 清除 | ✅ |
| `blendMode` 默认值 | ✅ |

### 2.3 🔴 P0 — DisplayObjectContainer 遗漏方法 ✅ 已解决

| 方法 | 状态 |
|---|---|
| `addChildAt` 越界→末尾 | ✅ |
| `removeChildAt` 越界→undefined | ✅ |
| `setChildIndex` 越界 clamp | ✅ |
| `swapChildren` 非子节点 no-op | ✅ |
| `swapChildrenAt` 相同/无效索引 | ✅ |
| `sortChildren` z-index 排序 + 稳定排序 | ✅ |

### 2.4 🟡 P1 — 中等优先级（部分完成）

| 文件 | 状态 |
|---|---|
| `display/Graphics.ts` — beginGradientFill / drawArc anticlockwise / lineStyle cap/joint/lineDash / lineStyle 零宽度 | ✅ 已补充 |
| `utils/DebugLog.ts` | ✅ `DebugLog.test.ts` (8 tests) |
| `events/ProgressEvent.ts` | ✅ `ProgressEvent.test.ts` (6 tests) |
| `events/HTTPStatusEvent.ts` | ✅ `HTTPStatusEvent.test.ts` (6 tests) |
| `filters/Filter.ts` 基类 | ✅ `Filter.test.ts` (8 tests) |
| `display/texture/RenderTexture.ts` | ⏳ 需 mock renderer |
| `utils/Timer.ts` | ⏳ 需 SystemTicker mock |
| `net/HttpRequest.ts` | ⏳ 需 XHR mock |
| `net/ImageLoader.ts` | ⏳ 需 Image mock |
| `player/SystemTicker.ts` | ⏳ 需 mock |
| `player/ScreenAdapter.ts` | ⏳ 需 mock |
| `resource/*` | ⏳ 需完整 mock 链 |

### 2.5 🟢 P2 — 低优先级（简单常量/枚举/接口）

手动测试价值较低，类型系统即可保证正确性：

`CapsStyle.ts`, `GradientType.ts`, `JointStyle.ts`, `BitmapFillMode.ts`, `OrientationMode.ts`, `StageScaleMode.ts`, `HttpMethod.ts`, `HttpResponseType.ts`, `EventPhase.ts`, `IEventDispatcher.ts`, `FocusEvent.ts`, `StageOrientationEvent.ts`, `TextEvent.ts`, `ITextElement.ts`, `HorizontalAlign.ts`, `VerticalAlign.ts`, `TextFieldInputType.ts`, `TextFieldType.ts`, `BlakronOptions.ts`, `Capabilities.ts`, `ExternalInterface.ts`, `localStorage.ts`

### 2.6 ⬜ P3 — 需要完整运行时环境

`Player.ts`, `TouchHandler.ts`, `CanvasRenderer.ts`, `DisplayList.ts`, `RenderBuffer.ts`, `WebGLRenderer.ts`, `WebGLRenderContext.ts`, `WebGLProgram.ts`, `WebGLRenderBuffer.ts`, `WebGLRenderTarget.ts`, `WebGLVertexArrayObject.ts`, `MultiTextureBatcher.ts`, `WebGLDrawCmdManager.ts`, `WebGLUtils.ts`, 所有 `pipes/*`, `shaders/*`, `FontManager.ts`

---

## 3. 测试策略

### 3.1 分层策略

```
┌─────────────────────────────────────────┐
│            E2E / 集成测试                │  ← 浏览器环境，完整 Player 启动
│   (Player, Touch, WebGL, 复杂场景)       │
├─────────────────────────────────────────┤
│          单元测试 (依赖 Mock)             │  ← jsdom/happy-dom + mock
│  (Bitmap, Texture, BitmapData, Net,     │
│   Timer, Resource, SystemTicker)        │
├─────────────────────────────────────────┤
│           纯逻辑单元测试                  │  ← 无外部依赖，直接运行
│  (geom/*, events/*, filters/*,          │
│   Base64Util, ByteArray, Logger, etc.)  │
└─────────────────────────────────────────┘
```

### 3.2 各层占比

| 层级 | 当前 | 目标 |
|---|---|---|
| 纯逻辑单元测试 | ~550 tests | 600+ |
| 依赖 Mock 的单元测试 | ~70 tests | 200+ |
| E2E/集成测试 | 0 | 50+ |

---

## 4. 实施计划

### Phase 1 — 补齐核心渲染对象 ✅ 已完成

| # | 任务 | 状态 |
|---|---|---|
| 1.1 | `Bitmap.test.ts` | ✅ 20 tests |
| 1.2 | `Texture.test.ts` | ✅ 14 tests |
| 1.3 | `BitmapData.test.ts` | ✅ 15 tests |
| 1.4 | `Mesh.test.ts` | ✅ 8 tests |
| 1.5 | `TouchEvent.test.ts` | ✅ 10 tests |
| 1.6 | `SpriteSheet.test.ts` | ✅ 10 tests |

### Phase 2 — 补齐遗漏方法 ✅ 已完成

| # | 任务 | 状态 |
|---|---|---|
| 2.1 | `DisplayObject` 遗漏方法 (+14 tests) | ✅ 完成 |
| 2.2 | `DisplayObjectContainer` 遗漏方法 (+9 tests) | ✅ 完成 |
| 2.3 | `Graphics` 遗漏方法 (+8 tests) | ✅ 完成 |
| 2.4 | `Filter` 基类 (8 tests) | ✅ 完成 |
| 2.5 | `Event` 子类 — ProgressEvent + HTTPStatusEvent (12 tests) | ✅ 完成 |
| 2.6 | `DebugLog` (8 tests) | ✅ 完成 |

### Phase 3 — 补齐工具/网络层（目标：+60 tests）

| # | 任务 | 预估 |
|---|---|---|
| 3.1 | `Timer.test.ts`（修复 SystemTicker mock） | ~12 |
| 3.2 | `HttpRequest.test.ts` | ~15 |
| 3.3 | `ImageLoader.test.ts` | ~10 |
| 3.4 | `ResourceLoader.test.ts` | ~15 |
| 3.5 | `ScreenAdapter.test.ts` | ~8 |
| 3.6 | `SystemTicker.test.ts` | ~10 |

### Phase 4 — 渲染层与 E2E（长期）

| # | 任务 |
|---|---|
| 4.1 | WebGL mock 基础设施 |
| 4.2 | `Player.test.ts` |
| 4.3 | Render Pipes 测试 |
| 4.4 | 浏览器 E2E 测试（Playwright） |

---

## 5. 测试文件清单

```
test/
├── Base64Util.test.ts          ✅
├── benchmark.test.ts           ✅
├── Bitmap.test.ts              ✅ P0
├── BitmapData.test.ts          ✅ P0
├── BlendMode.test.ts           ✅
├── ByteArray.test.ts           ✅
├── CustomFilter.test.ts        ✅
├── DebugLog.test.ts            ✅ P1
├── DisplayObject.test.ts       ✅ P1 补充后
├── DisplayObjectContainer.test.ts ✅ P1 补充后
├── DisplayObjectIntegration.test.ts ✅
├── Event.test.ts               ✅
├── EventDispatcher.test.ts     ✅
├── EventPropagation.test.ts    ✅
├── Filter.test.ts              ✅ P1
├── filters.test.ts             ✅
├── Graphics.test.ts            ✅ P1 补充后
├── HashObject.test.ts          ✅
├── HTTPStatusEvent.test.ts     ✅ P1
├── InstructionSet.test.ts      ✅
├── Logger.test.ts              ✅
├── Matrix.test.ts              ✅
├── Mesh.test.ts                ✅ P0
├── NumberUtils.test.ts         ✅
├── Point.test.ts               ✅
├── ProgressEvent.test.ts       ✅ P1
├── Rectangle.test.ts           ✅
├── Shape.test.ts               ✅
├── Sound.test.ts               ✅
├── SoundChannel.test.ts        ✅
├── Sprite.test.ts              ✅
├── SpriteSheet.test.ts         ✅ P0
├── Stage.test.ts               ✅
├── Texture.test.ts             ✅ P0
├── toColorString.test.ts       ✅
├── TouchEvent.test.ts          ✅ P0
├── Video.test.ts               ✅
│
└── (待创建) HttpRequest.test.ts / ImageLoader.test.ts / Timer.test.ts / SystemTicker.test.ts
```

---

## 6. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-05-05 | 初始版本，18 files / ~200 tests，规划 Phase 1-4 |
| 2026-05-05 | 第一轮：+9 files (DisplayObjectIntegration, EventPropagation, Shape, Sprite, Stage, HashObject, Logger, BlendMode, CustomFilter)，27 files / 479 tests |
| 2026-05-05 | P0 第二轮：+6 files (Bitmap, Texture, BitmapData, Mesh, TouchEvent, SpriteSheet)，+85 tests，33 files / 564 tests，覆盖率 ~55%/~75% |
| 2026-05-05 | P1 第三轮：+4 files (DebugLog, Filter, ProgressEvent, HTTPStatusEvent) + 3 expanded (DisplayObject, DisplayObjectContainer, Graphics)，+57 tests，37 files / 621 tests，覆盖率 ~62%/~80% |
