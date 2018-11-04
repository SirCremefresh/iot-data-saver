#!/usr/bin/env node
const mysql = require('mysql2/promise');
const mqtt = require('mqtt');
const exec = require('child-process-promise').exec;


const IS_SNAP = !!(process.env.SNAP_NAME);

let config;

let dbPool = null;
let mqttClient = null;

(async () => {
    if (IS_SNAP) {
        console.error("is snap");
        config = await getConfigFromSnap();
        console.log("loaded config from snap: ", config)
    } else {
        require('dotenv').config();

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
        try {
            dbPool = await getConnectionPool();
            mqttClient = await getMqttClient();
        } catch (e) {
            console.error("could not connect", e);
            return;
        }

        await subscribeToTopic("iot/#");

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

            await saveMessageToDatabase(message);
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

    function subscribeToTopic(topic) {
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

    async function saveMessageToDatabase(message) {
        const dataBool = (typeof message.value === 'boolean') ? message.value : null;
        const dataDouble = (typeof message.value === 'number') ? message.value : null;

        await dbPool.execute(`
          INSERT INTO iot_data_1 (place, type, sensor_name, data_bool, data_double, is_change_evt, timestamp_evt)
          values (?, ?, ?, ?, ?, ?, ?)
        `, [message.place, message.type, message.sensorName, dataBool, dataDouble, message.isChangeEvt, new Date(Date.now())]);
    }

    async function getConfigFromSnap() {
        return {
            DATABASE_HOST: await getSnapVariable('database.host'),
            DATABASE_PORT: await getSnapVariable('database.port'),
            DATABASE_USER: await getSnapVariable('database.user'),
            DATABASE_NAME: await getSnapVariable('database.name'),
            DATABASE_PASSWORD: await getSnapVariable('database.password'),

            MQTT_PASSWORD: await getSnapVariable('mqtt.password'),
            MQTT_URL: await getSnapVariable('mqtt.url'),
            MQTT_USER: await getSnapVariable('mqtt.user'),
        };
    }

    async function getSnapVariable(name) {
        const result = await exec(`snapctl get ${name}`);
        if (result.stdout.trim().length === 0) {
            console.log("could not find snapctl variable: ", name);
            process.exit(1);
        } else {
            return result.stdout.trim();
        }
    }

    main();
})();