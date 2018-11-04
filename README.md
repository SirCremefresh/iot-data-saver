[![Snap Status](https://build.snapcraft.io/badge/SirCremefresh/bmw12-garage-door-server.svg)](https://build.snapcraft.io/user/SirCremefresh/bmw12-garage-door-server)

# install
snapcraft prime    

snap try prime/    

# stop
sudo snap stop  bmw12-garage-door-server


# remove
sudo snap remove  bmw12-garage-door-server


# list services

snap services

# configure enviroment
snap set iot-data-saver database.host= database.port= database.user= database.name= database.password= mqtt.url= mqtt.user= mqtt.password=


# logs

cat /var/log/syslog 
