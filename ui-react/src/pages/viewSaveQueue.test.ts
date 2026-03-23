import { describe, expect, it, vi } from "vitest";
import type { StoredView } from "../types/config";
import { createViewSaveQueue } from "./viewSaveQueue";

function createView(id: string): StoredView {
    return {
        id: "view-1",
        name: "Main",
        layout_columns: 12,
        items: [
            {
                id: `widget-${id}`,
                x: 0,
                y: 0,
                w: 3,
                h: 4,
                source_id: "source-1",
                template_id: "template-1",
                props: {},
            },
        ],
    };
}

async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("createViewSaveQueue", () => {
    it("serializes saves and keeps only the latest pending view snapshot", async () => {
        const pendingResolves: Array<() => void> = [];
        let inflight = 0;
        let maxInflight = 0;

        const persistView = vi.fn((view: StoredView) => {
            expect(view.id).toBe("view-1");
            inflight += 1;
            maxInflight = Math.max(maxInflight, inflight);
            return new Promise<void>((resolve) => {
                pendingResolves.push(() => {
                    inflight -= 1;
                    resolve();
                });
            });
        });

        const queue = createViewSaveQueue(persistView);
        const first = createView("a");
        const second = createView("b");
        const third = createView("c");

        queue.enqueue(first);
        queue.enqueue(second);
        queue.enqueue(third);

        expect(persistView).toHaveBeenCalledTimes(1);
        expect(persistView).toHaveBeenNthCalledWith(1, first);
        expect(maxInflight).toBe(1);

        pendingResolves[0]();
        await flushMicrotasks();

        expect(persistView).toHaveBeenCalledTimes(2);
        expect(persistView).toHaveBeenNthCalledWith(2, third);
        expect(maxInflight).toBe(1);

        pendingResolves[1]();
        await flushMicrotasks();

        expect(persistView).toHaveBeenCalledTimes(2);
    });

    it("continues processing latest pending update after a failed save", async () => {
        const onError = vi.fn();
        let firstReject!: (error?: unknown) => void;
        let secondResolve!: () => void;

        const persistView = vi
            .fn<(view: StoredView) => Promise<void>>()
            .mockImplementationOnce(
                () =>
                    new Promise<void>((_resolve, reject) => {
                        firstReject = reject;
                    }),
            )
            .mockImplementationOnce(
                () =>
                    new Promise<void>((resolve) => {
                        secondResolve = resolve;
                    }),
            );

        const queue = createViewSaveQueue(persistView, { onError });
        const first = createView("first");
        const latest = createView("latest");

        queue.enqueue(first);
        queue.enqueue(latest);

        expect(persistView).toHaveBeenCalledTimes(1);
        firstReject(new Error("network"));
        await flushMicrotasks();

        expect(onError).toHaveBeenCalledTimes(1);
        expect(persistView).toHaveBeenCalledTimes(2);
        expect(persistView).toHaveBeenNthCalledWith(2, latest);

        secondResolve();
        await flushMicrotasks();
    });
});
