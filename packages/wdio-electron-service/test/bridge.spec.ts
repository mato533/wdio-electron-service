import os from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElectronCdpBridge, getDebuggerEndpoint } from '../src/bridge.js';
import { CdpBridge } from '@wdio/cdp-bridge';

vi.mock('@wdio/electron-utils/log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
}));

describe('getDebuggerEndpoint', () => {
  it('should return the endpoint information of the node debugger', () => {
    const host = 'localhost';
    const port = 50000;
    const result = getDebuggerEndpoint({
      ['goog:chromeOptions']: {
        args: ['foo=bar', `--inspect=${host}:${port}`],
      },
    });
    expect(result).toStrictEqual({
      host,
      port,
    });
  });

  it('should throw the error when `--inspect` is not set', () => {
    expect(() =>
      getDebuggerEndpoint({
        ['goog:chromeOptions']: {
          args: ['foo=bar'],
        },
      }),
    ).toThrowError();
  });

  it('should throw the error when invalid host is set', () => {
    const host = '';
    const port = 'xxx';
    expect(() =>
      getDebuggerEndpoint({
        ['goog:chromeOptions']: {
          args: ['foo=bar', `--inspect=${host}:${port}`],
        },
      }),
    ).toThrowError();
  });

  it('should throw the error when invalid port number is set', () => {
    const host = 'localhost';
    const port = 'xxx';
    expect(() =>
      getDebuggerEndpoint({
        ['goog:chromeOptions']: {
          args: ['foo=bar', `--inspect=${host}:${port}`],
        },
      }),
    ).toThrowError();
  });
});

describe('ElectronCdpBridge', () => {
  vi.mock('@wdio/cdp-bridge', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@wdio/cdp-bridge')>();
    actual.CdpBridge.prototype.connect = vi.fn();
    actual.CdpBridge.prototype.send = vi.fn();
    actual.CdpBridge.prototype.on = vi.fn();
    return {
      CdpBridge: actual.CdpBridge,
    };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  describe('connect', async () => {
    const expectedContextId = 999;
    const getMockedInstance = async () => {
      const cdpBridge = new ElectronCdpBridge();

      const promise = cdpBridge.connect();
      const mockedInstance = (await vi
        .mocked(CdpBridge.prototype.connect)
        .mock.instances.slice(-1)[0]) as unknown as ElectronCdpBridge;

      const [_method, callback] = vi.mocked(mockedInstance.on).mock.calls[0];
      callback(
        {
          context: {
            id: expectedContextId,
            auxData: {
              isDefault: true,
            },
          },
        } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      );
      await promise;
      return mockedInstance;
    };

    it('should throw error when getting contextId with timeout', async () => {
      const cdpBridge = new ElectronCdpBridge({ timeout: 10 });
      await expect(() => cdpBridge.connect()).rejects.toThrowError('Timeout exceeded to get the ContextId.');
    });

    it('should call super.on() with expected arguments', async () => {
      const mockedInstance = await getMockedInstance();

      expect(mockedInstance.on).toHaveBeenCalledTimes(2);
      expect(vi.mocked(mockedInstance.on).mock.calls[0][0]).toBe('Runtime.executionContextCreated');
      expect(vi.mocked(mockedInstance.on).mock.calls[1][0]).toBe('Runtime.consoleAPICalled');
    });

    it('should set context id', async () => {
      const mockedInstance = await getMockedInstance();
      expect((mockedInstance as unknown as ElectronCdpBridge).on).toHaveBeenCalledTimes(2);
      expect(mockedInstance.contextId).toBe(expectedContextId);
    });

    it('should call super.on() with expected on windows', async () => {
      vi.spyOn(os, 'type').mockReturnValue('Windows');
      const mockedInstance = await getMockedInstance();
      const expectedArgsOfEval = {
        contextId: expectedContextId,
        expression: [
          'globalThis.__name = globalThis.__name ?? ((func) => func);',
          "globalThis.electron = require('electron');",
          "globalThis.process = require('node:process');",
        ].join('\n'),
        includeCommandLineAPI: true,
        replMode: true,
      };

      expect(mockedInstance.send).toHaveBeenCalledTimes(2);
      expect(mockedInstance.send).toHaveBeenNthCalledWith(1, 'Runtime.enable');
      expect(mockedInstance.send).toHaveBeenNthCalledWith(2, 'Runtime.evaluate', expectedArgsOfEval);
    });

    it('should call super.on() with expected on not windows', async () => {
      vi.spyOn(os, 'type').mockReturnValue('Linux');
      const mockedInstance = await getMockedInstance();
      const expectedArgsOfEval = {
        contextId: expectedContextId,
        expression: [
          'globalThis.__name = globalThis.__name ?? ((func) => func);',
          "globalThis.electron = require('electron');",
        ].join('\n'),
        includeCommandLineAPI: true,
        replMode: true,
      };

      expect(mockedInstance.send).toHaveBeenCalledTimes(2);
      expect(mockedInstance.send).toHaveBeenNthCalledWith(1, 'Runtime.enable');
      expect(mockedInstance.send).toHaveBeenNthCalledWith(2, 'Runtime.evaluate', expectedArgsOfEval);
    });
  });
});
