# Heron Core 开发计划

> 更新日期：2026-04-12
> 基于代码审查结果重新排列优先级

---

## P0: 必须修复（阻塞发布） ✅ 已完成

### ~~Context Lost 恢复完善~~

- ✅ 纹理重上传：`WebGLRenderContext` 通过 `_trackedBitmapDatas` 追踪所有 BitmapData，context restored 时清除 `webGLTexture` 引用，下次 `getWebGLTexture()` 自动重建。
- ✅ InstructionSet 重建：`Player` 注册 context restored 回调，调用 `markStructureDirty()` 触发全量重建（含所有 RenderGroup）。

### ~~FilterPipe blend mode 恢复~~

- ✅ `WebGLRenderContext` 新增 `currentBlendMode` 追踪当前 blend 状态。
- ✅ `FilterPipe.executePush()` 保存当前 blend mode 到 `savedBlendMode`，`executePop()` 恢复。
- ✅ `MaskPipe.executeClipPop()` 同步修复。

---

## P1: 高优先级

### ~~TextField 渲染实现（Canvas 2D + WebGL）~~ ✅ 已完成

> **当前状态**：TextPipe 已实现 WebGL 文本渲染（offscreen canvas 光栅化 → 纹理上传 → drawTexture），
> Canvas 2D 通过 `renderTextFieldToContext` 支持。

#### 整体方案

分三阶段实现，每阶段可独立交付：

##### 阶段一：Canvas 2D 渲染（基础可用） ✅ 已完成

1. **`RenderObjectType` 增加 `TEXT = 5`**
2. **`TextField.renderObjectType` 返回 `TEXT`**（override getter）
3. **`CanvasRenderer.renderSelf()` 新增 `TEXT` 分支**，调用 `renderTextField()`
4. **`renderTextField()` 实现**：
    - 绘制 `background` / `border`
    - 遍历 `getLinesArr()` 逐行逐元素绘制文字（`fillText`）
    - 处理 `textAlign`（行内偏移）、`verticalAlign`（整体垂直偏移）
    - 处理 `stroke`（`strokeText`）、`scrollV`（垂直裁剪）
    - INPUT 模式：绘制光标 / 选区高亮

##### 阶段二：WebGL 渲染（GraphicsPipe 模式） ✅ 已完成

参照 `GraphicsPipe` 的 offscreen canvas → texture → `drawTexture` 模式：

1. **新增 `TextPipe`**（`packages/core/src/heron/player/pipes/TextPipe.ts`）
    - `updateRenderable()`：检查 TextField dirty 标志
    - `execute()`：若 dirty，用 Canvas 2D 光栅化到 offscreen canvas → 上传为 WebGLTexture → `drawTexture()`
2. **`WebGLRenderer` 注册 TextPipe**，按 renderObjectType 路由到 `TextPipe`
3. **纹理尺寸优化**：只光栅化 `textWidth × textHeight` 区域，不包含 padding
4. **Dirty 检测**：`_textDirty` / `renderDirty` 变化时才重绘，静态文本不重上传

##### 阶段三：文字图集缓存（性能优化，参考 Egret TextAtlasStrategy） ⬜ 搁置

对频繁更新的短文本（分数、计时器、状态标签），使用 `Book > Page > Line > TextBlock` 模型：

> **搁置原因**：阶段二的整块光栅化方案对大多数场景已足够。图集缓存仅在大量同字体短文本高频更新时有明显收益（如聊天消息列表、排行榜），少量倒计时等场景不需要。按需启用。

1. **移植 `TextBlock / Line / Page / Book` 类**（来自 `reference/old-src/src/egret/web/rendering/webgl/TextAtlasStrategy.ts`）
2. **`TextAtlas` 管理器**：
    - 维护一张或几张 1024×1024 图集纹理
    - 每个字/词作为 `TextBlock` 打包进图集
    - 同一 font + size + color 的字/词共享同一个图集纹理区域
3. **`TextAtlasPipe`**（替代 `TextPipe`，按需启用）：
    - 不再整块光栅化 TextField，而是逐字符/词查找图集
    - 命中时直接 `drawTexture()` 图集的子区域（sub-texture）
    - 未命中时光栅化新字/词插入图集
4. **适用场景**：大量同字体文本（UI 列表、聊天消息、分数板）
5. **不适用场景**：富文本（每段样式不同）、stroke 较大的文本 → 退回阶段二整块光栅化

