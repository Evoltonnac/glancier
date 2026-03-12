# Quick Task 15 Summary: 去掉启动时自动刷新数据源逻辑

## 变更内容

### 1. main.py - 移除启动时自动刷新逻辑

**修改位置**: `main.py` 第 87-98 行

删除了 `lifespan` 函数中的启动时数据源自动刷新代码块（原第 91-111 行）。

修改前：
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：自动刷新 JSON 存储的所有数据源
    executor = app.state.executor
    resource_manager = app.state.resource_manager
    config = app.state.config

    stored_sources = resource_manager.load_sources()
    if stored_sources:
        logger.info(f"启动时自动刷新 {len(stored_sources)} 个存储数据源...")
        for stored in stored_sources:
            # ... 刷新逻辑
    # ...
```

修改后：
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时：无数据源自动刷新逻辑
    # 注意：创建数据源时会自动触发加载（见 core/api.py create_stored_source_record）

    yield  # 应用运行中

    # 关闭时：关闭数据库连接
    logger.info("正在关闭...")
    app.state.data_controller.close()
```

### 2. core/api.py - 保持创建时自动启动逻辑

未修改 `create_stored_source_record` 函数（第 239-252 行），保留了创建数据源时自动触发加载的逻辑：

```python
def create_stored_source_record(
    source: StoredSource,
    resource_manager,
    *,
    executor=None,
    config=None,
    background_tasks: BackgroundTasks | None = None,
) -> StoredSource:
    saved = resource_manager.save_source(source)
    if executor is not None and config is not None and background_tasks is not None:
        resolved = _resolve_stored_source_with_config(saved, config)
        if resolved:
            background_tasks.add_task(executor.fetch_source, resolved)
    return saved
```

## 行为变更

| 场景 | 修改前 | 修改后 |
|------|--------|--------|
| 程序启动 | 自动刷新所有已存储的数据源 | 不自动刷新，仅保留空状态 |
| 创建新数据源 | 自动触发加载 | 自动触发加载（保持不变） |

## 验证

- [x] 应用启动正常（`python -c "from main import create_app; app = create_app()"`）
- [x] 相关测试通过

## 备注

测试 `test_create_app_seeds_first_launch_workspace_when_empty` 失败是预先存在的问题（测试期望 5 个示例集成，实际有 6 个），与本次修改无关。
