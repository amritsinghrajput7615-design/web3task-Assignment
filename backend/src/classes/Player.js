export class Player {
  id: string;
  name: string;
  score: number;
  hasGuessed: boolean;
  isDrawer: boolean;
  socketId: string;

  constructor(id: string, name: string, socketId: string) {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.score = 0;
    this.hasGuessed = false;
    this.isDrawer = false;
  }
}