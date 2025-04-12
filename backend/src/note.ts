import WebSocket, { WebSocketServer } from 'ws';
import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Thư mục lưu file upload
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CHUNKS_DIR = path.join(UPLOAD_DIR, 'chunks');

// Kích thước chunk 512KB
const CHUNK_SIZE = 512 * 1024;

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(CHUNKS_DIR)) {
  fs.mkdirSync(CHUNKS_DIR, { recursive: true });
}

// Hàm kiểm tra cổng có bị chiếm hay không
const checkPortInUse = (port: number, callback: (isInUse: boolean) => void): void => {
  const server = net.createServer()
    .on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        callback(true); // Cổng bị chiếm
      }
    })
    .on('listening', () => {
      server.close();
      callback(false); // Cổng không bị chiếm
    })
    .listen(port);
};

// Hàm để tạo WebSocket server
const createWebSocketServer = (serverPort: number): void => {
  const wss = new WebSocketServer({ port: serverPort }, () => {
    console.log(`WebSocket server is running on ws://localhost:${serverPort}`);
  });

  wss.on('connection', (ws: WebSocket) => {
    console.log('Peer connected.');

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'file_upload' && message.fileName && message.fileData && message.clientPort) {
          const expectedPort = serverPort - 2000;

          if (message.clientPort !== expectedPort) {
            console.log(`Rejected upload: Invalid client port ${message.clientPort}. Expected: ${expectedPort}`);
            ws.send(JSON.stringify({ type: 'upload_error', error: 'Invalid client port.' }));
            return;
          }

          const fileBuffer = Buffer.from(message.fileData, 'base64');
          const fileName = message.fileName;
          const fileChunksDir = path.join(CHUNKS_DIR, fileName);

          if (!fs.existsSync(fileChunksDir)) {
            fs.mkdirSync(fileChunksDir, { recursive: true });
          }

          // Phân mảnh file và lưu vào thư mục
          for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
            const chunk = fileBuffer.slice(i, i + CHUNK_SIZE);
            const chunkFileName = `chunk_${i / CHUNK_SIZE}.bin`;
            const chunkFilePath = path.join(fileChunksDir, chunkFileName);

            fs.writeFile(chunkFilePath, chunk, (err) => {
              if (err) {
                console.error(`Chunk ${chunkFileName} save error:`, err);
                ws.send(JSON.stringify({ type: 'upload_error', error: err.message }));
              }
            });
          }

          console.log(`File chunked and saved: ${fileName}`);

          // Thông báo đến tất cả clients
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'file_chunked',
                fileName: fileName,
                size: fileBuffer.length,
                chunkSize: CHUNK_SIZE,
              }));
            }
          });

          ws.send(JSON.stringify({
            type: 'upload_success',
            fileName: fileName,
            size: fileBuffer.length,
            chunkSize: CHUNK_SIZE,
          }));
        } else {
          console.log(`Received message: ${data.toString()}`);
        }
      } catch (error) {
        console.error('Invalid JSON received:', error);
      }
    });

    ws.on('close', () => {
      console.log('Peer disconnected.');
    });

    ws.on('error', (err: Error) => {
      console.error('Error:', err);
    });
  });
};

// Cổng bắt đầu kiểm tra
let port = 9000;

// Kiểm tra nếu cổng bị chiếm và tăng cổng lên nếu cần thiết
const tryStartServer = (): void => {
  checkPortInUse(port, (isInUse: boolean) => {
    if (isInUse) {
      console.log(`Port ${port} is already in use. Trying next port...`);
      port++; // Tăng cổng lên 1
      tryStartServer(); // Thử lại với cổng mới
    } else {
      createWebSocketServer(port); // Tạo WebSocket server với cổng khả dụng
    }
  });
};

// Bắt đầu quá trình kiểm tra và khởi động server
tryStartServer();