use crate::admin::GlobalStates;
use crate::common::{JustiesErrorCode, RaffleStrategy};
use crate::raffle::{Raffle, RaffleTicketPosition};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Claims raffle reward.
///
/// Only callable by the winners after they are set. 1 reward will be
/// transferred from the raffle rewards escrow NFT account to the winner's
/// NFT account. If the rewards escrow's NFT token amount becomes 0 after
/// claiming, it will be closed with the rents refunded to the creator.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
)]
pub struct ClaimRaffleReward<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  #[account(mut)]
  pub claimer: Signer<'info>,
  #[account(
      seeds = [
        b"raffle",
        raffle.key().as_ref(),
        b"ticket_position",
        claimer.key().as_ref(),
      ],
      bump = ticket_position.bump,
      constraint = ticket_position.buyer == claimer.key() @JustiesErrorCode::InconsistentRaffleTicketPosition,
  )]
  pub ticket_position: Box<Account<'info, RaffleTicketPosition>>,
  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"rewards_escrow"],
      bump,
  )]
  pub rewards_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = claimer,
      associated_token::mint = nft_mint,
      associated_token::authority = claimer,
  )]
  pub claimer_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      constraint = nft_mint.key() == raffle.nft_mint_address @JustiesErrorCode::InvalidNftMint,
  )]
  pub nft_mint: Box<Account<'info, Mint>>,
  /// CHECK: non-risky as it is verified in the constraint.
  #[account(
      mut,
      constraint = creator.key() == raffle.creator @JustiesErrorCode::NotRaffleCreator,
  )]
  pub creator: UncheckedAccount<'info>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimRaffleReward>) -> Result<()> {
  let ticket_position_id = ctx.accounts.ticket_position.id;
  let mut rewards_escrow_token_account =
    ctx.accounts.rewards_escrow_nft_account.clone();
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  raffle_strategy.validate_claim(ticket_position_id)?;
  raffle_strategy.claim_reward(ticket_position_id);
  raffle_strategy.transfer_rewards(
    &ctx.accounts.token_program,
    &ctx.accounts.rewards_escrow_nft_account,
    &ctx.accounts.claimer_nft_account,
    1,
  )?;
  raffle_strategy.try_close_rewards_escrow_nft_account(
    &ctx.accounts.token_program,
    &mut rewards_escrow_token_account,
    &ctx.accounts.creator,
  )?;
  Ok(())
}
