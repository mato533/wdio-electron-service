import { browser as wdioBrowser } from '@wdio/globals';

import type { Options } from '@wdio/types';

import { init as initSession } from './session.js';
import { CJSElectronLauncher, CJSElectronService } from './classes.js';

export default CJSElectronService;
export const launcher = CJSElectronLauncher;

export const browser: WebdriverIO.Browser = wdioBrowser;
export const startElectron: (
  capabilities: WebdriverIO.Capabilities,
  options?: Options.Testrunner,
) => Promise<WebdriverIO.Browser> = initSession;
