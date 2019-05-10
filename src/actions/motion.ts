import * as vscode from 'vscode';

import { BaseAction } from './base';
import { ChangeOperator, DeleteOperator, YankOperator } from './operator';
import { CursorMoveByUnit, CursorMovePosition, TextEditor } from './../textEditor';
import { ModeName } from './../mode/mode';
import { PairMatcher } from './../common/matching/matcher';
import { Position, PositionDiff } from './../common/motion/position';
import { QuoteMatcher } from './../common/matching/quoteMatcher';
import { RecordedState } from '../state/recordedState';
import { RegisterAction } from './base';
import { RegisterMode } from './../register/register';
import { ReplaceState } from './../state/replaceState';
import { TagMatcher } from './../common/matching/tagMatcher';
import { VimState } from './../state/vimState';
import { configuration } from './../configuration/configuration';
import { shouldWrapKey } from './wrapping';
import { VimError, ErrorCode } from '../error';
import { ReportSearch } from '../util/statusBarTextUtils';

export function isIMovement(o: IMovement | Position): o is IMovement {
  return (o as IMovement).start !== undefined && (o as IMovement).stop !== undefined;
}

/**
 * The result of a (more sophisticated) Movement.
 */
export interface IMovement {
  start: Position;
  stop: Position;

  /**
   * Whether this motion succeeded. Some commands, like fx when 'x' can't be found,
   * will not move the cursor. Furthermore, dfx won't delete *anything*, even though
   * deleting to the current character would generally delete 1 character.
   */
  failed?: boolean;

  diff?: PositionDiff;

  // It /so/ annoys me that I have to put this here.
  registerMode?: RegisterMode;
}

enum SelectionType {
  Concatenating, // selections that concatenate repeated movements
  Expanding, // selections that expand the start and end of the previous selection
}

/**
 * A movement is something like 'h', 'k', 'w', 'b', 'gg', etc.
 */
export abstract class BaseMovement extends BaseAction {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];

  isMotion = true;

  /**
   * If isJump is true, then the cursor position will be added to the jump list on completion.
   *
   * Default to false, as many motions operate on a single line and do not count as a jump.
   */
  isJump = false;

  /**
   * If movement can be repeated with semicolon or comma this will be true when
   * running the repetition.
   */
  isRepeat = false;

  /**
   * Whether we should change desiredColumn in VimState.
   */
  public doesntChangeDesiredColumn = false;

  /**
   * This is for commands like $ which force the desired column to be at
   * the end of even the longest line.
   */
  public setsDesiredColumnToEOL = false;

  protected minCount = 1;
  protected maxCount = 99999;
  protected selectionType = SelectionType.Concatenating;

  constructor(keysPressed?: string[], isRepeat?: boolean) {
    super();

    if (keysPressed) {
      this.keysPressed = keysPressed;
    }

    if (isRepeat) {
      this.isRepeat = isRepeat;
    }
  }

  /**
   * Run the movement a single time.
   *
   * Generally returns a new Position. If necessary, it can return an IMovement instead.
   * Note: If returning an IMovement, make sure that repeated actions on a
   * visual selection work. For example, V}}
   */
  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    throw new Error('Not implemented!');
  }

  /**
   * Run the movement in an operator context a single time.
   *
   * Some movements operate over different ranges when used for operators.
   */
  public async execActionForOperator(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    return this.execAction(position, vimState);
  }

  /**
   * Run a movement count times.
   *
   * count: the number prefix the user entered, or 0 if they didn't enter one.
   */
  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    let recordedState = vimState.recordedState;
    let result: Position | IMovement = new Position(0, 0); // bogus init to satisfy typechecker
    let prevResult: IMovement | undefined = undefined;
    let firstMovementStart: Position = new Position(position.line, position.character);

    count = this.clampCount(count);

    for (let i = 0; i < count; i++) {
      const firstIteration = i === 0;
      const lastIteration = i === count - 1;
      result = await this.createMovementResult(position, vimState, recordedState, lastIteration);

      if (result instanceof Position) {
        position = result;
      } else if (isIMovement(result)) {
        if (prevResult && result.failed) {
          return prevResult;
        }

        if (firstIteration) {
          firstMovementStart = new Position(result.start.line, result.start.character);
        }

        position = this.adjustPosition(position, result, lastIteration);
        prevResult = result;
      }
    }

    if (this.selectionType === SelectionType.Concatenating && isIMovement(result)) {
      result.start = firstMovementStart;
    }

    return result;
  }

  protected clampCount(count: number) {
    count = Math.max(count, this.minCount);
    count = Math.min(count, this.maxCount);
    return count;
  }

  protected async createMovementResult(
    position: Position,
    vimState: VimState,
    recordedState: RecordedState,
    lastIteration: boolean
  ): Promise<Position | IMovement> {
    const result =
      recordedState.operator && lastIteration
        ? await this.execActionForOperator(position, vimState)
        : await this.execAction(position, vimState);
    return result;
  }
  protected adjustPosition(position: Position, result: IMovement, lastIteration: boolean) {
    if (!lastIteration) {
      position = result.stop.getRightThroughLineBreaks();
    }
    return position;
  }
}

export abstract class ExpandingSelection extends BaseMovement {
  protected selectionType = SelectionType.Expanding;

  protected adjustPosition(position: Position, result: IMovement, lastIteration: boolean) {
    if (!lastIteration) {
      position = result.stop;
    }
    return position;
  }
}

abstract class MoveByScreenLine extends BaseMovement {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  movementType: CursorMovePosition;
  by: CursorMoveByUnit;
  value: number = 1;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    await vscode.commands.executeCommand('cursorMove', {
      to: this.movementType,
      select: vimState.currentMode !== ModeName.Normal,
      by: this.by,
      value: this.value,
    });

