/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fork } from 'child_process';
import path from 'path';

import { z } from 'zod';
import { defineTool } from './tool.js';

import { fileURLToPath } from 'node:url';

const install = defineTool({
  capability: 'install',
  schema: {
    name: 'browser_install',
    title: 'Autonomous browser installation',
    description: 'Autonomously install the required browser engine specified in configuration. Use this to resolve browser installation errors.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async context => {
    const channel = context.config.browser?.launchOptions?.channel ?? context.config.browser?.browserName ?? 'msedge';
    const cliUrl = import.meta.resolve('playwright/package.json');
    const cliPath = path.join(fileURLToPath(cliUrl), '..', 'cli.js');
    const child = fork(cliPath, ['install', channel], {
      stdio: 'pipe',
    });
    const output: string[] = [];
    child.stdout?.on('data', data => output.push(data.toString()));
    child.stderr?.on('data', data => output.push(data.toString()));
    await new Promise<void>((resolve, reject) => {
      child.on('close', code => {
        if (code === 0)
          resolve();
        else
          reject(new Error(`Failed to install browser: ${output.join('')}`));
      });
    });
    return {
      code: [`// Browser ${channel} installed`],
      captureSnapshot: false,
      waitForNetwork: false,
    };
  },
});

export default [
  install,
];
