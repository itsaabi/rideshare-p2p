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
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { multiaddr } from '@multiformats/multiaddr';
import { noise } from '@chainsafe/libp2p-noise';

async function createRiderNode() {
  const node = await createLibp2p({
    transports: [webSockets({ filter: () => true })],
    streamMuxers: [yamux()],
    connectionEncrypters: [noise()], // ✅ Manually initialized TLS
    services: {
      identify: identify(),
      pubsub: gossipsub()
    }
  });

  console.log(`✅ Rider Peer ID: ${node.peerId.toString()}`);
  console.log(`✅ Listening on:`);
  node.getMultiaddrs().forEach(addr => {
    console.log(addr.toString());
  });

  console.log(`🔒 Active Encryption Protocols:`, node.getProtocols());

  const topic = 'ride-requests';

  // Subscribe to receive responses
  await node.services.pubsub.subscribe(topic);
  node.services.pubsub.addEventListener('message', (evt) => {
    const data = JSON.parse(new TextDecoder().decode(evt.detail.data));
    if (data.type === 'ride-accepted') {
      console.log('\n✅ Ride Accepted!');
      console.log(`🚗 Driver: ${data.driverName}`);
      console.log(`📞 Contact: ${data.driverPhone}`);
      console.log(`🔢 Vehicle #: ${data.vehicleNumber}`);
      console.log(`⏱ ETA: ${data.eta}`);
    }
  });

  // Wait a bit to ensure pubsub starts
  await new Promise(resolve => setTimeout(resolve, 10000));

  // **Read driver info from file**
  let driverMultiaddr;
  try {
    const raw = fs.readFileSync('driver-info.json');
    const driverInfo = JSON.parse(raw);
    driverMultiaddr = multiaddr(driverInfo.multiaddr);
  } catch (err) {
    console.error('❌ Failed to read driver-info.json:', err.message);
    process.exit(1);
  }

  // **Connect to driver**
  try {
    await node.dial(driverMultiaddr);
    console.log('🔌 Connected to driver.');
  } catch (err) {
    console.error('❌ Failed to connect to driver:', err);
    process.exit(1);
  }
  console.log(`🔗 Trying to dial:`, driverMultiaddr.toString());
  // **Ride request publisher**
  async function sendRideRequest(details) {
    const request = {
      type: 'ride-request',
      riderName: details.name,
      phoneNumber: details.phone,
      currentLocation: details.currentLoc,
      destination: details.destination,
      fare: details.fare,
      vehicle: details.vehicle,
      seats: details.seats,
      timestamp: new Date().toISOString()
    };

    const encoded = new TextEncoder().encode(JSON.stringify(request));

    let attempts = 0;
    const maxAttempts = 5;
    const delay = 4000;

    while (attempts < maxAttempts) {
      try {
        await node.services.pubsub.publish(topic, encoded);
        console.log('\n📤 Ride request sent!');
        return;
      } catch (err) {
        console.log('❌ No peers subscribed, retrying...');
        attempts++;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    console.error('❌ Failed to send ride request after retries.');
  }

  return { node, sendRideRequest };
}

// **Main entry**
(async () => {
  try {
    const { sendRideRequest } = await createRiderNode();

    // Dummy ride request
    const rideDetails = {
      name: 'Ali Khan',
      phone: '+923001234567',
      currentLoc: { lat: 24.8607, lng: 67.0011 },
      destination: { lat: 24.8934, lng: 67.0281 },
      fare: 250,
      vehicle: 'Toyota Corolla',
      seats: 3
    };

    await sendRideRequest(rideDetails);
    console.log('🚕 Rider node is running. Press Ctrl+C to exit.');
    process.stdin.resume();
  } catch (err) {
    console.error('❌ Failed to start rider node:', err);
    process.exit(1);
  }
})();