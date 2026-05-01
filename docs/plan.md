# Blakron Core 开发计划

> 更新日期：2026-05-01
> 基于老框架（reference/old-src）全量对比 + 当前代码审查

---

## 当前状态速览

| 层级        | 内容                                     | 状态        |
| ----------- | ---------------------------------------- | ----------- |
| P0 阻塞项   | Context Lost、FilterPipe blend mode      | ✅ 全部完成 |
| P1 高优先级 | TextField WebGL、Bounds 缓存、指令对象池 | ✅ 全部完成 |
| P2 渲染性能 | Blur FBO 复用、Blur shader 动态化        | ✅ 全部完成 |
| P2 渲染性能 | 顶点数据优化（bufferSubData）            | ✅ 完成     |
| P2 核心缺失 | Capabilities                             | ✅ 完成     |
| P2 测试     | net / text 单元测试                      | ⬜ 待实现   |
| P3          | Canvas 脏区域、压缩纹理、WebGPU          | ⬜ 低优先级 |
| 扩展模块    | tween、game、assetsmanager、eui          | ⬜ 后续分包 |

---

## P0：必须修复（阻塞发布）✅ 全部完成

### ~~Context Lost 恢复完善~~ ✅

- ✅ `WebGLRenderContext` 通过 `_trackedBitmapDatas` 追踪所有 BitmapData，context restored 时清除 `webGLTexture` 引用，下次 `getWebGLTexture()` 自动重建。
- ✅ `Player` 注册 context restored 回调，调用 `markStructureDirty()` 触发全量重建（含所有 RenderGroup）。

### ~~FilterPipe blend mode 恢复~~ ✅

- ✅ `WebGLRenderContext` 新增 `currentBlendMode` 追踪当前 blend 状态。
- ✅ `FilterPipe.executePush()` 保存当前 blend mode 到 `savedBlendMode`，`executePop()` 恢复。
- ✅ `MaskPipe.executeClipPop()` 同步修复。

---

## P1：高优先级 ✅ 全部完成

### ~~TextField 渲染（Canvas 2D + WebGL）~~ ✅

TextPipe 已实现 WebGL 文本渲染（offscreen canvas 光栅化 → 纹理上传 → drawTexture），Canvas 2D 通过 `renderTextFieldToContext` 支持。

### ~~Bounds 计算缓存~~ ✅

`DisplayObject` 新增 `_boundsDirty` + `_cachedBounds`，`getOriginalBounds()` 命中缓存时直接返回。

### ~~FilterPipe / MaskPipe 指令对象池~~ ✅

`FilterPipe` / `MaskPipe` 新增 push/pop 对象池，`WebGLRenderer._releaseInstructions()` 在 `set.reset()` 前回收。

---

## P2：中优先级（渲染性能）

### ~~顶点数据优化（bufferSubData）~~ ✅ 已完成

**老问题**：`_flush()` 每帧 `gl.bufferData(STREAM_DRAW)` 全量上传顶点数据，每次调用都触发 GPU 内存重分配。

**实现**（方案 A）：

- 构造函数里用 `gl.bufferData(DYNAMIC_DRAW)` 预分配固定大小的 GPU vertex buffer（单纹理最大容量 `MAX_VERTS * 20B`）
- `_flush()` 改为 `gl.bufferSubData(0, usedBytes)`，只上传实际写入的字节范围，GPU buffer 大小不变
- 首次出现 multi-texture batch 时自动扩容到 `MAX_VERTS * 24B`，之后不再重分配
- context lost 恢复时在 `_onContextRestored()` 重新预分配
- `WebGLVertexArrayObject` 新增 `getVerticesByteLength()` / `getVerticesBuffer()` / `MAX_VERTEX_BYTES` / `MAX_MULTI_VERTEX_BYTES`

---

### Blur shader 采样半径动态化

✅ **已完成**

**老问题**：`blur_h_frag` / `blur_v_frag` 硬编码 `for (int i = -8; i <= 8; i++)`，`blurX/blurY > 8` 时模糊效果被截断。

**实现**：`ShaderLib.ts` 新增 `BLUR_TIERS = [4, 8, 16, 32]`、`getBlurTier(radius)` 和 `makeBlurHFrag(tier)` / `makeBlurVFrag(tier)` 函数，按 tier 生成 GLSL 循环上界为编译期常量的 shader 变体。`WebGLProgram` 按 key（`blur_h_4` / `blur_h_8` / `blur_h_16` / `blur_h_32`）缓存编译结果，同一 tier 只编译一次。`_drawBlurPingPong()` 根据 `filter.blurX` / `filter.blurY` 调用 `getBlurTier()` 选择对应档位，支持最大 32px 模糊半径。

---

### Blur ping-pong FBO 复用

✅ **已完成**

