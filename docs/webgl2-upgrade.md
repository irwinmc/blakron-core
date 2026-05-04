# Blakron WebGL2 特性升级计划

> 状态：规划中 | 当前版本 0.5.2 已支持 WebGL2 Context，但未利用独占特性

---

## 一、现状分析

Blakron 已优先获取 WebGL2 Context（`webgl2` → `webgl` 降级），但两套 ShaderLib 逻辑完全一致，仅 GLSL 语法版本不同（ES 1.00 vs ES 3.00）。WebGL2 的 GPU 硬件特性均未使用。

**当前瓶颈**：

| 瓶颈 | 现状 | 影响 |
|------|------|------|
| Uniform 上传 | 每 draw call 逐个 `gl.uniform*()` | CPU 端 N 次 JS→GPU 调用 |
| Draw call 数量 | 无 instancing，每 4 顶点一个 draw | 大量同类图元时 GPU 利用率低 |
| 纹理槽位 | 硬限制 8 个，if/else 链采样 | 纹理切换频繁，批量上限低 |
| 粒子/动画 | CPU 端逐帧计算 transform | 大量粒子时 JS 成为瓶颈 |

---

## 二、特性优先级与收益评估

```
影响面：🟢 小（1-3 文件） 🟡 中（3-6 文件） 🔴 大（6+ 文件）
收益：  ⭐ 锦上添花  ⭐⭐ 显著提升  ⭐⭐⭐ 质变
```

| 优先级 | 特性 | 影响面 | 收益 | 说明 |
|--------|------|--------|------|------|
| **P0** | UBO 统一 Uniform 上传 | 🟡 | ⭐⭐⭐ | 所有 draw call 受益，改动收敛在 RenderContext |
| **P1** | Instanced Rendering | 🟡 | ⭐⭐ | 粒子、批量 Sprite、BitmapText 场景收益大 |
| **P2** | Texture Array | 🔴 | ⭐⭐ | 突破 8 纹理槽位，须改 Batcher + shader + 纹理管理 |
| **P3** | Transform Feedback | 🟢 | ⭐⭐ | GPU 粒子，特定场景（粒子特效）收益 |
| **P4** | Sampler Object | 🟢 | ⭐ | 锦上添花，减少纹理参数切换 |
| **P5** | MRT | 🔴 | ⭐ | 滤镜链优化，改动大收益相对小 |

---

## 三、P0：UBO 统一 Uniform 上传

### 3.1 目标

将 per-draw 的 `projectionVector`、`uTextureSize` 等全局 uniform 从逐个 `gl.uniform*()` 调用改为 **绑定一次 UBO**，所有 shader 共享。

### 3.2 当前问题

每次 draw call 都要走一遍：

```
gl.useProgram(program)
gl.uniform2f(projectionVector, ...)   // 每 draw
gl.uniform2f(uTextureSize, ...)       // 每 draw
gl.uniform1i(uSampler, 0)             // 每 draw
```

100 个 Sprite = 300+ 次 JS→GPU 调用。

### 3.3 方案

```
┌─────────────────────────────────────────┐
│  FrameUBO (per-frame, binding 0)        │
│  mat4 projectionMatrix;                 │
│  vec2 uTextureSize;                     │
│  float time;          // 可用于 shader 动画 │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  DrawUBO (per-material, binding 1)      │
│  vec4 tintColor;                        │
│  float alpha;                           │
└─────────────────────────────────────────┘
```

**实施步骤**：

1. **`ShaderLib2.ts`**：所有 shader 添加 `layout(std140, binding = 0) uniform FrameUniforms { ... }`
2. **`WebGLRenderContext.ts`**：初始化时创建 FrameUBO + DrawUBO，每帧开始时 `gl.bindBufferBase(UNIFORM_BUFFER, 0, frameUbo)` + `gl.bufferSubData` 更新
3. **`WebGLProgram.ts`**：`linkProgram` 后 `gl.uniformBlockBinding` 绑定 UBO index
4. **降级策略**：WebGL1 路径保持不变（`ShaderLib.ts` 不动）

**影响范围**：
- `shaders/ShaderLib2.ts` — 所有 fragment/vertex shader 语法升级
- `WebGLRenderContext.ts` — UBO 创建/更新/绑定
- `WebGLProgram.ts` — uniform block binding

**预期收益**：CPU 端 uniform 开销降低 60-80%，对 draw call 密集场景（UI 列表、粒子）提升明显。

---

## 四、P1：Instanced Rendering

### 4.1 目标

对于 **同纹理、同 shader、同 blend mode** 的连续图元，用一次 `gl.drawElementsInstanced` 替代多次 `gl.drawElements`。

### 4.2 适用场景

| 场景 | 实例化收益 |
|------|-----------|
| BitmapText 字符渲染 | 每个字符是一个实例，一屏可上百 |
| 粒子系统 | 数百个同纹理粒子 |
| 批量 Sprite（同一 sprite sheet） | 地图 tile、图标列表 |
| UI List itemRenderer | 同纹理的同构 item |

### 4.3 方案

在顶点属性中增加 **per-instance** 数据（transform matrix + tint + alpha）：

```
顶点布局（20 bytes/vertex，不变）：
  aVertexPosition: vec2  (per-vertex)
  aTextureCoord:   vec2  (per-vertex)
  aColor:          vec4  (per-vertex)

实例布局（32 bytes/instance，新增）：
  aModelMatCol0:   vec4  (per-instance, divisor=1)
  aModelMatCol1:   vec4  (per-instance, divisor=1)
  aTintAndAlpha:   vec4  (per-instance, divisor=1)
```

**实施步骤**：

