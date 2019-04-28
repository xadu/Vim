import * as vscode from 'vscode';

import { Position, PositionDiff } from './../common/motion/position';
import { Range } from './../common/motion/range';
import { configuration } from './../configuration/configuration';
import { ModeName } from './../mode/mode';
import { Register, RegisterMode } from './../register/register';
import { VimState } from './../state/vimState';
import { TextEditor } from './../textEditor';
import { BaseAction, RegisterAction } from './base';
import { CommandNumber } from './commands/actions';
import { TextObjectMovement } from './textobject';
import { ReportLinesChanged, ReportLinesYanked } from '../util/statusBarTextUtils';
import { IHighlightedYankConfiguration } from '../configuration/iconfiguration';

export class BaseOperator extends BaseAction {
  constructor(multicursorIndex?: number) {
    super();
    this.multicursorIndex = multicursorIndex;
  }
  canBeRepeatedWithDot = true;
  isOperator = true;

  /**
   * If this is being run in multi cursor mode, the index of the cursor
   * this operator is being applied to.
   */
  multicursorIndex: number | undefined = undefined;

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (this.doesRepeatedOperatorApply(vimState, keysPressed)) {
      return true;
    }
    if (this.modes.indexOf(vimState.currentMode) === -1) {
      return false;
    }
    if (!BaseAction.CompareKeypressSequence(this.keys, keysPressed)) {
      return false;
    }
    if (
      this.mustBeFirstKey &&
      vimState.recordedState.commandWithoutCountPrefix.length - keysPressed.length > 0
    ) {
      return false;
    }
    if (this instanceof BaseOperator && vimState.recordedState.operator) {
      return false;
    }

    return true;
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    if (this.modes.indexOf(vimState.currentMode) === -1) {
      return false;
    }
    if (!BaseAction.CompareKeypressSequence(this.keys.slice(0, keysPressed.length), keysPressed)) {
      return false;
    }
    if (
      this.mustBeFirstKey &&
      vimState.recordedState.commandWithoutCountPrefix.length - keysPressed.length > 0
    ) {
      return false;
    }
    if (this instanceof BaseOperator && vimState.recordedState.operator) {
      return false;
    }

    return true;
  }

  public doesRepeatedOperatorApply(vimState: VimState, keysPressed: string[]) {
    const nonCountActions = vimState.recordedState.actionsRun.filter(
      x => !(x instanceof CommandNumber)
    );
    const prevAction = nonCountActions[nonCountActions.length - 1];
    return (
      this.isOperator &&
      keysPressed.length === 1 &&
      prevAction &&
      this.modes.indexOf(vimState.currentMode) !== -1 &&
      // The previous action is the same as the one we're testing
      prevAction.constructor === this.constructor &&
      // The key pressed is the same as the previous action's last key.
      BaseAction.CompareKeypressSequence(prevAction.keysPressed.slice(-1), keysPressed)
    );
  }

  /**
   * Run this operator on a range, returning the new location of the cursor.
   */
  run(vimState: VimState, start: Position, stop: Position): Promise<VimState> {
    throw new Error('You need to override this!');
  }

  runRepeat(vimState: VimState, position: Position, count: number): Promise<VimState> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return this.run(
      vimState,
      position.getLineBegin(),
      position.getDownByCount(Math.max(0, count - 1)).getLineEnd()
    );
  }

  public highlightYankedRanges(vimState: VimState, ranges: vscode.Range[]) {
    if (!configuration.highlightedyank.enable) {
      return;
    }

    const yankDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: configuration.highlightedyank.color,
    });

    vimState.editor.setDecorations(yankDecoration, ranges);
    setTimeout(() => yankDecoration.dispose(), configuration.highlightedyank.duration);
  }
}

