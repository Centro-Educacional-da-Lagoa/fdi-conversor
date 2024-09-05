import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { DocumentService } from './document.service';
import { DocumentProcessor } from './document.processor';
import { DocumentController } from './document.controller';
import { PrismaService } from 'src/Prisma/prisma.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'document',
    }),
  ],
  controllers: [DocumentController],
  providers: [DocumentProcessor, DocumentService, PrismaService],
})
export class DocumentModule {}
