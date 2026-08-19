import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course } from '../entities/course.entity';
import { Lesson } from '../entities/lesson.entity';
import { Word } from '../entities/word.entity';
import { LessonProgress } from '../entities/lesson-progress.entity';
import { CoursePlanSpec } from '../plan/courses-from-plan.schema';
import { PlanCatalog, PlanCatalogLesson } from '../plan/plan.types';
import { PlanLevel } from '../plan/dto/generate-plan.dto';
import { StudyPlanSkillType } from '../plan/study-plan.entity';

/** `createCourseFromPlan` 落库后返回的计数结果（AI-801）。 */
export interface CreateCourseResult {
  courseId: string;
  lessonCount: number;
  wordCount: number;
}

/**
 * 目录未逐课时持久化 `skillType`/`level`，此处给安全默认值（仅作 PlanAgent 提示用，
 * 不进入导航逻辑）；导航只看 `lessonId`/`courseId` 真实存在性（见 `lessonExists`）。
 */
const CATALOG_DEFAULT_SKILL: StudyPlanSkillType = 'vocab';
const CATALOG_DEFAULT_LEVEL: PlanLevel = 'a1';


@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course)
    private coursesRepo: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonsRepo: Repository<Lesson>,
    @InjectRepository(Word)
    private wordsRepo: Repository<Word>,
    @InjectRepository(LessonProgress)
    private progressRepo: Repository<LessonProgress>,
  ) {}

  async findAll() {
    const courses = await this.coursesRepo.find({
      order: { sortOrder: 'ASC' },
      relations: ['lessons'],
    });

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      color: course.color,
      totalLessons: course.lessons.length,
      wordCount: 0, // computed from lessons
    }));
  }

  async findOne(id: string, userId?: string) {
    const course = await this.coursesRepo.findOne({
      where: { id },
      relations: ['lessons', 'lessons.words'],
      order: { lessons: { sortOrder: 'ASC' } },
    });

    if (!course) throw new NotFoundException('Course not found');

    let completedIds: Set<string> = new Set();
    if (userId) {
      const progress = await this.progressRepo.find({
        where: { userId, completed: true },
      });
      completedIds = new Set(progress.map((p) => p.lessonId));
    }

    const lessons = course.lessons.map((lesson, index) => {
      const isCompleted = completedIds.has(lesson.id);
      const prevCompleted = index === 0 || completedIds.has(course.lessons[index - 1]?.id);
      const state = isCompleted ? 'completed' : prevCompleted ? 'available' : 'locked';

      return {
        id: lesson.id,
        title: lesson.title,
        state,
        wordCount: lesson.words.length,
        estimatedMinutes: lesson.estimatedMinutes,
      };
    });

    const completedLessons = lessons.filter((l) => l.state === 'completed').length;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      icon: course.icon,
      color: course.color,
      totalLessons: lessons.length,
      completedLessons,
      wordCount: course.lessons.reduce((sum, l) => sum + l.words.length, 0),
      lessons,
    };
  }

  /**
   * 由计划推导的课程规格落库为全新 Course + Lessons + Words（AI-801 写路径）。
   * 全量在单个事务内完成，任一步失败整体回滚，保证「课程/课时/单词」原子可见。
   * 不改动现有只读路径（findAll/findOne）。
   * @param spec 经 `validateCoursePlan` 校验后的结构化课程规格
   * @returns 落库后的 courseId 与计数
   */
  async createCourseFromPlan(spec: CoursePlanSpec): Promise<CreateCourseResult> {
    return this.coursesRepo.manager.transaction(async (manager) => {
      const courseRepo = manager.getRepository(Course);
      const lessonRepo = manager.getRepository(Lesson);
      const wordRepo = manager.getRepository(Word);

      const course = await courseRepo.save(
        courseRepo.create({
          title: spec.course.title,
          description: spec.course.description,
          icon: spec.course.icon,
          color: spec.course.color,
          sortOrder: 0,
        }),
      );

      let wordCount = 0;
      for (let i = 0; i < spec.lessons.length; i++) {
        const ls = spec.lessons[i];
        const lesson = await lessonRepo.save(
          lessonRepo.create({
            title: ls.title,
            sortOrder: i,
            estimatedMinutes: ls.estimatedMinutes ?? 5,
            courseId: course.id,
          }),
        );
        for (let j = 0; j < ls.words.length; j++) {
          const w = ls.words[j];
          await wordRepo.save(
            wordRepo.create({
              text: w.text,
              phonics: w.phonics,
              meaning: w.meaning,
              options: w.options,
              correctIndex: w.correctIndex,
              sortOrder: j,
              // illustration 实体类型为 string，DB 列 nullable → 省略即落 NULL（符合「默认 null」）。
              category: spec.course.title.slice(0, 50),
              color: spec.course.color || null,
              lessonId: lesson.id,
            }),
          );
          wordCount++;
        }
      }

      return { courseId: course.id, lessonCount: spec.lessons.length, wordCount };
    });
  }

  /**
   * 构建注入 PlanAgent 的课程目录（AI-803）：从 `courses`/`lessons` 表取真实 id 与标题，
   * 供 `PlanService.generatePlan` 喂给提示词，使 AI 产出**真实可导航**的 `lessonId`/`courseId`。
   * 目录为空时返回空目录（调用方据此走「无目录」分支，AI 产出空 id 占位）。
   */
  async getCatalog(): Promise<PlanCatalog> {
    const courses = await this.coursesRepo.find({
      order: { sortOrder: 'ASC' },
      relations: ['lessons'],
    });

    const courseItems = courses.map((c) => ({ courseId: c.id, title: c.title }));
    const lessonItems: PlanCatalogLesson[] = [];
    for (const c of courses) {
      for (const l of c.lessons ?? []) {
        lessonItems.push({
          lessonId: l.id,
          title: l.title,
          courseId: c.id,
          skillType: CATALOG_DEFAULT_SKILL,
          level: CATALOG_DEFAULT_LEVEL,
          estimatedMinutes: l.estimatedMinutes,
        });
      }
    }
    return { courses: courseItems, lessons: lessonItems };
  }

  /** `lessons` 表是否存在该 id（AI-803 `applyPlan` 校验计划引用的真实存在性）。空串 → false。 */
  async lessonExists(lessonId: string): Promise<boolean> {
    if (!lessonId) return false;
    const found = await this.lessonsRepo.findOne({ where: { id: lessonId } });
    return !!found;
  }

  /** `courses` 表是否存在该 id（AI-803 配套校验）。空串 → false。 */
  async courseExists(courseId: string): Promise<boolean> {
    if (!courseId) return false;
    const found = await this.coursesRepo.findOne({ where: { id: courseId } });
    return !!found;
  }
}