@RegisterAction
export class DeleteOperator extends BaseOperator {
  public keys = ['d'];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];

  /**
   * Deletes from the position of start to 1 past the position of end.
   */
  public async delete(
    start: Position,
    end: Position,
    currentMode: ModeName,
    registerMode: RegisterMode,
    vimState: VimState,
    yank = true
  ): Promise<Position> {
    if (registerMode === RegisterMode.LineWise) {
      start = start.getLineBegin();
      end = end.getLineEnd();
    }

    end = new Position(end.line, end.character + 1);

    const isOnLastLine = end.line === TextEditor.getLineCount() - 1;

    // Vim does this weird thing where it allows you to select and delete
    // the newline character, which it places 1 past the last character
    // in the line. Here we interpret a character position 1 past the end
    // as selecting the newline character. Don't allow this in visual block mode
    if (vimState.currentMode !== ModeName.VisualBlock) {
      if (end.character === TextEditor.getLineAt(end).text.length + 1) {
        end = end.getDown(0);
      }
    }

    let text = vimState.editor.document.getText(new vscode.Range(start, end));

    // If we delete linewise to the final line of the document, we expect the line
    // to be removed. This is actually a special case because the newline
    // character we've selected to delete is the newline on the end of the document,
    // but we actually delete the newline on the second to last line.

    // Just writing about this is making me more confused. -_-

    // rebornix: johnfn's description about this corner case is perfectly correct. The only catch is
    // that we definitely don't want to put the EOL in the register. So here we run the `getText`
    // expression first and then update the start position.

    // Now rebornix is confused as well.
    if (isOnLastLine && start.line !== 0 && registerMode === RegisterMode.LineWise) {
      start = start.getPreviousLineBegin().getLineEnd();
    }

    if (registerMode === RegisterMode.LineWise) {
      // slice final newline in linewise mode - linewise put will add it back.
      text = text.endsWith('\r\n')
        ? text.slice(0, -2)
        : text.endsWith('\n')
        ? text.slice(0, -1)
        : text;
    }

    if (yank) {
      Register.put(text, vimState, this.multicursorIndex);
    }

    let diff = new PositionDiff(0, 0);
    let resultingPosition: Position;

    if (currentMode === ModeName.Visual) {
      resultingPosition = Position.EarlierOf(start, end);
    }

    if (start.character > TextEditor.getLineAt(start).text.length) {
      resultingPosition = start.getLeft();
      diff = new PositionDiff(0, -1);
    } else {
      resultingPosition = start;
    }

    if (registerMode === RegisterMode.LineWise) {
      resultingPosition = resultingPosition.getLineBegin();
      diff = PositionDiff.NewBOLDiff();
    }

    vimState.recordedState.transformations.push({
      type: 'deleteRange',
      range: new Range(start, end),
      diff: diff,
    });

    return resultingPosition;
  }

  public async run(
    vimState: VimState,
    start: Position,
    end: Position,
    yank = true
  ): Promise<VimState> {
    let newPos = await this.delete(
      start,
      end,
      vimState.currentMode,
      vimState.effectiveRegisterMode,
      vimState,
      yank
    );

    await vimState.setCurrentMode(ModeName.Normal);
    if (vimState.currentMode === ModeName.Visual) {
      vimState.desiredColumn = newPos.character;
    }

    const numLinesDeleted = Math.abs(start.line - end.line) + 1;
    ReportLinesChanged(-numLinesDeleted, vimState);

    return vimState;
  }
}

@RegisterAction
export class DeleteOperatorVisual extends BaseOperator {
  public keys = ['D'];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    // ensures linewise deletion when in visual mode
    // see special case in DeleteOperator.delete()
    vimState.currentRegisterMode = RegisterMode.LineWise;

    return new DeleteOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
export class YankOperator extends BaseOperator {
  public keys = ['y'];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  canBeRepeatedWithDot = false;

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    // Hack to make Surround with y (which takes a motion) work.

    if (vimState.surround) {
      vimState.surround.range = new Range(start, end);
      await vimState.setCurrentMode(ModeName.SurroundInputMode);
      vimState.cursorStopPosition = start;
      vimState.cursorStartPosition = start;

      return vimState;
    }

    const originalMode = vimState.currentMode;

    if (end.isEarlierThan(start)) {
      [start, end] = [end, start];
    }
    let extendedEnd = new Position(end.line, end.character + 1);

    if (vimState.currentRegisterMode === RegisterMode.LineWise) {
      start = start.getLineBegin();
      extendedEnd = extendedEnd.getLineEnd();
    }

    const range = new vscode.Range(start, extendedEnd);
    let text = TextEditor.getText(range);

