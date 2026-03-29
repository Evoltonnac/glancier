# Glanceus SDUI Template Expression Specification

This document defines supported expression syntax and safety boundaries for SDUI template fields.

## 1. Usage Forms

- Full expression: `"{...}"` -> returns original type (`number` / `boolean` / `string` / `null`).
- Interpolation expression: `"prefix {...} suffix"` -> stringified and concatenated.
- Escaping: use backslash to escape template control chars.
  - `\{` / `\}` outputs literal braces.
  - `\\` outputs literal backslash.
- In YAML double-quoted strings, backslashes must be escaped too:
  - write `\\{` / `\\}` to produce `\{` / `\}`.

## 2. Supported Syntax

- Literals: number, string, boolean, `null`, `undefined`
- Variables and paths: `usage`, `key_item.percent`, `items[0]`
- Operators: `+ - * / %`, comparisons, logical operators, `??`
- Ternary: `condition ? a : b`
- Grouping and unary: `( )`, `!`, `+x`, `-x`

## 3. Whitelisted Functions

- `fixed(value, digits)`
- `round(value, digits = 0)`
- `floor(value)` / `ceil(value)` / `abs(value)`
- `min(...values)` / `max(...values)`
- `clamp(value, min, max)`
- `len(value)`
- `lower(value)` / `upper(value)`
- `string(value)`
- `number(value, fallback = 0)`

## 4. Unsupported Capabilities

- Arbitrary code execution (`eval`, `new Function`, `import`)
- Assignment, declarations, loops, statement blocks
- Object/array literals
- Arbitrary method calls (for example `obj.fn()`)

## 5. Safety Boundary

- Expressions are executed by a restricted parser, not dynamic JS execution.
- Only whitelisted functions are allowed.
- `__proto__`, `prototype`, and `constructor` access is blocked.
- Parse failures return `undefined` and degrade rendering gracefully.

## 6. Examples

- `"{fixed(credits_data.remaining, 2)}"`
- `"{usage > 80 ? 'High' : 'Normal'}"`
- `"Used {number(usage, 0)} / {number(limit, 0)}"`
- `"{key_item.active && key_item.percent >= 80 ? 'Alert' : 'OK'}"`
- `"Literal \\{usage\\} and resolved {usage}"`
- `"Windows path: C:\\\\{username}"`
- `data_source: "{sql_response.rows}"`
- `fields_source: "{sql_response.fields}"`
- `encoding.x.field: "ts"` with data resolved from `sql_response.fields`
- `encoding.y.field: "amount"` with numeric field metadata from `sql_response.fields`
- `encoding.label.field: "label"` and `encoding.value.field: "count"`
- `encoding.columns[0].field: "label"` and `encoding.columns[1].field: "amount"` for `Chart.Table`
