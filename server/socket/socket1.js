/*
socket.emit('message', 'check this');   // send to particular client
io.emit('message', 'check this');   // send to all listeners
socket.broadcast.to('chatroom').emit('message', 'this is the message to all');  // send to a room.
*/
var Room = require('../models/room');
var Player = require('../models/player');
const models = require('../models/models');
var utils = require('../utils.js');

//var gb = utils.createAndAssignGameboard(5, 4);
//console.log(gb);

/* responses:
 - globalChat
 - roomsUpdate
*/
exports = module.exports = function (io) {
  var clientsConnected = 0;
  io.on('connection', function (socket) {
    clientsConnected++;
    console.log('\t>>> a user connected. (socketId: ' + socket.id + ', clientsConnected: ' + clientsConnected + ')');

    socket.on('disconnect', function () {
      clientsConnected--;
      console.log('\t<<< a user disconnected (socketId: ' + socket.id + ', clientsConnected: ' + clientsConnected + ')');

      // Find player by socketId
      models.Player.findOne({
        where: {'socket_id': socket.id }
      }).then(function(player, err){
        if(err){
          console.error("ERROR: Error has occured while finding player by socket id. (socket_id = " + socket.id + ")");
          return;
        } else if(!player){
          console.log("ERROR: Cannot find player by socket id. (socket_id = " + socket.id + ")");
          return;
        }
        
        //If player belonged to a room, send playersUpdate to room player belongs to.
        var RoomId = player.RoomId;
        var playerIsReady = player.is_ready;
        
        player.destroy().then(() => {
          console.log("Deleted Player Successfully");
          
          if(RoomId){
            models.Room.findOne({
              where: {'id': RoomId },
              include: models.Player
            }).then((room, err) => {
              if(err){
                console.error("ERROR: Error has occured while finding room by id. (Room Id: " + RoomId + ")");
                return;
              } else if(!room){
                console.error("ERROR: Cannot find room by id (Room Id: " + RoomId + ")");
                return;
              };
                            
              if(playerIsReady){
                room.updateAttributes({
                    ready_count: --room.ready_count
                }).then(()=>{
                    console.log("updated room's ready_count to " + room.ready_count);
                });
              }
              
              io.to(RoomId).emit('playersUpdate', room.Players);
            });
          }
        });
      });
    });
    
    // Chat
    socket.on('globalChat', function (username, message) {
      console.log("globalChat message Received: username: " + username + ", msg: " + message);
      io.emit('globalChat', {
        'username': username,
        'message': message
      });
    });
    
    socket.on('roomChat', function(username, roomName, message){
      console.log(username + " wants to speak to " + roomName + ": " + message);
      io.to(roomName).emit('roomChat', {'username':username, 'roomName': roomName, 'message': message});
    });
    
    
    // Room
    socket.on('getRooms', function () {
      utils.emitRoomsList(models, io);
    });
    
    socket.on('joinRoom', function (nickname, roomId) {
      console.log("LOG: " + nickname + " has joined socket chat for " + roomId + ". Socket id: " + socket.id);
    
      models.Player.create({
        "username": nickname,
        "socket_id": socket.id,
        "RoomId": roomId
      }).then((player, err) => {
        if(err){
          console.log("ERROR: cannot create player to join room.");
          return;
        };
        
        socket.join(roomId);
        
        models.Room.findOne({
          where: { id: roomId },
          include: models.Player
        }).then(function(room, err){
          // catch error.
          if(err || !room){
            console.error("ERROR: cannot find room by id (roomId: " + roomId + ")");
            io.to(roomId).emit('playersUpdate', {});
            return;
          }
          io.to(roomId).emit('playersUpdate', room.Players);
        });
      });
      
      /*
      models.Player.findOrCreate({
        where: {
          username: nickname, 
          socket_id: socket.id
        }
      }).then(function(player, created){
        console.log('Player found/created!');
        
        player.updateAttributes({
          "RoomId": roomId
        }).then(function(){
          console.log('Joined room successfully!');
          socket.join(roomId);

          models.Room.findOne({
            where: { id: roomId },
            include: models.Player
          }).then(function(room, err){
            // catch error.
            if(err || !room){
              console.error("ERROR: cannot find room by id (roomId: " + roomId + ")");
              io.to(roomId).emit('playersUpdate', {});
              return;
            }
            io.to(roomId).emit('playersUpdate', room.Players);
          });
        });
      });
      */
    });
    
    socket.on('leaveRoom', function(nickname, roomId){
      console.log("LOG: " + nickname + " is leaving room id, " + roomId + ", on socket id: " + socket.id);
      
      models.Player.destroy({
        where: {
          socket_id: socket.id
        }
      }).then(()=>{
        // socket leave room.
        socket.leave(roomId);

        models.Room.findOne({
          where: {
            id: roomId
          },
          include: models.Player
        }).then((room, err) => {
          if(err){
            console.error("ERROR: Error occured while finding room by RoomId (RoomId: " + roomId + ")");
            return;
          } else if(!room){
            console.error("ERROR: Cannot find room (room Id: " + roomId + ")");
            return;
          } else if(!room.Players){
            console.error("ERROR: Room.Players is undefined. (Should be empty if there is none, but not null). (Room Id: " + roomId + ")");
            return;
          }
          // if no players are left in the room, then destroy the room.
          else if(room.Players.length == 0){
            console.log("LOG: There are no more players in the room. Deleting the room. (Room Id: " + roomId + ")");

            models.Room.destroy({
              where: { id: roomId }
            }).then(()=>{
              console.log("Deleted Room Successfully");
              utils.emitRoomsList(models, io);
            });
          }
          // if there are players left, then send playersUpdate.
          else {
            io.to(room.id).emit('playersUpdate', room.Players);
          }
        });
      });
    });
    
    socket.on('readyStatus', function(roomId, ready){
      console.log("ready status from socket id, " + socket.id);      
      
      models.Player.findOne({
        where: {
          RoomId: roomId,
          socket_id: socket.id
        }
      }).then(function(player, err){
        if(err){
          console.error("ERROR: Error has occured while finding room. (RoomId: " + roomId + ")");
          return;
        } else if(!player){
          console.error("ERROR: Cannot find player by RoomId and socket_id. (RoomId: " + roomId + ", socket_id: " + socket.id + ")");
          return;
        }
        
        // Update player's is_ready.
        player.updateAttributes({
          is_ready: ready
        }).then(()=>{
          // Find Room and send socket message update for list of players
          models.Room.findOne({
            where: { id: roomId },
            include: models.Player
          }).then(function(room, err){
            //console.log(room);
            if(err || !room.Players){
              console.error("ERROR");
              return;
            }
            
            io.to(roomId).emit('playersUpdate', room.Players);

            // Update room's ready_count.
            var updatedRoomCount = ready? room.ready_count+1 : room.ready_count-1;
            room.updateAttributes({
                ready_count: updatedRoomCount
            }).then(()=>{
                console.log("updated room's ready_count to " + updatedRoomCount);
                if(updatedRoomCount >= 2){  // todo, should change to total players in the room instead of 2 later.
                  prepareGame(io, room);
                }
            });
          });
        });
      });
    });
    
    // TODO: Update Game
    socket.on('updateGame', function (data) {
      console.log("updateGame | data: " + data);
      // todo. 
    });
    
    // TODO: to be deleted later.
    socket.on('test', function(msg){
      console.log("test: " + msg);
    })
  });
  
  /* MULTIPLAYER */
  // socket.io('getRooms', 'difficulty');
  // socket.io('startGame'). generate board -> send back boardData... 
  // updateGame(flags, gameData)
  // restartGame(status)
  // agreeRestartGame(status)
  // finishGame(status)
  //
}

function prepareGame(io, room){
  console.log("prepare game");
  let gameBoard = utils.createAndAssignGameboard(room.difficulty);
  io.to(room.id).emit('prepareGame', gameBoard);
}

function startGame(){
  console.log("start game");
  /*
  // when user clicks on board, start Game.
  startGame() {
    console.log("start game");
    this.state = GameState.RUNNING;
    this.timerService.reset();
    this.timerService.run();
    this.gameboardService.triggerMsgByTitle('clickToStartMsg', false);
  }
  */
}
