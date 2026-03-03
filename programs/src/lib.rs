use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("BahwmLoSeXUGiJtn1DwwSRji9iZEwBmgVyimgdsa2HTf");

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

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.challenge.to_account_info(),
            },
        );
        system_program::transfer(cpi_context, amount)?;

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
        **challenge.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.try_borrow_mut_lamports()? += amount;

        Ok(())
    }

    pub fn slash_challenge(ctx: Context<ResolveChallenge>) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;

        require!(
            challenge.status == ChallengeStatus::Active,
            CommitmentError::ChallengeNotActive
        );

        let charity_pubkey = CHARITY_WALLET
            .parse::<Pubkey>()
            .map_err(|_| CommitmentError::InvalidCharityAddress)?;

        require!(
            ctx.accounts.charity.key() == charity_pubkey,
            CommitmentError::InvalidCharityAddress
        );

        challenge.status = ChallengeStatus::Failed;

        let amount = challenge.amount;
        **challenge.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.charity.try_borrow_mut_lamports()? += amount;

        Ok(())
    }

    // ← SEKARANG ADA DI DALAM #[program]
    pub fn close_challenge(ctx: Context<CloseChallenge>) -> Result<()> {
        let challenge = &ctx.accounts.challenge;

        require!(
            challenge.status != ChallengeStatus::Active,
            CommitmentError::ChallengeStillActive
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeChallenge<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: Guardian stored as Pubkey only
    pub guardian: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        space = Challenge::LEN,
        seeds = [b"challenge", user.key().as_ref()],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveChallenge<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    /// CHECK: Validated via has_one
    #[account(mut)]
    pub user: UncheckedAccount<'info>,

    /// CHECK: Validated at runtime
    #[account(mut)]
    pub charity: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = user @ CommitmentError::UnauthorizedUser,
        has_one = guardian @ CommitmentError::UnauthorizedGuardian,
        seeds = [b"challenge", user.key().as_ref()],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, Challenge>,

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

#[account]
pub struct Challenge {
    pub user: Pubkey,
    pub guardian: Pubkey,
    pub amount: u64,
    pub end_timestamp: i64,
    pub status: ChallengeStatus,
    pub bump: u8,
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
}
