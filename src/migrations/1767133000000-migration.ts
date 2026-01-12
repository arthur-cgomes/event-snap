import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration11767133000000 implements MigrationInterface {
  name = 'Migration11767133000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_user_userType" ON "user" ("userType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_active" ON "user" ("active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_lastLogin" ON "user" ("lastLogin")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_token" ON "qrcode" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_userId" ON "qrcode" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_expirationDate" ON "qrcode" ("expirationDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_active" ON "qrcode" ("active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_deletedAt" ON "qrcode" ("deletedAt")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_upload_qrCodeId" ON "upload" ("qrCodeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_deletedAt" ON "upload" ("deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_createdAt" ON "upload" ("createdAt")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_userId_active" ON "qrcode" ("userId", "active")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_upload_qrCodeId_deletedAt_createdAt" ON "upload" ("qrCodeId", "deletedAt", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_upload_qrCodeId_deletedAt_createdAt"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_qrcode_userId_active"`);
    await queryRunner.query(`DROP INDEX "IDX_upload_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_upload_deletedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_upload_qrCodeId"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_deletedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_active"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_expirationDate"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_token"`);
    await queryRunner.query(`DROP INDEX "IDX_user_lastLogin"`);
    await queryRunner.query(`DROP INDEX "IDX_user_active"`);
    await queryRunner.query(`DROP INDEX "IDX_user_userType"`);
  }
}
