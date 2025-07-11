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

import fs from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';

import { defineTool } from './tool.js';
import { sanitizeForFilePath } from './utils.js';

import type { Context } from '../context.js';

const saveProfileSchema = z.object({
  name: z.string().describe('Name for the work profile'),
  description: z.string().optional().describe('Optional description for the work profile'),
});

const switchProfileSchema = z.object({
  name: z.string().describe('Name of the work profile to switch to'),
});

const listProfilesSchema = z.object({});

const deleteProfileSchema = z.object({
  name: z.string().describe('Name of the work profile to delete'),
});

async function getProfilesDir(): Promise<string> {
  let profilesDir: string;
  if (process.platform === 'linux')
    profilesDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  else if (process.platform === 'darwin')
    profilesDir = path.join(os.homedir(), 'Library', 'Application Support');
  else if (process.platform === 'win32')
    profilesDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  else
    throw new Error('Unsupported platform: ' + process.platform);

  const result = path.join(profilesDir, 'darbot-browser-mcp', 'work-profiles');
  await fs.promises.mkdir(result, { recursive: true });
  return result;
}

async function saveCurrentProfile(context: Context, profileName: string, description?: string) {
  const profilesDir = await getProfilesDir();
  const sanitizedName = sanitizeForFilePath(profileName);
  const profileDir = path.join(profilesDir, sanitizedName);

  await fs.promises.mkdir(profileDir, { recursive: true });

  // Get current browser state
  const tab = context.currentTabOrDie();
  const url = tab.page.url();
  const title = await tab.title();

  // Save profile metadata
  const profileData = {
    name: profileName,
    description: description || '',
    created: new Date().toISOString(),
    url,
    title,
  };

  await fs.promises.writeFile(
      path.join(profileDir, 'profile.json'),
      JSON.stringify(profileData, null, 2)
  );

  // Save storage state (cookies, localStorage, etc.)
  try {
    const storageState = await tab.page.context().storageState();
    await fs.promises.writeFile(
        path.join(profileDir, 'storage-state.json'),
        JSON.stringify(storageState, null, 2)
    );
  } catch (error) {
    // Storage state save failed, but we can still save the profile
    // eslint-disable-next-line no-console
    console.warn('Failed to save storage state:', error);
  }

  return profileData;
}

async function loadProfile(context: Context, profileName: string) {
  const profilesDir = await getProfilesDir();
  const sanitizedName = sanitizeForFilePath(profileName);
  const profileDir = path.join(profilesDir, sanitizedName);

  if (!fs.existsSync(profileDir))
    throw new Error(`Work profile "${profileName}" not found`);

  // Load profile metadata
  const profileDataPath = path.join(profileDir, 'profile.json');
  const profileData = JSON.parse(await fs.promises.readFile(profileDataPath, 'utf8'));

  // Load storage state if available
  const storageStatePath = path.join(profileDir, 'storage-state.json');
  if (fs.existsSync(storageStatePath)) {
    const storageState = JSON.parse(await fs.promises.readFile(storageStatePath, 'utf8'));

    // Create new context with the stored state
    const tab = await context.ensureTab();
    const newContext = await tab.page.context().browser()?.newContext({
      storageState,
      viewport: null,
    });

    if (newContext) {
      const newPage = await newContext.newPage();
      await newPage.goto(profileData.url);
      return { profileData, restored: true };
    }
  }

  // Fallback: just navigate to the URL
  const tab = await context.ensureTab();
  await tab.page.goto(profileData.url);
  return { profileData, restored: false };
}

async function listProfiles() {
  const profilesDir = await getProfilesDir();
  const profiles = [];

  try {
    const entries = await fs.promises.readdir(profilesDir);
    for (const entry of entries) {
      const profileDir = path.join(profilesDir, entry);
      const stat = await fs.promises.stat(profileDir);
      if (stat.isDirectory()) {
        const profileDataPath = path.join(profileDir, 'profile.json');
        if (fs.existsSync(profileDataPath)) {
          const profileData = JSON.parse(await fs.promises.readFile(profileDataPath, 'utf8'));
          profiles.push(profileData);
        }
      }
    }
  } catch (error) {
    // Profiles directory doesn't exist yet
    return [];
  }

  return profiles;
}

