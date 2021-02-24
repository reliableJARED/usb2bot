
/************** RESOURCES

Google Code Labs
https://github.com/googlecodelabs/webrtc-web/blob/c96ce33e3567b40cd4a5d005186554e33fb8418c/step-05/js/main.js

Mozilla Developer Network
https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling

WebRTC Github - example
https://github.com/webrtc/apprtc

Sam Dutton
https://www.html5rocks.com/en/tutorials/webrtc/basics/

Gabriel Tanner
https://gabrieltanner.org/blog/webrtc-video-broadcast

COR errors
https://stackoverflow.com/questions/57181851/how-to-make-webrtc-application-works-on-the-internet

Shane Tully
https://shanetully.com/2014/09/a-dead-simple-webrtc-example/
*/

'use strict';

//const client = require("engine.io-client");

let room = null;
var socket = io.connect();
var ARDUINO_SocketID = false; //SET IN ANSWER
var ARDUINO_CONNECTED_CLIENT = false;
const TEXT_DECODER = new TextDecoder();

//CONTROLLER OBJECT HANDLER
var PREVIOUS_CONTROLLER_STATE = (()=>{
  let maxSpeed = 255; 
  let minSpeed = 0;
  let oldMotorPowerState = 0;
  let oldTurnState = 0;
  let oldMoveState = 0;
  let oldPanState = 0;
  let oldTiltState = 0;
  let oldStopState = 0;

  return{set:function(state){
        //state value: [power, tilt,pan,turn,move,stop];
        //make sure that we don't set power to be less than 0 or more than 255.
        oldMotorPowerState += (state.power<0 || state.power>255) ? state.power: 0;
        oldTiltState = state.tilt;
        oldPanState = state.pan;
        oldTurnState = state.turn;
        oldMoveState = state.move;
        oldStopState = state.stop;
        },
        stateChanged:function(state){
          //if anything in state is different than the old state, send false
          if(state.power == oldMoveState && 
            state.tilt == oldTiltState &&
            state.pan == oldPanState &&
            state.turn == oldTurnState &&
            state.move == oldMoveState &&
            state.stop == oldStopState){ 
              return false
          }
          else{return true}

        },
        get:function(){
          return {
            power :oldMoveState, 
            tilt : oldTiltState,
            pan : oldPanState,
            turn : oldTurnState,
            move : oldMoveState,
            stop : oldStopState 
          }
        },
        
    }

})();



//create the bilateral communication object, RTCpeerconnection
//will have the local and remote connection information, will need to get info from
//handshake on the socket to use

//first, make the connection objects
var iceConfig = {
        'iceServers':[
          {
            'urls': 'stun:stun.l.google.com:19302'
          },
          {
            'urls': 'turn:192.158.29.39:3478?transport=udp',
            'credential': 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            'username': '28224511:1379330808'
        },
        {
            'urls': 'turn:192.158.29.39:3478?transport=tcp',
            'credential': 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
            'username': '28224511:1379330808'
         }
        ]
      };
/////////////////////// CONSTRAINTS FOR getUserMedia //////////////////////////
// https://developer.mozilla.org/en-US/docs/Web/API/Media_Streams_API/Constraints

/* *******  iPhone issue ********* 
https://bugs.webkit.org/show_bug.cgi?id=208667
https://stackoverflow.com/questions/63084076/ios13-getusermedia-not-working-on-chrome-and-edge

when constraints has audio:false, iphone can connect
to the app when it's on heroku.  Else, it can't.  Suspect it's related
to only allowing video? idk, but it's annoying 30nov2020
*/

//if iPhone user agent, ONLY set video constraint, else include audio and width/height
const constraints = navigator.userAgent.includes("iPhone") ? {video:true} : {
    audio:true,
      video: {
          width: { ideal: 640 },
          height: {ideal: 400 }
          }    
    };

////////////////////// GLOBAL TO HOLD CONNECTIONS ////////////////////////////////
/*move this to a closure at some point*/
var allPeerConnections = {};

//////////////////////////  GET USER MEDIA //////////////////////////
navigator.mediaDevices.getUserMedia(constraints).then(setLocalVideo);
/* best is use an arrow function for setLocalVideo stream, done this way to make reading easier*/
//////////////////////////  DISPLAY USER MEDIA for LOCAL //////////////////////////
function setLocalVideo(stream){
  let localVideo = document.querySelector('#localVideo');
  localVideo.srcObject = stream;
}
///// Clicking the ENTER button starts everything.  The UI is pretty bad, there is no
//indication anything is working or connecting.  could add that but didn't.  Just know
//when you click enter, server is trying to get you to other peers in the room
const startButton = document.getElementById('submit');

