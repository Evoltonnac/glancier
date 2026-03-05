# Glancier Terminology Dictionary

This document defines the core terminology for **Glancier** (formerly Quota Board). It serves as the semantic foundation for the project's transition to a universal **Personal Data Aggregator & Hub**.

## Core Identity

| Term | Definition |
|------|------------|
| **Glancier** | The product name. Represents the "at-a-glance" nature of the data dashboard. |
| **Personal Data Aggregator & Hub** | The project's positioning. A system that fetches, processes, and visualizes arbitrary data from APIs and web sources. |

## Data & Logic Concepts

The term "Quota" is deprecated as a generic catch-all. Use the following context-specific terms:

| Old Term | New Term | Usage |
|----------|----------|-------|
| Quota | **Metric** | Numeric data points with a value and optionally a unit/capacity (e.g., "Usage Metric", "Storage Metric"). |
| Quota | **Signal** | Boolean, status, or state data (e.g., "Service Status", "Deployment Signal", "Build Success"). |
| Quota | **Integration Data** | The generic term for any information fetched from a source via a Flow. |
| Quota Board | **Glancier** | Use when referring to the overall system or application. |

## UI & Visualization Concepts

The interface follows a **Bento Grid** philosophy, where data is organized into clean, modular tiles.

| Old Term | New Term | Usage |
|----------|----------|-------|
| Quota Bar | **Progress Bar** / **Metric Bar** | A visual component representing a value relative to a capacity or percentage. |
| Quota Card | **Base Source Card** / **Bento Card** | The container tile that groups related Metrics and Signals from a single source. |

## Technical & Environment Constants

| Old Constant | New Constant | Description |
|--------------|--------------|-------------|
| `QUOTA_BOARD_ROOT` | `GLANCIER_DATA_DIR` | The environment variable or configuration key defining the root directory for data and config. |

## Transition Strategy

- **Documentation:** All new documentation must use the **New Terms**. Existing documentation is being scrubbed in Phase 09.
- **Configuration:** Legacy identifiers (e.g., `type: quota_bar`) in YAML files are **deprecated**. New configurations should use the updated types (e.g., `type: progress_bar`), though backward compatibility is maintained during the v1.0 transition.
- **Codebase:** Variables, classes, and file names will be updated in Phase 10 to align with this dictionary.
