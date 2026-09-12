import type { NftFloorHolding } from "../live-data";

/** Public read-only OpenSea response observed 2026-09-12T04:49:50.350Z.
 * Wallet: 0xC1bd8020d08B2A1F98da54f1573A54412d99c609; 7 NFTs / 6 collections; no next page.
 * Historical test fixture only, never a production price fallback. Names are slug labels.
 * Consumer tests replay these prices at synthetic clock dates; only the observation above is live evidence.
 */
export const observedNftFloors: NftFloorHolding[] = [
  { collection: "claystonkz", collectionName: "claystonkz", tokenCount: 1, floorEth: 0.0089 },
  { collection: "g00fyz", collectionName: "g00fyz", tokenCount: 2, floorEth: 0.0004 },
  { collection: "itsriggles", collectionName: "itsriggles", tokenCount: 1, floorEth: 0.025 },
  { collection: "piggy-banks-nfts", collectionName: "piggy-banks-nfts", tokenCount: 1, floorEth: 0.01349999 },
  { collection: "thefirmbrokers", collectionName: "thefirmbrokers", tokenCount: 1, floorEth: 0.007472899999 },
  { collection: "wasteland-art", collectionName: "wasteland-art", tokenCount: 1, floorEth: 0.0093999 },
];

/** Fault injection: only this floor is deliberately missing, not a claimed live outage. */
export const oneUnpricedNft = observedNftFloors.map((row) => ({
  ...row, floorEth: row.collection === "wasteland-art" ? null : row.floorEth,
}));
