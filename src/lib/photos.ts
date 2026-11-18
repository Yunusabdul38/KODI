/**
 * Stock photos (Unsplash License: free to use, no attribution required; we
 * credit the photographers anyway on /about). Landlords pick one for a
 * listing; real photo uploads come after the MVP.
 */
export const PHOTOS = {
  duplex: { src: "/photos/duplex.jpg", alt: "A two-storey duplex with balconies in Lagos.", credit: "Ferdinand Asakome" },
  highrise: { src: "/photos/highrise.jpg", alt: "A white residential tower against a blue sky in Lagos.", credit: "Structures of Lagos" },
  "living-room": { src: "/photos/living-room.jpg", alt: "A bright living room with a grey sofa and tall windows.", credit: "Nha Chill" },
  bedroom: { src: "/photos/bedroom.jpg", alt: "A clean white bedroom in morning sunlight.", credit: "Bruno Cervera" },
  kitchen: { src: "/photos/kitchen.jpg", alt: "A modern kitchen with a round dining table.", credit: "taufiq triadi" },
  neighbourhood: { src: "/photos/neighbourhood.jpg", alt: "Rooftops of a Nigerian town with hills behind.", credit: "Unsplash" },
} as const;

export type PhotoKey = keyof typeof PHOTOS;
export const PHOTO_KEYS = Object.keys(PHOTOS) as PhotoKey[];
export const photoFor = (key: string) => PHOTOS[(key in PHOTOS ? key : "living-room") as PhotoKey];

/** Marketing photos. */
export const SCENES = {
  skyline: { src: "/photos/lagos-skyline.jpg", alt: "Lagos from above: the Civic Towers, the lagoon and the Lekki–Ikoyi bridge.", credit: "Nupo Deyon Daniel" },
  lekki: { src: "/photos/lekki.jpg", alt: "Homes along the lagoon in Lekki, Lagos, with traffic on the bridge.", credit: "Unsplash" },
  keys: { src: "/photos/keys.jpg", alt: "A hand holding house keys on a little house-shaped keyring.", credit: "Jakub Żerdzicki" },
  city: { src: "/photos/lagos-city.jpg", alt: "Apartment blocks on Lagos Island.", credit: "Emmanuel Ikwuegbu" },
} as const;