    if (vimState.currentMode === ModeName.Normal) {
      return Position.FromVSCodePosition(vimState.editor.selection.active);
    } else {
      /**
       * cursorMove command is handling the selection for us.
       * So we are not following our design principal (do no real movement inside an action) here.
       */
      let start = Position.FromVSCodePosition(vimState.editor.selection.start);
      let stop = Position.FromVSCodePosition(vimState.editor.selection.end);
      let curPos = Position.FromVSCodePosition(vimState.editor.selection.active);

      // We want to swap the cursor start stop positions based on which direction we are moving, up or down
      if (start.isEqual(curPos)) {
        position = start;
        [start, stop] = [stop, start];
        start = start.getLeft();
      }

      return { start, stop };
    }
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<IMovement> {
    await vscode.commands.executeCommand('cursorMove', {
      to: this.movementType,
      select: true,
      by: this.by,
      value: this.value,
    });

    return {
      start: Position.FromVSCodePosition(vimState.editor.selection.start),
      stop: Position.FromVSCodePosition(vimState.editor.selection.end),
    };
  }
}

abstract class MoveByScreenLineMaintainDesiredColumn extends MoveByScreenLine {
  doesntChangeDesiredColumn = true;
  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    let prevDesiredColumn = vimState.desiredColumn;
    let prevLine = vimState.editor.selection.active.line;

    await vscode.commands.executeCommand('cursorMove', {
      to: this.movementType,
      select: vimState.currentMode !== ModeName.Normal,
      by: this.by,
      value: this.value,
    });

    if (vimState.currentMode === ModeName.Normal) {
      let returnedPos = Position.FromVSCodePosition(vimState.editor.selection.active);
      if (prevLine !== returnedPos.line) {
        returnedPos = returnedPos.withColumn(prevDesiredColumn);
      }
      return returnedPos;
    } else {
      /**
       * cursorMove command is handling the selection for us.
       * So we are not following our design principal (do no real movement inside an action) here.
       */
      let start = Position.FromVSCodePosition(vimState.editor.selection.start);
      let stop = Position.FromVSCodePosition(vimState.editor.selection.end);
      let curPos = Position.FromVSCodePosition(vimState.editor.selection.active);

      // We want to swap the cursor start stop positions based on which direction we are moving, up or down
      if (start.isEqual(curPos)) {
        position = start;
        [start, stop] = [stop, start];
        start = start.getLeft();
      }

      return { start, stop };
    }
  }
}

class MoveDownByScreenLineMaintainDesiredColumn extends MoveByScreenLineMaintainDesiredColumn {
  movementType: CursorMovePosition = 'down';
  by: CursorMoveByUnit = 'wrappedLine';
  value = 1;
}

class MoveDownFoldFix extends MoveByScreenLineMaintainDesiredColumn {
  movementType: CursorMovePosition = 'down';
  by: CursorMoveByUnit = 'line';
  value = 1;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    if (position.line >= TextEditor.getLineCount() - 1) {
      return position;
    }
    let t: Position | IMovement;
    let prevLine: number = position.line;
    let prevChar: number = position.character;
    const prevDesiredColumn = vimState.desiredColumn;
    const moveDownByScreenLine = new MoveDownByScreenLine();
    do {
      t = <Position | IMovement>await moveDownByScreenLine.execAction(position, vimState);
      t = t instanceof Position ? t : t.stop;
      const lineChanged = prevLine !== t.line;
      // wrappedLine movement goes to eol character only when at the last line
      // thus a column change on wrappedLine movement represents a visual last line
      const colChanged = prevChar !== t.character;
      if (lineChanged || !colChanged) {
        break;
      }
      prevChar = t.character;
      prevLine = t.line;
    } while (t.line === position.line);
    // fix column change at last line caused by wrappedLine movement
    // causes cursor lag and flicker if a large repeat prefix is given to movement
    if (t.character !== prevDesiredColumn) {
      t = new Position(t.line, prevDesiredColumn);
    }
    return t;
  }
}

@RegisterAction
class MoveDown extends BaseMovement {
  keys = ['j'];
  doesntChangeDesiredColumn = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    if (configuration.foldfix && vimState.currentMode !== ModeName.VisualBlock) {
      return new MoveDownFoldFix().execAction(position, vimState);
    }
    return position.getDown(vimState.desiredColumn);
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getDown(position.getLineEnd().character);
  }
}

@RegisterAction
class MoveDownArrow extends MoveDown {
  keys = ['<down>'];
}

class MoveUpByScreenLineMaintainDesiredColumn extends MoveByScreenLineMaintainDesiredColumn {
  movementType: CursorMovePosition = 'up';
  by: CursorMoveByUnit = 'wrappedLine';
  value = 1;
}

@RegisterAction
class MoveUp extends BaseMovement {
  keys = ['k'];
  doesntChangeDesiredColumn = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    if (configuration.foldfix && vimState.currentMode !== ModeName.VisualBlock) {
      return new MoveUpFoldFix().execAction(position, vimState);
    }
    return position.getUp(vimState.desiredColumn);
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getUp(position.getLineEnd().character);
  }
}

@RegisterAction
class MoveUpFoldFix extends MoveByScreenLineMaintainDesiredColumn {
  movementType: CursorMovePosition = 'up';
  by: CursorMoveByUnit = 'line';
  value = 1;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    if (position.line === 0) {
      return position;
    }
    let t: Position | IMovement;
    const prevDesiredColumn = vimState.desiredColumn;
    const moveUpByScreenLine = new MoveUpByScreenLine();
    do {
      t = <Position | IMovement>await moveUpByScreenLine.execAction(position, vimState);
      t = t instanceof Position ? t : t.stop;
    } while (t.line === position.line);
    // fix column change at last line caused by wrappedLine movement
    // causes cursor lag and flicker if a large repeat prefix is given to movement
    if (t.character !== prevDesiredColumn) {
      t = new Position(t.line, prevDesiredColumn);
    }
    return t;
  }
}

@RegisterAction
class MoveUpArrow extends MoveUp {
  keys = ['<up>'];
}

@RegisterAction
class ArrowsInReplaceMode extends BaseMovement {
  modes = [ModeName.Replace];
  keys = [['<up>'], ['<down>'], ['<left>'], ['<right>']];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    let newPosition: Position = position;

    switch (this.keysPressed[0]) {
      case '<up>':
        newPosition = <Position>await new MoveUpArrow().execAction(position, vimState);
        break;
      case '<down>':
        newPosition = <Position>await new MoveDownArrow().execAction(position, vimState);
        break;
      case '<left>':
        newPosition = await new MoveLeftArrow().execAction(position, vimState);
        break;
      case '<right>':
        newPosition = await new MoveRightArrow().execAction(position, vimState);
        break;
      default:
        break;
    }
    vimState.replaceState = new ReplaceState(newPosition);
    return newPosition;
  }
}

