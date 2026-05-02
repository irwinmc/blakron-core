# Changelog

All notable changes to `@blakron/core` are documented here.

---

## [0.3.3] — 2026-05-03

### Fixed

- **FilterPipe / MaskPipe**: Correct GL state management to prevent stale blend state leaking between filter and mask passes.

### Changed

- Replace explicit `undefined` assignments with optional property syntax across the codebase.
- Declare `children` field explicitly in `DisplayObjectContainer` and remove non-null assertions.

---

## [0.3.2] — 2026-05-02

### Added

- **Resource manager**: Comprehensive resource management system with full documentation — supports asset loading, caching, and lifecycle management.
- **Capabilities system**: Runtime feature-detection API for querying WebGL extensions and platform capabilities.
- **TextPipe**: Complete text rendering pipeline integrated into the player.

### Changed

- **Namespace migration**: Renamed all internal namespaces from `Heron` → `Blakron` to align with the new package identity.
- Fixed main entry point path in `package.json`.
- Added comprehensive migration status and API compatibility guide (`docs/migration.md`).

---

## [0.2.4] — 2026-04-11

### Added

- **TextField rendering pipeline**: Full Canvas 2D and WebGL rendering path for `TextField`, including scroll offset, padding, clipping, and native `INPUT` mode support.
    - Prevents double-text artifact when native input is focused.
    - Fixes canvas buffer scaling and border handling in coordinate mapping.
    - Refines `StageText` padding and clipping for better vertical alignment.
- **Benchmark scenes**: `rapid-churn` and `texture-swap` scenes added to the benchmark suite with Egret comparison.
- **Example pages**: Index page, mesh test, net test, video test, and sound test HTML examples.
- **Video rendering**: Dynamic scaling and per-frame WebGL texture updates.

### Fixed

- Mesh rendering and tint color calculations corrected.
- Mesh animation angle calculation improved.
- Range input overflow in mesh test layout.
- Blend mode state restoration and WebGL context-loss handling.

### Changed

- Example UI modernized with glassmorphism design and consistent layout.
- Scale mode updated from `exactFit` to `noScale` in examples.
- Benchmark build configuration and scripts added.

---

## [0.2.3] — 2026-04-11

### Added

- **WebGL performance benchmarking suite**: Comprehensive multi-scene benchmark with detailed logging and dynamic-transform scene.
- **Bounds caching**: `DisplayObject` now caches computed bounds to avoid redundant recalculation.
- **Blend mode state management**: Explicit blend mode tracking in the render pipeline.

### Fixed

- Drop shadow padding calculation in filter pipeline.
- Blend mode state not restored after filter/pipe passes.

### Changed

- Filter compositing and blur pipeline restructured for clarity.
- `WebGLRenderContext` reorganized with section comments and `readonly` fields.
- Imports consolidated to explicit module paths across player and display modules.

---

## [0.2.0] — 2026-04-09

### Added

- **Multi-texture batching**: WebGL renderer now batches up to 8 textures per draw call, dramatically reducing GPU state changes.
- **Two-pass separable Gaussian blur**: Ping-pong FBO approach for high-quality, GPU-efficient blur filters.
- **GPU-accelerated CSS filters**: Canvas filter rendering path optimized with CSS filter fallback.
- **Mask rendering**: `DisplayObject` mask support with correct graphics state management.
- **Gradient rendering**: Refactored gradient pipeline in the filter system.
- **Render instruction pipeline**: Dirty-tracking system drives incremental display list updates.
- **Render object type tracking** and render groups for batching optimization.
- **Graphics caching**: Canvas-to-WebGL rasterization cache for static `Graphics` objects.
- **Pixel-perfect hit testing**: Accurate pointer event dispatch using rendered pixel data.
- **Comprehensive unit tests**: `vitest` configuration and test suite covering core modules.

### Changed

- `WebGLRenderContext` fully reorganized with section comments and `readonly` fields.
- Event handler naming standardized across player and WebGL modules.

---

## [0.1.0] — 2026-04-09 _(initial release)_

### Added

- **Core display hierarchy**: `DisplayObject`, `DisplayObjectContainer`, `Stage`, `Sprite`, `Bitmap`, `Mesh`, `Shape` with full Egret-compatible API.
- **Event system**: Object-pooled event dispatch, specialized event types (`TouchEvent`, `TimerEvent`, `Event`), and `EventDispatcher`.
- **WebGL rendering pipeline**: `DisplayList` caching, `SystemTicker`, `ScreenAdapter` integration.
- **Text system**: `TextField` with HTML parsing, `BitmapFont` / `BitmapText` for texture-based text.
- **Filter system**: Drop shadow, blur, color matrix, and glow filters.
- **Media**: `Sound`, `SoundChannel`, `Video` with audio decode queue.
- **Networking**: HTTP utilities (`URLLoader`, `URLRequest`).
- **Geometry**: `Point`, `Rectangle`, `Matrix` with full Egret-compatible surface.
- **Utilities**: `ByteArray`, `Timer`, `Base64Util`, `Logger`, `toColorString`.
- **External interface**: Bridge for JS ↔ game communication.
- Project initialized as `@blakron/core` (formerly `heron-core`), a modern TypeScript rewrite of the Egret game engine targeting WebGL multi-texture batching and a strict instruction-driven render pipeline.
