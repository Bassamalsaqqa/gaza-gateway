# Public Media Assignment & Truth Architecture Note

> **Document Scope**: Master inventory, provenance, derivative metadata, and routing contracts for the 11 owner-supplied assets integrated during the **Designer Media + Public Surface Integration Checkpoint** (2026-09-29).

---

## 1. Asset Inventory & Provenance

### 1.1 Decorative Utility Rail Master Artwork (`4-cards/`)
Four contiguous horizontal slices extracted from a unified horizontal panoramic master.
- **Orientation Rule**: Original artwork flows left-to-right from Heritage to Flight Status. In Arabic RTL, the 4-column flow places Flight Status on the visual start (right) matching the original composition. In English LTR, **only the decorative image layer** (`ltr:scale-x-[-1]`) is horizontally mirrored so that the artwork seams connect seamlessly without gaps.
- **Seam Invariant**: Decorative `<img>` elements maintain fixed geometry and zero scaling on hover (`pointer-events-none absolute inset-0 size-full select-none object-cover opacity-90 ltr:scale-x-[-1]`). Hover interaction is delivered exclusively via restrained background and foreground overlay transitions, keeping all rail seams perfectly aligned.
- **Accessibility & Markers**: Images are purely decorative (`alt=""`, `aria-hidden="true"`). Whole cards act as accessible links with visible focus rings.

| Master File | Master Dimensions | Master Bytes | Master SHA-256 | Generated WebP | Deriv Dim | Deriv Bytes | Deriv SHA-256 | Reduction |
|---|---|---|---|---|---|---|---|---|
| `حالة الرحلات.png` | 1181×181 | 46,263 B | `96dbed8e5fa7904e65143f14b608303a6be0f6abcd5b11772f0a95cc0dc1794e` | `utility-flight-status.webp` | 1181×181 | 8,590 B | `5af558c187518d23a8e1d7e9ac782d34da8f7242489bfbf6d3f9f37900adff78` | -81.4% |
| `انهاء اجراءات السفر.png` | 1185×181 | 49,305 B | `26ff25f74431cbc85b3b492b15a33c994af240ebb24bf824ebc7cb8d19387176` | `utility-check-in.webp` | 1185×181 | 8,932 B | `4c84e4c5f25ab1dfef440da6758ebc7722f630bbc6da184c3d973a4a445d7b0d` | -81.9% |
| `ارشادات السفر.png` | 870×181 | 32,263 B | `45b33f02553e25a7c0f318a6a07c84964585bbd68b686799a7e0a3741c65bd0b` | `utility-travel-guidelines.webp` | 870×181 | 6,544 B | `3932b3eaf1cb67829a01a8c8c3f5c3e9838277e6e2b09f10514e1c5ac33a9dfa` | -79.7% |
| `ذاكرة المطار.png` | 876×181 | 34,208 B | `32295b14d50846c0781cdb000650d1392b390468bb3bdc7071636267494dabdf` | `utility-airport-heritage.webp` | 876×181 | 6,650 B | `cd2e9616d12d95e47aa56c49bd21f0b3f024f00a9cac5a146e3cf1a2db5f3e02` | -80.6% |

### 1.2 Photographic Masters (`Other Photos/`)
Seven photographic assets converted into responsive WebP sets at widths `640w`, `960w`, `1280w`, `1376w` (~80–85 quality):
- **Caption Strip Cropping**: Master images under `Other Photos/` remain untouched outside the build graph. For derivatives, bottom white borders containing printed captions were cleanly cropped (Airport Terminal at row y=3336; Palestinian Airlines aircraft at row y=892) to eliminate printed watermark text and retain 100% authentic photographic pixels.
- **Focal Positioning**: Route-specific focal position is configured per view. For `/airport`, `focalPosition="center 15%"` ensures both the control tower cab/antenna and terminal arched arcade remain prominently visible and recognizable across desktop (1440px) and mobile (390px/320px).
- **Anti-Mirroring Guarantee**: Photographs and cartographic graphics are **strictly never mirrored** in either LTR or RTL mode.