**老问题**：`_drawBlurPingPong()` 每次调用都 `createTexture` + `createFramebuffer`，结束后 `delete`。移动端频繁创建/销毁 FBO 开销大。

**实现**：`WebGLRenderContext` 新增 `_blurFboPool: Map<string, Array<{texture, fbo}>>` 按 `${w}x${h}` 分桶。`_drawBlurPingPong()` 优先从池中取，用完归还；context lost 时 `_onContextRestored()` 调用 `_blurFboPool.clear()` 清空失效句柄。

---

### 单元测试补充

**现状**：18 文件 310 用例（geom / events / utils / display / filters / player / media / benchmark）。

**待补充**：

- `net/`：HttpRequest（mock fetch）、ImageLoader（mock Image）
- `text/`：TextField 数据层（换行、scrollV、度量）、BitmapText
- WebGL 渲染集成测试（需要 headless GL 或 mock WebGL context）
- RenderPipe 各实现（BitmapPipe / GraphicsPipe / TextPipe / MeshPipe）
- RenderGroup 隔离行为（structureDirty 不跨 group 传播）

---

## P2：中优先级（核心缺失补全）

### ~~`system/Capabilities` — 系统能力检测~~ ✅ 已完成

新增 `packages/core/src/blakron/system/Capabilities.ts`：

- `_init()` 在 `createPlayer` 启动时调用，通过 `navigator.userAgent` 检测 `os / isMobile / language`
- `boundingClientWidth/Height` 由 `ScreenAdapter.updateScreenSize()` 在每次 resize 时同步
- `renderMode` 由 `Player` 初始化后写入（`"webgl"` 或 `"canvas"`）
- 通过 `src/index.ts` 导出，游戏代码直接 `import { Capabilities } from '@blakron/core'`

---

### `utils/XML` — XML 解析器

**现状**：老框架 `egret.XML.parse()` 将字符串解析为 XML 节点树，主要供 EXML 解析和资源配置文件解析使用。核心引擎不依赖此模块。

**方案**：使用浏览器原生 `DOMParser` 简化实现，不需要完整移植。随 `@blakron/exml-parser` 扩展包一起实现。

**参考**：`reference/old-src/src/egret/utils/XML.ts`、`reference/old-src/src/egret/web/WebXML.ts`

---

## P3：低优先级（渲染后端扩展）

### Canvas 2D 脏区域追踪

当前 Canvas 2D 渲染器每帧全量遍历重绘。作为 WebGL 不可用时的降级方案，性能可接受但不理想。如果需要支持低端设备，可实现脏区域追踪减少重绘面积。

### 压缩纹理支持

KTX / ASTC / ETC2 格式。减少 GPU 显存占用和加载时间。老框架有 `KTXContainer` 和 `SupportedCompressedTexture` 检测，可参考。

### WebGPU 后端

架构已预留扩展点（RenderPipe 抽象层），待 WebGPU 标准稳定后实施。

---

## 扩展模块（独立分包，后续实现）

> 以下模块均来自老框架 `reference/old-src/src/extension/`，规模较大，需独立 package。

### `@blakron/tween` — 补间动画

**老框架规模**：`Tween.ts`（~500 行）+ `Ease.ts`（~300 行）+ `TweenWrapper.ts`

**核心 API**：`Tween.get(target).to(props, duration, ease).call(fn).wait(ms)`

**依赖**：`SystemTicker.startTick`（已有）、`EventDispatcher`（已有）

**工作量估算**：中（~2天），逻辑独立，无渲染依赖。

---

### `@blakron/game` — 游戏扩展

**老框架规模**：

- `display/MovieClip.ts`（~600 行）+ `MovieClipData.ts` + `MovieClipDataFactory.ts` + `FrameLabel.ts` + `MovieClipEvent.ts`
- `display/ScrollView.ts`（~1000 行）+ `ScrollViewProperties.ts` + `ScrollTween.ts`
- `net/URLLoader.ts` + `URLRequest.ts` + `URLRequestHeader.ts` + `URLRequestMethod.ts` + `URLVariables.ts` + `URLLoaderDataFormat.ts`
- `player/Ticker.ts`（已废弃，`SystemTicker` 替代）
- `utils/setInterval.ts` + `setTimeout.ts` + `Recycler.ts`

**核心 API**：

- `MovieClip`：序列帧动画，`play/stop/gotoAndPlay/gotoAndStop`
- `ScrollView`：惯性滚动容器，支持回弹
- `URLLoader`：高层资源加载（对 HttpRequest 的封装）

**依赖**：`Bitmap`、`Texture`、`TouchEvent`、`Timer`（均已有）

**工作量估算**：大（~5天），ScrollView 惯性物理逻辑复杂。

---

### `@blakron/assetsmanager` — 资源管理器

**老框架规模**：

