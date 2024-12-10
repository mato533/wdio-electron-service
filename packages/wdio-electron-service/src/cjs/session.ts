import { remote } from 'webdriverio';
import type { Options } from '@wdio/types';

import { CJSElectronLauncher, CJSElectronService } from './classes.js';
import { CUSTOM_CAPABILITY_NAME, WDIO_CHROMEDRIVER_OPTIONS, GOOG_CHROME_OPTIONS } from './constants.js';

export async function init(capabilities: WebdriverIO.Capabilities, options?: Options.Testrunner) {
  // CJS variants of the Launcher and Service classes are needed here
  // - which is why we are not simply doing a dynamic import of `../session.js`
  const testRunnerOpts = options || ({} as Options.Testrunner);

  const serviceOpts = capabilities[CUSTOM_CAPABILITY_NAME] || {};
  const ChromeOpts = capabilities[GOOG_CHROME_OPTIONS] || {};
  const ChromeDriver = capabilities[WDIO_CHROMEDRIVER_OPTIONS] || {};

  let resolvedCapabilities = {
    browserName: 'electron',
    [CUSTOM_CAPABILITY_NAME]: serviceOpts,
    [WDIO_CHROMEDRIVER_OPTIONS]: ChromeDriver,
    [GOOG_CHROME_OPTIONS]: ChromeOpts,
  };

  const launcher = new CJSElectronLauncher(
    resolvedCapabilities[CUSTOM_CAPABILITY_NAME],
    resolvedCapabilities,
    testRunnerOpts,
  );
  const service = new CJSElectronService(resolvedCapabilities[CUSTOM_CAPABILITY_NAME]);

  await launcher.onPrepare(testRunnerOpts, [resolvedCapabilities]);

  // initialise session
  const browser = await remote({
    capabilities: resolvedCapabilities,
  });

  await service.before(resolvedCapabilities, [], browser);

  return browser;
}