@RegisterAction
class UpArrowInReplaceMode extends ArrowsInReplaceMode {
  keys = [['<up>']];
}

@RegisterAction
class DownArrowInReplaceMode extends ArrowsInReplaceMode {
  keys = [['<down>']];
}

@RegisterAction
class LeftArrowInReplaceMode extends ArrowsInReplaceMode {
  keys = [['<left>']];
}

@RegisterAction
class RightArrowInReplaceMode extends ArrowsInReplaceMode {
  keys = [['<right>']];
}

@RegisterAction
class CommandNextSearchMatch extends BaseMovement {
  keys = ['n'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    const searchState = vimState.globalState.searchState;

    if (!searchState || searchState.searchString === '') {
      return position;
    }
    // Turn one of the highlighting flags back on (turned off with :nohl)
    vimState.globalState.hl = true;

    let nextMatch: {
      pos: Position;
      index: number;
    };
    if (position.getRight().isEqual(position.getLineEnd())) {
      nextMatch = searchState.getNextSearchMatchPosition(position.getRight());
    } else {
      nextMatch = searchState.getNextSearchMatchPosition(position);
    }

    ReportSearch(nextMatch.index, searchState.matchRanges.length, vimState);

    return nextMatch.pos;
  }
}

@RegisterAction
class CommandPreviousSearchMatch extends BaseMovement {
  keys = ['N'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    const searchState = vimState.globalState.searchState;

    if (!searchState || searchState.searchString === '') {
      return position;
    }

    // Turn one of the highlighting flags back on (turned off with :nohl)
    vimState.globalState.hl = true;

    const prevMatch = searchState.getNextSearchMatchPosition(position, -1);

    ReportSearch(prevMatch.index, searchState.matchRanges.length, vimState);

    return prevMatch.pos;
  }
}

@RegisterAction
export class MarkMovementBOL extends BaseMovement {
  keys = ["'", '<character>'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    const markName = this.keysPressed[1];
    const mark = vimState.historyTracker.getMark(markName);

    vimState.currentRegisterMode = RegisterMode.LineWise;

    if (mark == null) {
      throw VimError.fromCode(ErrorCode.E20);
    }
    return mark.position.getFirstLineNonBlankChar();
  }
}

@RegisterAction
export class MarkMovement extends BaseMovement {
  keys = ['`', '<character>'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    const markName = this.keysPressed[1];
    const mark = vimState.historyTracker.getMark(markName);

    if (mark == null) {
      throw VimError.fromCode(ErrorCode.E20);
    }
    return mark.position;
  }
}
@RegisterAction
export class MoveLeft extends BaseMovement {
  keys = ['h'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (shouldWrapKey(vimState, this.keysPressed)) {
      return position.getLeftThroughLineBreaks();
    }
    return position.getLeft();
  }
}

@RegisterAction
class MoveLeftArrow extends MoveLeft {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<left>'];
}

@RegisterAction
class BackSpaceInNormalMode extends BaseMovement {
  modes = [ModeName.Normal];
  keys = ['<BS>'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getLeftThroughLineBreaks();
  }
}

@RegisterAction
class MoveRight extends BaseMovement {
  keys = ['l'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (shouldWrapKey(vimState, this.keysPressed)) {
      const includeEol = vimState.currentMode === ModeName.Insert;
      return position.getRightThroughLineBreaks(includeEol);
    }
    return position.getRight();
  }
}

@RegisterAction
class MoveRightArrow extends MoveRight {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<right>'];
}

@RegisterAction
class MoveRightWithSpace extends BaseMovement {
  keys = [' '];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getRightThroughLineBreaks();
  }
}

