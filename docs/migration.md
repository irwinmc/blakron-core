# @blakron/core 迁移状态

> 更新日期：2026-05-01

---

## 一、已完成的核心模块

| 模块            | 对应 Egret 模块                | 状态              | 备注                                                                                                |
| --------------- | ------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| `display/`      | `egret/display/`               | ✅ 完成           | DisplayObject, Bitmap, Sprite, Mesh, Shape, Stage, Graphics, Texture 等                             |
| `events/`       | `egret/events/` (大部分)       | ✅ 完成           | 12 个事件类，API 兼容 Egret                                                                         |
| `geom/`         | `egret/geom/`                  | ✅ 完成           | Matrix, Point, Rectangle，含对象池                                                                  |
| `filters/`      | `egret/filters/`               | ✅ 完成           | Blur, ColorMatrix, Glow, DropShadow, Custom（新增）                                                 |
| `net/`          | `egret/net/`                   | ✅ 完成           | HttpRequest, ImageLoader                                                                            |
| `media/`        | `egret/media/`                 | ✅ 完成           | Sound, SoundChannel, Video                                                                          |
| `text/`         | `egret/text/`                  | ✅ 完成           | TextField, BitmapText, BitmapFont, HtmlTextParser, TextMeasurer, InputController, TextPipe (WebGL)  |
| `utils/`        | `egret/utils/` (大部分)        | ✅ 完成           | ByteArray, Base64Util, HashObject, Timer, Logger, NumberUtils, toColorString, FontManager, DebugLog |
| `localStorage/` | `egret/localStorage/`          | ✅ 完成           |                                                                                                     |
| `external/`     | `egret/external/`              | ✅ 完成           | ExternalInterface                                                                                   |
| `player/`       | `egret/player/` + `egret/web/` | ✅ 完成（已重构） | InstructionSet 指令驱动架构，替代 RenderNode                                                        |
| `system/`       | `egret/system/`                | ✅ 完成           | Capabilities（Web 简化版，Client Hints + UA fallback）                                              |
| `benchmark/`    | 无（全新）                     | ✅ 完成           | 性能基准测试模块                                                                                    |

---

## 二、已确认不需要的模块

| 模块                                               | 原因                                                |
| -------------------------------------------------- | --------------------------------------------------- |
| `sensor/` (DeviceOrientation, Geolocation, Motion) | 不做设备传感器                                      |
| `events/GeolocationEvent`                          | 不做地理位置                                        |
| `events/MotionEvent`                               | 不做设备运动                                        |
| `events/OrientationEvent`                          | 不做设备方向                                        |
| `3d/EgretPro`                                      | 独立处理                                            |
| `web/` 平台适配层                                  | 已由 `player/` 替代                                 |
| `utils/registerClass`                              | 反射机制，不需要                                    |
| `utils/getDefinitionByName`                        | 反射机制，不需要                                    |
| `utils/hasDefinition`                              | 反射机制，不需要                                    |
| `utils/getQualifiedClassName`                      | 反射机制，不需要                                    |
| `utils/getQualifiedSuperclassName`                 | 反射机制，不需要                                    |
| `utils/extends`                                    | 现代 TS 不需要                                      |
| `utils/getOption`                                  | 旧配置解析，不需要                                  |
| `utils/is`                                         | 现代 TS 类型守卫替代                                |
| `utils/DataStructure`                              | 按需再决定                                          |
| `display/KTXContainer`                             | 压缩纹理，搁置                                      |
| `player/nodes/` + `paths/`                         | 已由 InstructionSet 架构替代                        |
| `extension/socket/WebSocket`                       | Web 端直接使用浏览器原生 `WebSocket` API，无需封装  |
| `player/FPSDisplay`                                | `Player.perf` 已提供 fps/drawCalls，无需 DOM 覆盖层 |
| `i18n/`                                            | 不做国际化框架                                      |
| `system/Console`                                   | 直接用 `console.*`，无需封装                        |

---

## 三、扩展模块（后续独立分包）

| 模块                       | 包名                   | 说明                               | 工作量估算 |
| -------------------------- | ---------------------- | ---------------------------------- | ---------- |
| `extension/tween/`         | `@blakron/tween`         | Tween + Ease，补间动画             | ~2天       |
| `extension/game/`          | `@blakron/game`          | MovieClip / ScrollView / URLLoader | ~5天       |
| `extension/assetsmanager/` | `@blakron/assetsmanager` | 资源管理器，分组加载               | ~5天       |
| `extension/eui/`           | `@blakron/eui`           | 完整 UI 组件框架（~60 文件）       | ~20天      |
| `utils/XML`                | 随 exml-parser 实现    | DOMParser 简化实现                 | —          |

---

## 四、API 兼容性说明

### Breaking Changes（相对 Egret）

| 变更                       | 影响                          | 迁移方式                  |
| -------------------------- | ----------------------------- | ------------------------- |
| `thisObject` 参数移除      | 所有事件监听代码              | 使用箭头函数              |
| `BlendMode` 值变化         | `"normal"` → `"source-over"`  | 使用常量                  |
| `width/height` 行为变更    | Egret 通过 scaleX/scaleY 模拟 | 使用 explicitWidth/Height |
| `matrix` getter 返回 clone | 依赖引用修改 matrix 的代码    | 改用 `setMatrix()`        |
| `removeChildren()` 返回值  | `DisplayObject[]` → `void`    | 不依赖返回值              |
| `getChildAt()` 越界        | 抛异常 → 返回 `undefined`     | 检查返回值                |
| 命名空间                   | `egret.xxx` → ES Module       | 全量替换                  |

### 新增 API（Egret 无对应）

| API                                         | 说明                         |
| ------------------------------------------- | ---------------------------- |
| `displayObject.tint`                        | 着色（0xRRGGBB）             |
| `displayObject.zIndex` / `sortableChildren` | 排序                         |
| `displayObject.skewX/skewY`                 | 斜切变换                     |
| `container.isRenderGroup`                   | 独立渲染组标记               |
| `graphics.drawArc()`                        | 原生弧线绘制                 |
| `CustomFilter`                              | 自定义 WebGL 着色器滤镜      |
| `EventDispatcher.once()`                    | 一次性监听                   |
| `Player.perf`                               | 性能指标（fps/drawCalls 等） |
| `createPlayer(options)`                     | 统一创建入口                 |
| `Capabilities`                              | 运行环境检测                 |
