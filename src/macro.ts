import { BaseAction } from './actions/base';

export class Macro {
  registerName: string;
  keysPressed: string[] = [];
  // NOTE(mm): only used temporarly while recording the actions, compressed to
  // keysPressed when CommandQuitRecordMacro gets called
  actionsRun: BaseAction[] = [];
}
