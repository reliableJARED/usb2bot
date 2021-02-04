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
This is a test sketch for the Adafruit assembled Motor Shield for Arduino v2
It won't work with v1.x motor shields! Only for the v2's with built in PWM
control

For use with the Adafruit Motor Shield v2 
---->  http://www.adafruit.com/products/1438
*/

#include <Wire.h>
#include <Adafruit_MotorShield.h>

//the web link doesn't really matter
WebUSB WebUSBSerial(1 /* https:// */, "webusb.github.io/arduino/demos/rgb");
#define Serial WebUSBSerial


// Create the motor shield object with the default I2C address
Adafruit_MotorShield AFMS = Adafruit_MotorShield(); 
// Or, create it with a different I2C address (say for stacking)
// Adafruit_MotorShield AFMS = Adafruit_MotorShield(0x61); 

// Select which 'port' M1, M2, M3 or M4. In this case, M1
Adafruit_DCMotor *myMotor = AFMS.getMotor(1);
// You can also make another motor on port M2
//Adafruit_DCMotor *myOtherMotor = AFMS.getMotor(2);


int motorSpeed[2]; //hold two ints from user, will be sent/received via serial
int motorSpeedIndex;

void setup() {
  while (!Serial) {
    ;
  }
  Serial.begin(9600);
  Serial.write("Sketch begins.\r\n");
  Serial.println("Adafruit Motorshield v2 - DC Motor test!");

  AFMS.begin();  // create with the default frequency 1.6KHz
  //AFMS.begin(1000);  // OR with a different frequency, say 1KHz
  Serial.flush();
  motorSpeedIndex = 0;
}

void loop() {
  
  myMotor->run(FORWARD);
  
  
  if (Serial && Serial.available()) {
    //when data is sent, there are TWO ints
    //see webUSB.html 
    motorSpeed[motorSpeedIndex++] = Serial.read();

    //motorSpeedIndex == 2 when new data has arrived
    if (motorSpeedIndex == 2) {
      myMotor->setSpeed(motorSpeed[0]);  
      
      Serial.print("Set motor to ");
      Serial.print(motorSpeed[0]);
      Serial.print(", a value received but not used ");
      Serial.print(motorSpeed[1]);
      Serial.flush();
      
      //reset
      motorSpeedIndex = 0;
    }
  }
}
