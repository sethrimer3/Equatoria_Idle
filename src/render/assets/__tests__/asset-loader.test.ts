import { afterEach, describe, expect, it, vi } from 'vitest';

import { getChromaKeyedImage, loadImage } from '../asset-loader';

describe('getChromaKeyedImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the loaded image when canvas pixel readback is rejected', async () => {
    class TestImage {
      width = 2;
      height = 2;
      naturalWidth = 2;
      naturalHeight = 2;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        this.onload?.();
      }
    }

    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => {
        throw new DOMException('Canvas is tainted', 'SecurityError');
      }),
      putImageData: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };

    vi.stubGlobal('Image', TestImage);
    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    });

    const source = await loadImage('test://restricted-status-icon');

    expect(() => getChromaKeyedImage(
      'test://restricted-status-icon',
      255,
      0,
      255,
    )).not.toThrow();
    expect(getChromaKeyedImage(
      'test://restricted-status-icon',
      255,
      0,
      255,
    )).toBe(source);
    expect(context.putImageData).not.toHaveBeenCalled();
  });
});