    // If we selected the newline character, add it as well.
    if (
      vimState.currentMode === ModeName.Visual &&
      extendedEnd.character === TextEditor.getLineAt(extendedEnd).text.length + 1
    ) {
      text = text + '\n';
    }

    this.highlightYankedRanges(vimState, [range]);

    Register.put(text, vimState, this.multicursorIndex);

    if (vimState.currentMode === ModeName.Visual || vimState.currentMode === ModeName.VisualLine) {
      vimState.historyTracker.addMark(start, '<');
      vimState.historyTracker.addMark(end, '>');
    }

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStartPosition = start;

    // Only change cursor position if we ran a text object movement
    let moveCursor = false;
    if (vimState.recordedState.actionsRun.length > 1) {
      if (vimState.recordedState.actionsRun[1] instanceof TextObjectMovement) {
        moveCursor = true;
      }
    }

    if (originalMode === ModeName.Normal && !moveCursor) {
      vimState.cursors = vimState.cursorsInitialState;
    } else {
      vimState.cursorStopPosition = start;
    }

    const numLinesYanked = text.split('\n').length;
    ReportLinesYanked(numLinesYanked, vimState);

    return vimState;
  }
}

@RegisterAction
export class ShiftYankOperatorVisual extends BaseOperator {
  public keys = ['Y'];
  public modes = [ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    return new YankOperator().run(vimState, start, end);
  }
}

@RegisterAction
export class DeleteOperatorXVisual extends BaseOperator {
  public keys = [['x'], ['<Del>']];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    return new DeleteOperator(this.multicursorIndex).run(vimState, start, end);
  }
}

@RegisterAction
export class ChangeOperatorSVisual extends BaseOperator {
  public keys = ['s'];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  // Don't clash with Sneak plugin
  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && !configuration.sneak;
  }

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    return new ChangeOperator().run(vimState, start, end);
  }
}

@RegisterAction
export class FormatOperator extends BaseOperator {
  public keys = ['='];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    // = operates on complete lines
    start = new Position(start.line, 0);
    end = end.getLineEnd();
    vimState.editor.selection = new vscode.Selection(start, end);
    await vscode.commands.executeCommand('editor.action.formatSelection');
    let line = vimState.cursorStartPosition.line;

    if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
      line = vimState.cursorStopPosition.line;
    }

    let newCursorPosition = new Position(line, 0).getFirstLineNonBlankChar();
    vimState.cursorStopPosition = newCursorPosition;
    vimState.cursorStartPosition = newCursorPosition;
    await vimState.setCurrentMode(ModeName.Normal);
    return vimState;
  }
}

@RegisterAction
export class UpperCaseOperator extends BaseOperator {
  public keys = [['g', 'U'], ['U']];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const range = new vscode.Range(start, new Position(end.line, end.character + 1));
    let text = vimState.editor.document.getText(range);

    await TextEditor.replace(range, text.toUpperCase());

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start;

    return vimState;
  }
}

@RegisterAction
export class UpperCaseWithMotion extends UpperCaseOperator {
  public keys = [['g', 'U']];
  public modes = [ModeName.Normal];
}

@RegisterAction
class UpperCaseVisualBlockOperator extends BaseOperator {
  public keys = [['g', 'U'], ['U']];
  public modes = [ModeName.VisualBlock];

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<VimState> {
    for (const { start, end } of Position.IterateLine(vimState)) {
      const range = new vscode.Range(start, end);
      let text = vimState.editor.document.getText(range);
      await TextEditor.replace(range, text.toUpperCase());
    }

    const cursorPosition = startPos.isBefore(endPos) ? startPos : endPos;
    vimState.cursorStopPosition = cursorPosition;
    vimState.cursorStartPosition = cursorPosition;
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}

@RegisterAction
export class LowerCaseOperator extends BaseOperator {
  public keys = [['g', 'u'], ['u']];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const range = new vscode.Range(start, new Position(end.line, end.character + 1));
    let text = vimState.editor.document.getText(range);

    await TextEditor.replace(range, text.toLowerCase());

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start;

    return vimState;
  }
}

