import type { DataResponse, SourceSummary } from "../types/config";

export type SourceUpdateTrigger =
    | "bootstrap"
    | "polling"
    | "websocket"
    | "manual"
    | "view_change";

type SourcesWithData = {
    sources: SourceSummary[];
    dataMap: Record<string, DataResponse>;
};

type SnapshotUpdater = (prev: SourcesWithData) => SourcesWithData;

type QueueTask = {
    sourceId: string;
    enqueueSeq: number;
    priorityTier: number;
    priorityOrder: number;
    manualBoost: boolean;
    trigger: SourceUpdateTrigger;
};

type SourceRuntimeState = {
    inFlight: boolean;
    needsRefetch: boolean;
    manualBoostPending: boolean;
    activeRequestId: number;
    lastSubmitAt: number;
    trailingTimer: number | null;
    trailingPending: boolean;
    trailingForce: boolean;
    trailingManualBoost: boolean;
    trailingTrigger: SourceUpdateTrigger;
};

type PriorityContext = {
    activeDashboardSourceIds: string[];
    otherDashboardSourceIds: string[];
};

type SourceUpdateCoordinatorOptions = {
    maxConcurrency?: number;
    pollIntervalMs?: number;
    detailThrottleMs?: number;
    fetchSources: () => Promise<SourceSummary[]>;
    fetchSourceData: (sourceId: string) => Promise<DataResponse | null>;
    getSnapshot: () => SourcesWithData;
    updateSnapshot: (updater: SnapshotUpdater) => void;
    onError?: (error: unknown, context: string) => void;
};

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_DETAIL_THROTTLE_MS = 800;

function byPriority(a: QueueTask, b: QueueTask): number {
    if (a.manualBoost !== b.manualBoost) {
        return a.manualBoost ? -1 : 1;
    }
    if (a.priorityTier !== b.priorityTier) {
        return a.priorityTier - b.priorityTier;
    }
    if (a.priorityOrder !== b.priorityOrder) {
        return a.priorityOrder - b.priorityOrder;
    }
    return a.enqueueSeq - b.enqueueSeq;
}

