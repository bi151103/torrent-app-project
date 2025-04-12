import React from 'react';

interface TorrentInfoProps {
  infoHash: string;
  downloaded: number;
  uploaded: number;
  totalPieces: number;
}

const TorrentInfo: React.FC<TorrentInfoProps> = ({
  infoHash,
  downloaded,
  uploaded,
  totalPieces
}) => {
  return (
    <div className="torrent-info">
      <h3>Torrent: {infoHash}</h3>
      <p>Downloaded: {downloaded} bytes</p>
      <p>Uploaded: {uploaded} bytes</p>
      <p>Total Pieces: {totalPieces}</p>
    </div>
  );
};

export default TorrentInfo;