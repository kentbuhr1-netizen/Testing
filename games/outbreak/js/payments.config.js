/**
 * Where this game's shop lives.
 *
 * Leave both blank and the game is the complete game — every region, no
 * paywall — which is what you want when running it yourself or working on it.
 * Fill both in on the copy you host, and everything past the free regions
 * asks to be bought.
 *
 * `publicKey` is the *public* half of the licence key pair. It is meant to
 * ship inside the game. The private half stays on the server and nowhere else.
 */
export const PAYMENTS = {
  apiBase: '',      // e.g. 'https://payments.example.com'
  publicKey: '',    // the LICENCE_PUBLIC_KEY that `npm run keygen` printed
  game: 'outbreak',
  gameName: 'Outbreak',
};
