import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOVER_PREVIEW_CLOSE_GRACE_MS,
  HOVER_PREVIEW_OPEN_DELAY_MS,
  createEventDetailCache,
  createHoverPreviewController,
} from "./hoverPreviewController";

describe("hover preview timings", () => {
  it("opens after 300ms and keeps a short close grace", () => {
    expect(HOVER_PREVIEW_OPEN_DELAY_MS).toBe(300);
    expect(HOVER_PREVIEW_CLOSE_GRACE_MS).toBeGreaterThan(0);
    expect(HOVER_PREVIEW_CLOSE_GRACE_MS).toBeLessThanOrEqual(300);
  });
});

describe("createHoverPreviewController", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const controller = createHoverPreviewController();
    const seen: Array<string | null> = [];
    controller.subscribe((id) => seen.push(id));
    return { controller, seen };
  }

  it("starts closed", () => {
    expect(setup().controller.openRowKey()).toBeNull();
  });

  it("does not open before the delay has elapsed", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS - 1);

    expect(controller.openRowKey()).toBeNull();
  });

  it("opens exactly when the delay elapses", () => {
    const { controller, seen } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);

    expect(controller.openRowKey()).toBe("e1");
    expect(seen).toEqual(["e1"]);
  });

  it("never opens for rows the pointer only sweeps across", () => {
    const { controller, seen } = setup();
    for (const id of ["e1", "e2", "e3", "e4"]) {
      controller.pointerEnterRow(id);
      vi.advanceTimersByTime(100);
      controller.pointerLeaveRow(id);
    }
    vi.advanceTimersByTime(5000);

    expect(seen).toEqual([]);
    expect(controller.openRowKey()).toBeNull();
  });

  it("restarts the delay for the row the pointer rests on last", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(200);
    controller.pointerLeaveRow("e1");
    controller.pointerEnterRow("e2");
    vi.advanceTimersByTime(200);
    expect(controller.openRowKey()).toBeNull();

    vi.advanceTimersByTime(100);
    expect(controller.openRowKey()).toBe("e2");
  });

  it("closes after the grace period when the pointer leaves the row", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeaveRow("e1");

    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS - 1);
    expect(controller.openRowKey()).toBe("e1");

    vi.advanceTimersByTime(1);
    expect(controller.openRowKey()).toBeNull();
  });

  it("stays open when the pointer moves from the row into the card in time", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeaveRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS - 10);
    controller.pointerEnterCard();
    vi.advanceTimersByTime(10_000);

    expect(controller.openRowKey()).toBe("e1");
  });

  it("stays open when the pointer comes back to the same row during the grace", () => {
    const { controller, seen } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeaveRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS - 10);
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(10_000);

    expect(controller.openRowKey()).toBe("e1");
    expect(seen).toEqual(["e1"]);
  });

  it("does not notify a second close when the pointer leaves the card after Escape", () => {
    const { controller, seen } = setup();
    controller.focusRow("e1");
    controller.escape();
    controller.pointerLeaveCard();
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS);

    expect(seen).toEqual(["e1", null]);
  });

  it("cancels a pending open when the row is clicked", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(100);
    controller.rowClicked();
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);

    expect(controller.openRowKey()).toBeNull();
  });

  it("closes after the grace period when the pointer leaves the card", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.pointerEnterCard();
    controller.pointerLeaveCard();
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS);

    expect(controller.openRowKey()).toBeNull();
  });

  it("moves to another row without a closed state in between", () => {
    const { controller, seen } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.pointerLeaveRow("e1");
    controller.pointerEnterRow("e2");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);

    expect(controller.openRowKey()).toBe("e2");
    expect(seen).toEqual(["e1", "e2"]);
  });

  it("shows only one preview at a time", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    controller.focusRow("e2");

    expect(controller.openRowKey()).toBe("e2");
  });

  it("opens at once on keyboard focus, without the pointer delay", () => {
    const { controller } = setup();
    controller.focusRow("e1");

    expect(controller.openRowKey()).toBe("e1");
  });

  it("closes when focus leaves the row", () => {
    const { controller } = setup();
    controller.focusRow("e1");
    controller.blurRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS);

    expect(controller.openRowKey()).toBeNull();
  });

  it("ignores a blur from a row that is no longer the open one", () => {
    const { controller } = setup();
    controller.focusRow("e1");
    controller.focusRow("e2");
    controller.blurRow("e1");
    vi.advanceTimersByTime(HOVER_PREVIEW_CLOSE_GRACE_MS);

    expect(controller.openRowKey()).toBe("e2");
  });

  it("closes immediately on Escape, with no grace", () => {
    const { controller } = setup();
    controller.focusRow("e1");
    controller.escape();

    expect(controller.openRowKey()).toBeNull();
  });

  it("closes immediately on scroll and cancels a pending open", () => {
    const { controller } = setup();
    controller.pointerEnterRow("e1");
    vi.advanceTimersByTime(100);
    controller.scroll();
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    expect(controller.openRowKey()).toBeNull();

    controller.focusRow("e2");
    controller.scroll();
    expect(controller.openRowKey()).toBeNull();
  });

  it("closes immediately when a row is clicked, so the page can open", () => {
    const { controller } = setup();
    controller.focusRow("e1");
    controller.rowClicked();

    expect(controller.openRowKey()).toBeNull();
  });

  it("does not notify subscribers when nothing changes", () => {
    const { controller, seen } = setup();
    controller.escape();
    controller.scroll();

    expect(seen).toEqual([]);
  });

  it("stops notifying after unsubscribe and after dispose", () => {
    const controller = createHoverPreviewController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    controller.focusRow("e1");
    expect(listener).not.toHaveBeenCalled();

    controller.dispose();
    controller.pointerEnterRow("e2");
    vi.advanceTimersByTime(HOVER_PREVIEW_OPEN_DELAY_MS);
    expect(controller.openRowKey()).toBe("e1");
  });
});

