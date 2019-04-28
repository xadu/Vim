import * as assert from 'assert';
import * as vscode from 'vscode';
import { Position } from '../../src/common/motion/position';
import { Range } from '../../src/common/motion/range';
import { VimState } from '../../src/state/vimState';
import { setupWorkspace, cleanUpWorkspace } from '../testUtils';

suite('VimState', () => {
  setup(async () => {
    await setupWorkspace();
  });

  teardown(cleanUpWorkspace);

  test('de-dupes cursors', () => {
    // setup
    const vimState = new VimState(vscode.window.activeTextEditor!);
    const cursorStart = new Position(0, 0);
    const cursorStop = new Position(0, 1);
    const initialCursors = [new Range(cursorStart, cursorStop), new Range(cursorStart, cursorStop)];

    // test
    vimState.cursors = initialCursors;

    // assert
    assert.equal(vimState.cursors.length, 1);
  });

  test('cursorStart/cursorStop should be first cursor in cursors', () => {
    // setup
    const vimState = new VimState(vscode.window.activeTextEditor!);
    const cursorStart = new Position(0, 0);
    const cursorStop = new Position(0, 1);
    const initialCursors = [
      new Range(cursorStart, cursorStop),
      new Range(new Position(1, 0), new Position(1, 1)),
    ];

    // test
    vimState.cursors = initialCursors;

    // assert
    assert.equal(vimState.cursors.length, 2);
    assert.equal(vimState.isMultiCursor, true);
    vimState.cursorStartPosition = cursorStart;
    vimState.cursorStopPosition = cursorStop;
  });
});
