import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';
import { dateColumnType } from '../config/date-column-type';

/** 兑换单状态机：孩子申请 → 家长批准/驳回。 */
export type RedemptionStatus = 'pending' | 'approved' | 'rejected';

/**
 * 兑换申请单（AI-701）。
 *
 * `rewardTitle` / `cost` 为快照：即便家长之后改/删目录，兑换记录仍可展示当时内容。
 */
@Entity('reward_redemptions')
export class RewardRedemption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 申请人（孩子）。 */
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  rewardId: string;

  /** 快照：奖励标题。 */
  @Column({ type: 'varchar' })
  rewardTitle: string;

  /** 快照：兑换时成本。 */
  @Column({ type: 'int' })
  cost: number;

  @Column({ type: 'varchar', default: 'pending' })
  status: RedemptionStatus;

  @Column({ type: 'varchar', nullable: true })
  rejectReason: string | null;

  /** 审批时间（approved/rejected 时写入）。
   *  type 按驱动切换：sqlite→datetime / postgres→timestamp。
   */
  @Column({ type: dateColumnType(), nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
