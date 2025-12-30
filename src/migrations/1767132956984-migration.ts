import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1767132956984 implements MigrationInterface {
  name = 'Migration1767132956984';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "upload" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, "fileUrl" character varying NOT NULL, "qrCodeId" uuid, CONSTRAINT "PK_1fe8db121b3de4ddfa677fc51f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."qrcode_type_enum" AS ENUM('FREE', 'PAID', 'RECURRING')`,
    );
    await queryRunner.query(
      `CREATE TABLE "qrcode" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, "token" character varying, "eventName" character varying, "descriptionEvent" character varying, "eventColor" character varying, "expirationDate" TIMESTAMP, "type" "public"."qrcode_type_enum" NOT NULL DEFAULT 'FREE', "userId" uuid, CONSTRAINT "PK_9aaafe9e77dce17001051dab68a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_usertype_enum" AS ENUM('user', 'global', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, "name" character varying, "phone" character varying, "dateOfBirth" character varying, "email" character varying NOT NULL, "password" character varying, "userType" "public"."user_usertype_enum" NOT NULL DEFAULT 'user', "createdBy" character varying, "createdById" character varying, "lastLogin" TIMESTAMP, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "banner" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "active" boolean NOT NULL DEFAULT true, "deletedAt" TIMESTAMP, "title" character varying NOT NULL, "subtitle" character varying, "buttonText" character varying, "buttonLink" character varying, "imageUrl" character varying, "backgroundColor" character varying, "displayOrder" integer NOT NULL DEFAULT '0', "startsAt" TIMESTAMP, "endsAt" TIMESTAMP, CONSTRAINT "PK_6d9e2570b3d85ba37b681cd4256" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "upload" ADD CONSTRAINT "FK_ccfd10fe5926731bc171bfe09e0" FOREIGN KEY ("qrCodeId") REFERENCES "qrcode"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "qrcode" ADD CONSTRAINT "FK_8efa537e1321df9fb6cf1821f26" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "qrcode" DROP CONSTRAINT "FK_8efa537e1321df9fb6cf1821f26"`,
    );
    await queryRunner.query(
      `ALTER TABLE "upload" DROP CONSTRAINT "FK_ccfd10fe5926731bc171bfe09e0"`,
    );
    await queryRunner.query(`DROP TABLE "banner"`);
    await queryRunner.query(`DROP TABLE "user"`);
    await queryRunner.query(`DROP TYPE "public"."user_usertype_enum"`);
    await queryRunner.query(`DROP TABLE "qrcode"`);
    await queryRunner.query(`DROP TYPE "public"."qrcode_type_enum"`);
    await queryRunner.query(`DROP TABLE "upload"`);
  }
}
