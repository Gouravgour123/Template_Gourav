// Import necessary modules
import crypto from 'crypto';
import { join, extname } from 'path';
import { URL } from 'url';
import fsPromises from 'fs/promises';
import multer from 'multer';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { appConfigFactory, storageConfigFactory } from '@Config'; // Import configuration factories
import { UtilsService } from './utils.service'; // Import utility service

@Injectable()
export class StorageService {
  diskDestination: string;
  defaultMulterOptions: MulterOptions;

  constructor(
    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>, // Inject app configuration
    @Inject(storageConfigFactory.KEY)
    private readonly config: ConfigType<typeof storageConfigFactory>, // Inject storage configuration
    private readonly utilsService: UtilsService, // Inject utility service
  ) {
    // Initialize disk destination from configuration
    this.diskDestination = this.config.diskDestination as string;
    // Define default Multer options
    this.defaultMulterOptions = {
      storage: multer.diskStorage({
        // Define destination and filename for uploaded files
        destination: this.diskDestination,
        filename: (req, file, cb) => {
          const extension = extname(file.originalname);
          const hash = crypto
            .createHash('md5')
            .update(file.originalname + this.utilsService.generateRandomToken())
            .digest('hex');
          cb(null, hash + extension);
        },
      }),
      // Define file size limit based on configuration
      limits: { fileSize: this.config.maxFileSize },
      // Define file filter based on allowed file extensions from configuration
      fileFilter: (req, file, cb) => {
        const extension = extname(file.originalname);
        if (this.config.fileExtensions.includes(extension)) {
          cb(null, true);
        } else {
          cb(
            new Error(
              `Unsupported file type, Only allowed ${this.config.fileExtensions.join(
                ', ',
              )}`,
            ),
            false,
          );
        }
      },
    };
    // Check permissions on disk destination directory
    this.checkPermissions();
  }

  // Check permissions on disk destination directory
  private async checkPermissions(): Promise<void> {
    await fsPromises.access(
      join(this.diskDestination),
      fsPromises.constants.W_OK | fsPromises.constants.R_OK,
    );
  }

  // Create a directory recursively
  async createDir(...path: string[]): Promise<void> {
    await fsPromises.mkdir(join(this.diskDestination, ...path), {
      recursive: true,
    });
  }

  // Remove a directory
  async removeDir(...path: string[]): Promise<void> {
    const dirPath = join(this.diskDestination, ...path);
    if (await this.exist(dirPath)) {
      return await fsPromises.rmdir(join(this.diskDestination, ...path));
    }
  }

  // Remove a file
  async removeFile(...path: string[]): Promise<void> {
    const filePath = join(this.diskDestination, ...path);
    if (await this.exist(filePath)) {
      return await fsPromises.unlink(join(this.diskDestination, ...path));
    }
  }

  // Check if a file or directory exists
  async exist(...path: string[]): Promise<boolean> {
    try {
      await fsPromises.access(join(this.diskDestination, ...path));
      return true;
    } catch (e) {
      if (e.code === 'ENOENT') {
        return false;
      }
      throw e;
    }
  }

  // Rename a file or directory
  async rename(oldPath: string, newPath: string): Promise<void> {
    return await fsPromises.rename(
      join(this.diskDestination, oldPath),
      join(this.diskDestination, newPath),
    );
  }

  // Move a file or directory to a new location
  async move(
    fileOrDir: string,
    newDirPath: string,
    currentDirPath = '',
  ): Promise<void> {
    const fileOrDirPath = join(currentDirPath, fileOrDir);
    if (
      !(await this.exist(fileOrDirPath)) &&
      !(await this.exist(join(newDirPath, fileOrDir)))
    ) {
      throw new Error(
        `No such file or directory exist, path ${join(
          this.diskDestination,
          fileOrDirPath,
        )}`,
      );
    }

    if (!(await this.exist(newDirPath))) {
      await this.createDir(newDirPath);
    }
    return await this.rename(
      join(currentDirPath, fileOrDir),
      join(newDirPath, fileOrDir),
    );
  }

  // Move multiple files or directories to a new location
  async moveAll(
    filesOrDirs: string[],
    newDirPath: string,
    currentDirPath = '',
  ): Promise<void> {
    if (!(await this.exist(newDirPath))) {
      await this.createDir(newDirPath);
    }

    await Promise.all(
      filesOrDirs.map(async (fileOrDir) => {
        const fileOrDirPath = join(currentDirPath, fileOrDir);
        if (
          !(await this.exist(fileOrDirPath)) &&
          !(await this.exist(join(newDirPath, fileOrDir)))
        ) {
          throw new Error(
            `No such file or directory exist, path ${join(
              this.diskDestination,
              fileOrDirPath,
            )}`,
          );
        }
      }),
    );

    await Promise.all(
      filesOrDirs.map((fileOrDir) =>
        this.rename(
          join(currentDirPath, fileOrDir),
          join(newDirPath, fileOrDir),
        ),
      ),
    );
  }

  // Get URL for a file
  getFileUrl(file: string, dir?: string): string {
    const filePath = join(this.diskDestination, dir || '', file);
    return new URL(filePath, this.appConfig.serverUrl).href;
  }
}
