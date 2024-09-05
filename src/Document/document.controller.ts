import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { DocumentService } from './document.service';

@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('process')
  async processDocuments(@Body() data: any): Promise<string> {
    await this.documentService.processDocuments(data);
    return 'Documents are being processed';
  }

  @Post('generate')
  async generateExcel(@Body() data: any) {
    const excelFilePath =
      await this.documentService.generateExcelFileFromTextFile(data);
    return excelFilePath;
  }

  @Get('generate-json')
  async parseTxtFile() {
    const data = await this.documentService.parseTxtFile();
    return data;
  }
}