async function deleteProfile(profileName: string) {
  const profilesDir = await getProfilesDir();
  const sanitizedName = sanitizeForFilePath(profileName);
  const profileDir = path.join(profilesDir, sanitizedName);

  if (!fs.existsSync(profileDir))
    throw new Error(`Work profile "${profileName}" not found`);

  await fs.promises.rmdir(profileDir, { recursive: true });
}

export const browserSaveProfile = defineTool({
  capability: 'core' as const,
  schema: {
    name: 'browser_save_profile',
    title: 'Save Work Profile',
    description: 'Save the current browser state as a work profile',
    inputSchema: saveProfileSchema,
    type: 'destructive',
  },
  handle: async (context: Context, { name, description }: z.infer<typeof saveProfileSchema>) => {
    const profileData = await saveCurrentProfile(context, name, description);

    return {
      code: [`await saveWorkProfile('${name}', '${description || ''}')`],
      action: async () => ({ content: [] }),
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `Work profile "${name}" saved successfully.\n\nProfile details:\n- Name: ${profileData.name}\n- Description: ${profileData.description}\n- URL: ${profileData.url}\n- Title: ${profileData.title}\n- Created: ${profileData.created}`,
        }],
      },
    };
  },
});

export const browserSwitchProfile = defineTool({
  capability: 'core' as const,
  schema: {
    name: 'browser_switch_profile',
    title: 'Switch Work Profile',
    description: 'Switch to a saved work profile',
    inputSchema: switchProfileSchema,
    type: 'destructive',
  },
  handle: async (context: Context, { name }: z.infer<typeof switchProfileSchema>) => {
    const result = await loadProfile(context, name);

    return {
      code: [`await switchToWorkProfile('${name}')`],
      action: async () => ({ content: [] }),
      captureSnapshot: true,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `Switched to work profile "${name}".\n\nProfile details:\n- Name: ${result.profileData.name}\n- Description: ${result.profileData.description}\n- URL: ${result.profileData.url}\n- Title: ${result.profileData.title}\n- Storage state ${result.restored ? 'restored' : 'not available'}`,
        }],
      },
    };
  },
});

export const browserListProfiles = defineTool({
  capability: 'core' as const,
  schema: {
    name: 'browser_list_profiles',
    title: 'List Work Profiles',
    description: 'List all saved work profiles',
    inputSchema: listProfilesSchema,
    type: 'readOnly',
  },
  handle: async (context: Context, {}: z.infer<typeof listProfilesSchema>) => {
    const profiles = await listProfiles();

    let text = '### Saved Work Profiles\n\n';

    if (profiles.length === 0) {
      text += 'No work profiles saved yet. Use the "browser_save_profile" tool to save your current browser state as a work profile.';
    } else {
      for (const profile of profiles) {
        text += `**${profile.name}**\n`;
        if (profile.description)
          text += `- Description: ${profile.description}\n`;
        text += `- URL: ${profile.url}\n`;
        text += `- Title: ${profile.title}\n`;
        text += `- Created: ${new Date(profile.created).toLocaleString()}\n\n`;
      }
    }

    return {
      code: ['await listWorkProfiles()'],
      action: async () => ({ content: [] }),
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text,
        }],
      },
    };
  },
});

export const browserDeleteProfile = defineTool({
  capability: 'core' as const,
  schema: {
    name: 'browser_delete_profile',
    title: 'Delete Work Profile',
    description: 'Delete a saved work profile',
    inputSchema: deleteProfileSchema,
    type: 'destructive',
  },
  handle: async (context: Context, { name }: z.infer<typeof deleteProfileSchema>) => {
    await deleteProfile(name);

    return {
      code: [`await deleteWorkProfile('${name}')`],
      action: async () => ({ content: [] }),
      captureSnapshot: false,
      waitForNetwork: false,
      resultOverride: {
        content: [{
          type: 'text',
          text: `Work profile "${name}" deleted successfully.`,
        }],
      },
    };
  },
});
