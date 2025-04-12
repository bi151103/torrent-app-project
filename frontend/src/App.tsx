import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Torrent } from './models/Torrent';
import axios from 'axios';
import MessageType from './utils/MessageType';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import HomePage from './HomePage';
import { TorrentPeer } from './models/TorrentPeer';
import Event from './utils/Event';

const App: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [publishSuccessMessage, setPublishSuccessMessage] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [peerId, setPeerId] = useState<string | null>(null);
  const [peerIp, setPeerIp] = useState<string | null>(null);
  const [peerPort, setPeerPort] = useState<number | null>(null);
  const [torrentMap, setTorrentMap] = useState<Record<string, Torrent>>({});
  const [joinedTorrents, setJoinedTorrents] = useState<Record<string, {uploaded: number, downloaded: number, bitfield: boolean[]}>>({});
  const [trackerWs, setTrackerWs] = useState<WebSocket | null>(null);
  const [peerServerWs, setPeerServerWs] = useState<WebSocket | null>(null);
  const trackerWsRef = useRef<WebSocket | null>(null);
  const totalPieces = useRef(0);
  const currentFileName = useRef('');
  const currentTorrent = useRef<Torrent | null>(null);
  const joinedTorrentsRef = useRef(joinedTorrents);
  const fileDownloadStates = useRef(new Map());

  const getLocalIP = async (): Promise<string> => {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel(""); 
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(console.error);
  
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const ipMatch = event.candidate.candidate.match(
            /([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/
          );
          if (ipMatch && !ipMatch[1].startsWith("0.") && !ipMatch[1].startsWith("127.")) {
            resolve(ipMatch[1]);
            pc.close();
          }
        } else {
          resolve("127.0.0.1"); // Trả về localhost nếu không tìm thấy
        }
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && trackerWs && peerIp && peerPort) {
      const file = event.target.files[0];
  
      const maxSize = 210 * 1024 * 1024;

      if (file.size > maxSize) {
        setErrorMessage("File size exceeds 210MB. Please select a smaller file.");
        return; // Dừng việc xử lý file
      }

      // Tiếp tục xử lý nếu upload thành công
      const pieceSize = 512 * 1024;
      const numPieces = Math.ceil(file.size / pieceSize);      
      const pieceHashes: string[] = [];
      const infoHash = file.name;//temporarily set to file.name

      for (let i = 0; i < numPieces; i++) {
        const chunk = file.slice(i * pieceSize, (i + 1) * pieceSize);
        const buffer = await chunk.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        pieceHashes.push(hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""));
      }

      const peerServerWs = new WebSocket(`ws://localhost:${peerPort}`); // Kết nối WebSocket tới Server
  
      peerServerWs.onopen = () => {
        peerServerWs.send(
          JSON.stringify({
            type: MessageType.FILE_UPLOAD,
            peerId: peerId,
            fileName: file.name,
            clientPort: peerPort - 2000,
            pieceHashes: pieceHashes,
          })
        );

        peerServerWs.send(JSON.stringify({ type: MessageType.ADD_NEW_JOINED_TORRENTS, infoHash: infoHash, bitfieldLength: numPieces, isSeeder: true }));

        let currentPieceIndex = 0;

        const sendPiece = () => {
          if (currentPieceIndex < numPieces) {
            const chunk = file.slice(currentPieceIndex * pieceSize, (currentPieceIndex + 1) * pieceSize);

            const reader = new FileReader();
            reader.onload = () => {
              if (reader.result instanceof ArrayBuffer) {
                const pieceDataArray = Array.from(new Uint8Array(reader.result));
                peerServerWs.send(
                  JSON.stringify({
                    type: MessageType.PIECE_UPLOAD,
                    peerId: peerId,
                    infoHash: infoHash,
                    fileName: file.name,
                    pieceIndex: currentPieceIndex,
                    pieceData: pieceDataArray,
                    pieceSize: chunk.size,
                  })
                );
                currentPieceIndex++;
                sendPiece();
              }
            };
            reader.readAsArrayBuffer(chunk); // Đọc chunk dưới dạng ArrayBuffer
          }
        };

        sendPiece();
      };
  
      peerServerWs.onerror = (error) => {
        console.error("WebSocket error:", error);
        peerServerWs.close();
      };
  
      peerServerWs.onmessage = async (event) => {
        const response = JSON.parse(event.data);
  
        if (response.type === MessageType.UPLOAD_FAIL) {
          console.error("File upload failed:", response.message);
          peerServerWs.close();
          return; // Dừng tiến trình ngay lập tức nếu server trả về lỗi
        }
  
      };
      
      peerServerWs.onclose = () => {
        // console.log("WebSocket connection closed.");
      };
      
      const metadata = {
        peerId: peerId || "",
        peerIp,
        peerPort,
        fileName: file.name,
        fileSize: file.size,
        pieceHashes,
        infoHash: infoHash
      };
  
      try {
        const serverResponse = await axios.post("http://localhost:8001/" + MessageType.PUBLISH, metadata, {
          headers: { "Content-Type": "application/json" },
        });
  
        if (serverResponse.status === 200 && serverResponse.data.type === MessageType.PUBLISH_SUCCESS) {
          setPublishSuccessMessage("File uploaded successfully");
        } else {
          console.error("File uploaded fail:", serverResponse);
          setPublishSuccessMessage("File uploaded successfully");
        }
      } catch (error) {
        console.error("Error publishing torrent metadata:", error);
      }
    }
  };   

  const handleFileDownload = async (infoHash: string) => {
    const trackerWs = new WebSocket('ws://localhost:8001');
    trackerWs.onopen = () => {
      // Gửi peerId tới tracker
      trackerWs.send(JSON.stringify({ type: MessageType.ANNOUNCE, peerId, infoHash, peerIp, peerPort, uploaded: 0, downloaded: 0, event: Event.STARTED}));
      trackerWs.onmessage = (message) => {
        const data = JSON.parse(message.data);
        
        if (data.type === MessageType.STARTED_SUCCESS) {
          const torrentData = data.torrent;
    
          // Chuyển đổi dữ liệu torrentPeers thành mảng TorrentPeer
          const torrentPeers = torrentData.torrentPeers.map(
            (peer: {
                peerId: string,
                peerIp: string,
                peerPort: number,
                isLeaching: boolean,
                isSeeder: boolean,
                downloaded: number,
                uploaded: number
              }) =>
              new TorrentPeer(
                peer.peerId,
                peer.peerIp,
                peer.peerPort,
                peer.uploaded,
                peer.isSeeder
              )
          );
    
          // Tạo đối tượng Torrent
          const torrent = new Torrent(
            torrentData.infoHash,
            torrentData.files.map(
              (file: {
                fileName: string;
                fileSize: number;
                pieces: { index: number; hash: string; size: number }[];
              }) => ({
                name: file.fileName,
                size: file.fileSize,
                pieceHashes: file.pieces.map((piece) => piece.hash), // Lấy hash để tạo string[]
              })
            ),
            torrentPeers
          );
    
          fileDownloadStates.current.set(infoHash, {
            receivedCombinedPieces: {},
            numberOfReceivedCombinedPieces: 0,
            totalPieces: torrent.getFiles()[0].pieces.length,
            currentFileName: torrent.getFiles()[0].fileName,
            currentTorrent: torrent,
          });
          currentTorrent.current = torrent;
          currentFileName.current = torrent.getFiles()[0].fileName;
          totalPieces.current = torrent.getFiles()[0].pieces.length;

          let bitfield: boolean[] = [];
          if (joinedTorrentsRef.current[infoHash]) {
            bitfield = joinedTorrentsRef.current[infoHash].bitfield;
          }
          else {
            const bitfieldLength = torrent.files[0].pieces.length;
            for (let i = 0; i < bitfieldLength; i++) {
              bitfield[i] = false;
            }
            setJoinedTorrents((prevJoinedTorrents) => ({
              ...prevJoinedTorrents,
              [torrent.getInfoHash()]: {uploaded: 0, downloaded : 0, bitfield: bitfield},
            }));
            if (peerServerWs && peerServerWs.readyState === WebSocket.OPEN) {
              peerServerWs.send(JSON.stringify({ type: MessageType.ADD_NEW_JOINED_TORRENTS, infoHash: infoHash, bitfieldLength, isSeeder: false }));
            }
          }

          const fileName = torrent.getFiles()[0].fileName;
          const fileSize = torrent.getFiles()[0].fileSize;
          // console.log('infoHash: ', infoHash ,', fileSize: ', fileSize);

          // console.log(torrent);

          const peers = torrent.torrentPeers || []

          if (peers.length === 0) {
            setErrorMessage("No available peers for this file");
            return;
          }

          const handshakePromises: Promise<boolean>[] = [];
          const listOfBitfieldOfOtherPeerInTorrent: (boolean[])[] = [];
          const listOfOtherPeerWsInTorrent: ({webSocket: WebSocket, seedingPeerInfo: {seedingPeerId: string, seedingPeerIp: string, seedingPeerPort: number}})[] = [];
          peers.forEach((seedingPeer) => {
            if (seedingPeer.peerPort !== peerPort) {
              const newPeerServerWs = new WebSocket(`ws://${seedingPeer.peerIp}:${seedingPeer.peerPort}`);
              listOfOtherPeerWsInTorrent.push({webSocket: newPeerServerWs, seedingPeerInfo: {seedingPeerId: seedingPeer.getPeerId(), seedingPeerIp: seedingPeer.peerIp, seedingPeerPort: seedingPeer.peerPort}});

              const handshakePromise = new Promise<boolean>((resolve) => {
                newPeerServerWs.onopen = () => {
                  newPeerServerWs.send(JSON.stringify({
                    type: MessageType.HANDSHAKE,
                    infoHash: torrent.getInfoHash(),
                    peerId: peerId,
                  }));
    
                  newPeerServerWs.onmessage = async (message) => {
                    const data = JSON.parse(message.data);
    
                    if (data.type === MessageType.HANDSHAKE_SUCCESS) {
                      // console.log(`Handshake successful with peer ${seedingPeer.peerId}`);
                      const bitfield = data.bitfield;
                      listOfBitfieldOfOtherPeerInTorrent.push(bitfield);
                      resolve(true);
                    } else {
                      // Xử lý các loại message khác (piece, have, v.v.)
                    }
                  }
    
                  newPeerServerWs.onerror = (error) => {
                    console.error(`WebSocket error with peer ${seedingPeer.peerId}:`, error);
                    newPeerServerWs.close();
                  };
              
                  newPeerServerWs.onclose = () => {
                  };
                };
              });
              handshakePromises.push(handshakePromise);
            }
          });

          Promise.all(handshakePromises).then(() => {
            const seedingPeerWs: ({webSocket: WebSocket, seedingPeerInfo: {seedingPeerId: string, seedingPeerIp: string, seedingPeerPort: number}} | null)[] = [];
            for (let pieceIndex = 0; pieceIndex < bitfield.length; pieceIndex++) {
              seedingPeerWs[pieceIndex] = null;
            }
            for (let i = 0; i < listOfBitfieldOfOtherPeerInTorrent.length; i++) {
              const anotherBitfield = listOfBitfieldOfOtherPeerInTorrent[i];
              for (let pieceIndex = 0; pieceIndex < anotherBitfield.length; pieceIndex++) {
                if (anotherBitfield[pieceIndex]) {
                  if (seedingPeerWs[pieceIndex] == null) {
                    seedingPeerWs[pieceIndex] = listOfOtherPeerWsInTorrent[i];
                  }
                }
              }
            }
  
            let i = 0;
            let numberOfReceivedValidPiece = 0;
            for (let j = 0; j < bitfield.length; j++) {
              if (bitfield[j] === true) {
                numberOfReceivedValidPiece++;
              }
            }

            const downloadPromises: Promise<void>[] = []; // Mảng chứa các Promise của việc tải các piece

            for (let pieceIndex = 0; pieceIndex < bitfield.length; pieceIndex++) {
              if (i >= 120) {
                break;
              }
              if (bitfield[pieceIndex] === true) {
                continue;
              }
              i++;
              const newPeerServerWss = seedingPeerWs[pieceIndex];
              if (newPeerServerWss) {
                const newPeerServerWs = newPeerServerWss.webSocket;
                newPeerServerWs.send(JSON.stringify({ type: MessageType.PIECE_DOWNLOAD, fileName, pieceIndex: pieceIndex }));

                const receivedPieces: Record<number, Uint8Array> = {};
                const pieceSizes: Record<number, number> = {};
                const receivedBlockFlags: Record<number, boolean[]> = {};

                let timeout: NodeJS.Timeout | null = null;

                const downloadPromise = new Promise<void>((resolve) => {
                  newPeerServerWs.onmessage = async (message) => {
                    if (timeout) {
                      clearTimeout(timeout);
                    }
                    const data = JSON.parse(message.data);

                    await new Promise(resolve => setTimeout(resolve, 10000));

                    if (data.type === "piece_info") {
                      pieceSizes[data.pieceIndex] = data.pieceSize;
                      receivedPieces[data.pieceIndex] = new Uint8Array(data.pieceSize);
                      const blockCount = Math.ceil(data.pieceSize / (16 * 1024));
                      receivedBlockFlags[data.pieceIndex] = new Array(blockCount).fill(false);
                    }

                    if (data.type === "block_data") {
                      if (!pieceSizes[data.pieceIndex]) {
                        console.warn(`Received block_data for piece ${data.pieceIndex} before piece_info.`);
                        return;
                      }

                      if (!receivedPieces[data.pieceIndex]) {
                        receivedPieces[data.pieceIndex] = new Uint8Array(pieceSizes[data.pieceIndex]);
                      }
                      receivedPieces[data.pieceIndex].set(new Uint8Array(data.blockData.data), data.blockIndex * (16 * 1024));
                      receivedBlockFlags[data.pieceIndex][data.blockIndex] = true;

                      const receivedBlockCountForPiece = receivedBlockFlags[data.pieceIndex].filter(flag => flag).length;
                      const totalBlockCountForPiece = Math.ceil(pieceSizes[data.pieceIndex] / (16 * 1024));

                      if (receivedBlockCountForPiece === totalBlockCountForPiece) {
                        const hashBuffer = await window.crypto.subtle.digest('SHA-256', receivedPieces[data.pieceIndex]);
                        const hashArray = Array.from(new Uint8Array(hashBuffer));
                        const pieceHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                        const serverPieceHash = torrent && torrent.getFiles() && torrent.getFiles()[0] && torrent.getFiles()[0].pieces && torrent.getFiles()[0].pieces[data.pieceIndex]?.hash;

                        if (serverPieceHash && pieceHash === serverPieceHash) {
                          numberOfReceivedValidPiece++;

                          if (peerServerWs && peerServerWs.readyState === WebSocket.OPEN) {
                            peerServerWs.send(JSON.stringify({
                              type: MessageType.PIECE_UPLOAD,
                              peerId: peerId,
                              infoHash: infoHash,
                              fileName: fileName,
                              pieceIndex: data.pieceIndex,
                              pieceData: Array.from(receivedPieces[data.pieceIndex]),
                            }));
                            trackerWs.send(JSON.stringify({ type: MessageType.ANNOUNCE, peerId, infoHash, peerIp, peerPort, downloaded: pieceSizes[data.pieceIndex], seedingPeerInfo: newPeerServerWss.seedingPeerInfo, fileSize: fileSize, event: Event.REGULAR}));
                          }


                          setJoinedTorrents((prevJoinedTorrents) => ({
                            ...prevJoinedTorrents,
                            [torrent.getInfoHash()]: {
                              ...prevJoinedTorrents[torrent.getInfoHash()],
                              downloaded: pieceSizes[data.pieceIndex],
                            },
                          }));

                          if (peerServerWs && peerServerWs.readyState === WebSocket.OPEN) {
                            peerServerWs.send(JSON.stringify({ type: MessageType.UPDATE_JOINED_TORRENTS, infoHash: infoHash, downloaded: pieceSizes[data.pieceIndex] }));
                          }

                          if (newPeerServerWs && newPeerServerWs.readyState === WebSocket.OPEN) {
                            newPeerServerWs.send(JSON.stringify({ type: MessageType.UPDATE_JOINED_TORRENTS, infoHash: infoHash, uploaded: pieceSizes[data.pieceIndex] }));
                          }

                          if (numberOfReceivedValidPiece === torrent.getFiles()[0].pieces.length) {
                            console.log("All pieces downloaded and verified. Sending COMBINE_PIECES request to server.");
                            setTimeout(() => {
                              if (peerServerWs && peerServerWs.readyState === WebSocket.OPEN) {
                                peerServerWs.send(JSON.stringify({
                                  type: MessageType.COMBINE_PIECES,
                                  peerId: peerId,
                                  infoHash: infoHash,
                                  fileName: fileName,
                                }));
                              }
                            }, 5000);
                            if (trackerWs && trackerWs.readyState === WebSocket.OPEN) {
                              trackerWs.send(JSON.stringify({ type: MessageType.ANNOUNCE, peerId, infoHash, peerIp, peerPort, event: Event.COMPLETED}));
                            }
                          }
                          resolve();
                        }
                      }
                    }
                  };
                  timeout = setTimeout(() => {
                    newPeerServerWs.close();
                    resolve();
                  }, 50000);
                });
                downloadPromises.push(downloadPromise);
              }
            }

            Promise.all(downloadPromises).then(() => {
              // console.log("joinedTorrentsRef.current trước khi gọi lại handleFileDownload:", joinedTorrentsRef.current);
              if (numberOfReceivedValidPiece !== torrent.getFiles()[0].pieces.length) {
                // console.log(joinedTorrents);
                handleFileDownload(infoHash);
              }
            });
          });
        } else if (data.type === MessageType.STARTED_FAIL) {
          setErrorMessage(data.message);
        }
      };
    };
  };

  //thêm hàm handle Logout
  const handleLogout = () => {
    if (trackerWs && peerServerWs && trackerWs.readyState === WebSocket.OPEN && peerServerWs.readyState === WebSocket.OPEN && peerId) {
      for (const infoHash in joinedTorrents) {
        trackerWs.send(JSON.stringify({ type: MessageType.ANNOUNCE, peerId, infoHash, peerIp, peerPort, uploaded: joinedTorrents[infoHash].uploaded, downloaded: joinedTorrents[infoHash].downloaded, event: Event.STOPPED}));
      }
      peerServerWs.close();
      setPeerServerWs(null);
      setIsLoggedIn(false);
    }
  };

  useEffect(() => {
    // console.log(torrentMap);
  }, [torrentMap]); // This will log whenever `torrentMap` changes

  useEffect(() => {
    joinedTorrentsRef.current = joinedTorrents;
    // console.log(joinedTorrents);
  }, [joinedTorrents]); // This will log whenever `joinedTorrents` changes
 
  useEffect(() => {
    const newPeerId = `peer-${Math.random().toString(36).substr(2, 9)}`;
    setPeerId(newPeerId);
    const currentPort = window.location.port ? parseInt(window.location.port) : 80;  // Giả sử mặc định là 80
    setPeerPort(currentPort + 2000);  // Cộng thêm 2000 vào port hiện tại
    getLocalIP().then(ip => setPeerIp(ip));

    if (!trackerWsRef.current) { // Kiểm tra nếu trackerWs chưa được tạo
      trackerWsRef.current = new WebSocket('ws://localhost:8001');
      setTrackerWs(trackerWsRef.current);
    }

    const currentTrackerWs = trackerWsRef.current; // Lưu trữ tham chiếu cục bộ

    if (currentTrackerWs) {
      return () => {
        // Cleanup function: đóng kết nối WebSocket cũ
        if (currentTrackerWs.readyState === WebSocket.OPEN) {
          currentTrackerWs.close();
        }
      };
    }
  }, []);

  useEffect(() => {
    if (trackerWs && isLoggedIn && peerId && peerIp && peerPort) {
      const newPeerServerWs = new WebSocket(`ws://localhost:${peerPort}`);

      setPeerServerWs(newPeerServerWs);

      newPeerServerWs.onopen = () => {
        // Gửi peerId tới server peerPort
        newPeerServerWs.send(JSON.stringify({ type: MessageType.PEER_CONNECT, clientPeerInfo: {peerId, peerIp, peerPort }}));
      };

      trackerWs.send(JSON.stringify({ type: MessageType.GET_FILES, peerId, peerIp: peerIp, peerPort: (peerPort ? peerPort - 2000 : peerPort) }));

      return () => {
        if (newPeerServerWs && newPeerServerWs.readyState === WebSocket.OPEN) {
          newPeerServerWs.close();
        }
      };
    }
  }, [trackerWs, peerId, peerIp, peerPort, isLoggedIn]);

  useEffect(() => {
    if (trackerWs) {
      trackerWs.onmessage = (message) => {
        const data = JSON.parse(message.data);
  
        if (data.type === MessageType.REGISTER_SUCCESS) {
          setErrorMessage(data.message);
          setIsRegistering(false); // Chuyển về form đăng nhập sau khi đăng ký thành công
        } else if (data.type === MessageType.REGISTER_FAIL) {
          setErrorMessage(data.message);
        } else if (data.type === MessageType.LOGIN_SUCCESS) {
          setIsLoggedIn(true);
        } else if (data.type === MessageType.LOGIN_FAIL) {
          setErrorMessage(data.message);
        } else if (data.type === MessageType.TORRENT_MAP) {
          // Chuyển đổi data.torrentMap thành các đối tượng Torrent
          const transformedTorrentMap: Record<string, Torrent> = Object.keys(data.torrentMap).reduce((acc, infoHash) => {
            const torrentData = data.torrentMap[infoHash];
            
            // Tạo một đối tượng Torrent từ dữ liệu
            const torrent = new Torrent(
              torrentData.infoHash,
              torrentData.files.map((file: { fileName: string; fileSize: number; pieces: any[] }) => ({
                name: file.fileName,
                size: file.fileSize,
                pieceHashes: file.pieces.map(piece => piece.hash),  // Chỉ lấy hash của các phần trong file
              })),
              torrentData.torrentPeers.map((peer: { uploaded: number; downloaded: number; peerId: string; isSeeder: boolean; isLeeching: boolean, peerIp: string, peerPort: number }) => ({
                peerId: peer.peerId,
                uploaded: peer.uploaded,
                downloaded: peer.downloaded,
                isSeeder: peer.isSeeder,
                isLeeching: peer.isLeeching,
                peerIp: peer.peerIp,
                peerPort: peer.peerPort
              }))
            );
      
            acc[infoHash] = torrent;
            return acc;
          }, {} as Record<string, Torrent>);
      
          setTorrentMap(transformedTorrentMap);
        } else if (data.type === MessageType.STARTED_SUCCESS) {
        } else if (data.type === MessageType.STARTED_FAIL) {
        } else if (data.type === MessageType.COMPLETED_SUCCESS) {
        } else if (data.type === MessageType.COMPLETED_FAIL) {
        } else if (data.type === MessageType.STOPPED_SUCCESS) {
        } else if (data.type === MessageType.STOPPED_FAIL) {
        } else if (data.type === MessageType.LOGOUT_SUCCESS) {
        }
        else {
          // console.log('else');
        }
      };
    }
  }, [trackerWs]);

  useEffect(() => {
    if (peerServerWs) {
      peerServerWs.onmessage = (message) => {
        const data = JSON.parse(message.data);
  
        if (data.type === MessageType.PEER_CONNECT_SUCCESS) {

        }
        else if (data.type === MessageType.PEER_CONNECT_FAIL) {

        }
        else if (data.type === MessageType.UPDATE_JOINED_TORRENTS_SUCCESS || data.type === MessageType.ADD_NEW_JOINED_TORRENTS_SUCCESS) {
          const transformedJoinedTorrents: Record<string, {uploaded: number, downloaded: number, bitfield: boolean[]}> = Object.keys(data.joinedTorrents).reduce((acc, infoHash) => {
            const joinedTorrent = data.joinedTorrents[infoHash];
            
            acc[infoHash] = {uploaded: joinedTorrent.uploaded, downloaded: joinedTorrent.downloaded, bitfield: joinedTorrent.bitfield};
            return acc;
          }, {} as Record<string, {uploaded: number, downloaded: number, bitfield: boolean[]}>);
          
          setJoinedTorrents(transformedJoinedTorrents);
          // console.log(joinedTorrents);
        } else if (data.type === MessageType.COMBINE_BLOCKS_SUCCESS) {
          const pieceIndex = data.pieceIndex;
          const pieceData = data.pieceData;
          const infoHash = currentTorrent.current?.getInfoHash(); // Lấy infoHash từ currentTorrent
  
          if (infoHash) {
            const fileState = fileDownloadStates.current.get(infoHash);
            if (fileState) {
              // console.log(`Received combined piece ${pieceIndex} from server for ${infoHash}.`);
              fileState.receivedCombinedPieces[pieceIndex] = new Uint8Array(pieceData);
              fileState.numberOfReceivedCombinedPieces++;
  
              if (fileState.numberOfReceivedCombinedPieces === fileState.totalPieces) {
                console.log(`All combined pieces received from server for ${infoHash}. Combining file on client and downloading.`);
                const combinedFileBuffer = new Uint8Array(fileState.currentTorrent.getFiles()[0].fileSize);
                let offset = 0;
                for (let i = 0; i < fileState.totalPieces; i++) {
                  if (fileState.receivedCombinedPieces[i]) {
                    combinedFileBuffer.set(fileState.receivedCombinedPieces[i], offset);
                    offset += fileState.receivedCombinedPieces[i].length;
                  } else {
                    console.error(`Missing combined piece ${i} for ${infoHash}`);
                    return;
                  }
                }
  
                const blob = new Blob([combinedFileBuffer]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileState.currentFileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                console.log(`File ${fileState.currentFileName} downloaded successfully from server.`);
  
                // Reset trạng thái sau khi tải xong
                fileDownloadStates.current.delete(infoHash);
              }
            }
          }
        }
      };
    }
  }, [peerServerWs]);

  return (
    <div className="App">
      <h1>Torrent App</h1>
      {!isLoggedIn ? (
        isRegistering ? (
          <RegisterPage
            trackerWs={trackerWs}
            peerIp={peerIp}
            peerPort={peerPort}
            onLoginClick={() => setIsRegistering(false)}
            onErrorMessage={setErrorMessage}
          />
        ) : (
          <LoginPage
            trackerWs={trackerWs}
            peerIp={peerIp}
            peerPort={peerPort}
            onErrorMessage={setErrorMessage}
            onRegisterClick={() => setIsRegistering(true)}
          />
        )
      ) : (
        <HomePage
          peerId={peerId}
          torrentMap={torrentMap}
          handleFileUpload={handleFileUpload}
          handleFileDownload={handleFileDownload}
          handleLogout={handleLogout}
          joinedTorrents={joinedTorrents}
        />
      )}
      {errorMessage && <p style={{ color: 'red' }}>{errorMessage}</p>}
      {publishSuccessMessage && <p style={{ color: 'green' }}>{publishSuccessMessage}</p>}
    </div>
  );
};

export default App;