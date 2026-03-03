// client.ts — Proof of Discipline dApp Full Lifecycle Test

const PROGRAM_ID = new web3.PublicKey("BahwmLoSeXUGiJtn1DwwSRji9iZEwBmgVyimgdsa2HTf");
const CHARITY    = new web3.PublicKey("W7Pg6Di2UJGjdVVFET1Q2DuCtNcJC2fQF8hJ4VpRGAB");
const GUARDIAN   = new web3.PublicKey("BUdey3yaBp82w7C6URYZntdqHr7Pc5okFeNPpvgzKtpQ");
const AMOUNT     = new anchor.BN(0.1 * web3.LAMPORTS_PER_SOL);
const END_TS     = new anchor.BN(Math.floor(Date.now() / 1000) + 86400);

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.CommitmentDapp;
const user    = provider.wallet.publicKey;

async function getBalance(label: string, pubkey: web3.PublicKey): Promise<void> {
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

async function testInitialize(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 1: Initialize Challenge");

  console.log("\n📊 Balances BEFORE:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);

  try {
    const tx = await program.methods
      .initializeChallenge(AMOUNT, END_TS)
      .accounts({
        user:          user,
        guardian:      GUARDIAN,
        challenge:     challengePDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Initialize SUCCESS!");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log("\n📋 On-chain State:");
    console.log(`   User:     ${state.user.toBase58()}`);
    console.log(`   Guardian: ${state.guardian.toBase58()}`);
    console.log(`   Amount:   ${state.amount.toNumber() / web3.LAMPORTS_PER_SOL} SOL`);
    console.log(`   Status:   ${JSON.stringify(state.status)}`);
    console.log(`   End TS:   ${new Date(state.endTimestamp.toNumber() * 1000).toLocaleString()}`);

  } catch (err: any) {
    console.error("\n❌ Initialize FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);
}

async function testComplete(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 2: Complete Challenge (Funds → User)");

  console.log("\n📊 Balances BEFORE:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);

  try {
    const tx = await program.methods
      .completeChallenge()
      .accounts({
        guardian:      GUARDIAN,
        user:          user,
        charity:       CHARITY,
        challenge:     challengePDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Complete SUCCESS! Funds returned to user.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log(`   Final Status: ${JSON.stringify(state.status)}`);

  } catch (err: any) {
    console.error("\n❌ Complete FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);
}

async function testSlash(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("TEST 3: Slash Challenge (Funds → Charity)");

  console.log("\n📊 Balances BEFORE:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);
  await getBalance("Charity", CHARITY);

  try {
    const tx = await program.methods
      .slashChallenge()
      .accounts({
        guardian:      GUARDIAN,
        user:          user,
        charity:       CHARITY,
        challenge:     challengePDA,
        systemProgram: web3.SystemProgram.programId,
      })
      .rpc();

    console.log("\n✅ Slash SUCCESS! Funds sent to charity.");
    console.log(`   TX: https://explorer.solana.com/tx/${tx}?cluster=devnet`);

    const state = await program.account.challenge.fetch(challengePDA);
    console.log(`   Final Status: ${JSON.stringify(state.status)}`);

  } catch (err: any) {
    console.error("\n❌ Slash FAILED!");
    console.error(`   Error: ${err.message}`);
    if (err.logs) err.logs.forEach((log: string) => console.error(`   ${log}`));
  }

  console.log("\n📊 Balances AFTER:");
  await getBalance("User", user);
  await getBalance("Challenge PDA", challengePDA);
  await getBalance("Charity", CHARITY);
}

async function closeChallenge(challengePDA: web3.PublicKey): Promise<void> {
  logSeparator("RESET: Closing Old Challenge");
  try {
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
    console.log("⚠️ Close skipped:", err.message);
  }
}

async function main(): Promise<void> {
  console.log("🚀 Proof of Discipline — Full Lifecycle Test");
  console.log(`   Program ID: ${PROGRAM_ID.toBase58()}`);
  console.log(`   User:       ${user.toBase58()}`);
  console.log(`   Guardian:   ${GUARDIAN.toBase58()}`);
  console.log(`   Charity:    ${CHARITY.toBase58()}`);

  const [challengePDA, bump] = await derivePDA();
  console.log(`   PDA: ${challengePDA.toBase58()} (bump: ${bump})`);

  await closeChallenge(challengePDA);
  await testInitialize(challengePDA);

  // Pilih salah satu:
  //await testComplete(challengePDA);  // ← dana balik ke user
  await testSlash(challengePDA);  // ← dana ke charity
}

main().catch(console.error);
