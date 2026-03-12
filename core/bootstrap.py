"""
Starter bundle bootstrap utilities for first-launch workspace setup.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Callable

import yaml

from core.api import (
    create_stored_source_record,
    create_stored_view_record,
    inject_view_item_props_from_templates,
)
from core.integration_manager import IntegrationManager
from core.models import StoredSource, StoredView
from core.resource_manager import ResourceManager

logger = logging.getLogger(__name__)

STARTER_VIEW_ID = "starter_pack_overview"
STARTER_VIEW_NAME = "Starter Pack Overview"

DEFAULT_EXAMPLES_DIR = Path(__file__).resolve().parent.parent / "config" / "examples"
STARTER_INTEGRATIONS_DIR = "integrations"
STARTER_SOURCES_FILE = "starter_sources.yaml"
STARTER_VIEW_FILE = "starter_view.yaml"


def _resolve_examples_dir(
    integration_manager: IntegrationManager,
    examples_dir: Path | None,
) -> Path:
    if examples_dir is not None:
        return Path(examples_dir)

    config_root = getattr(integration_manager, "config_root", None)
    if config_root:
        configured_examples_dir = Path(config_root) / "examples"
        if configured_examples_dir.is_dir():
            return configured_examples_dir

    return DEFAULT_EXAMPLES_DIR


def _iter_yaml_files(directory: Path) -> list[Path]:
    files: dict[str, Path] = {}
    for pattern in ("*.yaml", "*.yml"):
        for file_path in directory.glob(pattern):
            if file_path.name.startswith("."):
                continue
            files[file_path.name] = file_path
    return [files[name] for name in sorted(files)]


def _read_yaml_mapping(file_path: Path) -> dict[str, Any]:
    payload = yaml.safe_load(file_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{file_path} must contain a YAML mapping")
    return payload


def _load_starter_integration_payloads(examples_dir: Path) -> dict[str, str]:
    integrations_dir = examples_dir / STARTER_INTEGRATIONS_DIR
    if not integrations_dir.is_dir():
        raise ValueError(f"Missing starter integrations directory: {integrations_dir}")

    payloads: dict[str, str] = {}
    for file_path in _iter_yaml_files(integrations_dir):
        payloads[file_path.name] = file_path.read_text(encoding="utf-8")

    if not payloads:
        raise ValueError(f"No starter integration yaml files found under: {integrations_dir}")

    return payloads


def _load_starter_sources(examples_dir: Path) -> list[StoredSource]:
    file_path = examples_dir / STARTER_SOURCES_FILE
    payload = _read_yaml_mapping(file_path)
    raw_sources = payload.get("sources")
    if not isinstance(raw_sources, list):
        raise ValueError(f"{file_path} must define a 'sources' list")

    sources: list[StoredSource] = []
    for raw_source in raw_sources:
        if not isinstance(raw_source, dict):
            raise ValueError(f"Invalid source entry in {file_path}: {raw_source!r}")
        source_payload = dict(raw_source)
        source_payload.setdefault("config", {})
        source_payload.setdefault("vars", {})
        sources.append(StoredSource.model_validate(source_payload))

    if not sources:
        raise ValueError(f"No starter sources found in {file_path}")

    return sources


def _load_starter_view(examples_dir: Path) -> StoredView:
    file_path = examples_dir / STARTER_VIEW_FILE
    payload = _read_yaml_mapping(file_path)
    view = StoredView.model_validate(payload)

    if view.id != STARTER_VIEW_ID:
        logger.warning(
            "Starter view id changed from expected '%s' to '%s'",
            STARTER_VIEW_ID,
            view.id,
        )

    return view


def _workspace_contains_nonstarter_artifacts(
    integration_files: list[str],
    source_ids: set[str],
    view_ids: set[str],
    starter_files: set[str],
    starter_sources: set[str],
    starter_views: set[str],
) -> bool:
    return (
        any(filename not in starter_files for filename in integration_files)
        or any(source_id not in starter_sources for source_id in source_ids)
        or any(view_id not in starter_views for view_id in view_ids)
    )


def _build_template_lookup_from_starter_integrations(
    starter_integrations: dict[str, str],
) -> dict[str, dict[str, dict[str, Any]]]:
    lookup: dict[str, dict[str, dict[str, Any]]] = {}

    for filename, content in starter_integrations.items():
        integration_id = Path(filename).stem
        try:
            payload = yaml.safe_load(content)
        except Exception as exc:
            logger.warning("Failed to parse starter integration %s: %s", filename, exc)
            continue

        if not isinstance(payload, dict):
            continue

        raw_templates = payload.get("templates")
        if not isinstance(raw_templates, list):
            continue

        templates_by_id: dict[str, dict[str, Any]] = {}
        for raw_template in raw_templates:
            if not isinstance(raw_template, dict):
                continue
            template_id = str(raw_template.get("id", "")).strip()
            if not template_id:
                continue
            templates_by_id[template_id] = dict(raw_template)

        if templates_by_id:
            lookup[integration_id] = templates_by_id

    return lookup


def seed_first_launch_workspace(
    integration_manager: IntegrationManager,
    resource_manager: ResourceManager,
    source_creator: Callable[[StoredSource], StoredSource] | None = None,
    view_creator: Callable[[StoredView], StoredView] | None = None,
    examples_dir: Path | None = None,
) -> bool:
    """Seed a starter bundle when workspace is empty or partially starter-only."""
    resolved_examples_dir = _resolve_examples_dir(integration_manager, examples_dir)

    try:
        starter_integrations = _load_starter_integration_payloads(resolved_examples_dir)
        starter_sources = _load_starter_sources(resolved_examples_dir)
        starter_view = _load_starter_view(resolved_examples_dir)
    except Exception as exc:
        logger.warning("Skipping first-launch seeding due to starter payload error: %s", exc)
        return False

    starter_source_by_id = {source.id: source for source in starter_sources}
    starter_template_lookup = _build_template_lookup_from_starter_integrations(starter_integrations)

    hydrated_starter_view = inject_view_item_props_from_templates(
        starter_view,
        source_by_id=starter_source_by_id,
        template_lookup_by_integration=starter_template_lookup,
    )

    if source_creator is None:
        source_creator = lambda source: create_stored_source_record(
            source,
            resource_manager,
        )
    if view_creator is None:
        view_creator = lambda view: create_stored_view_record(
            view,
            resource_manager,
            source_by_id=starter_source_by_id,
            template_lookup_by_integration=starter_template_lookup,
        )

    try:
        integration_files = integration_manager.list_integration_files()
        existing_sources = resource_manager.load_sources()
        existing_views = resource_manager.load_views()
    except Exception as exc:
        logger.warning("Skipping first-launch seeding due to state inspection error: %s", exc)
        return False

    existing_source_ids = {source.id for source in existing_sources}
    existing_view_ids = {view.id for view in existing_views}
    starter_files = set(starter_integrations.keys())
    starter_source_ids = {source.id for source in starter_sources}
    starter_view_ids = {starter_view.id}

    if _workspace_contains_nonstarter_artifacts(
        integration_files,
        existing_source_ids,
        existing_view_ids,
        starter_files,
        starter_source_ids,
        starter_view_ids,
    ):
        return False

    for filename, content in starter_integrations.items():
        created = integration_manager.create_integration(filename, content)
        if not created:
            logger.warning(
                "First-launch seeding aborted: failed to create starter integration %s.",
                filename,
            )
            return False

    for starter_source in starter_sources:
        source_creator(starter_source)

    view_creator(hydrated_starter_view)

    logger.info(
        "Seeded first-launch starter bundle with %d starter sources.",
        len(starter_sources),
    )
    return True
