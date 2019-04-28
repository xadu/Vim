import { Globals } from '../../src/globals';
import { getTestingFunctions } from '../testSimplifier';
import { cleanUpWorkspace, setupWorkspace, reloadConfiguration } from './../testUtils';

suite('sneak plugin', () => {
  let { newTest, newTestOnly } = getTestingFunctions();

  setup(async () => {
    await setupWorkspace();
    Globals.mockConfiguration.sneak = true;
    await reloadConfiguration();
  });

  teardown(cleanUpWorkspace);

  newTest({
    title: 'Can handle s motion',
    start: ['|abc abc'],
    keysPressed: 'sab',
    end: ['abc |abc'],
  });

  newTest({
    title: 'Can handle S motion',
    start: ['abc |abc'],
    keysPressed: 'Sab',
    end: ['|abc abc'],
  });

  newTest({
    title: 'Can handle <operator>z motion',
    start: ['|abc abc'],
    keysPressed: 'dzab',
    end: ['|abc'],
  });

  newTest({
    title: 'Can handle <operator>Z motion',
    start: ['abc |abc'],
    keysPressed: 'dZab',
    end: ['|abc'],
  });

  newTest({
    title: 'Can handle s; motion',
    start: ['|abc abc abc'],
    keysPressed: 'sab;',
    end: ['abc abc |abc'],
  });

  newTest({
    title: 'Can handle s, motion',
    start: ['abc abc| abc'],
    keysPressed: 'sab,',
    end: ['abc |abc abc'],
  });

  newTest({
    title: 'Can handle S; motion',
    start: ['abc abc |abc'],
    keysPressed: 'Sab;',
    end: ['|abc abc abc'],
  });

  newTest({
    title: 'Can handle S, motion',
    start: ['abc abc| abc'],
    keysPressed: 'Sab,',
    end: ['abc abc |abc'],
  });
});
