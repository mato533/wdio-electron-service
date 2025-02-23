import { vi, describe, beforeEach, it, expect } from 'vitest';
import type { BrowserExtension } from '@wdio/electron-types';

import { mockProcessProperty } from './helpers.js';
import { execute } from '../src/commands/execute';
import { clearAllMocks } from '../src/commands/clearAllMocks.js';
import { resetAllMocks } from '../src/commands/resetAllMocks.js';
import { restoreAllMocks } from '../src/commands/restoreAllMocks.js';
import type ElectronWorkerService from '../src/service.js';
import { ensureActiveWindowFocus } from '../src/window.js';

vi.mock('../src/window.js');
vi.mock('../src/commands/execute', () => {
  return {
    execute: vi.fn(),
  };
});

vi.mock('../src/bridge', () => {
  const ElectronCdpBridge = vi.fn();
  ElectronCdpBridge.prototype.connect = vi.fn();
  ElectronCdpBridge.prototype.send = vi.fn();
  ElectronCdpBridge.prototype.on = vi.fn();
  return {
    getDebuggerEndpoint: vi.fn(),
    ElectronCdpBridge,
  };
});

// TODO: Start: This section could be remove at V9
vi.mock('@wdio/electron-utils/log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

global.console.log = vi.fn();
// TODO: End: This section could be remove at V9

let WorkerService: typeof ElectronWorkerService;
let instance: ElectronWorkerService | undefined;

beforeEach(async () => {
  mockProcessProperty('platform', 'darwin');
  WorkerService = (await import('../src/service.js')).default;
});

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('before', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add commands to the browser object', async () => {
    instance = new WorkerService();
    const browser = {
      waitUntil: vi.fn().mockResolvedValue(true),
      execute: vi.fn().mockResolvedValue(true),
      getWindowHandles: vi.fn().mockResolvedValue(['dummy']),
      switchToWindow: vi.fn(),
      getPuppeteer: vi.fn(),
      electron: {}, // Let the service initialize this
    } as unknown as WebdriverIO.Browser;

    await instance.before({}, [], browser);

    const serviceApi = browser.electron as BrowserExtension['electron'];
    expect(serviceApi.clearAllMocks).toEqual(expect.any(Function));
    expect(serviceApi.execute).toEqual(expect.any(Function));
    expect(serviceApi.mock).toEqual(expect.any(Function));
    expect(serviceApi.mockAll).toEqual(expect.any(Function));
    expect(serviceApi.resetAllMocks).toEqual(expect.any(Function));
    expect(serviceApi.restoreAllMocks).toEqual(expect.any(Function));
  });

  describe('when multiremote', () => {
    it('should add commands to the browser object', async () => {
      instance = new WorkerService();
      const electronInstance = {
        requestedCapabilities: {
          'wdio:electronServiceOptions': {},
          'alwaysMatch': {
            'browserName': 'electron',
            'wdio:electronServiceOptions': {},
          },
        },
        waitUntil: vi.fn().mockResolvedValue(true),
        execute: vi.fn().mockResolvedValue(true),
        getWindowHandles: vi.fn().mockResolvedValue(['dummy']),
        switchToWindow: vi.fn(),
        getPuppeteer: vi.fn(),
        electron: {
          execute: vi.fn(),
          mock: vi.fn(),
          mockAll: vi.fn(),
          clearAllMocks: vi.fn(),
          resetAllMocks: vi.fn(),
          restoreAllMocks: vi.fn(),
          isMockFunction: vi.fn(),
        },
      };

      const browser = {
        instances: ['electron'],
        getInstance: (name: string) => (name === 'electron' ? electronInstance : undefined),
        execute: vi.fn().mockResolvedValue(true),
        isMultiremote: true,
      } as unknown as WebdriverIO.MultiRemoteBrowser;

      await instance.before({}, [], browser);

      const serviceApi = electronInstance.electron;
      expect(serviceApi.clearAllMocks).toEqual(expect.any(Function));
      expect(serviceApi.execute).toEqual(expect.any(Function));
      expect(serviceApi.mock).toEqual(expect.any(Function));
      expect(serviceApi.mockAll).toEqual(expect.any(Function));
      expect(serviceApi.resetAllMocks).toEqual(expect.any(Function));
      expect(serviceApi.restoreAllMocks).toEqual(expect.any(Function));
    });

    it('should continue when not electron Capabilities was passed', async () => {
      instance = new WorkerService();
      const electronInstance = {
        requestedCapabilities: {
          browserName: 'chrome',
        },
      };

      const browser = {
        instances: ['electron'],
        getInstance: (name: string) => (name === 'electron' ? electronInstance : undefined),
        execute: vi.fn().mockResolvedValue(true),
        isMultiremote: true,
      } as unknown as WebdriverIO.MultiRemoteBrowser;

      await instance.before({}, [], browser);

      // check to not call `copyOriginalApi` because skipped due to `continue`
      expect(execute).not.toHaveBeenCalled();
    });
  });

  describe('copyOriginalApi', () => {
    it('should copy original api', async () => {
      instance = new WorkerService();
      const browser = {
        waitUntil: vi.fn().mockImplementation(async (condition) => {
          await condition();
        }),
        execute: vi.fn().mockResolvedValue(true),
        getWindowHandles: vi.fn().mockResolvedValue(['dummy']),
        switchToWindow: vi.fn(),
        getPuppeteer: vi.fn(),
        electron: {}, // Let the service initialize this
      } as unknown as WebdriverIO.Browser;

      await instance.before({}, [], browser);

      const serviceApi = browser.electron as BrowserExtension['electron'];
      expect(serviceApi.execute).toEqual(expect.any(Function));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalCopyOriginalApi = vi.mocked(execute).mock.calls[0][2] as any;
      const dummyElectron = {
        dialog: {
          showOpenDialog: vi.fn(),
        },
      };
      await internalCopyOriginalApi(dummyElectron);

      expect(globalThis.originalApi).toMatchObject(dummyElectron);
    });
  });
});

