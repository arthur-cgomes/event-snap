import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1735926768571 implements MigrationInterface {
  name = 'Migration1735926768571';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_usertype_enum" AS ENUM('user', 'global', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "email" character varying NOT NULL, "password" character varying, "name" character varying, "userType" "public"."user_usertype_enum" NOT NULL DEFAULT 'user', "createdBy" character varying, "createdById" character varying, "lastLogin" TIMESTAMP, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_usertype_enum"`);
  }
}