#### 关键参考文件

| 用途                           | 文件                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| Egret 文字图集模型             | `reference/old-src/src/egret/web/rendering/webgl/TextAtlasStrategy.ts` |
| Egret TextField WebGL 渲染     | `reference/old-src/src/egret/web/rendering/webgl/TextAtlasRender.ts`   |
| Heron TextField 数据层         | `packages/core/src/heron/text/TextField.ts`                            |
| Heron GraphicsPipe（参照模板） | `packages/core/src/heron/player/pipes/GraphicsPipe.ts`                 |
| Heron CanvasRenderer           | `packages/core/src/heron/player/CanvasRenderer.ts`                     |
| Heron WebGLRenderer            | `packages/core/src/heron/player/webgl/WebGLRenderer.ts`                |

#### 风险与注意事项

- Canvas 2D `fillText()` 的字距/换行行为与 Egret 旧实现可能有微小差异，需视觉回归测试
- WebGL 文本纹理需要 `UNPACK_PREMULTIPLY_ALPHA_WEBGL = 1`，确保半透明文字正确混合
- 图集纹理空间有限（通常 2048×2048），需要 LRU 淘汰策略防止溢出
- INPUT 模式的光标/选区在 WebGL 下需要额外处理（不能用 DOM input 覆盖）

### ~~Bounds 计算缓存~~ ✅ 已完成

- ✅ `DisplayObject` 新增 `_boundsDirty` + `_cachedBounds`，`getOriginalBounds()` 命中缓存时直接返回。
- ✅ `markDirty()` 标脏自身，`cacheDirtyUp()` 向上传播标脏父级 bounds。

### ~~FilterPipe / MaskPipe 指令对象池~~ ✅ 已完成

- ✅ `FilterPipe` 新增 `_pushPool` / `_popPool`，`makePush()` / `makePop()` 优先从池中复用。
- ✅ `MaskPipe` 同步实现。
- ✅ `WebGLRenderer._releaseInstructions()` 在 `set.reset()` 前回收指令到池中。

---

## P2: 中优先级

### 顶点数据优化

当前每帧 `gl.bufferData(STREAM_DRAW)` 全量上传。
可用 `gl.bufferSubData()` 局部更新或双缓冲 VBO。
对于大部分静态场景（只有少量对象移动），可减少 GPU 带宽占用。

### Blur shader 采样半径动态化

当前 `blur_h_frag` / `blur_v_frag` 硬编码 `for (int i = -8; i <= 8; i++)`，
当 `blurX/blurY > 8` 时模糊效果被截断。
方案：按需生成不同半径的 shader 变体（参考 Pixi.js 的做法），或使用多 pass 降采样模糊。

### Blur ping-pong FBO 复用

`_drawBlurPingPong()` 每次调用都 `createTexture` + `createFramebuffer`，结束后 `delete`。
移动端频繁创建/销毁 FBO 开销大。
方案：维护一个按尺寸分桶的 FBO 池，复用临时 FBO。

### 单元测试补充

已有：14 文件 225 用例（geom / events / utils / display / filters / player）。
待补充：

- net（HttpRequest / ImageLoader）
- media（Sound / Video）
- text（TextField / BitmapText）
- WebGL 渲染集成测试（需要 headless GL 或 mock）
- RenderPipe 各实现的单元测试
- RenderGroup 隔离行为测试

---

## P3: 低优先级

### Canvas 2D 脏区域追踪

当前 Canvas 2D 渲染器每帧全量遍历重绘。
作为 WebGL 不可用时的降级方案，性能可接受但不理想。
如果需要支持低端设备，可实现脏区域追踪减少重绘面积。

### 压缩纹理支持

KTX / ASTC / ETC2 格式。减少 GPU 显存占用和加载时间。

### WebGPU 后端

架构已预留扩展点（RenderPipe 抽象层），待 WebGPU 标准稳定后实施。

---

## 搁置项

| 项目                                | 原因                      |
| ----------------------------------- | ------------------------- |
| KTXContainer（压缩纹理加载器）      | 待 WebGL 层完善           |
| Geolocation/Motion/Orientation 事件 | 传感器 API，待评估需求    |
| web/ 平台适配层                     | 用 packages/runtime/ 替代 |
| 3d/ (EgretPro)                      | 独立处理                  |
| registerClass / getDefinitionByName | 反射机制，不需要          |
