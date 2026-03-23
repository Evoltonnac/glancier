import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoredView } from "../../types/config";
import { DashboardSwiper } from "./DashboardSwiper";

function makeViews(count: number): StoredView[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `view-${index + 1}`,
        name: `View ${index + 1}`,
        layout_columns: 12,
        items: [],
    }));
}

describe("DashboardSwiper", () => {
    it("applies every rapid arrow-right press to the next dashboard", async () => {
        const views = makeViews(4);
        const onViewChange = vi.fn();

        render(
            <DashboardSwiper
                views={views}
                activeViewId="view-1"
                onViewChange={onViewChange}
            >
                {(view) => <div>{view.name}</div>}
            </DashboardSwiper>,
        );

        screen.getByRole("region", { name: "Dashboard swiper" });
        await waitFor(() =>
            expect(screen.getAllByRole("tab").length).toBe(views.length),
        );
        fireEvent.keyDown(window, { key: "ArrowRight" });
        fireEvent.keyDown(window, { key: "ArrowRight" });
        fireEvent.keyDown(window, { key: "ArrowRight" });

        await waitFor(() =>
            expect(onViewChange.mock.calls.map(([viewId]) => viewId)).toEqual([
                "view-2",
                "view-3",
                "view-4",
            ]),
        );
    });

    it("allows immediate reverse direction without duplicate bounce callbacks", async () => {
        const views = makeViews(3);
        const onViewChange = vi.fn();

        render(
            <DashboardSwiper
                views={views}
                activeViewId="view-1"
                onViewChange={onViewChange}
            >
                {(view) => <div>{view.name}</div>}
            </DashboardSwiper>,
        );

        screen.getByRole("region", { name: "Dashboard swiper" });
        await waitFor(() =>
            expect(screen.getAllByRole("tab").length).toBe(views.length),
        );
        fireEvent.keyDown(window, { key: "ArrowRight" });
        fireEvent.keyDown(window, { key: "ArrowLeft" });

        await waitFor(() =>
            expect(onViewChange.mock.calls.map(([viewId]) => viewId)).toEqual([
                "view-2",
                "view-1",
            ]),
        );
    });
});
