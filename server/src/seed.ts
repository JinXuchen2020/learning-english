import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Course } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { Word } from './entities/word.entity';
import { Sentence } from './entities/sentence.entity';
import { DailyTask } from './entities/daily-task.entity';
import { buildDataSourceOptions, getDbType } from './config/database.config';
import { logger } from './common/logger/logger';
import { IsNull } from 'typeorm';
import { ProviderConfig } from './ai/provider-config/provider-config.entity';
import { encryptSecret } from './ai/provider-config/crypto.util';

const ds = new DataSource(buildDataSourceOptions());

async function seed() {
  await ds.initialize();
  logger.info(`Database connected (${getDbType()}). Seeding...`);

  const courseRepo = ds.getRepository(Course);
  const lessonRepo = ds.getRepository(Lesson);
  const wordRepo = ds.getRepository(Word);
  const sentenceRepo = ds.getRepository(Sentence);
  const taskRepo = ds.getRepository(DailyTask);

  // Clear existing data
  await wordRepo.clear();
  await lessonRepo.clear();
  await courseRepo.clear();
  await sentenceRepo.clear();
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
  // AI-703: category/color 用于「组词」模式，每个词分配唯一 (color, category) 组合，
  // 保证组词题答案唯一、无歧义。
  const words = [
    { text: 'Cat', phonics: '/kæt/', meaning: '小猫', illustration: 'A fluffy orange cat', options: ['Cat','Dog','Rabbit','Fish'], correctIndex: 0, sortOrder: 1, category: 'pet', color: 'orange' },
    { text: 'Dog', phonics: '/dɒɡ/', meaning: '小狗', illustration: 'A happy golden puppy', options: ['Bird','Dog','Horse','Duck'], correctIndex: 1, sortOrder: 2, category: 'pet', color: 'brown' },
    { text: 'Fish', phonics: '/fɪʃ/', meaning: '小鱼', illustration: 'A colorful fish in a bowl', options: ['Frog','Crab','Fish','Whale'], correctIndex: 2, sortOrder: 3, category: 'ocean', color: 'blue' },
    { text: 'Bird', phonics: '/bɜːrd/', meaning: '小鸟', illustration: 'A blue bird on a branch', options: ['Bird','Bee','Bat','Ant'], correctIndex: 0, sortOrder: 4, category: 'sky', color: 'blue' },
    { text: 'Rabbit', phonics: '/ˈræbɪt/', meaning: '兔子', illustration: 'A white rabbit with a carrot', options: ['Mouse','Hamster','Squirrel','Rabbit'], correctIndex: 3, sortOrder: 5, category: 'pet', color: 'white' },
  ];

  for (const w of words) {
    await wordRepo.save(wordRepo.create({ ...w, lessonId: lessons[0].id }));
  }

  // Words for second lesson (Pet Animals)
  // AI-703: category/color 唯一组合（继续补充，避免与第一课重复）。
  const words2 = [
    { text: 'Frog', phonics: '/frɒɡ/', meaning: '青蛙', illustration: 'A green frog on a lily pad', options: ['Frog', 'Toad', 'Snake', 'Turtle'], correctIndex: 0, sortOrder: 1, category: 'pond', color: 'green' },
    { text: 'Horse', phonics: '/hɔːrs/', meaning: '马', illustration: 'A brown horse in a field', options: ['Cow', 'Sheep', 'Horse', 'Goat'], correctIndex: 2, sortOrder: 2, category: 'farm', color: 'brown' },
    { text: 'Duck', phonics: '/dʌk/', meaning: '鸭子', illustration: 'A yellow duck in a pond', options: ['Duck', 'Swan', 'Goose', 'Hen'], correctIndex: 0, sortOrder: 3, category: 'pond', color: 'yellow' },
    { text: 'Bear', phonics: '/ber/', meaning: '熊', illustration: 'A friendly bear with honey', options: ['Wolf', 'Fox', 'Deer', 'Bear'], correctIndex: 3, sortOrder: 4, category: 'forest', color: 'brown' },
    { text: 'Turtle', phonics: '/ˈtɜːrtl/', meaning: '乌龟', illustration: 'A small turtle on sand', options: ['Turtle', 'Snail', 'Lizard', 'Crab'], correctIndex: 0, sortOrder: 5, category: 'beach', color: 'green' },
  ];

  for (const w of words2) {
    await wordRepo.save(wordRepo.create({ ...w, lessonId: lessons[1].id }));
  }

  // Sentences for the sentence-following library (AI-309): 36 graded sentences
  // covering the P0 animal vocabulary (lexically linked via wordTexts).
  const sentences: Array<{
    text: string;
    meaning: string;
    level: string;
    wordTexts: string[];
    tags: string[];
    sortOrder: number;
  }> = [
    // L1 — ultra simple (≤5 words, 1 P0 word)
    { text: 'The cat is small.', meaning: '猫很小。', level: 'L1', wordTexts: ['cat'], tags: ['animal'], sortOrder: 1 },
    { text: 'I see a dog.', meaning: '我看见一只狗。', level: 'L1', wordTexts: ['dog'], tags: ['animal'], sortOrder: 2 },
    { text: 'A fish can swim.', meaning: '鱼会游泳。', level: 'L1', wordTexts: ['fish'], tags: ['animal'], sortOrder: 3 },
    { text: 'The bird is blue.', meaning: '鸟是蓝色的。', level: 'L1', wordTexts: ['bird'], tags: ['animal'], sortOrder: 4 },
    { text: 'Rabbit is white.', meaning: '兔子是白色的。', level: 'L1', wordTexts: ['rabbit'], tags: ['animal'], sortOrder: 5 },
    { text: 'The frog jumps.', meaning: '青蛙跳。', level: 'L1', wordTexts: ['frog'], tags: ['animal'], sortOrder: 6 },
    { text: 'A horse is big.', meaning: '马很大。', level: 'L1', wordTexts: ['horse'], tags: ['animal'], sortOrder: 7 },
    { text: 'The duck is yellow.', meaning: '鸭子是黄色的。', level: 'L1', wordTexts: ['duck'], tags: ['animal'], sortOrder: 8 },
    { text: 'Bear is brown.', meaning: '熊是棕色的。', level: 'L1', wordTexts: ['bear'], tags: ['animal'], sortOrder: 9 },
    { text: 'The turtle is slow.', meaning: '乌龟很慢。', level: 'L1', wordTexts: ['turtle'], tags: ['animal'], sortOrder: 10 },
    { text: 'I like the cat.', meaning: '我喜欢猫。', level: 'L1', wordTexts: ['cat'], tags: ['animal'], sortOrder: 11 },
    { text: 'This is my dog.', meaning: '这是我的狗。', level: 'L1', wordTexts: ['dog'], tags: ['animal'], sortOrder: 12 },
    // L2 — simple sentences with modifiers (1-2 P0 words)
    { text: 'The little cat is cute.', meaning: '这只小猫很可爱。', level: 'L2', wordTexts: ['cat'], tags: ['animal'], sortOrder: 1 },
    { text: 'My dog runs fast.', meaning: '我的狗跑得快。', level: 'L2', wordTexts: ['dog'], tags: ['animal'], sortOrder: 2 },
    { text: 'The red fish swims away.', meaning: '红鱼游走了。', level: 'L2', wordTexts: ['fish'], tags: ['animal'], sortOrder: 3 },
    { text: 'A small bird sings a song.', meaning: '一只小鸟在唱歌。', level: 'L2', wordTexts: ['bird'], tags: ['animal'], sortOrder: 4 },
    { text: 'The white rabbit eats a carrot.', meaning: '白兔吃胡萝卜。', level: 'L2', wordTexts: ['rabbit'], tags: ['animal'], sortOrder: 5 },
    { text: 'We saw a green frog.', meaning: '我们看到一只绿青蛙。', level: 'L2', wordTexts: ['frog'], tags: ['animal'], sortOrder: 6 },
    { text: 'The brown horse eats grass.', meaning: '棕马吃草。', level: 'L2', wordTexts: ['horse'], tags: ['animal'], sortOrder: 7 },
    { text: 'Two ducks swim in the pond.', meaning: '两只鸭子在池塘里游。', level: 'L2', wordTexts: ['duck'], tags: ['animal'], sortOrder: 8 },
    { text: 'The friendly bear loves honey.', meaning: '友善的熊喜欢蜂蜜。', level: 'L2', wordTexts: ['bear'], tags: ['animal'], sortOrder: 9 },
    { text: 'The old turtle walks slowly.', meaning: '老乌龟慢慢地走。', level: 'L2', wordTexts: ['turtle'], tags: ['animal'], sortOrder: 10 },
    { text: 'Cat and dog are friends.', meaning: '猫和狗是朋友。', level: 'L2', wordTexts: ['cat', 'dog'], tags: ['animal'], sortOrder: 11 },
    { text: 'I feed the small fish.', meaning: '我喂小鱼。', level: 'L2', wordTexts: ['fish'], tags: ['animal'], sortOrder: 12 },
    // L3 — compound / longer (2+ P0 words or conjunctions)
    { text: 'The cat sat on the mat and slept.', meaning: '猫坐在垫子上睡着了。', level: 'L3', wordTexts: ['cat'], tags: ['animal'], sortOrder: 1 },
    { text: 'When the dog barks, the cat runs away.', meaning: '狗叫时猫跑开了。', level: 'L3', wordTexts: ['dog', 'cat'], tags: ['animal'], sortOrder: 2 },
    { text: 'The bird flew up and the fish swam down.', meaning: '鸟飞起，鱼游下。', level: 'L3', wordTexts: ['bird', 'fish'], tags: ['animal'], sortOrder: 3 },
    { text: 'My rabbit and my turtle play together.', meaning: '我的兔子和乌龟一起玩。', level: 'L3', wordTexts: ['rabbit', 'turtle'], tags: ['animal'], sortOrder: 4 },
    { text: 'Because it rained, the frog was happy.', meaning: '因为下雨，青蛙很高兴。', level: 'L3', wordTexts: ['frog'], tags: ['animal'], sortOrder: 5 },
    { text: 'The horse ran fast but the turtle was slow.', meaning: '马跑得快，但乌龟慢。', level: 'L3', wordTexts: ['horse', 'turtle'], tags: ['animal'], sortOrder: 6 },
    { text: 'If the duck quacks, the dog will wake up.', meaning: '鸭子叫，狗就会醒。', level: 'L3', wordTexts: ['duck', 'dog'], tags: ['animal'], sortOrder: 7 },
    { text: 'The bear ate honey while the bird sang.', meaning: '熊吃蜂蜜，鸟儿在唱。', level: 'L3', wordTexts: ['bear', 'bird'], tags: ['animal'], sortOrder: 8 },
    { text: 'After the cat ate, the dog wanted food too.', meaning: '猫吃完后，狗也想要食物。', level: 'L3', wordTexts: ['cat', 'dog'], tags: ['animal'], sortOrder: 9 },
    { text: 'We watched the frog jump and the fish swim.', meaning: '我们看青蛙跳、鱼游。', level: 'L3', wordTexts: ['frog', 'fish'], tags: ['animal'], sortOrder: 10 },
    { text: 'The brown bear and the white rabbit are friends.', meaning: '棕熊和白兔是朋友。', level: 'L3', wordTexts: ['bear', 'rabbit'], tags: ['animal'], sortOrder: 11 },
    { text: 'Every morning the horse and the duck go to the pond.', meaning: '每天早晨马和鸭子去池塘。', level: 'L3', wordTexts: ['horse', 'duck'], tags: ['animal'], sortOrder: 12 },
  ];

  for (const s of sentences) {
    await sentenceRepo.save(sentenceRepo.create({ ...s, lessonId: null }));
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

  // AI-713：系统默认智谱 provider —— 仅 seed 一次，运行时 AI 调用全部走 DB。
  // 不再从 env 读取 AI 配置；家长未设置自己 provider 时使用此默认。
  const providerConfigRepo = ds.getRepository(ProviderConfig);
  const existingDefault = await providerConfigRepo.findOne({
    where: { ownerUserId: IsNull(), isDefault: true },
  });
  if (!existingDefault) {
    const zhipuKey = process.env.ZHIPU_API_KEY;
    if (!zhipuKey) {
      logger.warn(
        '[Seed] ZHIPU_API_KEY 未设置，跳过系统默认智谱 provider 播种；AI 调用将失败，请在运行 seed 前配置 ZHIPU_API_KEY',
      );
    } else {
      await providerConfigRepo.save(
        providerConfigRepo.create({
          ownerUserId: null,
          name: '智谱 GLM (系统默认)',
          type: 'bigmodel',
          baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
          apiKeyEnc: encryptSecret(zhipuKey),
          modelsJson: JSON.stringify({
            chat: 'glm-4.7-flash',
            vision: 'glm-4.6v-flash',
            tts: 'glm-tts',
          }),
          capabilitiesJson: JSON.stringify(['chat', 'vision', 'tts']),
          isDefault: true,
        }),
      );
      logger.info('[Seed] 已播种系统默认智谱 provider (type=bigmodel, isDefault=true)');
    }
  } else {
    logger.info('[Seed] 系统默认智谱 provider 已存在，跳过播种');
  }

  logger.info('Seed complete!');
  logger.info(`  - ${await courseRepo.count()} courses`);
  logger.info(`  - ${await lessonRepo.count()} lessons`);
  logger.info(`  - ${await wordRepo.count()} words`);
  logger.info(`  - ${await sentenceRepo.count()} sentences`);
  logger.info(`  - ${await taskRepo.count()} daily tasks`);

  await ds.destroy();
}

seed().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
