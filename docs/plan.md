# Heron Core 开发计划

> 更新日期：2026-04-10

---

## P1: 高优先级

### TextField WebGL 渲染优化

当前文本通过 Canvas 2D 光栅化后上传纹理，频繁更新文本时开销大。
引入文字图集缓存（参考 Egret TextAtlasRender）。

### Context Lost 恢复完善

当前已实现基础恢复（GL 状态 + shader 缓存清除），缺少：

- 纹理重上传
- InstructionSet 重建

---

## P2: 中优先级

### 顶点数据优化

当前每帧 `gl.bufferData(STREAM_DRAW)` 全量上传。
可用 `gl.bufferSubData()` 局部更新或双缓冲 VBO。

### 单元测试补充

已有：14 文件 225 用例（geom / events / utils / display / filters）。
待补充：

- net（HttpRequest / ImageLoader）
- media（Sound / Video）
- text（TextField / BitmapText）
- WebGL 渲染集成测试

---

## P3: 低优先级

### 压缩纹理支持

KTX / ASTC / ETC2 格式。

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