@RegisterAction
export class LowerCaseWithMotion extends LowerCaseOperator {
  public keys = [['g', 'u']];
  public modes = [ModeName.Normal];
}

@RegisterAction
class LowerCaseVisualBlockOperator extends BaseOperator {
  public keys = [['g', 'u'], ['u']];
  public modes = [ModeName.VisualBlock];

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<VimState> {
    for (const { start, end } of Position.IterateLine(vimState)) {
      const range = new vscode.Range(start, end);
      let text = vimState.editor.document.getText(range);
      await TextEditor.replace(range, text.toLowerCase());
    }

    const cursorPosition = startPos.isBefore(endPos) ? startPos : endPos;
    vimState.cursorStopPosition = cursorPosition;
    vimState.cursorStartPosition = cursorPosition;
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}

@RegisterAction
class IndentOperator extends BaseOperator {
  modes = [ModeName.Normal];
  keys = ['>'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    vimState.editor.selection = new vscode.Selection(start.getLineBegin(), end.getLineEnd());

    await vscode.commands.executeCommand('editor.action.indentLines');

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start.getFirstLineNonBlankChar();

    return vimState;
  }
}

/**
 * `3>` to indent a line 3 times in visual mode is actually a bit of a special case.
 *
 * > is an operator, and generally speaking, you don't run operators multiple times, you run motions multiple times.
 * e.g. `d3w` runs `w` 3 times, then runs d once.
 *
 * Same with literally every other operator motion combination... until `3>`in visual mode
 * walked into my life.
 */
@RegisterAction
class IndentOperatorInVisualModesIsAWeirdSpecialCase extends BaseOperator {
  modes = [ModeName.Visual, ModeName.VisualLine];
  keys = ['>'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    // Repeating this command with dot should apply the indent to the previous selection
    if (vimState.isRunningDotCommand && vimState.dotCommandPreviousVisualSelection) {
      if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
        const shiftSelectionByNum =
          vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line;

        start = vimState.cursorStartPosition;
        const newEnd = vimState.cursorStartPosition.getDownByCount(shiftSelectionByNum);

        vimState.editor.selection = new vscode.Selection(start, newEnd);
      }
    }

    for (let i = 0; i < (vimState.recordedState.count || 1); i++) {
      await vscode.commands.executeCommand('editor.action.indentLines');
    }

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start.getFirstLineNonBlankChar();

    return vimState;
  }
}

@RegisterAction
class OutdentOperator extends BaseOperator {
  modes = [ModeName.Normal];
  keys = ['<'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    vimState.editor.selection = new vscode.Selection(start, end.getLineEnd());

    await vscode.commands.executeCommand('editor.action.outdentLines');
    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start.getFirstLineNonBlankChar();

    return vimState;
  }
}

/**
 * See comment for IndentOperatorInVisualModesIsAWeirdSpecialCase
 */
@RegisterAction
class OutdentOperatorInVisualModesIsAWeirdSpecialCase extends BaseOperator {
  modes = [ModeName.Visual, ModeName.VisualLine];
  keys = ['<'];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    // Repeating this command with dot should apply the indent to the previous selection
    if (vimState.isRunningDotCommand && vimState.dotCommandPreviousVisualSelection) {
      if (vimState.cursorStartPosition.isAfter(vimState.cursorStopPosition)) {
        const shiftSelectionByNum =
          vimState.dotCommandPreviousVisualSelection.end.line -
          vimState.dotCommandPreviousVisualSelection.start.line;

        start = vimState.cursorStartPosition;
        const newEnd = vimState.cursorStartPosition.getDownByCount(shiftSelectionByNum);

        vimState.editor.selection = new vscode.Selection(start, newEnd);
      }
    }

    for (let i = 0; i < (vimState.recordedState.count || 1); i++) {
      await vscode.commands.executeCommand('editor.action.outdentLines');
    }

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = start.getFirstLineNonBlankChar();

    return vimState;
  }
}