//once we get input from user, set room and pass then connect to server
startButton.onclick = (() =>{  
  room = document.getElementById('room').value;
  /*
  -- PASSWORDS --
  technically everything is built and tested to use passwords
  I hid the html element, commented out the getElementBy but gave it a value of 1234.  the server applies a default '1234' to all rooms
  because this is a simple demo app not something for protection and entering room +pass 
  was annoying
  */

  let password = '1234' //document.getElementById('password').value;
  console.log(room,password)

  if (room !== '') {
    socket.emit('create or join', room,password);
    console.log('Asking server to create or join room: ', room);
    }
});

//Start our connection to the server
socket.on('connect',()=>{
  console.log("CONNECTED");
});

//response back if Client joined a room with other clients
//this will cause Client to start the RTCpeerconnection handshake they will be the
// 'offer' client
socket.on("newRoomMember", (room,ids) => {
  //ids an array of socket.IDs of other members
  //loop through all the room members and send offer to connect
  for (var socketID of ids){
    //make an offer to one of the clients in the room
    const remotePeerConnection = createPeerConnectionOffer(socketID);

    //associate this rPC with the specific socketID so peer-peer comms can happen
    allPeerConnections[socketID] = remotePeerConnection;

    //create handler for the .onicecandidate method of RTCPeerConnection instance 
    remotePeerConnection.onicecandidate = event => {
        if (event.candidate) {
          socket.emit("candidate", socketID, event.candidate);
        }
      };
    }
});

async function addMediaTrackToRemotePeerConnection(remotePeerConnection){
//IMPORTANT - everything has to wait for userMedia, so it's all chained to that promise .then()
 //https://stackoverflow.com/questions/38036552/rtcpeerconnection-onicecandidate-not-fire
 const stream = await navigator.mediaDevices.getUserMedia(constraints);

  //Add our local media tracks (audio/video) to the rPC object we are connecting through
  stream.getTracks().forEach(track => remotePeerConnection.addTrack(track, stream));

  //return remotePeerConnection with its new tracks
  return remotePeerConnection;
}

function createPeerConnectionOffer (RemoteSocketID){
  //iceConfig global 
  const remotePeerConnection = new RTCPeerConnection(iceConfig);
  //IMPORTANT - everything has to wait for userMedia
 addMediaTrackToRemotePeerConnection(remotePeerConnection)
 .then((rpc) =>{
    //Now that the rpc 'remotePeerConnection' has our media tracks associated, we can start the offer process.
    rpc.createOffer()
      //createOffer returns our local network description
      .then(sdp => {
        rpc.setLocalDescription(sdp);
        return sdp;
      })
      .then((sdp) => {
          socket.emit("offer", RemoteSocketID, sdp);
        })
    })
 .catch(learnFromMistakes);

  return remotePeerConnection;
}

function createPeerConnectionAnswer (RemoteSocketID,description){
//iceConfig global 
const remotePeerConnection = new RTCPeerConnection(iceConfig);
//IMPORTANT - everything has to wait for userMedia
 addMediaTrackToRemotePeerConnection(remotePeerConnection)
 //add the remote client description to the rpc 
 .then(remotePeerConnection.setRemoteDescription(description))
 //create a local description Object
 .then(() => remotePeerConnection.createAnswer())
 //attach the local description to the rpc 
 .then(sdp => remotePeerConnection.setLocalDescription(sdp))
 //finally, fire the answer back
 .then(() => {
  socket.emit("answer", id, remotePeerConnection.localDescription);
  })
  .catch(learnFromMistakes);
}

function createRemoteVideoHTMLNode (id){

  //*create a new video element to show our remote video
  const remoteVideo = document.createElement("video");
  //set it to autoplay video
  remoteVideo.autoplay = true;
  //set the inline play
  remoteVideo.setAttribute('playsinline','');
  //give it the socket id as an id so we can reference easily
  remoteVideo.setAttribute("id",id);
  //attach our remote video element to container, 
  document.getElementById('remoteVideoContainer').appendChild(remoteVideo)
  return;
}


