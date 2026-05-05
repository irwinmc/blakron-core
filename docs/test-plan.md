# Blakron Core 测试规划

> 最后更新：2025-07-17
> 当前状态：27 test files, 479 tests, all passing

---

## 1. 现状概述

### 1.1 测试统计

| 指标 | 数值 |
|---|---|
| 测试文件数 | 27 |
| 测试用例数 | 479 |
| 源文件总数（含类型/枚举/索引） | ~120 |
| 有实际逻辑的源文件 | ~60 |
| 测试覆盖率（按文件） | ~45% |
| 测试覆盖率（按核心逻辑） | ~65% |

### 1.2 已有测试按模块分布

| 模块 | 测试文件 | 覆盖内容 |
|---|---|---|
| `geom/` | `Point.test.ts`, `Rectangle.test.ts`, `Matrix.test.ts` | 所有公开方法、边界条件、对象池、chaining |
| `events/` | `Event.test.ts`, `EventDispatcher.test.ts`, `EventPropagation.test.ts` | 事件创建/池化、监听器管理、capture→bubble传播链 |
| `display/` | `DisplayObject.test.ts`, `DisplayObjectContainer.test.ts`, `DisplayObjectIntegration.test.ts`, `Shape.test.ts`, `Sprite.test.ts`, `Stage.test.ts`, `Graphics.test.ts`, `BlendMode.test.ts` | 基础属性、容器管理、空间变换、图形绘制 |
| `filters/` | `filters.test.ts`, `CustomFilter.test.ts` | 五种滤镜的基本参数 |
| `utils/` | `Base64Util.test.ts`, `ByteArray.test.ts`, `NumberUtils.test.ts`, `toColorString.test.ts`, `HashObject.test.ts`, `Logger.test.ts` | 工具函数全覆盖 |
| `media/` | `Sound.test.ts`, `SoundChannel.test.ts`, `Video.test.ts` | 音频加载/播放、视频基本操作 |
| `player/` | `InstructionSet.test.ts` | 指令集增删改 |
| `benchmark/` | `benchmark.test.ts` | 性能测试基础设施 |

---

## 2. 测试缺口分析

### 2.1 🔴 P0 — 核心渲染对象（极高优先级）

这些是引擎的核心渲染类，当前**完全无测试**。

| 文件 | 代码行数 | 关键待测行为 |
|---|---|---|
| **`display/Bitmap.ts`** | ~200 | texture 绑定/解绑、fillMode 切换、scale9Grid、pixelHitTest、smoothing、explicitWidth/Height override、`measureContentBounds`、`onAddToStage`/`onRemoveFromStage` 的 BitmapData 引用计数联动 |
| **`display/texture/Texture.ts`** | ~90 | `initData` 参数计算（含 textureScaleFactor）、`setBitmapData`、`dispose`、`scaleBitmapWidth/Height` |
| **`display/texture/BitmapData.ts`** | ~170 | 静态方法 `addDisplayObject`/`removeDisplayObject`/`invalidate`/`dispose` 的引用计数逻辑、`create()` 工厂方法、压缩纹理管理、`dispose` 清理 |
| **`display/Mesh.ts`** | ~70 | vertices/indices/uvs 管理、`updateVertices`、`measureContentBounds` 的边界计算、空顶点数组处理 |

### 2.2 🔴 P0 — 核心渲染对象 DisplayObject 遗漏方法

`DisplayObject.test.ts` 和 `DisplayObjectIntegration.test.ts` 已覆盖大部分，但以下关键方法仍缺：

| 方法 | 说明 |
|---|---|
| `cacheAsBitmap` / `setHasDisplayList` | DisplayList 创建/释放、cacheDirty 标记 |
| `setMatrix()` with `needUpdateProperties` | 从 Matrix 反向推导 scaleX/Y、rotation、skew |
| `sortChildren()` | zIndex 排序、sortableChildren |
| `ENTER_FRAME` / `RENDER` 回调列表 | addEventListener/removeEventListener 对静态列表的副作用 |
| `markDirty()` 级联传播 | cacheDirtyUp、renderDirtyUp、maskedObject 传播 |
| `getConcatenatedMatrixAt()` | scrollRect 链式矩阵计算 |
| `tint` 边界值 | 0xffffff 超范围值、负值、NaN |

### 2.3 🔴 P0 — DisplayObjectContainer 遗漏方法

| 方法 | 说明 |
|---|---|
| `addChildAt()` / `removeChildAt()` | 越界 index 处理 |
| `setChildIndex()` | 越界 clamp 行为 |
| `swapChildren()` / `swapChildrenAt()` | 无效 child、相同 index |
| `sortChildren()` | zIndex 排序正确性 |
| `hitTest()` | 容器级命中检测 — 子节点逆序遍历、touchChildren=false、mask 拦截 |
| `measureChildBounds()` | 多子节点包围盒合并计算 |

### 2.4 🔴 P0 — 输入事件系统

