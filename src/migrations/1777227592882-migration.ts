import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1777227592882 implements MigrationInterface {
  name = 'Migration1777227592882';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "admin_id" character varying NOT NULL, "admin_email" character varying NOT NULL, "action" character varying NOT NULL, "target_id" character varying, "details" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "upload" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, "file_url" character varying NOT NULL, "qrCodeId" uuid, CONSTRAINT "PK_1fe8db121b3de4ddfa677fc51f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_upload_qrCodeId" ON "upload" ("qrCodeId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."qrcode_type_enum" AS ENUM('FREE', 'PAID')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."qrcode_plan_enum" AS ENUM('FREE', 'PARTY', 'CORPORATE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "qrcode" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, "token" character varying, "event_name" character varying, "description_event" character varying, "event_color" character varying, "expiration_date" TIMESTAMP, "type" "public"."qrcode_type_enum" NOT NULL DEFAULT 'FREE', "plan" "public"."qrcode_plan_enum" NOT NULL DEFAULT 'FREE', "eventLocation" character varying, "eventDateTime" TIMESTAMP, "dressCode" character varying, "eventTheme" character varying, "coverImageUrl" character varying, "recommendations" text, "storage_prefix" character varying, "uploadEnabled" boolean NOT NULL DEFAULT false, "galleryEnabled" boolean NOT NULL DEFAULT false, "viewCount" integer NOT NULL DEFAULT '0', "lastUploadAt" TIMESTAMP, "userId" uuid, CONSTRAINT "PK_9aaafe9e77dce17001051dab68a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_qrcode_token" ON "qrcode" ("token") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_qrcode_userId" ON "qrcode" ("userId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_user_type_enum" AS ENUM('user', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, "name" character varying, "phone" character varying, "date_of_birth" character varying, "email" character varying NOT NULL, "password" character varying, "user_type" "public"."user_user_type_enum" NOT NULL DEFAULT 'user', "created_by" character varying, "created_by_id" character varying, "supabase_uid" character varying, "auth_provider" character varying, "last_login" TIMESTAMP, "notify_on_upload" boolean NOT NULL DEFAULT true, "notify_on_expiration" boolean NOT NULL DEFAULT true, "notify_on_payment" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_supabaseUid" ON "user" ("supabase_uid") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_active_userType" ON "user" ("active", "user_type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status_enum" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, "stripe_session_id" character varying NOT NULL, "stripe_payment_intent_id" character varying, "amount" integer NOT NULL, "currency" character varying NOT NULL DEFAULT 'brl', "status" "public"."payment_status_enum" NOT NULL DEFAULT 'PENDING', "payment_method" character varying, "paid_at" TIMESTAMP, "userId" uuid, "qrCodeId" uuid, CONSTRAINT "UQ_648879fda7badbd78ca113b51f8" UNIQUE ("stripe_session_id"), CONSTRAINT "PK_fcaec7df5adf9cac408c686b2ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_payment_stripeSessionId" ON "payment" ("stripe_session_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_userId" ON "payment" ("userId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_qrCodeId" ON "payment" ("qrCodeId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "banner" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deleted_at" TIMESTAMP, "title" character varying NOT NULL, "subtitle" character varying, "button_text" character varying, "button_link" character varying, "image_url" character varying, "background_color" character varying, "display_order" integer NOT NULL DEFAULT '0', "starts_at" TIMESTAMP, "ends_at" TIMESTAMP, CONSTRAINT "PK_6d9e2570b3d85ba37b681cd4256" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "upload" ADD CONSTRAINT "FK_ccfd10fe5926731bc171bfe09e0" FOREIGN KEY ("qrCodeId") REFERENCES "qrcode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "qrcode" ADD CONSTRAINT "FK_8efa537e1321df9fb6cf1821f26" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_b046318e0b341a7f72110b75857" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" ADD CONSTRAINT "FK_acec55219dc0e47500349eca0e7" FOREIGN KEY ("qrCodeId") REFERENCES "qrcode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_acec55219dc0e47500349eca0e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment" DROP CONSTRAINT "FK_b046318e0b341a7f72110b75857"`,
    );
    await queryRunner.query(
      `ALTER TABLE "qrcode" DROP CONSTRAINT "FK_8efa537e1321df9fb6cf1821f26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "upload" DROP CONSTRAINT "FK_ccfd10fe5926731bc171bfe09e0"`,
    );
    await queryRunner.query(`DROP TABLE "banner"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_qrCodeId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_payment_userId"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_stripeSessionId"`,
    );
    await queryRunner.query(`DROP TABLE "payment"`);
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_active_userType"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_supabaseUid"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_user_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_qrcode_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_qrcode_token"`);
    await queryRunner.query(`DROP TABLE "qrcode"`);
    await queryRunner.query(`DROP TYPE "public"."qrcode_plan_enum"`);
    await queryRunner.query(`DROP TYPE "public"."qrcode_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_upload_qrCodeId"`);
    await queryRunner.query(`DROP TABLE "upload"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
