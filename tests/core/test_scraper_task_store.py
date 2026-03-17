from __future__ import annotations

from core.scraper_task_store import ScraperTaskStore


def test_upsert_and_claim_updates_attempt_and_lease(tmp_path):
    now = {"value": 1000.0}
    store = ScraperTaskStore(
        tmp_path / "scraper_tasks.json",
        now_fn=lambda: now["value"],
    )

    task = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview",
        url="https://example.com/login",
        script="console.log('x')",
        intercept_api="/api/session",
        secret_key="webview_data",
    )

    assert task["status"] == "pending"
    assert task["attempt_count"] == 0

    claimed = store.claim_next_task(worker_id="worker-a", lease_seconds=15)
    assert claimed is not None
    assert claimed["task_id"] == task["task_id"]
    assert claimed["status"] == "claimed"
    assert claimed["attempt_count"] == 1
    assert claimed["lease_owner"] == "worker-a"
    assert claimed["lease_expires_at"] == 1015.0


def test_claim_requeues_stale_lease(tmp_path):
    now = {"value": 2000.0}
    store = ScraperTaskStore(
        tmp_path / "scraper_tasks.json",
        now_fn=lambda: now["value"],
    )

    task = store.upsert_pending_task(
        source_id="source-stale",
        step_id="webview",
        url="https://example.com",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    first_claim = store.claim_next_task(worker_id="worker-1", lease_seconds=2)
    assert first_claim is not None
    assert first_claim["task_id"] == task["task_id"]
    assert first_claim["attempt_count"] == 1

    now["value"] = 2003.0
    second_claim = store.claim_next_task(worker_id="worker-2", lease_seconds=5)
    assert second_claim is not None
    assert second_claim["task_id"] == task["task_id"]
    assert second_claim["attempt_count"] == 2
    assert second_claim["lease_owner"] == "worker-2"


def test_complete_and_fail_are_idempotent(tmp_path):
    now = {"value": 3000.0}
    store = ScraperTaskStore(
        tmp_path / "scraper_tasks.json",
        now_fn=lambda: now["value"],
    )

    task = store.upsert_pending_task(
        source_id="source-idempotent",
        step_id="webview",
        url="https://example.com",
        script="",
        intercept_api="/api",
        secret_key="session_capture",
    )
    claimed = store.claim_next_task(worker_id="worker-a", lease_seconds=20)
    assert claimed is not None

    completed, changed = store.complete_task(
        task_id=task["task_id"],
        worker_id="worker-a",
        attempt=1,
    )
    assert changed is True
    assert completed is not None
    assert completed["status"] == "completed"

    second_complete, second_changed = store.complete_task(
        task_id=task["task_id"],
        worker_id="worker-a",
        attempt=1,
    )
    assert second_changed is False
    assert second_complete is not None
    assert second_complete["status"] == "completed"

    failed, failed_changed = store.fail_task(
        task_id=task["task_id"],
        worker_id="worker-a",
        error="ignored",
        attempt=1,
    )
    assert failed_changed is False
    assert failed is not None
    assert failed["status"] == "completed"

    retry_task = store.upsert_pending_task(
        source_id="source-idempotent-fail",
        step_id="webview",
        url="https://example.com/fail",
        script="",
        intercept_api="/api",
        secret_key="session_capture",
    )
    retry_claim = store.claim_next_task(worker_id="worker-a", lease_seconds=20)
    assert retry_claim is not None
    assert retry_claim["task_id"] == retry_task["task_id"]

    failed, failed_changed = store.fail_task(
        task_id=retry_task["task_id"],
        worker_id="worker-a",
        error="timeout",
        attempt=1,
    )
    assert failed_changed is True
    assert failed is not None
    assert failed["status"] == "failed"

    failed_again, failed_again_changed = store.fail_task(
        task_id=retry_task["task_id"],
        worker_id="worker-a",
        error="ignored",
        attempt=1,
    )
    assert failed_again_changed is False
    assert failed_again is not None
    assert failed_again["status"] == "failed"


def test_clear_active_tasks_removes_pending_and_claimed_only(tmp_path):
    store = ScraperTaskStore(tmp_path / "scraper_tasks.json")

    done = store.upsert_pending_task(
        source_id="source-c",
        step_id="webview",
        url="https://example.com/completed",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    claimed_done = store.claim_next_task(worker_id="worker-a", lease_seconds=20)
    assert claimed_done is not None
    assert claimed_done["task_id"] == done["task_id"]
    store.complete_task(task_id=done["task_id"], worker_id="worker-a", attempt=1)

    claimed = store.upsert_pending_task(
        source_id="source-b",
        step_id="webview",
        url="https://example.com/claimed",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    store.claim_next_task(worker_id="worker-a", lease_seconds=20)
    pending = store.upsert_pending_task(
        source_id="source-a",
        step_id="webview",
        url="https://example.com/pending",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )

    removed = store.clear_active_tasks()
    removed_ids = {task["task_id"] for task in removed}
    assert pending["task_id"] in removed_ids
    assert claimed["task_id"] in removed_ids
    assert done["task_id"] not in removed_ids

    remaining_ids = {task["task_id"] for task in store.list_tasks()}
    assert done["task_id"] in remaining_ids
    assert pending["task_id"] not in remaining_ids
    assert claimed["task_id"] not in remaining_ids


def test_clear_active_tasks_can_filter_by_source(tmp_path):
    store = ScraperTaskStore(tmp_path / "scraper_tasks.json")
    source_a = store.upsert_pending_task(
        source_id="source-a",
        step_id="webview",
        url="https://example.com/a",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    source_b = store.upsert_pending_task(
        source_id="source-b",
        step_id="webview",
        url="https://example.com/b",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )

    removed = store.clear_active_tasks(source_id="source-a")
    assert [task["task_id"] for task in removed] == [source_a["task_id"]]

    remaining_ids = {task["task_id"] for task in store.list_tasks()}
    assert source_b["task_id"] in remaining_ids
    assert source_a["task_id"] not in remaining_ids


def test_list_active_tasks_only_returns_active_statuses_in_created_order(tmp_path):
    now = {"value": 5000.0}
    store = ScraperTaskStore(
        tmp_path / "scraper_tasks.json",
        now_fn=lambda: now["value"],
    )

    now["value"] = 5000.0
    first = store.upsert_pending_task(
        source_id="source-1",
        step_id="webview",
        url="https://example.com/1",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    now["value"] = 5001.0
    second = store.upsert_pending_task(
        source_id="source-2",
        step_id="webview",
        url="https://example.com/2",
        script="",
        intercept_api="",
        secret_key="webview_data",
    )
    store.claim_next_task(worker_id="worker-a", lease_seconds=20)
    store.complete_task(task_id=first["task_id"], worker_id="worker-a", attempt=1)

    active = store.list_active_tasks()
    assert [task["task_id"] for task in active] == [second["task_id"]]