describe("createEventDetailCache", () => {
  type Detail = { id: string };
  const detail = (id: string): Detail => ({ id });

  it("fetches on the first load and reports loading, then ready", async () => {
    const fetcher = vi.fn(async (id: string) => detail(id));
    const cache = createEventDetailCache(fetcher);

    expect(cache.peek("e1")).toEqual({ status: "idle" });
    const pending = cache.load("e1");
    expect(cache.peek("e1")).toEqual({ status: "loading" });

    await pending;
    expect(cache.peek("e1")).toEqual({ status: "ready", detail: detail("e1") });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not fetch again for an id that is already cached", async () => {
    const fetcher = vi.fn(async (id: string) => detail(id));
    const cache = createEventDetailCache(fetcher);

    await cache.load("e1");
    await cache.load("e1");

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("shares one request between callers while it is in flight", async () => {
    let resolve: (value: Detail) => void = () => {};
    const fetcher = vi.fn(() => new Promise<Detail>((r) => (resolve = r)));
    const cache = createEventDetailCache(fetcher);

    const first = cache.load("e1");
    const second = cache.load("e1");
    resolve(detail("e1"));
    await Promise.all([first, second]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps separate entries per event id", async () => {
    const fetcher = vi.fn(async (id: string) => detail(id));
    const cache = createEventDetailCache(fetcher);

    await cache.load("e1");
    await cache.load("e2");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(cache.peek("e2")).toEqual({ status: "ready", detail: detail("e2") });
  });

  it("reports an error state and allows a retry on the next load", async () => {
    const fetcher = vi
      .fn<(id: string) => Promise<Detail>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(detail("e1"));
    const cache = createEventDetailCache(fetcher);

    await cache.load("e1");
    expect(cache.peek("e1")).toEqual({ status: "error" });

    await cache.load("e1");
    expect(cache.peek("e1")).toEqual({ status: "ready", detail: detail("e1") });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports a missing event when the fetch returns null, and does not refetch", async () => {
    const fetcher = vi.fn(async () => null);
    const cache = createEventDetailCache<Detail>(fetcher);

    await cache.load("gone");
    await cache.load("gone");

    expect(cache.peek("gone")).toEqual({ status: "missing" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never throws out of load, so a hover cannot crash the report", async () => {
    const cache = createEventDetailCache<Detail>(async () => {
      throw new Error("boom");
    });

    await expect(cache.load("e1")).resolves.toBeUndefined();
  });

  it("notifies subscribers on each state change of an id", async () => {
    const cache = createEventDetailCache(async (id: string) => detail(id));
    const seen: string[] = [];
    cache.subscribe((id) => seen.push(`${id}:${cache.peek(id).status}`));

    await cache.load("e1");

    expect(seen).toEqual(["e1:loading", "e1:ready"]);
  });

  it("notifies loading then error when the fetch fails", async () => {
    const cache = createEventDetailCache<Detail>(async () => {
      throw new Error("boom");
    });
    const seen: string[] = [];
    cache.subscribe((id) => seen.push(`${id}:${cache.peek(id).status}`));

    await cache.load("e1");

    expect(seen).toEqual(["e1:loading", "e1:error"]);
  });

  it("shows loading again while a retry after an error is in flight", async () => {
    let resolve: (value: Detail) => void = () => {};
    const fetcher = vi
      .fn<(id: string) => Promise<Detail>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockImplementationOnce(() => new Promise<Detail>((r) => (resolve = r)));
    const cache = createEventDetailCache(fetcher);

    await cache.load("e1");
    const retry = cache.load("e1");
    expect(cache.peek("e1")).toEqual({ status: "loading" });

    resolve(detail("e1"));
    await retry;
    expect(cache.peek("e1").status).toBe("ready");
  });

  it("does not let a request that finishes after clear refill the cache", async () => {
    let resolve: (value: Detail) => void = () => {};
    const fetcher = vi.fn(() => new Promise<Detail>((r) => (resolve = r)));
    const cache = createEventDetailCache(fetcher);

    const pending = cache.load("e1");
    cache.clear();
    resolve(detail("e1"));
    await pending;

    expect(cache.peek("e1")).toEqual({ status: "idle" });
  });

  it("forgets everything on clear, so a new report session fetches again", async () => {
    const fetcher = vi.fn(async (id: string) => detail(id));
    const cache = createEventDetailCache(fetcher);

    await cache.load("e1");
    cache.clear();
    expect(cache.peek("e1")).toEqual({ status: "idle" });

    await cache.load("e1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
