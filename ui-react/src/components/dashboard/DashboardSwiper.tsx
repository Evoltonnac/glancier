import { useCallback, useEffect, useRef, useState } from "react";
import type { Swiper as SwiperInstance } from "swiper/types";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";

import { cn } from "../../lib/utils";
import type { StoredView } from "../../types/config";

interface DashboardSwiperProps {
    views: StoredView[];
    activeViewId: string | null;
    onViewChange: (viewId: string) => void;
    children: (view: StoredView) => React.ReactNode;
    className?: string;
}

const GAP_PX = 16;
const SWIPE_SPEED_MS = 280;
const SWIPE_INTERRUPT_SPEED_MS = 200;
const MOBILE_INPUT_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false;
    }
    const tag = target.tagName;
    return (
        target.isContentEditable ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT"
    );
}

export function DashboardSwiper({
    views,
    activeViewId,
    onViewChange,
    children,
    className,
}: DashboardSwiperProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isMobileInput, setIsMobileInput] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        return window.matchMedia(MOBILE_INPUT_MEDIA_QUERY).matches;
    });
    const swiperRef = useRef<SwiperInstance | null>(null);
    const targetIndexRef = useRef(0);
    const lastEmittedViewIdRef = useRef<string | null>(null);

    const clampIndex = useCallback(
        (index: number) => Math.max(0, Math.min(views.length - 1, index)),
        [views.length],
    );

    const findIndexByViewId = useCallback(
        (viewId: string | null) => {
            if (!viewId) {
                return 0;
            }
            const index = views.findIndex((view) => view.id === viewId);
            return index >= 0 ? index : 0;
        },
        [views],
    );

    const emitViewChange = useCallback(
        (index: number) => {
            const nextView = views[index];
            if (!nextView || nextView.id === lastEmittedViewIdRef.current) {
                return;
            }
            lastEmittedViewIdRef.current = nextView.id;
            onViewChange(nextView.id);
        },
        [onViewChange, views],
    );

    const slideToTarget = useCallback(
        (nextIndex: number, speed: number) => {
            const swiper = swiperRef.current;
            if (!swiper || views.length === 0) {
                return;
            }
            const clampedIndex = clampIndex(nextIndex);
            targetIndexRef.current = clampedIndex;
            if (swiper.activeIndex === clampedIndex && !swiper.animating) {
                setCurrentIndex(clampedIndex);
                return;
            }
            swiper.slideTo(clampedIndex, speed, true);
        },
        [clampIndex, views.length],
    );

    const navigateBy = useCallback(
        (delta: -1 | 1) => {
            const swiper = swiperRef.current;
            if (!swiper) {
                return;
            }
            const baseIndex = targetIndexRef.current;
            const nextIndex = clampIndex(baseIndex + delta);
            if (nextIndex === baseIndex) {
                return;
            }
            const speed = swiper.animating
                ? SWIPE_INTERRUPT_SPEED_MS
                : SWIPE_SPEED_MS;
            slideToTarget(nextIndex, speed);
        },
        [clampIndex, slideToTarget],
    );

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }
        const mediaQuery = window.matchMedia(MOBILE_INPUT_MEDIA_QUERY);
        const handleMediaQueryChange = () => {
            setIsMobileInput(mediaQuery.matches);
        };
        handleMediaQueryChange();
        mediaQuery.addEventListener("change", handleMediaQueryChange);
        return () => {
            mediaQuery.removeEventListener("change", handleMediaQueryChange);
        };
    }, []);

    useEffect(() => {
        if (views.length === 0) {
            return;
        }
        const targetIndex = clampIndex(findIndexByViewId(activeViewId));
        const targetViewId = views[targetIndex]?.id ?? null;
        targetIndexRef.current = targetIndex;
        setCurrentIndex(targetIndex);
        lastEmittedViewIdRef.current = targetViewId;

        const swiper = swiperRef.current;
        if (!swiper) {
            return;
        }
        if (swiper.activeIndex !== targetIndex) {
            swiper.slideTo(targetIndex, 0, false);
        }
    }, [activeViewId, clampIndex, findIndexByViewId, views]);

    useEffect(() => {
        const handleWindowKeydown = (event: KeyboardEvent) => {
            if (views.length <= 1) {
                return;
            }
            if (event.defaultPrevented) {
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }
            if (isTypingTarget(event.target)) {
                return;
            }

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                navigateBy(-1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                navigateBy(1);
            }
        };

        window.addEventListener("keydown", handleWindowKeydown);
        return () => {
            window.removeEventListener("keydown", handleWindowKeydown);
        };
    }, [navigateBy, views.length]);

    if (views.length === 0) {
        return null;
    }

    return (
        <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
            <div
                role="region"
                aria-label="Dashboard swiper"
                className="min-h-0 flex-1"
            >
                <Swiper
                    spaceBetween={GAP_PX}
                    slidesPerView={1}
                    speed={SWIPE_SPEED_MS}
                    resistanceRatio={0.35}
                    allowTouchMove={views.length > 1 && isMobileInput}
                    simulateTouch={isMobileInput}
                    className="h-full"
                    onSwiper={(instance) => {
                        swiperRef.current = instance;
                        const startIndex = clampIndex(
                            findIndexByViewId(activeViewId),
                        );
                        targetIndexRef.current = startIndex;
                        setCurrentIndex(startIndex);
                        lastEmittedViewIdRef.current =
                            views[startIndex]?.id ?? null;
                        if (instance.activeIndex !== startIndex) {
                            instance.slideTo(startIndex, 0, false);
                        }
                    }}
                    onSlideChange={(instance) => {
                        const nextIndex = clampIndex(instance.activeIndex);
                        targetIndexRef.current = nextIndex;
                        setCurrentIndex(nextIndex);
                        emitViewChange(nextIndex);
                    }}
                >
                    {views.map((view) => (
                        <SwiperSlide key={view.id} className="min-h-0 h-full">
                            {children(view)}
                        </SwiperSlide>
                    ))}
                </Swiper>
            </div>

            {views.length > 1 && (
                <div
                    className="flex justify-center gap-2 py-3"
                    role="tablist"
                    aria-label="Dashboard navigation"
                >
                    {views.map((view, index) => (
                        <button
                            key={view.id}
                            type="button"
                            role="tab"
                            aria-selected={currentIndex === index}
                            aria-label={`Go to dashboard ${index + 1}: ${view.name}`}
                            onClick={() => {
                                const swiper = swiperRef.current;
                                const speed = swiper?.animating
                                    ? SWIPE_INTERRUPT_SPEED_MS
                                    : SWIPE_SPEED_MS;
                                slideToTarget(index, speed);
                            }}
                            className={cn(
                                "h-2 w-2 rounded-full transition-all duration-200",
                                currentIndex === index
                                    ? "scale-125 bg-brand"
                                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50",
                            )}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
