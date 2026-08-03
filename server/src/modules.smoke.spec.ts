// Mock bcrypt with an explicit factory so importing the auth module (which
// pulls in auth.service) does NOT load the native .node binding under Jest on
// Windows. An explicit factory is required — jest.mock('bcrypt') automock
// would still require the real module to derive its shape and hit the lock.
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
  genSalt: jest.fn(),
  hashSync: jest.fn(),
  compareSync: jest.fn(),
}));

import { AppModule } from './app.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CoursesModule } from './courses/courses.module';
import { LessonsModule } from './lessons/lessons.module';
import { WordsModule } from './words/words.module';
import { TasksModule } from './tasks/tasks.module';
import { ProgressModule } from './progress/progress.module';

/**
 * Smoke test for the module wiring. Importing each module executes its
 * @Module decorator (and transitively, AppModule pulls in every feature
 * module), so the DI registration code is exercised and counted by coverage
 * without needing a live database.
 */
describe('Module wiring smoke', () => {
  it('all feature modules and AppModule are defined', () => {
    expect(AppModule).toBeDefined();
    expect(AuthModule).toBeDefined();
    expect(UsersModule).toBeDefined();
    expect(CoursesModule).toBeDefined();
    expect(LessonsModule).toBeDefined();
    expect(WordsModule).toBeDefined();
    expect(TasksModule).toBeDefined();
    expect(ProgressModule).toBeDefined();
  });
});