| 文件 | 说明 |
|---|---|
| **`events/TouchEvent.ts`** | `localX`/`localY` 的惰性计算（`computeLocalXY`）、`setDispatchContext` 标记 `_targetChanged`、`initTo` 重置、`updateAfterEvent` |

### 2.5 🟡 P1 — 中等优先级

| 文件 | 说明 |
|---|---|
| **`display/texture/RenderTexture.ts`** | `drawToTexture`（需 mock renderer）、`getPixel32` |
| **`display/texture/SpriteSheet.ts`** | `createTexture` 坐标偏移计算、`getTexture`、`dispose` |
| **`display/Graphics.ts`** | 遗漏：`beginGradientFill`、`drawArc` anticlockwise、`lineStyle` cap/joint/miterLimit/lineDash 参数、`hitTest` |
| **`utils/Timer.ts`** | Timer 已写但依赖 SystemTicker mock（需完善 mock 策略） |
| **`utils/DebugLog.ts`** | enable/active/tickFrame 帧计数自停逻辑 |
| **`events/ProgressEvent.ts`** | `dispatchProgressEvent` 静态方法 |
| **`events/HTTPStatusEvent.ts`** | `dispatchHTTPStatusEvent` 静态方法 |
| **`net/HttpRequest.ts`** | XHR 加载流程（需 mock XMLHttpRequest） |
| **`net/ImageLoader.ts`** | 图片加载为 BitmapData 的流程 |
| **`filters/Filter.ts`** | 基类 `getPadding()`、`toJson()`、`onPropertyChange` |
| **`player/SystemTicker.ts`** | 帧循环注册/注销、帧率控制 |
| **`player/ScreenAdapter.ts`** | 屏幕适配计算逻辑 |
| **`resource/*`** | ResourceLoader、ResourceConfig、ResourceItem 资源加载管线 |

### 2.6 🟢 P2 — 低优先级（简单常量/枚举/接口）

以下文件主要是类型定义、常量枚举或纯接口，手动测试价值较低（类型系统即可保证）：

`CapsStyle.ts`, `GradientType.ts`, `JointStyle.ts`, `BitmapFillMode.ts`, `OrientationMode.ts`, `StageScaleMode.ts`, `HttpMethod.ts`, `HttpResponseType.ts`, `EventPhase.ts`, `IEventDispatcher.ts`, `FocusEvent.ts`, `StageOrientationEvent.ts`, `TextEvent.ts`, `ITextElement.ts`, `HorizontalAlign.ts`, `VerticalAlign.ts`, `TextFieldInputType.ts`, `TextFieldType.ts`, `BlakronOptions.ts`, `Capabilities.ts`, `ExternalInterface.ts`, `localStorage.ts`

### 2.7 ⬜ P3 — 需要完整运行时环境

这些模块深度依赖 WebGL Context、Canvas、DOM 或完整的 Player 初始化，单元测试成本极高，更适合集成/E2E 测试：

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

### 3.2 各层占比目标

| 层级 | 当前 | 目标 |
|---|---|---|
| 纯逻辑单元测试 | ~400 tests | 500+ |
| 依赖 Mock 的单元测试 | ~50 tests | 200+ |
| E2E/集成测试 | 0 | 50+ |

### 3.3 Mock 策略

| 被 Mock 对象 | Mock 方式 |
|---|---|
| `AudioContext` | 替换 `window.AudioContext` 构造函数（已有） |
| `XMLHttpRequest` | 替换 `window.XMLHttpRequest` 构造函数（已有） |
| `HTMLVideoElement` | `document.createElement` spy（已有） |
| `HTMLCanvasElement` / `CanvasRenderingContext2D` | `happy-dom` 内置 / 手动 mock |
| `WebGLRenderingContext` | 需创建 mock WebGL context（较大工作量） |
| `SystemTicker` | `vi.mock('../src/blakron/player/SystemTicker.js')` |
| `Image` / `ImageData` | `happy-dom` 内置 |
| `FontFace` / `document.fonts` | 需 mock |

---

## 4. 实施计划

### Phase 1 — 补齐核心逻辑（目标：+100 tests）

| # | 任务 | 新增测试 | 预估工作量 |
|---|---|---|---|
| 1.1 | `Bitmap.test.ts` | ~25 | 2h |
| 1.2 | `Texture.test.ts` | ~15 | 1h |
| 1.3 | `BitmapData.test.ts` | ~20 | 1.5h |
| 1.4 | `Mesh.test.ts` | ~10 | 0.5h |
| 1.5 | `TouchEvent.test.ts` | ~12 | 1h |
| 1.6 | `SpriteSheet.test.ts` | ~10 | 0.5h |
| 1.7 | `RenderTexture.test.ts` | ~8 | 0.5h |

### Phase 2 — 补齐遗漏方法（目标：+80 tests）

| # | 任务 | 新增测试 | 预估工作量 |
|---|---|---|---|
| 2.1 | `DisplayObject` 遗漏方法补充 | ~25 | 1.5h |
| 2.2 | `DisplayObjectContainer` 遗漏方法补充 | ~20 | 1h |
| 2.3 | `Graphics` 遗漏方法补充 | ~15 | 1h |
| 2.4 | `Filter` 基类测试 | ~8 | 0.5h |
| 2.5 | `Event` 子类补充（ProgressEvent等） | ~12 | 0.5h |