@RegisterAction
export class ChangeOperator extends BaseOperator {
  public keys = ['c'];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const isEndOfLine = end.character === end.getLineEnd().character;
    vimState = await new YankOperator(this.multicursorIndex).run(vimState, start, end);
    // which means the insert cursor would be one to the left of the end of
    // the line. We do want to run delete if it is a multiline change though ex. c}
    vimState.currentRegisterMode = RegisterMode.CharacterWise;
    if (
      Position.getLineLength(TextEditor.getLineAt(start).lineNumber) !== 0 ||
      end.line !== start.line
    ) {
      if (isEndOfLine) {
        vimState = await new DeleteOperator(this.multicursorIndex).run(
          vimState,
          start,
          end.getLeftThroughLineBreaks(),
          false
        );
      } else {
        vimState = await new DeleteOperator(this.multicursorIndex).run(vimState, start, end, false);
      }
    }
    vimState.currentRegisterMode = RegisterMode.AscertainFromCurrentMode;

    await vimState.setCurrentMode(ModeName.Insert);

    if (isEndOfLine) {
      vimState.cursorStopPosition = end.getRight();
    }

    return vimState;
  }

  public async runRepeat(vimState: VimState, position: Position, count: number): Promise<VimState> {
    const thisLineIndent = vimState.editor.document.getText(
      new vscode.Range(position.getLineBegin(), position.getLineBeginRespectingIndent())
    );

    vimState.currentRegisterMode = RegisterMode.LineWise;

    vimState = await this.run(
      vimState,
      position.getLineBegin(),
      position.getDownByCount(Math.max(0, count - 1)).getLineEnd()
    );

    if (configuration.autoindent) {
      if (vimState.editor.document.languageId === 'plaintext') {
        vimState.recordedState.transformations.push({
          type: 'insertText',
          text: thisLineIndent,
          position: position.getLineBegin(),
          cursorIndex: this.multicursorIndex,
        });
      } else {
        vimState.recordedState.transformations.push({
          type: 'reindent',
          cursorIndex: this.multicursorIndex,
          diff: new PositionDiff(0, 1), // Handle transition from Normal to Insert modes
        });
      }
    }

    return vimState;
  }
}

@RegisterAction
export class YankVisualBlockMode extends BaseOperator {
  public keys = ['y'];
  public modes = [ModeName.VisualBlock];
  canBeRepeatedWithDot = false;
  runsOnceForEveryCursor() {
    return false;
  }

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<VimState> {
    let toCopy: string = '';
    const ranges: vscode.Range[] = [];

    const isMultiline = startPos.line !== endPos.line;

    for (const { line, start, end } of Position.IterateLine(vimState)) {
      ranges.push(new vscode.Range(start, end));
      if (isMultiline) {
        toCopy += line + '\n';
      } else {
        toCopy = line;
      }
    }

    vimState.currentRegisterMode = RegisterMode.BlockWise;

    this.highlightYankedRanges(vimState, ranges);

    Register.put(toCopy, vimState, this.multicursorIndex);

    vimState.historyTracker.addMark(startPos, '<');
    vimState.historyTracker.addMark(endPos, '>');

    const numLinesYanked = toCopy.split('\n').length;
    ReportLinesYanked(numLinesYanked, vimState);

    await vimState.setCurrentMode(ModeName.Normal);
    vimState.cursorStopPosition = startPos;
    return vimState;
  }
}

@RegisterAction
export class ToggleCaseOperator extends BaseOperator {
  public keys = ['~'];
  public modes = [ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const range = new vscode.Range(start, end.getRight());

    await ToggleCaseOperator.toggleCase(range);

    const cursorPosition = start.isBefore(end) ? start : end;
    vimState.cursorStopPosition = cursorPosition;
    vimState.cursorStartPosition = cursorPosition;
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }

  static async toggleCase(range: vscode.Range) {
    const text = TextEditor.getText(range);

    let newText = '';
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      // Try lower-case
      let toggled = char.toLocaleLowerCase();
      if (toggled === char) {
        // Try upper-case
        toggled = char.toLocaleUpperCase();
      }
      newText += toggled;
    }
    await TextEditor.replace(range, newText);
  }
}

@RegisterAction
class ToggleCaseVisualBlockOperator extends BaseOperator {
  public keys = ['~'];
  public modes = [ModeName.VisualBlock];

