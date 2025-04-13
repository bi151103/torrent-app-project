import express from 'express';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import cors from 'cors';
import { Torrent } from './models/Torrent';
import { TorrentPeer } from './models/TorrentPeer';
import { User } from './models/User';
import MessageType from './utils/MessageType';
import Event from './utils/Event';

dotenv.config();
const PORT = process.env.TRACKER_PORT || 8001;
const app = express();
app.use(cors());
app.use(express.json());

const server = app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));
const wss = new WebSocketServer({ server });

let torrentMap: Record<string, Torrent> = {};
const users: { [username: string]: User } = {
  'phuc.dang': {
    username: 'phuc.dang',
    password: 'phuc.dang'
  }
};

// announce: started
app.post('/' + MessageType.PUBLISH, (req, res) => {
  const { peerId, peerIp, peerPort, fileName, fileSize, pieceHashes, infoHash } = req.body;

  if (!peerId || !peerIp || !peerPort || !fileName || !fileSize || !pieceHashes || !infoHash) {
    res.status(400).send({
      type: MessageType.PUBLISH_FAIL,
      message: 'Missing required field'
    });
    return;
  }

  if (!Array.isArray(pieceHashes)) {
    res.status(400).send({
      type: MessageType.PUBLISH_FAIL,
      message: 'Invalid pieceHashes format.',
    });
    return;
  }

  if (torrentMap[infoHash]) {
    res.status(400).send({
      type: MessageType.PUBLISH_FAIL,
      message: 'Torrent with this infoHash already exists.',
    });
    return;
  }

  try {
    const torrentPeer = new TorrentPeer(peerId, peerIp, peerPort, 0, true);
    const torrent = new Torrent(infoHash, [{ name: fileName, size: fileSize, pieceHashes }], [torrentPeer]);

    torrentMap[infoHash] = torrent;

    // console.log(`Torrent registered: ${fileName} from ${peerId}`);

    // Gửi cập nhật đến tất cả WebSocket clients
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(JSON.stringify({
            type: MessageType.TORRENT_MAP,
            message: '',
            torrentMap,
          }));
        } catch (error) {
          console.error('Error sending WebSocket message:', error);
        }
      }
    });

    res.status(200).send({
      type: MessageType.PUBLISH_SUCCESS,
      message: 'Torrent published successfully.',
      fileName,
      fileSize,
      pieceHashes,
    });
  } catch (error) {
    console.error('Error creating torrent:', error);
    res.status(500).send({
      type: MessageType.PUBLISH_FAIL,
      message: 'Internal server error.',
    });
  }
});

