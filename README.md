## HPTTS OCR Proxy Service (độc lập)

Service proxy nhỏ để frontend gọi OCR qua HTTPS (Vercel), rồi **forward** tiếp tới OCR backend (thường là HTTP trên VPS) để tránh Mixed Content / CORS.

### Endpoint

- `POST /api/ocr`
  - Body: `{ "image_url": "https://..." }`
  - Header tùy chọn: `x-api-key: <key>`
  - Response: JSON từ OCR backend (pass-through)
- `GET /api/health`

### Biến môi trường (Vercel)

- `OCR_BACKEND_URL`: ví dụ `http://<IP_VPS>:6123/ocr`
- `CORS_ALLOW_ORIGINS` (tùy chọn): danh sách origin cách nhau bởi dấu phẩy. Nếu để trống sẽ cho phép `*`.

### Deploy

1. Deploy thư mục `ocr-proxy-service` như một Vercel project riêng.
2. Set env variables trên Vercel.
3. Ở các app frontend:
   - Chatbot: `VITE_OCR_CCCD_URL=https://<your-ocr-proxy>.vercel.app/api/ocr`
   - App thi online: `VITE_OCR_CCCD_URL=https://<your-ocr-proxy>.vercel.app/api/ocr`

### Lưu ý mạng (quan trọng)

Nếu gặp lỗi `ECONNREFUSED`/`ETIMEDOUT`/`fetch failed`:
- VPS có thể đang chặn IP datacenter (Vercel). Cần mở firewall cho port OCR.
- Hoặc triển khai OCR backend qua HTTPS public + CORS và trỏ thẳng frontend tới backend (không cần proxy).

