// Edit these values, commit, and Render redeploys automatically.
window.PAYGATE_CONFIG = {
  streamTitle: "Live Tonight",
  host: "Your Name",
  room: "your_chaturbate_room",   // Chaturbate username/room
  price: 9.99,
  currency: "USD",
  accessHours: 24,                // how long a purchase unlocks the stream
  ageGate: true,
  // When you have a real processor, set this to its hosted checkout URL
  // (it must redirect back to /?paid=1 on success). Empty = mock checkout.
  checkoutUrl: ""
};
