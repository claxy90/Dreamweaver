import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl.json";

// ─── Constants ───────────────────────────────────────────────────────────────
const PROGRAM_ID                  = new PublicKey("5avhhG8X47wEuLTk2H5x3MgxXBDZnUb8BcZ52Cwr3a6s");
const CHARITY                     = new PublicKey("W7Pg6Di2UJGjdVVFET1Q2DuCtNcJC2fQF8hJ4VpRGAB");
const GUARDIAN                    = new PublicKey("BUdey3yaBp82w7C6URYZntdqHr7Pc5okFeNPpvgzKtpQ");
const USDC_MINT                   = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM_ID            = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// ─── ATA Derivation ──────────────────────────────────────────────────────────
function getATA(mint, owner) {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function shortenKey(pk) {
  const s = pk.toBase58();
  return `${s.slice(0, 5)}…${s.slice(-4)}`;
}

function statusLabel(status) {
  if (!status) return "—";
  if (status.active    !== undefined) return "ACTIVE";
  if (status.succeeded !== undefined) return "SUCCEEDED";
  if (status.failed    !== undefined) return "FAILED";
  return "UNKNOWN";
}

function statusColor(status) {
  if (!status) return "#555";
  if (status.active    !== undefined) return "#f59e0b";
  if (status.succeeded !== undefined) return "#22c55e";
  if (status.failed    !== undefined) return "#ef4444";
  return "#555";
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function Pill({ color, children }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: "2px",
      border: `1px solid ${color}`,
      color,
      fontFamily: "var(--font-mono)",
      fontSize: "11px",
      letterSpacing: "0.12em",
    }}>
      {children}
    </span>
  );
}

function Field({ label, value, mono = true }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ fontSize: "10px", color: "#555", fontFamily: "var(--font-mono)", letterSpacing: "0.15em", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{
        fontFamily: mono ? "var(--font-mono)" : "var(--font-body)",
        fontSize: mono ? "13px" : "15px",
        color: "#e8e8e8",
        wordBreak: "break-all",
      }}>
        {value}
      </div>
    </div>
  );
}

