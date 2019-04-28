import * as node from '../commands/setoptions';
import { Scanner } from '../scanner';

export function parseOption(args: string): node.IOptionArgs {
  let scanner = new Scanner(args);
  scanner.skipWhiteSpace();

  if (scanner.isAtEof) {
    return {};
  }

  let optionName = scanner.nextWord('?!&=:^+-'.split(''));

  if (optionName.startsWith('no')) {
    return {
      name: optionName.substring(2, optionName.length),
      operator: node.SetOptionOperator.Reset,
    };
  }

  if (optionName.startsWith('inv')) {
    return {
      name: optionName.substring(3, optionName.length),
      operator: node.SetOptionOperator.Invert,
    };
  }

  scanner.skipWhiteSpace();

  if (scanner.isAtEof) {
    return {
      name: optionName,
      operator: node.SetOptionOperator.Set,
    };
  }

  let operator = scanner.next();
  let optionArgs: node.IOptionArgs = {
    name: optionName,
    value: scanner.nextWord([]),
  };

  switch (operator) {
    case '=':
    case ':':
      optionArgs.operator = node.SetOptionOperator.Equal;
      break;
    case '!':
      optionArgs.operator = node.SetOptionOperator.Invert;
      break;
    case '^':
      optionArgs.operator = node.SetOptionOperator.Multiply;
      break;
    case '+':
      optionArgs.operator = node.SetOptionOperator.Append;
      break;
    case '-':
      optionArgs.operator = node.SetOptionOperator.Subtract;
      break;
    case '?':
      optionArgs.operator = node.SetOptionOperator.Info;
      break;
    case '&':
      optionArgs.operator = node.SetOptionOperator.Reset;
      break;
    default:
      throw new Error(`Unsupported operator (${operator}).`);
  }

  return optionArgs;
}

export function parseOptionsCommandArgs(args: string): node.SetOptionsCommand {
  let option = parseOption(args);
  return new node.SetOptionsCommand(option);
}