| Master File | Master Dim | Master Bytes | Master SHA-256 | Media ID | Truth Class | Crop Dim | Route / Surface | Stable Marker |
|---|---|---|---|---|---|---|---|---|
| `Gaza Airport Archive year 2000.jpg` | 5040×3612 | 10,043,512 B | `6eacf26143a8419767103e2155be83f0a845c9f0b180a7747823318d956482a7` | `airport-archive-hero-2000` | `historical-documentary` | 5040×3336 | `/airport` hero | `data-public-hero="airport"` |
| `Archive Airplane year 2000.jpg` | 1452×946 | 931,437 B | `92f3c278ca255d9d17dcc9be8ac389b350bdfaec3834b6602a2d4a2e4db9152f` | `gallery-aircraft-archive-2000` | `historical-documentary` | 1452×892 | `/gallery` hero | `data-public-hero="gallery"` |
| `Destinations-hero.jpg` | 2247×1498 | 333,894 B | `0d164dc43a49227eefcf2af8f81436bd9d8b7420acff846daf3375f57bf80c27` | `destinations-hero` | `illustrative-photo` | 2247×1498 | `/destinations` hero | `data-public-hero="destinations"` |
| `travel-info-hero.jpg` | 5164×3873 | 1,193,797 B | `06445c5978f63cd9b70824b2ce40e071bdbd55aa433e854b30ec3c0fe05990aa` | `travel-info-hero` | `illustrative-photo` | 5164×3873 | `/travel` hero | `data-public-hero="travel"` |
| `manager-booking-hero.jpg` | 5842×3887 | 2,025,030 B | `a31f8bc566b69a489d9c3e3aa10829cb5e1b1eaca71ccd455539056fec46968c` | `manage-booking-hero` | `illustrative-photo` | 5842×3887 | `/manage` hero | `data-public-hero="manage"` |
| `check-in-hero.jpg` | 4032×3024 | 1,005,658 B | `863a41cdfca7a6cec5dd57c9dcd86a3af88955ad9189790af57bb1763dc93feb` | `check-in-hero` | `illustrative-photo` | 4032×3024 | `/check-in` hero | `data-public-hero="check-in"` |
| `sign-in-photo.jpg` | 9000×12000 | 7,609,651 B | `0cf8b6303f99192a4911c82ee0460aa5072fcc86a83957c039f75c3f886d1571` | `signin-photo` | `illustrative-photo` | 9000×12000 | `/signin` auth panel | `data-auth-media="signin"` |

### 1.3 Photo Derivative Inventory (28 WebP Variants)

| Media ID | Variant | Dimensions | Bytes | SHA-256 |
|---|---|---|---|---|
| `airport-archive-hero-2000` | 640w | 640×424 | 57,372 B | `6538f2e5bfede264fea82adf9bbfb46f077f93d8d4ebada91b9250038e721d6e` |
| `airport-archive-hero-2000` | 960w | 960×635 | 129,728 B | `4287a64201a6fc8e299b68a68e4ec85e8b936cacf5eccf9be22abb02d8b5d306` |
| `airport-archive-hero-2000` | 1280w | 1280×847 | 224,100 B | `af1835a1c67c0ec284d0e4c7f782c17ef828f9a8616529c90954667e1904a9a2` |
| `airport-archive-hero-2000` | 1376w | 1376×911 | 257,344 B | `0d660ce92192a524bba7847545ed31d2df8552d5730d93976dfe0a1f63c2652e` |
| `gallery-aircraft-archive-2000` | 640w | 640×393 | 31,374 B | `a79d21c05b76fbcfa8d4895721b21dfff078e2807c78590a289b4a8bbe05df54` |
| `gallery-aircraft-archive-2000` | 960w | 960×590 | 70,196 B | `12e08f2abf0095396357b5338dd5c053dfc5a960d04d32906a10ac7f718f4a77` |
| `gallery-aircraft-archive-2000` | 1280w | 1280×786 | 108,950 B | `90659b810345377d3f785cd2f1b7b8851ae62c7e75839103a220b8b9f46b4eac` |
| `gallery-aircraft-archive-2000` | 1376w | 1376×845 | 122,148 B | `f10abc80831ef9f9a0ee319599f8d282e6a93cae6e75d2a3b5e628dd3a392fd8` |
| `destinations-hero` | 640w | 640×427 | 36,052 B | `8349d7b6e852a40aa0597c88337789d93762d05638faa3cd16ace09d73bac1e0` |
| `destinations-hero` | 960w | 960×640 | 67,806 B | `6409f980196895dfcd9c3bf9293e540b831e3fbb26e0071705a345a06bd808c2` |
| `destinations-hero` | 1280w | 1280×853 | 106,020 B | `0642f64257a352126d67ad4bac312c4e162b03d563baa4401094dc52076d22de` |
| `destinations-hero` | 1376w | 1376×917 | 118,000 B | `b57c65dde04860d6d4257379deab5db0035411d49deccd37a5007b2758aa6b9f` |
| `travel-info-hero` | 640w | 640×480 | 37,076 B | `6fe8c62b4661fd34818b3a14404345df4da3435b1c63a149cfd55e9b74439551` |
| `travel-info-hero` | 960w | 960×720 | 68,344 B | `dd9c36e234c038d4e86e04efad92c511d0b4c82383b383b10fc906ef474713f9` |
| `travel-info-hero` | 1280w | 1280×960 | 104,038 B | `3e3ca368dac891b1e3f6bb1e9aaa01619291bde608a4fce4f9902b391a564c1a` |
| `travel-info-hero` | 1376w | 1376×1032 | 113,744 B | `0f79f6cbe229f3954fa69e55d539d671866b67b09b39bfd362a4d94dd1feba6e` |
| `manage-booking-hero` | 640w | 640×426 | 16,890 B | `3e3e3ea07b737cb255d60ee05e3793f3253e6bf27fe153e0829fb417c10f1f1b` |
| `manage-booking-hero` | 960w | 960×639 | 28,192 B | `2ad4910537339761ac7fd6417a326e42cd08d15f54df3460ff898a359feeee3d` |
| `manage-booking-hero` | 1280w | 1280×852 | 41,286 B | `feea759fd3ed10dd407303d25520cda7495e27074823d037bb7da55e62bea120` |
| `manage-booking-hero` | 1376w | 1376×916 | 45,192 B | `120d3842de5166e365392456542d1a2c98dfe5fa12f561aeaa8c214efe909e42` |
| `check-in-hero` | 640w | 640×480 | 37,574 B | `8aa59596b4d777cd43f49cafce0966c854d1dfddac56057b07f57b17f2310cb3` |
| `check-in-hero` | 960w | 960×720 | 67,624 B | `ba1d5786b0f7936ec6e267389fbe5df18922f080242fc05c6e8b73c026f7b8aa` |
| `check-in-hero` | 1280w | 1280×960 | 100,110 B | `73b4f49216a309b44c7990605e4e4f08db8490dfb84f7b7514499949c4017d83` |
| `check-in-hero` | 1376w | 1376×1032 | 110,216 B | `8ff97a3eb4d17ec5fd12fb7524795fcad6ebe05f4a570cca5e91fb38124cf902` |
| `signin-photo` | 640w | 640×853 | 77,486 B | `80723168811d137d7e31ebee9139476eebf67e23297297c3a86cbb56c997e12e` |
| `signin-photo` | 960w | 960×1280 | 159,556 B | `5015e84e781d51d97a2822727f814521fa6d6fd5444071698ec27df5732fdf0d` |
| `signin-photo` | 1280w | 1280×1707 | 259,530 B | `08dbcb06560ba39dd050f15941629dac77bcfcbc28aeaa8b661728a99efef19d` |
| `signin-photo` | 1376w | 1376×1835 | 289,962 B | `d88a6b9ea3b22ba230d3f67a076be1cbe8f5f803384ef58f0baa8626a4551c03` |