socket.on("offer", (id, description) => {
  //
  //CLIENT IN/MAKING THE ROOM RECEIVES THIS, THEY ARE THE "LOCAL CLIENT"
  //
  console.log('OFFER');
  //////// SO Similar to the createPeerConnectionOffer flow, should really combine in to a few single working functions
  

  //create a video element to hold the remote stream
  createRemoteVideoHTMLNode (id);

  //create a new RTCPeerConnection object to be associated with this offer
  const remotePeerConnection = new RTCPeerConnection(iceConfig);
  
  
  //add it to the list of all connections
  allPeerConnections[id] = remotePeerConnection;



  
  
  navigator.mediaDevices.getUserMedia(constraints)
 .then(
   (stream)=>{
     stream.getTracks().forEach(track => remotePeerConnection.addTrack(track, stream));

     return remotePeerConnection
   })
   .then(remotePeerConnection.setRemoteDescription(description))
   .then(() => remotePeerConnection.createAnswer())
    .then(sdp => remotePeerConnection.setLocalDescription(sdp))
    .then(() => {
      socket.emit("answer", id, remotePeerConnection.localDescription);
    });

    //trying to fix issue with iphone, mannually add tracks to a MediaSource?
  remotePeerConnection.ontrack = event => {
    let remoteVideoElement = document.getElementById(id);
    //set the remote stream to our video html element - IF - this is not the arduino client
    if(!ARDUINO_CONNECTED_CLIENT){
      console.log("NOT ARDUINO CLIENT")
      remoteVideoElement.srcObject = event.streams[0]}
    if(ARDUINO_CONNECTED_CLIENT){
      console.log("ARDUINO CLIENT")
      remoteVideoElement.pause();
      remoteVideoElement.autoplay = false;
      remoteVideoElement.removeAttribute('src'); // empty source
      remoteVideoElement.load();
    }
  };

  remotePeerConnection.onicecandidate = event=>{
    if (event.candidate) {
       socket.emit("candidate", id, event.candidate);
    }
  }
});


socket.on("answer", (id, description) => {
  //
  //THE JOINING CLIENT RECEIVES THIS, THEY ARE THE "REMOTE CLIENT"
  //
  console.log('ANSWER');

  if(!ARDUINO_SocketID){
    //sets to the first connected client - consider making it an option to choose which video to connect arduino with
    ARDUINO_SocketID = id;
    console.log('ARDUINO_SocketID is set')
  }
  

  //create a video element to hold the remote stream
  createRemoteVideoHTMLNode(id);
  
  allPeerConnections[id].setRemoteDescription(description)

  allPeerConnections[id].ontrack = event => {
      //remoteVideo html element
      const remoteVideoElement = document.getElementById(id);
      //set the remote stream as the video source
      remoteVideoElement.srcObject = event.streams[0];
  };
  allPeerConnections[id].onicecandidate = event => {
      if (event.candidate) {
        socket.emit("candidate", id, event.candidate);
      }
  };  
});


socket.on("candidate", (id, candidate) => {
  allPeerConnections[id].addIceCandidate(new RTCIceCandidate(candidate));
});

//debug helper for server
socket.on('log', function(msg) {
  //receive console.log() server messages - debug feature
  console.log('FROM SERVER LOG: '+msg);
});

socket.on('bye',(id)=>{
  //when a client leaves a 'bye' is sent. remove their html video element and delete them from connections Obj
  let remoteVideoElement = document.getElementById(id);
  remoteVideoElement.remove();
  delete allPeerConnections[id];
});

socket.on('wrong',()=>{
  let room = document.getElementById('room');
  //let pass = document.getElementById('password');
  room.value = '';
  //pass.value = '';
});

socket.on('full',(room)=>{
  let rm = document.getElementById('room');
  //let pass = document.getElementById('password');
  rm.value = room +' is full';
  //pass.value = '';
});

socket.on('joined',(room,socketid,isInitiatorClient)=>{
  console.log('joined socket msg');
  console.log(room,socketid,isInitiatorClient);
});







window.addEventListener('beforeunload', function (e) {
  socket.emit('bye',room);
  // the absence of a returnValue property on the event will guarantee the browser unload happens
  delete e['returnValue'];
});

//error message handler
function learnFromMistakes(youFailed){
  console.log('so close, here is where it all went wrong:',youFailed)
}


