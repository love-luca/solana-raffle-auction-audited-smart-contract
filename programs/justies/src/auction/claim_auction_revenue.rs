use crate::admin::GlobalStates;
use crate::auction::{Auction, AuctionBid};
use crate::common::{
  get_current_timestamp, init_revenue_distribution_accounts, AuctionStrategy,
  JustiesErrorCode, RevenueDistributionStrategy,
};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

/// Claims the auction revenue.
///
/// Only callable by the auction creator upon finish. All the tokens within the
/// top bidder's bid escrow token account will be considered as the revenue, and
/// be distributed between the Justies fee treasury and all the specified
/// revenue recipients with shares. When needed, the auction creator pays rent
/// to the recipients' token accounts if they are not initialized. Once
/// distributed, the top-bidder's bid escrow account will be closed with the
/// rents refunded to the bidder.
///
/// The auction status is guaranteed to be "Finished" once confirmed.
#[derive(Accounts)]
#[instruction(
    auction_id: u64,
)]
pub struct ClaimAuctionRevenue<'info> {
  #[account(
      mut,
      seeds = [b"auction", auction_id.to_le_bytes().as_ref()],
      bump = auction.bump,
  )]
  pub auction: Box<Account<'info, Auction>>,
  #[account(
      mut,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        top_bidder.key().as_ref(),
      ],
      bump = top_bid.bump,
      constraint = top_bid.bidder == top_bidder.key() @JustiesErrorCode::IneligibleToClaimRevenue,
  )]
  pub top_bid: Box<Account<'info, AuctionBid>>,
  #[account(mut)]
  pub creator: Signer<'info>,
  #[account(
      mut,
      seeds = [
        b"auction",
        auction.key().as_ref(),
        b"bid",
        top_bidder.key().as_ref(),
        b"escrow",
      ],
      bump,
      constraint = bid_escrow_token_account.mint == auction.currency_token_mint_address @JustiesErrorCode::InconsistentBidEscrowAccountState,
      constraint = bid_escrow_token_account.amount == top_bid.bid @JustiesErrorCode::InconsistentBidEscrowAccountState,
  )]
  pub bid_escrow_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      mut,
      associated_token::mint = token_mint,
      associated_token::authority = fee_treasury,
  )]
  pub fee_treasury_token_account: Box<Account<'info, TokenAccount>>,
  #[account(
      constraint = token_mint.key() == auction.currency_token_mint_address @JustiesErrorCode::InvalidCurrencyTokenMint,
  )]
  pub token_mint: Box<Account<'info, Mint>>,
  /// CHECK: the address is verified in the constraint.
  #[account(
      mut,
      constraint = auction.top_bidder == Some(top_bidder.key()) @JustiesErrorCode::IneligibleToClaimRevenue,
  )]
  pub top_bidder: UncheckedAccount<'info>,
  /// CHECK: the address is verified in the constraint.
  #[account(
      constraint = global_states.fee_treasury_address == fee_treasury.key() @JustiesErrorCode::InvalidFeeTreasuryAddress,
  )]
  pub fee_treasury: UncheckedAccount<'info>,
  #[account(
      seeds = [b"global_states"],
      bump = global_states.bump,
  )]
  pub global_states: Box<Account<'info, GlobalStates>>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

pub fn handler<'info>(
  ctx: Context<'_, '_, '_, 'info, ClaimAuctionRevenue<'info>>,
  _auction_id: u64,
) -> Result<()> {
  let global_states = ctx.accounts.global_states.clone();
  let current_timestamp = get_current_timestamp(&global_states);
  let auction_strategy = AuctionStrategy::new(
    &mut ctx.accounts.auction,
    &mut ctx.accounts.global_states,
  );
  if !auction_strategy.is_ended(current_timestamp) {
    return err!(JustiesErrorCode::OngoingAuction);
  }

  let revenue_distribution_accounts = ctx.remaining_accounts.to_vec();
  let revenue_distributions = init_revenue_distribution_accounts(
    ctx.accounts.creator.to_account_info(),
    ctx.accounts.token_mint.to_account_info(),
    &ctx.accounts.auction.revenue_shares,
    &revenue_distribution_accounts,
    &ctx.accounts.associated_token_program,
    &ctx.accounts.token_program,
    &ctx.accounts.system_program,
  )?;
  let auction_key = ctx.accounts.auction.key();
  let bidder_key = ctx.accounts.top_bidder.key();
  let bid_bump_bytes = ctx.accounts.top_bid.bump.to_le_bytes();
  let global_states = ctx.accounts.global_states.clone();
  let escrow_signer_seed_fn = || {
    vec![
      b"auction".as_ref(),
      auction_key.as_ref(),
      b"bid".as_ref(),
      bidder_key.as_ref(),
      bid_bump_bytes.as_ref(),
    ]
  };
  let mut revenue_distribution_strategy = RevenueDistributionStrategy {
    revenue_escrow_token_account: &mut ctx.accounts.bid_escrow_token_account,
    fee_treasury_token_account: &ctx.accounts.fee_treasury_token_account,
    global_states: &global_states,
    escrow_authority: ctx.accounts.top_bid.to_account_info(),
    escrow_token_account_creator: ctx.accounts.top_bidder.to_account_info(),
    escrow_signer_seed_fn,
    revenue_distributions,
  };

  let mut auction_strategy = AuctionStrategy::new(
    &mut ctx.accounts.auction,
    &mut ctx.accounts.global_states,
  );

  revenue_distribution_strategy.validate()?;
  revenue_distribution_strategy
    .distribute_revenue(&ctx.accounts.token_program)?;
  revenue_distribution_strategy
    .close_revenue_escrow_token_account(&ctx.accounts.token_program)?;
  auction_strategy.finalize_auction_if_need();
  Ok(())
}