function ActionBtn({ onClick, disabled, loading, color = "#f59e0b", children }) {
  const bg = color === "#ef4444" ? "rgba(239,68,68,0.08)" : color === "#22c55e" ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)";
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: disabled || loading ? "transparent" : bg,
        border: `1px solid ${disabled || loading ? "#2a2a2a" : color}`,
        color: disabled || loading ? "#333" : color,
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        letterSpacing: "0.12em",
        padding: "12px 20px",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        transition: "all 0.2s",
        flex: 1,
      }}
      onMouseEnter={e => {
        if (!disabled && !loading) {
          e.target.style.background = color;
          e.target.style.color = "#080808";
        }
      }}
      onMouseLeave={e => {
        if (!disabled && !loading) {
          e.target.style.background = bg;
          e.target.style.color = color;
        }
      }}
    >
      {loading ? "PROCESSING…" : children}
    </button>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const color = type === "error" ? "#ef4444" : "#22c55e";
  return (
    <div style={{
      position: "fixed",
      bottom: "32px",
      right: "32px",
      background: "#111",
      border: `1px solid ${color}`,
      color,
      fontFamily: "var(--font-mono)",
      fontSize: "12px",
      padding: "14px 20px",
      maxWidth: "400px",
      zIndex: 9999,
      animation: "fadeIn 0.3s ease",
    }}>
      {type === "error" ? "✗ " : "✓ "}{msg}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [program, setProgram]           = useState(null);
  const [challengePDA, setChallengePDA] = useState(null);
  const [challenge, setChallenge]       = useState(null);
  const [loading, setLoading]           = useState(false);
  const [fetching, setFetching]         = useState(false);
  const [toast, setToast]               = useState({ msg: "", type: "ok" });

  // Form state
  const [amountUsdc, setAmountUsdc] = useState("1");
  const [endDate, setEndDate]       = useState("");

  const isGuardian = wallet.publicKey?.toBase58() === GUARDIAN.toBase58();

  // ── Init Anchor program ───────────────────────────────────────────────────
  useEffect(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return;
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
    const prog = new anchor.Program(idl, PROGRAM_ID, provider);
    setProgram(prog);

    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("challenge"), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
    setChallengePDA(pda);
  }, [wallet.publicKey, connection]);

  // ── Fetch on-chain challenge ──────────────────────────────────────────────
  const fetchChallenge = useCallback(async () => {
    if (!program || !challengePDA) return;
    setFetching(true);
    try {
      const data = await program.account.challenge.fetch(challengePDA);
      setChallenge(data);
    } catch {
      setChallenge(null);
    } finally {
      setFetching(false);
    }
  }, [program, challengePDA]);

  useEffect(() => { fetchChallenge(); }, [fetchChallenge]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: "", type: "ok" }), 5000);
  };

  // ── Transactions ─────────────────────────────────────────────────────────
  async function initChallenge() {
    if (!program || !amountUsdc || !endDate) return;
    setLoading(true);
    try {
      const amount    = new anchor.BN(parseFloat(amountUsdc) * 1_000_000); // USDC 6 decimals
      const endTs     = new anchor.BN(Math.floor(new Date(endDate).getTime() / 1000));
      const userAta   = getATA(USDC_MINT, wallet.publicKey);
      const vault     = getATA(USDC_MINT, challengePDA);

      await program.methods
        .initializeChallenge(amount, endTs)
        .accounts({
          user:                   wallet.publicKey,
          guardian:               GUARDIAN,
          challenge:              challengePDA,
          userTokenAccount:       userAta,
          vault:                  vault,
          mint:                   USDC_MINT,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      showToast(`Challenge initialized! ${amountUsdc} USDC is now locked.`);
      await fetchChallenge();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function completeChallenge() {
    if (!program || !challenge) return;
    setLoading(true);
    try {
      const userAta    = getATA(USDC_MINT, challenge.user);
      const charityAta = getATA(USDC_MINT, CHARITY);
      const vault      = getATA(USDC_MINT, challengePDA);

      await program.methods
        .completeChallenge()
        .accounts({
          guardian:               wallet.publicKey,
          user:                   challenge.user,
          userTokenAccount:       userAta,
          charityTokenAccount:    charityAta,
          vault:                  vault,
          challenge:              challengePDA,
          mint:                   USDC_MINT,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      showToast("Challenge completed! USDC returned to user.");
      await fetchChallenge();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function slashChallenge() {
    if (!program || !challenge) return;
    setLoading(true);
    try {
      const userAta    = getATA(USDC_MINT, challenge.user);
      const charityAta = getATA(USDC_MINT, CHARITY);
      const vault      = getATA(USDC_MINT, challengePDA);

      await program.methods
        .slashChallenge()
        .accounts({
          guardian:               wallet.publicKey,
          user:                   challenge.user,
          userTokenAccount:       userAta,
          charityTokenAccount:    charityAta,
          vault:                  vault,
          challenge:              challengePDA,
          mint:                   USDC_MINT,
          tokenProgram:           TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:          SystemProgram.programId,
        })
        .rpc();

      showToast("Challenge slashed. USDC sent to charity.");
      await fetchChallenge();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function closeChallenge() {
    if (!program) return;
    setLoading(true);
    try {
      await program.methods
        .closeChallenge()
        .accounts({
          user:      wallet.publicKey,
          challenge: challengePDA,
        })
        .rpc();
      showToast("Challenge closed. Rent returned.");
      setChallenge(null);
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const hasChallenge = challenge !== null;
  const isActive     = hasChallenge && challenge.status?.active !== undefined;
  const isResolved   = hasChallenge && !isActive;
  const isOwner      = wallet.publicKey && hasChallenge &&
                       challenge.user.toBase58() === wallet.publicKey.toBase58();
  const endTs        = hasChallenge ? challenge.endTimestamp.toNumber() * 1000 : null;
  const expired      = endTs ? Date.now() > endTs : false;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", position: "relative", overflow: "hidden" }}>

      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "linear-gradient(rgba(245,158,11,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(245,158,11,0.03) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Amber glow */}
      <div style={{
        position: "fixed", top: -200, left: -200,
        width: 500, height: 500,
        background: "radial-gradient(circle, rgba(245,158,11,0.07) 0%, transparent 70%)",
        pointerEvents: "none", zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 780, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "56px" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#555", letterSpacing: "0.2em", marginBottom: "8px" }}>
              SOLANA DEVNET · PROOF OF DISCIPLINE · USDC
            </div>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(52px, 8vw, 88px)",
              lineHeight: 0.9,
              letterSpacing: "0.02em",
              color: "#e8e8e8",
            }}>
              PROOF OF<br />
              <span style={{ color: "var(--amber)", WebkitTextStroke: "1px var(--amber)" }}>
                DISCIPLINE
              </span>
            </h1>
            <p style={{
              marginTop: "16px", color: "#555",
              fontFamily: "var(--font-body)", fontSize: "14px", maxWidth: "360px", lineHeight: 1.6,
            }}>
              Stake USDC as a commitment. Your guardian decides the outcome.
              Succeed — funds return. Fail — funds go to charity. No escape.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <WalletMultiButton />
            {wallet.publicKey && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#555", letterSpacing: "0.1em" }}>
                {isGuardian ? "⬡ GUARDIAN MODE" : "⬡ USER MODE"}
              </div>
            )}
          </div>
        </div>

        {/* ── Not connected ── */}
        {!wallet.publicKey && (
          <div className="fade-in" style={{ border: "1px solid var(--border)", padding: "48px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "32px", color: "#333", marginBottom: "12px" }}>
              CONNECT WALLET TO BEGIN
            </div>
            <p style={{ color: "#444", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
              Phantom required · Solana Devnet · USDC needed
            </p>
          </div>
        )}

        {/* ── Connected ── */}
        {wallet.publicKey && (
          <div className="fade-in">

            {fetching && (
              <div style={{ color: "#444", fontFamily: "var(--font-mono)", fontSize: "12px", marginBottom: "24px" }}>
                FETCHING ON-CHAIN STATE…
              </div>
            )}

            {/* Challenge Status Card */}
            {hasChallenge && (
              <div style={{
                border: `1px solid ${statusColor(challenge.status)}`,
                padding: "28px",
                marginBottom: "28px",
                background: "var(--bg2)",
                animation: "fadeIn 0.4s ease",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "22px", letterSpacing: "0.05em" }}>
                    CHALLENGE STATUS
                  </div>
                  <Pill color={statusColor(challenge.status)}>
                    {statusLabel(challenge.status)}
                  </Pill>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
                  <Field label="USER" value={shortenKey(challenge.user)} />
                  <Field label="GUARDIAN" value={shortenKey(challenge.guardian)} />
                  <Field label="STAKED AMOUNT" value={`${challenge.amount.toNumber() / 1_000_000} USDC`} />
                  <Field label="DEADLINE" value={new Date(endTs).toLocaleString()} mono={false} />
                  <Field label="PDA ADDRESS" value={shortenKey(challengePDA)} />
                  {expired && isActive && (
                    <div style={{ alignSelf: "center" }}>
                      <Pill color="#ef4444">DEADLINE PASSED</Pill>
                    </div>
                  )}
                </div>

                {/* Guardian Actions */}
                {isGuardian && isActive && (
                  <div style={{ marginTop: "24px", borderTop: "1px solid #1e1e1e", paddingTop: "24px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#555", letterSpacing: "0.15em", marginBottom: "12px" }}>
                      GUARDIAN ACTIONS
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <ActionBtn onClick={completeChallenge} loading={loading} color="#22c55e">
                        ✓ COMPLETE — RETURN USDC
                      </ActionBtn>
                      <ActionBtn onClick={slashChallenge} loading={loading} color="#ef4444">
                        ✗ SLASH — SEND TO CHARITY
                      </ActionBtn>
                    </div>
                  </div>
                )}

                {/* Close */}
                {isOwner && isResolved && (
                  <div style={{ marginTop: "24px", borderTop: "1px solid #1e1e1e", paddingTop: "24px" }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "#555", letterSpacing: "0.15em", marginBottom: "12px" }}>
                      MAINTENANCE
                    </div>
                    <ActionBtn onClick={closeChallenge} loading={loading} color="#555">
                      CLOSE & RECLAIM RENT
                    </ActionBtn>
                  </div>
                )}
              </div>
            )}

            {/* ── Create Challenge Form ── */}
            {!hasChallenge && !fetching && (
              <div style={{
                border: "1px solid var(--border)",
                padding: "28px",
                marginBottom: "28px",
                background: "var(--bg2)",
                animation: "fadeIn 0.4s ease",
              }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: "22px", letterSpacing: "0.05em", marginBottom: "8px" }}>
                  CREATE CHALLENGE
                </div>
                <p style={{ color: "#555", fontSize: "13px", fontFamily: "var(--font-body)", marginBottom: "28px" }}>
                  Lock USDC as your commitment stake. Need devnet USDC?{" "}
                  <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" style={{ color: "#f59e0b" }}>
                    faucet.circle.com
                  </a>
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", color: "#555", letterSpacing: "0.15em", marginBottom: "8px" }}>
                      STAKE AMOUNT (USDC)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={amountUsdc}
                      onChange={e => setAmountUsdc(e.target.value)}
                      style={{
                        width: "100%",
                        background: "var(--bg3)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "15px",
                        padding: "12px 14px",
                        outline: "none",
                        transition: "border-color 0.2s",
                        boxSizing: "border-box",
                      }}
                      onFocus={e => e.target.style.borderColor = "#f59e0b"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "10px", color: "#555", letterSpacing: "0.15em", marginBottom: "8px" }}>
                      DEADLINE DATE & TIME
                    </label>
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      style={{
                        width: "100%",
                        background: "var(--bg3)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "13px",
                        padding: "12px 14px",
                        outline: "none",
                        colorScheme: "dark",
                        transition: "border-color 0.2s",
                        boxSizing: "border-box",
                      }}
                      onFocus={e => e.target.style.borderColor = "#f59e0b"}
                      onBlur={e => e.target.style.borderColor = "var(--border)"}
                    />
                  </div>
                </div>

                <div style={{
                  display: "flex", gap: "24px",
                  padding: "14px 16px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  marginBottom: "24px",
                }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>GUARDIAN</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#888" }}>{shortenKey(GUARDIAN)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>CHARITY (if slashed)</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#888" }}>{shortenKey(CHARITY)}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>TOKEN</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "#22c55e" }}>USDC</div>
                  </div>
                </div>

                <ActionBtn
                  onClick={initChallenge}
                  loading={loading}
                  disabled={!amountUsdc || !endDate}
                  color="#f59e0b"
                >
                  LOCK USDC & BEGIN CHALLENGE
                </ActionBtn>
              </div>
            )}

            {/* ── Info Cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[
                { icon: "⬡", label: "STAKE", desc: "Lock USDC in a PDA. No one can touch it — not even you." },
                { icon: "◈", label: "GUARDIAN DECIDES", desc: "Your guardian verifies the outcome and calls complete or slash." },
                { icon: "◇", label: "RESULT", desc: "Succeed: USDC returns. Fail: USDC goes to charity. No escape." },
              ].map(({ icon, label, desc }) => (
                <div key={label} style={{ border: "1px solid var(--border)", padding: "20px", background: "var(--bg2)" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: "28px", color: "#333", marginBottom: "8px" }}>{icon}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--amber)", letterSpacing: "0.15em", marginBottom: "6px" }}>{label}</div>
                  <p style={{ fontSize: "12px", color: "#555", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>{desc}</p>
                </div>
              ))}
            </div>

            {/* ── Program Info ── */}
            <div style={{
              marginTop: "28px", padding: "16px 20px",
              border: "1px solid var(--border)",
              display: "flex", gap: "32px",
              background: "var(--bg2)",
            }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>PROGRAM ID</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#555" }}>{PROGRAM_ID.toBase58()}</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>NETWORK</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#555" }}>DEVNET</div>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>TOKEN</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "#22c55e" }}>USDC</div>
              </div>
            </div>

          </div>
        )}
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
