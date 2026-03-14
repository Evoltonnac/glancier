# Glancier SDUI 架构与模板配置指南

## 1. 目标

Glancier 视图层采用 SDUI（Schema-Driven UI）：
- 通过 YAML/JSON 模板声明 UI，不为每个业务场景硬编码 React 页面。
- 渲染器负责解析、校验、降级，不负责请求和业务流程控制。
- 数据获取与鉴权交给 Flow，SDUI 仅负责展示。

相关文档：
- [组件地图与分类字典](./02_component_map_and_categories.md)
- [模板表达式规范](./03_template_expression_spec.md)
- [Flow 编排文档入口](../flow/README.md)

## 2. 模板结构（`templates`）

每个集成可以声明多个模板，当前模板类型以 `source_card` 为主：

```yaml
templates:
  - id: "template_usage"
    type: "source_card"
    ui:
      title: "Usage"
      icon: "📊"
    widgets:
      - type: "Container"
        items:
          - type: "TextBlock"
            text: "{balance}"
            size: "xl"
            weight: "bold"
          - type: "Progress"
            value: "{usage_percent}"
            label: "Usage"
```

字段说明：
- `id`：模板唯一标识。
- `type`：模板类型（当前主类型为 `source_card`）。
- `ui`：卡片层元信息（如 `title`、`icon`）。
- `widgets`：SDUI 组件树入口。

## 3. 通用 Props 规范（Widgets）

所有 widget 仅暴露最小通用能力，统一使用以下枚举：

- `spacing`: `none` | `sm` | `md` | `lg`
- `size`: `sm` | `md` | `lg` | `xl`
- `tone`: `default` | `muted` | `info` | `success` | `warning` | `danger`
- `align_x` / `align_y`: `start` | `center` | `end`

约束：
- 不再支持旧值（如 `small/default/large`、`compact/relaxed`、`good/attention`、`left/right/top/bottom`）。
- 视觉细节（padding、radius、复杂 style 变体）由项目 UI 层统一控制，不通过模板暴露。

> **SDUI 组件编码规范**：在编写 SDUI 组件时，所有间距（gap、padding、margin）必须使用 CSS 变量，禁止硬编码像素值。项目提供以下间距变量：
> - `--qb-gap-1` ~ `--qb-gap-6`：2px ~ 20px（可配合 `--qb-density` 实现密度响应式）
> - `--qb-card-pad-x` / `--qb-card-pad-y`：卡片内边距
> - `--qb-grid-gap`：网格间距
>
> 示例：`className="gap-[var(--qb-gap-3)]"` 或 `style={{ padding: 'var(--qb-card-pad-y) var(--qb-card-pad-x)' }}`

## 4. 模板绑定语法

### 4.1 直接值绑定

字段是完整表达式 `"{...}"` 时，返回原始类型：
- `value: "{quota_percent}"` -> number
- `show: "{quota_percent > 80}"` -> boolean

### 4.2 字符串插值

表达式嵌入字符串时，结果会转字符串拼接：
- `text: "Usage: {used}/{limit}"`

### 4.2.1 转义

需要输出字面量模板符号时，使用反斜杠：
- `\{` / `\}` -> 输出 `{` / `}`
- `\\` -> 输出 `\`
- 若使用 YAML 双引号字符串，需写成 `\\{` / `\\}` / `\\\\`（因为 YAML 会先处理一轮反斜杠转义）

### 4.3 表达式边界

- 仅允许白名单语法与函数。
- 禁止任意代码执行。
- 解析失败时降级为空值，不中断卡片渲染。

完整规则见 [03_template_expression_spec.md](./03_template_expression_spec.md)。

## 5. 列表与布局编排

```yaml
- type: "List"
  data_source: "keys"
  item_alias: "key_item"
  layout: "col"
  filter: "key_item.active == true"
  sort_by: "key_item.usage"
  sort_order: "desc"
  render:
    - type: "TextBlock"
      text: "{key_item.name}"
      weight: "semibold"
    - type: "Progress"
      value: "{key_item.percent}"
      label: "Usage"
```

组件职责见 [02_component_map_and_categories.md](./02_component_map_and_categories.md)。

## 6. Schema-First 约束

1. 先定义 Schema，再推导组件 Props。
2. 渲染前必须执行 schema `safeParse`。
3. 无效节点必须降级而非白屏。
4. 新增/修改组件时同步更新 SDUI 文档。

## 7. 与 Flow 的边界

- SDUI：展示层。
- Flow：鉴权、抓取、提取、恢复执行。
- Flow 入口见 [../flow/README.md](../flow/README.md)。
