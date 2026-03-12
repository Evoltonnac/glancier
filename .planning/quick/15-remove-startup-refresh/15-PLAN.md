# Quick Task 15: 去掉启动时自动刷新数据源逻辑

## 目标
移除程序启动时自动刷新所有已存储数据源的逻辑，保留创建数据源时自动启动加载的逻辑。

## 需要修改的文件

### 1. main.py - 删除启动时自动刷新逻辑

**位置**: `main.py` 第 88-111 行

在 `lifespan` 函数中，删除启动时自动刷新数据源的代码块：

```python
# 删除以下代码 (lines 91-111)
async def lifespan(app: FastAPI):
    # ... existing code ...

    # 启动时：自动刷新 JSON 存储的所有数据源
    executor = app.state.executor
    resource_manager = app.state.resource_manager
    config = app.state.config

    # 刷新 JSON 存储的数据源 (StoredSource)
    stored_sources = resource_manager.load_sources()
    if stored_sources:
        logger.info(f"启动时自动刷新 {len(stored_sources)} 个存储数据源...")
        for stored in stored_sources:
            try:
                # 将 StoredSource 解析为 SourceConfig
                resolved = resolve_stored_source(stored, config)
                if resolved:
                    asyncio.create_task(executor.fetch_source(resolved))
                else:
                    logger.warning(f"[{stored.id}] 无法解析 StoredSource，跳过刷新")
            except Exception as e:
                logger.error(f"[{stored.id}] 启动刷新失败: {e}")
    else:
        logger.info("没有存储的数据源，跳过启动刷新")

    yield  # 应用运行中
    # ... rest of code ...
```

保留其他 lifespan 逻辑（种子工作空间等），只删除上述数据源刷新部分。

### 2. core/api.py - 保留创建时自动启动逻辑

**位置**: `core/api.py` 第 239-252 行

保持 `create_stored_source_record` 函数不变，这是创建数据源时自动启动加载的逻辑：

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

## 验证步骤
1. 启动应用，确认不再自动刷新已存在的数据源
2. 通过 API 创建新数据源，确认自动触发加载
3. 运行相关测试确认行为正确
