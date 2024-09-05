import { HttpException, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as fs from 'fs';
import { PrismaService } from 'src/Prisma/prisma.service';
import { formatWindowsPathToLinux } from 'src/utils/formatWindowPathToLinux';
import { extractFolderName } from 'src/utils/extractFolderName';
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fuzzball from 'fuzzball';
import { normalizeSpecialCharacters } from 'src/utils/normalizeSpecialCharacters';
import * as chardet from 'chardet';
import { filialCodes } from 'src/utils/filialCodes';
import { cleanString } from 'src/utils/cleanString';
import { register } from 'module';
interface DocumentObject {
  TX_Caminho_Documento: string;
  TX_Caminho_Documento_Linux: string;
  NR_Paginas: number;
  NM_Pasta: string | null;
  NM_Tabela: string;
  NM_Unidade: string;
  TX_Caminho: string;
  CD_Cache: number;
  CD_Registro_Academico: string;
  NM_Aluno: string;
}

@Injectable()
export class DocumentService {
  constructor(
    @InjectQueue('document') private readonly documentQueue: Queue,
    private readonly prismaServ: PrismaService,
  ) {}

  async convertDocumentToPdf(
    documentObject: DocumentObject,
    folderName: string,
  ): Promise<void> {
    // Add a job to the queue with the document object information and the specified folder name
    await this.documentQueue.add('convert', { documentObject, folderName });
  }

  async processDocuments(data: any): Promise<void> {
    const documents = await this.getDocumentsFromDb(data.TX_Pesquisa); // Fetch document paths from DB
    for (const document of documents) {
      await this.convertDocumentToPdf(document, data.NM_Pasta); // Specify the folder name here
    }
  }

  private async getDocumentsFromDb(
    TX_Pesquisa: string,
  ): Promise<DocumentObject[]> {
    try {
      const data = await this.prismaServ.$queryRawUnsafe<any>(`
        exec	fdi.dbo.PR_FDI_Busca_Registros '${TX_Pesquisa}'
        `);
      return data.map((item) => {
        return {
          ...item,
          TX_Caminho_Documento_Linux: formatWindowsPathToLinux(
            item.TX_Caminho_Documento,
          ),
          NM_Pasta: extractFolderName(item.TX_Caminho_Documento),
          CD_Registro_Academico:
            item.CD_Registro_Academico === '--' ||
            item.CD_Registro_Academico === '---'
              ? 'XXX'
              : item.CD_Registro_Academico,
          NM_Aluno:
            item.NM_Aluno === '--' || item.NM_Aluno === '---'
              ? 'XXX'
              : item.NM_Aluno,
        };
      });
    } catch (error) {
      console.log('🚀 ~ DocumentService ~ getDocumentsFromDb ~ error:', error);
      throw new HttpException('Ocorreu um erro ao buscar registros', 500);
    }
    // Simulate fetching document paths from the database
  }
  readFileAsUtf8(filePath: string): string {
    return fs.readFileSync(filePath, 'latin1');
  }

  async generateExcelFileFromTextFile(input: {
    TX_Pesquisa: string;
    NM_Arquivo: string;
  }): Promise<string> {
    // Specify the path to the file inside the src folder
    const filePath = path.join(__dirname, '../../src/matriculas_2012.txt');

    // Read the text file as UTF-8
    const textData = this.readFileAsUtf8(filePath);

    // Split lines and process
    const lines = textData
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    console.log('Parsed lines:', lines);

    // Extract headers and rows
    const headers = [
      ...lines[0].split(/\s+/),
      'EXISTE FDI',
      'MATRICULA FDI',
      'NOME UNIDADE FDI',
      'NOME ALUNO FDI',
    ].map((column) => column.replace(/_/g, ' '));

    const filialCode = filialCodes[input.TX_Pesquisa];

    if (!filialCode) return null;

    const fdiData = await this.getDocumentsFromDb(input.TX_Pesquisa);

    console.log('---- STARTING VERIFICATION ----');
    const dataRows = lines
      .slice(1)
      .filter((item) => {
        const parts = item.split(/[\s\t]+/);
        const CD_Unidade = parts[1];

        // Check if the student exists in the FDI data array
        return filialCode.includes(CD_Unidade);
      })
      .map((item) => {
        const parts = item.split(/[\s\t]+/);
        const CD_Registro_Academico = parts[0];
        const CD_Unidade = parts[1];
        const NM_Aluno = parts.slice(2).join(' ');

        return {
          CD_Registro_Academico,
          CD_Unidade,
          NM_Aluno,
        };
      })
      .map((item: any) => {
        const existFDI = fdiData.find((register) => {
          return (
            (register.CD_Registro_Academico !== 'XXX' &&
              register.CD_Registro_Academico === item.CD_Registro_Academico) ||
            (fuzzball.ratio(
              cleanString(item.NM_Aluno),
              cleanString(register.NM_Aluno),
            ) >= 90 &&
              register.CD_Registro_Academico === 'XXX')
          );
        });

        return [
          item.CD_Registro_Academico,
          item.CD_Unidade,
          item.NM_Aluno,
          existFDI ? 'Sim' : 'Não',
          existFDI ? existFDI.CD_Registro_Academico : '-',
          existFDI ? existFDI.NM_Unidade : '-',
          existFDI ? existFDI.NM_Aluno : '-',
        ];
      });
    console.log('---- END VERIFICATION ----');
    console.log(
      `Exists: ${dataRows.filter((item) => item[3] === 'Sim').length} `,
    );

    // Create a new Excel workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');

    // Add headers with custom styles
    worksheet.columns = headers.map((header, index) => ({
      header,
      key: header.replace(/ /g, '_'), // Replace spaces with underscores for keys
      width: 20,
      alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' }, // Set a minimum width of 15 or the header length + 5
    }));

    // Apply custom styles to the header row

    // Add data rows to the worksheet
    dataRows.forEach(
      (row) =>
        (worksheet.addRow(row).alignment = {
          wrapText: true,
          vertical: 'middle',
          horizontal: 'center',
        }),
    );

    worksheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'bdbdbd' },
        bgColor: { argb: '222222' },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true,
      };
      cell.border = {
        right: {
          style: 'medium',
          color: {
            argb: '222222',
          },
        },
        left: {
          style: 'medium',
          color: {
            argb: '222222',
          },
        },
        bottom: {
          style: 'medium',
          color: {
            argb: '222222',
          },
        },
        top: {
          style: 'medium',
          color: {
            argb: '222222',
          },
        },
      };
      cell.font = { bold: true };
    });

    // Define the file path to save the Excel file in the src folder
    const outputFilePath = path.join(
      __dirname,
      `../../src/${input.NM_Arquivo}.xlsx`,
    );
    await workbook.xlsx.writeFile(outputFilePath);

    console.log('Excel file generated at:', outputFilePath);
    return outputFilePath;
  }

  async parseTxtFile() {
    // Read the file content
    const filePath = path.join(__dirname, '../../src/RYAN/matriculas_2013.txt');

    // Read the text file as UTF-8
    const fileContent = this.readFileAsUtf8(filePath);

    // Split content into lines
    const lines = fileContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    // Skip the header lines (first two lines, which are column names and separators)
    const dataLines = lines.slice(2);

    // Initialize an array to store the parsed records
    const records: any[] = [];

    // Process each line and extract the values
    dataLines.forEach((line) => {
      // Split the line using regex to account for multiple spaces or tabs
      const parts = line.split(/\s{2,}|\t+/).filter(Boolean); // Match two or more spaces or tabs

      console.log('DocumentService ~ dataLines.forEach ~ parts:', parts);

      if (parts.length < 7) {
        // If we have fewer than 7 parts, try to pad the rest with empty values
        while (parts.length < 7) {
          parts.push('');
        }
      }

      // Create a record object from the parts
      const record = {
        MATRICULA: parts[0].split(' ')[0],
        COD_UNIDADE: parts[0].split(' ')[1],
        NM_UNIDADE: parts[1],
        COD_SERIE: parts[2],
        DS_SERIE: parts[3],
        NM_ALUNO: parts[4],
        CD_PERIODO_LETIVO: parts[5],
      };

      // Add the record to the array
      records.push(record);
    });

    return records;
  }
}
