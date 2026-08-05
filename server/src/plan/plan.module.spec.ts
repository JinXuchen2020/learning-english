import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StudyPlan,
  STUDY_PLAN_SKILL_TYPES,
  STUDY_PLAN_STATUSES,
  StudyPlanSkillType,
  StudyPlanStatus,
} from './study-plan.entity';
import { StudyPlanDay } from './study-plan-day.entity';
import { User } from '../entities/user.entity';
import { appEntities } from '../config/database.config';

/**
 * 行为级测试：用 in-memory better-sqlite3 + 真实 `appEntities` 验证
 * AI-201 两张表确由 `synchronize` 建立，且默认值 / 关系 / 级联 / 枚举落地。
 * 覆盖纯数据模型实体「建表」这一核心验收点（实体自身无逻辑分支）。
 *
 * 注：本 spec 仅验证数据模型建表，直接 `TypeOrmModule.forFeature` 注册仓库，
 * 不导入 `PlanModule`（其 `PlanService` 注入全局 `AI_PROVIDER_TOKEN`，会引入
 * 额外依赖）；服务/控制器装配由 `plan.service.spec` / `plan.controller.spec` 覆盖。
 */
describe('PlanModule (AI-201 数据模型)', () => {
  let moduleRef: TestingModule;
  let userRepo: Repository<User>;
  let planRepo: Repository<StudyPlan>;
  let dayRepo: Repository<StudyPlanDay>;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: appEntities,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([User, StudyPlan, StudyPlanDay]),
      ],
    }).compile();

    moduleRef = mod;
    userRepo = mod.get<Repository<User>>(getRepositoryToken(User));
    planRepo = mod.get<Repository<StudyPlan>>(getRepositoryToken(StudyPlan));
    dayRepo = mod.get<Repository<StudyPlanDay>>(getRepositoryToken(StudyPlanDay));
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('枚举常量覆盖全部合法值', () => {
    expect([...STUDY_PLAN_SKILL_TYPES].sort()).toEqual(
      ['listen', 'speak', 'vocab', 'write'].sort(),
    );
    expect([...STUDY_PLAN_STATUSES].sort()).toEqual(
      ['applied', 'archived', 'draft'].sort(),
    );
  });

  it('status 默认 draft，且可持久化 skillType', async () => {
    const user = await userRepo.save(userRepo.create({ username: 'plan-user', password: 'x' }));
    const plan = planRepo.create({
      userId: user.id,
      skillType: 'listen' as StudyPlanSkillType,
    });
    const saved = await planRepo.save(plan);

    expect(saved.status).toBe('draft');
    const reloaded = await planRepo.findOne({ where: { id: saved.id } });
    expect(reloaded).not.toBeNull();
    expect(reloaded!.status).toBe('draft');
    expect(reloaded!.skillType).toBe('listen');
    expect(reloaded!.userId).toBe(user.id);
  });

  it('StudyPlanDay 默认 isDone=false，且与 StudyPlan 关联', async () => {
    const user = await userRepo.save(userRepo.create({ username: 'plan-user-2', password: 'x' }));
    const plan = await planRepo.save(
      planRepo.create({ userId: user.id, skillType: 'speak' as StudyPlanSkillType }),
    );
    const day = dayRepo.create({
      planId: plan.id,
      dayIndex: 0,
      skillType: 'speak' as StudyPlanSkillType,
      title: 'Day 1',
      content: '2 复习 + 1 口语',
    });
    const savedDay = await dayRepo.save(day);

    expect(savedDay.isDone).toBe(false);
    const reloadedDay = await dayRepo.findOne({ where: { id: savedDay.id } });
    expect(reloadedDay).not.toBeNull();
    expect(reloadedDay!.planId).toBe(plan.id);
    expect(reloadedDay!.isDone).toBe(false);
  });

  it('cascade 保存 StudyPlan 时子行自动落库并回填 planId', async () => {
    const user = await userRepo.save(userRepo.create({ username: 'plan-user-3', password: 'x' }));
    const plan = planRepo.create({
      userId: user.id,
      skillType: 'vocab' as StudyPlanSkillType,
      status: 'applied' as StudyPlanStatus,
      days: [
        dayRepo.create({ dayIndex: 0, skillType: 'vocab', title: 'D0', content: 'c0' }),
        dayRepo.create({ dayIndex: 1, skillType: 'vocab', title: 'D1', content: 'c1' }),
      ],
    });
    const saved = await planRepo.save(plan);

    const days = await dayRepo.find({ where: { planId: saved.id }, order: { dayIndex: 'ASC' } });
    expect(days).toHaveLength(2);
    expect(days[0].planId).toBe(saved.id);
    expect(days[1].planId).toBe(saved.id);
    expect(days[0].isDone).toBe(false);
  });

  it('删除 StudyPlan 级联删除其子行', async () => {
    const user = await userRepo.save(userRepo.create({ username: 'plan-user-4', password: 'x' }));
    const plan = await planRepo.save(
      planRepo.create({
        userId: user.id,
        skillType: 'write' as StudyPlanSkillType,
        days: [dayRepo.create({ dayIndex: 0, skillType: 'write', title: 'w', content: 'c' })],
      }),
    );
    const dayId = (await dayRepo.findOne({ where: { planId: plan.id } }))!.id;
    await planRepo.remove(plan);

    expect(await dayRepo.findOne({ where: { id: dayId } })).toBeNull();
  });
});
