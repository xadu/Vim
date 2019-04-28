import * as vscode from 'vscode';
import * as assert from 'assert';

import { getAndUpdateModeHandler } from '../../extension';
import { commandLine } from '../../src/cmd_line/commandLine';
import { ModeHandler } from '../../src/mode/modeHandler';
import { createRandomFile, setupWorkspace, cleanUpWorkspace } from '../testUtils';

suite('cmd_line tab', () => {
  let modeHandler: ModeHandler;

  suiteSetup(async () => {
    await setupWorkspace();
    modeHandler = await getAndUpdateModeHandler();
  });

  suiteTeardown(cleanUpWorkspace);

  test('tabe with no arguments when not in workspace opens an untitled file', async () => {
    const beforeEditor = vscode.window.activeTextEditor;
    await commandLine.Run('tabe', modeHandler.vimState);
    const afterEditor = vscode.window.activeTextEditor;

    assert.notEqual(beforeEditor, afterEditor, 'Active editor did not change');
  });

  test('tabedit with no arguments when not in workspace opens an untitled file', async () => {
    const beforeEditor = vscode.window.activeTextEditor;
    await commandLine.Run('tabedit', modeHandler.vimState);
    const afterEditor = vscode.window.activeTextEditor;

    assert.notEqual(beforeEditor, afterEditor, 'Active editor did not change');
  });

  test('tabe with absolute path when not in workspace opens file', async () => {
    const filePath = await createRandomFile('', '');
    await commandLine.Run(`tabe ${filePath}`, modeHandler.vimState);
    const editor = vscode.window.activeTextEditor;

    if (editor === undefined) {
      assert.fail('File did not open');
    } else {
      if (process.platform !== 'win32') {
        assert.equal(editor.document.fileName, filePath, 'Opened wrong file');
      } else {
        assert.equal(
          editor.document.fileName.toLowerCase(),
          filePath.toLowerCase(),
          'Opened wrong file'
        );
      }
    }
  });

  test('tabe with current file path does nothing', async () => {
    const filePath = await createRandomFile('', '');
    await commandLine.Run(`tabe ${filePath}`, modeHandler.vimState);

    const beforeEditor = vscode.window.activeTextEditor;
    await commandLine.Run(`tabe ${filePath}`, modeHandler.vimState);
    const afterEditor = vscode.window.activeTextEditor;

    assert.equal(
      beforeEditor,
      afterEditor,
      'Active editor changed even though :tabe opened the same file'
    );
  });
});