describe('beforeTest', () => {
  vi.mock('../src/commands/clearAllMocks.js', () => ({
    clearAllMocks: vi.fn().mockReturnValue({}),
  }));
  vi.mock('../src/commands/resetAllMocks.js', () => ({
    resetAllMocks: vi.fn().mockReturnValue({}),
  }));
  vi.mock('../src/commands/restoreAllMocks.js', () => ({
    restoreAllMocks: vi.fn().mockReturnValue({}),
  }));

  const browser = {
    waitUntil: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(true),
    getPuppeteer: vi.fn(),
    getWindowHandles: vi.fn().mockResolvedValue(['dummy']),
  } as unknown as WebdriverIO.Browser;

  it.each([
    [`clearMocks`, clearAllMocks],
    [`resetMocks`, resetAllMocks],
    [`restoreMocks`, restoreAllMocks],
  ])('should clear all mocks when `%s` is set', async (option, fn) => {
    instance = new WorkerService({ [option]: true });
    await instance.before({}, [], browser);
    await instance.beforeTest();

    expect(fn).toHaveBeenCalled();
  });

  describe('when setting options in capabilities', () => {
    it.each([
      [`clearMocks`, clearAllMocks],
      [`resetMocks`, resetAllMocks],
      [`restoreMocks`, restoreAllMocks],
    ])('should clear all mocks when `%s` is set in capabilities', async (option, fn) => {
      instance = new WorkerService();
      await instance.before({ 'wdio:electronServiceOptions': { [option]: true } }, [], browser);
      await instance.beforeTest();

      expect(fn).toHaveBeenCalled();
    });
  });
});

describe('beforeCommand', () => {
  const browser = {
    waitUntil: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(true),
    getPuppeteer: vi.fn(),
    getWindowHandles: vi.fn().mockResolvedValue(['dummy']),
  } as unknown as WebdriverIO.Browser;

  beforeEach(() => {
    vi.mocked(ensureActiveWindowFocus).mockClear();
  });

  it('should call `ensureActiveWindowFocus`', async () => {
    instance = new WorkerService();
    await instance.before({}, [], browser);
    await instance.beforeCommand('dummyCommand', []);

    expect(ensureActiveWindowFocus).toHaveBeenCalledWith(browser, 'dummyCommand', undefined);
  });

  it('should not call `ensureActiveWindowFocus` when excluded command', async () => {
    instance = new WorkerService();
    await instance.before({}, [], browser);
    await instance.beforeCommand('getWindowHandles', []);

    expect(ensureActiveWindowFocus).toHaveBeenCalledTimes(0);
  });
});
