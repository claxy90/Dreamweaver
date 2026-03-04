use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("5avhhG8X47wEuLTk2H5x3MgxXBDZnUb8BcZ52Cwr3a6s");

// USDC mint address di Devnet
pub const USDC_MINT: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
pub const CHARITY_WALLET: &str = "W7Pg6Di2UJGjdVVFET1Q2DuCtNcJC2fQF8hJ4VpRGAB";

#[program]
pub mod commitment_dapp {
    use super::*;

    pub fn initialize_challenge(
        ctx: Context<InitializeChallenge>,
        amount: u64,
        end_timestamp: i64,
    ) -> Result<()> {
        require!(amount > 0, CommitmentError::InvalidAmount);
        require!(
            end_timestamp > Clock::get()?.unix_timestamp,
            CommitmentError::InvalidTimestamp
        );

        // Transfer USDC dari user ke vault (token account milik PDA)
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;

        let challenge = &mut ctx.accounts.challenge;
        challenge.user = ctx.accounts.user.key();
        challenge.guardian = ctx.accounts.guardian.key();
        challenge.amount = amount;
        challenge.end_timestamp = end_timestamp;
        challenge.status = ChallengeStatus::Active;
        challenge.bump = ctx.bumps.challenge;

        Ok(())
    }

    pub fn complete_challenge(ctx: Context<ResolveChallenge>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;

        require!(
            challenge.status == ChallengeStatus::Active,
            CommitmentError::ChallengeNotActive
        );

        challenge.status = ChallengeStatus::Succeeded;

        let amount = challenge.amount;
        let user_key = challenge.user;
        let bump = challenge.bump;

        // PDA menandatangani transfer USDC kembali ke user
        let seeds = &[b"challenge".as_ref(), user_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.challenge.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn slash_challenge(ctx: Context<ResolveChallenge>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;

        require!(
            challenge.status == ChallengeStatus::Active,
            CommitmentError::ChallengeNotActive
        );

        // Validasi charity wallet
        let charity_pubkey = CHARITY_WALLET
            .parse::<Pubkey>()
            .map_err(|_| CommitmentError::InvalidCharityAddress)?;
        require!(
            ctx.accounts.charity_token_account.owner == charity_pubkey,
            CommitmentError::InvalidCharityAddress
        );

        challenge.status = ChallengeStatus::Failed;

        let amount = challenge.amount;
        let user_key = challenge.user;
        let bump = challenge.bump;

        // PDA menandatangani transfer USDC ke charity
        let seeds = &[b"challenge".as_ref(), user_key.as_ref(), &[bump]];
        let signer_seeds = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.charity_token_account.to_account_info(),
                authority: ctx.accounts.challenge.to_account_info(),
            },
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn close_challenge(ctx: Context<CloseChallenge>) -> Result<()> {
        let challenge = &ctx.accounts.challenge;

        require!(
            challenge.status != ChallengeStatus::Active,
            CommitmentError::ChallengeStillActive
        );

        Ok(())
    }
}

// ─── Account Structs ──────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeChallenge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Guardian disimpan sebagai Pubkey saja
    pub guardian: UncheckedAccount<'info>,

    // Data account challenge (PDA)
    #[account(
        init,
        payer = user,
        space = Challenge::LEN,
        seeds = [b"challenge", user.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    // USDC token account milik user (sumber dana)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    // Vault: token account yang di-hold oleh PDA challenge
    #[account(
        init,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = challenge,
    )]
    pub vault: Account<'info, TokenAccount>,

    // USDC mint (devnet)
    #[account(
        constraint = mint.key() == USDC_MINT.parse::<Pubkey>().unwrap() @ CommitmentError::InvalidMint
    )]
    pub mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    /// CHECK: Divalidasi lewat has_one
    #[account(mut)]
    pub user: UncheckedAccount<'info>,

    // USDC token account user (tujuan complete)
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    // USDC token account charity (tujuan slash)
    #[account(mut)]
    pub charity_token_account: Account<'info, TokenAccount>,

    // Vault PDA
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = challenge,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        has_one = user @ CommitmentError::UnauthorizedUser,
        has_one = guardian @ CommitmentError::UnauthorizedGuardian,
        seeds = [b"challenge", user.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseChallenge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        has_one = user @ CommitmentError::UnauthorizedUser,
        seeds = [b"challenge", user.key().as_ref()],
        bump = challenge.bump,
        close = user
    )]
    pub challenge: Account<'info, Challenge>,
}

// ─── Data ─────────────────────────────────────────────────────────────────────

#[account]
pub struct Challenge {
    pub user: Pubkey,       // 32
    pub guardian: Pubkey,   // 32
    pub amount: u64,        // 8  (dalam USDC lamports: 1 USDC = 1_000_000)
    pub end_timestamp: i64, // 8
    pub status: ChallengeStatus, // 1
    pub bump: u8,           // 1
}

impl Challenge {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ChallengeStatus {
    Active,
    Succeeded,
    Failed,
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum CommitmentError {
    #[msg("Stake amount must be greater than zero.")]
    InvalidAmount,
    #[msg("End timestamp must be in the future.")]
    InvalidTimestamp,
    #[msg("Challenge is no longer active.")]
    ChallengeNotActive,
    #[msg("Signer is not the designated guardian.")]
    UnauthorizedGuardian,
    #[msg("User account does not match the challenge.")]
    UnauthorizedUser,
    #[msg("Charity address does not match the hardcoded treasury.")]
    InvalidCharityAddress,
    #[msg("Challenge is still active, cannot close.")]
    ChallengeStillActive,
    #[msg("Invalid mint address. Must be USDC.")]
    InvalidMint,
}
