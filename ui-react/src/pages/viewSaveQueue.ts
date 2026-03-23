import type { StoredView } from "../types/config";

type PersistViewFn = (view: StoredView) => Promise<void>;

interface ViewSaveQueueOptions {
    onError?: (error: unknown) => void;
    onDrained?: () => void | Promise<void>;
}

interface ViewSaveQueue {
    enqueue: (view: StoredView) => void;
}

/**
 * Serializes view saves so rapid updates cannot race and overwrite newer layouts.
 * While one save is in flight, only the latest pending view snapshot is kept.
 */
export function createViewSaveQueue(
    persistView: PersistViewFn,
    options: ViewSaveQueueOptions = {},
): ViewSaveQueue {
    let pending: StoredView | null = null;
    let running = false;

    const run = async (): Promise<void> => {
        if (running) {
            return;
        }

        running = true;
        try {
            while (pending) {
                const nextView = pending;
                pending = null;
                try {
                    await persistView(nextView);
                } catch (error) {
                    options.onError?.(error);
                }
            }
        } finally {
            try {
                await options.onDrained?.();
            } catch (error) {
                options.onError?.(error);
            } finally {
                running = false;
                if (pending) {
                    void run();
                }
            }
        }
    };

    return {
        enqueue(view: StoredView) {
            pending = view;
            void run();
        },
    };
}