/*
There are two sections below, one for client with arduino leonardo connected by USB
the other with a connected USB gamepad controller.
there is nothing that ensures connection timing.  need to add that.  Also there is no flag
or other indicator to the client if they are the arduino or the controller client.
need to add those things.
*
*
*
*
*
ARDUINO LEONARDO CLIENT below
*/

function stopLocalVideoIfArduino(){
  navigator.usb.getDevices()
  .then(devices =>{
    devices.forEach(device =>{
      if(device.manufacturerName == "Arduino LLC"){
        console.log("this is the arduino client")
        //this flag will cause remote video to also not be played
        ARDUINO_CONNECTED_CLIENT = true;
        //playing the video really bogs down the pi.
        var videoElement = document.getElementById('localVideo');
        videoElement.pause();
        videoElement.autoplay = false;
        videoElement.removeAttribute('src'); // empty source
        videoElement.load();
      }
    })
  }
  )
}

(function() {
  'use strict';
  /*
  SEE: serial.js
  that has the woker functions used to find and connect to the usb
  */

  document.addEventListener('DOMContentLoaded', event => {
    let connectButton = document.querySelector("#connect");
    let statusDisplay = document.querySelector('#status');
    let port;

    function connectUSB() {
      port.connect().then(() => {
        statusDisplay.textContent = '';
        connectButton.textContent = 'Disconnect';
        stopLocalVideoIfArduino();

        port.onReceive = data => {
/*
TODO
change this whole section.  the arduino should be sending data back to the user.
maybe even trigger the loop for input Arduino request -> controller poll -> send to Arduino
this can be done with binary data to, reducing data transmission.  ALthough it's small already.
on the Arduino side Serial.write() will send binary data or use Serial.print() for sending characters.
but have a trigger call essentially
///////////////*/

          
          //log input from ARDUINO Serial.print()
          console.log(TEXT_DECODER.decode(data));

          //this 'data' is from arduino to connected PC - NOT - remote PC.
          //send data to remote FIRST, then remote can use it.
          if(allPeerConnections.keys().length != 0 ){
              let id_controller = allPeerConnections.keys()[0];//FIX THIS - should hold the id of controller someplace, not assume it's 0
              socket.emit('toController',id_controller, data);
          }

        }
        port.onReceiveError = error => {
          console.error(error);
        };
      }, error => {
        statusDisplay.textContent = error;
      });
    }


    connectButton.addEventListener('click', function() {
      if (port) {
        port.disconnect();
        connectButton.textContent = 'Connect';
        statusDisplay.textContent = '';
        port = null;
      } else {
        //connect to the USB arduino
        serial.requestPort().then(selectedPort => {
          port = selectedPort;
          
          connectUSB();

        }).catch(error => {
          statusDisplay.textContent = error;
        });
      }
    });

    serial.getPorts().then(ports => {
      if (ports.length == 0) {
        statusDisplay.textContent = 'No device found.';
      } else {
        statusDisplay.textContent = 'Connecting...';
        port = ports[0];
        connectUSB();
      }
    });
/**************TODO: using socket.on passes the data through the server.  changes this to RTCPeerconnection using data channel */
//Handle received data
socket.on('x',(id,data)=>{
    //port is a direct USB connection to the arduino leonardo
    //console.log(data);
    port.send(data);
  });

  });
})();


//data FROM the pc with arduino - to pc with controller
socket.on('toController',(id,data)=>{
  console.log(data);
  dataReceivedFromRemoteArduino(data);
});

///
function dataReceivedFromRemoteArduino(d){
  //999 indicates Arduino ready for controller input
  let ControllerUpdateRequest = 999;
  //make sure it's what's expected
  console.log(TEXT_DECODER.decode(d));
  let data = TEXT_DECODER.decode(d)
  //get the state of the controller, if that's what Arduino is asking for
  let state = (data == ControllerUpdateRequest) ? pollControllerStateChanged() : false;
  //if controller state is different than last time, give Arduino the update
  if(state){sendControllerStateToArduino()};
}



function pollControllerStateChanged(){
  //check controller state
  //poll the controller state 
  var controllerState = controller();//return structure array: [power, tilt,pan,turn,move,stop];

  //pass the current state to stateChanged(), returns bool if changed or not compared to last state
  let stateChanged = PREVIOUS_CONTROLLER_STATE.stateChanged(
    {power:controllerState[0],
    tilt:controllerState[1],
    pan:controllerState[2],
    turn:controllerState[3],
    move:controllerState[4],
    stop:controllerState[5]
    }
  )
  //if the state did change, update current state to the new one.
  if(stateChanged){
    PREVIOUS_CONTROLLER_STATE.set(
      {
      power:controllerState[0],
      tilt:controllerState[1],
      pan:controllerState[2],
      turn:controllerState[3],
      move:controllerState[4],
      stop:controllerState[5]
        }
    )}

  return stateChanged
}

