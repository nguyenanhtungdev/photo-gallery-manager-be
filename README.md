# Photo Gallery Manager Backend

Backend API cho hệ thống `photo-gallery-manager`, xây bằng NestJS + MongoDB.

## Tính năng chính

- Xác thực người dùng bằng JWT
- Phân quyền `admin` và `user`
- Quản lý project, ảnh, trạng thái thanh toán
- Link share gallery public theo `shareToken`
- Realtime qua WebSocket cho:
  - cập nhật gallery share
  - thông báo người dùng
- Upload ảnh qua presigned URL của AWS S3
- Dashboard cho user và admin
- Thông báo khi:
  - có người xem gallery share
  - project được tạo
  - trạng thái thanh toán thay đổi

## Stack

- NestJS
- MongoDB + Mongoose
- Socket.IO
- AWS S3
- Nodemailer

## Yêu cầu

- Node.js 20+
- MongoDB
- AWS S3 bucket

## Cài đặt

```bash
npm install
```

## Biến môi trường

Tạo file `.env` trong thư mục `photo-gallery-manager-be`.

### Bắt buộc tối thiểu

```env
PORT=3001
DATABASE_URL=mongodb://127.0.0.1:27017/photo-gallery-manager
API_KEY=your-api-key
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
ALLOWED_ORIGINS=http://localhost:3000
```

### AWS S3

```env
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name
```

### Mail

Có thể dùng SMTP thường:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-password
MAIL_FROM=your-email@gmail.com
```

Hoặc Gmail app password:

```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-password
MAIL_FROM=your-email@gmail.com
```

### Tuỳ chọn thêm

```env
JWT_REMEMBER_SECRET=your-remember-secret
JWT_REMEMBER_EXPIRES_IN=30d
NODE_ENV=development
```

## Chạy local

```bash
npm run dev
```

API mặc định chạy tại:

```txt
http://localhost:3001/api
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

Script hỗ trợ:

```bash
npm run seed:admin
npm run backfill:user-role
```

## Lưu ý quan trọng

- Mọi request HTTP đều phải có header `x-api-key`
- API dùng global prefix `/api`
- CORS được kiểm soát bởi `ALLOWED_ORIGINS`
- Nếu thiếu cấu hình S3, các API upload/xem ảnh signed URL sẽ lỗi
- Route public gallery share vẫn đi qua `API_KEY`

## Cấu trúc module

```txt
src/
  auth/            Xác thực, đăng nhập, đăng ký, đổi mật khẩu
  common/          Middleware dùng chung
  dashboard/       Dashboard user/admin
  database/        Kết nối MongoDB
  notifications/   Notification REST + realtime
  projects/        Project, photo, payment, share gallery
  storage/         AWS S3 signed URL
```

## Realtime

Backend đang dùng 2 namespace WebSocket:

- `/notifications`
- `/project-share`

Mỗi kết nối đều cần `apiKey` trong handshake.

## Admin

Admin có thể:

- xem dashboard tổng quan hệ thống
- quản lý users
- quản lý toàn bộ projects qua nhánh API admin

## Troubleshooting

### `Missing DATABASE_URL in environment variables`

Thiếu biến `DATABASE_URL` trong `.env`.

### `API key không hợp lệ`

Frontend và backend đang dùng khác giá trị `API_KEY`.

### `Missing AWS S3 configuration`

Thiếu một trong các biến:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

### `Cannot find module '@nestjs/websockets'`

Thử cài lại dependency trong thư mục backend:

```bash
npm install
```

Nếu vẫn lỗi, xoá `node_modules` và cài lại sạch.
