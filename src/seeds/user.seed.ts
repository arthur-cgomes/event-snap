import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../modules/user/entity/user.entity';
import { QrCode } from '../modules/qrcode/entity/qrcode.entity';
import { Upload } from '../modules/upload/entity/upload.entity';
import { Banner } from '../modules/banner/entity/banner.entity';
import { Payment } from '../modules/payment/entity/payment.entity';
import { UserType } from '../common/enum/user-type.enum';
import { QrCodeType } from '../common/enum/qrcode-type.enum';

config();

async function runSeed() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.TYPEORM_HOST,
    port: Number(process.env.TYPEORM_PORT),
    username: process.env.TYPEORM_USERNAME,
    password: process.env.TYPEORM_PASSWORD,
    database: process.env.TYPEORM_DATABASE,
    entities: [User, QrCode, Upload, Banner, Payment],
    ssl:
      process.env.TYPEORM_SSL === 'false'
        ? false
        : { rejectUnauthorized: false },
  });

  await dataSource.initialize();
  console.log('Database connected.');

  const userRepository = dataSource.getRepository(User);
  const qrCodeRepository = dataSource.getRepository(QrCode);

  const users = [
    {
      name: 'Admin Global',
      email: 'admin@fotouai.com.br',
      password: '102030@Aa',
      userType: UserType.ADMIN,
    },
    {
      name: 'Arthur Dev',
      email: 'contato.arthurdev@gmail.com',
      password: '102030@Aa',
      userType: UserType.USER,
      phone: '11999999999',
      dateOfBirth: '1995-01-15',
    },
  ];

  for (const userData of users) {
    const exists = await userRepository.findOne({
      where: { email: userData.email },
    });

    if (exists) {
      console.log(`User ${userData.email} already exists — skipping.`);
      continue;
    }

    const user = userRepository.create(userData);
    await userRepository.save(user);
    console.log(`User ${userData.email} created as ${userData.userType}.`);
  }

  const arthurUser = await userRepository.findOne({
    where: { email: 'contato.arthurdev@gmail.com' },
  });

  if (arthurUser) {
    const existingQrCode = await qrCodeRepository.findOne({
      where: { user: { id: arthurUser.id } },
    });

    if (existingQrCode) {
      console.log(`QR Code for Arthur Dev already exists — skipping.`);
    } else {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      const qrCode = qrCodeRepository.create({
        token: uuidv4(),
        eventName: 'Aniversário do Arthur',
        descriptionEvent:
          'Compartilhe suas fotos e vídeos do aniversário aqui!',
        eventColor: '#6366f1',
        expirationDate,
        type: QrCodeType.FREE,
        user: arthurUser,
      });

      await qrCodeRepository.save(qrCode);
      console.log(
        `QR Code "${qrCode.eventName}" created for Arthur Dev (token: ${qrCode.token}).`,
      );
    }
  }

  await dataSource.destroy();
  console.log('Seed finished.');
}

runSeed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