### 1.4 Aggregate Compression Metrics
- **Total Master Weight (11 owner files)**: 23,305,018 bytes (~22.23 MB)
- **Total Derivative Weight (32 WebP files)**: 2,916,626 bytes (~2.78 MB)
- **Net Payload Compression Ratio**: **87.49% overall reduction** (derivatives represent 12.51% of original source weight).
- **Visual Parity**: All 32 derivatives were generated directly from the 11 owner-supplied master assets using Lanczos resampling and WebP compression. Historical documentary derivatives cleanly crop printed caption borders outside photographic boundaries. All illustrative photographs and decorative artwork remain visually identical to owner source originals.

---

## 2. Public Surface Integration Architecture

### 2.1 PublicPhotoHero Component (`src/components/media/public-photo-hero.tsx`)
- Renders responsive hero photographs with `ResponsiveImage` using intrinsic dimensions, standardized srcSet, and `loading="eager"` / `fetchPriority="high"`.
- Directional gradient overlay: EN left-to-right (`from-ink/95 via-ink/75 to-transparent`), AR right-to-left (`from-ink/95 via-ink/75 to-transparent`), ensuring high text contrast against dark backgrounds.
- Route-specific focal positioning (`object-position`).
- Truth classification badge: compact, rounded-full pill displaying `Archive · 2000` for documentary records and `Illustrative photograph` for illustrative scenes.
- Route functionality preservation:
  - `/destinations`: Search filter input embedded inside hero content area.
  - `/gallery`: Future-concept link helper (`/airport/future`) preserved below heading.
  - `/travel`: Section tabs and guide information preserved below hero.
  - `/manage` and `/check-in`: Task lookup forms placed directly below hero.

### 2.2 PassengerAuthShell (`src/components/passenger-auth-shell.tsx`)
- Enabled via `mediaPanel="signin"` (or boolean).
- Two-column layout on desktop: photo panel on start (`0.85fr`), form panel on end (`1.15fr`).
- Compact mobile photo band (`h-36 sm:h-44 lg:h-auto lg:min-h-[34rem]`) preserving form priority.
- Fallback preservation: `/register` and other auth views retain default decorative brand panel without photo media.

---

## 3. Strict Truth Class & Target Allowlist Rules

1. **`historical-documentary`**: Authentic documentary records of Gaza International Airport and Palestinian Airlines. Allowed on documentary targets (`airport.chapter-card`); strictly never carries AI concept labels.
2. **`illustrative-photo`**: Genuine commercial aviation and terminal photography used for general illustrative context. Strictly rejected from documentary targets like `airport.chapter-card`.
3. **Studio Isolation**: The 7 route-bound photo heroes are filtered out from Appearance Studio's image picker (`studio-media-panel.tsx`) to prevent unintended mutation of editorial route heroes.
4. **Operational Surface Immunity**: Operational booking surfaces (`booking.flight-option`, `booking.trip-summary`, etc.) reject all imagery, remaining strictly media-free and functional.
