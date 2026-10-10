import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// Edge-case supplement to repro.test.ts, covering PR-plan items the original
// suite did not: (a) options replacement during an active hold, (b) two mounted
// instances where one unmounts during a hold.

let CoolMode: typeof import('@magicui/cool-mode').CoolMode;

let dom: JSDOM;
let renderer: ReactTestRenderer;
let mounted: boolean;
let now: number;
let nextId: number;
let frames: Map<number, FrameRequestCallback>;
const hosts = new Map<string, HTMLSpanElement>();

beforeEach(async () => {
  vi.resetModules(); // Isolate the module's instanceCounter for each case.
  ({ CoolMode } = await import('@magicui/cool-mode'));
  vi.useFakeTimers();
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://example.test/' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  now = 0;
  nextId = 0;
  frames = new Map();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++nextId;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  hosts.clear();
});

const hostFor = (key: string) => {
  let host = hosts.get(key);
  if (!host) {
    host = document.createElement('span');
    document.body.append(host);
    hosts.set(key, host);
  }
  return host;
};

// Each CoolMode renders <span ref>{children}</span>; key hosts by children text.
const nodeMock = (element: { props: { children?: unknown } }) =>
  hostFor(String(element.props.children ?? ''));

async function frame(count = 1) {
  for (let i = 0; i < count; i++) {
    now += 50;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
    await vi.advanceTimersByTimeAsync(50);
  }
}

function hold(host: HTMLSpanElement) {
  const touch = 'ontouchstart' in window;
  const event = new dom.window.Event(touch ? 'touchstart' : 'mousedown');
  Object.defineProperty(event, 'touches', { value: [{ clientX: 100, clientY: 100 }] });
  host.dispatchEvent(event);
}

function release(host: HTMLSpanElement) {
  const touch = 'ontouchstart' in window;
  host.dispatchEvent(new dom.window.Event(touch ? 'touchend' : 'mouseup'));
}

const overlay = () => document.getElementById('_coolMode_effect');

afterEach(async () => {
  if (mounted) await act(async () => renderer.unmount());
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  dom.window.close();
});

it('releases the replaced effect when options change during an active hold', async () => {
  mounted = true;
  await act(async () => {
    renderer = create(React.createElement(CoolMode, { options: { speedHorz: 5 } }, 'A'), {
      createNodeMock: nodeMock,
    });
  });
  const host = hostFor('A');
  hold(host);
  await frame();
  expect(overlay()?.children.length).toBe(1);

  // New options identity -> effect re-runs: old cleanup, then a fresh effect.
  await act(async () => {
    renderer.update(React.createElement(CoolMode, { options: { speedHorz: 7 } }, 'A'));
  });
  await frame(200); // old particles drain; old 500ms poll must fire and clear

  expect.soft(frames.size).toBe(1); // only the new instance's loop remains
  expect.soft(vi.getTimerCount()).toBe(0); // the replaced instance's poll is gone
  expect.soft(overlay() !== null).toBe(true); // new instance still owns the overlay

  // The new instance remains fully functional.
  hold(host);
  await frame();
  expect(overlay()!.children.length).toBeGreaterThanOrEqual(1);
  release(host);
  await act(async () => renderer.unmount());
  mounted = false;
  await frame(200);
  expect(frames.size).toBe(0);
  expect(overlay()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it('isolates two mounted instances when one unmounts during a hold', async () => {
  mounted = true;
  await act(async () => {
    renderer = create(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CoolMode, null, 'A'),
        React.createElement(CoolMode, null, 'B'),
      ),
      { createNodeMock: nodeMock },
    );
  });
  const hostA = hostFor('A');
  const hostB = hostFor('B');
  hold(hostA);
  await frame();
  expect(overlay()?.children.length).toBe(1);

  // Remove instance A while its hold is active; B stays mounted.
  await act(async () => {
    renderer.update(
      React.createElement(React.Fragment, null, null, React.createElement(CoolMode, null, 'B')),
    );
  });
  await frame(5);
  // A's unmounted effect must not create new particles; its one particle may drain.
  expect.soft(overlay()?.children.length ?? 0).toBeLessThanOrEqual(1);

  // B is unaffected: its own hold still generates particles.
  hold(hostB);
  await frame();
  expect.soft(overlay()!.children.length).toBeGreaterThanOrEqual(1);
  release(hostB);
  await frame(200); // A must have fully released; only B's loop remains.
  expect.soft(overlay() !== null).toBe(true); // B still mounted -> overlay persists
  expect.soft(frames.size).toBe(1);

  await act(async () => renderer.unmount());
  mounted = false;
  await frame(200);
  expect(frames.size).toBe(0);
  expect(overlay()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
