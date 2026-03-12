# Glancier 声明式 UI (Schema-Driven UI) 架构及设计规范

## 一、 核心设计理念 (Core Principles)

Glancier 的视图层遵循 **Server-Driven UI (SDUI)** 与纯粹的数据驱动抽象模式，旨在提供极致的配置化灵活性与对 AI（Generative UI）友好的 Schema 结构。

### 1. Schema 驱动，而非组件驱动 (Composition strictly via JSON/YAML)
前端不再为特定业务保留臃肿的复合组件。渲染器只识别极其有限、高度正交的基础原子元素与通用容器。任意复杂的业务卡片（如：大数字关键指标、带有上下趋势标记的概览、带有阈值告警的资源消耗条）**全部由这些基础原子在配置中通过嵌套组合而成**。

### 2. 样式解耦与标准化参数 (Standardized Design Tokens)
前端组件不接受随意、无限制的 CSS 注入（如 `margin: 10px`, `color: #ff0000`）。
* **间距 (Spacing)**: 统一由外层结构容器 (Layouts) 控制，元素自身不允许有外部 Margin。
* **文字与颜色**: 统一收敛到严格的语义化枚举类型参数（如 `size: large`, `color: attention`）。

### 3. 表现层与数据层绝对分离 (Expression Engine)
组件本身无任何数据请求或复杂业务计算能力。它所需展示的文字内容、判定逻辑，均由外层的 Schema 通过字符串插值和表达式引擎（如 `"{fixed(data.cost, 2)}"` 或 `"{data.usage > data.limit ? 'over' : 'ok'}"`）计算好后注入。
表达式语法、函数白名单与安全边界，统一见 `03_template_expression_spec.md`。

---

## 二、 Schema-First (Zod) 开发规约

为了实现“编写即校验”、“配置即文档”的开发体验，并在未来无缝对接 LLM 的 Structural Output（结构化输出），Glancier UI 层开发必须遵循 **Schema-First** 原则：

1. **强类型的单一事实来源 (Single Source of Truth)**
   先定义组件的 `Zod Schema`。
2. **零类型冗余**
   组件的 `Props` 类型必须通过 `z.infer<typeof ComponentSchema>` 自动推导，严禁手动手写 TypeScript `Interface` 与 Zod Schema 重复。
3. **运行时校验与容错层**
   渲染引擎 (WidgetRenderer) 接收到外部下发的 JSON/YAML 节点树时，在实例化具体 React 组件前，必须通过该组件对应的 Zod Schema 进行严格的 `safeParse` 校验。
   * 解析成功：剥离无效字段后，按强类型渲染。
   * 解析失败：将该节点降级为静默渲染或渲染一个具有明显标示的安全 Fallback UI，保证外层卡片绝小白屏。
4. **统一导出以供 AI 消费**
   所有 UI 组件聚合导出一个完整的联合 Zod Parser，以此作为提供给大模型自动生成可视化面板的唯一依据（Context）。
5. **文档同步更新原则**
   由于业务发展需要新增图元或修改现有图元职责范围时，除了修改 Zod Schema 代码，**必须同步修改 `02_component_map_and_categories.md` 组件地图文档**。保证文档作为系统骨架设计的纲领性指导始终处于最新状态。

### 示例规约：

```typescript
import { z } from 'zod';

// 1. 定义 Schema
export const TextBlockSchema = z.object({
  type: z.literal("TextBlock"),
  text: z.string(),
  size: z.enum(["small", "default", "large"]).default("default"),
  color: z.enum(["default", "muted", "good", "warning", "attention"]).default("default"),
});

// 2. 推导 Props
export type TextBlockProps = z.infer<typeof TextBlockSchema>;

// 3. 构建视图组件
export const TextBlock: React.FC<TextBlockProps> = (props) => {
  // 直接安全使用 props
  return <div className={`text-${props.size} color-${props.color}`}>{props.text}</div>;
}
```

---

## 三、 平台渲染器与安全边界 (Renderer Guidelines)

1. **边界不可打破**：坚决禁止前端开发者为了某个页面的视觉微调，在原子配置里偷偷增加如 `marginTop` 这类破坏流式布局属性设计的字段！任何间隙和对齐只能通过使用 `Container` 与 `ColumnSet`。
2. **模板字面量的静默降级 (Graceful Fallback)**：解析器对于 `"{data.not_exist}"` 的空值或异常引用，必须自动处理为降级显示（如显示为空字符串 `""` ），绝不可向外抛出导致崩溃。
3. **副作用隔离**：`components/widgets/` 内的基础 React 组件内部必须是严格的纯函数渲染。**杜绝一切包含 `fetch` 或 `useEffect` 中进行的异步拉取动作**。所需数据皆由最顶层卡片进行一次性派发。