@RegisterAction
class MoveDownNonBlank extends BaseMovement {
  keys = ['+'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getDownByCount(Math.max(count, 1)).getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveUpNonBlank extends BaseMovement {
  keys = ['-'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getUpByCount(Math.max(count, 1)).getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveDownUnderscore extends BaseMovement {
  keys = ['_'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    return position.getDownByCount(Math.max(count - 1, 0)).getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveToColumn extends BaseMovement {
  keys = ['|'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    return new Position(position.line, Math.max(0, count - 1));
  }
}

@RegisterAction
class MoveFindForward extends BaseMovement {
  keys = ['f', '<character>'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    count = count || 1;
    const toFind = this.keysPressed[1];
    let result = position.findForwards(toFind, count);

    if (!result) {
      return { start: position, stop: position, failed: true };
    }

    if (vimState.recordedState.operator) {
      result = result.getRight();
    }

    if (
      !this.isRepeat &&
      (!vimState.recordedState.operator || !(isIMovement(result) && result.failed))
    ) {
      vimState.lastSemicolonRepeatableMovement = new MoveFindForward(this.keysPressed, true);
      vimState.lastCommaRepeatableMovement = new MoveFindBackward(this.keysPressed, true);
    }

    return result;
  }
}

@RegisterAction
class MoveFindBackward extends BaseMovement {
  keys = ['F', '<character>'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    count = count || 1;
    const toFind = this.keysPressed[1];
    let result = position.findBackwards(toFind, count);

    if (!result) {
      return { start: position, stop: position, failed: true };
    }

    if (
      !this.isRepeat &&
      (!vimState.recordedState.operator || !(isIMovement(result) && result.failed))
    ) {
      vimState.lastSemicolonRepeatableMovement = new MoveFindBackward(this.keysPressed, true);
      vimState.lastCommaRepeatableMovement = new MoveFindForward(this.keysPressed, true);
    }

    return result;
  }
}

@RegisterAction
class MoveTilForward extends BaseMovement {
  keys = ['t', '<character>'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    count = count || 1;
    const toFind = this.keysPressed[1];
    let result = position.tilForwards(toFind, count);

    // For t<character> vim executes ; as 2; and , as 2,
    if (result && this.isRepeat && position.isEqual(result) && count === 1) {
      result = position.tilForwards(toFind, 2);
    }

    if (!result) {
      return { start: position, stop: position, failed: true };
    }

    if (vimState.recordedState.operator) {
      result = result.getRight();
    }

    if (
      !this.isRepeat &&
      (!vimState.recordedState.operator || !(isIMovement(result) && result.failed))
    ) {
      vimState.lastSemicolonRepeatableMovement = new MoveTilForward(this.keysPressed, true);
      vimState.lastCommaRepeatableMovement = new MoveTilBackward(this.keysPressed, true);
    }

    return result;
  }
}

@RegisterAction
class MoveTilBackward extends BaseMovement {
  keys = ['T', '<character>'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    count = count || 1;
    const toFind = this.keysPressed[1];
    let result = position.tilBackwards(toFind, count);

    // For T<character> vim executes ; as 2; and , as 2,
    if (result && this.isRepeat && position.isEqual(result) && count === 1) {
      result = position.tilBackwards(toFind, 2);
    }

    if (!result) {
      return { start: position, stop: position, failed: true };
    }

    if (
      !this.isRepeat &&
      (!vimState.recordedState.operator || !(isIMovement(result) && result.failed))
    ) {
      vimState.lastSemicolonRepeatableMovement = new MoveTilBackward(this.keysPressed, true);
      vimState.lastCommaRepeatableMovement = new MoveTilForward(this.keysPressed, true);
    }

    return result;
  }
}

@RegisterAction
class MoveRepeat extends BaseMovement {
  keys = [';'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    const movement = vimState.lastSemicolonRepeatableMovement;
    if (movement) {
      return movement.execActionWithCount(position, vimState, count);
    }
    return position;
  }
}

@RegisterAction
class MoveRepeatReversed extends BaseMovement {
  keys = [','];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    const movement = vimState.lastCommaRepeatableMovement;
    if (movement) {
      return movement.execActionWithCount(position, vimState, count);
    }
    return position;
  }
}

@RegisterAction
class MoveLineEnd extends BaseMovement {
  keys = [['$'], ['<End>'], ['<D-right>']];
  setsDesiredColumnToEOL = true;

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    return position.getDownByCount(Math.max(count - 1, 0)).getLineEnd();
  }
}

@RegisterAction
class MoveLineBegin extends BaseMovement {
  keys = [['0'], ['<Home>'], ['<D-left>']];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getLineBegin();
  }

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.doesActionApply(vimState, keysPressed) && vimState.recordedState.count === 0;
  }

  public couldActionApply(vimState: VimState, keysPressed: string[]): boolean {
    return super.couldActionApply(vimState, keysPressed) && vimState.recordedState.count === 0;
  }
}

@RegisterAction
class MoveScreenLineBegin extends MoveByScreenLine {
  keys = ['g', '0'];
  movementType: CursorMovePosition = 'wrappedLineStart';
}

@RegisterAction
class MoveScreenNonBlank extends MoveByScreenLine {
  keys = ['g', '^'];
  movementType: CursorMovePosition = 'wrappedLineFirstNonWhitespaceCharacter';
}

@RegisterAction
class MoveScreenLineEnd extends MoveByScreenLine {
  keys = ['g', '$'];
  movementType: CursorMovePosition = 'wrappedLineEnd';
}

@RegisterAction
class MoveScreenLineEndNonBlank extends MoveByScreenLine {
  keys = ['g', '_'];
  movementType: CursorMovePosition = 'wrappedLineLastNonWhitespaceCharacter';

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    count = count || 1;
    const pos = await this.execAction(position, vimState);
    const newPos: Position | IMovement = pos as Position;

    // If in visual, return a selection
    if (pos instanceof Position) {
      return pos.getDownByCount(count - 1);
    } else if (isIMovement(pos)) {
      return { start: pos.start, stop: pos.stop.getDownByCount(count - 1).getLeft() };
    }

    return newPos.getDownByCount(count - 1);
  }
}

@RegisterAction
class MoveScreenLineCenter extends MoveByScreenLine {
  keys = ['g', 'm'];
  movementType: CursorMovePosition = 'wrappedLineColumnCenter';
}

@RegisterAction
export class MoveUpByScreenLine extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual];
  keys = [['g', 'k'], ['g', '<up>']];
  movementType: CursorMovePosition = 'up';
  by: CursorMoveByUnit = 'wrappedLine';
  value = 1;
}

@RegisterAction
class MoveDownByScreenLine extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual];
  keys = [['g', 'j'], ['g', '<down>']];
  movementType: CursorMovePosition = 'down';
  by: CursorMoveByUnit = 'wrappedLine';
  value = 1;
}

// Because we can't support moving by screen line when in visualLine mode,
// we change to moving by regular line in visualLine mode. We can't move by
// screen line is that our ranges only support a start and stop attribute,
// and moving by screen line just snaps us back to the original position.
// Check PR #1600 for discussion.
@RegisterAction
class MoveUpByScreenLineVisualLine extends MoveByScreenLine {
  modes = [ModeName.VisualLine];
  keys = [['g', 'k'], ['g', '<up>']];
  movementType: CursorMovePosition = 'up';
  by: CursorMoveByUnit = 'line';
  value = 1;
}

@RegisterAction
class MoveDownByScreenLineVisualLine extends MoveByScreenLine {
  modes = [ModeName.VisualLine];
  keys = [['g', 'j'], ['g', '<down>']];
  movementType: CursorMovePosition = 'down';
  by: CursorMoveByUnit = 'line';
  value = 1;
}

@RegisterAction
class MoveUpByScreenLineVisualBlock extends BaseMovement {
  modes = [ModeName.VisualBlock];
  keys = [['g', 'k'], ['g', '<up>']];
  doesntChangeDesiredColumn = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    return position.getUp(vimState.desiredColumn);
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getUp(position.getLineEnd().character);
  }
}

@RegisterAction
class MoveDownByScreenLineVisualBlock extends BaseMovement {
  modes = [ModeName.VisualBlock];
  keys = [['g', 'j'], ['g', '<down>']];
  doesntChangeDesiredColumn = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    return position.getDown(vimState.desiredColumn);
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;
    return position.getDown(position.getLineEnd().character);
  }
}

