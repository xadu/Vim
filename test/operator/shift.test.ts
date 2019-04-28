import { getTestingFunctions } from '../testSimplifier';
import { cleanUpWorkspace, setupWorkspace } from '../testUtils';

suite('shift operator', () => {
  let { newTest, newTestOnly } = getTestingFunctions();

  setup(async () => {
    await setupWorkspace();
  });

  teardown(cleanUpWorkspace);

  newTest({
    title: 'basic shift left test',
    start: ['  |zxcv', '  zxcv', '  zxcv'],
    keysPressed: '<<',
    end: ['|zxcv', '  zxcv', '  zxcv'],
  });

  newTest({
    title: 'shift left goto end test',
    start: ['  |zxcv', '  zxcv', '  zxcv'],
    keysPressed: '<G',
    end: ['|zxcv', 'zxcv', 'zxcv'],
  });

  newTest({
    title: 'shift left goto line test',
    start: ['  |zxcv', '  zxcv', '  zxcv'],
    keysPressed: '<2G',
    end: ['|zxcv', 'zxcv', '  zxcv'],
  });

  newTest({
    title: 'shift right goto end test',
    start: ['|zxcv', 'zxcv', 'zxcv'],
    keysPressed: '>G',
    end: ['  |zxcv', '  zxcv', '  zxcv'],
  });

  newTest({
    title: 'shift right goto line test',
    start: ['|zxcv', 'zxcv', 'zxcv'],
    keysPressed: '>2G',
    end: ['  |zxcv', '  zxcv', 'zxcv'],
  });
});
