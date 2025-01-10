import type { CDPSession, Protocol } from 'puppeteer-core';

export class CdpClient {
  #cdpSession: CDPSession;
  #contextResolve?: (
    value: Protocol.Runtime.ExecutionContextCreatedEvent | PromiseLike<Protocol.Runtime.ExecutionContextCreatedEvent>,
  ) => void;
  #contextId?: number;

  send: CDPSession['send'];

  constructor(cdpSession: CDPSession) {
    this.#cdpSession = cdpSession;
    this.send = (method, params, options) => {
      if (!this.#cdpSession) {
        throw new Error('CDP session is not initialized');
      }
      return this.#cdpSession?.send(method, params, options);
    };
  }

  async getExecutionContext() {
    this.#cdpSession.on('Runtime.executionContextCreated', (data) => {
      console.log('== context event ======', data);
      if (data.context.auxData.isDefault && this.#contextResolve) {
        this.#contextResolve(data);
        this.#contextResolve = undefined;
      }
    });
    const event = await new Promise<Protocol.Runtime.ExecutionContextCreatedEvent>((resolve, reject) => {
      this.#contextResolve = resolve;
      this.#cdpSession.send('Runtime.enable');

      setTimeout(() => {
        this.#contextResolve = undefined;
        reject(new Error(`Timeout waiting for response to message ID`));
      }, 5000); // 5秒タイムアウト
    });
    this.#contextId = event.context.id;
    console.log('========', event);
    console.log('========', this.#contextId);
  }

  async init() {
    const scripts = [
      // Add __name to the global object to work around issue with function serialization
      // This enables browser.execute to work with scripts which declare functions (affects TS specs only)
      // https://github.com/webdriverio-community/wdio-electron-service/issues/756
      // https://github.com/privatenumber/tsx/issues/113
      `globalThis.__name = globalThis.__name ?? ((func) => func);`,
      // Add electron to the global object
      `globalThis.electron = require('electron');`,
      // `electron.app.getName()`,
    ];

    const result1 = await this.#cdpSession.send('Runtime.evaluate', {
      expression: scripts.join('\n'),
      includeCommandLineAPI: true,
      replMode: true,
      contextId: this.#contextId,
      // throwOnSideEffect: true,
    });
    console.log('====init= require ===', result1);
    const result2 = await this.#cdpSession.send('Runtime.evaluate', {
      expression: `electron.app.getName()`,
      includeCommandLineAPI: true,
      replMode: true,
      contextId: this.#contextId,
      // throwOnSideEffect: true,
    });
    console.log('====init= electron ===', result2);
  }
}