function sendControllerStateToArduino(){
  //add header to make sure when Arduino recieves data over serial it's reading from start
  const header_controllerUpdate = 555;
  const header = 0;
  const motorPowerUpdate = 1;
  const tiltUpdate = 2;
  const panUpdate = 3;
  const turnUpdate = 4;
  const moveUpdate = 5;
  const stopMotor = 6;

  //current controller state
  let state = PREVIOUS_CONTROLLER_STATE.get();
  //send the update in the form Arduino expects
  //Array - form: [header, power, tilt,pan,turn,move,stop];
  let controllerStateUpdateForArduino = new Uint8Array(7);

  controllerStateUpdateForArduino[header] = header_controllerUpdate;
  controllerStateUpdateForArduino[motorPowerUpdate] = state.power;
  controllerStateUpdateForArduino[tiltUpdate] = state.tilt;
  controllerStateUpdateForArduino[panUpdate] = state.pan;
  controllerStateUpdateForArduino[turnUpdate] = state.turn;
  controllerStateUpdateForArduino[moveUpdate] = state.move;
  controllerStateUpdateForArduino[stopMotor] = state.stop;

  socket.emit('x',ARDUINO_SocketID, controllerStateUpdateForArduino);

}


function controller(){
   //save this reference some place, don't get it this way
  let gamepad = navigator.getGamepads()[0];

  let motorSensitvity = 0.5;//min threshold on axes to register as input
  let panTiltSensitivity = 0.07;
  //Each joystick has output as [horizontal,verticle] using -1 to 1 scale
  //gamepad.axes [left horz, left vert, right horz, right vert]
  //left/right axes forward is -1, backwards 1, left is -1, right is 1
  //TEST output
  //https://gamepad-tester.com/
  let axes = gamepad.axes;


  let motorPower = axes[1];//consider making this dpad
  let steerInput = axes[0];
  let posV = axes[3];
  let posH = axes[2];
  let forward = gamepad.buttons[7].value;//right trigger
  let backwards = gamepad.buttons[1].value;//circle
  let stop = gamepad.buttons[0].value;//x

  let move = 0;
  let turn = 0;
  let power = 0;


  if(forward == 1){
    move = 1;
  }
  if(backwards == 1){
    move = 2;
  }
   

  //determine motor speed up or down
  //simply the output, could force int but decided to do this way.
  if (motorPower > motorSensitvity){
    //correct inversion since 'down' on joystick is 1
    power = -1;
  }
  if(motorPower < -motorSensitvity){
    //correct inversion since 'up' on joystick is -1
    power = 1;
  }
  
  //determine if Left or Right
  if (steerInput > motorSensitvity){
    //use 0.15 because controller isn't perfect calibraion always
    turn = 1;
  }
  if(steerInput < -motorSensitvity){
    turn = 2;
  }


  
  //convert -1 to 1 input, to a 0 to 180 servo position
  //panTiltSensitivity const, if under just leave servo at 90
  let tilt = (posV > panTiltSensitivity || posV < - panTiltSensitivity) ? posV*(90)+90: 90; 
  let pan = (posH > panTiltSensitivity || posH <- panTiltSensitivity) ? -posH*(90)+90: 90;//-pos is to invert the input so 'up' on joystick is positive.
  
  return [power, tilt,pan,turn,move,stop];

}

/*
|
|
|
CONTROLLER CLIENT
*/

