import "server-only";
import type { Sql } from "./db";
import { hashSecret } from "./secrets";

/**
 * Sample landlords and units for the automated tests (SAMPLE_DATA=true with
 * the local database). No payments: every sat on Kodi's ledger is a real
 * (test) payment. Sample landlords sign in with the code "kodi-demo".
 */
export async function seedInto(db: Sql) {
  const code = hashSecret("kodi-demo");
  const landlords = [
    { id: "ll_adeyemi", name: "Adeyemi Properties", contact: "Tolu Adeyemi", email: "tolu@adeyemi.test", phone: "+234 803 555 0101", verified: true },
    { id: "ll_okafor", name: "Chinedu Okafor", contact: "Chinedu Okafor", email: "chinedu@okafor.test", phone: "+234 806 555 0144", verified: true },
    { id: "ll_bello", name: "Bello Homes", contact: "Aisha Bello", email: "aisha@bellohomes.test", phone: "+234 809 555 0177", verified: false },
  ];
  for (const l of landlords) {
    await db.query(
      `insert into landlords (id, name, contact_name, email, phone, access_code_hash, id_type, id_number, payout_method, verified, reviewed_at)
       values ($1, $2, $3, $4, $5, $6, 'NIN', '12345678901', 'test_wallet', $7, case when $7 then now() end)`,
      [l.id, l.name, l.contact, l.email, l.phone, code, l.verified],
    );
  }
  const units = [
    ["KD-YABA2", "ll_adeyemi", "2-bedroom flat", 2, 2, "Yaba", "14 Hughes Avenue, Flat 3", 2_400_000, "living-room", "Kunle Bakare", 240_000,
      "Second floor of a quiet block, five minutes from the Yaba bus stop. Prepaid meter, borehole water, and a security man at the gate."],
    ["KD-LEKK3", "ll_adeyemi", "3-bedroom terrace duplex", 3, 3, "Lekki Phase 1", "7 Admiralty Road, Unit B", 6_500_000, "duplex", "Kunle Bakare", 650_000,
      "Terrace duplex in a gated estate with steady power, all rooms en suite, a guest toilet and parking for two cars."],
    ["KD-SURU4", "ll_okafor", "Self-contained room", 1, 1, "Surulere", "22 Bode Thomas Street, Room 4", 650_000, "bedroom", null, 0,
      "Room with its own kitchenette and bathroom in a shared compound. Good for one person. Close to the National Stadium."],
    ["KD-IKEJ2", "ll_okafor", "Mini flat (1-bedroom)", 1, 1, "Ikeja GRA", "5 Oduduwa Crescent, Flat 2", 1_500_000, "kitchen", null, 0,
      "Newly renovated mini flat with a fitted kitchen, tiled floors and a small balcony. Walking distance to Allen Avenue."],
    ["KD-VI3BR", "ll_adeyemi", "3-bedroom apartment", 3, 3, "Victoria Island", "Tower B, 18 Adetokunbo Ademola Street, 9th floor", 9_000_000, "highrise", "Kunle Bakare", 900_000,
      "Ninth-floor apartment with lagoon views, a lift, 24-hour power, a gym and a pool on the roof."],
    ["KD-GBGA2", "ll_okafor", "2-bedroom bungalow", 2, 1, "Gbagada", "31 Diya Street", 1_800_000, "neighbourhood", null, 0,
      "Detached bungalow with a small compound and space for one car. Quiet street off the expressway."],
  ] as const;
  for (const [code_, landlord, title, beds, baths, area, address, rent, photo, agent, fee, description] of units) {
    await db.query(
      `insert into units (code, landlord_id, title, bedrooms, bathrooms, area, address, description, photo, annual_rent_ngn,
                          agent_name, agent_fee_ngn, agent_payout_method)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [code_, landlord, title, beds, baths, area, address, description, photo, rent, agent, fee, fee ? "test_wallet" : null],
    );
  }
}
