import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户积分余额（AI-701）。
 *
 * 每用户一行：`balance` 为「可消费积分余额」，与 `User.totalStars`（lifetime，驱动等级）
 * 分离——获得行为两者同加，兑换仅扣 `balance`，等级不回落（儿童产品直觉）。
 */
@Entity('user_points')
export class UserPoints {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  userId: string;

  @Column({ type: 'int', default: 0 })
  balance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