  public async run(vimState: VimState, startPos: Position, endPos: Position): Promise<VimState> {
    for (const { start, end } of Position.IterateLine(vimState)) {
      const range = new vscode.Range(start, end);
      await ToggleCaseOperator.toggleCase(range);
    }

    const cursorPosition = startPos.isBefore(endPos) ? startPos : endPos;
    vimState.cursorStopPosition = cursorPosition;
    vimState.cursorStartPosition = cursorPosition;
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}

@RegisterAction
class ToggleCaseWithMotion extends ToggleCaseOperator {
  public keys = ['g', '~'];
  public modes = [ModeName.Normal];
}

@RegisterAction
export class CommentOperator extends BaseOperator {
  public keys = ['g', 'c'];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    vimState.editor.selection = new vscode.Selection(start.getLineBegin(), end.getLineEnd());
    await vscode.commands.executeCommand('editor.action.commentLine');

    vimState.cursorStopPosition = new Position(start.line, 0);
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}

@RegisterAction
export class CommentBlockOperator extends BaseOperator {
  public keys = ['g', 'C'];
  public modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    const endPosition = vimState.currentMode === ModeName.Normal ? end.getRight() : end;
    vimState.editor.selection = new vscode.Selection(start, endPosition);
    await vscode.commands.executeCommand('editor.action.blockComment');

    vimState.cursorStopPosition = start;
    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}

interface CommentTypeSingle {
  singleLine: true;

  start: string;
}

interface CommentTypeMultiLine {
  singleLine: false;

  start: string;
  inner: string;
  final: string;
}

type CommentType = CommentTypeSingle | CommentTypeMultiLine;

@RegisterAction
class ActionVisualReflowParagraph extends BaseOperator {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  keys = ['g', 'q'];

  public static CommentTypes: CommentType[] = [
    { singleLine: false, start: '/**', inner: '*', final: '*/' },
    { singleLine: false, start: '/*', inner: '*', final: '*/' },
    { singleLine: false, start: '{-', inner: '-', final: '-}' },
    { singleLine: true, start: '///' },
    { singleLine: true, start: '//' },
    { singleLine: true, start: '--' },
    { singleLine: true, start: '#' },
    { singleLine: true, start: ';' },
    { singleLine: true, start: '*' },

    // Needs to come last, since everything starts with the emtpy string!
    { singleLine: true, start: '' },
  ];

  public getIndentationLevel(s: string): number {
    for (const line of s.split('\n')) {
      const result = line.match(/^\s+/g);
      const indentLevel = result ? result[0].length : 0;

      if (indentLevel !== line.length) {
        return indentLevel;
      }
    }

    return 0;
  }

