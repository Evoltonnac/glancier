import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import { cn } from "../../lib/utils";
import type { StoredView } from "../../types/config";

interface DashboardSwiperProps {
  views: StoredView[];
  activeViewId: string | null;
  onViewChange: (viewId: string) => void;
  children: (view: StoredView) => React.ReactNode;
  className?: string;
}

const GAP_PX = 16; // gap-4 = 1rem = 16px

export function DashboardSwiper({
  views,
  activeViewId,
  onViewChange,
  children,
  className,
}: DashboardSwiperProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to the active view on mount or when activeViewId changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container || views.length === 0) return;

    const targetIndex = views.findIndex((v) => v.id === activeViewId);
    if (targetIndex < 0) return;

    // Calculate the scroll position needed to center the target slide
    const itemWidth = container.offsetWidth + GAP_PX;
    container.scrollTo({
      left: targetIndex * itemWidth,
      behavior: 'smooth',
    });
    setCurrentIndex(targetIndex);
  }, [activeViewId, views]);

  // Track scroll position to update currentIndex
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const itemWidth = container.offsetWidth + GAP_PX;
      const index = Math.round(scrollLeft / itemWidth);
      setCurrentIndex(index);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard navigation for accessibility
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (currentIndex > 0) {
        scrollToIndex(currentIndex - 1);
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentIndex < views.length - 1) {
        scrollToIndex(currentIndex + 1);
      }
    }
  };

  const scrollToIndex = (index: number) => {
    const container = containerRef.current;
    if (!container) return;
    const itemWidth = container.offsetWidth + GAP_PX;
    container.scrollTo({
      left: index * itemWidth,
      behavior: 'smooth',
    });
    setCurrentIndex(index);
    onViewChange(views[index].id);
  };

  if (views.length === 0) {
    return null;
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Scrollable swiper container */}
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="region"
        aria-label="Dashboard swiper"
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth"
        style={{
          // Hide scrollbar but keep functionality
          scrollbarWidth: 'none' as const,
          msOverflowStyle: 'none' as const,
        }}
      >
        <style>{`
          .dashboard-swiper::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {views.map((view, index) => (
          <div
            key={view.id}
            className="snap-center shrink-0 w-full"
            style={{ marginRight: index < views.length - 1 ? `${GAP_PX}px` : 0 }}
          >
            {children(view)}
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      {views.length > 1 && (
        <div className="flex justify-center gap-2 py-3" role="tablist" aria-label="Dashboard navigation">
          {views.map((view, index) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={currentIndex === index}
              aria-label={`Go to dashboard ${index + 1}: ${view.name}`}
              onClick={() => scrollToIndex(index)}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-200',
                currentIndex === index
                  ? 'bg-brand scale-125'
                  : 'bg-muted-foreground/30 hover:bg-muted-foreground/50',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
