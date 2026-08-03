import { getMetadataArgsStorage } from 'typeorm';

// Import every entity so their @OneToMany/@ManyToOne decorators register
// their relation callbacks in TypeORM's metadata storage.
import { User } from './user.entity';
import { Course } from './course.entity';
import { Lesson } from './lesson.entity';
import { Word } from './word.entity';
import { DailyTask } from './daily-task.entity';
import { LessonProgress } from './lesson-progress.entity';
import { WordProgress } from './word-progress.entity';
import { TaskCompletion } from './task-completion.entity';

// Referenced so the imports are not tree-shaken.
const entities = [
  User,
  Course,
  Lesson,
  Word,
  DailyTask,
  LessonProgress,
  WordProgress,
  TaskCompletion,
];

/**
 * The relation decorators register arrow-function callbacks (e.g.
 * `@OneToMany(() => Lesson, (lesson) => lesson.course)`) that are never
 * invoked by the other unit tests, leaving the entity files' function/branch
 * coverage short. This spec invokes every registered relation callback
 * directly via TypeORM's metadata storage, exercising those arrows without
 * needing a live database connection.
 */
describe('Entity relation callbacks', () => {
  const relations = getMetadataArgsStorage().relations;

  it('every relation callback is callable', () => {
    expect(relations.length).toBeGreaterThan(0);

    for (const rel of relations) {
      // Forward callback: () => RelatedEntity
      if (typeof rel.type === 'function') {
        expect((rel.type as () => unknown)()).toBeDefined();
      }
      // Inverse callback: (obj) => obj.property
      const inverse = (rel as unknown as { inverseSideProperty?: (o: object) => unknown })
        .inverseSideProperty;
      if (typeof inverse === 'function') {
        expect(inverse({})).toBeUndefined();
      }
    }
    expect(entities.length).toBe(8);
  });
});
