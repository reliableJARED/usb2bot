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
// You can also make another motor on port M2
//Adafruit_DCMotor *myOtherMotor = AFMS.getMotor(2);

Servo myservo;  // create servo object to control a servo




int data[2]; //hold two ints from user, will be sent/received via serial
int dataIndex;
int pos = 0;

void setup() {
  
  myservo.attach(9);  // attaches the servo on pin 9 to the servo object (Servo position 2 on board)
  
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
 
  
  myMotor->run(FORWARD);
  
  
  if (Serial && Serial.available()) {
    //when data is sent, it comes in as an Array of int.  expecting for this two int
    //see webUSB.html 
    data[dataIndex++] = Serial.read();//reads one byte at a time or -1 if no data

    //dataIndex == 2 when new data has arrived
    if (dataIndex == 2) {
       myMotor->setSpeed(data[0]);  
       myservo.write(data[1]); 
       
      Serial.print("Set motor to ");
      Serial.print(data[0]);
      Serial.print(", set servo position to ");
      Serial.print(data[1]);
      Serial.flush();
      
      //reset
      dataIndex = 0;
    }
  }
}
