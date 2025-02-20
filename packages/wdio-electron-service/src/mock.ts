import { fn as vitestFn, type Mock } from '@vitest/spy';
import { print, parse } from 'recast';
import * as babelParser from '@babel/parser';
import { namedTypes as n, builders as b } from 'ast-types';
import type {
  AbstractFn,
  ElectronApiFn,
  ElectronInterface,
  ElectronMock,
  ElectronType,
  ExecuteOpts,
} from '@wdio/electron-types';
import { MOCK_CALL_EVENT_PREFIX } from './constants';

async function restoreElectronFunctionality(apiName: string, funcName: string) {
  await browser.electron.execute<void, [string, string, ExecuteOpts]>(
    (electron, apiName, funcName) => {
      const electronApi = electron[apiName as keyof typeof electron];
      const originalApi = globalThis.originalApi as Record<ElectronInterface, ElectronType[ElectronInterface]>;
      const originalApiMethod = originalApi[apiName as keyof typeof originalApi][
        funcName as keyof ElectronType[ElectronInterface]
      ] as ElectronApiFn;

      (electronApi[funcName as keyof typeof electronApi] as Mock).mockImplementation(originalApiMethod);
    },
    apiName,
    funcName,
    { internal: true },
  );
}
//remove first arg `electron`. electron can be access as global scope.
const addEventLog = (funcStr: string, apiName: string, funcName: string) => {
  // generate ATS
  const ast = parse(funcStr, {
    parser: {
      parse: (source: string) =>
        babelParser.parse(source, {
          sourceType: 'module',
          plugins: ['typescript'],
        }),
    },
  });

  let funcNode = null;
  const topLevelNode = ast.program.body[0];

  if (topLevelNode.type === 'ExpressionStatement') {
    // Arrow function
    funcNode = topLevelNode.expression;
  } else if (topLevelNode.type === 'FunctionDeclaration') {
    // Function declaration
    funcNode = topLevelNode;
  }

  if (!funcNode) {
    throw new Error('Unsupported function type');
  }

  const logStatement = b.expressionStatement(
    b.callExpression(b.memberExpression(b.identifier('console'), b.identifier('log')), [
      b.stringLiteral(`${MOCK_CALL_EVENT_PREFIX}electron.${apiName}.${funcName}`),
    ]),
  );

  if (!n.BlockStatement.check(funcNode.body)) {
    const returnStatement = b.returnStatement(funcNode.body);
    funcNode.body = b.blockStatement([logStatement, returnStatement]);
  } else {
    funcNode.body.body.unshift(logStatement);
  }

  return print(ast).code;
};

