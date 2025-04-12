export class Piece {
  public isDownloaded: boolean = false;

  constructor(
    public index: number,
    public hash: string,
    public size: number
  ) {}

  markAsDownloaded() {
    this.isDownloaded = true;
  }
}