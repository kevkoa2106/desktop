import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import {
  useWindowDrag,
  resetWindowDragTimeForTests,
  NATIVE_WINDOW_DRAG_CLASS,
} from "./useWindowDrag";

function DragTestComponent(props: { topAreaHeight?: number; dragThreshold?: number }) {
  useWindowDrag(props);
  return (
    <div id="root-test">
      <div id="empty-drag-area" style={{ height: 32 }} />
      <button id="test-button">Click Me</button>
      <div id="below-area" style={{ height: 200 }} />
    </div>
  );
}

describe("useWindowDrag", () => {
  let container: HTMLDivElement;
  let root: Root;
  let mockDragStart: ReturnType<typeof vi.fn>;
  let mockDragMove: ReturnType<typeof vi.fn>;
  let mockDragEnd: ReturnType<typeof vi.fn>;
  let mockToggleMaximize: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    resetWindowDragTimeForTests();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockDragStart = vi.fn();
    mockDragMove = vi.fn();
    mockDragEnd = vi.fn();
    mockToggleMaximize = vi.fn();

    (window as any).linerElectron = {
      platform: "darwin",
      dragStart: mockDragStart,
      dragMove: mockDragMove,
      dragEnd: mockDragEnd,
      toggleMaximize: mockToggleMaximize,
    };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    delete (window as any).linerElectron;
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  it("does not drag on single click inside the top drag area", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
    });

    const emptyArea = document.getElementById("empty-drag-area")!;

    const pointerDown = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 10,
      screenX: 100,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    emptyArea.dispatchEvent(pointerDown);

    const pointerUp = new PointerEvent("pointerup", {
      button: 0,
      clientX: 50,
      clientY: 10,
      screenX: 100,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(pointerUp);

    expect(mockDragMove).not.toHaveBeenCalled();
  });

  it("does not drag on button or interactive elements", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
    });

    const button = document.getElementById("test-button")!;

    const pointerDown = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 10,
      screenX: 100,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    button.dispatchEvent(pointerDown);

    const pointerMove = new PointerEvent("pointermove", {
      button: 0,
      clientX: 80,
      clientY: 30,
      screenX: 130,
      screenY: 120,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(pointerMove);

    expect(mockDragMove).not.toHaveBeenCalled();
  });

  it("triggers drag when movement exceeds drag threshold in drag region", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
    });

    const emptyArea = document.getElementById("empty-drag-area")!;

    const pointerDown = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 10,
      screenX: 100,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    emptyArea.dispatchEvent(pointerDown);

    // Movement less than threshold (e.g. 2px)
    const smallMove = new PointerEvent("pointermove", {
      button: 0,
      clientX: 52,
      clientY: 10,
      screenX: 102,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(smallMove);
    expect(mockDragMove).not.toHaveBeenCalled();

    // Movement exceeding threshold (e.g. 10px total from start)
    const largeMove = new PointerEvent("pointermove", {
      button: 0,
      clientX: 60,
      clientY: 15,
      screenX: 110,
      screenY: 105,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(largeMove);

    expect(mockDragMove).toHaveBeenCalledWith(10, 5);
  });

  it("does not drag when pointerdown is outside top area without data-window-drag", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
    });

    const belowArea = document.getElementById("below-area")!;

    const pointerDown = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 100, // Below 32px
      screenX: 100,
      screenY: 200,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    belowArea.dispatchEvent(pointerDown);

    const pointerMove = new PointerEvent("pointermove", {
      button: 0,
      clientX: 80,
      clientY: 150,
      screenX: 130,
      screenY: 250,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(pointerMove);

    expect(mockDragMove).not.toHaveBeenCalled();
  });

  it("toggles maximize on double click on non-interactive area", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} />);
    });

    const emptyArea = document.getElementById("empty-drag-area")!;

    const dblClick = new MouseEvent("dblclick", {
      button: 0,
      clientX: 50,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    emptyArea.dispatchEvent(dblClick);

    expect(mockToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("does not toggle maximize on double click on button", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} />);
    });

    const button = document.getElementById("test-button")!;

    const dblClick = new MouseEvent("dblclick", {
      button: 0,
      clientX: 50,
      clientY: 10,
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(dblClick);

    expect(mockToggleMaximize).not.toHaveBeenCalled();
  });

  it("does not toggle maximize on double click after dragging window", async () => {
    await act(async () => {
      root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
    });

    const emptyArea = document.getElementById("empty-drag-area")!;

    const pointerDown = new PointerEvent("pointerdown", {
      button: 0,
      clientX: 50,
      clientY: 10,
      screenX: 100,
      screenY: 100,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    emptyArea.dispatchEvent(pointerDown);

    const largeMove = new PointerEvent("pointermove", {
      button: 0,
      clientX: 60,
      clientY: 15,
      screenX: 110,
      screenY: 105,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(largeMove);

    const pointerUp = new PointerEvent("pointerup", {
      button: 0,
      clientX: 60,
      clientY: 15,
      screenX: 110,
      screenY: 105,
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
    });
    window.dispatchEvent(pointerUp);

    const dblClick = new MouseEvent("dblclick", {
      button: 0,
      clientX: 60,
      clientY: 15,
      bubbles: true,
      cancelable: true,
    });
    emptyArea.dispatchEvent(dblClick);

    expect(mockToggleMaximize).not.toHaveBeenCalled();
  });

  describe.each(["linux", "win32"] as const)("on %s", (platform) => {
    beforeEach(() => {
      (window as any).linerElectron.platform = platform;
    });

    it("uses native dragging instead of moving the window manually", async () => {
      await act(async () => {
        root.render(<DragTestComponent topAreaHeight={32} dragThreshold={5} />);
      });

      const emptyArea = document.getElementById("empty-drag-area")!;
      emptyArea.dispatchEvent(
        new PointerEvent("pointerdown", {
          button: 0,
          clientX: 50,
          clientY: 10,
          screenX: 100,
          screenY: 100,
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          button: 0,
          clientX: 60,
          clientY: 15,
          screenX: 110,
          screenY: 105,
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          button: 0,
          clientX: 60,
          clientY: 15,
          screenX: 110,
          screenY: 105,
          bubbles: true,
          cancelable: true,
          pointerType: "mouse",
        }),
      );
      emptyArea.dispatchEvent(
        new MouseEvent("dblclick", { button: 0, clientX: 50, clientY: 10, bubbles: true }),
      );

      expect(mockDragStart).not.toHaveBeenCalled();
      expect(mockDragMove).not.toHaveBeenCalled();
      expect(mockDragEnd).not.toHaveBeenCalled();
      expect(mockToggleMaximize).not.toHaveBeenCalled();
    });

    it("adds the app-region drag strip and removes it on unmount", async () => {
      await act(async () => {
        root.render(<DragTestComponent topAreaHeight={40} />);
      });

      const strip = document.getElementById("window-drag-strip");
      expect(strip).not.toBeNull();
      expect(strip!.style.height).toBe("40px");
      expect(document.body.firstElementChild).toBe(strip);
      expect(document.documentElement.classList.contains(NATIVE_WINDOW_DRAG_CLASS)).toBe(true);

      await act(async () => {
        root.unmount();
      });

      expect(document.getElementById("window-drag-strip")).toBeNull();
      expect(document.documentElement.classList.contains(NATIVE_WINDOW_DRAG_CLASS)).toBe(false);
    });
  });
});
