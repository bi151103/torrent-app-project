import { TorrentPeer } from './TorrentPeer';
import { Piece } from './Piece';
import { TorrentFile } from './TorrentFile';

export class Torrent {
  public torrentPeers: TorrentPeer[] = [];
  public files: TorrentFile[];

  constructor(
    private infoHash: string,
    files: { name: string; size: number; pieceHashes: string[] }[],
    torrentPeers: TorrentPeer[]
  ) {
    this.files = files.map(
      (file) =>
        new TorrentFile(
          file.name,
          file.size,
          (file.pieceHashes || []).map((hash, index) =>
            new Piece(index, hash, Math.min(512 * 1024, file.size - index * 512 * 1024))
          )
        )
    );
    this.torrentPeers = torrentPeers; 
  }

  getInfoHash() {
    return this.infoHash;
  }

  getFiles() {
    return this.files;
  }

  addPeer(peer: TorrentPeer) {
    this.torrentPeers.push(peer);
  }

  removePeer(peerId: string) {
    this.torrentPeers = this.torrentPeers.filter((p) => p.getPeerId() !== peerId);
  }

  getPeers(): TorrentPeer[] {
    return this.torrentPeers;
  }
}