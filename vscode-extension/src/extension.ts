/**
 * Copyright (c) 2024 DarbotLabs
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

let mcpServerProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(browser) MCP: Stopped';
  statusBarItem.tooltip = 'Browser MCP Server Status';
  statusBarItem.command = 'darbot-browser-mcp.showStatus';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  const startServerCommand = vscode.commands.registerCommand('darbot-browser-mcp.startServer', startServer);
  const stopServerCommand = vscode.commands.registerCommand('darbot-browser-mcp.stopServer', stopServer);
  const showStatusCommand = vscode.commands.registerCommand('darbot-browser-mcp.showStatus', showStatus);

  context.subscriptions.push(startServerCommand, stopServerCommand, showStatusCommand);

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('darbot-browser-mcp');
  if (config.get('autoStart', false))
    void startServer();
}

export function deactivate() {
  if (mcpServerProcess) {
    mcpServerProcess.kill();
    mcpServerProcess = null;
  }
  if (statusBarItem)
    statusBarItem.dispose();
}

async function startServer() {
  if (mcpServerProcess) {
    void vscode.window.showInformationMessage('Browser MCP Server is already running');
    return;
  }

  const config = vscode.workspace.getConfiguration('darbot-browser-mcp');
  const serverPath = config.get('serverPath', 'npx @darbotlabs/darbot-browser-mcp@latest');
  const logLevel = config.get('logLevel', 'info');

  try {
    // Parse the command
    const parts = serverPath.split(' ');
    const command = parts[0];
    const args = parts.slice(1);

    // Add log level if specified
    if (logLevel !== 'info')
      args.push('--log-level', logLevel);

    mcpServerProcess = spawn(command, args, {
      stdio: 'pipe',
      shell: true,
    });

    mcpServerProcess.on('error', error => {
      void vscode.window.showErrorMessage(`Failed to start Browser MCP Server: ${error.message}`);
      mcpServerProcess = null;
      updateStatusBarItem(false);
    });

    mcpServerProcess.on('exit', code => {
      if (code !== 0)
        void vscode.window.showErrorMessage(`Browser MCP Server exited with code ${code}`);
      mcpServerProcess = null;
      updateStatusBarItem(false);
    });

    mcpServerProcess.stdout?.on('data', data => {
      // Log server output for debugging
      void data;
    });

    mcpServerProcess.stderr?.on('data', data => {
      // Log server errors for debugging
      void data;
    });

    updateStatusBarItem(true);
    void vscode.window.showInformationMessage('Browser MCP Server started successfully');
  } catch (error) {
    void vscode.window.showErrorMessage(`Failed to start Browser MCP Server: ${error}`);
    updateStatusBarItem(false);
  }
}

function stopServer() {
  if (!mcpServerProcess) {
    void vscode.window.showInformationMessage('Browser MCP Server is not running');
    return;
  }

  mcpServerProcess.kill();
  mcpServerProcess = null;
  updateStatusBarItem(false);
  void vscode.window.showInformationMessage('Browser MCP Server stopped');
}

function showStatus() {
  const isRunning = mcpServerProcess !== null;
  const status = isRunning ? 'Running' : 'Stopped';
  const config = vscode.workspace.getConfiguration('darbot-browser-mcp');
  const serverPath = config.get('serverPath', 'npx @darbotlabs/darbot-browser-mcp@latest');

  vscode.window.showInformationMessage(
      `Browser MCP Server Status: ${status}\nCommand: ${serverPath}`,
      ...(isRunning ? ['Stop Server'] : ['Start Server']),
  ).then(selection => {
    if (selection === 'Start Server')
      void startServer();
    else if (selection === 'Stop Server')
      stopServer();
  });
}

function updateStatusBarItem(isRunning: boolean) {
  if (statusBarItem) {
    statusBarItem.text = isRunning ? '$(browser) MCP: Running' : '$(browser) MCP: Stopped';
    statusBarItem.backgroundColor = isRunning
      ? new vscode.ThemeColor('statusBarItem.prominentBackground')
      : undefined;
  }
}
