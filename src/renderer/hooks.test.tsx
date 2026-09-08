// @vitest-environment jsdom

import { render, unmountComponentAtNode } from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SelectionStore, useSelectionParam } from "./hooks";

import type { Renderer } from "@freelensapp/extensions";

/** Minimal PageParam double: synchronous URL store, like the observable history in practice. */
function fakeParam(initial = "") {
  const store = { value: initial };
  const param = {
    get: () => store.value,
    set: (v: string) => {
      store.value = v;
    },
  } as unknown as Renderer.Navigation.PageParam<string>;
  return { param, store };
}

let container: HTMLDivElement;
let latest: { value: string; set: (v: string) => void; renders: number };

function Probe({
  param,
  tick,
  store,
}: {
  param: Renderer.Navigation.PageParam<string>;
  tick: number;
  store: SelectionStore;
}) {
  const [value, set] = useSelectionParam("test.sel", param, store);
  latest = { value, set, renders: (latest?.renders ?? 0) + 1 };
  return <div data-tick={tick}>{value ? `open:${value}` : "closed"}</div>;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  unmountComponentAtNode(container);
  container.remove();
});

describe("useSelectionParam", () => {
  let store: SelectionStore;
  beforeEach(() => {
    store = new SelectionStore();
  });

  it("survives a full unmount/remount of the page (route re-render) while the URL is empty", () => {
    const { param } = fakeParam();
    act(() => render(<Probe param={param} tick={0} store={store} />, container));
    act(() => latest.set("%2F/orders"));
    expect(container.textContent).toBe("open:%2F/orders");
    act(() => unmountComponentAtNode(container));
    act(() => render(<Probe param={param} tick={1} store={store} />, container));
    expect(container.textContent).toBe("open:%2F/orders");
  });

  it("opens on set, survives a re-render where the URL param reads empty, closes on set('')", () => {
    const { param, store: url } = fakeParam();
    act(() => render(<Probe param={param} tick={0} store={store} />, container));
    expect(container.textContent).toBe("closed");

    act(() => latest.set("%2F/orders"));
    expect(container.textContent).toBe("open:%2F/orders");
    expect(url.value).toBe("");

    // Background refresh: parent re-renders; URL still has nothing for us.
    act(() => render(<Probe param={param} tick={1} store={store} />, container));
    expect(container.textContent).toBe("open:%2F/orders");

    act(() => latest.set(""));
    expect(container.textContent).toBe("closed");

    act(() => latest.set("%2F/other"));
    expect(container.textContent).toBe("open:%2F/other");
  });

  it("adopts a deep link present at mount and a later non-empty URL change; closing clears the URL", () => {
    const { param, store: url } = fakeParam("%2F/deep");
    act(() => render(<Probe param={param} tick={0} store={store} />, container));
    expect(container.textContent).toBe("open:%2F/deep");

    url.value = "%2F/navigated";
    act(() => render(<Probe param={param} tick={1} store={store} />, container));
    expect(container.textContent).toBe("open:%2F/navigated");

    act(() => latest.set(""));
    expect(container.textContent).toBe("closed");
    expect(url.value).toBe("");
  });

  it("opens even when the URL write is asynchronous or ignored", () => {
    const url = { value: "" };
    const param = { get: () => url.value, set: () => {} } as unknown as Renderer.Navigation.PageParam<string>;
    act(() => render(<Probe param={param} tick={0} store={store} />, container));
    act(() => latest.set("%2F/x"));
    expect(container.textContent).toBe("open:%2F/x");
    act(() => render(<Probe param={param} tick={1} store={store} />, container));
    expect(container.textContent).toBe("open:%2F/x");
  });
});
