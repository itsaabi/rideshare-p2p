// CustomEvent polyfill using built-in Event class
if (typeof globalThis.CustomEvent !== 'function') {
  class CustomEvent extends Event {
    constructor(event, params = {}) {
      super(event);
      this.detail = params.detail || null;
    }
  }
  globalThis.CustomEvent = CustomEvent;
}

// Import required modules
import fs from 'fs';
import { createFromJSON } from '@libp2p/peer-id-factory';
import { createLibp2p } from 'libp2p';
import { noise } from '@chainsafe/libp2p-noise';
import { webSockets } from '@libp2p/websockets';
import { tcp } from '@libp2p/tcp';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';

async function createDriverNode() {
  const peerIdJson = JSON.parse(fs.readFileSync('./peer-id.json'));
  const peerId = await createFromJSON(peerIdJson);

  const node = await createLibp2p({
    peerId,
    transports: [webSockets(), tcp()],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()],
    addresses: {
      listen: ['/ip4/127.0.0.1/tcp/15000/ws']
    },
    services: {
      identify: identify(),
      pubsub: gossipsub()
    }
  });

  console.log(`✅ Driver Peer ID: ${node.peerId.toString()}`);
  console.log(`✅ Listening on:`);
  node.getMultiaddrs().forEach(addr => {
    console.log(`${addr.toString()}`);
  });

  // Save multiaddr and peerId to file
  const driverInfo = {
    peerId: node.peerId.toString(),
    multiaddr: node.getMultiaddrs()[0].toString()
  };
  fs.writeFileSync('driver-info.json', JSON.stringify(driverInfo, null, 2));
  console.log('📝 driver-info.json file created!');

  // List active protocols
  console.log(`🔒 Active Protocols:`, node.getProtocols());

  const topic = 'ride-requests';
  const pubsub = node.services.pubsub;

  pubsub.subscribe(topic);
  pubsub.addEventListener('message', async (evt) => {
    const msg = JSON.parse(new TextDecoder().decode(evt.detail.data));

    if (msg.type === 'ride-request') {
      console.log('\n=== 🚕 New Ride Request Received ===');
      console.log(`👤 Rider: ${msg.riderName}`);
      console.log(`📞 Phone: ${msg.phoneNumber}`);
      console.log(`📍 From: ${JSON.stringify(msg.currentLocation)}`);
      console.log(`🏁 To: ${JSON.stringify(msg.destination)}`);
      console.log(`💰 Fare: PKR ${msg.fare}`);
      console.log(`🚗 Vehicle: ${msg.vehicle} (${msg.seats} seats)`);
      console.log(`🕒 Time: ${new Date(msg.timestamp).toLocaleTimeString()}`);
      console.log('====================================');

      const response = {
        type: 'ride-accepted',
        driverName: 'Ahmed Raza',
        driverPhone: '+923007654321',
        vehicleNumber: 'ABC-123',
        eta: '5 minutes'
      };
      await pubsub.publish(topic, new TextEncoder().encode(JSON.stringify(response)));
      console.log('✅ Ride accepted response sent!\n');
    }
  });

  console.log(`✅ Subscribed to topic: ${topic}`);
  return node;
}

// Main entry
(async () => {
  try {
    await createDriverNode();
    console.log('🚗 Driver node is running. Press Ctrl+C to exit.');
    process.stdin.resume();
  } catch (err) {
    console.error('❌ Failed to start driver node:', err);
    process.exit(1);
  }
})();
