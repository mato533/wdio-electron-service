import os from 'node:os';
import log from '@wdio/electron-utils/log';
import { CdpBridge } from '@wdio/cdp-bridge';
import { SevereServiceError } from 'webdriverio';
import mockStore from './mockStore';
import { MOCK_CALL_EVENT_PREFIX } from './constants';

export const getDebuggerEndpoint = (capabilities: WebdriverIO.Capabilities) => {
  log.trace('Try to detect the node debugger endpoint');

  const debugArg = capabilities['goog:chromeOptions']?.args?.find((item) => item.startsWith('--inspect='));
  log.trace(`Detected debugger args: ${debugArg}`);

  const debugUrl = debugArg ? debugArg.split('=')[1] : undefined;
  const [host, strPort] = debugUrl ? debugUrl.split(':') : [];
  const result = { host, port: Number(strPort) };

  if (!result.host || !result.port) {
    throw new SevereServiceError(`Failed to detect the debugger endpoint.`);
  }

  log.trace(`Detected the node debugger endpoint: `, result);
  return result;
};

export class ElectronCdpBridge extends CdpBridge {
  #contextId: number = 0;

  get contextId() {
    return this.#contextId;
  }

  async connect(): Promise<void> {
    await super.connect();

    const contextHandler = this.#getContextIdHandler();

    this.on('Runtime.consoleAPICalled', async (params) => {
      const { type, value } = params.args[0];
      if (value && type === 'string' && value.startsWith(MOCK_CALL_EVENT_PREFIX)) {
        const mockName = value.replace(MOCK_CALL_EVENT_PREFIX, '');
        const p = new Promise<void>((resolve, reject) => {
          const existingMock = mockStore.getMock(mockName);
          existingMock
            .update()
            .then(() => resolve())
            .catch((e) => reject(e));
        });
        mockStore.setPromise(p);
        p.finally(() => mockStore.deletePromise(p));
      }
    });

    await this.send('Runtime.enable');

    this.#contextId = await contextHandler;

    const scripts = [
      // Add __name to the global object to work around issue with function serialization
      // This enables browser.execute to work with scripts which declare functions (affects TS specs only)
      // https://github.com/webdriverio-community/wdio-electron-service/issues/756
      // https://github.com/privatenumber/tsx/issues/113
      `globalThis.__name = globalThis.__name ?? ((func) => func);`,
      // Add electron to the global object
      `globalThis.electron = require('electron');`,
    ];
    // add because windows
    if (os.type().match('Windows')) {
      scripts.push(`globalThis.process = require('node:process');`);
    }

    await this.send('Runtime.evaluate', {
      expression: scripts.join('\n'),
      includeCommandLineAPI: true,
      replMode: true,
      contextId: this.#contextId,
    });
  }

  #getContextIdHandler() {
    return new Promise<number>((resolve, reject) => {
      this.on('Runtime.executionContextCreated', (params) => {
        if (params.context.auxData.isDefault) {
          resolve(params.context.id);
        }
      });

      setTimeout(() => {
        const err = new Error('Timeout exceeded to get the ContextId.');
        log.error(err.message);
        reject(err);
      }, this.options.timeout);
    });
  }
}
