import { promises as fs } from 'fs';
import path from 'path';
import { load } from 'js-yaml';

import log from './log.js';

interface ReadConfigResult<T> {
  readonly result: T;
  readonly configFile: string;
}

interface ReadConfigRequest {
  configFilename: string;
  projectDir: string;
}

async function readConfig<T>(configFile: string): Promise<ReadConfigResult<T>> {
  const data = await fs.readFile(configFile, 'utf8');
  log.info(`Builder config file was detected: ${configFile}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any;
  if (configFile.endsWith('.json5') || configFile.endsWith('.json')) {
    result = (await import('json5')).parse(data);
  } else {
    result = load(data);
  }
  return { result, configFile };
}

export async function findBuilderConfig<T>(request: ReadConfigRequest): Promise<ReadConfigResult<T> | undefined> {
  const prefix = request.configFilename;
  return findAndReadConfig(request, [`${prefix}.yml`, `${prefix}.yaml`, `${prefix}.json`, `${prefix}.json5`]);
}

async function findAndReadConfig<T>(
  request: ReadConfigRequest,
  configFiles: string[],
): Promise<ReadConfigResult<T> | undefined> {
  for (const configFile of configFiles) {
    const data = await orIfFileNotExist(readConfig<T>(path.join(request.projectDir, configFile)), undefined);
    if (data) {
      return data;
    }
  }
  return undefined;
}
async function orIfFileNotExist<T>(promise: Promise<T>, fallbackValue: T): Promise<T> {
  try {
    return await promise;
  } catch (_e) {
    return fallbackValue;
  }
}
