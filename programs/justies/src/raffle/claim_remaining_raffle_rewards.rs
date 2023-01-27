use crate::admin::GlobalStates;
use crate::common::{JustiesErrorCode, RaffleStrategy};
use crate::raffle::Raffle;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Token, TokenAccount};

/// Claims the remaining raffle rewards.
///
/// Only callable by the creator when there are less winners than the raffled
/// NFTs. All the remaining NFTs will be transferred back to the creator's NFT
/// token account from the rewards escrow NFT token account. If the rewards
/// escrow's NFT token amount becomes 0 after claiming, it will be closed with
/// the rents refunded to the creator.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
)]
pub struct ClaimRemainingRaffleRewards<'info> {
  #[account(
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
      constraint = raffle.creator == creator.key() @JustiesErrorCode::NotRaffleCreator,
      constraint = raffle.nft_mint_address == nft_mint.key() @JustiesErrorCode::NftMintAddressMismatch,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  /// CHECK: verified in the constraint.
  pub nft_mint: UncheckedAccount<'info>,
  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"rewards_escrow"],
      bump,
      token::mint = nft_mint,
      token::authority = raffle,
  )]
  pub rewards_escrow_nft_account: Box<Account<'info, TokenAccount>>,
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

pub fn handler(ctx: Context<ClaimRemainingRaffleRewards>) -> Result<()> {
  let rewards_escrow_nft_account =
    ctx.accounts.rewards_escrow_nft_account.clone();
  let mut raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );
  raffle_strategy.validate_claim_remaining_rewards()?;
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
  Ok(())
}
