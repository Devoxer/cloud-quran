import { RecyclerViewManager } from '@shopify/flash-list/dist/recyclerview/RecyclerViewManager';

describe('mushaf initial layout extent', () => {
  it.each([
    44, 559,
  ])('keeps the requested page reachable at initial index %i after measuring', (index) => {
    const width = 412;
    const height = 874;
    const manager = new RecyclerViewManager({
      data: Array.from({ length: 604 }, (_, i) => i),
      horizontal: true,
      initialScrollIndex: index,
      renderItem: () => null,
    });
    try {
      manager.updateLayoutParams({ width, height }, 0);
      manager.processDataUpdate();
      // Only the opening pages are measured on a cold launch; the tail remains virtualized.
      manager.modifyChildrenLayout(
        [index, index + 1].map((i) => ({ index: i, dimensions: { width, height } })),
        604
      );
      expect(manager.getLayout(index).x).toBe(index * width);
      expect(manager.getChildContainerDimensions().width).toBe(604 * width);
      expect(manager.getMaxScrollOffset()).toBeGreaterThanOrEqual(index * width);
    } finally {
      manager.dispose();
    }
  });
});
