import { fn as vitestFn, type Mock } from '@vitest/spy';
import type { ElectronInterface, ElectronType } from './types.js';
import log from './log.js';

type BasicFn = (...args: unknown[]) => unknown;
type BasicAsyncFn = (...args: unknown[]) => Promise<unknown>;
type AbstractFn = BasicFn | BasicAsyncFn;
type ElectronApiFn = ElectronType[ElectronInterface][keyof ElectronType[ElectronInterface]];

type Omitted =
  | 'mockImplementation'
  | 'mockImplementationOnce'
  | 'mockReturnValue'
  | 'mockReturnValueOnce'
  | 'mockResolvedValue'
  | 'mockResolvedValueOnce'
  | 'mockRejectedValue'
  | 'mockRejectedValueOnce'
  | 'withImplementation';

interface AsyncMockInstance extends Omit<Mock, Omitted> {
  mockName(name: string): any;
  mockClear(): any;
  mockReset(): any;
  mockImplementation(fn: AbstractFn): Promise<AsyncMock>;
  mockImplementationOnce(fn: AbstractFn): Promise<AsyncMock>;
  mockReturnValue(obj: unknown): Promise<AsyncMock>;
  mockReturnValueOnce(obj: unknown): Promise<AsyncMock>;
  // mockResolvedValue(obj: unknown): Promise<any>;
  // mockResolvedValueOnce(obj: unknown): Promise<any>;
  // mockRejectedValue(obj: unknown): Promise<any>;
  // mockRejectedValueOnce(obj: unknown): Promise<any>;
  mockRestore(): Promise<AsyncMock>;
  update(): Promise<AsyncMock>;
  updating: boolean;
}

export interface AsyncMock<TArgs extends any[] = any, TReturns = any> extends AsyncMockInstance {
  new (...args: TArgs): TReturns;
  (...args: TArgs): TReturns;
}

async function setElectronMock(
  apiName: string,
  funcName: string,
  implementationFn: AbstractFn = () => undefined,
  returnValue?: unknown,
): Promise<void> {
  log.debug('setting electron mock', apiName, funcName);
  await browser.electron.execute(
    (electron, apiName, funcName, mockImplementation, mockReturnValue) => {
      const electronApi = electron[apiName as keyof typeof electron];

      const mockFn = globalThis.fn(eval(mockImplementation));
      // const mockFn = globalThis.spyOn<any, string>(electronApi, funcName);
      // mockFn.mockImplementation(eval(mockImplementation));
      if (mockReturnValue !== undefined) {
        mockFn.mockReturnValue(mockReturnValue);
      }

      // replace target API with mock
      electronApi[funcName as keyof typeof electronApi] = mockFn as ElectronApiFn;
    },
    apiName,
    funcName,
    implementationFn.toString(),
    returnValue,
  );
}

export function createMock(apiName: string, funcName: string) {
  const mock = vitestFn() as unknown as AsyncMock;
  const originalMockImplementation = mock.mockImplementation;
  const originalMockClear = mock.mockClear;

  mock.updating = false;
  mock.mockName(`electron.${apiName}.${funcName}`);

  mock.mockRestore = async () => {
    // restores inner implementation to the original function
    log.debug('restoring mock', apiName, funcName);
    await browser.electron.execute(
      async (electron, apiName, funcName) => {
        const electronApi = electron[apiName as keyof typeof electron];
        const originalApi = globalThis.originalApi as Record<ElectronInterface, ElectronType[ElectronInterface]>;
        const originalApiMethod = originalApi[apiName as keyof typeof originalApi][
          funcName as keyof ElectronType[ElectronInterface]
        ] as ElectronApiFn;

        if (originalApiMethod) {
          electronApi[funcName as keyof typeof electronApi] = (originalApiMethod as () => unknown).bind({}) as never;
        }
      },
      apiName,
      funcName,
    );

    return mock;
  };

  mock.mockImplementation = async (fn: AbstractFn) => {
    await setElectronMock(apiName, funcName, fn);
    originalMockImplementation(fn);
    return mock;
  };

  mock.mockImplementationOnce = async (fn: AbstractFn) => {
    const implementationFn = (...args: unknown[]) => {
      mock.mockRestore();
      return fn.apply(fn, args);
    };
    await setElectronMock(apiName, funcName, implementationFn);
    originalMockImplementation(implementationFn);
    return mock;
  };

  mock.mockReturnValue = async (obj: unknown) => {
    await setElectronMock(apiName, funcName, undefined, obj);
    return mock;
  };

  mock.mockReturnValueOnce = async (obj: unknown) => {
    const implementationFn = () => mock.mockRestore();
    await setElectronMock(apiName, funcName, implementationFn, obj);
    originalMockImplementation(implementationFn);
    return mock;
  };

  mock.update = async () => {
    mock.updating = true;
    const calls = await browser.electron.execute(
      (electron, apiName, funcName) => {
        const mockObj = electron[apiName as keyof typeof electron][
          funcName as keyof ElectronType[ElectronInterface]
        ] as AsyncMock;
        return mockObj.mock?.calls || [];
      },
      apiName,
      funcName,
    );

    // re-apply calls from the electron main process mock to the outer one
    if (mock.mock.calls.length < calls.length) {
      calls.forEach((call: unknown[], index: number) => {
        if (!mock.mock.calls[index]) {
          mock?.apply(mock, call);
        }
      });
    }
    mock.updating = false;

    return mock;
  };

  mock.mockClear = async () => {
    await browser.electron.execute(
      (electron, apiName, funcName) => {
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).mockClear();
      },
      apiName,
      funcName,
    );
    originalMockClear();
    return mock;
  };

  mock.mockReset = async () => {
    // mock.mockClear();
    // await setElectronMock(apiName, funcName, () => undefined);
    await browser.electron.execute(
      (electron, apiName, funcName) =>
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).mockReset(),
      apiName,
      funcName,
    );
    return mock;
  };

  // mock.mockResolvedValue = async (obj: unknown) => {
  //   await setElectronMock(apiName, funcName, undefined, Promise.resolve(obj));
  //   mock.mockResolvedValue(obj);
  //   return mock;
  // };

  // mock.mockResolvedValueOnce = async (obj: unknown) => {
  //   const implementationFn = () => mock.mockReset();
  //   await setElectronMock(apiName, funcName, implementationFn, Promise.resolve(obj));
  //   mock.mockResolvedValueOnce(obj);
  //   return mock;
  // };

  // mock.mockRejectedValue = async (obj: unknown) => {
  //   await setElectronMock(apiName, funcName, undefined, Promise.reject(obj));
  //   mock.mockReturnValue(obj);
  //   return mock;
  // };

  // mock.mockRejectedValueOnce = async (obj: unknown) => {
  //   const implementationFn = () => mock.mockReset();
  //   await setElectronMock(apiName, funcName, implementationFn, Promise.reject(obj));
  //   mock.mockRejectedValueOnce(obj);
  //   return mock;
  // };

  return mock;
}
