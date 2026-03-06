# 🛡️ Proof of Discipline (PoD)
### Decentralized Accountability Protocol on Solana

> Stake USDC as a commitment. Your guardian decides the outcome.  
> Succeed — funds return. Fail — funds go to charity. No escape.

---

## 🚀 What is Proof of Discipline?

Banyak orang kesulitan menjaga komitmen karena tidak adanya konsekuensi nyata. Proof of Discipline hadir untuk menyelesaikan masalah ini — menggunakan **financial stake berbasis blockchain** sebagai alat akuntabilitas yang transparan dan tidak bisa dimanipulasi.

Tidak ada perantara. Tidak ada negosiasi. Hanya kode.

---

## ⚙️ How It Works

```
User → Stake USDC → PDA (locked)
                         ↓
              Guardian verifies outcome
                    ↙           ↘
             SUCCESS            FAILED
          USDC → User       USDC → Charity
```

1. **Stake** — User mengunci USDC ke Program Derived Address (PDA). Dana tidak bisa disentuh siapapun kecuali lewat smart contract.
2. **Guardian** — Pihak yang dipercaya memverifikasi apakah challenge berhasil atau gagal.
3. **Resolve** — Guardian memanggil `completeChallenge` (dana kembali) atau `slashChallenge` (dana ke charity).
4. **Close** — User menutup challenge dan mengambil kembali rent SOL.

---

## 🎯 Use Cases

- 🚬 Berhenti merokok
- 🎰 Lepas dari judi online
- 📱 Kurangi kecanduan media sosial
- 💊 Pemulihan dari narkoba
- 🏃 Membangun kebiasaan sehat

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana (Devnet → Mainnet) |
| Smart Contract | Anchor Framework (Rust) |
| Token | USDC (SPL Token, 6 decimals) |
| Frontend | React + Vite + Phantom Wallet |
| Dev Tools | Solana Playground |

---

## ⛓️ On-Chain Information

| Key | Address |
|-----|---------|
| Program ID | `5avhhG8X47wEuLTk2H5x3MgxXBDZnUb8BcZ52Cwr3a6s` |
| Guardian | `BUdey3yaBp82w7C6URYZntdqHr7Pc5okFeNPpvgzKtpQ` |
| Charity | `W7Pg6Di2UJGjdVVFET1Q2DuCtNcJC2fQF8hJ4VpRGAB` |
| USDC Mint (Devnet) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| Network | Solana Devnet |

---

## 📁 Repository Structure

```
Dreamweaver/
├── programs/
│   └── src/
│       └── lib.rs          # Smart contract (Rust/Anchor)
├── client/
│   └── client.ts           # Testing script (Solana Playground)
├── README.md
└── LICENSE
```

---

## 🧪 Smart Contract Functions

```rust
initializeChallenge(amount: u64, end_timestamp: i64)
// User stakes USDC into PDA

completeChallenge()
// Guardian: challenge succeeded → USDC returned to user

slashChallenge()  
// Guardian: challenge failed → USDC sent to charity

closeChallenge()
// User: close resolved challenge, reclaim rent SOL
```

---

## ✅ Progress

- [x] Smart contract development (Rust/Anchor)
- [x] USDC SPL Token integration
- [x] Deploy & test on Solana Devnet
- [x] Full lifecycle test (initialize → slash → close)
- [ ] Frontend UI (React + Vite) — in progress
- [ ] Deploy to Vercel (public URL)
- [ ] Mainnet deployment
- [ ] Charity wallet integration (verified Indonesian NGO)
- [ ] Mobile-responsive UI

---

## 🚀 Getting Started

### Prerequisites
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools)
- [Anchor](https://www.anchor-lang.com/docs/installation)
- [Node.js](https://nodejs.org/) v18+
- [Phantom Wallet](https://phantom.app/)

### Run Frontend Locally
```bash
git clone https://github.com/claxy90/Dreamweaver
cd Dreamweaver
npm install
npm run dev
# Open http://localhost:5173
```

### Test Smart Contract (Solana Playground)
1. Buka [beta.solpg.io](https://beta.solpg.io)
2. Import `programs/src/lib.rs`
3. Build & Deploy ke Devnet
4. Jalankan `client/client.ts`

---

## 👤 About

**Location:** Bandung, Indonesia  
**Background:** Fresh Graduate — Self-taught Web3 Developer  
**Focus:** SocialFi · Behavioral Economics · dApp Development  

*Building in public. One commit at a time.*

---

## 📄 License

Apache 2.0 — Open source setelah mainnet deployment.
