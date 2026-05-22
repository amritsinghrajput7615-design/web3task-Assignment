class Player {
  constructor(id, name, socketId) {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.score = 0;
    this.hasGuessed = false;
    this.isDrawer = false;
  }
}

module.exports = { Player };