- `core/ResourceManager.ts` + `ResourceLoader.ts` + `ResourceConfig.ts` + `FileSystem.ts` + `Path.ts`
- `processor/Processor.ts`（各类型资源处理器）
- `shim/Resource.ts` + `ResourceEvent.ts` + `ResourceItem.ts`（兼容旧 API）

**核心 API**：`RES.loadConfig()` → `RES.getRes()` / `RES.getResAsync()`，支持分组加载、进度回调。

**依赖**：`HttpRequest`、`ImageLoader`、`Sound`（均已有）

**工作量估算**：大（~5天），配置解析 + 分组调度逻辑复杂。

---

### `@blakron/eui` — UI 组件框架

**老框架规模**：~60 文件，包含：

- `components/`：Button、Label、Image、List、Scroller、Panel、ProgressBar、Slider、CheckBox、RadioButton、TabBar、TextInput、ViewStack 等 ~25 个组件
- `layouts/`：BasicLayout、HorizontalLayout、VerticalLayout、TileLayout
- `binding/`：Binding、Watcher（数据绑定）
- `collections/`：ArrayCollection、ICollection
- `states/`：State、AddItems、SetProperty（皮肤状态机）
- `core/`：UIComponent、Validator、Theme、IViewport 等
- `exml/`：EXMLParser、EXMLConfig、CodeFactory（依赖 `@blakron/exml-parser`）

**依赖**：`@blakron/core`（全量）+ `@blakron/exml-parser`（皮肤解析）

**工作量估算**：极大（~20天），是所有扩展中最复杂的，建议最后实现。

---

## 搁置项

| 项目                                        | 原因                                                |
| ------------------------------------------- | --------------------------------------------------- |
| KTXContainer（压缩纹理加载器）              | 待 WebGL 层完善后实现                               |
| Geolocation/Motion/Orientation 事件         | 传感器 API，不做                                    |
| web/ 平台适配层                             | 已由 player/ 替代                                   |
| 3d/ (EgretPro)                              | 独立处理                                            |
| registerClass / getDefinitionByName         | 反射机制，不需要                                    |
| TextAtlas 图集缓存（TextPipe 阶段三）       | 整块光栅化已足够，按需启用                          |
| FPSDisplay（老框架 player/FPSDisplay）      | `Player.perf` 已提供 fps/drawCalls，无需 DOM 覆盖层 |
| i18n 模块（老框架 egret/i18n/）             | 不做国际化框架                                      |
| `egret.assert/warn/error/log`（Console.ts） | 直接用 `console.*`，无需封装                        |

---

## 老框架对比总结

| 老框架模块                     | Blakron 状态          | 说明                                              |
| ------------------------------ | --------------------- | ------------------------------------------------- |
| `egret/display/`               | ✅ 完成               | 全量实现，API 兼容                                |
| `egret/events/`                | ✅ 完成               | 12 个事件类，移除 Geolocation/Motion/Orientation  |
| `egret/geom/`                  | ✅ 完成               | Matrix/Point/Rectangle + 对象池                   |
| `egret/filters/`               | ✅ 完成               | 新增 CustomFilter                                 |
| `egret/net/`                   | ✅ 完成               | HttpRequest/ImageLoader                           |
| `egret/media/`                 | ✅ 完成               | Sound/SoundChannel/Video                          |
| `egret/text/`                  | ✅ 完成               | 含 TextPipe WebGL 渲染                            |
| `egret/utils/`                 | ✅ 完成（部分不需要） | 移除反射类，新增 FontManager/DebugLog             |
| `egret/localStorage/`          | ✅ 完成               |                                                   |
| `egret/external/`              | ✅ 完成               |                                                   |
| `egret/player/` + `egret/web/` | ✅ 完成（已重构）     | InstructionSet 替代 RenderNode                    |
| `egret/system/Capabilities`    | ✅ 完成               | Web 简化实现，`createPlayer` 初始化时检测         |
| `egret/utils/XML`              | ⬜ 缺失               | 随 exml-parser 实现                               |
| `egret/player/FPSDisplay`      | 🚫 不做               | Player.perf 替代                                  |
| `egret/i18n/`                  | 🚫 不做               | 不做国际化框架                                    |
| `egret/sensor/`                | 🚫 不做               | 传感器 API                                        |
| `egret/3d/`                    | 🚫 独立处理           |                                                   |
| `extension/tween/`             | ⬜ 后续分包           | `@blakron/tween`                                  |
| `extension/game/`              | ⬜ 后续分包           | `@blakron/game`（MovieClip/ScrollView/URLLoader） |
| `extension/assetsmanager/`     | ⬜ 后续分包           | `@blakron/assetsmanager`                          |
| `extension/eui/`               | ⬜ 后续分包           | `@blakron/eui`（最复杂，最后实现）                |
| `extension/socket/`            | 🚫 不做               | 直接用浏览器原生 WebSocket                        |
| `extension/resource/`          | ⬜ 后续               | 由 assetsmanager 替代                             |
