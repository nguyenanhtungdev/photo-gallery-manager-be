import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

@Injectable()
export class StorageService {
  private readonly bucketName?: string
  private readonly s3Client?: S3Client

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION')
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY')
    const bucketName = this.configService.get<string>('S3_BUCKET_NAME')

    this.bucketName = bucketName

    if (region && accessKeyId && secretAccessKey && bucketName) {
      this.s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      })
    }
  }

  async getSignedUploadUrl(key: string, contentType: string, expiresIn = 600) {
    this.assertConfigured()

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    })

    return getSignedUrl(this.s3Client!, command, { expiresIn })
  }

  async getSignedViewUrl(key: string, expiresIn = 3600) {
    this.assertConfigured()

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })

    return getSignedUrl(this.s3Client!, command, { expiresIn })
  }

  async deleteObject(key: string) {
    this.assertConfigured()

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })

    await this.s3Client!.send(command)
  }

  private assertConfigured() {
    if (!this.bucketName || !this.s3Client) {
      throw new InternalServerErrorException('Missing AWS S3 configuration')
    }
  }
}
