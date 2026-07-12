import { describe, expect, it, vi } from 'vitest';
import { createAppRuntimeOwner } from '../app-runtime';

describe('AppRuntime cleanup ownership', () => {
  it('runs child cleanup once in reverse order and removes root DOM last', () => {
    const order: string[] = [];
    const root = { replaceChildren: vi.fn(() => { order.push('root'); }) } as unknown as HTMLElement;
    const owner = createAppRuntimeOwner(root);

    owner.addCleanup(() => { order.push('trace'); });
    owner.addCleanup(() => { order.push('listeners'); });
    owner.addCleanup(() => { order.push('loop'); });

    owner.runtime.dispose();
    owner.runtime.dispose();

    expect(owner.runtime.isDisposed).toBe(true);
    expect(order).toEqual(['loop', 'listeners', 'trace', 'root']);
    expect(root.replaceChildren).toHaveBeenCalledOnce();
  });

  it('continues cleanup after a child failure and surfaces the error', () => {
    const onCleanupError = vi.fn();
    const root = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const owner = createAppRuntimeOwner(root, onCleanupError);
    const survivor = vi.fn();
    owner.addCleanup(survivor);
    owner.addCleanup(() => { throw new Error('cleanup failed'); });

    owner.runtime.dispose();

    expect(survivor).toHaveBeenCalledOnce();
    expect(root.replaceChildren).toHaveBeenCalledOnce();
    expect(onCleanupError).toHaveBeenCalledOnce();
  });
});