1. **`WebGLVertexArrayObject.ts`**：新增 per-instance buffer 管理，支持 `gl.vertexAttribDivisor`
2. **`WebGLDrawCmdManager.ts`**：新增 `InstancedDrawCmd` 类型，记录实例数
3. **`WebGLRenderContext.ts`**：
   - 新增 `drawElementsInstanced` 分发路径
   - Batcher flush 时合并同纹理的连续指令为 instanced draw
4. **`MultiTextureBatcher.ts`**：扩展支持 instanced 合并
5. **ShaderLib2.ts**：vertex shader 接受 instance 属性

**降级**：`isWebGL2 === false` 时，instance 属性退化为 per-vertex，仍然走多次 draw。

**预期收益**：粒子场景 draw call 从 N 降到 1，BitmapText 从每字符 1 draw 降到每行 1 draw。

---

## 五、P2：Texture Array 突破 8 纹理槽

### 5.1 目标

用 `sampler2DArray` 替代 `sampler2D[8]` + if/else 链，突破 8 纹理限制，支持更多纹理同批。

### 5.2 当前问题

```glsl
// WebGL1: if/else 链，最多 8 个槽位
uniform sampler2D uSamplers[8];
if (id == 0) color = texture2D(uSamplers[0], uv);
else if (id == 1) ...
```

- 8 纹理硬限制
- if/else 链在 GPU 上有分支开销
- 每增加槽位需改 shader

### 5.3 方案

改用 `sampler2DArray`（WebGL2 核心特性）：

```glsl
#version 300 es
uniform sampler2DArray uTextureArray;
in float vTextureId;  // 纹理层索引（0–N）

void main() {
    vec4 color = texture(uTextureArray, vec3(vTextureCoord, vTextureId));
    fragColor = color * vColor;
}
```

**实施步骤**：

1. **纹理上传改造**：创建 `gl.TEXTURE_2D_ARRAY`，用 `gl.texSubImage3D` 逐层上传
2. **`BitmapData.ts`**：新增 `_arrayLayer` 字段，纹理加入 array 时分配 layer index
3. **`MultiTextureBatcher.ts`**：槽位管理改为 layer index 分配（不再是 texture object 映射）
4. **`WebGLRenderContext.ts`**：draw 时绑定 `TEXTURE_2D_ARRAY` 而非逐个 `TEXTURE0..7`
5. **`ShaderLib2.ts`**：`multi_frag` 替换为 array 版本

**难点**：
- `TEXTURE_2D_ARRAY` 所有层必须同尺寸。需要纹理尺寸归一化策略（padding 到最大尺寸，或分组管理多个 array）
- 纹理动态更新（video、renderTexture）需要 `texSubImage3D`，路径不同

**降级**：WebGL1 保持现有 8 槽位 if/else 路径。

**预期收益**：纹理槽位从 8 → 硬件上限（通常 256+），纹理切换导致的 batch break 基本消除。

---

## 六、P3：Transform Feedback — GPU 粒子

### 6.1 目标

粒子 position/velocity/life 计算在 GPU 端完成，CPU 只负责 emit/回收。

### 6.2 方案

```
Frame N:                          Frame N+1:
┌──────────────┐                 ┌──────────────┐
│ ParticleBO   │──(transform)──→│ ParticleBO   │
│ (positions)  │   feedback      │ (updated)    │
└──────────────┘                 └──────────────┘
                                        │
                                        ▼
                                 gl.drawArrays(POINTS)
                                        │
                                        ▼
                                 渲染到屏幕
```

**实施步骤**：

1. **`ParticleSystem.ts`**（新增）：管理粒子生命周期的顶层模块
2. **`ParticlePipe.ts`**（新增）：transform feedback pass + render pass
3. **Shader**：`particle_update.vert`（更新位置/速度，输出到 feedback buffer）+ `particle_render.vert/frag`（点精灵渲染）
4. **`WebGLRenderContext.ts`**：新增 `beginTransformFeedback` / `endTransformFeedback` 包装

**预期收益**：万级粒子从 60fps CPU bound → GPU bound，帧率稳定。

---

## 七、实施路线图

```
Phase 1（1-2 周）：P0 UBO
  ├── ShaderLib2 全量 UBO 化
  ├── WebGLRenderContext UBO 管理
  └── 验证：draw call benchmark 对比

Phase 2（2-3 周）：P1 Instancing
  ├── WebGLVertexArrayObject 实例buffer
  ├── Batcher 实例合并逻辑
  ├── BitmapPipe / 粒子 接入
  └── 验证：粒子 benchmark、BitmapText benchmark

Phase 3（3-4 周）：P2 Texture Array
  ├── 纹理管理改造（array 分配/回收）
  ├── MultiTextureBatcher 重写
  ├── Shader 升级 sampler2DArray
  └── 验证：大量异纹理 Sprite benchmark

Phase 4（按需）：P3 Transform Feedback
  ├── ParticleSystem 模块
  ├── Transform feedback pipe
  └── 验证：万级粒子 benchmark
```

## 八、风险与注意事项

| 风险 | 应对 |
|------|------|
| WebGL1 兼容性 | 所有新特性仅在 `isWebGL2 === true` 时启用，WebGL1 保留现有路径 |
| UBO std140 对齐 | 严格遵循 `std140` 布局规则，用 `vec4` 对齐避免 padding 错误 |
| Texture Array 尺寸不一致 | 实现纹理图集自动打包（bin packing），或用多个 array 分组 |
| Instancing 与 filter/mask 冲突 | filter/mask 场景自动退化为非 instanced 路径 |
| 移动端 WebGL2 覆盖 | iOS Safari 12+、Android Chrome 56+ 均支持 WebGL2，覆盖 ~95% 设备 |