@RegisterAction
class MoveScreenToRight extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  keys = ['z', 'h'];
  movementType: CursorMovePosition = 'right';
  by: CursorMoveByUnit = 'character';
  value = 1;

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToLeft extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  keys = ['z', 'l'];
  movementType: CursorMovePosition = 'left';
  by: CursorMoveByUnit = 'character';
  value = 1;

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToRightHalf extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  keys = ['z', 'H'];
  movementType: CursorMovePosition = 'right';
  by: CursorMoveByUnit = 'halfLine';
  value = 1;

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveScreenToLeftHalf extends MoveByScreenLine {
  modes = [ModeName.Insert, ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  keys = ['z', 'L'];
  movementType: CursorMovePosition = 'left';
  by: CursorMoveByUnit = 'halfLine';
  value = 1;
  isJump = true;

  public doesActionApply(vimState: VimState, keysPressed: string[]): boolean {
    // Don't run if there's an operator because the Sneak plugin uses <operator>z
    return (
      super.doesActionApply(vimState, keysPressed) && vimState.recordedState.operator === undefined
    );
  }
}

@RegisterAction
class MoveToLineFromViewPortTop extends MoveByScreenLine {
  keys = ['H'];
  movementType: CursorMovePosition = 'viewPortTop';
  by: CursorMoveByUnit = 'line';
  value = 1;
  isJump = true;

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    this.value = count < 1 ? 1 : count;
    return this.execAction(position, vimState);
  }
}

@RegisterAction
class MoveToLineFromViewPortBottom extends MoveByScreenLine {
  keys = ['L'];
  movementType: CursorMovePosition = 'viewPortBottom';
  by: CursorMoveByUnit = 'line';
  value = 1;
  isJump = true;

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    this.value = count < 1 ? 1 : count;
    return this.execAction(position, vimState);
  }
}

@RegisterAction
class MoveToMiddleLineInViewPort extends MoveByScreenLine {
  keys = ['M'];
  movementType: CursorMovePosition = 'viewPortCenter';
  by: CursorMoveByUnit = 'line';
  isJump = true;
}

@RegisterAction
class MoveNonBlank extends BaseMovement {
  keys = ['^'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveNextLineNonBlank extends BaseMovement {
  keys = ['\n'];

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position> {
    vimState.currentRegisterMode = RegisterMode.LineWise;

    // Count === 0 if just pressing enter in normal mode, need to still go down 1 line
    if (count === 0) {
      count++;
    }

    return position.getDownByCount(count).getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveNonBlankFirst extends BaseMovement {
  keys = ['g', 'g'];
  isJump = true;

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    if (count === 0) {
      return position.getDocumentBegin().getFirstLineNonBlankChar();
    }

    return new Position(count - 1, 0).getFirstLineNonBlankChar();
  }
}

@RegisterAction
class MoveNonBlankLast extends BaseMovement {
  keys = ['G'];
  isJump = true;

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    let stop: Position;

    if (count === 0) {
      stop = new Position(TextEditor.getLineCount() - 1, 0);
    } else {
      stop = new Position(Math.min(count, TextEditor.getLineCount()) - 1, 0);
    }

    return {
      start: vimState.cursorStartPosition,
      stop: stop,
      registerMode: RegisterMode.LineWise,
    };
  }
}

@RegisterAction
export class MoveWordBegin extends BaseMovement {
  keys = ['w'];

  public async execAction(
    position: Position,
    vimState: VimState,
    isLastIteration: boolean = false
  ): Promise<Position> {
    if (
      isLastIteration &&
      !configuration.changeWordIncludesWhitespace &&
      vimState.recordedState.operator instanceof ChangeOperator
    ) {
      if (TextEditor.getLineAt(position).text.length < 1) {
        return position;
      }

      const line = TextEditor.getLineAt(position).text;
      const char = line[position.character];

      /*
      From the Vim manual:

      Special case: "cw" and "cW" are treated like "ce" and "cE" if the cursor is
      on a non-blank.  This is because "cw" is interpreted as change-word, and a
      word does not include the following white space.
      */

      if (' \t'.indexOf(char) >= 0) {
        return position.getWordRight();
      } else {
        return position.getCurrentWordEnd(true).getRight();
      }
    } else {
      return position.getWordRight();
    }
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    const result = await this.execAction(position, vimState, true);

    /*
    From the Vim documentation:

    Another special case: When using the "w" motion in combination with an
    operator and the last word moved over is at the end of a line, the end of
    that word becomes the end of the operated text, not the first word in the
    next line.
    */

    if (
      result.line > position.line + 1 ||
      (result.line === position.line + 1 && result.isFirstWordOfLine())
    ) {
      return position.getLineEnd();
    }

    if (result.isLineEnd()) {
      return new Position(result.line, result.character + 1);
    }

    return result;
  }
}

@RegisterAction
class MoveFullWordBegin extends BaseMovement {
  keys = ['W'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    if (
      !configuration.changeWordIncludesWhitespace &&
      vimState.recordedState.operator instanceof ChangeOperator
    ) {
      // TODO use execForOperator? Or maybe dont?

      // See note for w
      return position.getCurrentBigWordEnd().getRight();
    } else {
      return position.getBigWordRight();
    }
  }
}

@RegisterAction
class MoveWordEnd extends BaseMovement {
  keys = ['e'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getCurrentWordEnd();
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    let end = position.getCurrentWordEnd();

    return new Position(end.line, end.character + 1);
  }
}

@RegisterAction
class MoveFullWordEnd extends BaseMovement {
  keys = ['E'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getCurrentBigWordEnd();
  }

  public async execActionForOperator(position: Position, vimState: VimState): Promise<Position> {
    return position.getCurrentBigWordEnd().getRight();
  }
}

@RegisterAction
class MoveLastWordEnd extends BaseMovement {
  keys = ['g', 'e'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getLastWordEnd();
  }
}

@RegisterAction
class MoveLastFullWordEnd extends BaseMovement {
  keys = ['g', 'E'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getLastBigWordEnd();
  }
}

@RegisterAction
class MoveBeginningWord extends BaseMovement {
  keys = ['b'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getWordLeft();
  }
}

@RegisterAction
class MoveBeginningFullWord extends BaseMovement {
  keys = ['B'];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getBigWordLeft();
  }
}

@RegisterAction
class MovePreviousSentenceBegin extends BaseMovement {
  keys = ['('];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getSentenceBegin({ forward: false });
  }
}

