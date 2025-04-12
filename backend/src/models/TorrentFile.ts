import { Piece } from "./Piece";

export class TorrentFile {
  fileName: string;
  fileSize: number;
  pieces: Piece[];

  constructor(fileName: string, fileSize: number, pieces: Piece[]) {
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.pieces = pieces;
  }
}