// Xử lý WebSocket connections
wss.on('connection', (ws) => {
  // console.log('New peer connected');

  ws.on('message', (msg) => {
    const data = JSON.parse(msg.toString());

    if (data.type === MessageType.REGISTER) {
      // to be implemented
      const { username, password } = data;
      if (users[username]) {
        // Tên người dùng đã tồn tại
        ws.send(JSON.stringify({
          type: MessageType.REGISTER_FAIL,
          message: 'Account already exists'
        }));
      } else {
        // Đăng ký thành công
        users[username] = { username, password };
        ws.send(JSON.stringify({
          type: MessageType.REGISTER_SUCCESS,
          message: 'Registration successful! Please login.',
        }));
      }
    }
    else if (data.type === MessageType.SIGN_IN) {
      // to be implemented
      const { username, password } = data;
      const user = users[username];

      if (!user || user.password !== password) {
        ws.send(JSON.stringify({
          type: MessageType.LOGIN_FAIL,
          message: 'Username or password is incorrect'
        }));
      } else {
        // Đăng nhập thành công
        ws.send(JSON.stringify({
          type: MessageType.LOGIN_SUCCESS,
          message: 'Login successful',
        }));
      }
    }
    else if (data.type === MessageType.GET_FILES) {
      ws.send(JSON.stringify({ type: MessageType.TORRENT_MAP, message: '', torrentMap }));
      // console.log(`Joined peer: ${JSON.stringify(data)}`);
    }
    else if (data.type === MessageType.ANNOUNCE) {
      if (!data.event) {
        ws.send(JSON.stringify({ type: MessageType.ANNOUNCE_FAIL, message: 'Missing required field in announcing request'}));
      }
      else {
        if (data.event === Event.STARTED) {
          const peerId = data.peerId;
          const peerIp = data.peerIp;
          const peerPort = data.peerPort;
          const uploaded = data.uploaded;
          const infoHash = data.infoHash;
          const torrent = torrentMap[infoHash];
          if (torrent) {
            const peerExists = torrent.torrentPeers.some(peer => peer.peerId === peerId);
            if (!peerExists) {
              const torrentPeer = new TorrentPeer(peerId, peerIp, peerPort, uploaded, false);
              torrent.torrentPeers.push(torrentPeer);
              // Gửi cập nhật đến tất cả WebSocket clients
              wss.clients.forEach((client) => {
                if (client.readyState === client.OPEN) {
                  try {
                    client.send(JSON.stringify({
                      type: MessageType.TORRENT_MAP,
                      message: '',
                      torrentMap,
                    }));
                  } catch (error) {
                    console.error('Error sending WebSocket message:', error);
                  }
                }
              });
            }
            ws.send(JSON.stringify({ type: MessageType.STARTED_SUCCESS, message: '', torrent, infoHash }));
          } else {
            ws.send(JSON.stringify({ type: MessageType.STARTED_FAIL, message: 'No torrent was found with provided infohash' }));
          }
        }
        else if (data.event === Event.COMPLETED) {
          let isPeerFound = false;
          const peerId = data.peerId;
          const peerIp = data.peerIp;
          const peerPort = data.peerPort;
          for (const infoHash in torrentMap) {
            for (const torrentPeer of torrentMap[infoHash].torrentPeers) {
              if (torrentPeer.getPeerId() === peerId && torrentPeer.peerIp === peerIp && torrentPeer.peerPort === peerPort) {
                torrentPeer.isLeeching = false;
                torrentPeer.isSeeder = true;
                isPeerFound = true;
                break;
              }
            }
          }
          if (isPeerFound) {
            wss.clients.forEach((client) => {
              if (client.readyState === client.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: MessageType.TORRENT_MAP,
                    message: '',
                    torrentMap,
                  }));
                } catch (error) {
                  console.error('Error sending WebSocket message:', error);
                }
              }
            });
            ws.send(JSON.stringify({ type: MessageType.COMPLETED_SUCCESS, message: ''}));
          }
          else {
            ws.send(JSON.stringify({ type: MessageType.COMPLETED_FAIL, message: 'No peer found'}));
          }
        }
        else if (data.event === Event.REGULAR) {
          let isPeerFound = false;
          const peerId = data.peerId;
          const peerIp = data.peerIp;
          const peerPort = data.peerPort;
          const downloaded = data.downloaded;
          const fileSize = data.fileSize;
          const infoHash = data.infoHash;
          const { seedingPeerId, seedingPeerIp, seedingPeerPort } = data.seedingPeerInfo;
          for (const torrentPeer of torrentMap[infoHash].torrentPeers) {
            if (torrentPeer.getPeerId() === seedingPeerId && torrentPeer.peerIp === seedingPeerIp && torrentPeer.peerPort === seedingPeerPort) {
              torrentPeer.uploaded += downloaded;
              break;
            }
          }
          // for (const infoHash in torrentMap) {
          // }
          for (const torrentPeer of torrentMap[infoHash].torrentPeers) {
            if (torrentPeer.getPeerId() === peerId && torrentPeer.peerIp === peerIp && torrentPeer.peerPort === peerPort) {
              torrentPeer.downloaded += downloaded;
              if (torrentPeer.downloaded === fileSize) {
                torrentPeer.isLeeching = false;
                torrentPeer.isSeeder = true;
              }
              isPeerFound = true;
              break;
            }
          }
          // for (const infoHash in torrentMap) {
          // }
          if (isPeerFound) {
            wss.clients.forEach((client) => {
              if (client.readyState === client.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: MessageType.TORRENT_MAP,
                    message: '',
                    torrentMap,
                  }));
                } catch (error) {
                  console.error('Error sending WebSocket message:', error);
                }
              }
            });
            ws.send(JSON.stringify({ type: MessageType.REGULAR_SUCCESS, message: ''}));
          }
          else {
            ws.send(JSON.stringify({ type: MessageType.REGULAR_FAIL, message: 'No peer found'}));
          }
        }
        else if (data.event === Event.STOPPED) {
          const peerId = data.peerId;
          const infoHash = data.infoHash;
          // { type: MessageType.ANNOUNCE, peerId, infoHash, peerIp, peerPort, uploaded: joinedTorrents[infoHash].uploaded, downloaded: joinedTorrents[infoHash].downloaded, event: Event.STOPPED}
          const torrent = torrentMap[infoHash];
          if (torrent) {
            torrent.torrentPeers = torrent.torrentPeers.filter(peer => peer.getPeerId() !== peerId);
            wss.clients.forEach((client) => {
              if (client.readyState === client.OPEN) {
                try {
                  client.send(JSON.stringify({
                    type: MessageType.TORRENT_MAP,
                    message: '',
                    torrentMap,
                  }));
                } catch (error) {
                  console.error('Error sending WebSocket message:', error);
                }
              }
            });
            ws.send(JSON.stringify({ type: MessageType.STOPPED_SUCCESS, message: ''}));
          }
          else {
            ws.send(JSON.stringify({ type: MessageType.STOPPED_FAIL, message: 'No torrent was found with provided infohash' }));
          }
        }
        else {
          ws.send(JSON.stringify({ type: MessageType.ANNOUNCE_FAIL, message: 'Invalid announce event'}));
        }
      }
    }
    // else if (data.type === MessageType.LOGOUT) {
    else {
      
    }
  });

  ws.on('close', () => {
    // console.log('Peer disconnected');
  });
});