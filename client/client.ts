// client.ts — Proof of Discipline dApp Full Lifecycle Test (USDC Version)

const PROGRAM_ID = new web3.PublicKey("5avhhG8X47wEuLTk2H5x3MgxXBDZnUb8BcZ52Cwr3a6s");
const CHARITY    = new web3.PublicKey("W7Pg6Di2UJGjdVVFET1Q2DuCtNcJC2fQF8hJ4VpRGAB");
const GUARDIAN   = new web3.PublicKey("BUdey3yaBp82w7C6URYZntdqHr7Pc5okFeNPpvgzKtpQ");
const USDC_MINT  = new web3.PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // devnet USDC

// 1 USDC = 1_000_000 (6 decimals)
const AMOUNT = new anchor.BN(1_000_000); // 1 USDC
const END_TS = new anchor.BN(Math.floor(Date.now() / 1000) + 86400); // 24 jam dari sekarang

// SPL Token Program IDs
const TOKEN_PROGRAM_ID            = new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new web3.PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Hardcoded ATA addresses (dari Solscan)
const USER_ATA = new web3.PublicKey("6A8hqyzcYiH5A8A3sQx7mjoTtbJHJvLqibEx4tENLLfi");

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.CommitmentDapp;
const user    = provider.wallet.publicKey;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAssociatedTokenAddress(mint: web3.PublicKey, owner: web3.PublicKey, allowOwnerOffCurve = false): web3.PublicKey {
  const [address] = web3.PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

async function getUsdcBalance(label: string, owner: web3.PublicKey): Promise<void> {
  try {
    const ata = getAssociatedTokenAddress(USDC_MINT, owner);
    const info = await provider.connection.getTokenAccountBalance(ata);
    console.log(`💵 ${label}: ${info.value.uiAmount?.toFixed(2)} USDC`);
  } catch {
    console.log(`💵 ${label}: 0.00 USDC (no token account)`);
  }
}

async function getSolBalance(label: string, pubkey: web3.PublicKey): Promise<void> {
  const lamports = await provider.connection.getBalance(pubkey);
  console.log(`💰 ${label}: ${(lamports / web3.LAMPORTS_PER_SOL).toFixed(6)} SOL`);
}

async function derivePDA(): Promise<[web3.PublicKey, number]> {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), user.toBuffer()],
    PROGRAM_ID
  );
}

function logSeparator(title: string): void {
  console.log("\n" + "═".repeat(50));
  console.log(`  ${title}`);
  console.log("═".repeat(50));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function testInitialize(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 1: Initialize Challenge (Stake USDC)");

  const userAta = USER_ATA;
  const vault   = getAssociatedTokenAddress(USDC_MINT, challengePDA, true);

  console.log(`\n   User ATA:  ${userAta.toBase58()}`);
  console.log(`   Vault ATA: ${vault.toBase58()}`);

  console.log("\n📊 Balances BEFORE:");
  await getUsdcBalance("User USDC", user);
  await getSolBalance("User SOL", user);

  try {
    const tx = await program.methods
      .initializeChallenge(AMOUNT, END_TS)
      .accounts({
        user:                   user,
        guardian:               GUARDIAN,
        challenge:              challengePDA,
        userTokenAccount:       userAta,
        vault:                  vault,
        mint:                   USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Initialize SUCCESS! 1 USDC terkunci di PDA.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log("\n📋 On-chain State:");
    console.log(`   User:     ${state.user.toBase58()}`);
    console.log(`   Guardian: ${state.guardian.toBase58()}`);
    console.log(`   Amount:   ${state.amount.toNumber() / 1_000_000} USDC`);
    console.log(`   Status:   ${JSON.stringify(state.status)}`);
    console.log(`   End TS:   ${new Date(state.endTimestamp.toNumber() * 1000).toLocaleString()}`);

  } catch (err: any) {
    console.error("\n❌ Initialize FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getUsdcBalance("User USDC", user);
  await getSolBalance("User SOL", user);
}

async function testComplete(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 2: Complete Challenge (USDC → User)");

  const userAta    = USER_ATA;
  const charityAta = getAssociatedTokenAddress(USDC_MINT, CHARITY);
  const vault      = getAssociatedTokenAddress(USDC_MINT, challengePDA, true);

  console.log("\n📊 Balances BEFORE:");
  await getUsdcBalance("User USDC", user);

  try {
    const tx = await program.methods
      .completeChallenge()
      .accounts({
        guardian:               GUARDIAN,
        user:                   user,
        userTokenAccount:       userAta,
        charityTokenAccount:    charityAta,
        vault:                  vault,
        challenge:              challengePDA,
        mint:                   USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Complete SUCCESS! USDC dikembalikan ke user.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log(`   Final Status: ${JSON.stringify(state.status)}`);

  } catch (err: any) {
    console.error("\n❌ Complete FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getUsdcBalance("User USDC", user);
}

async function testSlash(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 3: Slash Challenge (USDC → Charity)");

  const userAta    = USER_ATA;
  const charityAta = getAssociatedTokenAddress(USDC_MINT, CHARITY);
  const vault      = getAssociatedTokenAddress(USDC_MINT, challengePDA, true);

  console.log("\n📊 Balances BEFORE:");
  await getUsdcBalance("User USDC", user);
  await getUsdcBalance("Charity USDC", CHARITY);

  try {
    const tx = await program.methods
      .slashChallenge()
      .accounts({
        guardian:               GUARDIAN,
        user:                   user,
        userTokenAccount:       userAta,
        charityTokenAccount:    charityAta,
        vault:                  vault,
        challenge:              challengePDA,
        mint:                   USDC_MINT,
        tokenProgram:           TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:          web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Slash SUCCESS! USDC dikirim ke charity.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log(`   Final Status: ${JSON.stringify(state.status)}`);

  } catch (err: any) {
    console.error("\n❌ Slash FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getUsdcBalance("User USDC", user);
  await getUsdcBalance("Charity USDC", CHARITY);
}

async function closeChallenge(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("RESET: Closing Old Challenge");
  try {
    const state = await program.account.challenge.fetch(challengePDA);
    if (state.status.active !== undefined) {
      console.log("⚠️  Challenge masih ACTIVE — tidak bisa di-close. Skip.");
      return;
    }
    const tx = await program.methods
      .closeChallenge()
      .accounts({
        user:      user,
        challenge: challengePDA,
      })
      .rpc();
    console.log("✅ Challenge closed! SOL rent returned to user.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);
  } catch (err: any) {
    console.log("⚠️  Close skipped:", err.message);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🚀 Proof of Discipline — Full Lifecycle Test (USDC)");
  console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`   User:       ${user.toBase58()}`);
  console.log(`   Guardian:   ${GUARDIAN.toBase58()}`);
  console.log(`   Charity:    ${CHARITY.toBase58()}`);
  console.log(`   USDC Mint:  ${USDC_MINT.toBase58()}`);

  const [challengePDA, bump] = await derivePDA();
  console.log(`   PDA: ${challengePDA.toBase58()} (bump: ${bump})`);

  // Step 1: Tutup challenge lama jika ada (hanya bisa kalau status bukan Active)
  await closeChallenge(challengePDA);

  // Step 2: Buat challenge baru dengan stake 1 USDC
  await testInitialize(challengePDA);

  // Step 3: Pilih salah satu — comment yang tidak dipakai
  // await testComplete(challengePDA);  // ← USDC balik ke user
  await testSlash(challengePDA);        // ← USDC ke charity
}

main().catch(console.error);