  public reflowParagraph(s: string, indentLevel: number): string {
    const maximumLineLength = configuration.textwidth - indentLevel - 2;
    const indent = Array(indentLevel + 1).join(' ');

    // Chunk the lines by commenting style.

    let chunksToReflow: {
      commentType: CommentType;
      content: string;
      indentLevelAfterComment: number;
    }[] = [];

    for (const line of s.split('\n')) {
      let lastChunk: { commentType: CommentType; content: string } | undefined =
        chunksToReflow[chunksToReflow.length - 1];
      const trimmedLine = line.trim();

      // See what comment type they are using.

      let commentType: CommentType | undefined;

      for (const type of ActionVisualReflowParagraph.CommentTypes) {
        if (line.trim().startsWith(type.start)) {
          commentType = type;

          break;
        }

        // If they're currently in a multiline comment, see if they continued it.
        if (lastChunk && type.start === lastChunk.commentType.start && !type.singleLine) {
          if (line.trim().startsWith(type.inner)) {
            commentType = type;

            break;
          }

          if (line.trim().endsWith(type.final)) {
            commentType = type;

            break;
          }
        }
      }

      if (!commentType) {
        break;
      } // will never happen, just to satisfy typechecker.

      // Did they start a new comment type?
      if (!lastChunk || commentType.start !== lastChunk.commentType.start) {
        let chunk = {
          commentType,
          content: `${trimmedLine.substr(commentType.start.length).trim()}`,
          indentLevelAfterComment: 0,
        };
        if (commentType.singleLine) {
          chunk.indentLevelAfterComment =
            trimmedLine.substr(commentType.start.length).length - chunk.content.length;
        }
        chunksToReflow.push(chunk);

        continue;
      }

      // Parse out commenting style, gather words.

      lastChunk = chunksToReflow[chunksToReflow.length - 1];

      if (lastChunk.commentType.singleLine) {
        // is it a continuation of a comment like "//"
        lastChunk.content += `\n${trimmedLine.substr(lastChunk.commentType.start.length).trim()}`;
      } else {
        // are we in the middle of a multiline comment like "/*"
        if (trimmedLine.endsWith(lastChunk.commentType.final)) {
          if (trimmedLine.length > lastChunk.commentType.final.length) {
            lastChunk.content += `\n${trimmedLine
              .substr(
                lastChunk.commentType.inner.length,
                trimmedLine.length - lastChunk.commentType.final.length
              )
              .trim()}`;
          }
        } else if (trimmedLine.startsWith(lastChunk.commentType.inner)) {
          lastChunk.content += `\n${trimmedLine.substr(lastChunk.commentType.inner.length).trim()}`;
        } else if (trimmedLine.startsWith(lastChunk.commentType.start)) {
          lastChunk.content += `\n${trimmedLine.substr(lastChunk.commentType.start.length).trim()}`;
        }
      }
    }

    // Reflow each chunk.
    let result: string[] = [];

    for (const { commentType, content, indentLevelAfterComment } of chunksToReflow) {
      let lines: string[];
      const indentAfterComment = Array(indentLevelAfterComment + 1).join(' ');

      if (commentType.singleLine) {
        lines = [``];
      } else {
        lines = [``, ``];
      }

      // This tracks if we're pushing the first line of a chunk. If so, then we
      // don't want to add an extra space. In addition, when there's a blank
      // line, this needs to be reset.
      let curIndex = 0;
      for (const line of content.trim().split('\n')) {
        // Preserve newlines.

        if (line.trim() === '') {
          for (let i = 0; i < 2; i++) {
            lines.push(``);
          }
          curIndex = 0;

          continue;
        }

        // Add word by word, wrapping when necessary.
        const words = line.split(/\s+/);
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          if (word === '') {
            continue;
          }

          if (lines[lines.length - 1].length + word.length + 1 < maximumLineLength) {
            if (curIndex === 0 && i === 0) {
              lines[lines.length - 1] += `${word}`;
            } else {
              lines[lines.length - 1] += ` ${word}`;
            }
          } else {
            lines.push(`${word}`);
          }
        }
        curIndex++;
      }

      if (!commentType.singleLine) {
        lines.push(``);
      }

      if (commentType.singleLine) {
        if (lines.length > 1 && lines[0].trim() === '') {
          lines = lines.slice(1);
        }
        if (lines.length > 1 && lines[lines.length - 1].trim() === '') {
          lines = lines.slice(0, -1);
        }
      }

      for (let i = 0; i < lines.length; i++) {
        if (commentType.singleLine) {
          lines[i] = `${indent}${commentType.start}${indentAfterComment}${lines[i]}`;
        } else {
          if (i === 0) {
            lines[i] = `${indent}${commentType.start} ${lines[i]}`;
          } else if (i === lines.length - 1) {
            lines[i] = `${indent} ${commentType.final}`;
          } else {
            lines[i] = `${indent} ${commentType.inner} ${lines[i]}`;
          }
        }
      }

      result = result.concat(lines);
    }

    // Gather up multiple empty lines into single empty lines.
    return result.join('\n');
  }

  public async run(vimState: VimState, start: Position, end: Position): Promise<VimState> {
    start = Position.EarlierOf(start, end);
    end = Position.LaterOf(start, end);

    let textToReflow = TextEditor.getText(new vscode.Range(start, end));
    let indentLevel = this.getIndentationLevel(textToReflow);

    textToReflow = this.reflowParagraph(textToReflow, indentLevel);

    vimState.recordedState.transformations.push({
      type: 'replaceText',
      text: textToReflow,
      start: start,
      end: end,
      // Move cursor to front of line to realign the view
      diff: PositionDiff.NewBOLDiff(0, 0),
    });

    await vimState.setCurrentMode(ModeName.Normal);

    return vimState;
  }
}
