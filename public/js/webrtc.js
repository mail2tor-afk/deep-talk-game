/**
 * WebRTC Mesh Signaling Client for LDR Hybrid Mode
 */

class WebRTCSignalingClient {
  constructor(socket, roomCode, localVideoElement, remoteContainerElement, onStreamChange) {
    this.socket = socket;
    this.roomCode = roomCode;
    this.localVideo = localVideoElement;
    this.remoteContainer = remoteContainerElement;
    this.onStreamChange = onStreamChange; // Callback when streams are added/removed

    this.localStream = null;
    this.peers = {}; // Key: socketId, Value: RTCPeerConnection
    this.iceConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.setupSocketListeners();
  }

  // Setup listeners for incoming signaling packages
  setupSocketListeners() {
    this.socket.on('webrtc-signal', async ({ senderSocketId, signal }) => {
      try {
        let peer = this.peers[senderSocketId];

        // Create peer connection if not already tracking
        if (!peer) {
          peer = this.createPeerConnection(senderSocketId, false);
        }

        if (signal.sdp) {
          await peer.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            this.socket.emit('webrtc-signal', {
              roomCode: this.roomCode,
              targetSocketId: senderSocketId,
              signal: { sdp: peer.localDescription }
            });
          }
        } else if (signal.candidate) {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch (err) {
        console.error("WebRTC Signaling error:", err);
      }
    });

    // Clean up when player leaves
    this.socket.on('player-left', ({ playerName, players }) => {
      // Find and close peer connections of players no longer in list
      const activeIds = new Set(players.map(p => p.socketId));
      Object.keys(this.peers).forEach(id => {
        if (!activeIds.has(id)) {
          this.closePeer(id);
        }
      });
    });
  }

  // Request camera and microphone access
  async startLocalStream(video = true, audio = true) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: video ? { width: 320, height: 240, frameRate: 15 } : false,
        audio: audio
      });

      if (this.localVideo) {
        this.localVideo.srcObject = this.localStream;
        this.localVideo.muted = true; // Don't play own audio
        this.localVideo.play().catch(e => console.log("Video auto-play prevented:", e));
      }

      // If we already have peer connections, add tracks to them
      Object.values(this.peers).forEach(peer => {
        this.localStream.getTracks().forEach(track => {
          peer.addTrack(track, this.localStream);
        });
      });

      return this.localStream;
    } catch (err) {
      console.warn("Could not access media devices:", err);
      alert("Camera or Microphone access denied. Streaming disabled, but you can still play!");
      return null;
    }
  }

  // Stop local streaming
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    if (this.localVideo) {
      this.localVideo.srcObject = null;
    }
    // Close all connections
    Object.keys(this.peers).forEach(id => this.closePeer(id));
  }

  // Create RTCPeerConnection
  createPeerConnection(targetSocketId, isInitiator = false) {
    const peer = new RTCPeerConnection(this.iceConfig);
    this.peers[targetSocketId] = peer;

    // Attach local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        peer.addTrack(track, this.localStream);
      });
    }

    // ICE Candidate forwarding
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('webrtc-signal', {
          roomCode: this.roomCode,
          targetSocketId: targetSocketId,
          signal: { candidate: event.candidate }
        });
      }
    };

    // Render remote tracks
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      this.renderRemoteStream(targetSocketId, stream);
    };

    // Negotiate connections (Offers)
    peer.onnegotiationneeded = async () => {
      try {
        if (isInitiator) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          this.socket.emit('webrtc-signal', {
            roomCode: this.roomCode,
            targetSocketId: targetSocketId,
            signal: { sdp: peer.localDescription }
          });
        }
      } catch (err) {
        console.error("Negotiation error:", err);
      }
    };

    return peer;
  }

  // Initiate peer connections to everyone in targetSocketIds
  connectToPeers(targetSocketIds) {
    targetSocketIds.forEach(id => {
      if (id !== this.socket.id && !this.peers[id]) {
        this.createPeerConnection(id, true);
      }
    });
  }

  // Render video stream in DOM
  renderRemoteStream(socketId, stream) {
    if (!this.remoteContainer) return;

    // Check if video element already exists
    let videoWrapper = document.getElementById(`wrapper-${socketId}`);
    if (!videoWrapper) {
      videoWrapper = document.createElement('div');
      videoWrapper.id = `wrapper-${socketId}`;
      videoWrapper.className = 'video-wrapper glass-panel';

      const video = document.createElement('video');
      video.id = `video-${socketId}`;
      video.autoplay = true;
      video.playsInline = true;
      videoWrapper.appendChild(video);

      const label = document.createElement('div');
      label.className = 'video-label';
      label.innerText = `Player ${socketId.substring(0, 4)}`;
      videoWrapper.appendChild(label);

      this.remoteContainer.appendChild(videoWrapper);
    }

    const videoElement = document.getElementById(`video-${socketId}`);
    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }

    if (this.onStreamChange) {
      this.onStreamChange();
    }
  }

  // Remove peer DOM and socket connection references
  closePeer(socketId) {
    if (this.peers[socketId]) {
      this.peers[socketId].close();
      delete this.peers[socketId];
    }
    const wrapper = document.getElementById(`wrapper-${socketId}`);
    if (wrapper) {
      wrapper.remove();
    }
    if (this.onStreamChange) {
      this.onStreamChange();
    }
  }
}

window.WebRTCSignalingClient = WebRTCSignalingClient;
