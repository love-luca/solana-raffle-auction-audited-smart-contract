use crate::admin::GlobalStates;
use crate::common::{
  init_revenue_distribution_accounts, JustiesErrorCode, RaffleStrategy,
  RevenueDistributionStrategy,
};
use crate::raffle::Raffle;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Claims raffle revenues earned via tickets sale.
///
/// Only callable by the auction creator after the winners are set. All the
/// tokens within the raffle revenue escrow token account will be distributed
/// between the Justies fee treasury and all the specified revenue recipients
/// with shares. When needed, the raffle creator pays rents to the recipients'
/// token accounts if they are not initialized. Once distributed, the raffle
/// revenue escrow token account will be closed with the rents refunded to the
/// creator.
#[derive(Accounts)]
#[instruction(
    raffle_id: u64,
)]
pub struct ClaimRaffleRevenue<'info> {
  #[account(
      mut,
      seeds = [b"raffle", raffle_id.to_le_bytes().as_ref()],
      bump = raffle.bump,
      constraint = raffle.creator == creator.key() @JustiesErrorCode::NotRaffleCreator,
  )]
  pub raffle: Box<Account<'info, Raffle>>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,
  #[account(mut)]
  pub creator: Signer<'info>,

  #[account(
      mut,
      seeds = [b"raffle", raffle.key().as_ref(), b"revenue_escrow"],
      bump,
  )]
  pub revenue_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      associated_token::mint = token_mint,
      associated_token::authority = fee_treasury,
  )]
  pub fee_treasury_token_account: Box<Account<'info, TokenAccount>>,
  /// CHECK: the address is verified in the constraint.
  pub fee_treasury: UncheckedAccount<'info>,
  #[account(
      constraint = token_mint.key() == raffle.currency_token_mint_address @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub token_mint: Box<Account<'info, Mint>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, ClaimRaffleRevenue<'info>>,
  raffle_id: u64,
) -> Result<()> {
  let revenue_distribution_accounts = ctx.remaining_accounts.to_vec();
  let revenue_distributions = init_revenue_distribution_accounts(
    ctx.accounts.creator.to_account_info(),
    ctx.accounts.token_mint.to_account_info(),
    &ctx.accounts.raffle.revenue_shares,
    &revenue_distribution_accounts,
    &ctx.accounts.associated_token_program,
    &ctx.accounts.token_program,
    &ctx.accounts.system_program,
  )?;
  let raffle_id_bytes = raffle_id.to_le_bytes();
  let raffle_bump_bytes = ctx.accounts.raffle.bump.to_le_bytes();
  let global_states = ctx.accounts.global_states.clone();
  let escrow_signer_seed_fn = || {
    vec![
      b"raffle".as_ref(),
      raffle_id_bytes.as_ref(),
      raffle_bump_bytes.as_ref(),
    ]
  };
  let mut revenue_distribution_strategy = RevenueDistributionStrategy {
    revenue_escrow_token_account: &mut ctx
      .accounts
      .revenue_escrow_token_account,
    fee_treasury_token_account: &ctx.accounts.fee_treasury_token_account,
    global_states: &global_states,
    escrow_authority: ctx.accounts.raffle.to_account_info(),
    escrow_token_account_creator: ctx.accounts.creator.to_account_info(),
    escrow_signer_seed_fn,
    revenue_distributions,
  };
  let raffle_strategy = RaffleStrategy::new(
    &mut ctx.accounts.raffle,
    &mut ctx.accounts.global_states,
    None,
  );

  if !raffle_strategy.is_raffle_made() {
    return err!(JustiesErrorCode::RaffleNotMade);
  }

  revenue_distribution_strategy.validate()?;
  revenue_distribution_strategy
    .distribute_revenue(&ctx.accounts.token_program)?;
  revenue_distribution_strategy
    .close_revenue_escrow_token_account(&ctx.accounts.token_program)?;
  Ok(())
}
