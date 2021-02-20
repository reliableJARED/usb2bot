#include <Servo.h>

#include <WebUSB.h>

/**
 * Creating an instance of WebUSBSerial will add an additional USB interface to
 * the device that is marked as vendor-specific (rather than USB CDC-ACM) and
 * is therefore accessible to the browser.
 *
 * The URL here provides a hint to the browser about what page the user should
 * navigate to to interact with the device.
 * 
 * https://github.com/webusb/arduino
 */


/* 
This sketch for the Adafruit assembled Motor Shield for Arduino v2
It won't work with v1.x motor shields! Only for the v2's with built in PWM
control

For use with the Adafruit Motor Shield v2 
---->  http://www.adafruit.com/products/1438
*/

#include <Wire.h>
#include <Adafruit_MotorShield.h>



//the web link doesn't really matter
WebUSB WebUSBSerial(1 /* https:// */, "usb2bot.herokuapp.com");
#define Serial WebUSBSerial


// Create the motor shield object with the default I2C address
Adafruit_MotorShield AFMS = Adafruit_MotorShield(); 
// Or, create it with a different I2C address (say for stacking)
// Adafruit_MotorShield AFMS = Adafruit_MotorShield(0x61); 

// Select which 'port' M1, M2, M3 or M4. In this case, M1
Adafruit_DCMotor *myMotor = AFMS.getMotor(1);
Adafruit_DCMotor *mySteeringMotor = AFMS.getMotor(2);

// You can also make another motor on port M2
//Adafruit_DCMotor *myOtherMotor = AFMS.getMotor(2);

Servo panServo;  // create servo object to control a servo
Servo tiltServo;


int data[7]; //hold two ints from user, will be sent/received via serial
int dataIndex;
int pos = 0;
int TURN_POWER = 200;
int MOTOR_POWER = 0;
int PAN_ANGLE = 90;
int TILT_ANGLE = 90;
int RIGHT_TURN = 1;
int LEFT_TURN = 2;
int STRAIGHT_WHEELS = 0;
int TURN_STATE = 0;
int MOVE_FORWARD = 1;
int MOVE_BACKWARD = 2;
int MOVE_STOP = 0;
int MOVE_STATE = 0;
int ControllerUpdateRequest = 999;
int header_controllerUpdate = 555;
bool CONNECTION_STARTED = false;

void setup() {
  
  panServo.attach(9);  // attaches the servo on pin 9 to the servo object (Servo position 2 on board)
  tiltServo.attach(10);

  //set turning power of steering motor
  mySteeringMotor ->setSpeed(TURN_POWER);
  myMotor -> setSpeed(MOTOR_POWER);

  
  while (!Serial) {
    ;
  }
  Serial.begin(9600);
  Serial.write("Sketch begins.\r\n");
  Serial.println("starting");

  AFMS.begin();  // create with the default frequency 1.6KHz
  //AFMS.begin(1000);  // OR with a different frequency, say 1KHz
  Serial.flush();
  dataIndex = 0;
  
}

void loop() {
  
  if (Serial && Serial.available()) {
    
    //continue polling until first receipt of controller info
    if(!CONNECTION_STARTED){
        Serial.print(ControllerUpdateRequest);
        };
    
    //when data is sent, it comes in as an Array of int.  
    data[dataIndex++] = Serial.read();//reads one byte at a time or -1 if no data

    //dataIndex == 7 when all of the new data has arrived
    if (dataIndex == 7) {

        if(data[0] == header_controllerUpdate){
          //555 is the header indicator, it should be index 0.  that means data form is correct
          //data form: [header, power, tilt,pan,turn,move,stop];
          //motor power
          if(data[1] != MOTOR_POWER){setMotorPower(data[1]);};
          //tilt
          if(data[2] != TILT_ANGLE){tilt(data[2]);};
          //pan
          if(data[3] != PAN_ANGLE){pan(data[3]);};
          //turn wheels
          if(data[4] != TURN_STATE){turn(data[4]);};
          //move forward/backwards
          if(data[5] != MOVE_STATE){forward_or_backward(data[5]);};

          //only used on first connection, indicate connection made
           CONNECTION_STARTED = true;
        }
  
      /*/////
      switch(data[0]){
        case 5:
          kill_all_motors();
          break;
        case 0:
          setMotorPower(data[1]);
          break;
        case 1:
          tilt(data[1]);
          break;
        case 2:
          pan(data[1]);
          break;
        case 3:
          turn(data[1]);
          break;
        case 4:
          forward_or_backward(data[1]);
          break;
        
       
      }
      */
      //reset
      dataIndex = 0;
      //request new update from controller
      Serial.print(ControllerUpdateRequest);
    }
  }
}


//case: 0
void setMotorPower(int power){
  //Serial.print("set motor power: ");
  //Serial.print(power);
  //Serial.flush();
  MOTOR_POWER = power; 
  myMotor -> setSpeed(power);
}

//case: 1
void tilt(int tilt){
  TILT_ANGLE = tilt;
  tiltServo.write(tilt); 
}

//case: 2
void pan(int pan){
  PAN_ANGLE = pan;
  panServo.write(pan); 
}

//case: 3
void turn(int LR){
  
  //right turn
  if(LR == RIGHT_TURN){
     mySteeringMotor ->run(FORWARD);
     mySteeringMotor ->setSpeed(TURN_POWER);
     TURN_STATE = RIGHT_TURN;
  }
  //left turn
  if(LR == LEFT_TURN){
      mySteeringMotor ->run(BACKWARD);
      mySteeringMotor ->setSpeed(TURN_POWER);
      TURN_STATE = LEFT_TURN;

  }
  //straight wheels
  if(LR == STRAIGHT_WHEELS){
      mySteeringMotor ->setSpeed(0);
      mySteeringMotor ->run(RELEASE);
      TURN_STATE = STRAIGHT_WHEELS;
  }
}

//case: 4
void forward_or_backward(int m){
  Serial.print("forwardBackward arg: ");
  Serial.print(m);
  Serial.flush();

  //should the speed be set each call?  Or does setMotorPower() cover this?
  if(m == MOVE_FORWARD){
      Serial.print("forward");
      Serial.flush();
     
     myMotor -> run(FORWARD);
     myMotor -> setSpeed(MOTOR_POWER);
     MOVE_STATE = MOVE_FORWARD;
  }
  if(m == MOVE_BACKWARD){
      Serial.print("backward");
      Serial.flush();
     
      myMotor -> run(BACKWARD);
      myMotor -> setSpeed(MOTOR_POWER);
      MOVE_STATE = MOVE_BACKWARD;
  }
  if(m == MOVE_STOP){
      Serial.print("stop");
      Serial.flush();
      myMotor ->setSpeed(0);
      myMotor ->run(RELEASE);
      MOVE_STATE = MOVE_STOP;
  }
};

//case: 5
void kill_all_motors(){
        MOTOR_POWER = 0; 
        Serial.print("kill motor");
        //myMotor ->setSpeed(0);
        myMotor ->run(RELEASE);
        //mySteeringMotor ->setSpeed(0);
        mySteeringMotor ->run(RELEASE);
}