function toNumericTimestamp(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasOwn(value: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function normalizeOptionalInteraction(
    value: unknown,
): SourceSummary["interaction"] | undefined {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as SourceSummary["interaction"];
    }
    return undefined;
}

export class SourceUpdateCoordinator {
    private readonly maxConcurrency: number;

    private readonly pollIntervalMs: number;

    private readonly fetchSources: () => Promise<SourceSummary[]>;

    private readonly fetchSourceData: (sourceId: string) => Promise<DataResponse | null>;

    private readonly getSnapshot: () => SourcesWithData;

    private readonly updateSnapshot: (updater: SnapshotUpdater) => void;

    private readonly detailThrottleMs: number;

    private readonly onError?: (error: unknown, context: string) => void;

    private readonly sourceRuntime = new Map<string, SourceRuntimeState>();

    private readonly queue = new Map<string, QueueTask>();

    private readonly summaryById = new Map<string, SourceSummary>();

    private priorityContext: PriorityContext = {
        activeDashboardSourceIds: [],
        otherDashboardSourceIds: [],
    };

    private running = false;

    private inFlightCount = 0;

    private nextEnqueueSeq = 1;

    private nextRequestId = 1;

    private pollTimer: number | null = null;

    constructor(options: SourceUpdateCoordinatorOptions) {
        this.maxConcurrency = Math.max(
            1,
            options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
        );
        this.pollIntervalMs = Math.max(
            1000,
            options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
        );
        this.detailThrottleMs = Math.max(
            0,
            options.detailThrottleMs ?? DEFAULT_DETAIL_THROTTLE_MS,
        );
        this.fetchSources = options.fetchSources;
        this.fetchSourceData = options.fetchSourceData;
        this.getSnapshot = options.getSnapshot;
        this.updateSnapshot = options.updateSnapshot;
        this.onError = options.onError;
    }

    start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        void this.pollNow({ trigger: "bootstrap", forceAll: true });
        this.pollTimer = window.setInterval(() => {
            void this.pollNow({ trigger: "polling", forceAll: false });
        }, this.pollIntervalMs);
    }

    stop(): void {
        this.running = false;
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        for (const runtime of this.sourceRuntime.values()) {
            this.resetTrailingState(runtime, { clearTimer: true });
        }
        this.queue.clear();
    }

    async pollNow(options: {
        trigger: SourceUpdateTrigger;
        forceAll: boolean;
    }): Promise<void> {
        try {
            const latestSources = await this.fetchSources();
            const changedIds = this.applySourcesSnapshot(latestSources, options.forceAll);
            if (changedIds.length > 0) {
                this.submitSources(changedIds, options.trigger, {
                    force: options.forceAll,
                });
            }
        } catch (error) {
            this.handleError(error, "poll_sources_failed");
        }
    }

    setPriorityContext(context: PriorityContext): void {
        this.priorityContext = {
            activeDashboardSourceIds: [...context.activeDashboardSourceIds],
            otherDashboardSourceIds: [...context.otherDashboardSourceIds],
        };

        for (const task of this.queue.values()) {
            const priority = this.resolvePriority(task.sourceId);
            task.priorityTier = priority.priorityTier;
            task.priorityOrder = priority.priorityOrder;
        }
        this.pumpQueue();
    }

    submitSources(
        sourceIds: string[],
        trigger: SourceUpdateTrigger,
        options?: {
            force?: boolean;
            manualBoost?: boolean;
            bypassThrottle?: boolean;
        },
    ): void {
        const uniqueIds = Array.from(new Set(sourceIds));
        if (uniqueIds.length === 0) {
            return;
        }

        const force = options?.force === true;
        const manualBoost = options?.manualBoost === true || trigger === "manual";
        const bypassThrottle = options?.bypassThrottle === true;
        for (const sourceId of uniqueIds) {
            if (!force && !this.needsFetch(sourceId)) {
                continue;
            }

            const state = this.getOrCreateRuntimeState(sourceId);
            if (state.inFlight) {
                state.needsRefetch = true;
                state.manualBoostPending = state.manualBoostPending || manualBoost;
                continue;
            }

            if (
                !bypassThrottle &&
                !manualBoost &&
                this.shouldThrottle(state)
            ) {
                this.scheduleTrailingSubmit(
                    sourceId,
                    state,
                    trigger,
                    force,
                    manualBoost,
                );
                continue;
            }

            this.resetTrailingState(state, { clearTimer: true });
            this.enqueueTask(sourceId, trigger, manualBoost);
        }

        this.pumpQueue();
    }

    handleWebSocketEvent(event: {
        source_id?: string;
        updated_at?: number;
        status?: string | null;
        error_code?: string | null;
    }): void {
        if (!event.source_id) {
            return;
        }
        const hasEventErrorCode = hasOwn(event, "error_code");
        const nextStatus = normalizeOptionalString(event.status);
        this.updateSnapshot((prev) => {
            const nextSources = prev.sources.map((source) => {
                if (source.id !== event.source_id) {
                    return source;
                }
                const resolvedStatus = (nextStatus as SourceSummary["status"]) ?? source.status;
                let nextErrorCode: string | undefined = source.error_code;
                if (hasEventErrorCode) {
                    nextErrorCode = normalizeOptionalString(event.error_code);
                } else if (resolvedStatus !== "error" && resolvedStatus !== "suspended") {
                    nextErrorCode = undefined;
                }
                return {
                    ...source,
                    status: resolvedStatus,
                    error_code: nextErrorCode,
                };
            });
            return { sources: nextSources, dataMap: prev.dataMap };
        });

        const current = this.summaryById.get(event.source_id);
        if (current) {
            const resolvedStatus = (nextStatus as SourceSummary["status"]) ?? current.status;
            let nextErrorCode: string | undefined = current.error_code;
            if (hasEventErrorCode) {
                nextErrorCode = normalizeOptionalString(event.error_code);
            } else if (resolvedStatus !== "error" && resolvedStatus !== "suspended") {
                nextErrorCode = undefined;
            }
            this.summaryById.set(event.source_id, {
                ...current,
                status: resolvedStatus,
                error_code: nextErrorCode,
            });
        }

        this.submitSources([event.source_id], "websocket", { force: true });
    }

    private applySourcesSnapshot(
        latestSources: SourceSummary[],
        forceAll: boolean,
    ): string[] {
        const previousById = new Map<string, SourceSummary>();
        for (const source of this.getSnapshot().sources) {
            previousById.set(source.id, source);
        }

        const nextById = new Map<string, SourceSummary>();
        const changedIds: string[] = [];
        for (const source of latestSources) {
            nextById.set(source.id, source);
            this.summaryById.set(source.id, source);
            const previous = previousById.get(source.id);
            const changed =
                !previous ||
                forceAll ||
                previous.updated_at !== source.updated_at ||
                previous.status !== source.status ||
                previous.error_code !== source.error_code;
            if (changed) {
                changedIds.push(source.id);
            }
        }

        for (const previous of previousById.values()) {
            if (!nextById.has(previous.id)) {
                this.summaryById.delete(previous.id);
                this.queue.delete(previous.id);
                const runtime = this.sourceRuntime.get(previous.id);
                if (runtime) {
                    this.resetTrailingState(runtime, { clearTimer: true });
                    this.sourceRuntime.delete(previous.id);
                }
            }
        }

        this.updateSnapshot((prev) => {
            const allowedIds = new Set(latestSources.map((source) => source.id));
            const nextDataMap: Record<string, DataResponse> = {};
            for (const [sourceId, value] of Object.entries(prev.dataMap)) {
                if (allowedIds.has(sourceId)) {
                    nextDataMap[sourceId] = value;
                }
            }
            return {
                sources: latestSources,
                dataMap: nextDataMap,
            };
        });

        return changedIds;
    }

    private resolvePriority(sourceId: string): {
        priorityTier: number;
        priorityOrder: number;
    } {
        const activeIndex = this.priorityContext.activeDashboardSourceIds.indexOf(
            sourceId,
        );
        if (activeIndex >= 0) {
            return { priorityTier: 1, priorityOrder: activeIndex };
        }
        const otherIndex = this.priorityContext.otherDashboardSourceIds.indexOf(
            sourceId,
        );
        if (otherIndex >= 0) {
            return { priorityTier: 2, priorityOrder: otherIndex };
        }
        return { priorityTier: 3, priorityOrder: Number.MAX_SAFE_INTEGER };
    }

    private getOrCreateRuntimeState(sourceId: string): SourceRuntimeState {
        const existing = this.sourceRuntime.get(sourceId);
        if (existing) {
            return existing;
        }
        const created: SourceRuntimeState = {
            inFlight: false,
            needsRefetch: false,
            manualBoostPending: false,
            activeRequestId: 0,
            lastSubmitAt: 0,
            trailingTimer: null,
            trailingPending: false,
            trailingForce: false,
            trailingManualBoost: false,
            trailingTrigger: "polling",
        };
        this.sourceRuntime.set(sourceId, created);
        return created;
    }

    private shouldThrottle(state: SourceRuntimeState): boolean {
        if (this.detailThrottleMs <= 0 || state.lastSubmitAt <= 0) {
            return false;
        }
        return Date.now() - state.lastSubmitAt < this.detailThrottleMs;
    }

    private enqueueTask(
        sourceId: string,
        trigger: SourceUpdateTrigger,
        manualBoost: boolean,
    ): void {
        const priority = this.resolvePriority(sourceId);
        const existingTask = this.queue.get(sourceId);
        const state = this.getOrCreateRuntimeState(sourceId);
        state.lastSubmitAt = Date.now();
        if (existingTask) {
            existingTask.priorityTier = Math.min(
                existingTask.priorityTier,
                priority.priorityTier,
            );
            existingTask.priorityOrder = Math.min(
                existingTask.priorityOrder,
                priority.priorityOrder,
            );
            existingTask.manualBoost = existingTask.manualBoost || manualBoost;
            return;
        }
        this.queue.set(sourceId, {
            sourceId,
            enqueueSeq: this.nextEnqueueSeq++,
            priorityTier: priority.priorityTier,
            priorityOrder: priority.priorityOrder,
            manualBoost,
            trigger,
        });
    }

    private scheduleTrailingSubmit(
        sourceId: string,
        state: SourceRuntimeState,
        trigger: SourceUpdateTrigger,
        force: boolean,
        manualBoost: boolean,
    ): void {
        state.trailingPending = true;
        state.trailingForce = state.trailingForce || force;
        state.trailingManualBoost = state.trailingManualBoost || manualBoost;
        state.trailingTrigger = trigger;
        if (state.trailingTimer !== null) {
            return;
        }
        const elapsed = Math.max(0, Date.now() - state.lastSubmitAt);
        const waitMs = Math.max(this.detailThrottleMs - elapsed, 0);
        state.trailingTimer = window.setTimeout(() => {
            state.trailingTimer = null;
            if (!this.running || !state.trailingPending) {
                return;
            }
            const trailingForce = state.trailingForce;
            const trailingManualBoost = state.trailingManualBoost;
            const trailingTrigger = state.trailingTrigger;
            this.resetTrailingState(state, { clearTimer: false });
            this.submitSources([sourceId], trailingTrigger, {
                force: trailingForce,
                manualBoost: trailingManualBoost,
                bypassThrottle: true,
            });
        }, waitMs);
    }

    private resetTrailingState(
        state: SourceRuntimeState,
        options: { clearTimer: boolean },
    ): void {
        if (options.clearTimer && state.trailingTimer !== null) {
            window.clearTimeout(state.trailingTimer);
            state.trailingTimer = null;
        }
        state.trailingPending = false;
        state.trailingForce = false;
        state.trailingManualBoost = false;
        state.trailingTrigger = "polling";
    }

    private pumpQueue(): void {
        if (!this.running) {
            return;
        }
        while (this.inFlightCount < this.maxConcurrency && this.queue.size > 0) {
            const tasks = Array.from(this.queue.values()).sort(byPriority);
            const task = tasks[0];
            if (!task) {
                return;
            }
            this.queue.delete(task.sourceId);
            this.startTask(task);
        }
    }

    private startTask(task: QueueTask): void {
        const runtime = this.getOrCreateRuntimeState(task.sourceId);
        runtime.inFlight = true;
        runtime.needsRefetch = false;
        runtime.activeRequestId = this.nextRequestId++;
        this.inFlightCount += 1;

        void this.runTask(task, runtime.activeRequestId);
    }

    private async runTask(task: QueueTask, requestId: number): Promise<void> {
        try {
            const detail = await this.fetchSourceData(task.sourceId);
            if (detail) {
                this.commitDetail(task.sourceId, detail, requestId);
            }
        } catch (error) {
            this.handleError(error, `fetch_source_detail_failed:${task.sourceId}`);
        } finally {
            const runtime = this.getOrCreateRuntimeState(task.sourceId);
            if (runtime.activeRequestId === requestId) {
                runtime.inFlight = false;
                runtime.activeRequestId = 0;
            }
            this.inFlightCount = Math.max(0, this.inFlightCount - 1);

            if (runtime.needsRefetch) {
                const boosted = runtime.manualBoostPending;
                runtime.needsRefetch = false;
                runtime.manualBoostPending = false;
                this.submitSources([task.sourceId], task.trigger, {
                    force: true,
                    manualBoost: boosted,
                });
            } else {
                this.pumpQueue();
            }
        }
    }

    private commitDetail(
        sourceId: string,
        detail: DataResponse,
        requestId: number,
    ): void {
        const runtime = this.getOrCreateRuntimeState(sourceId);
        if (runtime.activeRequestId !== requestId) {
            return;
        }

        const summary = this.summaryById.get(sourceId);
        const detailUpdatedAt = toNumericTimestamp(detail.updated_at);
        const summaryUpdatedAt = toNumericTimestamp(summary?.updated_at);
        if (
            detailUpdatedAt !== null &&
            summaryUpdatedAt !== null &&
            detailUpdatedAt < summaryUpdatedAt
        ) {
            runtime.needsRefetch = true;
            return;
        }

        this.updateSnapshot((prev) => {
            const nextDataMap = {
                ...prev.dataMap,
                [sourceId]: detail,
            };
            const nextSources = prev.sources.map((source) => {
                if (source.id !== sourceId) {
                    return source;
                }
                return this.mergeSummaryWithDetail(source, detail);
            });
            const mergedSummary = nextSources.find((source) => source.id === sourceId);
            if (mergedSummary) {
                this.summaryById.set(sourceId, mergedSummary);
            }
            return {
                sources: nextSources,
                dataMap: nextDataMap,
            };
        });
    }

    private mergeSummaryWithDetail(
        summary: SourceSummary,
        detail: DataResponse,
    ): SourceSummary {
        const detailRecord = detail as unknown as Record<string, unknown>;
        const detailUpdatedAt =
            toNumericTimestamp(detail.updated_at) ?? summary.updated_at ?? undefined;
        const summaryUpdatedAt = toNumericTimestamp(summary.updated_at) ?? 0;
        const shouldWriteBack =
            detailUpdatedAt === undefined ||
            toNumericTimestamp(detailUpdatedAt) === null ||
            detailUpdatedAt >= summaryUpdatedAt;

        if (!shouldWriteBack) {
            return summary;
        }

        const hasMessageField = hasOwn(detailRecord, "message");
        const hasErrorField = hasOwn(detailRecord, "error");
        const hasErrorCodeField = hasOwn(detailRecord, "error_code");
        const hasInteractionField = hasOwn(detailRecord, "interaction");
        const hasDataField = hasOwn(detailRecord, "data");
        const hasLastSuccessAtField = hasOwn(detailRecord, "last_success_at");

        const nextStatus = (
            normalizeOptionalString(detailRecord.status) as SourceSummary["status"]
        ) ?? summary.status;
        const nextMessage = hasMessageField
            ? normalizeOptionalString(detailRecord.message)
            : summary.message;
        let nextError = hasErrorField
            ? normalizeOptionalString(detailRecord.error)
            : summary.error;
        if (!hasErrorField && nextStatus !== "error") {
            nextError = undefined;
        }
        let nextErrorCode = hasErrorCodeField
            ? normalizeOptionalString(detailRecord.error_code)
            : summary.error_code;
        if (!hasErrorCodeField && nextStatus !== "error" && nextStatus !== "suspended") {
            nextErrorCode = undefined;
        }
        let nextInteraction = hasInteractionField
            ? normalizeOptionalInteraction(detailRecord.interaction)
            : summary.interaction;
        if (!hasInteractionField && nextStatus !== "error" && nextStatus !== "suspended") {
            nextInteraction = undefined;
        }
        const nextHasData = hasDataField
            ? detailRecord.data !== null && detailRecord.data !== undefined
            : summary.has_data;

        let nextLastSuccessAt = summary.last_success_at;
        if (hasLastSuccessAtField) {
            const normalizedLastSuccessAt = toNumericTimestamp(
                detailRecord.last_success_at,
            );
            nextLastSuccessAt =
                normalizedLastSuccessAt !== null ? normalizedLastSuccessAt : null;
        } else if (nextHasData) {
            nextLastSuccessAt = detailUpdatedAt ?? summary.last_success_at;
        }

        return {
            ...summary,
            updated_at: detailUpdatedAt,
            status: nextStatus,
            message: nextMessage,
            error: nextError,
            error_code: nextErrorCode,
            error_details:
                nextStatus === "error"
                    ? (nextMessage ?? summary.error_details)
                    : undefined,
            interaction: nextInteraction,
            has_data: nextHasData,
            last_success_at: nextLastSuccessAt,
        };
    }

    private needsFetch(sourceId: string): boolean {
        const summary = this.summaryById.get(sourceId);
        const snapshot = this.getSnapshot();
        const detail = snapshot.dataMap[sourceId];
        if (!summary) {
            return !detail;
        }
        if (!detail) {
            return true;
        }
        const summaryUpdatedAt = toNumericTimestamp(summary.updated_at);
        const detailUpdatedAt = toNumericTimestamp(detail.updated_at);
        if (summaryUpdatedAt === null || detailUpdatedAt === null) {
            return true;
        }
        return detailUpdatedAt < summaryUpdatedAt;
    }

    private handleError(error: unknown, context: string): void {
        if (this.onError) {
            this.onError(error, context);
            return;
        }
        // eslint-disable-next-line no-console
        console.error("[SourceUpdateCoordinator]", context, error);
    }
}
