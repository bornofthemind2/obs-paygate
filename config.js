// Edit these values, commit, and Render redeploys automatically.
window.PAYGATE_CONFIG = {
  streamTitle: "Private Room",
  host: "Your Name",
  // Zoom meeting shown to buyers after checkout.
  zoomJoinUrl: "https://us05web.zoom.us/j/83904000184?pwd=KLW8ZB4M0j1Gd0fvYy4aC4bFSu3tCq.1",
  meetingId: "839 0400 0184",
  passcode: "acFVq7",
  price: 9.99,
  currency: "USD",
  accessHours: 24,                // how long a purchase unlocks the stream
  ageGate: true,
  // When you have a real processor, set this to its hosted checkout URL
  // (it must redirect back to /?paid=1 on success). Empty = mock checkout.
  checkoutUrl: ""
};