@RegisterAction
class MoveNextSentenceBegin extends BaseMovement {
  keys = [')'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getSentenceBegin({ forward: true });
  }
}

@RegisterAction
class MoveParagraphEnd extends BaseMovement {
  keys = ['}'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    const isLineWise =
      position.isLineBeginning() &&
      vimState.currentMode === ModeName.Normal &&
      vimState.recordedState.operator;
    let paragraphEnd = position.getCurrentParagraphEnd();
    vimState.currentRegisterMode = isLineWise
      ? RegisterMode.LineWise
      : RegisterMode.AscertainFromCurrentMode;
    return isLineWise ? paragraphEnd.getLeftThroughLineBreaks(true) : paragraphEnd;
  }
}

@RegisterAction
class MoveParagraphBegin extends BaseMovement {
  keys = ['{'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getCurrentParagraphBeginning();
  }
}

abstract class MoveSectionBoundary extends BaseMovement {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine];
  boundary: string;
  forward: boolean;
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    return position.getSectionBoundary({
      forward: this.forward,
      boundary: this.boundary,
    });
  }
}

@RegisterAction
class MoveNextSectionBegin extends MoveSectionBoundary {
  keys = [']', ']'];
  boundary = '{';
  forward = true;
}

@RegisterAction
class MoveNextSectionEnd extends MoveSectionBoundary {
  keys = [']', '['];
  boundary = '}';
  forward = true;
}

@RegisterAction
class MovePreviousSectionBegin extends MoveSectionBoundary {
  keys = ['[', '['];
  boundary = '{';
  forward = false;
}

@RegisterAction
class MovePreviousSectionEnd extends MoveSectionBoundary {
  keys = ['[', ']'];
  boundary = '}';
  forward = false;
}

@RegisterAction
class MoveToMatchingBracket extends BaseMovement {
  keys = ['%'];
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    position = position.getLeftIfEOL();

    const text = TextEditor.getLineAt(position).text;
    const charToMatch = text[position.character];
    const toFind = PairMatcher.pairings[charToMatch];
    const failure = { start: position, stop: position, failed: true };

    if (!toFind || !toFind.matchesWithPercentageMotion) {
      // If we're not on a match, go right until we find a
      // pairable character or hit the end of line.

      for (let i = position.character; i < text.length; i++) {
        if (PairMatcher.pairings[text[i]]) {
          // We found an opening char, now move to the matching closing char
          const openPosition = new Position(position.line, i);
          return PairMatcher.nextPairedChar(openPosition, text[i]) || failure;
        }
      }

      return failure;
    }

    return PairMatcher.nextPairedChar(position, charToMatch) || failure;
  }

  public async execActionForOperator(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    const result = await this.execAction(position, vimState);

    if (isIMovement(result)) {
      if (result.failed) {
        return result;
      } else {
        throw new Error('Did not ever handle this case!');
      }
    }

    if (position.compareTo(result) > 0) {
      return {
        start: result,
        stop: position.getRight(),
      };
    } else {
      return result.getRight();
    }
  }

  public async execActionWithCount(
    position: Position,
    vimState: VimState,
    count: number
  ): Promise<Position | IMovement> {
    // % has a special mode that lets you use it to jump to a percentage of the file
    // However, some other bracket motions inherit from this so only do this behavior for % explicitly
    if (Object.getPrototypeOf(this) === MoveToMatchingBracket.prototype) {
      if (count === 0) {
        if (vimState.recordedState.operator) {
          return this.execActionForOperator(position, vimState);
        } else {
          return this.execAction(position, vimState);
        }
      }

      // Check to make sure this is a valid percentage
      if (count < 0 || count > 100) {
        return { start: position, stop: position, failed: true };
      }

      const targetLine = Math.round((count * TextEditor.getLineCount()) / 100);
      return new Position(targetLine - 1, 0).getFirstLineNonBlankChar();
    } else {
      return super.execActionWithCount(position, vimState, count);
    }
  }
}

export abstract class MoveInsideCharacter extends ExpandingSelection {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  protected charToMatch: string;
  protected includeSurrounding = false;
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const closingChar = PairMatcher.pairings[this.charToMatch].match;
    let cursorStartPos = new Position(
      vimState.cursorStartPosition.line,
      vimState.cursorStartPosition.character
    );
    // maintain current selection on failure
    const failure = { start: cursorStartPos, stop: position, failed: true };

    // when matching inside content of a pair, search for the next pair if
    // the inner content is already selected in full
    if (!this.includeSurrounding) {
      const adjacentPosLeft = cursorStartPos.getLeftThroughLineBreaks();
      let adjacentPosRight = position.getRightThroughLineBreaks();
      if (vimState.recordedState.operator) {
        adjacentPosRight = adjacentPosRight.getLeftThroughLineBreaks();
      }
      const adjacentCharLeft = TextEditor.getCharAt(adjacentPosLeft);
      const adjacentCharRight = TextEditor.getCharAt(adjacentPosRight);
      if (adjacentCharLeft === this.charToMatch && adjacentCharRight === closingChar) {
        cursorStartPos = adjacentPosLeft;
        vimState.cursorStartPosition = adjacentPosLeft;
        position = adjacentPosRight;
        vimState.cursorStopPosition = adjacentPosRight;
      }
    }
    // First, search backwards for the opening character of the sequence
    let startPos = PairMatcher.nextPairedChar(cursorStartPos, closingChar, vimState);
    if (startPos === undefined) {
      return failure;
    }

    let startPlusOne: Position;

    if (startPos.isAfterOrEqual(startPos.getLineEnd().getLeft())) {
      startPlusOne = new Position(startPos.line + 1, 0);
    } else {
      startPlusOne = new Position(startPos.line, startPos.character + 1);
    }

    let endPos = PairMatcher.nextPairedChar(position, this.charToMatch, vimState);

    if (endPos === undefined) {
      return failure;
    }

    if (this.includeSurrounding) {
      if (vimState.currentMode !== ModeName.Visual) {
        endPos = new Position(endPos.line, endPos.character + 1);
      }
    } else {
      startPos = startPlusOne;

      // If the closing character is the first on the line, don't swallow it.
      if (endPos.isInLeadingWhitespace()) {
        endPos = endPos.getLineBegin();
      }

      if (vimState.currentMode === ModeName.Visual) {
        endPos = endPos.getLeftThroughLineBreaks();
      }
    }

