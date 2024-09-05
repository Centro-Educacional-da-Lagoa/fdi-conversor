import { PDFDocument } from 'pdf-lib';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import * as path from 'path';
import * as sharp from 'sharp'; // Package for image manipulation (converting JPEG to PDF)

interface DocumentObject {
  TX_Caminho_Documento: string;
  TX_Caminho_Documento_Linux: string;
  NM_Pasta: string | null;
  NM_Unidade: string;
  NR_Paginas: number;
  NM_Tabela: string;
  TX_Caminho: string;
  CD_Cache: number;
  CD_Registro_Academico: string;
  NM_Aluno: string;
}

@Processor('document')
export class DocumentProcessor {
  private readonly networkPath = '/mnt/share'; // Updated path

  @Process('convert')
  async handleConversion(
    job: Job<{ documentObject: DocumentObject; folderName: string }>,
  ): Promise<void> {
    const { documentObject, folderName } = job.data;

    // Determine the output folder path and ensure it exists
    const outputFolder = this.getOutputFolderPath(folderName);
    this.ensureFolderExists(outputFolder);

    // Get the PDF path for the current document
    const pdfPath = this.getPdfPath(documentObject, outputFolder);

    try {
      await this.convertToPdf(documentObject, pdfPath);
    } catch (error) {
      console.error(
        `Failed to convert ${documentObject.TX_Caminho_Documento_Linux} to PDF:`,
        error,
      );
    }
  }

  private async convertToPdf(
    docObject: DocumentObject,
    pdfPath: string,
  ): Promise<void> {
    try {
      console.log(
        `Converting series of TIFF and JPEG files to a single PDF: ${pdfPath}`,
      );

      // Extract the base path and initial file number
      const baseDir = path
        .dirname(docObject.TX_Caminho_Documento_Linux)
        .replace(/^['"]+|['"]+$/g, '');

      console.log('🚀 ~ DocumentProcessor ~ baseDir:', baseDir);
      const baseFileName = path.basename(
        docObject.TX_Caminho_Documento_Linux,
        path.extname(docObject.TX_Caminho_Documento_Linux),
      );

      let currentNumber = parseInt(baseFileName, 10); // Convert the file number to an integer

      // Create a new PDFDocument
      const pdfDoc = await PDFDocument.create();

      let allFilesExist = true; // Flag to track if all files exist

      // Process each file in the sequence
      for (let i = 0; i < docObject.NR_Paginas; i++) {
        const fileNumber = currentNumber.toString().padStart(8, '0');

        const tiffFilePath = `${baseDir}/${fileNumber}.tif`;
        const jpgFilePath = tiffFilePath.replace('.tif', '.jpg');

        let filePathToUse: string | null = null;

        // Check if the TIFF file exists
        if (existsSync(tiffFilePath)) {
          filePathToUse = tiffFilePath;
        }
        // If no TIFF, check for a JPEG file
        else if (existsSync(jpgFilePath)) {
          filePathToUse = jpgFilePath;
        }

        if (filePathToUse) {
          try {
            // Read the current file (TIFF or JPEG)
            const imageBuffer = await sharp(filePathToUse).toBuffer();
            const pageBuffer = await sharp(imageBuffer).jpeg().toBuffer();
            const image = await pdfDoc.embedJpg(pageBuffer);

            const page = pdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
              x: 0,
              y: 0,
              width: image.width,
              height: image.height,
            });

            console.log(`Added page from ${filePathToUse} to PDF.`);
          } catch (pageError) {
            console.error(
              `Error processing file ${filePathToUse}: ${pageError.message}`,
            );
            allFilesExist = false; // Set the flag to false if an error occurs
            break; // Stop processing if there's an error with the file
          }
        } else {
          console.warn(
            `File not found: ${tiffFilePath} or ${jpgFilePath}. Skipping...`,
          );
          allFilesExist = false; // Set the flag to false if any file is missing
          break; // Stop processing if a file is missing
        }

        // Increment the number for the next file
        currentNumber++;
      }

      if (allFilesExist) {
        // Serialize the PDFDocument to bytes
        const pdfBytes = await pdfDoc.save();

        // Write the bytes to a file
        writeFileSync(pdfPath, pdfBytes);

        console.log(`PDF created successfully: ${pdfPath}`);
      } else {
        // If any file was missing or there was an error, delete the partially created PDF
        if (existsSync(pdfPath)) {
          unlinkSync(pdfPath);
          console.log(`Deleted incomplete PDF: ${pdfPath}`);
        }
      }
    } catch (error) {
      console.error(
        `Error during series of TIFF and JPEG files to PDF conversion for ${docObject.TX_Caminho_Documento_Linux}: ${error.message}`,
      );
      // Ensure the PDF is deleted if an error occurs
      if (existsSync(pdfPath)) {
        unlinkSync(pdfPath);
        console.log(`Deleted incomplete PDF due to an error: ${pdfPath}`);
      }
      throw error;
    }
  }

  private getOutputFolderPath(folderName: string): string {
    return path.join(this.networkPath, folderName);
  }

  private ensureFolderExists(folderPath: string): void {
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
      console.log(`Created folder: ${folderPath}`);
    }
  }

  private getPdfPath(
    documentObject: DocumentObject,
    outputFolder: string,
  ): string {
    const fileName = `${
      documentObject.NM_Pasta ? `${documentObject.NM_Pasta} - ` : ''
    }${documentObject.NM_Unidade} - ${documentObject.NM_Aluno} - ${
      documentObject.CD_Registro_Academico
    } - ${documentObject.CD_Cache}-${documentObject.TX_Caminho}-${
      documentObject.NR_Paginas
    }`;
    return path.join(outputFolder, `${fileName}.pdf`);
  }
}
