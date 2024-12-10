import { remote } from 'webdriverio';
import type { Options } from '@wdio/types';

import ElectronWorkerService from './service.js';
import ElectronLaunchService from './launcher.js';
import { CUSTOM_CAPABILITY_NAME, WDIO_CHROMEDRIVER_OPTIONS, GOOG_CHROME_OPTIONS } from './constants.js';
import log from '@wdio/electron-utils/log';

export async function init(capabilities: WebdriverIO.Capabilities, options?: Options.Testrunner) {
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

  const launcher = new ElectronLaunchService(
    resolvedCapabilities[CUSTOM_CAPABILITY_NAME],
    resolvedCapabilities,
    testRunnerOpts,
  );
  const service = new ElectronWorkerService(resolvedCapabilities[CUSTOM_CAPABILITY_NAME]);

  await launcher.onPrepare(testRunnerOpts, [resolvedCapabilities]);

  log.debug('Session capabilities:', resolvedCapabilities);

  // initialise session
  const browser = await remote({
    capabilities: resolvedCapabilities,
  });

  await service.before(resolvedCapabilities, [], browser);

  return browser;
}
