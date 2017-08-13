import { EasyMotion } from './easymotion';
import { Position } from './../../../common/motion/position';
import { ModeName } from './../../../mode/mode';
import { Configuration } from './../../../configuration/configuration';
import { BaseCommand } from './../../commands/actions';
import { RegisterAction } from './../../base';
import { VimState } from './../../../mode/modeHandler';

abstract class BaseEasyMotionCommand extends BaseCommand {
  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    throw new Error('Not implemented!');
  }

  public getMatchPosition(
    match: EasyMotion.Match,
    position: Position,
    vimState: VimState
  ): Position {
    return match.position;
  }

  public processMarkers(matches: EasyMotion.Match[], position: Position, vimState: VimState) {
    // Clear existing markers, just in case
    vimState.easyMotion.clearMarkers();

    var index = 0;
    for (var j = 0; j < matches.length; j++) {
      var match = matches[j];
      var pos = this.getMatchPosition(match, position, vimState);

      if (match.position.isEqual(position)) {
        continue;
      }

      let marker = EasyMotion.generateMarker(index++, matches.length, position, pos);
      if (marker) {
        vimState.easyMotion.addMarker(marker);
      }
    }
  }

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    // Only execute the action if the configuration is set
    if (!Configuration.easymotion) {
      return vimState;
    }

    // Search all occurences of the character pressed
    let matches = this.getMatches(position, vimState);

    // Stop if there are no matches
    if (matches.length === 0) {
      return vimState;
    }

    // Enter the EasyMotion mode and await further keys
    vimState.easyMotion = new EasyMotion();

    // Store mode to return to after performing easy motion
    vimState.easyMotion.previousMode = vimState.currentMode;

    vimState.currentMode = ModeName.EasyMotionMode;

    this.processMarkers(matches, position, vimState);

    return vimState;
  }
}

@RegisterAction
class ActionEasyMotionSearchCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'g', '<character>', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = `${this.keysPressed[2]}${this.keysPressed[3]}`;

    // Search all occurences of the character pressed
    if (searchChar === '  ') {
      // Searching for spaces should only find the first spaces
      return vimState.easyMotion.sortedSearch(position, new RegExp('  {1,}', 'g'));
    } else {
      return vimState.easyMotion.sortedSearch(position, searchChar);
    }
  }
}

@RegisterAction
class ActionEasyMotionFindForwardCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'f', '<character>', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = `${this.keysPressed[2]}${this.keysPressed[3]}`;

    // Search all occurences of the character pressed after the cursor
    if (searchChar === '  ') {
      // Searching for spaces should only find the first spaces
      return vimState.easyMotion.sortedSearch(position, new RegExp('  {1,}', 'g'), {
        min: position,
      });
    } else {
      return vimState.easyMotion.sortedSearch(position, searchChar, {
        min: position,
      });
    }
  }
}

@RegisterAction
class ActionEasyMotionFindBackwardCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'F', '<character>', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = `${this.keysPressed[2]}${this.keysPressed[3]}`;

    // Search all occurences of the character pressed after the cursor
    if (searchChar === '  ') {
      // Searching for spaces should only find the first spaces
      return vimState.easyMotion.sortedSearch(position, new RegExp('  {1,}', 'g'), {
        max: position,
      });
    } else {
      return vimState.easyMotion.sortedSearch(position, searchChar, {
        max: position,
      });
    }
  }
}

@RegisterAction
class ActionEasyMotionTilForwardCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 't', '<character>', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = `${this.keysPressed[2]}${this.keysPressed[3]}`;

    // Search all occurences of the character pressed after the cursor
    if (searchChar === '  ') {
      // Searching for spaces should only find the first spaces
      return vimState.easyMotion.sortedSearch(position, new RegExp('  {1,}', 'g'), {
        min: position,
      });
    } else {
      return vimState.easyMotion.sortedSearch(position, searchChar, {
        min: position,
      });
    }
  }

  public getMatchPosition(
    match: EasyMotion.Match,
    position: Position,
    vimState: VimState
  ): Position {
    return new Position(match.position.line, Math.max(0, match.position.character - 1));
  }
}

