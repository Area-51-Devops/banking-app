require('dotenv').config();
const express = require('express');
const amqp = require('amqplib');

const app = express();
const PORT = process.env.PORT || 3006;

async function init() {
    let retries = 5;
    while(retries--) {
        try {
            const conn = await amqp.connect(process.env.MQ_URL || 'amqp://rabbitmq');
            const channel = await conn.createChannel();
            
            await channel.assertExchange('tx_exchange', 'fanout', { durable: false });
            
            // Create a queue for notifications and bind to exchange
            const q = await channel.assertQueue('', { exclusive: true });
            await channel.bindQueue(q.queue, 'tx_exchange', '');
            
            console.log("Notification Service bound to tx_exchange...");
            
            channel.consume(q.queue, (msg) => {
                if (msg.content) {
                    const event = JSON.parse(msg.content.toString());
                    console.log(`[Notification] Sending Email/SMS for TX: ${event.id}, Amount: $${event.amount}`);
                }
            }, { noAck: true });
            
            break;
        } catch(err) {
            console.log("Waiting for MQ...");
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'notification-service' }));

init().then(() => {
    app.listen(PORT, () => console.log(`notification-service running on port ${PORT}`));
}).catch(console.error);