    if (position.isBefore(startPos)) {
      vimState.recordedState.operatorPositionDiff = startPos.subtract(position);
    }

    vimState.cursorStartPosition = startPos;
    return {
      start: startPos,
      stop: endPos,
      diff: new PositionDiff(0, startPos === position ? 1 : 0),
    };
  }
}

@RegisterAction
class MoveIParentheses extends MoveInsideCharacter {
  keys = ['i', '('];
  charToMatch = '(';
}

@RegisterAction
class MoveIClosingParentheses extends MoveInsideCharacter {
  keys = ['i', ')'];
  charToMatch = '(';
}

@RegisterAction
class MoveIClosingParenthesesBlock extends MoveInsideCharacter {
  keys = ['i', 'b'];
  charToMatch = '(';
}

@RegisterAction
export class MoveAParentheses extends MoveInsideCharacter {
  keys = ['a', '('];
  charToMatch = '(';
  includeSurrounding = true;
}

@RegisterAction
class MoveAClosingParentheses extends MoveInsideCharacter {
  keys = ['a', ')'];
  charToMatch = '(';
  includeSurrounding = true;
}

@RegisterAction
class MoveAParenthesesBlock extends MoveInsideCharacter {
  keys = ['a', 'b'];
  charToMatch = '(';
  includeSurrounding = true;
}

@RegisterAction
class MoveICurlyBrace extends MoveInsideCharacter {
  keys = ['i', '{'];
  charToMatch = '{';
}

@RegisterAction
class MoveIClosingCurlyBrace extends MoveInsideCharacter {
  keys = ['i', '}'];
  charToMatch = '{';
}

@RegisterAction
class MoveIClosingCurlyBraceBlock extends MoveInsideCharacter {
  keys = ['i', 'B'];
  charToMatch = '{';
}

@RegisterAction
export class MoveACurlyBrace extends MoveInsideCharacter {
  keys = ['a', '{'];
  charToMatch = '{';
  includeSurrounding = true;
}

@RegisterAction
export class MoveAClosingCurlyBrace extends MoveInsideCharacter {
  keys = ['a', '}'];
  charToMatch = '{';
  includeSurrounding = true;
}

@RegisterAction
class MoveAClosingCurlyBraceBlock extends MoveInsideCharacter {
  keys = ['a', 'B'];
  charToMatch = '{';
  includeSurrounding = true;
}

@RegisterAction
class MoveICaret extends MoveInsideCharacter {
  keys = ['i', '<'];
  charToMatch = '<';
}

@RegisterAction
class MoveIClosingCaret extends MoveInsideCharacter {
  keys = ['i', '>'];
  charToMatch = '<';
}

@RegisterAction
export class MoveACaret extends MoveInsideCharacter {
  keys = ['a', '<'];
  charToMatch = '<';
  includeSurrounding = true;
}

@RegisterAction
class MoveAClosingCaret extends MoveInsideCharacter {
  keys = ['a', '>'];
  charToMatch = '<';
  includeSurrounding = true;
}

@RegisterAction
class MoveISquareBracket extends MoveInsideCharacter {
  keys = ['i', '['];
  charToMatch = '[';
}

@RegisterAction
class MoveIClosingSquareBraket extends MoveInsideCharacter {
  keys = ['i', ']'];
  charToMatch = '[';
}

@RegisterAction
export class MoveASquareBracket extends MoveInsideCharacter {
  keys = ['a', '['];
  charToMatch = '[';
  includeSurrounding = true;
}

@RegisterAction
class MoveAClosingSquareBracket extends MoveInsideCharacter {
  keys = ['a', ']'];
  charToMatch = '[';
  includeSurrounding = true;
}

export abstract class MoveQuoteMatch extends BaseMovement {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualBlock];
  protected charToMatch: string;
  protected includeSurrounding = false;
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const text = TextEditor.getLineAt(position).text;
    const quoteMatcher = new QuoteMatcher(this.charToMatch, text);
    let start = quoteMatcher.findOpening(position.character);
    let end = quoteMatcher.findClosing(start + 1);

    if (end < start && start === position.character) {
      // start character is a match and no forward match found
      // search backwards instead
      end = start;
      start = quoteMatcher.findOpening(end - 1);
    }

    if (start === -1 || end === -1 || end === start || end < position.character) {
      return {
        start: position,
        stop: position,
        failed: true,
      };
    }

    let startPos = new Position(position.line, start);
    let endPos = new Position(position.line, end);

    if (!this.includeSurrounding) {
      startPos = startPos.getRight();
      endPos = endPos.getLeft();
    }

    if (position.isBefore(startPos)) {
      vimState.recordedState.operatorPositionDiff = startPos.subtract(position);
    }

    return {
      start: startPos,
      stop: endPos,
    };
  }

  public async execActionForOperator(
    position: Position,
    vimState: VimState
  ): Promise<Position | IMovement> {
    const result = await this.execAction(position, vimState);
    if (isIMovement(result)) {
      if (result.failed) {
        vimState.recordedState.hasRunOperator = false;
        vimState.recordedState.actionsRun = [];
      } else {
        result.stop = result.stop.getRight();
      }
    }
    return result;
  }
}

@RegisterAction
class MoveInsideSingleQuotes extends MoveQuoteMatch {
  keys = ['i', "'"];
  charToMatch = "'";
  includeSurrounding = false;
}

@RegisterAction
export class MoveASingleQuotes extends MoveQuoteMatch {
  keys = ['a', "'"];
  charToMatch = "'";
  includeSurrounding = true;
}

@RegisterAction
class MoveInsideDoubleQuotes extends MoveQuoteMatch {
  keys = ['i', '"'];
  charToMatch = '"';
  includeSurrounding = false;
}

@RegisterAction
export class MoveADoubleQuotes extends MoveQuoteMatch {
  keys = ['a', '"'];
  charToMatch = '"';
  includeSurrounding = true;
}

