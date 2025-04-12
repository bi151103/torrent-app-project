export class TorrentPeer {
  public peerId: string;
  public isSeeder: boolean;
  public isLeeching: boolean;
  public uploaded: number = 0;
  public downloaded: number = 0;
  public peerIp: string;
  public peerPort: number;

  constructor(
    peerId: string,
    peerIp: string,
    peerPort: number,
    uploaded: number,
    isSeeder: boolean = false
  ) {
    this.peerId = peerId;
    this.peerIp = peerIp;
    this.peerPort = peerPort;
    this.isSeeder = isSeeder;
    this.isLeeching = !isSeeder;
    this.uploaded = uploaded;
  }

  getPeerId(): string {
    return this.peerId;
  }
}