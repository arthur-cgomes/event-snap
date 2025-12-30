import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseCollection } from 'src/common/entity/base.entity';

@Entity('banner')
export class Banner extends BaseCollection {
  @ApiProperty({
    type: String,
    description: 'Título principal do banner',
  })
  @Column({ type: 'varchar' })
  title: string;

  @ApiProperty({
    type: String,
    description: 'Subtítulo ou descrição do banner',
  })
  @Column({ type: 'varchar', nullable: true })
  subtitle: string;

  @ApiProperty({
    type: String,
    description: 'Texto do botão de ação (CTA)',
  })
  @Column({ type: 'varchar', nullable: true })
  buttonText: string;

  @ApiProperty({
    type: String,
    description: 'Link para onde o botão redireciona (interno ou externo)',
  })
  @Column({ type: 'varchar', nullable: true })
  buttonLink: string;

  @ApiProperty({
    type: String,
    description:
      'URL da imagem de fundo. Se preenchido, tem prioridade sobre a cor',
  })
  @Column({ type: 'varchar', nullable: true })
  imageUrl: string;

  @ApiProperty({
    type: String,
    description:
      'Classes Tailwind (ex: bg-gradient...) ou código HEX para o fundo',
  })
  @Column({ type: 'varchar', nullable: true })
  backgroundColor: string;

  @ApiProperty({
    type: Number,
    description:
      'Ordem de exibição no carrossel (menor número aparece primeiro)',
    default: 0,
  })
  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @ApiProperty({
    type: Date,
    description: 'Data/Hora para começar a aparecer automaticamente',
  })
  @Column({ type: 'timestamp', nullable: true })
  startsAt: Date;

  @ApiProperty({
    type: Date,
    description: 'Data/Hora para parar de aparecer automaticamente',
  })
  @Column({ type: 'timestamp', nullable: true })
  endsAt: Date;
}
