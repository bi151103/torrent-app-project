import React from 'react';
import { Torrent } from './models/Torrent';
import TorrentInfo from './TorrentInfo';

interface HomePageProps {
  peerId: string | null;
  torrentMap: Record<string, Torrent>;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleFileDownload: (infoHash: string) => Promise<void>;
  handleLogout: () => void;
  joinedTorrents: Record<string, {
    uploaded: number;
    downloaded: number;
    bitfield: boolean[];
  }>;
}

const HomePage: React.FC<HomePageProps> = ({ peerId, torrentMap, handleFileUpload, handleFileDownload, handleLogout, joinedTorrents }) => {
  return (
    <div>
      <h2>Connected as {peerId}</h2>
      <h3>Files Being Shared</h3>
      <ul>
        {Object.keys(torrentMap).length > 0 ? (
          Object.keys(torrentMap).map((infoHash) => {
            const torrent = torrentMap[infoHash];
            const files = torrent.getFiles();
            return (
              <div key={infoHash}>
              <h3>Torrent: {infoHash}</h3>
              <ul>
                {files.length > 0 ? (
                  files.map((file, index) => (
                    <li key={index}>
                      <button onClick={async () => handleFileDownload(torrent.getInfoHash())}>
                        Download {file.fileName}
                      </button>
                    </li>
                    ))
                  ) : (
                    <li>No files available</li>
                  )}
                </ul>
              </div>
            );
          })
        ) : (
          <li>No torrents available</li>
        )}
      </ul>
      <h3>Upload File</h3>
      <input type="file" onChange={handleFileUpload} />
      <button onClick={handleLogout}>Logout</button>

      {/* Hiển thị thông tin torrent đang tải */}
      <div>
        <h3>Downloading Torrents:</h3>
        {Object.keys(joinedTorrents).map((infoHash) => (
          <TorrentInfo
            key={infoHash}
            infoHash={infoHash}
            downloaded={joinedTorrents[infoHash].downloaded}
            uploaded={joinedTorrents[infoHash].uploaded}
            totalPieces={torrentMap[infoHash].getFiles()[0].pieces.length}
          />
        ))}
      </div>
    </div>
  );
};

export default HomePage;