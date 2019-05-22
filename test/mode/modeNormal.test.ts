import { getAndUpdateModeHandler } from '../../extension';
import { ModeName } from '../../src/mode/mode';
import { ModeHandler } from '../../src/mode/modeHandler';
import { TextEditor } from '../../src/textEditor';
import { Configuration } from '../testConfiguration';
import { getTestingFunctions } from '../testSimplifier';
import { assertEqual, cleanUpWorkspace, setupWorkspace } from './../testUtils';

suite('Mode Normal', () => {
  let modeHandler: ModeHandler;
  let { newTest, newTestOnly } = getTestingFunctions();

  setup(async () => {
    let configuration = new Configuration();
    configuration.tabstop = 4;
    configuration.expandtab = false;

    await setupWorkspace(configuration);
    modeHandler = await getAndUpdateModeHandler();
  });

  teardown(cleanUpWorkspace);

  test('Can be activated', async () => {
    let activationKeys = ['<Esc>', '<C-[>'];

    for (let key of activationKeys) {
      await modeHandler.handleKeyEvent('i');
      await modeHandler.handleKeyEvent(key!);

      assertEqual(modeHandler.currentMode.name, ModeName.Normal, `${key} doesn't work.`);
    }

    await modeHandler.handleKeyEvent('v');
    await modeHandler.handleKeyEvent('v');

    assertEqual(modeHandler.currentMode.name, ModeName.Normal);
  });

  newTest({
    title: 'Can handle dw',
    start: ['one |two three'],
    keysPressed: 'dw',
    end: ['one |three'],
  });

  newTest({
    title: 'Can handle dw',
    start: ['one | '],
    keysPressed: 'dw',
    end: ['one| '],
  });

  newTest({
    title: 'Can handle dw',
    start: ['one |two'],
    keysPressed: 'dw',
    end: ['one| '],
  });

  newTest({
    title: 'Can handle dw across lines (1)',
    start: ['one |two', '  three'],
    keysPressed: 'dw',
    end: ['one| ', '  three'],
  });

  newTest({
    title: 'Can handle dw across lines (2)',
    start: ['one |two', '', 'three'],
    keysPressed: 'dw',
    end: ['one| ', '', 'three'],
  });

  newTest({
    title: 'Can handle dd last line',
    start: ['one', '|two'],
    keysPressed: 'dd',
    end: ['|one'],
  });

  newTest({
    title: 'Can handle dd single line',
    start: ['|one'],
    keysPressed: 'dd',
    end: ['|'],
  });

  newTest({
    title: 'Can handle dd',
    start: ['|one', 'two'],
    keysPressed: 'dd',
    end: ['|two'],
  });

  newTest({
    title: 'Can handle 3dd',
    start: ['|one', 'two', 'three', 'four', 'five'],
    keysPressed: '3dd',
    end: ['|four', 'five'],
  });

  newTest({
    title: 'Can handle 3dd off end of document',
    start: ['one', 'two', 'three', '|four', 'five'],
    keysPressed: '3dd',
    end: ['one', 'two', '|three'],
  });

  newTest({
    title: 'Can handle d2d',
    start: ['one', 'two', '|three', 'four', 'five'],
    keysPressed: 'd2d',
    end: ['one', 'two', '|five'],
  });

  newTest({
    title: 'Can handle dd empty line',
    start: ['one', '|', 'two'],
    keysPressed: 'dd',
    end: ['one', '|two'],
  });

  newTest({
    title: 'Can handle ddp',
    start: ['|one', 'two'],
    keysPressed: 'ddp',
    end: ['two', '|one'],
  });

  newTest({
    title: "Can handle 'de'",
    start: ['text tex|t'],
    keysPressed: '^de',
    end: ['| text'],
  });

  newTest({
    title: "Can handle 'de' then 'de' again",
    start: ['text tex|t'],
    keysPressed: '^dede',
    end: ['|'],
  });

  newTest({
    title: "Can handle 'db'",
    start: ['One tw|o'],
    keysPressed: '$db',
    end: ['One |o'],
  });

  newTest({
    title: "Can handle 'db then 'db' again",
    start: ['One tw|o'],
    keysPressed: '$dbdb',
    end: ['|o'],
  });

  newTest({
    title: "Can handle 'dl' at end of line",
    start: ['bla|h'],
    keysPressed: '$dldldl',
    end: ['|b'],
  });

  newTest({
    title: "Can handle 'dF'",
    start: ['abcdefg|h'],
    keysPressed: 'dFd',
    end: ['abc|h'],
  });

  newTest({
    title: "Can handle 'dT'",
    start: ['abcdefg|h'],
    keysPressed: 'dTd',
    end: ['abcd|h'],
  });

  newTest({
    title: "Can handle 'd3' then <enter>",
    start: ['|1', '2', '3', '4', '5', '6'],
    keysPressed: 'd3\n',
    end: ['|5', '6'],
  });

  newTest({
    title: "Can handle 'dj'",
    start: ['|11', '22', '33', '44', '55', '66'],
    keysPressed: 'dj',
    end: ['|33', '44', '55', '66'],
  });

  newTest({
    title: "Can handle 'dk'",
    start: ['11', '22', '33', '44', '55', '|66'],
    keysPressed: 'dk',
    end: ['11', '22', '33', '|44'],
  });

  newTest({
    title: "Can handle 'd])' without deleting closing parenthesis",
    start: ['(hello, |world)'],
    keysPressed: 'd])',
    end: ['(hello, |)'],
  });

  newTest({
    title: "Can handle 'd]}' without deleting closing bracket",
    start: ['{hello, |world}'],
    keysPressed: 'd]}',
    end: ['{hello, |}'],
  });

  newTest({
    title: "Can handle 'cw'",
    start: ['text text tex|t'],
    keysPressed: '^lllllllcw',
    end: ['text te| text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'cw' without deleting following white spaces",
    start: ['|const a = 1;'],
    keysPressed: 'cw',
    end: ['| a = 1;'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'c2w'",
    start: ['|const a = 1;'],
    keysPressed: 'c2w',
    end: ['| = 1;'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'cw' without removing EOL",
    start: ['|text;', 'text'],
    keysPressed: 'llllcw',
    end: ['text|', 'text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'c])' without deleting closing parenthesis",
    start: ['(hello, |world)'],
    keysPressed: 'c])',
    end: ['(hello, |)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'c]}' without deleting closing bracket",
    start: ['{hello, |world}'],
    keysPressed: 'c]}',
    end: ['{hello, |}'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 's'",
    start: ['tex|t'],
    keysPressed: '^sk',
    end: ['k|ext'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'yiw' with correct cursor ending position",
    start: ['tes|t'],
    keysPressed: 'yiwp',
    end: ['ttes|test'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'ciw'",
    start: ['text text tex|t'],
    keysPressed: '^lllllllciw',
    end: ['text | text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ciw' on blanks",
    start: ['text   text tex|t'],
    keysPressed: '^lllllciw',
    end: ['text|text text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'caw'",
    start: ['text text tex|t'],
    keysPressed: '^llllllcaw',
    end: ['text |text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'caw' on first letter",
    start: ['text text tex|t'],
    keysPressed: '^lllllcaw',
    end: ['text |text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'caw' on blanks",
    start: ['text   tex|t'],
    keysPressed: '^lllllcaw',
    end: ['text|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'caw' on blanks",
    start: ['text |   text text'],
    keysPressed: 'caw',
    end: ['text| text'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci(' on first parentheses",
    start: ['print(|"hello")'],
    keysPressed: 'ci(',
    end: ['print(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci(' with nested parentheses",
    start: ['call|(() => 5)'],
    keysPressed: 'ci(',
    end: ['call(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci(' backwards through nested parens",
    start: ['call(() => |5)'],
    keysPressed: 'ci(',
    end: ['call(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'cib' on first parentheses",
    start: ['print(|"hello")'],
    keysPressed: 'cib',
    end: ['print(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci(' across multiple lines with last character at beginning",
    start: ['(|a', 'b)'],
    keysPressed: 'ci)',
    end: ['(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle count prefixed 'ci)'",
    start: [' b(l(baz(f|oo)baz)a)h '],
    keysPressed: 'c3i)',
    end: [' b(|)h '],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle count prefixed 'ca)'",
    start: [' b(l(baz(f|oo)baz)a)h '],
    keysPressed: 'c3a)',
    end: [' b|h '],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca(' spanning multiple lines",
    start: ['call(', '  |arg1)'],
    keysPressed: 'ca(',
    end: ['call|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'cab' spanning multiple lines",
    start: ['call(', '  |arg1)'],
    keysPressed: 'cab',
    end: ['call|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci{' spanning multiple lines",
    start: ['one {', '|', '}'],
    keysPressed: 'ci{',
    end: ['one {', '|', '}'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci{' spanning multiple lines and handle whitespaces correctly",
    start: ['one {  ', '|', '}'],
    keysPressed: 'ci{',
    end: ['one {|', '}'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci{' spanning multiple lines and handle whitespaces correctly",
    start: ['one {', '|', '  }'],
    keysPressed: 'ci{',
    end: ['one {', '|', '  }'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci(' on the closing bracket",
    start: ['(one|)'],
    keysPressed: 'ci(',
    end: ['(|)'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ciB' spanning multiple lines",
    start: ['one {', '|', '}'],
    keysPressed: 'ciB',
    end: ['one {', '|', '}'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'will fail when ca( with no ()',
    start: ['|blaaah'],
    keysPressed: 'ca(',
    end: ['|blaaah'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'will fail when ca{ with no {}',
    start: ['|blaaah'],
    keysPressed: 'ca{',
    end: ['|blaaah'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'will fail when caB with no {}',
    start: ['|blaaah'],
    keysPressed: 'caB',
    end: ['|blaaah'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'ci[' spanning multiple lines",
    start: ['one [', '|', ']'],
    keysPressed: 'ci[',
    end: ['one [', '|', ']'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci]' on first bracket",
    start: ['one[|"two"]'],
    keysPressed: 'ci]',
    end: ['one[|]'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca[' on first bracket",
    start: ['one[|"two"]'],
    keysPressed: 'ca[',
    end: ['one|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca]' on first bracket",
    start: ['one[|"two"]'],
    keysPressed: 'ca]',
    end: ['one|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci'' on first quote",
    start: ["|'one'"],
    keysPressed: "ci'",
    end: ["'|'"],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci'' inside quoted string",
    start: ["'o|ne'"],
    keysPressed: "ci'",
    end: ["'|'"],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci'' on closing quote",
    start: ["'one|'"],
    keysPressed: "ci'",
    end: ["'|'"],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci'' when string is ahead",
    start: ["on|e 'two'"],
    keysPressed: "ci'",
    end: ["one '|'"],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' on opening quote",
    start: ['|"one"'],
    keysPressed: 'ci"',
    end: ['"|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' starting behind the quoted word",
    start: ['|one "two"'],
    keysPressed: 'ci"',
    end: ['one "|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca\"' starting behind the quoted word",
    start: ['|one "two"'],
    keysPressed: 'ca"',
    end: ['one |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca\"' starting on the opening quote",
    start: ['one |"two"'],
    keysPressed: 'ca"',
    end: ['one |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with escaped quotes",
    start: ['"one \\"tw|o\\""'],
    keysPressed: 'ci"',
    end: ['"|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with a single escaped quote",
    start: ['|"one \\" two"'],
    keysPressed: 'ci"',
    end: ['"|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with a single escaped quote behind",
    start: ['one "two \\" |three"'],
    keysPressed: 'ci"',
    end: ['one "|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with an escaped backslash",
    start: ['one "tw|o \\\\three"'],
    keysPressed: 'ci"',
    end: ['one "|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with an escaped backslash on closing quote",
    start: ['"\\\\|"'],
    keysPressed: 'ci"',
    end: ['"|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ca\"' starting on the closing quote",
    start: ['one "two|"'],
    keysPressed: 'ca"',
    end: ['one |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'ci\"' with complex escape sequences",
    start: ['"two|\\\\\\""'],
    keysPressed: 'ci"',
    end: ['"|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can pick the correct open quote between two strings for 'ci\"'",
    start: ['"one" |"two"'],
    keysPressed: 'ci"',
    end: ['"one" "|"'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'will fail when ca" ahead of quoted string',
    start: ['"one" |two'],
    keysPressed: 'ca"',
    end: ['"one" |two'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'ca`' inside word",
    start: ['one `t|wo`'],
    keysPressed: 'ca`',
    end: ['one |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "Can handle 'daw' on word with cursor inside spaces",
    start: ['one   two |  three,   four  '],
    keysPressed: 'daw',
    end: ['one   two|,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on word with trailing spaces",
    start: ['one   tw|o   three,   four  '],
    keysPressed: 'daw',
    end: ['one   |three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on word with leading spaces",
    start: ['one   two   th|ree,   four  '],
    keysPressed: 'daw',
    end: ['one   two|,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on word with numeric prefix",
    start: ['on|e   two   three,   four  '],
    keysPressed: 'd3aw',
    end: ['|,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on word with numeric prefix and across lines",
    start: ['one   two   three,   fo|ur  ', 'five  six'],
    keysPressed: 'd2aw',
    end: ['one   two   three,   |six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on word with numeric prefix and across lines",
    start: ['one two fo|ur', 'five  six'],
    keysPressed: 'd2aw',
    end: ['one two |six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title:
      "Can handle 'daw' on word with numeric prefix and across lines, containing words end with `.`",
    start: ['one   two   three,   fo|ur  ', 'five.  six'],
    keysPressed: 'd2aw',
    end: ['one   two   three,   |.  six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on end of word",
    start: ['one   two   three   fou|r'],
    keysPressed: 'daw',
    end: ['one   two   thre|e'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daw' on words at beginning of line with leading whitespace",
    start: ['if (something){', '  |this.method();'],
    keysPressed: 'daw',
    end: ['if (something){', '  |.method();'],
  });

  newTest({
    title: "Can handle 'daw' on words at ends of lines in the middle of whitespace",
    start: ['one two | ', 'four'],
    keysPressed: 'daw',
    end: ['one tw|o'],
  });

  newTest({
    title: "Can handle 'daw' on word at beginning of file",
    start: ['o|ne'],
    keysPressed: 'daw',
    end: ['|'],
  });

  newTest({
    title: "Can handle 'daw' on word at beginning of line",
    start: ['one two', 'th|ree'],
    keysPressed: 'daw',
    end: ['one two', '|'],
  });

  newTest({
    title: "Can handle 'daw' on word at end of line with trailing whitespace",
    start: ['one tw|o  ', 'three four'],
    keysPressed: 'daw',
    end: ['one| ', 'three four'],
  });

  newTest({
    title: "Can handle 'daw' around word at end of line",
    start: ['one t|wo', ' three'],
    keysPressed: 'daw',
    end: ['on|e', ' three'],
  });

  newTest({
    title: "Can handle 'daW' on big word with cursor inside spaces",
    start: ['one   two |  three,   four  '],
    keysPressed: 'daW',
    end: ['one   two|   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' around word at whitespace",
    start: ['<div  | class="btn"> foo'],
    keysPressed: 'daW',
    end: ['<div| foo'],
  });

  newTest({
    title: "Can handle 'daW' on word with trailing spaces",
    start: ['one   tw|o   three,   four  '],
    keysPressed: 'daW',
    end: ['one   |three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' on word with leading spaces",
    start: ['one   two   th|ree,   four  '],
    keysPressed: 'daW',
    end: ['one   two   |four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' on word with numeric prefix",
    start: ['on|e   two   three,   four  '],
    keysPressed: 'd3aW',
    end: ['|four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' on word with numeric prefix and across lines",
    start: ['one   two   three,   fo|ur  ', 'five.  six'],
    keysPressed: 'd2aW',
    end: ['one   two   three,   |six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' on beginning of word",
    start: ['one |two three'],
    keysPressed: 'daW',
    end: ['one |three'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' on end of one line",
    start: ['one |two'],
    keysPressed: 'daW',
    end: ['on|e'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'daW' around word at the last WORD (t|wo)",
    start: ['one t|wo', ' three'],
    keysPressed: 'daW',
    end: ['on|e', ' three'],
  });

  newTest({
    title: "Can handle 'daW' around word at the last WORD (tw|o)",
    start: ['one tw|o', ' three'],
    keysPressed: 'daW',
    end: ['on|e', ' three'],
  });

  newTest({
    title: 'Can handle \'daW\' around word at the last WORD (class="btn"|>)',
    start: ['<div class="btn"|>', 'foo'],
    keysPressed: 'daW',
    end: ['<di|v', 'foo'],
  });

  newTest({
    title: 'Can handle \'daW\' around word at the last WORD of the end of document (class="btn"|>)',
    start: ['<div class="btn"|>'],
    keysPressed: 'daW',
    end: ['<di|v'],
  });

  newTest({
    title: 'Can handle \'daW\' around word at the last WORD (c|lass="btn">)',
    start: ['<div c|lass="btn">', 'foo'],
    keysPressed: 'daW',
    end: ['<di|v', 'foo'],
  });

  newTest({
    title: 'Can handle \'daW\' around word at the last WORD of the end of document (c|lass="btn">)',
    start: ['<div c|lass="btn">'],
    keysPressed: 'daW',
    end: ['<di|v'],
  });

  newTest({
    title: "Can handle 'diw' on word with cursor inside spaces",
    start: ['one   two |  three,   four  '],
    keysPressed: 'diw',
    end: ['one   two|three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diw' on word",
    start: ['one   tw|o   three,   four  '],
    keysPressed: 'diw',
    end: ['one   |   three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diw' on word with numeric prefix",
    start: ['on|e   two   three,   four  '],
    keysPressed: 'd3iw',
    end: ['|   three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diw' on trailing spaces at the end of line",
    start: ['one   two   three  | ', 'five  six'],
    keysPressed: 'diw',
    end: ['one   two   thre|e', 'five  six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diw' on word with numeric prefix and across lines",
    start: ['one   two   three,   fo|ur  ', 'five  six'],
    keysPressed: 'd3iw',
    end: ['one   two   three,   |  six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title:
      "Can handle 'diw' on word with numeric prefix and across lines, containing words end with `.`",
    start: ['one   two   three,   fo|ur  ', 'five.  six'],
    keysPressed: 'd3iw',
    end: ['one   two   three,   |.  six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on big word with cursor inside spaces",
    start: ['one   two |  three,   four  '],
    keysPressed: 'diW',
    end: ['one   two|three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on word with trailing spaces",
    start: ['one   tw|o,   three,   four  '],
    keysPressed: 'diW',
    end: ['one   |   three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on word with leading spaces",
    start: ['one   two   th|ree,   four  '],
    keysPressed: 'diW',
    end: ['one   two   |   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on word with numeric prefix",
    start: ['on|e   two   three,   four  '],
    keysPressed: 'd3iW',
    end: ['|   three,   four  '],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on word with numeric prefix and across lines",
    start: ['one   two   three,   fo|ur  ', 'five.  six'],
    keysPressed: 'd3iW',
    end: ['one   two   three,   |  six'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'diW' on beginning of word",
    start: ['one |two three'],
    keysPressed: 'diW',
    end: ['one | three'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can handle d}',
    start: ['|foo', 'bar', '', 'fun'],
    keysPressed: 'd}',
    end: ['|', 'fun'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can handle y} at beginning of line',
    start: ['|foo', 'bar', '', 'fun'],
    keysPressed: 'y}p',
    end: ['foo', '|foo', 'bar', 'bar', '', 'fun'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Select sentence with trailing spaces',
    start: ["That's my sec|ret, Captain. I'm always angry."],
    keysPressed: 'das',
    end: ["|I'm always angry."],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Select sentence with leading spaces',
    start: ["That's my secret, Captain. I'm a|lways angry."],
    keysPressed: 'das',
    end: ["That's my secret, Captain|."],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Select inner sentence with trailing spaces',
    start: ["That's my sec|ret, Captain. I'm always angry."],
    keysPressed: 'dis',
    end: ["| I'm always angry."],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Select inner sentence with leading spaces',
    start: ["That's my secret, Captain. I'm a|lways angry."],
    keysPressed: 'dis',
    end: ["That's my secret, Captain.| "],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Select spaces between sentences',
    start: ["That's my secret, Captain.  |  I'm always angry."],
    keysPressed: 'visd',
    end: ["That's my secret, Captain.|I'm always angry."],
    endMode: ModeName.Normal,
  });

  newTest({
    title: "Can handle 'df'",
    start: ['aext tex|t'],
    keysPressed: '^dft',
    end: ['| text'],
  });

  newTest({
    title: "Can handle 'dt'",
    start: ['aext tex|t'],
    keysPressed: '^dtt',
    end: ['|t text'],
  });

  newTest({
    title: 'Can handle backspace',
    start: ['text |text'],
    keysPressed: '<BS><BS>',
    end: ['tex|t text'],
  });

  newTest({
    title: 'Can handle backspace across lines',
    start: ['one', '|two'],
    keysPressed: '<BS><BS>',
    end: ['o|ne', 'two'],
  });

  newTest({
    title: 'Can handle A and backspace',
    start: ['|text text'],
    keysPressed: 'A<BS><Esc>',
    end: ['text te|x'],
  });

  newTest({
    title: "Can handle 'yy' without changing cursor position",
    start: ['one', 'tw|o'],
    keysPressed: 'yy',
    end: ['one', 'tw|o'],
  });

  newTest({
    title: "Can handle 'P' after 'yy'",
    start: ['one', 'tw|o'],
    keysPressed: 'yyP',
    end: ['one', '|two', 'two'],
  });

  newTest({
    title: "Can handle 'p' after 'yy'",
    start: ['one', 'tw|o'],
    keysPressed: 'yyp',
    end: ['one', 'two', '|two'],
  });

  newTest({
    title: "Can handle 'P' after 'Nyy'",
    start: ['on|e', 'two', 'three'],
    keysPressed: '3yyP',
    end: ['|one', 'two', 'three', 'one', 'two', 'three'],
  });

  newTest({
    title: "Can handle 'p' after 'Nyy'",
    start: ['on|e', 'two', 'three'],
    keysPressed: '3yyp',
    end: ['one', '|one', 'two', 'three', 'two', 'three'],
  });

  newTest({
    title: "Can handle 'p' after 'yy' with correct cursor position",
    start: ['|  one', 'two'],
    keysPressed: 'yyjp',
    end: ['  one', 'two', '  |one'],
  });

  newTest({
    title: "Can handle 'gp' after 'yy'",
    start: ['one', 'tw|o', 'three'],
    keysPressed: 'yygp',
    end: ['one', 'two', 'two', '|three'],
  });

  newTest({
    title: "Can handle 'gp' after 'Nyy'",
    start: ['on|e', 'two', 'three'],
    keysPressed: '2yyjgp',
    end: ['one', 'two', 'one', 'two', '|three'],
  });

  newTest({
    title: "Can handle 'gp' after 'Nyy' if cursor is on the last line",
    start: ['on|e', 'two', 'three'],
    keysPressed: '2yyjjgp',
    end: ['one', 'two', 'three', 'one', '|two'],
  });

  newTest({
    title: "Can handle 'gP' after 'yy'",
    start: ['one', 'tw|o', 'three'],
    keysPressed: 'yygP',
    end: ['one', 'two', '|two', 'three'],
  });

  newTest({
    title: "Can handle 'gP' after 'Nyy'",
    start: ['on|e', 'two', 'three'],
    keysPressed: '2yygP',
    end: ['one', 'two', '|one', 'two', 'three'],
  });

  newTest({
    title: "Can handle ']p' after yy",
    start: ['  |one', '   two'],
    keysPressed: 'yyj]p',
    end: ['  one', '   two', '   |one'],
  });

  newTest({
    title: "Can handle ']p' after 'Nyy'",
    start: [' |one', '  two', '  three'],
    keysPressed: '2yyjj]p',
    end: [' one', '  two', '  three', '  |one', '   two'],
  });

  newTest({
    title: "Can handle ']p' after 'Nyy' and indent with tabs first",
    start: [' |one', '  two', '   three'],
    keysPressed: '2yyjj]p',
    end: [' one', '  two', '   three', '   |one', '\ttwo'],
  });

  newTest({
    title: "Can handle ']p' after 'Nyy' and decrease indents if possible",
    start: ['    |one', ' two', ' three'],
    keysPressed: '2yyjj]p',
    end: ['    one', ' two', ' three', ' |one', 'two'],
  });

  newTest({
    title: "Can handle '[p' after yy",
    start: ['   two', '  |one'],
    keysPressed: 'yyk[p',
    end: ['   |one', '   two', '  one'],
  });

  newTest({
    title: "Can handle '[p' after 'Nyy'",
    start: ['  three', '|one', ' two'],
    keysPressed: '2yyk[p',
    end: ['  |one', '   two', '  three', 'one', ' two'],
  });

  newTest({
    title: "Can handle '[p' after 'Nyy' and indent with tabs first",
    start: ['   three', '| one', '  two'],
    keysPressed: '2yyk[p',
    end: ['   |one', '\ttwo', '   three', ' one', '  two'],
  });

  newTest({
    title: "Can handle '[p' after 'Nyy' and decrease indents if possible",
    start: [' three', '    |one', ' two'],
    keysPressed: '2yyk[p',
    end: [' |one', 'two', ' three', '    one', ' two'],
  });

  newTest({
    title: "Can handle 'p' after y'a",
    start: ['|one', 'two', 'three'],
    keysPressed: "majjy'ap",
    end: ['one', 'two', 'three', '|one', 'two', 'three'],
  });

  newTest({
    title: "Can handle 'p' after 'y])' without including closing parenthesis",
    start: ['(hello, |world)'],
    keysPressed: 'y])$p',
    end: ['(hello, world)worl|d'],
  });

  newTest({
    title: "Can handle 'p' after 'y]}' without including closing bracket",
    start: ['{hello, |world}'],
    keysPressed: 'y]}$p',
    end: ['{hello, world}worl|d'],
  });

  newTest({
    title: 'Can handle pasting in visual mode over selection',
    start: ['|foo', 'bar', 'fun'],
    keysPressed: 'Yjvll"ayjV"app',
    end: ['foo', 'bar', 'bar', '|fun'],
  });

  newTest({
    title: 'Can repeat w',
    start: ['|one two three four'],
    keysPressed: '2w',
    end: ['one two |three four'],
  });

  newTest({
    title: 'Can repeat p',
    start: ['|one'],
    keysPressed: 'yy2p',
    end: ['one', '|one', 'one'],
  });

  newTest({
    title: 'I works correctly',
    start: ['|    one'],
    keysPressed: 'Itest <Esc>',
    end: ['    test| one'],
  });

  newTest({
    title: 'gI works correctly',
    start: ['|    one'],
    keysPressed: 'gItest<Esc>',
    end: ['tes|t    one'],
  });

  newTest({
    title: 'gi works correctly',
    start: ['|'],
    keysPressed: 'ione<Esc>otwo<Esc>0gi',
    end: ['one', 'two|'],
  });

  newTest({
    title: '`. works correctly',
    start: ['one|'],
    keysPressed: 'atwo<Esc>`.',
    end: ['one|two'],
  });

  newTest({
    title: "'. works correctly",
    start: ['one|'],
    keysPressed: "atwo<Esc>'.",
    end: ['one|two'],
  });

  newTest({
    title: 'g; works correctly',
    start: ['|'],
    keysPressed: 'ione<Esc>atwo<Esc>g;g;',
    end: ['one|two'],
  });

  newTest({
    title: 'g, works correctly',
    start: ['|'],
    keysPressed: 'ione<Esc>atwo<Esc>g;g;g,',
    end: ['onetw|o'],
  });

  newTest({
    title: 'g_ works correctly',
    start: ['te|sttest'],
    keysPressed: 'g_',
    end: ['testtes|t'],
  });

  newTest({
    title: '3g_ works correctly',
    start: ['tes|ttest', 'testtest', 'testtest'],
    keysPressed: '3g_',
    end: ['testtest', 'testtest', 'testtes|t'],
  });

  //  These tests run poorly on Travis for w.e. reason
  // newTest({
  //   title: "gq handles spaces after single line comments correctly",
  //   start: ['//    We choose to write a vim extension, not because it is easy, but because it is hard|.'],
  //   keysPressed: 'Vgq',
  //   end: [ '//    We choose to write a vim extension, not because it is easy, but because it is',
  //         '|//    hard.'],
  // });

  // newTest({
  //   title: "gq handles spaces before single line comments correctly",
  //   start: ['    // We choose to write a vim extension, not because it is easy, but because it is hard|.'],
  //   keysPressed: 'Vgq',
  //   end: [ '    // We choose to write a vim extension, not because it is easy, but because',
  //         '|    // it is hard.']
  // });

  newTest({
    title: 'Can handle space',
    start: ['|abc', 'def'],
    keysPressed: '  ',
    end: ['ab|c', 'def'],
  });

  newTest({
    title: 'Can handle space',
    start: ['|abc', 'def'],
    keysPressed: '    ',
    end: ['abc', 'd|ef'],
  });

  newTest({
    title: 'Undo 1',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>uu',
    end: ['|'],
  });

  newTest({
    title: 'Undo 2',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>u',
    end: ['ab|c'],
  });

  newTest({
    title: 'Undo cursor',
    start: ['|'],
    keysPressed: 'Iabc<Esc>Idef<Esc>Ighi<Esc>uuu',
    end: ['|'],
  });

  newTest({
    title: 'Undo cursor 2',
    start: ['|'],
    keysPressed: 'Iabc<Esc>Idef<Esc>Ighi<Esc>uu',
    end: ['|abc'],
  });

  newTest({
    title: 'Undo cursor 3',
    start: ['|'],
    keysPressed: 'Iabc<Esc>Idef<Esc>Ighi<Esc>u',
    end: ['|defabc'],
  });

  newTest({
    title: 'Undo with movement first',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>hlhlu',
    end: ['ab|c'],
  });

  newTest({
    title: "Can handle 'U'",
    start: ['|'],
    keysPressed: 'iabc<Esc>U',
    end: ['|'],
  });

  newTest({
    title: "Can handle 'U' for multiple changes",
    start: ['|'],
    keysPressed: 'idef<Esc>aghi<Esc>U',
    end: ['|'],
  });

  newTest({
    title: "Can handle 'U' for new line below",
    start: ['|'],
    keysPressed: 'iabc<Esc>odef<Esc>U',
    end: ['abc', '|'],
  });

  newTest({
    title: "Can handle 'U' for new line above",
    start: ['|'],
    keysPressed: 'iabc<Esc>Odef<Esc>U',
    end: ['|', 'abc'],
  });

  newTest({
    title: "Can handle 'U' for consecutive changes only",
    start: ['|'],
    keysPressed: 'iabc<Esc>odef<Esc>kAghi<Esc>U',
    end: ['ab|c', 'def'],
  });

  newTest({
    title: "Can handle 'u' to undo 'U'",
    start: ['|'],
    keysPressed: 'iabc<Esc>Uu',
    end: ['|abc'],
  });

  newTest({
    title: "Can handle 'U' to undo 'U'",
    start: ['|'],
    keysPressed: 'iabc<Esc>UU',
    end: ['|abc'],
  });

  newTest({
    title: 'Redo',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>uu<C-r>',
    end: ['|abc'],
  });

  newTest({
    title: 'Redo',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>uu<C-r><C-r>',
    end: ['abc|def'],
  });

  newTest({
    title: 'Redo',
    start: ['|'],
    keysPressed: 'iabc<Esc>adef<Esc>uuhlhl<C-r><C-r>',
    end: ['abc|def'],
  });

  newTest({
    title: 'Can handle u',
    start: ['|ABC DEF'],
    keysPressed: 'vwu',
    end: ['|abc dEF'],
  });

  newTest({
    title: 'Can handle guw',
    start: ['|ABC DEF'],
    keysPressed: 'guw',
    end: ['|abc DEF'],
  });

  newTest({
    title: 'Can handle gUw',
    start: ['|abc def'],
    keysPressed: 'gUw',
    end: ['|ABC def'],
  });

  newTest({
    title: 'Can handle u over line breaks',
    start: ['|ABC', 'DEF'],
    keysPressed: 'vG$u',
    end: ['|abc', 'def'],
  });

  newTest({
    title: 'can handle s in visual mode',
    start: ['|abc def ghi'],
    keysPressed: 'vwshi <Esc>',
    end: ['hi| ef ghi'],
  });

  newTest({
    title: 'can handle p with selection',
    start: ['|abc def ghi'],
    keysPressed: 'vwywvwp',
    end: ['abc abc |dhi'],
  });

  // test works when run manually
  // newTest({
  //   title: "can handle p with selection",
  //   start: ["one", "two", "|three"],
  //   keysPressed: "yykVp",
  //   end: ["|three", "three"]
  // });

  newTest({
    title: 'can handle P with selection',
    start: ['|abc def ghi'],
    keysPressed: 'vwywvwP',
    end: ['abc abc |dhi'],
  });

  newTest({
    title: 'can handle p in visual to end of line',
    start: ['1234 |5678', 'test test'],
    keysPressed: 'vllllyjvllllp',
    end: ['1234 5678', 'test |5678', ''],
  });

  newTest({
    title: 'can repeat backspace twice',
    start: ['|11223344'],
    keysPressed: 'A<BS><BS><Esc>0.',
    end: ['112|2'],
  });

  newTest({
    title: 'can delete linewise with d2G',
    start: ['|one', 'two', 'three'],
    keysPressed: 'd2G',
    end: ['|three'],
  });

  newTest({
    title: 'can delete with + motion and count',
    start: ['one', 'two', 'three', 'fo|ur', 'five', 'six', 'seven'],
    keysPressed: 'd2+',
    end: ['one', 'two', 'three', '|seven'],
  });

  newTest({
    title: 'can delete with - motion and count',
    start: ['one', 'two', 'three', 'four', 'five', 's|ix', 'seven'],
    keysPressed: 'd3-',
    end: ['one', 'two', '|seven'],
  });

  newTest({
    title: 'can dE correctly',
    start: ['|one two three'],
    keysPressed: 'dE',
    end: ['| two three'],
  });

  newTest({
    title: 'can dE correctly',
    start: ['|one((( two three'],
    keysPressed: 'dE',
    end: ['| two three'],
  });

  newTest({
    title: 'can dE correctly',
    start: ['one two |three'],
    keysPressed: 'dE',
    end: ['one two| '],
  });

  newTest({
    title: 'can ctrl-a correctly behind a word',
    start: ['|one 9'],
    keysPressed: '<C-a>',
    end: ['one 1|0'],
  });

  newTest({
    title: 'can ctrl-a the right word (always the one AFTER the cursor)',
    start: ['1 |one 2'],
    keysPressed: '<C-a>',
    end: ['1 one |3'],
  });

  newTest({
    title: 'can ctrl-a on word',
    start: ['one -|11'],
    keysPressed: '<C-a>',
    end: ['one -1|0'],
  });

  newTest({
    title: 'can ctrl-a on a hex number',
    start: ['|0xf'],
    keysPressed: '<C-a>',
    end: ['0x1|0'],
  });

  newTest({
    title: 'can ctrl-a on decimal',
    start: ['1|1.123'],
    keysPressed: '<C-a>',
    end: ['1|2.123'],
  });

  newTest({
    title: 'can ctrl-a with numeric prefix',
    start: ['|-10'],
    keysPressed: '15<C-a>',
    end: ['|5'],
  });

  newTest({
    title: 'can ctrl-a on a decimal',
    start: ['-10.|1'],
    keysPressed: '10<C-a>',
    end: ['-10.1|1'],
  });

  newTest({
    title: 'can ctrl-a on an octal ',
    start: ['07|'],
    keysPressed: '<C-a>',
    end: ['01|0'],
  });

  newTest({
    title: 'Correctly increments in the middle of a number',
    start: ['10|1'],
    keysPressed: '<C-a>',
    end: ['10|2'],
  });

  newTest({
    title: 'can ctrl-x correctly behind a word',
    start: ['|one 10'],
    keysPressed: '<C-x>',
    end: ['one |9'],
  });

  newTest({
    title: 'can ctrl-a on an number with word before ',
    start: ['|test3'],
    keysPressed: '<C-a>',
    end: ['test|4'],
  });

  newTest({
    title: 'can ctrl-a on an number with word before and after ',
    start: ['|test3abc'],
    keysPressed: '<C-a>',
    end: ['test|4abc'],
  });

  newTest({
    title: 'can ctrl-x on a negative number with word before and after ',
    start: ['|test-2abc'],
    keysPressed: '<C-a><C-a><C-a>',
    end: ['test|1abc'],
  });

  newTest({
    title: 'can ctrl-a properly on multiple lines',
    start: ['id: 1|,', 'someOtherId: 1'],
    keysPressed: '<C-a>',
    end: ['id: 1|,', 'someOtherId: 1'],
  });

  newTest({
    title: 'can <C-a> on word with multiple numbers (incrementing first number)',
    start: ['f|oo1bar2'],
    keysPressed: '<C-a>',
    end: ['foo|2bar2'],
  });

  newTest({
    title: 'can <C-a> on word with multiple numbers (incrementing second number)',
    start: ['foo1|bar2'],
    keysPressed: '<C-a>',
    end: ['foo1bar|3'],
  });

  newTest({
    title: 'can <C-a> on word with - in front of it',
    start: ['-fo|o2'],
    keysPressed: '<C-a>',
    end: ['-foo|3'],
  });

  newTest({
    title: 'can do Y',
    start: ['|blah blah'],
    keysPressed: 'Yp',
    end: ['blah blah', '|blah blah'],
  });

  newTest({
    title: 'Can do S',
    start: ['    one', '    tw|o', '    three'],
    keysPressed: '2S',
    end: ['    one', '    |'],
  });

  newTest({
    title: '/ does not affect mark',
    start: ['|one', 'twooo', 'thurr'],
    keysPressed: "ma/two\n'a",
    end: ['|one', 'twooo', 'thurr'],
  });

  newTest({
    title: '/ can search with regex',
    start: ['|', 'one two2o'],
    keysPressed: '/o\\do\n',
    end: ['', 'one tw|o2o'],
  });

  newTest({
    title: '/ can search with newline',
    start: ['|asdf', '__asdf', 'asdf'],
    keysPressed: '/\\nasdf\n',
    end: ['asdf', '__asd|f', 'asdf'],
  });

  newTest({
    title: '/ can search through multiple newlines',
    start: ['|asdf', '__asdf', 'asdf', 'abc', '   abc'],
    keysPressed: '/asdf\\nasdf\\nabc\n',
    end: ['asdf', '__|asdf', 'asdf', 'abc', '   abc'],
  });

  newTest({
    title: '/ matches ^ per line',
    start: ['|  asdf', 'asasdf', 'asdf', 'asdf'],
    keysPressed: '/^asdf\n',
    end: ['  asdf', 'asasdf', '|asdf', 'asdf'],
  });

  newTest({
    title: '/ matches $ per line',
    start: ['|asdfjkl', 'asdf  ', 'asdf', 'asdf'],
    keysPressed: '/asdf$\n',
    end: ['asdfjkl', 'asdf  ', '|asdf', 'asdf'],
  });

  newTest({
    title: '/\\c forces case insensitive search',
    start: ['|__ASDF', 'asdf'],
    keysPressed: '/\\casdf\n',
    end: ['__|ASDF', 'asdf'],
  });

  newTest({
    title: '/\\C forces case sensitive search',
    start: ['|__ASDF', 'asdf'],
    keysPressed: '/\\Casdf\n',
    end: ['__ASDF', '|asdf'],
  });

  newTest({
    title: '<BS> deletes the last character in search in progress mode',
    start: ['|foo', 'bar', 'abd'],
    keysPressed: '/abc<BS>d\n',
    end: ['foo', 'bar', '|abd'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: '<S-BS> deletes the last character in search in progress mode',
    start: ['|foo', 'bar', 'abd'],
    keysPressed: '/abc<shift+BS>d\n',
    end: ['foo', 'bar', '|abd'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: '<C-h> deletes the last character in search in progress mode',
    start: ['|foo', 'bar', 'abd'],
    keysPressed: '/abc<C-h>d\n',
    end: ['foo', 'bar', '|abd'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can do C',
    start: ['export const options = {', '|', '};'],
    keysPressed: 'C',
    end: ['export const options = {', '|', '};'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit on a matching tag',
    start: ['<blink>he|llo</blink>'],
    keysPressed: 'cit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Ignores cit on a non-matching tag',
    start: ['<blink>he|llo</unblink>'],
    keysPressed: 'cit',
    end: ['<blink>he|llo</unblink>'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Ignores cit on a nested tag',
    start: ['<blink>he|llo<hello></blink>'],
    keysPressed: 'cit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit on a tag with an attribute tag',
    start: ['<blink |level="extreme">hello</blink>'],
    keysPressed: 'cit',
    end: ['<blink level="extreme">|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cat on a matching tag',
    start: ['one <blink>he|llo</blink> two'],
    keysPressed: 'cat',
    end: ['one | two'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit on a multiline tag',
    start: [' <blink>\nhe|llo\ntext</blink>'],
    keysPressed: 'cit',
    end: [' <blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit on a multiline tag with nested tags',
    start: [' <blink>\n<h1>hello</h1>\nh<br>e|llo\nte</h1>xt</blink>'],
    keysPressed: 'cit',
    end: [' <blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit inside of a tag with another non closing tag inside tags',
    start: ['<blink>hello<br>wo|rld</blink>'],
    keysPressed: 'cit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cit inside of a tag with another empty closing tag inside tags',
    start: ['<blink>hel|lo</h1>world</blink>'],
    keysPressed: 'cit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do dit on empty tag block, cursor moves to inside',
    start: ['<bli|nk></blink>'],
    keysPressed: 'dit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can do cit on empty tag block, cursor moves to inside',
    start: ['<bli|nk></blink>'],
    keysPressed: 'cit',
    end: ['<blink>|</blink>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'can do cit with self closing tags',
    start: ['<div><div a=1/>{{c|ursor here}}</div>'],
    keysPressed: 'cit',
    end: ['<div>|</div>'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Respects indentation with cc',
    start: ['{', '  int| a;'],
    keysPressed: 'cc',
    end: ['{', '  |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Resets cursor to indent end with cc',
    start: ['{', ' | int a;'],
    keysPressed: 'cc',
    end: ['{', '  |'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: "can handle 'cc' on empty line",
    start: ['foo', '|', 'bar'],
    keysPressed: 'cc',
    end: ['foo', '|', 'bar'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'cc copies linewise',
    start: ['foo', '|fun', 'bar'],
    keysPressed: 'cc<Esc>jp',
    end: ['foo', '', 'bar', '|fun'],
  });

  newTest({
    title: 'Indent current line with correct Vim Mode',
    start: ['|one', 'two'],
    keysPressed: '>>',
    end: ['\t|one', 'two'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can handle <Esc> and do nothing',
    start: ['te|st'],
    keysPressed: '<Esc>',
    end: ['te|st'],
  });

  newTest({
    title: 'Can handle # on consecutive words',
    start: ['test test test test |test'],
    keysPressed: '#',
    end: ['test test test |test test'],
  });

  newTest({
    title: 'Can handle # on skipped words',
    start: ['test aaa test aaa test aaa test aaa |test'],
    keysPressed: '#',
    end: ['test aaa test aaa test aaa |test aaa test'],
  });

  newTest({
    title: "Can 'D'elete the characters under the cursor until the end of the line",
    start: ['test aaa test aaa test aaa test |aaa test'],
    keysPressed: 'D',
    end: ['test aaa test aaa test aaa test| '],
  });

  newTest({
    title: "Can 'D'elete the characters under multiple cursors until the end of the line",
    start: [
      'test aaa test aaa test aaa test |aaa test',
      'test aaa test aaa test aaa test aaa test',
    ],
    keysPressed: '<C-alt+down>D<Esc>',
    end: ['test aaa test aaa test aaa tes|t ', 'test aaa test aaa test aaa test '],
  });

  newTest({
    title: 'cc on whitespace-only treats whitespace as indent',
    start: ['|     '],
    keysPressed: 'cc',
    end: ['     |'],
  });

  newTest({
    title: 'Can do cai',
    start: ['if foo > 3:', '    log("foo is big")|', '    foo = 3', 'do_something_else()'],
    keysPressed: 'cai',
    end: ['|', 'do_something_else()'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do cii',
    start: ['if foo > 3:', '\tlog("foo is big")', '\tfoo = 3', '|', 'do_something_else()'],
    keysPressed: 'cii',
    end: ['if foo > 3:', '\t|', 'do_something_else()'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do caI',
    start: ['if foo > 3:', '    log("foo is big")|', '    foo = 3', 'do_something_else()'],
    keysPressed: 'caI',
    end: ['|'],
    endMode: ModeName.Insert,
  });

  newTest({
    title: 'Can do dai',
    start: ['if foo > 3:', '    log("foo is big")|', '    foo = 3', 'do_something_else()'],
    keysPressed: 'dai',
    end: ['|do_something_else()'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can do dii',
    start: ['if foo > 3:', '    log("foo is big")', '    foo = 3', '|', 'do_something_else()'],
    keysPressed: 'dii',
    end: ['if foo > 3:', '|do_something_else()'],
    endMode: ModeName.Normal,
  });

  newTest({
    title: 'Can do daI',
    start: ['if foo > 3:', '    log("foo is big")|', '    foo = 3', 'do_something_else()'],
    keysPressed: 'daI',
    end: ['|'],
    endMode: ModeName.Normal,
  });

  suite('can handle gn', () => {
    test(`gn selects the next match text`, async () => {
      await modeHandler.handleMultipleKeyEvents('ifoo\nhello world\nhello\nhello'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents('gg'.split(''));
      await modeHandler.handleMultipleKeyEvents(['g', 'n']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 0);
      assertEqual(selection.start.line, 1);
      assertEqual(selection.end.character, 'hello'.length);
      assertEqual(selection.end.line, 1);
    });

    const gnSelectsCurrentWord = async (jumpCmd: string) => {
      await modeHandler.handleMultipleKeyEvents('ifoo\nhello world\nhello\nhello'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents(jumpCmd.split(''));
      await modeHandler.handleMultipleKeyEvents(['g', 'n']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 0);
      assertEqual(selection.start.line, 1);
      assertEqual(selection.end.character, 'hello'.length);
      assertEqual(selection.end.line, 1);
    };

    test(`gn selects the current word at |hello`, async () => {
      await gnSelectsCurrentWord('2gg');
    });

    test(`gn selects the current word at h|ello`, async () => {
      await gnSelectsCurrentWord('2ggl');
    });

    test(`gn selects the current word at hel|lo`, async () => {
      await gnSelectsCurrentWord('2ggeh');
    });

    test(`gn selects the current word at hell|o`, async () => {
      await gnSelectsCurrentWord('2gge');
    });

    test(`gn selects the next word at hello|`, async () => {
      await modeHandler.handleMultipleKeyEvents('ifoo\nhello world\nhello\nhello'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents('2ggel'.split(''));
      await modeHandler.handleMultipleKeyEvents(['g', 'n']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 0);
      assertEqual(selection.start.line, 2);
      assertEqual(selection.end.character, 'hello'.length);
      assertEqual(selection.end.line, 2);
    });
  });

  suite('can handle dgn', () => {
    newTest({
      title: 'dgn deletes the next match text (from first line)',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nggdgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgn deletes the current word when cursor is at |hello',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\ndgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgn deletes the current word when cursor is at h|ello',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nldgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgn deletes the current word when cursor is at hel|lo',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\n3ldgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgn deletes the current word when cursor is at hell|o',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nedgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgn deletes the next word when cursor is at hello|',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\neldgn',
      end: ['foo', 'hello world', '|', 'hello'],
      endMode: ModeName.Normal,
    });
  });

  suite('can handle cgn', () => {
    newTest({
      title: 'cgn deletes the next match text (from first line)',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nggcgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgn deletes the current word when cursor is at |hello',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\ncgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgn deletes the current word when cursor is at h|ello',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nlcgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgn deletes the current word when cursor is at hel|lo',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\n3lcgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgn deletes the current word when cursor is at hell|o',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\necgn',
      end: ['foo', '| world', 'hello', 'hello'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgn deletes the next word when cursor is at hello|',
      start: ['|foo', 'hello world', 'hello', 'hello'],
      keysPressed: '/hello\nelcgn',
      end: ['foo', 'hello world', '|', 'hello'],
      endMode: ModeName.Insert,
    });
  });

  suite('can handle gN', () => {
    test(`gN selects the previous match text`, async () => {
      await modeHandler.handleMultipleKeyEvents('ihello world\nhello\nhi hello\nfoo'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents(['G']);
      await modeHandler.handleMultipleKeyEvents(['g', 'N']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 'hi '.length);
      assertEqual(selection.start.line, 2);
      assertEqual(selection.end.character, 'hi hello'.length);
      assertEqual(selection.end.line, 2);
    });

    const gnSelectsCurrentWord = async (jumpCmd: string) => {
      await modeHandler.handleMultipleKeyEvents('ihello world\nhello\nhi hello\nfoo'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents(jumpCmd.split(''));
      await modeHandler.handleMultipleKeyEvents(['g', 'N']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 'hi '.length);
      assertEqual(selection.start.line, 2);
      assertEqual(selection.end.character, 'hi hello'.length);
      assertEqual(selection.end.line, 2);
    };

    test(`gN selects the current word at hell|o`, async () => {
      await gnSelectsCurrentWord('3gg7l');
    });

    test(`gN selects the current word at hel|lo`, async () => {
      await gnSelectsCurrentWord('3gg6l');
    });

    test(`gN selects the current word at h|ello`, async () => {
      await gnSelectsCurrentWord('3gg4l');
    });

    test(`gN selects the current word at |hello`, async () => {
      await gnSelectsCurrentWord('3gg3l');
    });

    test(`gN selects the previous word at | hello`, async () => {
      await modeHandler.handleMultipleKeyEvents('ihello world\nhello\nhi hello\nfoo'.split(''));
      await modeHandler.handleMultipleKeyEvents(['<Esc>', ...'/hello\n'.split('')]);
      await modeHandler.handleMultipleKeyEvents('3gg2l'.split(''));
      await modeHandler.handleMultipleKeyEvents(['g', 'N']);

      assertEqual(modeHandler.currentMode.name, ModeName.Visual);

      const selection = TextEditor.getSelection();

      assertEqual(selection.start.character, 0);
      assertEqual(selection.start.line, 1);
      assertEqual(selection.end.character, 'hello'.length);
      assertEqual(selection.end.line, 1);
    });
  });

  suite('can handle dgN', () => {
    newTest({
      title: 'dgN deletes the previous match text (from first line)',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\nGdgN',
      end: ['hello world', 'hello', 'hi| ', 'foo'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgN deletes the current word when cursor is at hell|o',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3gg$dgN',
      end: ['hello world', 'hello', 'hi| ', 'foo'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgN deletes the current word when cursor is at hel|lo',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3gg$hdgN',
      end: ['hello world', 'hello', 'hi| ', 'foo'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgN deletes the current word when cursor is at h|ello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwldgN',
      end: ['hello world', 'hello', 'hi| ', 'foo'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgN deletes the current word when cursor is at |hello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwdgN',
      end: ['hello world', 'hello', 'hi| ', 'foo'],
      endMode: ModeName.Normal,
    });

    newTest({
      title: 'dgN deletes the previous word when cursor is at | hello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwhdgN',
      end: ['hello world', '|', 'hi hello', 'foo'],
      endMode: ModeName.Normal,
    });
  });

  suite('can handle cgN', () => {
    newTest({
      title: 'cgN deletes the previous match text (from first line)',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\nGcgN',
      end: ['hello world', 'hello', 'hi |', 'foo'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgN deletes the current word when cursor is at hell|o',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3gg$cgN',
      end: ['hello world', 'hello', 'hi |', 'foo'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgN deletes the current word when cursor is at hel|lo',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3gg$hcgN',
      end: ['hello world', 'hello', 'hi |', 'foo'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgN deletes the current word when cursor is at h|ello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwlcgN',
      end: ['hello world', 'hello', 'hi |', 'foo'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgN deletes the current word when cursor is at |hello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwcgN',
      end: ['hello world', 'hello', 'hi |', 'foo'],
      endMode: ModeName.Insert,
    });

    newTest({
      title: 'cgN deletes the previous word when cursor is at | hello',
      start: ['hello world', 'hello', 'hi hello', '|foo'],
      keysPressed: '/hello\n3ggwhcgN',
      end: ['hello world', '|', 'hi hello', 'foo'],
      endMode: ModeName.Insert,
    });
  });

  newTest({
    title: 'can handle <C-u> when first line is visible and starting column is at the beginning',
    start: ['hello world', 'hello', 'hi hello', '|foo'],
    keysPressed: '<C-u>',
    end: ['|hello world', 'hello', 'hi hello', 'foo'],
  });

  newTest({
    title: 'can handle <C-u> when first line is visible and starting column is at the end',
    start: ['hello world', 'hello', 'hi hello', 'very long line at the bottom|'],
    keysPressed: '<C-u>',
    end: ['|hello world', 'hello', 'hi hello', 'very long line at the bottom'],
  });

  newTest({
    title: 'can handle <C-u> when first line is visible and starting column is in the middle',
    start: ['hello world', 'hello', 'hi hello', 'very long line |at the bottom'],
    keysPressed: '<C-u>',
    end: ['|hello world', 'hello', 'hi hello', 'very long line at the bottom'],
  });
});
