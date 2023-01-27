use crate::admin::GlobalStates;
use crate::common::JustiesErrorCode;
use crate::common::RaffleStrategy;
use crate::raffle::Raffle;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};

/// Cancels the raffle if no raffle tickets are sold.
///
/// Only callable by the raffle creator. Once cancelled, all the raffle rewards
/// will be refunded to the creator. The raffle rewards escrow NFT account will
/// also be closed with the rents refunded to the creator.
///
/// Please note that the only pre-requisite required cancellation is that there
/// are no raffle ticket sold, no matter of the raffle status.
///
/// The raffle status will be set to "Cancelled" once confirmed.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
)]
pub struct CancelRaffle<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
      constraint = raffle.creator == creator.key() @JustiesErrorCode::NotRaffleCreator,
      constraint = raffle.ticket_sold == 0 @JustiesErrorCode::RaffleNotCancelable,
      constraint = raffle.nft_mint_address == nft_mint.key() @JustiesErrorCode::NftMintAddressMismatch,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  /// CHECK: verified in the constraint.
  pub nft_mint: UncheckedAccount<'info>,
  /// CHECK: verified in the constraint.
  pub currency_token_mint: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"rewards_escrow"],
      bump,
      token::mint = nft_mint,
      token::authority = raffle,
  )]
  pub rewards_escrow_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"revenue_escrow"],
      bump,
      token::mint = currency_token_mint,
      token::authority = raffle,
  )]
  pub revenue_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      init_if_needed,
      payer = creator,
      associated_token::mint = nft_mint,
      associated_token::authority = creator,
  )]
  pub creator_nft_account: Box<Account<'info, TokenAccount>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CancelRaffle>) -> Result<()> {
  let rewards_escrow_nft_account =
    ctx.accounts.rewards_escrow_nft_account.clone();
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  raffle_strategy.transfer_rewards(
    &ctx.accounts.token_program,
    &rewards_escrow_nft_account,
    &ctx.accounts.creator_nft_account,
    raffle_strategy.num_remaining_rewards(),
  )?;
  raffle_strategy.try_close_rewards_escrow_nft_account(
    &ctx.accounts.token_program,
    &mut ctx.accounts.rewards_escrow_nft_account,
    &ctx.accounts.creator.to_account_info(),
  )?;
  raffle_strategy.close_revenue_escrow_token_account(
    &ctx.accounts.token_program,
    &mut ctx.accounts.revenue_escrow_token_account,
    &ctx.accounts.creator.to_account_info(),
  )?;
  raffle_strategy.cancel();
  Ok(())
}
