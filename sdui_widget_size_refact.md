# SDUI 布局系统：基于 Flexbox 的三层设计规范

利用 CSS Flexbox 的 **高度链条传递 (Height Propagation)** 与 **弹性分配 (flex-grow / shrink 对齐)**，通过建立三层组件分类协议，实现 SDUI 在任意卡片尺寸下都能完美分配空间并防止布局撑破 (Flex Blowout)。

---

## 1. 组件元数据规范 (Widget Contract)

每个 Widget 在渲染前必须声明其布局类型，主要分为三类：

| 类型 | 核心 CSS | 适用场景 | 行为说明 |
| :--- | :--- | :--- | :--- |
| **Structural** (结构型) | `flex: 0 0 auto` | Text, Badge, Icon | 由内容撑开，不放大、不缩小。 |
| **Container** (容器型) | `flex: 1 1 0%` | Container, ColumnSet | **跳过外层 wrapper**，自身加 flex-1 填满父容器。 |
| **Content** (内容型) | `flex: grow 0 0px` | List, Chart, Table | 按权重瓜分剩余空间，设置刚性 min-height 兜底。 |

### 元数据定义示例
```javascript
const WIDGET_REGISTRY = {
  // 容器类：不设 minRows，直接 flex-1
  'Container': { layoutType: 'container' },
  // 内容类：设置 minRows 保证“刚性底线”
  'DataList':  { layoutType: 'content', minRows: 2, weight: 1 },
  'Chart.Pie': { layoutType: 'content', minRows: 3, weight: 2 },
};
```

---

## 2. 统一卡片外壳 (Card Shell)

卡片内容容器必须强制开启 Flex 布局并处理溢出：
- **sdui-card-shell**: 应用 `flex flex-col h-full overflow-y-auto`。
- **overscroll-behavior: contain**: 防止卡片滚动到底后带动整个页面滚动。

---

## 3. 高度链条传递规则

为了让 `flex-grow` 和百分比高度能层层传递，必须遵守以下链条：
1. **Shell**: 提供 `h-full` 和 `flex` 上下文。
2. **Wrapper (Content型)**: 必须设置 `height: 0` (或 `flex-basis: 0px`) 来阻断 intrinsic height，强制使用 `flex-grow` 分配的高度。
3. **Inner Component**: 必须设置 `min-h-0` 阻断子元素向外撑开。

---

## 4. 特殊组件开发指南

### 4.1 锁定表头 (Sticky Header)
表格类组件必须实现表头锁定。
```css
thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--surface); /* 必须有实色背景遮挡下方滚动内容 */
}
```

### 4.2 响应式图表 (Adaptive Charts)
- **禁用固定像素高度**：移除所有 `minHeight={240}` 等硬编码。
- **使用百分比半径**：Pie 饼图使用 `outerRadius="80%"` 和 `cx="50%" cy="50%"` 以适应各种宽高比的容器。
- **ResponsiveContainer**：确保设置为 `width="100%" height="100%"`.

---

## 方案优势
- **自适应填充**：空间充足时自动撑满，利用 `flex-grow` 完美平衡多个组件。
- **刚性底线保障**：空间极小时卡片触发全局滚动，保证组件不塌陷、不可见区域仍可滚动查阅。
- **隔离滚动环境**：通过 `overscroll-contain` 提供了顺滑的容器内交互体验。