import WebSocket, { WebSocketServer } from 'ws';
import net from 'net';
import fs from 'fs';
import path, { join } from 'path';
import crypto from 'crypto';
import MessageType from './utils/MessageType';

const clientPeerInfo: {
  peerId: string | null,
  peerIp: string | null,
  peerPort: string | null,
  peerConnection: WebSocket | null
} = {peerId: null, peerIp: null, peerPort: null, peerConnection: null};

let joinedTorrents: Record<string, {uploaded: number, downloaded: number, bitfield: boolean[]}> = {};

// Thư mục lưu file upload
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Kích thước chunk: 512KB
const PIECE_SIZE = 512 * 1024;
const BLOCK_SIZE = 16 * 1024;

// Tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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
    ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === MessageType.FILE_UPLOAD && message.peerId && message.fileName && message.clientPort && message.pieceHashes) {
          const expectedPort = serverPort - 2000;

          if (message.clientPort !== expectedPort) {
            ws.send(JSON.stringify({ type: MessageType.UPLOAD_FAIL, message: 'Invalid client port.' }));
            return;
          }

          const fileName = message.fileName;

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: MessageType.FILE_CHUNKED,
                fileName: fileName,
                chunkSize: PIECE_SIZE,
              }));
            }
          });

          ws.send(JSON.stringify({
            type: MessageType.UPLOAD_SUCCESS,
            message: '',
            fileName: fileName,
            pieceSize: PIECE_SIZE,
          }));
        }
        else if (message.type === MessageType.PEER_CONNECT && message.clientPeerInfo) {
          // Xử lý tin nhắn PEER_CONNECT
          const {peerId, peerIp, peerPort} = message.clientPeerInfo;
          // Lưu trữ kết nối WebSocket của peer
          clientPeerInfo.peerId = peerId;
          clientPeerInfo.peerIp = peerIp;
          clientPeerInfo.peerPort = peerPort;
          clientPeerInfo.peerConnection = ws;
          console.log(`Saved ${peerId}.`);

          ws.send(JSON.stringify({ type: MessageType.PEER_CONNECT_SUCCESS, message: 'Peer connect successfully' }));
        }
        else if (message.type === MessageType.ADD_NEW_JOINED_TORRENTS) {
          const infoHash = message.infoHash;
          const bitfieldLength = message.bitfieldLength;
          const isSeeder = message.isSeeder;
          
          let bitfield: boolean[] = [];
          for (let i = 0; i < bitfieldLength; i++) {
            bitfield[i] = (isSeeder) ? true : false;
          }

          joinedTorrents = {
            ...joinedTorrents,
            [infoHash]: {
              uploaded: 0,
              downloaded: 0,
              bitfield: bitfield,
            },
          };

          ws.send(JSON.stringify({ type: MessageType.ADD_NEW_JOINED_TORRENTS_SUCCESS, message: '', joinedTorrents }));
        }
        else if (message.type === MessageType.UPDATE_JOINED_TORRENTS) {
          const infoHash = message.infoHash;
          const currentJoinedTorrent = joinedTorrents[infoHash];
          joinedTorrents = {
            ...joinedTorrents,
            [infoHash]: {
              ...joinedTorrents[infoHash],
              uploaded: currentJoinedTorrent.uploaded += message.uploaded ? message.uploaded : 0,
              downloaded: currentJoinedTorrent.downloaded += message.downloaded ? message.downloaded : 0,
            },
          };
          
          if (message.downloaded) {
            ws.send(JSON.stringify({ type: MessageType.UPDATE_JOINED_TORRENTS_SUCCESS, message: '', joinedTorrents }));
          }
          else if (message.uploaded) {
            const clientPeerWs = clientPeerInfo.peerConnection;
            if (clientPeerWs) {
              clientPeerWs.send(JSON.stringify({ type: MessageType.UPDATE_JOINED_TORRENTS_SUCCESS, message: '', joinedTorrents }));
            }
          }
        }
        // else if (message.type === MessageType.PIECE_DOWNLOAD && message.fileName && message.pieceIndex !== undefined) {
        //   // Xử lý yêu cầu download piece cụ thể
        //   const fileName = message.fileName;
        //   const pieceIndex = message.pieceIndex;
        //   const peerId = clientPeerInfo.peerId;
      
        //   if (!peerId) {
        //     ws.send(JSON.stringify({ type: 'error', message: 'Peer ID not found' }));
        //     return;
        //   }
      
        //   const chunkPath = path.join(UPLOAD_DIR, peerId, 'chunks', fileName, `chunk_${pieceIndex}.bin`);
      
        //   fs.readFile(chunkPath, (err, chunkData) => {
        //     if (err) {
        //       console.error(`Error reading chunk ${pieceIndex} for ${fileName}:`, err);
        //       ws.send(JSON.stringify({ type: 'error', message: `Chunk ${pieceIndex} not found for ${fileName}` }));
        //       return;
        //     }
    
        //     ws.send(JSON.stringify({ type: 'piece_info', pieceSize: chunkData.length, pieceIndex: pieceIndex, seedingPeer: { peerId: clientPeerInfo.peerId, peerIp: clientPeerInfo.peerIp, peerPort: clientPeerInfo.peerPort } }));
    
        //     for (let i = 0; i < chunkData.length; i += BLOCK_SIZE) {
        //       const block = chunkData.slice(i, i + BLOCK_SIZE);
        //       ws.send(JSON.stringify({ type: 'block_data', blockIndex: i / BLOCK_SIZE, blockData: { type: 'Buffer', data: Array.from(block) }, pieceIndex: pieceIndex }));
        //     }
        //   });
        // }
        else if (message.type === MessageType.PIECE_DOWNLOAD && message.fileName && message.pieceIndex !== undefined) {
          // Xử lý yêu cầu download
          const fileName = message.fileName;
          const pieceIndex = message.pieceIndex;
          // console.log(pieceIndex);
          const peerId = clientPeerInfo.peerId;
        
          if (!peerId) {
            ws.send(JSON.stringify({ type: 'error', message: 'File not found' }));
            return;
          }
        
          const chunksDir = path.join(UPLOAD_DIR, peerId, 'chunks', fileName);
          const chunkFiles = fs.readdirSync(chunksDir)
            .filter(file => file.startsWith('chunk_'))
            .sort((a, b) => parseInt(a.split('_')[1].split('.')[0]) - parseInt(b.split('_')[1].split('.')[0]));
        
          const chunkBuffers: Buffer[] = [];
          let totalSize = 0;
        
          chunkFiles.forEach(chunkFile => {
            const chunkPath = path.join(chunksDir, chunkFile);
            // Kiểm tra xem chunkPath có phải là file không
            if (fs.statSync(chunkPath).isFile()) {
              const chunkData = fs.readFileSync(chunkPath);
              chunkBuffers.push(chunkData);
              totalSize += chunkData.length;
            } else {
              // console.warn(`Skipping directory: ${chunkPath}`);
            }
          });

          const filePath = path.join(UPLOAD_DIR, peerId, 'chunks', fileName, `chunk_${pieceIndex}.bin`);
        
          fs.readFile(filePath, (err, chunkData) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'error', message: 'Chunk not found' }));
              return;
            }
        
            ws.send(JSON.stringify({ type: 'piece_info', pieceSize: chunkData.length, pieceIndex: pieceIndex, seedingPeer: {peerId: clientPeerInfo.peerId, peerIp: clientPeerInfo.peerIp, peerPort: clientPeerInfo.peerPort} }));
        
            for (let i = 0; i < chunkData.length; i += BLOCK_SIZE) {
              const block = chunkData.slice(i, i + BLOCK_SIZE);
              ws.send(JSON.stringify({ type: 'block_data', blockIndex: i / BLOCK_SIZE, blockData: { type: 'Buffer', data: Array.from(block) }, pieceIndex: pieceIndex }));
            }
          });
        }
        else if (message.type === MessageType.PIECE_UPLOAD && message.peerId && message.fileName && message.infoHash && message.pieceIndex !== undefined && message.pieceData) {
          const peerId = clientPeerInfo.peerId;
          const fileName = message.fileName;
          const infoHash = message.infoHash;
          const pieceIndex = message.pieceIndex;
          const pieceDataBuffer = Buffer.from(message.pieceData);
          let isPieceUploadedSuccessfully = true;

          if (peerId) {
            const peerUploadDir = path.join(UPLOAD_DIR, peerId);
            // Tạo thư mục peer nếu chưa tồn tại
            if (!fs.existsSync(peerUploadDir)) {
              fs.mkdirSync(peerUploadDir, { recursive: true });
            }

            const fileChunksDir = path.join(peerUploadDir, 'chunks', fileName);
            if (!fs.existsSync(fileChunksDir)) {
              fs.mkdirSync(fileChunksDir, { recursive: true });
            }

            // const chunk = pieceDataBuffer;
            const chunkFileName = `chunk_${pieceIndex}.bin`;
            const chunkFilePath = path.join(fileChunksDir, chunkFileName);

            fs.writeFile(chunkFilePath, pieceDataBuffer, (err) => {
              if (err) {
                isPieceUploadedSuccessfully = false;
                // console.error(`Chunk ${chunkFileName} save error:`, err);
                ws.send(JSON.stringify({ type: MessageType.UPLOAD_FAIL, message: err.message }));
              }
              else {
                // Tính toán hash của chunk và so sánh với pieceHashes
                crypto.createHash('sha256').update(pieceDataBuffer).digest('hex');

                for (let j = 0; j < pieceDataBuffer.length; j += BLOCK_SIZE) {
                  const block = pieceDataBuffer.slice(j, j + BLOCK_SIZE);
                  const blockFileName = `block_${j / BLOCK_SIZE}.bin`;
                  const blockFilePath = path.join(fileChunksDir, `chunk_${pieceIndex}`, blockFileName);

                  // Tạo thư mục con cho chunk nếu chưa tồn tại
                  const chunkBlockDir = path.join(fileChunksDir, `chunk_${pieceIndex}`);
                  if (!fs.existsSync(chunkBlockDir)) {
                    fs.mkdirSync(chunkBlockDir, { recursive: true });
                  }

                  fs.writeFile(blockFilePath, block, (err) => {
                    if (err) {
                      isPieceUploadedSuccessfully = false;
                      // console.error(`Block ${blockFileName} save error:`, err);
                      ws.send(JSON.stringify({ type: MessageType.UPLOAD_FAIL, message: err.message }));
                    } else {
                      // // console.log(`Block ${blockFileName} saved.`);
                      // ... (lưu trữ thông tin block) ...
                    }
                  });
                }
              }
            });

            if (isPieceUploadedSuccessfully) {
              joinedTorrents[infoHash].bitfield[pieceIndex] = true;
              ws.send(JSON.stringify({
                type: MessageType.UPLOAD_SUCCESS,
                message: MessageType.UPLOAD_SUCCESS,
                fileName: fileName,
                size: pieceDataBuffer.length,
                blockSize: BLOCK_SIZE,
              }));
            }
            else {
              ws.send(JSON.stringify({ type: MessageType.UPLOAD_FAIL, message: 'An error happens durring uploading process' }));
            }
          }
          else {
            ws.send(JSON.stringify({ type: MessageType.UPLOAD_FAIL, message: 'ClientPeerId is invalid' }));
          }
        }
        else if (message.type === MessageType.HANDSHAKE && message.peerId && message.infoHash) {
          if (joinedTorrents[message.infoHash]) {
            ws.send(JSON.stringify({ type: MessageType.HANDSHAKE_SUCCESS, message: '', bitfield: joinedTorrents[message.infoHash].bitfield }));
          }
          else {
            ws.send(JSON.stringify({ type: MessageType.HANDSHAKE_FAIL, message: 'No torrent was found with provided infoHash' }));
          }
        }
        else if (message.type === MessageType.COMBINE_PIECES && message.peerId && message.fileName && message.infoHash) {
          const peerId = message.peerId;
          const fileName = message.fileName;
          const infoHash = message.infoHash;
          const fileChunksDir = path.join(UPLOAD_DIR, peerId, 'chunks', fileName);
          const combinedDir = path.join(__dirname, 'combined_files', fileName); // Thư mục cho các piece đã ghép
      
          if (!fs.existsSync(fileChunksDir)) {
            ws.send(JSON.stringify({ type: MessageType.COMBINE_FAIL, message: 'Chunk directory not found.' }));
            return;
          }
      
          if (!fs.existsSync(combinedDir)) {
            fs.mkdirSync(combinedDir, { recursive: true });
          }
      
          const numPieces = joinedTorrents[infoHash]?.bitfield?.length || 0;
      
          for (let pieceIndex = 0; pieceIndex < numPieces; pieceIndex++) {
            const pieceBlockDir = path.join(fileChunksDir, `chunk_${pieceIndex}`);
    
            if (fs.existsSync(pieceBlockDir)) {
              fs.readdir(pieceBlockDir, (err, blockFiles) => {
                if (err) {
                  console.error(`Error reading block directory for piece ${pieceIndex}:`, err);
                  ws.send(JSON.stringify({ type: MessageType.COMBINE_FAIL, message: `Error reading block directory for piece ${pieceIndex}: ${err.message}` }));
                  return;
                }

                const sortedBlockFiles = blockFiles
                  .filter(file => file.startsWith('block_') && file.endsWith('.bin'))
                  .sort((a, b) => parseInt(a.split('_')[1].split('.')[0]) - parseInt(b.split('_')[1].split('.')[0]));

                const blockBuffers: Buffer[] = [];

                sortedBlockFiles.forEach(blockFile => {
                  const blockFilePath = path.join(pieceBlockDir, blockFile);
                  try {
                    const blockData = fs.readFileSync(blockFilePath);
                    blockBuffers.push(blockData);
                  } catch (readErr) {
                    console.error(`Error reading block file for piece ${pieceIndex}:`, readErr);
                    ws.send(JSON.stringify({ type: MessageType.COMBINE_FAIL, message: `Error reading block file for piece ${pieceIndex}: ${(readErr as NodeJS.ErrnoException).message}` }));
                    return;
                  }
                });

                const combinedPieceBuffer = Buffer.concat(blockBuffers);
                const combinedPieceFilePath = path.join(combinedDir, `piece_${pieceIndex}.bin`);

                fs.writeFile(combinedPieceFilePath, combinedPieceBuffer, (writeErr) => {
                  if (writeErr) {
                      console.error(`Error writing combined piece ${pieceIndex}:`, writeErr);
                      ws.send(JSON.stringify({ type: MessageType.COMBINE_FAIL, message: `Error writing combined piece ${pieceIndex}: ${writeErr.message}` }));
                  } else {
                    // console.log(`Piece ${pieceIndex} combined successfully. Sending back to client.`);
                    // Đọc lại piece đã combine để gửi cho client
                    fs.readFile(combinedPieceFilePath, (readCombinedErr, combinedPieceData) => {
                      if (readCombinedErr) {
                        console.error(`Error reading combined piece ${pieceIndex} to send:`, readCombinedErr);
                        ws.send(JSON.stringify({ type: MessageType.COMBINE_FAIL, message: `Error reading combined piece ${pieceIndex} to send: ${(readCombinedErr as NodeJS.ErrnoException).message}` }));
                      } else {
                        // console.log(pieceIndex);
                        ws.send(JSON.stringify({
                          type: MessageType.COMBINE_BLOCKS_SUCCESS,
                          pieceIndex: pieceIndex,
                          pieceData: Array.from(combinedPieceData), // Gửi dữ liệu dưới dạng mảng byte
                        }));
                      }
                    });
                  }
                });
              });
            } else {
                // console.log(`Block directory for piece ${pieceIndex} not found.`);
                // Không gửi lỗi ở đây, có thể piece chưa được tải lên hoàn chỉnh
            }
          }
        }
        else {
          // console.log(`Received message: ${data.toString()}`);
        }
      } catch (error) {
        // console.error('Invalid JSON received:', error);
      }
    });

    ws.on('close', () => {
      // console.log('Peer disconnected.');
    });

    ws.on('error', (err: Error) => {
      // console.error('Error:', err);
    });
  });
};

// Cổng bắt đầu kiểm tra
let port = 9000;

// Kiểm tra nếu cổng bị chiếm và tăng cổng lên nếu cần thiết
const tryStartServer = (): void => {
  checkPortInUse(port, (isInUse: boolean) => {
    if (isInUse) {
      port++; // Tăng cổng lên 1
      tryStartServer(); // Thử lại với cổng mới
    } else {
      createWebSocketServer(port); // Tạo WebSocket server với cổng khả dụng
    }
  });
};

// Bắt đầu quá trình kiểm tra và khởi động server
tryStartServer();