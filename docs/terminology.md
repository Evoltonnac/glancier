# Glancier Terminology Dictionary

This document defines the core terminology for **Glancier**.

## Core Identity

| Term | Definition |
|------|------------|
| **Glancier** | The product name. Represents the "at-a-glance" nature of the data dashboard. |
| **Personal Data Aggregator & Hub** | The project's positioning. A system that fetches, processes, and visualizes arbitrary data from APIs and web sources. |

## Data & Logic Concepts

| Term | Usage |
|------|-------|
| **Metric** | Numeric data points with a value and optionally a unit/capacity (e.g., "Usage Metric", "Storage Metric"). |
| **Signal** | Boolean, status, or state data (e.g., "Service Status", "Deployment Signal", "Build Success"). |
| **Integration Data** | Generic term for information fetched from a source via a Flow. |

## UI & Visualization Concepts

The interface follows a **Bento Grid** philosophy, where data is organized into clean, modular tiles.

| Term | Usage |
|------|-------|
| **Progress Bar** / **Metric Bar** | A visual component representing a value relative to a capacity or percentage. |
| **Base Source Card** / **Bento Card** | The container tile that groups related Metrics and Signals from a single source. |

## Technical & Environment Constants

| Constant | Description |
|----------|-------------|
| `GLANCIER_DATA_DIR` | The environment variable defining the root directory for data and config. |

## Usage Rule

- Documentation, code comments, UI labels, and config examples must use this dictionary as the single source of truth.
