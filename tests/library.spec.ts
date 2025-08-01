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
import { test, expect } from './fixtures.js';
import fs from 'node:fs/promises';
import child_process from 'node:child_process';

test('library can be used from CommonJS', { annotation: { type: 'issue', description: 'https://github.com/darbotlabs/darbot-browser-mcp/issues/456' } }, async ({}, testInfo) => {
  const file = testInfo.outputPath('main.cjs');
  await fs.writeFile(file, `
    import('@darbotlabs/darbot-browser-mcp')
      .then(darbotBrowserMCP => darbotBrowserMCP.createConnection())
      .then(() => console.log('OK'));
 `);
  expect(child_process.execSync(`node ${file}`, { encoding: 'utf-8' })).toContain('OK');
});