export async function createMock(apiName: string, funcName: string) {
  const outerMock = vitestFn();
  const outerMockImplementation = outerMock.mockImplementation;
  const outerMockImplementationOnce = outerMock.mockImplementationOnce;
  const outerMockClear = outerMock.mockClear;
  const outerMockReset = outerMock.mockReset;

  outerMock.mockName(`electron.${apiName}.${funcName}`);

  const mock = outerMock as unknown as ElectronMock;

  mock.__isElectronMock = true;

  const defaultImplementation = () => undefined;
  const transformedCode = addEventLog(defaultImplementation.toString(), apiName, funcName);
  // initialise inner (Electron) mock
  await browser.electron.execute<void, [string, string, string, ExecuteOpts]>(
    async (electron, apiName, funcName, defaultImplementation) => {
      const electronApi = electron[apiName as keyof typeof electron];
      const spy = await import('@vitest/spy');
      const mockFn = spy.fn(new Function(`return ${defaultImplementation}`)() as AbstractFn);
      electronApi[funcName as keyof typeof electronApi] = mockFn as ElectronApiFn;
    },
    apiName,
    funcName,
    transformedCode,
    { internal: true },
  );

  mock.update = async () => {
    // synchronises inner and outer mocks
    const calls = await browser.electron.execute<unknown[][], [string, string, ExecuteOpts]>(
      (electron, apiName, funcName) => {
        const mockObj = electron[apiName as keyof typeof electron][
          funcName as keyof ElectronType[ElectronInterface]
        ] as ElectronMock;
        return mockObj.mock?.calls ? JSON.parse(JSON.stringify(mockObj.mock?.calls)) : [];
      },
      apiName,
      funcName,
      { internal: true },
    );

    // re-apply calls from the electron main process mock to the outer one
    if (mock.mock.calls.length < calls.length) {
      calls.forEach((call: unknown[], index: number) => {
        if (!mock.mock.calls[index]) {
          mock?.apply(mock, call);
        }
      });
    }

    return mock;
  };

  mock.mockImplementation = async (implFn: AbstractFn) => {
    const transformedCode = addEventLog(implFn.toString(), apiName, funcName);
    await browser.electron.execute<void, [string, string, string, ExecuteOpts]>(
      (electron, apiName, funcName, mockImplementationStr) => {
        const electronApi = electron[apiName as keyof typeof electron];
        const mockImpl = new Function(`return ${mockImplementationStr}`)() as AbstractFn;
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockImplementation(mockImpl);
      },
      apiName,
      funcName,
      transformedCode,
      { internal: true },
    );
    outerMockImplementation(implFn);

    return mock;
  };

  mock.mockImplementationOnce = async (implFn: AbstractFn) => {
    const transformedCode = addEventLog(implFn.toString(), apiName, funcName);
    await browser.electron.execute<void, [string, string, string, ExecuteOpts]>(
      (electron, apiName, funcName, mockImplementationStr) => {
        const electronApi = electron[apiName as keyof typeof electron];
        const mockImpl = new Function(`return ${mockImplementationStr}`)() as AbstractFn;
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockImplementationOnce(mockImpl);
      },
      apiName,
      funcName,
      transformedCode,
      { internal: true },
    );
    outerMockImplementationOnce(implFn);

    return mock;
  };

  mock.mockReturnValue = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, returnValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockReturnValue(returnValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockReturnValueOnce = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, returnValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockReturnValueOnce(returnValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockResolvedValue = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, resolvedValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockResolvedValue(resolvedValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockResolvedValueOnce = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, resolvedValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockResolvedValueOnce(resolvedValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockRejectedValue = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, rejectedValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockRejectedValue(rejectedValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockRejectedValueOnce = async (value: unknown) => {
    await browser.electron.execute<void, [string, string, unknown, ExecuteOpts]>(
      (electron, apiName, funcName, rejectedValue) => {
        const electronApi = electron[apiName as keyof typeof electron];
        (electronApi[funcName as keyof typeof electronApi] as Mock).mockRejectedValueOnce(rejectedValue);
      },
      apiName,
      funcName,
      value,
      { internal: true },
    );

    return mock;
  };

  mock.mockClear = async () => {
    // clears mock history
    await browser.electron.execute<void, [string, string, ExecuteOpts]>(
      (electron, apiName, funcName) => {
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).mockClear();
      },
      apiName,
      funcName,
      { internal: true },
    );
    outerMockClear();

    return mock;
  };

  mock.mockReset = async () => {
    // resets inner implementation to an empty function and clears mock history
    await browser.electron.execute<void, [string, string, ExecuteOpts]>(
      (electron, apiName, funcName) => {
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).mockReset();
      },
      apiName,
      funcName,
      { internal: true },
    );
    outerMockReset();

    // vitest mockReset doesn't clear mock history so we need to explicitly clear both mocks
    await mock.mockClear();

    return mock;
  };

  mock.mockRestore = async () => {
    // restores inner mock implementation to the original function
    await restoreElectronFunctionality(apiName, funcName);

    // clear mocks
    outerMockClear();
    await mock.mockClear();

    return mock;
  };

  mock.mockReturnThis = async () => {
    return await browser.electron.execute<void, [string, string, ExecuteOpts]>(
      (electron, apiName, funcName) => {
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).mockReturnThis();
      },
      apiName,
      funcName,
      { internal: true },
    );
  };

  mock.withImplementation = async (implFn, callbackFn) => {
    return await browser.electron.execute<unknown, [string, string, string, string, ExecuteOpts]>(
      async (electron, apiName, funcName, implFnStr, callbackFnStr) => {
        const callback = new Function(`return ${callbackFnStr}`)() as AbstractFn;
        const impl = new Function(`return ${implFnStr}`)() as AbstractFn;
        let result: unknown | Promise<unknown>;
        (
          electron[apiName as keyof typeof electron][funcName as keyof ElectronType[ElectronInterface]] as Mock
        ).withImplementation(impl, () => {
          result = callback(electron);
        });

        return (result as Promise<unknown>)?.then ? await result : result;
      },
      apiName,
      funcName,
      implFn.toString(),
      callbackFn.toString(),
      { internal: true },
    );
  };

  return mock;
}
