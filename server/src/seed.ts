import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Word } from './entities/word.entity';
import { DailyTask } from './entities/daily-task.entity';
import { buildDataSourceOptions, getDbType } from './config/database.config';
import { logger } from './common/logger/logger';

const ds = new DataSource(buildDataSourceOptions());

async function seed() {
  await ds.initialize();
  logger.info(`Database connected (${getDbType()}). Seeding...`);

  const courseRepo = ds.getRepository(Course);
  const lessonRepo = ds.getRepository(Lesson);
  const wordRepo = ds.getRepository(Word);
  const taskRepo = ds.getRepository(DailyTask);

  // Clear existing data
  await wordRepo.clear();
  await lessonRepo.clear();
  await courseRepo.clear();
  await taskRepo.clear();

  // Courses
  const animals = await courseRepo.save(courseRepo.create({
    title: 'Animal Friends', description: 'Learn the names of cute animals!',
    icon: 'paw', color: '#82D5BB', sortOrder: 1,
  }));
  const colors = await courseRepo.save(courseRepo.create({
    title: 'Rainbow Colors', description: 'Discover the colors around you!',
    icon: 'palette', color: '#F8A6B2', sortOrder: 2,
  }));
  const food = await courseRepo.save(courseRepo.create({
    title: 'Yummy Food', description: 'Name your favorite snacks!',
    icon: 'apple', color: '#F7CD67', sortOrder: 3,
  }));

  // Lessons for Animal Friends
  const lessonData = [
    { title: 'Farm Animals', sortOrder: 1, estimatedMinutes: 5 },
    { title: 'Pet Animals', sortOrder: 2, estimatedMinutes: 5 },
    { title: 'Ocean Creatures', sortOrder: 3, estimatedMinutes: 6 },
    { title: 'Jungle Animals', sortOrder: 4, estimatedMinutes: 6 },
    { title: 'Birds & Insects', sortOrder: 5, estimatedMinutes: 5 },
    { title: 'Baby Animals', sortOrder: 6, estimatedMinutes: 5 },
  ];

  const lessons: Lesson[] = [];
  for (const ld of lessonData) {
    lessons.push(await lessonRepo.save(lessonRepo.create({ ...ld, courseId: animals.id })));
  }

  // Words for first lesson (Farm Animals)
  const words = [
    { text: 'Cat', phonics: '/kæt/', meaning: '小猫', illustration: 'A fluffy orange cat', options: ['Cat','Dog','Rabbit','Fish'], correctIndex: 0, sortOrder: 1 },
    { text: 'Dog', phonics: '/dɒɡ/', meaning: '小狗', illustration: 'A happy golden puppy', options: ['Bird','Dog','Horse','Duck'], correctIndex: 1, sortOrder: 2 },
    { text: 'Fish', phonics: '/fɪʃ/', meaning: '小鱼', illustration: 'A colorful fish in a bowl', options: ['Frog','Crab','Fish','Whale'], correctIndex: 2, sortOrder: 3 },
    { text: 'Bird', phonics: '/bɜːrd/', meaning: '小鸟', illustration: 'A blue bird on a branch', options: ['Bird','Bee','Bat','Ant'], correctIndex: 0, sortOrder: 4 },
    { text: 'Rabbit', phonics: '/ˈræbɪt/', meaning: '兔子', illustration: 'A white rabbit with a carrot', options: ['Mouse','Hamster','Squirrel','Rabbit'], correctIndex: 3, sortOrder: 5 },
  ];

  for (const w of words) {
    await wordRepo.save(wordRepo.create({ ...w, lessonId: lessons[0].id }));
  }

  // Words for second lesson (Pet Animals)
  const words2 = [
    { text: 'Frog', phonics: '/frɒɡ/', meaning: '青蛙', illustration: 'A green frog on a lily pad', options: ['Frog', 'Toad', 'Snake', 'Turtle'], correctIndex: 0, sortOrder: 1 },
    { text: 'Horse', phonics: '/hɔːrs/', meaning: '马', illustration: 'A brown horse in a field', options: ['Cow', 'Sheep', 'Horse', 'Goat'], correctIndex: 2, sortOrder: 2 },
    { text: 'Duck', phonics: '/dʌk/', meaning: '鸭子', illustration: 'A yellow duck in a pond', options: ['Duck', 'Swan', 'Goose', 'Hen'], correctIndex: 0, sortOrder: 3 },
    { text: 'Bear', phonics: '/ber/', meaning: '熊', illustration: 'A friendly bear with honey', options: ['Wolf', 'Fox', 'Deer', 'Bear'], correctIndex: 3, sortOrder: 4 },
    { text: 'Turtle', phonics: '/ˈtɜːrtl/', meaning: '乌龟', illustration: 'A small turtle on sand', options: ['Turtle', 'Snail', 'Lizard', 'Crab'], correctIndex: 0, sortOrder: 5 },
  ];

  for (const w of words2) {
    await wordRepo.save(wordRepo.create({ ...w, lessonId: lessons[1].id }));
  }

  // Daily Tasks
  const tasks = [
    { title: 'Listen & Learn', description: 'Listen to 3 new words', icon: 'headphones', sortOrder: 1 },
    { title: 'Say It Out Loud', description: 'Practice speaking 2 words', icon: 'mic', sortOrder: 2 },
    { title: 'Write & Draw', description: 'Trace 1 new word', icon: 'pencil', sortOrder: 3 },
  ];

  for (const t of tasks) {
    await taskRepo.save(taskRepo.create(t));
  }

  logger.info('Seed complete!');
  logger.info(`  - ${await courseRepo.count()} courses`);
  logger.info(`  - ${await lessonRepo.count()} lessons`);
  logger.info(`  - ${await wordRepo.count()} words`);
  logger.info(`  - ${await taskRepo.count()} daily tasks`);

  await ds.destroy();
}

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
