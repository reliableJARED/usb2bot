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

//CONST
// used in the RTCpeerconnection
const ICE_CONFIG = {
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

  //NOTE - iPhone has issues with audio:true, or any constraint asside from video:true
  const CONSTRAINTS =  {
    audio:true,
      video: {
          width: { ideal: 640 },
          height: {ideal: 400 }
          }    
    };

    