### Phase 3 — 补齐工具/网络层（目标：+60 tests）

| # | 任务 | 新增测试 | 预估工作量 |
|---|---|---|---|
| 3.1 | `Timer.test.ts`（修复 mock） | ~12 | 1h |
| 3.2 | `DebugLog.test.ts` | ~6 | 0.5h |
| 3.3 | `HttpRequest.test.ts` | ~15 | 1.5h |
| 3.4 | `ImageLoader.test.ts` | ~10 | 1h |
| 3.5 | `ResourceLoader.test.ts` | ~15 | 1.5h |
| 3.6 | `ScreenAdapter.test.ts` | ~8 | 1h |
| 3.7 | `SystemTicker.test.ts` | ~10 | 1h |

### Phase 4 — 渲染层与 E2E（长期）

| # | 任务 | 说明 |
|---|---|---|
| 4.1 | WebGL mock 基础设施 | 创建可复用的 WebGL mock |
| 4.2 | `Player.test.ts` | 完整启动流程 |
| 4.3 | `WebGLRenderer.test.ts` | 渲染管线 |
| 4.4 | Render Pipes 测试 | BitmapPipe, MeshPipe, FilterPipe 等 |
| 4.5 | 浏览器 E2E 测试框架 | Playwright + 真实浏览器渲染验证 |

---

## 5. 测试编写规范

### 5.1 命名约定

```
describe('ClassName', () => {
  it('methodName — expected behavior description', () => { ... });
  // 或按功能分组：
  describe('method group', () => {
    it('should do X when Y', () => { ... });
  });
});
```

### 5.2 每个类必须覆盖的测试维度

1. ✅ **构造 & 默认值** — constructor 各参数和默认值
2. ✅ **getter/setter** — 包括同值 no-op、越界 clamp、链式返回
3. ✅ **核心方法正常路径** — 典型输入的正确行为
4. ✅ **边界条件** — null/undefined、空值、零值、负值、极值
5. ✅ **错误路径** — 非法输入、异常状态、抛异常
6. ✅ **对象池生命周期** — create/release/reuse（如适用）
7. ✅ **静态方法** — 工具函数
8. ✅ **事件派发** — 正确的事件类型和时序（如适用）

### 5.3 文件组织

- 每个源文件对应一个 `test/Xxx.test.ts`
- 密切相关的类可以合并（如 `filters.test.ts` 已包含四种滤镜）
- 集成测试单独命名（如 `DisplayObjectIntegration.test.ts`、`EventPropagation.test.ts`）

---

## 6. 当前测试文件清单

```
test/
├── Base64Util.test.ts          ✅ 充分
├── benchmark.test.ts           ✅ 充分
├── BlendMode.test.ts           ✅ 充分
├── ByteArray.test.ts           ✅ 充分
├── CustomFilter.test.ts        ✅ 充分
├── DisplayObject.test.ts       ⚠️ 缺部分方法
├── DisplayObjectContainer.test.ts ⚠️ 缺部分方法
├── DisplayObjectIntegration.test.ts ✅ 充分
├── Event.test.ts               ✅ 充分
├── EventDispatcher.test.ts     ✅ 充分
├── EventPropagation.test.ts    ✅ 充分
├── filters.test.ts             ✅ 充分
├── Graphics.test.ts            ⚠️ 缺部分方法
├── HashObject.test.ts          ✅ 充分
├── InstructionSet.test.ts      ✅ 充分
├── Logger.test.ts              ✅ 充分
├── Matrix.test.ts              ✅ 充分
├── NumberUtils.test.ts         ✅ 充分
├── Point.test.ts               ✅ 充分
├── Rectangle.test.ts           ✅ 充分
├── Shape.test.ts               ✅ 基础
├── Sound.test.ts               ✅ 充分
├── SoundChannel.test.ts        ✅ 充分
├── Sprite.test.ts              ✅ 基础
├── Stage.test.ts               ✅ 基础
├── toColorString.test.ts       ✅ 充分
├── Video.test.ts               ✅ 充分
│
├── (待创建) Bitmap.test.ts
├── (待创建) BitmapData.test.ts
├── (待创建) DebugLog.test.ts
├── (待创建) HttpRequest.test.ts
├── (待创建) ImageLoader.test.ts
├── (待创建) Mesh.test.ts
├── (待创建) RenderTexture.test.ts
├── (待创建) SpriteSheet.test.ts
├── (待创建) SystemTicker.test.ts
├── (待创建) Texture.test.ts
├── (待创建) Timer.test.ts
└── (待创建) TouchEvent.test.ts
```

---

## 7. 变更记录

| 日期 | 变更 |
|---|---|
| 2025-07-17 | 初始版本，记录当前 27 files / 479 tests 状态，规划 Phase 1-4 |
