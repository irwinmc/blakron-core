# Heron Core 开发计划

> 更新日期：2026-04-10
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

### TextField WebGL 渲染优化

当前文本通过 Canvas 2D 光栅化后上传纹理，频繁更新文本时开销大。
引入文字图集缓存（参考 Egret TextAtlasRender），对频繁变化的文本（如分数、计时器）效果显著。

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