function controllerPoll(speed, tilt,pan,turn,move){
  
  //set min max for the motor speed
  let maxSpeed = 255; 
  let minSpeed = 0;
  let newSpeed = speed;

  //poll controller state
  let userInput = controller();
  //userInput return value = [-motorPower, tilt,pan,turn,move]

  //Arduino case assignments for incoming data
  //0=motorPower, 1=tilt, 2=pan, 3=turn, 4=forward/backward
  let motorPowerUpdate = 0;
  let tiltUpdate = 1;
  let panUpdate = 2;
  let turnUpdate = 3
  let moveUpdate = 4;
  let stopMotor = 5;

  //update the POWER from user input. 
  //userInput should be 0, 1 or -1
  newSpeed += userInput[0];

  //used to send update to the USB connected arduino leonardo
  let update = new Uint8Array(2);

    //first check if User is trying to stop all motors
  if(userInput[5] == 1){
      newSpeed = 0;
      console.log('sending full stop');
      update[0] = stopMotor;
      update[1] = userInput[5];
      //visual update of speed
      document.getElementById('motorSpeed').value = newSpeed;
      //send via socket to other connected computer
      socket.emit('x',ARDUINO_SocketID, update);
    }

  
  //protect speed in the event it has gone out of bounds
  if(newSpeed < minSpeed){
      newSpeed = minSpeed;
    }
  if(newSpeed > maxSpeed){
      newSpeed = maxSpeed;
    }

  //we don't want to send the same update, only new updates
  //use these 'new' assignments to compare the last update

  //servo positions
  let newTilt = userInput[1];
  let newPan = userInput[2];

  //direction and speed
  let newTurn = userInput[3];
  let newMove = userInput[4];

  if(speed != newSpeed){
    console.log("speed,newspeed: " ,speed,newSpeed)
      //cap the max and min to the motor speed range
    if(newSpeed <= maxSpeed && newSpeed  >= minSpeed){ 
      update[0] = motorPowerUpdate;
      update[1] = newSpeed;
      //visual update of speed
      document.getElementById('motorSpeed').value = newSpeed;
      //send via socket to other connected computer
      socket.emit('x',ARDUINO_SocketID, update);
       
    }
  }

  if(newTilt != tilt){
    update[0] = tiltUpdate;
    update[1]= newTilt;
    socket.emit('x',ARDUINO_SocketID, update);

  }

  if(newPan != pan){
    update[0] = panUpdate;
    update[1]= newPan;
    socket.emit('x',ARDUINO_SocketID, update);
  }
  
  if(newTurn != turn){
    update[0] = turnUpdate;
    update[1]= newTurn;
    socket.emit('x',ARDUINO_SocketID, update);
  }
  if(newMove != move){
    update[0] = moveUpdate;
    update[1]= newMove;
    socket.emit('x',ARDUINO_SocketID, update);
  }
  

  //LOOP
  //https://stackoverflow.com/questions/19893336/how-can-i-pass-argument-with-requestanimationframe
  window.requestAnimationFrame(() => {
    controllerPoll(newSpeed, newTilt,newPan,newTurn,newMove)
    });
  //requestAnimationFrame(controllerPoll(posX,posY)); -- THIS WONT WORK
}



window.addEventListener("gamepadconnected", function(e){
 
  console.log('gamepad connected: %s',e.gamepad.id);
  //hide the connection button this is only for the client with the Arduino connected
  document.getElementById('connect').style.visibility = 'hidden';

  //starting settings
  let speed = 0;
  let tilt = 0;
  let pan = 0;
  let turn = 0;
  let move = 0;
  
  //controllerPoll(speed,tilt,pan,turn,move);
});

/*
DESIGN
1) Connect clients by RTCpeerconnection
  a) connecting clients enter a 'room name' on webpage
2) flag clients as either ROBOT or CONTROLLER
3) Handshake to begin control connection
  a) When a new connection joins 'the room' all clients are notified.
  b) the existing clients should start polling the new connection.
    i) If ROBOT - this means asking for an update from the CONTROLLER input state
    ii) if CONTROLLER - this means telling the ROBOT what the controller input state is
  c) When connection of control is confirmed, the following cycle is created
    i) CONTROLLER client polls the control input until it determines a state changed (button pressed, etc.)
    ii) CONTROLLER client prepares an update for ROBOT in the form of an Int Array, using index 0 as header
    iii) CONTROLLER sends update using DataChannel (or Socket).
    iv) ROBOT client receives update and forwards to connected Arduino on usb using port.send(data)
    v) Arduino receives the Int Array, checks that index 0 is expected header value
    vi) Arduino processes input by updating motors and servos with input
    vii) Arduino tells ROBOT client update is complete using Serial.write()
    viii) ROBOT client receives confirmation that update is completed
    ix) ROBOT client sends confirmation to CONTROLLER client that update is complete
    x) CONTROLLER client begins polling controller input again to determine if a state changes
    xi) If controller input state changes, start loop again from (c.i)

*/