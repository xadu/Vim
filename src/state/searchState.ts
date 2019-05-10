import * as vscode from 'vscode';

import { configuration } from '../configuration/configuration';
import { Position } from './../common/motion/position';
import { ModeName } from './../mode/mode';
import { TextEditor } from './../textEditor';

export enum SearchDirection {
  Forward = 1,
  Backward = -1,
}

/**
 * State involved with beginning a search (/).
 */
export class SearchState {
  private static readonly MAX_SEARCH_RANGES = 1000;
  private static specialCharactersRegex: RegExp = /[\-\[\]{}()*+?.,\\\^$|#\s]/g;
  private static caseOverrideRegex: RegExp = /\\[Cc]/g;
  public previousMode = ModeName.Normal;

  private _matchRanges: vscode.Range[] = [];

  /**
   * Every range in the document that matches the search string.
   */
  public get matchRanges(): vscode.Range[] {
    return this._matchRanges;
  }

  private _searchCursorStartPosition: Position;
  public get searchCursorStartPosition(): Position {
    return this._searchCursorStartPosition;
  }

  private _cachedDocumentVersion: number;
  private _cachedDocumentName: String;
  private _searchDirection: SearchDirection = SearchDirection.Forward;
  public get searchDirection(): SearchDirection {
    return this._searchDirection;
  }

  private isRegex: boolean;

  private _searchString = '';
  public get searchString(): string {
    return this._searchString;
  }

  public set searchString(search: string) {
    if (this._searchString !== search) {
      this._searchString = search;
      this._recalculateSearchRanges({ forceRecalc: true });
    }
  }

  private _recalculateSearchRanges({ forceRecalc }: { forceRecalc?: boolean } = {}): void {
    const search = this.searchString;
    if (search === '') {
      return;
    }

    // checking if the tab that is worked on has changed, or the file version has changed
    const shouldRecalculate =
      TextEditor.isActive &&
      (this._cachedDocumentName !== TextEditor.getDocumentName() ||
        this._cachedDocumentVersion !== TextEditor.getDocumentVersion() ||
        forceRecalc);

    if (shouldRecalculate) {
      // Calculate and store all matching ranges
      this._cachedDocumentVersion = TextEditor.getDocumentVersion();
      this._cachedDocumentName = TextEditor.getDocumentName();
      this._matchRanges = [];

      /*
       * Decide whether the search is case sensitive.
       * If ignorecase is false, the search is case sensitive.
       * If ignorecase is true, the search should be case insensitive.
       * If both ignorecase and smartcase are true, the search is case sensitive only when the search string contains UpperCase character.
       */
      let ignorecase = configuration.ignorecase;

      if (ignorecase && configuration.smartcase && /[A-Z]/.test(search)) {
        ignorecase = false;
      }

      let ignorecaseOverride = search.match(SearchState.caseOverrideRegex);
      let searchRE = search;

      if (ignorecaseOverride) {
        // Vim strips all \c's but uses the behavior of the first one.
        searchRE = search.replace(SearchState.caseOverrideRegex, '');
        ignorecase = ignorecaseOverride[0][1] === 'c';
      }

      if (!this.isRegex) {
        searchRE = search.replace(SearchState.specialCharactersRegex, '\\$&');
      }

      const regexFlags = ignorecase ? 'gim' : 'gm';

      let regex: RegExp;
      try {
        regex = new RegExp(searchRE, regexFlags);
      } catch (err) {
        // Couldn't compile the regexp, try again with special characters escaped
        searchRE = search.replace(SearchState.specialCharactersRegex, '\\$&');
        regex = new RegExp(searchRE, regexFlags);
      }
      // We store the entire text file as a string inside text, and run the
      // regex against it many times to find all of our matches. In order to
      // transform from the absolute position in the string to a Position
      // object, we store a prefix sum of the line lengths, and binary search
      // through it in order to find the current line and character.
      const finalPos = new Position(TextEditor.getLineCount() - 1, 0).getLineEndIncludingEOL();
      const text = TextEditor.getText(new vscode.Range(new Position(0, 0), finalPos));
      const lineLengths = text.split('\n').map(x => x.length + 1);
      let sumLineLengths: number[] = [];
      let curLength = 0;
      for (const length of lineLengths) {
        sumLineLengths.push(curLength);
        curLength += length;
      }
      const absPosToPosition = (
        val: number,
        l: number,
        r: number,
        arr: Array<number>
      ): Position => {
        const mid = Math.floor((l + r) / 2);
        if (l === r - 1) {
          return new Position(l, val - arr[mid]);
        }
        if (arr[mid] > val) {
          return absPosToPosition(val, l, mid, arr);
        } else {
          return absPosToPosition(val, mid, r, arr);
        }
      };
      const selection = vscode.window.activeTextEditor!.selection;
      const startPos =
        sumLineLengths[Math.min(selection.start.line, selection.end.line)] +
        selection.active.character;
      regex.lastIndex = startPos;
      let result = regex.exec(text);
      let wrappedOver = false;

      do {
        if (this._matchRanges.length >= SearchState.MAX_SEARCH_RANGES) {
          break;
        }

        // We need to wrap around to the back if we reach the end.
        if (!result && !wrappedOver) {
          regex.lastIndex = 0;
          wrappedOver = true;
          result = regex.exec(text);
        }
        if (!result) {
          break;
        }

        this._matchRanges.push(
          new vscode.Range(
            absPosToPosition(result.index, 0, sumLineLengths.length, sumLineLengths),
            absPosToPosition(
              result.index + result[0].length,
              0,
              sumLineLengths.length,
              sumLineLengths
            )
          )
        );

        if (result.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        result = regex.exec(text);
        if (!result && !wrappedOver) {
          regex.lastIndex = 0;
          wrappedOver = true;
          result = regex.exec(text);
        }
      } while (result && !(wrappedOver && result!.index >= startPos));

      this._matchRanges.sort((x, y) =>
        x.start.line < y.start.line ||
        (x.start.line === y.start.line && x.start.character < y.start.character)
          ? -1
          : 1
      );
    }
  }

  /**
   * The position of the next search.
   * match == false if there is no match.
   *
   * Pass in -1 as direction to reverse the direction we search.
   */
  public getNextSearchMatchPosition(
    startPosition: Position,
    direction = 1
  ): { pos: Position; match: boolean; index: number } {
    const { start, match, index } = this.getNextSearchMatchRange(startPosition, direction);
    return { pos: start, match, index };
  }

  /**
   * The position of the next search.
   * match == false if there is no match.
   *
   * Pass in -1 as direction to reverse the direction we search.
   *
   * end is exclusive; which means the index is start + matchedString.length
   */
  public getNextSearchMatchRange(
    startPosition: Position,
    direction: number = 1
  ): { start: Position; end: Position; match: boolean; index: number } {
    this._recalculateSearchRanges();

    if (this._matchRanges.length === 0) {
      // TODO(bell)
      return { start: startPosition, end: startPosition, match: false, index: -1 };
    }

    const effectiveDirection = direction * this._searchDirection;

    if (effectiveDirection === SearchDirection.Forward) {
      for (let [index, matchRange] of this._matchRanges.entries()) {
        if (matchRange.start.compareTo(startPosition) > 0) {
          return {
            start: Position.FromVSCodePosition(matchRange.start),
            end: Position.FromVSCodePosition(matchRange.end),
            match: true,
            index,
          };
        }
      }

      // Wrap around
      // TODO(bell)
      const range = this._matchRanges[0];
      return {
        start: Position.FromVSCodePosition(range.start),
        end: Position.FromVSCodePosition(range.end),
        match: true,
        index: 0,
      };
    } else {
      for (let [index, matchRange] of this._matchRanges
        .slice(0)
        .reverse()
        .entries()) {
        if (matchRange.start.compareTo(startPosition) < 0) {
          return {
            start: Position.FromVSCodePosition(matchRange.start),
            end: Position.FromVSCodePosition(matchRange.end),
            match: true,
            index: this._matchRanges.length - index - 1,
          };
        }
      }

      // TODO(bell)
      const range = this._matchRanges[this._matchRanges.length - 1];
      return {
        start: Position.FromVSCodePosition(range.start),
        end: Position.FromVSCodePosition(range.end),
        match: true,
        index: this._matchRanges.length - 1,
      };
    }
  }

  public getSearchMatchRangeOf(
    pos: Position
  ): { start: Position; end: Position; match: boolean; index: number } {
    this._recalculateSearchRanges();

    if (this._matchRanges.length === 0) {
      // TODO(bell)
      return { start: pos, end: pos, match: false, index: -1 };
    }

    for (let [index, matchRange] of this._matchRanges.entries()) {
      if (matchRange.start.compareTo(pos) <= 0 && matchRange.end.compareTo(pos) > 0) {
        return {
          start: Position.FromVSCodePosition(matchRange.start),
          end: Position.FromVSCodePosition(matchRange.end),
          match: true,
          index,
        };
      }
    }

    // TODO(bell)
    return { start: pos, end: pos, match: false, index: -1 };
  }

  constructor(
    direction: SearchDirection,
    startPosition: Position,
    searchString = '',
    { isRegex = false } = {},
    currentMode: ModeName
  ) {
    this._searchDirection = direction;
    this._searchCursorStartPosition = startPosition;
    this.isRegex = isRegex;
    this.searchString = searchString;
    this.previousMode = currentMode;
  }
}
