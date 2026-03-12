# Glancier SDUI 模板表达式规范

本规范定义了 **所有 SDUI 模板字段** 可用的表达式语法与安全边界。  
表达式能力是渲染引擎的全局能力，不属于某个单独组件（例如 `TextBlock`）。

## 1. 使用方式

- 整体表达式：`"{...}"`  
  返回表达式的原始类型（number/boolean/string/null）。
- 插值表达式：`"prefix {...} suffix"`  
  每个表达式结果会被转成字符串并拼接。

## 2. 可用语法

- 字面量：
  - 数字：`1`、`3.14`
  - 字符串：`'ok'`、`"ok"`
  - 布尔：`true`、`false`
  - 空值：`null`、`undefined`
- 变量与路径：
  - 标识符：`usage`
  - 点访问：`key_item.percent`
  - 下标访问：`items[0]`、`items[index]`
- 分组：`( ... )`
- 一元运算：`!x`、`+x`、`-x`
- 二元运算：
  - 算术：`*` `/` `%` `+` `-`
  - 比较：`>` `>=` `<` `<=`
  - 相等：`==` `!=` `===` `!==`
  - 逻辑：`&&` `||`
  - 空值合并：`??`
- 三元运算：`condition ? a : b`

## 3. 可用内置函数（白名单）

- `fixed(value, digits)`：数字保留小数位（返回字符串）
- `round(value, digits = 0)`：四舍五入（返回数字）
- `floor(value)` / `ceil(value)` / `abs(value)`
- `min(...values)` / `max(...values)`
- `clamp(value, min, max)`
- `len(value)`：字符串或数组长度
- `lower(value)` / `upper(value)`
- `string(value)`：转字符串
- `number(value, fallback = 0)`：转数字，失败时返回 fallback

## 4. 明确不支持

- 任意代码执行（`eval` / `new Function` / `import`）
- 赋值、声明、循环、语句块
- 对象字面量、数组字面量
- 任意方法调用（例如 `obj.fn()`、`value.toFixed(2)`）

> 说明：若要格式化小数，请使用 `fixed(value, 2)`，而不是 `value.toFixed(2)`。

## 5. 安全边界

- 表达式由受限语法解析器执行，不走 JS 动态执行。
- 仅允许白名单函数调用。
- 禁止访问 `__proto__`、`prototype`、`constructor` 等危险属性。
- 解析失败时返回 `undefined`，模板渲染按空值降级，不中断页面渲染。

## 6. 示例

- `"{fixed(credits_data.remaining, 2)}"`
- `"{usage > 80 ? 'High' : 'Normal'}"`
- `"Used {number(usage, 0)} / {number(limit, 0)}"`
- `"{key_item.active && key_item.percent >= 80 ? 'Alert' : 'OK'}"`