@RegisterAction
class ActionEasyMotionTilBackwardCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'T', '<character>', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = `${this.keysPressed[2]}${this.keysPressed[3]}`;

    // Search all occurences of the character pressed after the cursor
    if (searchChar === '  ') {
      // Searching for spaces should only find the first spaces
      return vimState.easyMotion.sortedSearch(position, new RegExp('  {1,}'), {
        max: position,
      });
    } else {
      return vimState.easyMotion.sortedSearch(position, searchChar, {
        max: position,
      });
    }
  }

  public getMatchPosition(
    match: EasyMotion.Match,
    position: Position,
    vimState: VimState
  ): Position {
    return new Position(match.position.line, Math.max(0, match.position.character + 1));
  }
}

@RegisterAction
class ActionEasyMotionWordForwardsCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 's', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = this.keysPressed[2];
    const regex = `\\b${searchChar}`;
    // Search for the beginning of all words after the cursor
    return vimState.easyMotion.sortedSearch(position, new RegExp(regex, 'g'), {
      min: position,
    });
  }
}

@RegisterAction
class ActionEasyMotionWordBackwardsCommand extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'S', '<character>'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    const searchChar = this.keysPressed[2];
    const regex = `\\b${searchChar}`;
    // Search for the end of all words after the cursor
    return vimState.easyMotion.sortedSearch(position, new RegExp(regex, 'g'), {
      max: position,
    });
  }

  public getMatchPosition(
    match: EasyMotion.Match,
    position: Position,
    vimState: VimState
  ): Position {
    return new Position(match.position.line, match.position.character + match.text.length - 1);
  }
}

@RegisterAction
class ActionEasyMotionDownLines extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'j'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    // Search for the beginning of all non whitespace chars on each line after the cursor
    let matches = vimState.easyMotion.sortedSearch(position, new RegExp('^.', 'gm'), {
      min: position,
    });

    for (let match of matches) {
      match.position = match.position.getFirstLineNonBlankChar();
    }
    return matches;
  }
}

@RegisterAction
class ActionEasyMotionUpLines extends BaseEasyMotionCommand {
  modes = [ModeName.Normal, ModeName.Visual, ModeName.VisualLine, ModeName.VisualBlock];
  keys = ['<leader>', 'k'];

  public getMatches(position: Position, vimState: VimState): EasyMotion.Match[] {
    // Search for the beginning of all non whitespace chars on each line before the cursor
    let matches = vimState.easyMotion.sortedSearch(position, new RegExp('^.', 'gm'), {
      max: position,
    });

    for (let match of matches) {
      match.position = match.position.getFirstLineNonBlankChar();
    }
    return matches;
  }
}

@RegisterAction
class MoveEasyMotion extends BaseCommand {
  modes = [ModeName.EasyMotionMode];
  keys = ['<character>'];

  public async exec(position: Position, vimState: VimState): Promise<VimState> {
    var key = this.keysPressed[0];
    if (!key) {
      return vimState;
    }

    // "nail" refers to the accumulated depth keys
    var nail = vimState.easyMotion.accumulation + key;
    vimState.easyMotion.accumulation = nail;

    // Find markers starting with "nail"
    var markers = vimState.easyMotion.findMarkers(nail);

    // If previous mode was visual, restore visual selection
    if (
      vimState.easyMotion.previousMode === ModeName.Visual ||
      vimState.easyMotion.previousMode === ModeName.VisualLine ||
      vimState.easyMotion.previousMode === ModeName.VisualBlock
    ) {
      vimState.cursorStartPosition = vimState.lastVisualSelectionStart;
      vimState.cursorPosition = vimState.lastVisualSelectionEnd;
    }

    if (markers.length === 1) {
      // Only one found, navigate to it
      var marker = markers[0];

      vimState.easyMotion.clearDecorations();
      // Restore the mode from before easy motion
      vimState.currentMode = vimState.easyMotion.previousMode;

      // Set cursor position based on marker entered
      vimState.cursorPosition = marker.position;

      return vimState;
    } else {
      if (markers.length === 0) {
        // None found, exit mode
        vimState.easyMotion.clearDecorations();
        vimState.currentMode = vimState.easyMotion.previousMode;

        return vimState;
      }
    }

    return vimState;
  }
}
