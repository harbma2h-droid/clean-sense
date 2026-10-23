// Entry file for Hostinger: its Node runner (LiteSpeed lsnode) loads the entry with require(),
// which cannot load index.js (an ES module with top-level await). A dynamic import can.
import('./index.js').catch((err) => {
  console.error(err);
  process.exit(1);
});