@RegisterAction
class MoveInsideBacktick extends MoveQuoteMatch {
  keys = ['i', '`'];
  charToMatch = '`';
  includeSurrounding = false;
}

@RegisterAction
export class MoveABacktick extends MoveQuoteMatch {
  keys = ['a', '`'];
  charToMatch = '`';
  includeSurrounding = true;
}

@RegisterAction
class MoveToUnclosedRoundBracketBackward extends MoveToMatchingBracket {
  keys = ['[', '('];

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    const failure = { start: position, stop: position, failed: true };
    const charToMatch = ')';
    const result = PairMatcher.nextPairedChar(position, charToMatch);

    if (!result) {
      return failure;
    }
    return result;
  }
}

@RegisterAction
class MoveToUnclosedRoundBracketForward extends MoveToMatchingBracket {
  keys = [']', ')'];

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    const failure = { start: position, stop: position, failed: true };
    const charToMatch = '(';
    const result = PairMatcher.nextPairedChar(position, charToMatch);

    if (!result) {
      return failure;
    }

    if (
      vimState.recordedState.operator instanceof ChangeOperator ||
      vimState.recordedState.operator instanceof DeleteOperator ||
      vimState.recordedState.operator instanceof YankOperator
    ) {
      return result.getLeftThroughLineBreaks();
    }

    return result;
  }
}

@RegisterAction
class MoveToUnclosedCurlyBracketBackward extends MoveToMatchingBracket {
  keys = ['[', '{'];

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    const failure = { start: position, stop: position, failed: true };
    const charToMatch = '}';
    const result = PairMatcher.nextPairedChar(position, charToMatch);

    if (!result) {
      return failure;
    }
    return result;
  }
}

@RegisterAction
class MoveToUnclosedCurlyBracketForward extends MoveToMatchingBracket {
  keys = [']', '}'];

  public async execAction(position: Position, vimState: VimState): Promise<Position | IMovement> {
    const failure = { start: position, stop: position, failed: true };
    const charToMatch = '{';
    const result = PairMatcher.nextPairedChar(position, charToMatch);

    if (!result) {
      return failure;
    }

    if (
      vimState.recordedState.operator instanceof ChangeOperator ||
      vimState.recordedState.operator instanceof DeleteOperator ||
      vimState.recordedState.operator instanceof YankOperator
    ) {
      return result.getLeftThroughLineBreaks();
    }

    return result;
  }
}

abstract class MoveTagMatch extends ExpandingSelection {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualBlock];
  protected includeTag = false;
  isJump = true;

  public async execAction(position: Position, vimState: VimState): Promise<IMovement> {
    const editorText = TextEditor.getText();
    const offset = TextEditor.getOffsetAt(position);
    const tagMatcher = new TagMatcher(editorText, offset, vimState);
    const cursorStartPos = new Position(
      vimState.cursorStartPosition.line,
      vimState.cursorStartPosition.character
    );
    const start = tagMatcher.findOpening(this.includeTag);
    const end = tagMatcher.findClosing(this.includeTag);

    if (start === undefined || end === undefined) {
      return {
        start: cursorStartPos,
        stop: position,
        failed: true,
      };
    }

    let startPosition = start >= 0 ? TextEditor.getPositionAt(start) : cursorStartPos;
    let endPosition = end >= 0 ? TextEditor.getPositionAt(end) : position;
    if (
      vimState.currentMode === ModeName.Visual ||
      vimState.currentMode === ModeName.SurroundInputMode
    ) {
      endPosition = endPosition.getLeftThroughLineBreaks();
    }

    if (position.isAfter(endPosition)) {
      vimState.recordedState.transformations.push({
        type: 'moveCursor',
        diff: endPosition.subtract(position),
      });
    } else if (position.isBefore(startPosition)) {
      vimState.recordedState.transformations.push({
        type: 'moveCursor',
        diff: startPosition.subtract(position),
      });
    }
    // if (start === end) {
    //   if (vimState.recordedState.operator instanceof ChangeOperator) {
    //     await vimState.setCurrentMode(ModeName.Insert);
    //   }
    //   return {
    //     start: startPosition,
    //     stop: startPosition,
    //     failed: true,
    //   };
    // }
    vimState.cursorStartPosition = startPosition;
    return {
      start: startPosition,
      stop: endPosition,
    };
  }
}

@RegisterAction
export class MoveInsideTag extends MoveTagMatch {
  keys = ['i', 't'];
  includeTag = false;
}

@RegisterAction
export class MoveAroundTag extends MoveTagMatch {
  keys = ['a', 't'];
  includeTag = true;
}

export class ArrowsInInsertMode extends BaseMovement {
  modes = [ModeName.Insert];
  keys: string[];

  public async execAction(position: Position, vimState: VimState): Promise<Position> {
    // we are in Insert Mode and arrow keys will clear all other actions except the first action, which enters Insert Mode.
    // Please note the arrow key movement can be repeated while using `.` but it can't be repeated when using `<C-A>` in Insert Mode.
    vimState.recordedState.actionsRun = [
      vimState.recordedState.actionsRun.shift()!,
      vimState.recordedState.actionsRun.pop()!,
    ];
    let newPosition: Position = position;

    switch (this.keys[0]) {
      case '<up>':
        newPosition = <Position>await new MoveUpArrow().execAction(position, vimState);
        break;
      case '<down>':
        newPosition = <Position>await new MoveDownArrow().execAction(position, vimState);
        break;
      case '<left>':
        newPosition = await new MoveLeftArrow(this.keysPressed).execAction(position, vimState);
        break;
      case '<right>':
        newPosition = await new MoveRightArrow(this.keysPressed).execAction(position, vimState);
        break;
      default:
        break;
    }
    vimState.replaceState = new ReplaceState(newPosition);
    return newPosition;
  }
}

@RegisterAction
class UpArrowInInsertMode extends ArrowsInInsertMode {
  keys = ['<up>'];
}

@RegisterAction
class DownArrowInInsertMode extends ArrowsInInsertMode {
  keys = ['<down>'];
}

@RegisterAction
class LeftArrowInInsertMode extends ArrowsInInsertMode {
  keys = ['<left>'];
}

@RegisterAction
class RightArrowInInsertMode extends ArrowsInInsertMode {
  keys = ['<right>'];
}
