import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to add performance indexes on frequently queried columns
 *
 * Indexes added:
 * - user.email (already unique, but explicit index for performance)
 * - user.userType (for filtering ADMIN vs USER)
 * - user.active (for filtering active users)
 * - user.lastLogin (for dashboard queries)
 * - qrcode.token (for frequent lookups)
 * - qrcode.userId (for user's QR codes lookup)
 * - qrcode.expirationDate (for cleanup tasks)
 * - qrcode.active (for filtering active codes)
 * - upload.qrCodeId (for upload queries by QR code)
 * - upload.deletedAt (for filtering non-deleted uploads)
 */
export class AddPerformanceIndexes1767133000000 implements MigrationInterface {
  name = 'AddPerformanceIndexes1767133000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User table indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_user_userType" ON "user" ("userType")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_active" ON "user" ("active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_lastLogin" ON "user" ("lastLogin")`,
    );

    // QR Code table indexes
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

    // Upload table indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_qrCodeId" ON "upload" ("qrCodeId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_deletedAt" ON "upload" ("deletedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_createdAt" ON "upload" ("createdAt")`,
    );

    // Composite index for common query pattern: active QR codes by user
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_userId_active" ON "qrcode" ("userId", "active")`,
    );

    // Composite index for upload pagination queries
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_qrCodeId_deletedAt_createdAt" ON "upload" ("qrCodeId", "deletedAt", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop composite indexes
    await queryRunner.query(`DROP INDEX "IDX_upload_qrCodeId_deletedAt_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_userId_active"`);

    // Drop upload indexes
    await queryRunner.query(`DROP INDEX "IDX_upload_createdAt"`);
    await queryRunner.query(`DROP INDEX "IDX_upload_deletedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_upload_qrCodeId"`);

    // Drop qrcode indexes
    await queryRunner.query(`DROP INDEX "IDX_qrcode_deletedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_active"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_expirationDate"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_qrcode_token"`);

    // Drop user indexes
    await queryRunner.query(`DROP INDEX "IDX_user_lastLogin"`);
    await queryRunner.query(`DROP INDEX "IDX_user_active"`);
    await queryRunner.query(`DROP INDEX "IDX_user_userType"`);
  }
}
