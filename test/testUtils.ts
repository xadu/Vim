import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import * as vscode from 'vscode';

import { Configuration } from './testConfiguration';
import { Globals } from '../src/globals';
import { ValidatorResults } from '../src/configuration/iconfigurationValidator';
import { IConfiguration } from '../src/configuration/iconfiguration';
import { TextEditor } from '../src/textEditor';
import { getAndUpdateModeHandler } from '../extension';
import { commandLine } from '../src/cmd_line/commandLine';

export function rndName(): string {
  return Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, '')
    .substr(0, 10);
}

export async function createRandomFile(contents: string, fileExtension: string): Promise<string> {
  const tmpFile = join(os.tmpdir(), rndName() + fileExtension);
  fs.writeFileSync(tmpFile, contents);
  return tmpFile;
}

/**
 * Waits for the number of text editors in the current window to equal the
 * given expected number of text editors.
 *
 * @param numExpectedEditors Expected number of editors in the window
 */
export async function WaitForEditorsToClose(numExpectedEditors: number = 0): Promise<void> {
  let waitForTextEditorsToClose = new Promise((c, e) => {
    if (vscode.window.visibleTextEditors.length === numExpectedEditors) {
      return c();
    }

    vscode.window.onDidChangeVisibleTextEditors(() => {
      if (vscode.window.visibleTextEditors.length === numExpectedEditors) {
        c();
      }
    });
  });

  try {
    await waitForTextEditorsToClose;
  } catch (error) {
    assert.fail(null, null, error.toString(), '');
  }
}

export function assertEqualLines(expectedLines: string[]) {
  for (let i = 0; i < expectedLines.length; i++) {
    let expected = expectedLines[i];
    let actual = TextEditor.readLineAt(i);
    assert.equal(
      actual,
      expected,
      `Content does not match; Expected=${expected}. Actual=${actual}.`
    );
  }

  assert.equal(TextEditor.getLineCount(), expectedLines.length, 'Line count does not match.');
}

/**
 * Assert that the first two arguments are equal, and fail a test otherwise.
 *
 * The only difference between this and assert.equal is that here we
 * check to ensure the types of the variables are correct.
 */
export function assertEqual<T>(one: T, two: T, message: string = ''): void {
  assert.equal(one, two, message);
}

export async function setupWorkspace(
  config: IConfiguration = new Configuration(),
  fileExtension: string = ''
): Promise<any> {
  await commandLine.load();
  const filePath = await createRandomFile('', fileExtension);
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));

  await vscode.window.showTextDocument(doc);

  Globals.mockConfiguration = config;
  await reloadConfiguration();

  let activeTextEditor = vscode.window.activeTextEditor;
  assert.ok(activeTextEditor);

  activeTextEditor!.options.tabSize = config.tabstop;
  activeTextEditor!.options.insertSpaces = config.expandtab;

  await mockAndEnable();
}

const mockAndEnable = async () => {
  await vscode.commands.executeCommand('setContext', 'vim.active', true);
  const mh = await getAndUpdateModeHandler();
  Globals.mockModeHandler = mh;
  await mh.handleKeyEvent('<ExtensionEnable>');
};

export async function cleanUpWorkspace(): Promise<any> {
  return new Promise((c, e) => {
    if (vscode.window.visibleTextEditors.length === 0) {
      return c();
    }

    // TODO: the visibleTextEditors variable doesn't seem to be
    // up to date after a onDidChangeActiveTextEditor event, not
    // even using a setTimeout 0... so we MUST poll :(
    let interval = setInterval(() => {
      if (vscode.window.visibleTextEditors.length > 0) {
        return;
      }

      clearInterval(interval);
      c();
    }, 10);

    vscode.commands.executeCommand('workbench.action.closeAllEditors').then(
      () => null,
      (err: any) => {
        clearInterval(interval);
        e(err);
      }
    );
  }).then(() => {
    assert.equal(vscode.window.visibleTextEditors.length, 0, 'Expected all editors closed.');
    assert(!vscode.window.activeTextEditor, 'Expected no active text editor.');
  });
}

export async function reloadConfiguration() {
  let validatorResults = (await require('../src/configuration/configuration').configuration.load()) as ValidatorResults;
  for (let validatorResult of validatorResults.get()) {
    console.log(validatorResult);
  }
}

/**
 * Waits for the tabs to change after a command like 'gt' or 'gT' is run.
 * Sometimes it is not immediate, so we must busy wait
 * On certain versions, the tab changes are synchronous
 * For those, a timeout is given
 */
export async function waitForTabChange(): Promise<void> {
  await new Promise((resolve, reject) => {
    setTimeout(resolve, 500);

    const disposer = vscode.window.onDidChangeActiveTextEditor(textEditor => {
      disposer.dispose();

      resolve(textEditor);
    });
  });
}
