# Glancier SDUI 模板表达式规范

本规范定义 SDUI 模板字段可用表达式语法与安全边界。

关联文档：
- [架构与模板配置指南](./01_architecture_and_guidelines.md)
- [组件地图与分类字典](./02_component_map_and_categories.md)

## 1. 使用方式

- 整体表达式：`"{...}"`，返回原始类型（number/boolean/string/null）。
- 插值表达式：`"prefix {...} suffix"`，结果转字符串后拼接。
- 转义写法：使用反斜杠转义模板控制符，`\{` / `\}` 输出字面量花括号，`\\` 输出字面量反斜杠。

## 2. 可用语法

- 字面量：数字、字符串、布尔、`null`、`undefined`
- 变量与路径：`usage`、`key_item.percent`、`items[0]`
- 运算：`+ - * / %`、比较、逻辑、`??`
- 三元：`condition ? a : b`
- 分组与一元：`( )`、`!`、`+x`、`-x`

## 3. 白名单函数

- `fixed(value, digits)`
- `round(value, digits = 0)`
- `floor(value)` / `ceil(value)` / `abs(value)`
- `min(...values)` / `max(...values)`
- `clamp(value, min, max)`
- `len(value)`
- `lower(value)` / `upper(value)`
- `string(value)`
- `number(value, fallback = 0)`

## 4. 不支持能力

- 任意代码执行（`eval` / `new Function` / `import`）
- 赋值、声明、循环、语句块
- 对象/数组字面量
- 任意方法调用（如 `obj.fn()`）

## 5. 安全边界

- 由受限解析器执行，不走 JS 动态执行。
- 仅允许白名单函数。
- 禁止 `__proto__` / `prototype` / `constructor`。
- 解析失败返回 `undefined`，并降级为空值渲染，不中断页面。

## 6. 示例

- `"{fixed(credits_data.remaining, 2)}"`
- `"{usage > 80 ? 'High' : 'Normal'}"`
- `"Used {number(usage, 0)} / {number(limit, 0)}"`
- `"{key_item.active && key_item.percent >= 80 ? 'Alert' : 'OK'}"`
- `"Literal \\{usage\\} and resolved {usage}"`
- `"Windows path: C:\\\\{username}"`
