#!/usr/bin/env node
const mysql = require('mysql2/promise');
const mqtt = require('mqtt');
require('dotenv').config();

const IS_SNAP = !!(process.env.SNAP_NAME);

let config;

if (IS_SNAP) {

} else {
    config = {
        DATABASE_HOST: process.env.DATABASE_HOST,
        DATABASE_PORT: process.env.DATABASE_PORT,
        DATABASE_USER: process.env.DATABASE_USER,
        DATABASE_NAME: process.env.DATABASE_NAME,
        DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,

        MQTT_URL: process.env.MQTT_URL,
        MQTT_USER: process.env.MQTT_USER,
        MQTT_PASSWORD: process.env.MQTT_PASSWORD,
    };
}

async function main() {
    const dbPool = await getConnectionPool();
    const mqttClient = await getMqttClient();

    await subscribeToTopic(mqttClient, "iot/#");

    mqttClient.on('message', async (topic, messageRaw) => {
        let message;
        try {
            const messageString = messageRaw.toString();
            message = JSON.parse(messageString);
        } catch (e) {
            console.error(`Error while parsing message of topic: ${topic}`);
            return;
        }

        if (!isValidMessage(message)) {
            console.error(`message from topic: ${topic} is not valid. message: ${messageRaw.toString()}`);
            return;
        }

        await saveMessageToDatabase(dbPool, message);
    })
}

async function getConnectionPool() {
    return await mysql.createPool({
        connectionLimit: 10,
        host: config.DATABASE_HOST,
        port: config.DATABASE_PORT,
        user: config.DATABASE_USER,
        database: config.DATABASE_NAME,
        password: config.DATABASE_PASSWORD
    });
}

function getMqttClient() {
    return new Promise((resolve, reject) => {
        const client = mqtt.connect(config.MQTT_URL, {username: config.MQTT_USER, password: config.MQTT_PASSWORD});

        const onConnect = () => {
            resolve(client, clearListeners);
        };

        const onError = (err) => {
            reject(err, clearListeners)
        };

        const clearListeners = () => {
            client.removeListener('connect', onConnect);
            client.removeListener('error', onError);
        };

        client.on('connect', onConnect);
        client.on('error', onError);
    });
}

function subscribeToTopic(mqttClient, topic) {
    return new Promise((resolve, reject) => {
        mqttClient.subscribe(topic, (err, granted) => {
            if (err) {
                reject(err);
            } else {
                resolve(granted);
            }
        })
    })
}

function isValidMessage(message) {
    return (
        typeof message.type === 'string' &&
        typeof message.place === 'string' &&
        typeof message.sensorName === 'string' &&
        typeof message.isChangeEvt === 'boolean' &&
        (typeof message.value === 'number' || typeof message.value === 'boolean'));
}

async function saveMessageToDatabase(dbPool, message) {
    const dataBool = (typeof message.value === 'boolean') ? message.value : null;
    const dataDouble = (typeof message.value === 'number') ? message.value : null;

    await dbPool.execute(`
      INSERT INTO iot_data_1 (place, type, sensor_name, data_bool, data_double, is_change_evt, timestamp_evt)
      values (?, ?, ?, ?, ?, ?, ?)
    `, [message.place, message.type, message.sensorName, dataBool, dataDouble, false, new Date(Date.now())]);
}

main();