/* eslint-disable prettier/prettier */
import {
  Controller,
  ParseFilePipeBuilder,           
  Post,                          
  UploadedFile,                 
  UseGuards,                    
  UseInterceptors,             
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express'; 
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiTags } from '@nestjs/swagger'; 
import { StorageService, File, JwtAuthGuard } from '@Common'; 

@Controller()                    // Declare this class as a controller
export class AppController {
  constructor(private readonly storageService: StorageService) { } 

  @ApiTags('Storage')           // Storage for Swagger documentation
  @ApiBearerAuth()              // Specify that JWT authentication is required for this endpoint
  @ApiConsumes('multipart/form-data') 
  @ApiBody({                   // Define the request body schema for Swagger documentation
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseGuards(JwtAuthGuard)    
  @UseInterceptors(FileInterceptor('file')) 
  @Post('upload')            
  upload(@UploadedFile(new ParseFilePipeBuilder().build()) file: File) { 
   
   
    return {
      url: this.storageService.getFileUrl(file.filename), // Generate the URL of the uploaded file using the storage service
      meta: {                                  
        originalname: file.originalname,       
        filename: file.filename,               
        mimetype: file.mimetype,               
        size: file.size,                      
      },
    };
  }
}
