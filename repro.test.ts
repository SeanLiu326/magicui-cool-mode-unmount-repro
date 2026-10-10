import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let CoolMode: typeof import('@magicui/cool-mode').CoolMode;

let dom: JSDOM;
let host: HTMLSpanElement;
let renderer: ReactTestRenderer;
let mounted: boolean;
let now: number;
let nextId: number;
let frames: Map<number, FrameRequestCallback>;

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
  host = document.createElement('span');
  document.body.append(host);
  mounted = true;
  await act(async () => {
    renderer = create(React.createElement(CoolMode, {}, 'Hold'), {
      createNodeMock: () => host,
    });
  });
});

async function frame() {
  now += 50;
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(now);
  await vi.advanceTimersByTimeAsync(50);
}

async function unmount() {
  await act(async () => renderer.unmount());
  mounted = false;
  host.remove();
}

afterEach(async () => {
  if (mounted) await unmount();
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  dom.window.close();
});

it('releases the animation loop after an idle unmount', async () => {
  await unmount();
  for (let i = 0; i < 12; i++) await frame();
  expect.soft(frames.size).toBe(0);
  expect.soft(document.getElementById('_coolMode_effect') !== null).toBe(false);
  expect.soft(vi.getTimerCount()).toBe(0);
});

it('drains particles and releases resources if the hold ends before unmount', async () => {
  const touch = 'ontouchstart' in window;
  const event = new dom.window.Event(touch ? 'touchstart' : 'mousedown');
  Object.defineProperty(event, 'touches', { value: [{ clientX: 100, clientY: 100 }] });
  host.dispatchEvent(event);
  await frame();
  host.dispatchEvent(new dom.window.Event(touch ? 'touchend' : 'mouseup'));
  await unmount();
  for (let i = 0; i < 200; i++) await frame();
  expect(frames.size).toBe(0);
  expect(document.getElementById('_coolMode_effect')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it('stops producing particles when unmounted during a hold', async () => {
  // Match the component's desktop/touch event detection.
  const event = new dom.window.Event(
    'ontouchstart' in window ? 'touchstart' : 'mousedown',
  );
  Object.defineProperty(event, 'touches', {
    value: [{ clientX: 100, clientY: 100 }],
  });
  host.dispatchEvent(event);
  await frame();
  const container = document.getElementById('_coolMode_effect');
  expect(container?.children.length).toBe(1);

  await unmount();
  for (let i = 0; i < 5; i++) await frame();
  // Existing particles may finish, but an unmounted effect must create no new ones.
  expect(container?.children.length ?? 0).toBeLessThanOrEqual(1);
});

it('eventually releases animation and polling timers after an active unmount', async () => {
  const event = new dom.window.Event(
    'ontouchstart' in window ? 'touchstart' : 'mousedown',
  );
  Object.defineProperty(event, 'touches', {
    value: [{ clientX: 100, clientY: 100 }],
  });
  host.dispatchEvent(event);
  await frame();
  await unmount();
  for (let i = 0; i < 200; i++) await frame();
  expect.soft(frames.size).toBe(0);
  expect.soft(document.getElementById('_coolMode_effect') !== null).toBe(false);
  expect.soft(vi.getTimerCount()).toBe(0);
});
